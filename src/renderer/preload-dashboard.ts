import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("nx", {
  // ── Voice ──────────────────────────────────────────────────────────────────
  startListening:  ()                       => ipcRenderer.send("voice:start"),
  onState:         (cb: (s: string)    => void) => { ipcRenderer.on("voice:state",        (_e, s) => cb(s)); },
  onTranscript:    (cb: (t: string)    => void) => { ipcRenderer.on("voice:transcript",   (_e, t) => cb(t)); },
  onReply:         (cb: (r: string)    => void) => { ipcRenderer.on("voice:reply",        (_e, r) => cb(r)); },
  onError:         (cb: (m: string)    => void) => { ipcRenderer.on("voice:error",        (_e, m) => cb(m)); },
  onActionLabel:   (cb: (l: string)    => void) => { ipcRenderer.on("voice:action-label", (_e, l) => cb(l)); },
  onAudioLevel:    (cb: (v: number)    => void) => { ipcRenderer.on("voice:audio-level",  (_e, v) => cb(v)); },

  // ── Chat ───────────────────────────────────────────────────────────────────
  chatSend:        (text: string)               => ipcRenderer.send("chat:send", text),
  chatClear:       ()                           => ipcRenderer.send("chat:clear"),
  onChatReply:     (cb: (r: string)    => void) => { ipcRenderer.on("chat:reply",         (_e, r) => cb(r)); },
  onChatError:     (cb: (m: string)    => void) => { ipcRenderer.on("chat:error",         (_e, m) => cb(m)); },
  onChatBusy:      (cb: ()             => void) => { ipcRenderer.on("chat:busy",          ()       => cb()); },
  getHistory:      ()                           => ipcRenderer.invoke("history:get"),

  // ── Config ─────────────────────────────────────────────────────────────────
  getApiKey:       ()                           => ipcRenderer.invoke("config:get-api-key"),
  setApiKey:       (k: string)                  => ipcRenderer.invoke("config:set-api-key", k),
  getConfig:       ()                           => ipcRenderer.invoke("config:get-all"),
  setConfig:       (p: Record<string, unknown>) => ipcRenderer.invoke("config:set-all", p),
  resetConfig:     ()                           => ipcRenderer.invoke("config:reset-defaults"),
  openConfigWindow: ()                          => ipcRenderer.send("config:open-window"),

  // ── Telemetry ──────────────────────────────────────────────────────────────
  onTelemetry:     (cb: (t: unknown) => void)   => { ipcRenderer.on("dash:telemetry",     (_e, t) => cb(t)); },
  onActionLog:     (cb: (l: unknown) => void)   => { ipcRenderer.on("dash:action-log",    (_e, l) => cb(l)); },

  // ── System ─────────────────────────────────────────────────────────────────
  killProcess:     (pid: number)                => ipcRenderer.send("system:kill-process", pid),
  mediaControl:    (op: string)                 => ipcRenderer.send("media:direct", op),
  stopTts:         ()                           => ipcRenderer.send("tts:stop"),

  // ── Presets ────────────────────────────────────────────────────────────────
  getPresets:      ()                           => ipcRenderer.invoke("presets:get"),

  // ── Telemetry history / insights ───────────────────────────────────────────
  getTelemetryHistory: ()                       => ipcRenderer.invoke("telemetry:get-history"),
  getInsights:         ()                       => ipcRenderer.invoke("telemetry:get-insights"),
});
