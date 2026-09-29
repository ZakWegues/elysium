import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("nx", {
  /**
   * Os 52 métodos RPC, os mesmos que o celular usa. Devolve
   * `{result}`, `{error, status}` ou `{cancelado:true}` — este último quando um método
   * destrutivo teve a confirmação recusada, que é caminho normal e não erro.
   */
  rpc:        (method: string, params?: unknown) => ipcRenderer.invoke("rpc:call", method, params),
  rpcMethods: () => ipcRenderer.invoke("rpc:methods"),
  // ── Voice ──────────────────────────────────────────────────────────────────
  startListening:  ()                       => ipcRenderer.send("voice:start"),
  onState:         (cb: (s: string)    => void) => { ipcRenderer.on("voice:state",        (_e, s) => cb(s)); },
  onTranscript:    (cb: (t: string)    => void) => { ipcRenderer.on("voice:transcript",   (_e, t) => cb(t)); },
  onReply:         (cb: (r: string)    => void) => { ipcRenderer.on("voice:reply",        (_e, r) => cb(r)); },
  onError:         (cb: (m: string)    => void) => { ipcRenderer.on("voice:error",        (_e, m) => cb(m)); },
  onActionLabel:   (cb: (l: string)    => void) => { ipcRenderer.on("voice:action-label", (_e, l) => cb(l)); },
  onAudioLevel:    (cb: (v: number)    => void) => { ipcRenderer.on("voice:audio-level",  (_e, v) => cb(v)); },

  // ── Chat ───────────────────────────────────────────────────────────────────
  chatSend:        (text: string, opcoes?: { refazer?: boolean }) => ipcRenderer.send("chat:send", text, opcoes),
  chatClear:       ()                           => ipcRenderer.send("chat:clear"),
  onChatReply:     (cb: (r: string)    => void) => { ipcRenderer.on("chat:reply",         (_e, r) => cb(r)); },
  /** Pedaço da resposta conforme o modelo escreve. O reply final continua vindo inteiro. */
  onChatChunk:     (cb: (t: string)    => void) => { ipcRenderer.on("chat:chunk",         (_e, t) => cb(t)); },
  onChatError:     (cb: (m: string)    => void) => { ipcRenderer.on("chat:error",         (_e, m) => cb(m)); },
  onChatBusy:      (cb: ()             => void) => { ipcRenderer.on("chat:busy",          ()       => cb()); },
  onRotinaExecutada: (cb: (r: unknown) => void) => { ipcRenderer.on("rotina:executada", (_e, r) => cb(r)); },
  getHistory:      ()                           => ipcRenderer.invoke("history:get"),
  chatStarters:    ()                           => ipcRenderer.invoke("chat:starters"),
  minimizar:       ()                           => ipcRenderer.send("window:minimize"),

  // ── Config ─────────────────────────────────────────────────────────────────
  getApiKey:       ()                           => ipcRenderer.invoke("config:get-api-key"),
  setApiKey:       (k: string)                  => ipcRenderer.invoke("config:set-api-key", k),
  getConfig:       ()                           => ipcRenderer.invoke("config:get-all"),
  setConfig:       (p: Record<string, unknown>) => ipcRenderer.invoke("config:set-all", p),
  resetConfig:     ()                           => ipcRenderer.invoke("config:reset-defaults"),
  openConfigWindow: ()                          => ipcRenderer.send("config:open-window"),
  versao:          ()                           => ipcRenderer.invoke("app:version"),

  // ── Telemetry ──────────────────────────────────────────────────────────────
  onTelemetry:     (cb: (t: unknown) => void)   => { ipcRenderer.on("dash:telemetry",     (_e, t) => cb(t)); },
  onActionLog:     (cb: (l: unknown) => void)   => { ipcRenderer.on("dash:action-log",    (_e, l) => cb(l)); },

  // ── System ─────────────────────────────────────────────────────────────────
  killProcess:     (pid: number)                => ipcRenderer.send("system:kill-process", pid),
  mediaControl:    (op: string)                 => ipcRenderer.send("media:direct", op),
  stopTts:         ()                           => ipcRenderer.send("tts:stop"),

  // ── Conversas salvas ───────────────────────────────────────────────────────
  chatSessionsList:     ()                       => ipcRenderer.invoke("chat-sessions:list"),
  chatSessionsGet:      (id: string)             => ipcRenderer.invoke("chat-sessions:get", id),
  chatSessionsSave:     (sessionId: string | null, messages: unknown[]) =>
                                                    ipcRenderer.invoke("chat-sessions:save", sessionId, messages),
  chatSessionsFavorite: (id: string)             => ipcRenderer.invoke("chat-sessions:favorite", id),
  chatSessionsDelete:   (id: string)             => ipcRenderer.invoke("chat-sessions:delete", id),
  chatSessionsRename:   (id: string, t: string)  => ipcRenderer.invoke("chat-sessions:rename", id, t),

  // ── Presets ────────────────────────────────────────────────────────────────
  getPresets:      ()                           => ipcRenderer.invoke("presets:get"),

  // ── Spotify (mini-player) ──────────────────────────────────────────────────
  spotifyStatus:     ()                                  => ipcRenderer.invoke("spotify:status"),
  spotifyLogin:      ()                                  => ipcRenderer.invoke("spotify:login"),
  spotifyLogout:     ()                                  => ipcRenderer.invoke("spotify:logout"),
  spotifyNowPlaying: ()                                  => ipcRenderer.invoke("spotify:now-playing"),
  spotifyCommand:    (op: string, value?: number | boolean | string) =>
                                                            ipcRenderer.invoke("spotify:command", op, value),

  // ── Telemetry history / insights ───────────────────────────────────────────
  getTelemetryHistory: ()                       => ipcRenderer.invoke("telemetry:get-history"),
  getInsights:         ()                       => ipcRenderer.invoke("telemetry:get-insights"),

  // ── Pairing (ELYSIUM-M mobile) ───────────────────────────────────────
  getPairingInfo:  ()                           => ipcRenderer.invoke("pairing:get-info"),
  aparelhos:       ()                           => ipcRenderer.invoke("aparelhos:lista"),
  regenerateToken: ()                           => ipcRenderer.invoke("pairing:regenerate-token"),

  // ── Mailbox self-chat (PC ↔ celular) ─────────────────────────────────────────
  getMailboxThread:     (sessionId?: string | null)  => ipcRenderer.invoke("mailbox:get-thread", sessionId ?? null),
  mailboxSend:          (text: string, sessionId?: string | null) => ipcRenderer.send("mailbox:send", text, sessionId ?? null),
  mailboxSendFile:      (text: string, anexo: { name: string; mimeType: string; base64: string }, sessionId?: string | null) => ipcRenderer.invoke("mailbox:send-file", text, anexo, sessionId ?? null),
  abrirLink:            (url: string) => ipcRenderer.send("link:abrir", url),
  modelosGroq:          (forcar?: boolean) => ipcRenderer.invoke("groq:modelos", forcar),
  backupExportar:       () => ipcRenderer.invoke("backup:exportar"),
  backupImportar:       () => ipcRenderer.invoke("backup:importar"),
  diagnostico:          () => ipcRenderer.invoke("diagnostico:texto"),
  abrirLogs:            () => ipcRenderer.invoke("diagnostico:abrir-logs"),
  // Atualização automática (bloco 95). O token só entra; nunca volta para o renderer.
  atualizacaoEstado:    () => ipcRenderer.invoke("atualizacao:estado"),
  atualizacaoVerificar: () => ipcRenderer.invoke("atualizacao:verificar"),
  atualizacaoInstalar:  () => ipcRenderer.invoke("atualizacao:instalar"),
  atualizacaoToken:     (token: string) => ipcRenderer.invoke("atualizacao:token", token),
  onAtualizacao:        (cb: (e: unknown) => void) => { ipcRenderer.on("atualizacao:mudou", (_e, e) => cb(e)); },

  // Conversas da Caixa (lado PC do switch) — o par do bloco chatSessions* acima.
  mailboxSessionsList:     ()                        => ipcRenderer.invoke("mailbox:sessions-list"),
  mailboxSessionsCreate:   (title?: string)          => ipcRenderer.invoke("mailbox:sessions-create", title),
  mailboxSessionsRename:   (id: string, t: string)   => ipcRenderer.invoke("mailbox:sessions-rename", id, t),
  mailboxSessionsFavorite: (id: string)              => ipcRenderer.invoke("mailbox:sessions-favorite", id),
  mailboxSessionsDelete:   (id: string)              => ipcRenderer.invoke("mailbox:sessions-delete", id),
  mailboxSessionsOpen:     (id: string)              => ipcRenderer.invoke("mailbox:sessions-open", id),
  mailboxSessionsActive:   ()                        => ipcRenderer.invoke("mailbox:sessions-active"),
  mailboxMessageDelete:    (id: string)              => ipcRenderer.invoke("mailbox:message-delete", id),
  onMailboxMessage:     (cb: (m: unknown) => void)  => { ipcRenderer.on("mailbox:new-message", (_e, m) => cb(m)); },
  mailboxCopyImage:     (attachmentPath: string)                       => ipcRenderer.invoke("mailbox:copy-image", attachmentPath),
  mailboxSaveAs:        (attachmentPath: string, suggestedName: string) => ipcRenderer.invoke("mailbox:save-as", attachmentPath, suggestedName),
  mailboxOpenAttachment:(attachmentPath: string)                       => ipcRenderer.invoke("mailbox:open-attachment", attachmentPath),
});
