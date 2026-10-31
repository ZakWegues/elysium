import { contextBridge, ipcRenderer, webUtils } from "electron";

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
  // Fase 22: Espaço segurado no chat. Começa sem corte por silêncio; soltar manda o áudio.
  segurarParaFalar: ()                      => ipcRenderer.send("voice:start", { segurar: true }),
  soltarParaEnviar: ()                      => ipcRenderer.send("voice:finish"),
  // Fase 21: modo live (conversa contínua).
  alternarLive:    ()                       => ipcRenderer.send("live:alternar"),
  onLive:          (cb: (ligado: boolean) => void) => { ipcRenderer.on("live:mudou", (_e, v) => cb(Boolean(v))); },
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
  /** Fontes da busca e sugestões de próxima pergunta, depois da resposta (blocos 131/132). */
  /** Um timer com nome acabou (bloco 136) — o card Timer se redesenha. */
  onTimerAcabou:   (cb: (t: unknown) => void) => { ipcRenderer.on("timer:acabou", (_e, t) => cb(t)); },
  onChatExtras:    (cb: (x: { fontes?: { titulo: string; url: string }[]; sugestoes?: string[]; local?: boolean; desfazer?: string; memoria?: { id: string; text: string }[]; rapidas?: { pergunta: boolean; sim: boolean; nao: boolean; opcoes: string[]; prontas: string[] } }) => void) => { ipcRenderer.on("chat:extras", (_e, x) => cb(x)); },
  // 22/10: telas inteligentes — o esqueleto/programa da tela, o "Ver como tela" e os pedidos dela (fotos, rota).
  onChatTela:      (cb: (x: { id: string; estado?: "gerando"; programa?: string; falhou?: boolean; cancelada?: boolean; texto?: string; pergunta?: string; resposta?: string }) => void) => { ipcRenderer.on("chat:tela", (_e, x) => cb(x)); },
  uiVerComoTela:   (pergunta: string, resposta: string, id?: string) => ipcRenderer.invoke("ui:ver-como-tela", pergunta, resposta, id),
  uiCancelar:      (id: string) => ipcRenderer.send("ui:cancelar", id),
  uiEstado:        (programa: string, vars: Record<string, unknown>) => ipcRenderer.send("ui:estado", programa, vars),
  uiPedido:        (rota: string, params: Record<string, string>) => ipcRenderer.invoke("ui:pedido", rota, params),
  onChatBusy:      (cb: ()             => void) => { ipcRenderer.on("chat:busy",          ()       => cb()); },
  onRotinaExecutada: (cb: (r: unknown) => void) => { ipcRenderer.on("rotina:executada", (_e, r) => cb(r)); },
  getHistory:      ()                           => ipcRenderer.invoke("history:get"),
  chatStarters:    ()                           => ipcRenderer.invoke("chat:starters"),
  // 20/10: tema Minimal — claro/escuro e destaque do Windows.
  minimizar:       ()                           => ipcRenderer.send("window:minimize"),

  // ── Config ─────────────────────────────────────────────────────────────────
  getApiKey:       ()                           => ipcRenderer.invoke("config:get-api-key"),
  setApiKey:       (k: string)                  => ipcRenderer.invoke("config:set-api-key", k),
  setGeminiKey:    (k: string)                  => ipcRenderer.invoke("config:set-gemini-key", k),
  geminiStatus:    ()                           => ipcRenderer.invoke("config:gemini-status"),
  vozAmostra:      ()                           => ipcRenderer.invoke("voz:amostra"),
  geminiCota:      ()                           => ipcRenderer.invoke("gemini:cota"),
  getConfig:       ()                           => ipcRenderer.invoke("config:get-all"),
  setConfig:       (p: Record<string, unknown>) => ipcRenderer.invoke("config:set-all", p),
  escolherFundo:   ()                           => ipcRenderer.invoke("fundo:escolher"),
  resetConfig:     ()                           => ipcRenderer.invoke("config:reset-defaults"),
  openConfigWindow: ()                          => ipcRenderer.send("config:open-window"),
  versao:          ()                           => ipcRenderer.invoke("app:version"),

  // ── Telemetry ──────────────────────────────────────────────────────────────
  onTelemetry:     (cb: (t: unknown) => void)   => { ipcRenderer.on("dash:telemetry",     (_e, t) => cb(t)); },
  // 25/10: foco real da janela (o document.hasFocus() não acompanha a janela aberta sem foco).
  onFocoJanela:    (cb: (foco: boolean) => void) => { ipcRenderer.on("dash:foco", (_e, f) => cb(Boolean(f))); },
  onActionLog:     (cb: (l: unknown) => void)   => { ipcRenderer.on("dash:action-log",    (_e, l) => cb(l)); },

  // ── System ─────────────────────────────────────────────────────────────────
  mediaControl:    (op: string)                 => ipcRenderer.send("media:direct", op),
  stopTts:         ()                           => ipcRenderer.send("tts:stop"),
  falarTexto:      (texto: string)              => ipcRenderer.send("tts:falar", texto),
  onFalando:       (cb: (f: boolean) => void)   => { ipcRenderer.on("tts:falando", (_e, f) => cb(f)); },
  // Fase 21: o tempo de cada palavra da fala da Ely — a esfera do Chat se mexe com ele.
  onElyFala:       (cb: (f: { envelope: number[]; passoMs: number }) => void) => { ipcRenderer.on("ely:fala", (_e, f) => cb(f)); },

  // ── Conversas salvas ───────────────────────────────────────────────────────
  chatSessionsList:     ()                       => ipcRenderer.invoke("chat-sessions:list"),
  chatSessionsGet:      (id: string)             => ipcRenderer.invoke("chat-sessions:get", id),
  chatSessionsSave:     (sessionId: string | null, messages: unknown[]) =>
                                                    ipcRenderer.invoke("chat-sessions:save", sessionId, messages),
  chatSessionsFavorite: (id: string)             => ipcRenderer.invoke("chat-sessions:favorite", id),
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
  // 21/10: arquivo pelo caminho (até 500 MB) — `caminhoDoArquivo` lê o caminho do File arrastado.
  caminhoDoArquivo:     (f: File) => { try { return webUtils.getPathForFile(f) || ""; } catch { return ""; } },
  mailboxSendPath:      (text: string, caminho: string, sessionId?: string | null) => ipcRenderer.invoke("mailbox:send-path", text, caminho, sessionId ?? null),
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
  novidades:            () => ipcRenderer.invoke("novidades:pendentes"),
  onFoco:               (cb: () => void) => { ipcRenderer.on("foco:mudou", () => cb()); },
  // Fase 20: o modo da Ely mudou (pela voz, pelo celular ou daqui).
  onModo:               (cb: (m: unknown) => void) => { ipcRenderer.on("modo:mudou", (_e, m) => cb(m)); },
  onPomodoro:           (cb: (p: unknown) => void) => { ipcRenderer.on("pomodoro:mudou", (_e, p) => cb(p)); },
  // Google Agenda (bloco 120).
  agendaEstado:         () => ipcRenderer.invoke("agenda:estado"),
  agendaCliente:        (id: string, segredo: string) => ipcRenderer.invoke("agenda:cliente", id, segredo),
  agendaConectar:       () => ipcRenderer.invoke("agenda:conectar"),
  agendaDesconectar:    () => ipcRenderer.invoke("agenda:desconectar"),
  novidadesVistas:      () => ipcRenderer.invoke("novidades:vistas"),

  // Conversas da Caixa (lado PC do switch) — o par do bloco chatSessions* acima.
  mailboxSessionsList:     ()                        => ipcRenderer.invoke("mailbox:sessions-list"),
  mailboxSessionsCreate:   (title?: string)          => ipcRenderer.invoke("mailbox:sessions-create", title),
  mailboxSessionsRename:   (id: string, t: string)   => ipcRenderer.invoke("mailbox:sessions-rename", id, t),
  mailboxSessionsFavorite: (id: string)              => ipcRenderer.invoke("mailbox:sessions-favorite", id),
  mailboxSessionsOpen:     (id: string)              => ipcRenderer.invoke("mailbox:sessions-open", id),
  mailboxSessionsActive:   ()                        => ipcRenderer.invoke("mailbox:sessions-active"),
  onMailboxMessage:     (cb: (m: unknown) => void)  => { ipcRenderer.on("mailbox:new-message", (_e, m) => cb(m)); },
  mailboxCopyImage:     (attachmentPath: string)                       => ipcRenderer.invoke("mailbox:copy-image", attachmentPath),
  mailboxSaveAs:        (attachmentPath: string, suggestedName: string) => ipcRenderer.invoke("mailbox:save-as", attachmentPath, suggestedName),
  mailboxOpenAttachment:(attachmentPath: string)                       => ipcRenderer.invoke("mailbox:open-attachment", attachmentPath),
});
