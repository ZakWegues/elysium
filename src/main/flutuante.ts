import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import * as path from "node:path";

/**
 * A Ely flutuante (12/11; 13/11 no jeito do Roamies): Ctrl+Espaço em qualquer programa e a bolota
 * da Ely aparece ao lado do cursor e passa a SEGUIR o cursor, ouvindo. A resposta sai em cartões de
 * vidro soltos na tela — arrastar, minimizar, fixar, fechar — e os desenhos vão por cima da tela.
 *
 * 13/11: a janela é uma CAMADA TRANSPARENTE do tamanho da área de trabalho do monitor do cursor
 * (como a do Roamies). Seguir o cursor é só mover a bolota dentro dela (CSS), sem mover janela: liso.
 * O main lê a posição do cursor ~60×/s e manda; o renderer diz quando o cursor está em cima de algo
 * clicável (a camada deixa de ignorar o mouse) — no resto da tela o clique atravessa.
 */

export interface Area { x: number; y: number; width: number; height: number }

/** O cursor na coordenada da camada (que cobre `area`). Pura. */
export function relativoNaArea(pt: { x: number; y: number }, area: Area): { x: number; y: number } {
  return { x: pt.x - area.x, y: pt.y - area.y };
}

/** Mesma área? (o monitor do cursor mudou → a camada vai junto). Pura. */
export function mesmaArea(a: Area | null, b: Area): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

let janela: BrowserWindow | null = null;
let aberta = false;
let area: Area | null = null;
let seguidor: NodeJS.Timeout | null = null;
let ultimo = { x: NaN, y: NaN };

/** A área (monitor) que a camada cobre agora — as marcas na tela são relativas a ela. */
export function areaDaCamada(): Area | null { return area; }

export function flutuanteAberto(): boolean { return aberta && !!janela && !janela.isDestroyed() && janela.isVisible(); }

/** Manda um evento à flutuante, se ela estiver aberta (o espelho do dashboard). */
export function enviarAoFlutuante(canal: string, ...args: unknown[]): void {
  if (!flutuanteAberto()) return;
  try { janela!.webContents.send(canal, ...args); } catch { /* fechando */ }
}

/** Cria a camada escondida (na abertura do app) — chamar o atalho depois é instantâneo. */
export function criarFlutuante(): BrowserWindow {
  if (janela && !janela.isDestroyed()) return janela;
  const wa = screen.getPrimaryDisplay().workArea;
  janela = new BrowserWindow({
    x: wa.x, y: wa.y, width: wa.width, height: wa.height,
    show: false, frame: false, transparent: true, backgroundColor: "#00000000",
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, alwaysOnTop: true, title: "Ely", type: "toolbar",
    // 13/11: NUNCA ativa (como a camada do Roamies): clicar na bolota, no microfone ou num cartão não
    // tira o foco do programa dele, e o "escreve aqui" acha o campo onde o cursor estava. Só o campo
    // de digitar liga o foco, e devolve ao mandar.
    focusable: false,
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
  janela.on("closed", () => { janela = null; aberta = false; pararDeSeguir(); });
  janela.webContents.on("render-process-gone", () => { try { janela?.destroy(); } catch { /* já foi */ } janela = null; aberta = false; pararDeSeguir(); });
  return janela;
}

/** Põe a camada sobre o monitor de `pt` (se mudou). Devolve a área. */
function cobrirMonitorDe(w: BrowserWindow, pt: { x: number; y: number }): Area {
  const wa = screen.getDisplayNearestPoint(pt).workArea;
  if (!mesmaArea(area, wa)) {
    area = { x: wa.x, y: wa.y, width: wa.width, height: wa.height };
    w.setBounds(area);
  }
  return area!;
}

/** A posição do cursor, ~60×/s, enquanto aberta (só manda quando muda). */
function seguir(): void {
  pararDeSeguir();
  seguidor = setInterval(() => {
    if (!flutuanteAberto()) { pararDeSeguir(); return; }
    const pt = screen.getCursorScreenPoint();
    if (pt.x === ultimo.x && pt.y === ultimo.y) return;
    ultimo = pt;
    const antes = area;
    const a = cobrirMonitorDe(janela!, pt);
    janela!.webContents.send("flutuante:cursor", { ...relativoNaArea(pt, a), ...(antes !== a ? { tela: { w: a.width, h: a.height } } : {}) });
  }, 16);
}
function pararDeSeguir(): void { if (seguidor) { clearInterval(seguidor); seguidor = null; } }

/** Mostra a bolota no cursor, sem tirar o foco do programa dele. */
export function abrirFlutuante(tema: string, movimento = ""): void {
  const w = criarFlutuante();
  const pt = screen.getCursorScreenPoint();
  const a = cobrirMonitorDe(w, pt);
  aberta = true;
  ultimo = pt;
  const mandar = () => w.webContents.send("flutuante:abrir", { tema, movimento, cursor: relativoNaArea(pt, a), tela: { w: a.width, h: a.height } });
  if (w.webContents.isLoading()) w.webContents.once("did-finish-load", mandar);
  else mandar();
  w.setIgnoreMouseEvents(true, { forward: true });
  w.showInactive();
  w.setAlwaysOnTop(true, "screen-saver");
  seguir();
}

/** Devolve a camada ao "nunca ativa" (depois de digitar). */
function soltarFoco(): void {
  if (!janela || janela.isDestroyed()) return;
  janela.setFocusable(false);
  janela.blur();
}

export function fecharFlutuante(): void {
  aberta = false;
  soltarFoco();
  pararDeSeguir();
  if (!janela || janela.isDestroyed()) return;
  janela.webContents.send("flutuante:fechar");
  janela.setIgnoreMouseEvents(true, { forward: true });
  // A saída anima no renderer (a bolota estoura e implode em ~0,52 s); depois esconde de verdade.
  setTimeout(() => { if (!aberta && janela && !janela.isDestroyed()) janela.hide(); }, 620);
}

export interface AcoesFlutuante {
  digitar(texto: string): void;
  ouvir(): void;
  parar(): void;
  confirmar?(id: string, sim: boolean): void;
  terminarFala?(): void;
}

export function registrarIpcFlutuante(acoes: AcoesFlutuante): void {
  const deLa = (e: Electron.IpcMainEvent) => !!janela && !janela.isDestroyed() && e.sender === janela.webContents;
  // Cursor em cima de algo clicável (bolota, cartão, campo): a camada recebe o mouse; fora, atravessa.
  ipcMain.on("flutuante:mouse", (e, dentro: unknown) => {
    if (deLa(e)) janela!.setIgnoreMouseEvents(dentro !== true, { forward: true });
  });
  // O teclado da bolota: agora sim pega o foco (para digitar).
  ipcMain.on("flutuante:focar", (e) => { if (deLa(e)) { janela!.setFocusable(true); janela!.setIgnoreMouseEvents(false); janela!.focus(); } });
  ipcMain.on("flutuante:fechar", (e) => { if (deLa(e)) { acoes.parar(); fecharFlutuante(); } });
  ipcMain.on("flutuante:ouvir", (e) => { if (deLa(e)) acoes.ouvir(); });
  // 13/11: o botão do microfone de novo, ouvindo = "terminei de falar" (manda o que gravou).
  ipcMain.on("flutuante:terminar-fala", (e) => { if (deLa(e)) acoes.terminarFala?.(); });
  // 13/11: a resposta ao "posso fazer isso?" (ação destrutiva no guia de tela).
  ipcMain.on("flutuante:confirmacao", (e, id: unknown, sim: unknown) => {
    if (deLa(e) && typeof id === "string") acoes.confirmar?.(id, sim === true);
  });
  // 13/11: botão "abrir" de um cartão — só https, no navegador padrão.
  ipcMain.on("flutuante:abrir-link", (e, url: unknown) => {
    if (deLa(e) && typeof url === "string" && /^https:\/\/[^\s]+$/.test(url) && url.length < 2000) void shell.openExternal(url);
  });
  ipcMain.on("flutuante:digitar", (e, texto: unknown) => {
    if (!deLa(e)) return;
    // Mandou: a camada volta a não ter foco (o pedido age no programa dele, que o main traz de volta).
    soltarFoco();
    if (typeof texto === "string" && texto.trim()) acoes.digitar(texto.trim().slice(0, 4000));
  });
}
