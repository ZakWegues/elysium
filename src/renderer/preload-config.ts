import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("neuroaxisConfig", {
  getApiKey: () => ipcRenderer.invoke("config:get-api-key"),
  setApiKey: (key: string) => ipcRenderer.invoke("config:set-api-key", key),
  close: () => ipcRenderer.send("config:close"),
});
