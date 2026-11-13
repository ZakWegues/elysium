import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("elysium", {
  onStartRecording: (cb: (cfg: { silenceMs: number; maxRecordMs: number; esperarFalaMs?: number }) => void) => {
    ipcRenderer.on("start-recording", (_e, cfg) => cb(cfg as { silenceMs: number; maxRecordMs: number; esperarFalaMs?: number }));
  },
  onCancel:       (cb: () => void) => { ipcRenderer.on("cancel-recording", () => cb()); },
  // Fase 22: soltou o Espaço — para agora e manda o que gravou.
  onFinish:       (cb: () => void) => { ipcRenderer.on("finish-recording", () => cb()); },
  // Fase 21 (modo live): ninguém falou no prazo — nada a transcrever.
  sendNada:       () => { ipcRenderer.send("recorder-nada"); },
  sendAudio:      (buffer: ArrayBuffer) => { ipcRenderer.send("audio-data", Buffer.from(buffer)); },
  sendError:      (msg: string) => { ipcRenderer.send("recorder-error", msg); },
  sendAudioLevel: (level: number) => { ipcRenderer.send("audio-level", level); },
  // 12/11: o tocador da voz do VoiceStudio (PCM16 em streaming, ver vozStudioStream.ts).
  onStudioPcm:    (cb: (id: string, pcm: Uint8Array, taxa: number, ganho: number) => void) => {
    ipcRenderer.on("studio:pcm", (_e, id, pcm, taxa, ganho) => cb(String(id), pcm as Uint8Array, Number(taxa), Number(ganho)));
  },
  onStudioFim:    (cb: (id: string) => void) => { ipcRenderer.on("studio:fim", (_e, id) => cb(String(id))); },
  onStudioParar:  (cb: () => void) => { ipcRenderer.on("studio:parar", () => cb()); },
  sendStudioTocou: (id: string) => { ipcRenderer.send("studio:tocou", id); },
});
