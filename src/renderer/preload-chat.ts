import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("neuroaxisChat", {
  sendMessage:   (text: string) => ipcRenderer.send("chat:send", text),
  clearHistory:  ()             => ipcRenderer.send("chat:clear"),
  getHistory:    ()             => ipcRenderer.invoke("history:get"),
  onReply:  (cb: (reply: string) => void) => { ipcRenderer.on("chat:reply",  (_e, r) => cb(r)); },
  onError:  (cb: (msg: string)  => void)  => { ipcRenderer.on("chat:error",  (_e, m) => cb(m)); },
  onBusy:   (cb: () => void)              => { ipcRenderer.on("chat:busy",   () => cb()); },
});
