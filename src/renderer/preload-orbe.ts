import { contextBridge, ipcRenderer } from "electron";

/**
 * A ponte da bolota Stark (fase 21, bloco 214). Só o que ela precisa: receber estado, nível do
 * microfone e o envelope da fala; mandar clique, duplo clique, menu e arrasto.
 */
contextBridge.exposeInMainWorld("orbe", {
  aoEstado: (cb: (e: { estado: string; tamanho: number; movimento: boolean }) => void) => { ipcRenderer.on("orbe:estado", (_e, d) => cb(d)); },
  aoNivel: (cb: (n: number) => void) => { ipcRenderer.on("orbe:nivel", (_e, n) => cb(Number(n) || 0)); },
  aoFala: (cb: (f: { envelope: number[]; passoMs: number; texto: string }) => void) => { ipcRenderer.on("orbe:fala", (_e, f) => cb(f)); },
  clique: () => ipcRenderer.send("orbe:clique"),
  duplo: () => ipcRenderer.send("orbe:duplo"),
  menu: () => ipcRenderer.send("orbe:menu"),
  arrastar: (dx: number, dy: number) => ipcRenderer.send("orbe:arrastar", dx, dy),
  soltar: () => ipcRenderer.send("orbe:soltar"),
  mouseDentro: (dentro: boolean) => ipcRenderer.send("orbe:mouse", dentro),
});
