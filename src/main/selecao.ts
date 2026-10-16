import { app, BrowserWindow, clipboard, ipcMain, screen } from "electron";
import * as path from "node:path";
import { inputHost } from "../services/inputHost";

/**
 * Atalho de seleção (fase 23, pedido do Zak): Ctrl+Shift+E em qualquer programa pega o texto
 * selecionado e abre uma janelinha perto do cursor com os comandos de IA (resumir, traduzir,
 * corrigir, explicar e os do usuário — `comandos.list`). O resultado tem Copiar e Colar de volta.
 *
 * A seleção sai por Ctrl+C sintético pelo host de entrada: guarda a área de transferência,
 * limpa, copia, lê e devolve o que estava lá. Só texto é preservado (imagem copiada antes se
 * perde) — custo aceito; o comum é ter texto ali.
 */

const VK = { SHIFT: 0x10, CTRL: 0x11, ALT: 0x12, LSHIFT: 0xa0, RSHIFT: 0xa1, E: 0x45, C: 0x43, V: 0x56 };
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

let janela: BrowserWindow | null = null;

/** Pega o texto selecionado no programa da frente, sem estragar a área de transferência. */
export async function capturarSelecao(): Promise<string> {
  const antes = clipboard.readText();
  clipboard.writeText("");
  try {
    // O atalho ainda está apertado: solta Shift e E (o Ctrl fica — é o do Ctrl+C).
    await inputHost.soltar([VK.LSHIFT, VK.RSHIFT, VK.SHIFT, VK.E, VK.ALT]);
    await inputHost.keys([VK.CTRL, VK.C]);
    // O programa da frente responde no tempo dele; até ~600 ms.
    for (let i = 0; i < 12; i++) {
      await espera(50);
      const t = clipboard.readText();
      if (t) return t;
    }
    return "";
  } finally {
    clipboard.writeText(antes);
  }
}

function abrirJanela(texto: string): void {
  const ponto = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(ponto).workArea;
  const L = 420, A = 340;
  const x = Math.min(Math.max(area.x + 8, ponto.x + 12), area.x + area.width - L - 8);
  const y = Math.min(Math.max(area.y + 8, ponto.y + 16), area.y + area.height - A - 8);
  if (janela && !janela.isDestroyed()) janela.close();
  janela = new BrowserWindow({
    x, y, width: L, height: A, frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true,
    show: false, transparent: false, backgroundColor: "#15121a", title: "Ely",
    webPreferences: {
      preload: path.join(__dirname, "../renderer/preload-selecao.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged,
    },
  });
  janela.setMenu(null);
  janela.loadFile(path.join(__dirname, "../renderer/selecao.html"));
  janela.once("ready-to-show", () => { janela?.show(); janela?.focus(); janela?.webContents.send("selecao:texto", texto); });
  // Clicou fora: some (é uma janelinha de passagem).
  janela.on("blur", () => { if (janela && !janela.webContents.isDevToolsOpened()) janela.close(); });
  janela.on("closed", () => { janela = null; });
}

/**
 * O que o atalho faz. Sem seleção, abre do mesmo jeito com o campo vazio para colar.
 * Atalho apertado de novo durante a captura é ignorado: a segunda captura guardaria como
 * "conteúdo anterior" a área de transferência que a primeira acabou de esvaziar — e o que o
 * usuário tinha copiado se perderia.
 */
let capturando = false;
export async function aoAtalhoDeSelecao(): Promise<void> {
  if (capturando) return;
  capturando = true;
  let texto = "";
  try { texto = await capturarSelecao(); } catch (e) { console.warn("[selecao] não copiei:", e instanceof Error ? e.message : e); }
  finally { capturando = false; }
  abrirJanela(texto.slice(0, 20_000));
}

export function registrarIpcSelecao(): void {
  ipcMain.on("selecao:fechar", () => janela?.close());
  ipcMain.handle("selecao:copiar", (_e, texto: unknown) => { if (typeof texto === "string") clipboard.writeText(texto); });
  // Colar de volta: fecha (o foco volta ao programa de antes), põe o resultado na área de
  // transferência, cola, e devolve o que estava lá antes.
  ipcMain.handle("selecao:colar", async (_e, texto: unknown) => {
    if (typeof texto !== "string" || !texto) return false;
    janela?.close();
    const antes = clipboard.readText();
    clipboard.writeText(texto);
    await espera(180);
    try { await inputHost.keys([VK.CTRL, VK.V]); } catch { return false; }
    await espera(400);
    clipboard.writeText(antes);
    return true;
  });
}
