import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("elysiumConfig", {
  getApiKey:      () => ipcRenderer.invoke("config:get-api-key"),
  setApiKey:      (key: string) => ipcRenderer.invoke("config:set-api-key", key),
  getAll:         () => ipcRenderer.invoke("config:get-all"),
  setAll:         (cfg: Record<string, unknown>) => ipcRenderer.invoke("config:set-all", cfg),
  resetDefaults:  () => ipcRenderer.invoke("config:reset-defaults"),
  close:          () => ipcRenderer.send("config:close"),
  // A checagem roda no main porque a página é `file://` e o Ollama recusaria essa origem.
  ollamaStatus:   (modelo?: string) => ipcRenderer.invoke("brain:ollama-status", modelo),
});
