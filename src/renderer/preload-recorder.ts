import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("neuroaxis", {
  onStartRecording: (cb: (cfg: { silenceMs: number; maxRecordMs: number }) => void) => {
    ipcRenderer.on("start-recording", (_e, cfg) => cb(cfg as { silenceMs: number; maxRecordMs: number }));
  },
  sendAudio:      (buffer: ArrayBuffer) => { ipcRenderer.send("audio-data", Buffer.from(buffer)); },
  sendError:      (msg: string) => { ipcRenderer.send("recorder-error", msg); },
  sendAudioLevel: (level: number) => { ipcRenderer.send("audio-level", level); },
});
