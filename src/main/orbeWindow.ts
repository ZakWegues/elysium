import { BrowserWindow, Menu, ipcMain, screen } from "electron";
import * as path from "node:path";
import { getConfig, setOverride } from "./config";
import { bolotaVisivel, envelopeDasPalavras, EstadoBolota, EventoBolota, estadoDaBolota, prenderNaArea } from "../services/bolota";
import type { AudioTocando } from "../services/tts";
import { pararVigiaTelaCheia, vigiarTelaCheia } from "./telaCheia";

/**
 * A janela da bolota Stark (fase 21, bloco 214): transparente, sem moldura, sempre por cima,
 * fora da barra de tarefas e sem roubar o foco de quem está digitando.
 *
 * A janela é um pouco maior que a bolota (cabe a legenda embaixo), e a parte transparente deixa
 * o clique passar para o que está atrás (`setIgnoreMouseEvents` com `forward`) — só o círculo
 * pega o mouse. A posição solta fica no config, presa à área útil do monitor. Com jogo ou
 * apresentação em tela cheia ela some (`telaCheia.ts`).
 */

export interface AcoesDaBolota {
  falar: () => void;
  abrirDashboard: () => void;
  pararFala: () => void;
  alternarLive?: () => void;
  liveLigado?: () => boolean;
}

const PASSO_MS = 33;
let win: BrowserWindow | null = null;
let estado: EstadoBolota = "dormindo";
let telaCheia = false;
let acoes: AcoesDaBolota | null = null;
let tErro: NodeJS.Timeout | null = null;
let pronta = false;

function medidas(t: number): { largura: number; altura: number } {
  return { largura: Math.max(t + 24, 300), altura: t + 64 };
}

function posicaoInicial(t: number): { x: number; y: number } {
  const { largura, altura } = medidas(t);
  const area = screen.getPrimaryDisplay().workArea;
  const salva = getConfig().bolotaPos;
  if (salva) {
    const disp = screen.getDisplayNearestPoint({ x: salva.x + largura / 2, y: salva.y + t / 2 });
    return prenderNaArea(salva, { largura, altura }, disp.workArea);
  }
  return { x: area.x + area.width - largura - 16, y: area.y + area.height - altura - 16 };
}

function criar(): BrowserWindow {
  const t = getConfig().bolotaTamanho;
  const { largura, altura } = medidas(t);
  const { x, y } = posicaoInicial(t);
  const w = new BrowserWindow({
    width: largura, height: altura, x, y,
    transparent: true, frame: false, resizable: false, movable: true, minimizable: false, maximizable: false,
    skipTaskbar: true, focusable: false, hasShadow: false, show: false,
    backgroundColor: "#00000000", title: "Ely",
    webPreferences: {
      preload: path.join(__dirname, "../renderer/preload-orbe.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false,
    },
  });
  w.setIgnoreMouseEvents(true, { forward: true });
  w.loadFile(path.join(__dirname, "../renderer/orbe.html"));
  w.webContents.on("did-finish-load", () => { pronta = true; enviarEstado(); atualizarVisibilidade(); });
  w.on("closed", () => { win = null; pronta = false; });
  return w;
}

function enviarEstado(): void {
  if (!win || win.isDestroyed() || !pronta) return;
  const cfg = getConfig();
  win.webContents.send("orbe:estado", { estado, tamanho: cfg.bolotaTamanho, movimento: cfg.movimento !== "nunca" });
}

function atualizarVisibilidade(): void {
  const modo = getConfig().bolotaModo;
  if (modo === "desligada") { if (win && !win.isDestroyed()) win.destroy(); win = null; return; }
  if (!win || win.isDestroyed()) { win = criar(); return; }
  if (!pronta) return;
  const ver = bolotaVisivel(modo, estado, telaCheia);
  if (ver && !win.isVisible()) {
    win.showInactive();
    // 🔴 Medido em 09/10: com `alwaysOnTop` no construtor e `show: false`, a janela aparecia SEM
    // WS_EX_TOPMOST (atrás do dashboard), e repetir `setAlwaysOnTop(true)` não fazia nada — o
    // Electron achava que já estava. Desliga e liga de novo, depois de mostrar.
    win.setAlwaysOnTop(false);
    win.setAlwaysOnTop(true, "screen-saver");
    win.moveTop();
  } else if (!ver && win.isVisible()) win.hide();
}

export function iniciarBolota(a: AcoesDaBolota): void {
  acoes = a;
  ipcMain.on("orbe:clique", () => acoes?.falar());
  ipcMain.on("orbe:duplo", () => acoes?.abrirDashboard());
  ipcMain.on("orbe:menu", () => mostrarMenu());
  ipcMain.on("orbe:mouse", (_e, dentro: boolean) => { try { win?.setIgnoreMouseEvents(!dentro, { forward: true }); } catch { /* */ } });
  ipcMain.on("orbe:arrastar", (_e, dx: number, dy: number) => {
    if (!win || win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + Number(dx || 0)), Math.round(y + Number(dy || 0)));
  });
  ipcMain.on("orbe:soltar", () => {
    if (!win || win.isDestroyed()) return;
    const [x, y] = win.getPosition();
    const [largura, altura] = win.getSize();
    const area = screen.getDisplayNearestPoint({ x: x + largura / 2, y: y + altura / 2 }).workArea;
    const presa = prenderNaArea({ x, y }, { largura, altura }, area);
    win.setPosition(presa.x, presa.y);
    setOverride({ bolotaPos: presa });
  });
  vigiarTelaCheia((cheia) => { telaCheia = cheia; atualizarVisibilidade(); });
  atualizarVisibilidade();
}

function mostrarMenu(): void {
  if (!acoes) return;
  const live = acoes.liveLigado?.() ?? false;
  const itens: Electron.MenuItemConstructorOptions[] = [
    { label: "Falar com a Ely", click: () => acoes?.falar() },
    { label: "Parar de falar", click: () => acoes?.pararFala() },
  ];
  if (acoes.alternarLive) itens.push({ label: live ? "Sair do modo live" : "Modo live (conversa contínua)", click: () => acoes?.alternarLive?.() });
  itens.push(
    { type: "separator" },
    { label: "Abrir o ELYSIUM", click: () => acoes?.abrirDashboard() },
    { label: "Esconder a bolota", click: () => { setOverride({ bolotaModo: "desligada" }); atualizarVisibilidade(); } },
  );
  Menu.buildFromTemplate(itens).popup({ window: win ?? undefined });
}

/** Um evento do app (estado, fala, erro) — a bolota muda de cor. */
export function bolotaEvento(e: EventoBolota): void {
  const novo = estadoDaBolota(estado, e);
  if (e.tipo === "erro") {
    if (tErro) clearTimeout(tErro);
    tErro = setTimeout(() => bolotaEvento({ tipo: "fimDoErro" }), 1600);
  }
  if (novo === estado) return;
  estado = novo;
  enviarEstado();
  atualizarVisibilidade();
}

/** Nível do microfone (0–1, do `recorder.html`). */
export function bolotaNivel(n: number): void {
  if (estado !== "ouvindo" || !win || win.isDestroyed() || !pronta) return;
  win.webContents.send("orbe:nivel", n);
}

/** O áudio da Ely começou: o envelope palavra por palavra e a legenda. */
export function bolotaFala(a: AudioTocando): void {
  bolotaEvento({ tipo: "fala", falando: true });
  if (!win || win.isDestroyed() || !pronta) return;
  win.webContents.send("orbe:fala", { envelope: envelopeDasPalavras(a.palavras, a.durMs, PASSO_MS), passoMs: PASSO_MS, texto: a.texto });
}

/** Ajustes → Aparência mudou (modo, tamanho). */
export function aplicarConfigBolota(): void {
  if (win && !win.isDestroyed()) {
    const t = getConfig().bolotaTamanho;
    const { largura, altura } = medidas(t);
    const [lAtual, aAtual] = win.getSize();
    if (lAtual !== largura || aAtual !== altura) win.setSize(largura, altura);
  }
  enviarEstado();
  atualizarVisibilidade();
}

export function mostrarBolota(): void {
  if (getConfig().bolotaModo === "desligada") setOverride({ bolotaModo: "sempre" });
  atualizarVisibilidade();
}

export function fecharBolota(): void {
  pararVigiaTelaCheia();
  try { win?.destroy(); } catch { /* */ }
  win = null;
}
