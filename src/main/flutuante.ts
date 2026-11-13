import { app, BrowserWindow, ipcMain, screen } from "electron";
import * as path from "node:path";

/**
 * A Ely flutuante (12/11, pedido do dono depois de usar o Roamies): Ctrl+Espaço em qualquer
 * programa e a bolinha da Ely aparece ao lado do cursor, já ouvindo. A resposta sai em cartões de
 * vidro ali mesmo — o texto, a tela pedida, o desenho da explicação — sem abrir o dashboard.
 *
 * A janela é UMA, transparente e criada escondida na abertura do app: chamar é só posicionar e
 * mostrar (sem roubar o foco do programa dele). As áreas vazias deixam o mouse passar para o que
 * está embaixo; o renderer avisa quando o mouse entra num cartão ou na bolinha.
 *
 * A Ely em si é a mesma: o pedido passa pelo caminho de sempre (microfone → cérebro → voz) e os
 * eventos que vão ao dashboard também vêm para cá (`enviarAoFlutuante`).
 */

export const LARGURA = 480;
export const ALTURA = 640;
/**
 * A janela começa 8 px ANTES do cursor: o palco tem 30 px de margem (os pontos da bolota se
 * espalham além dela), então a bolota fica ~22 px depois da ponta do cursor.
 */
const AFASTAMENTO = -8;

export interface Lugar { x: number; y: number; horiz: "dir" | "esq"; vert: "baixo" | "cima" }

/**
 * Onde a janela fica: a bolinha encostada no cursor, os cartões crescendo para o lado que tem
 * espaço — e a janela inteira SEMPRE dentro da área de trabalho (o Roamies perde os cartões numa
 * tela de 1280×720 por abrir fora dela). Pura.
 */
export function lugarDaJanela(cursor: { x: number; y: number }, area: { x: number; y: number; width: number; height: number }, L = LARGURA, A = ALTURA): Lugar {
  const horiz = cursor.x + AFASTAMENTO + L <= area.x + area.width ? "dir" : "esq";
  const vert = cursor.y + AFASTAMENTO + A <= area.y + area.height ? "baixo" : "cima";
  let x = horiz === "dir" ? cursor.x + AFASTAMENTO : cursor.x - AFASTAMENTO - L;
  let y = vert === "baixo" ? cursor.y + AFASTAMENTO : cursor.y - AFASTAMENTO - A;
  x = Math.round(Math.min(Math.max(x, area.x), area.x + area.width - L));
  y = Math.round(Math.min(Math.max(y, area.y), area.y + area.height - A));
  return { x, y, horiz, vert };
}

let janela: BrowserWindow | null = null;
let aberta = false;

export function flutuanteAberto(): boolean { return aberta && !!janela && !janela.isDestroyed() && janela.isVisible(); }

/** Manda um evento ao flutuante, se ele estiver aberto (o espelho do dashboard). */
export function enviarAoFlutuante(canal: string, ...args: unknown[]): void {
  if (!flutuanteAberto()) return;
  try { janela!.webContents.send(canal, ...args); } catch { /* fechando */ }
}

/** Cria a janela escondida (na abertura do app) — chamar o atalho depois é instantâneo. */
export function criarFlutuante(): BrowserWindow {
  if (janela && !janela.isDestroyed()) return janela;
  janela = new BrowserWindow({
    width: LARGURA, height: ALTURA, show: false, frame: false, transparent: true, backgroundColor: "#00000000",
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, alwaysOnTop: true, title: "Ely", type: "toolbar",
    webPreferences: {
      preload: path.join(__dirname, "../renderer/preload-flutuante.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged,
      backgroundThrottling: false,
    },
  });
  janela.setAlwaysOnTop(true, "screen-saver");
  janela.setMenu(null);
  janela.setIgnoreMouseEvents(true, { forward: true });
  janela.loadFile(path.join(__dirname, "../renderer/flutuante.html"));
  janela.on("closed", () => { janela = null; aberta = false; });
  janela.webContents.on("render-process-gone", () => { try { janela?.destroy(); } catch { /* já foi */ } janela = null; aberta = false; });
  return janela;
}

/** Mostra ao lado do cursor, sem tirar o foco do programa dele. */
export function abrirFlutuante(tema: string, movimento = ""): void {
  const w = criarFlutuante();
  const cursor = screen.getCursorScreenPoint();
  const lugar = lugarDaJanela(cursor, screen.getDisplayNearestPoint(cursor).workArea);
  w.setBounds({ x: lugar.x, y: lugar.y, width: LARGURA, height: ALTURA });
  aberta = true;
  const mandar = () => w.webContents.send("flutuante:abrir", { horiz: lugar.horiz, vert: lugar.vert, tema, movimento });
  if (w.webContents.isLoading()) w.webContents.once("did-finish-load", mandar);
  else mandar();
  w.showInactive();
  w.setAlwaysOnTop(true, "screen-saver");
}

export function fecharFlutuante(): void {
  aberta = false;
  if (!janela || janela.isDestroyed()) return;
  janela.webContents.send("flutuante:fechar");
  janela.setIgnoreMouseEvents(true, { forward: true });
  // A saída anima no renderer (~180 ms); depois esconde de verdade.
  setTimeout(() => { if (!aberta && janela && !janela.isDestroyed()) janela.hide(); }, 200);
}

export interface AcoesFlutuante {
  digitar(texto: string): void;
  ouvir(): void;
  parar(): void;
}

export function registrarIpcFlutuante(acoes: AcoesFlutuante): void {
  const deLa = (e: Electron.IpcMainEvent) => !!janela && !janela.isDestroyed() && e.sender === janela.webContents;
  // Mouse sobre um cartão ou a bolinha: a janela passa a receber clique; fora, o clique atravessa.
  ipcMain.on("flutuante:mouse", (e, dentro: unknown) => {
    if (deLa(e)) janela!.setIgnoreMouseEvents(dentro !== true, { forward: true });
  });
  // Clique na bolinha: agora sim pega o foco (para digitar).
  ipcMain.on("flutuante:focar", (e) => { if (deLa(e)) { janela!.setIgnoreMouseEvents(false); janela!.focus(); } });
  ipcMain.on("flutuante:fechar", (e) => { if (deLa(e)) { acoes.parar(); fecharFlutuante(); } });
  ipcMain.on("flutuante:ouvir", (e) => { if (deLa(e)) acoes.ouvir(); });
  ipcMain.on("flutuante:digitar", (e, texto: unknown) => {
    if (deLa(e) && typeof texto === "string" && texto.trim()) acoes.digitar(texto.trim().slice(0, 4000));
  });
}
