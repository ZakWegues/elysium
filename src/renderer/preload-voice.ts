import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("neuroaxisVoice", {
  startListening: () => ipcRenderer.send("voice:start"),
  onState:        (cb: (state: string) => void) => { ipcRenderer.on("voice:state",      (_e, s) => cb(s)); },
  onTranscript:   (cb: (text: string) => void)  => { ipcRenderer.on("voice:transcript", (_e, t) => cb(t)); },
  onReply:        (cb: (text: string) => void)   => { ipcRenderer.on("voice:reply",      (_e, r) => cb(r)); },
  onError:        (cb: (msg: string) => void)    => { ipcRenderer.on("voice:error",      (_e, m) => cb(m)); },
});
