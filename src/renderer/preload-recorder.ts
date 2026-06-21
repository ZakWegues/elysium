import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("neuroaxis", {
  onStartRecording: (cb: (cfg: { silenceMs: number; maxRecordMs: number }) => void) => {
    ipcRenderer.on("start-recording", (_e, cfg) => cb(cfg as { silenceMs: number; maxRecordMs: number }));
  },
  onPlayAudio: (cb: (data: ArrayBuffer) => void) => {
    ipcRenderer.on("play-audio", (_e, data: Buffer) => cb(data.buffer.slice(0) as ArrayBuffer));
  },
  sendAudio: (buffer: ArrayBuffer) => {
    ipcRenderer.send("audio-data", Buffer.from(buffer));
  },
  sendAudioDone: () => {
    ipcRenderer.send("audio-playback-done");
  },
  sendError: (msg: string) => {
    ipcRenderer.send("recorder-error", msg);
  },
});
