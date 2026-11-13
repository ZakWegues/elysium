import { contextBridge, ipcRenderer } from "electron";

/**
 * A ponte da Ely flutuante (12/11). Só ouve os canais do espelho (os mesmos que o dashboard
 * recebe) e manda os poucos pedidos dela: mouse dentro/fora, foco, fechar, ouvir e digitar.
 */
const CANAIS = [
  "flutuante:abrir", "flutuante:fechar", "flutuante:tema", "flutuante:cartoes", "flutuante:desenhando",
  "voice:state", "voice:transcript", "voice:reply", "voice:error", "voice:audio-level",
  "chat:chunk", "chat:reply", "chat:error", "chat:busy", "chat:tela", "tts:falando",
] as const;

contextBridge.exposeInMainWorld("ely", {
  ao: (canal: string, cb: (...args: unknown[]) => void) => {
    if (!(CANAIS as readonly string[]).includes(canal)) return;
    ipcRenderer.on(canal, (_e, ...args) => cb(...args));
  },
  mouse: (dentro: boolean) => ipcRenderer.send("flutuante:mouse", dentro === true),
  focar: () => ipcRenderer.send("flutuante:focar"),
  fechar: () => ipcRenderer.send("flutuante:fechar"),
  ouvir: () => ipcRenderer.send("flutuante:ouvir"),
  digitar: (texto: string) => ipcRenderer.send("flutuante:digitar", String(texto ?? "")),
});
