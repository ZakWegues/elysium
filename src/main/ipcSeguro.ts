import { ipcMain, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Fase 23.2 (blindagem): TODO canal de IPC confere quem chamou.
 *
 * Antes só o `rpc:call` conferia a origem (`origemDoApp`). Os outros — ler a chave da Groq,
 * gravar o config inteiro, mandar arquivo para o celular, regenerar o token — confiavam em
 * qualquer página que estivesse na janela. Hoje só as telas do app carregam, mas um XSS ou uma
 * navegação para outro HTML local herdaria o preload. Este módulo é importado PRIMEIRO no
 * main.ts e embrulha `ipcMain.handle/on/once`: chamada de fora da pasta `renderer` do próprio
 * app é recusada e registrada.
 */

const RAIZ_RENDERER = path.resolve(__dirname, "..", "renderer");

/** A URL é uma tela DENTRO da pasta renderer deste app (não um HTML qualquer do disco)? Pura. */
export function dentroDoApp(url: string | undefined, raiz = RAIZ_RENDERER): boolean {
  if (typeof url !== "string" || !url.startsWith("file://")) return false;
  let arquivo: string;
  try { arquivo = path.resolve(fileURLToPath(url.split(/[?#]/)[0])); } catch { return false; }
  const r = path.resolve(raiz).toLowerCase() + path.sep;
  return arquivo.toLowerCase().startsWith(r) && /\.html$/i.test(arquivo);
}

function origemOk(ev: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return dentroDoApp(ev.senderFrame?.url);
}

const handleOriginal = ipcMain.handle.bind(ipcMain);
const onOriginal = ipcMain.on.bind(ipcMain);
const onceOriginal = ipcMain.once.bind(ipcMain);

ipcMain.handle = (canal: string, fn: (ev: IpcMainInvokeEvent, ...args: any[]) => unknown) =>
  handleOriginal(canal, (ev, ...args) => {
    if (!origemOk(ev)) { console.warn(`[ipc] ${canal} recusado: origem fora do app`); throw new Error("origem não autorizada"); }
    return fn(ev, ...args);
  });

type Ouvinte = (ev: IpcMainEvent, ...args: any[]) => void;
const embrulhar = (canal: string, fn: Ouvinte): Ouvinte => (ev, ...args) => {
  if (!origemOk(ev)) { console.warn(`[ipc] ${canal} recusado: origem fora do app`); return; }
  fn(ev, ...args);
};
ipcMain.on = ((canal: string, fn: Ouvinte) => onOriginal(canal, embrulhar(canal, fn))) as typeof ipcMain.on;
ipcMain.once = ((canal: string, fn: Ouvinte) => onceOriginal(canal, embrulhar(canal, fn))) as typeof ipcMain.once;
