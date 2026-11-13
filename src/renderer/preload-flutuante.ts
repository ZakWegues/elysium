import { contextBridge, ipcRenderer } from "electron";

/**
 * A ponte da Ely flutuante (12/11). Só ouve os canais do espelho (os mesmos que o dashboard
 * recebe) e manda os poucos pedidos dela: mouse dentro/fora, foco, fechar, ouvir e digitar.
 */
const CANAIS = [
  "flutuante:abrir", "flutuante:fechar", "flutuante:tema", "flutuante:cartoes", "flutuante:desenhando",
  "flutuante:cursor", "flutuante:status", "voice:parcial", "voice:action-label", "flutuante:marcas", "flutuante:confirmar",
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
  terminarFala: () => ipcRenderer.send("flutuante:terminar-fala"),
  digitar: (texto: string) => ipcRenderer.send("flutuante:digitar", String(texto ?? "")),
  confirmar: (id: string, sim: boolean) => ipcRenderer.send("flutuante:confirmacao", String(id), sim === true),
  abrir: (url: string) => ipcRenderer.send("flutuante:abrir-link", String(url ?? "")),
});
