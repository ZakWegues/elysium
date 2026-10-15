import { contextBridge, ipcRenderer } from "electron";

// Janelinha do atalho de seleção (fase 23): o RPC do app, o texto que chegou, colar e fechar.
contextBridge.exposeInMainWorld("sel", {
  rpc:     (method: string, params?: unknown) => ipcRenderer.invoke("rpc:call", method, params),
  aoTexto: (cb: (texto: string) => void) => { ipcRenderer.on("selecao:texto", (_e, t: string) => cb(t)); },
  colar:   (texto: string) => ipcRenderer.invoke("selecao:colar", texto),
  copiar:  (texto: string) => ipcRenderer.invoke("selecao:copiar", texto),
  fechar:  () => ipcRenderer.send("selecao:fechar"),
});
