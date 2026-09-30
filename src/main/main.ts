// PRECISA ser o primeiro import do arquivo. Os `electron-store` são construídos em escopo
// de módulo, ou seja, no momento do require — se a migração do perfil NEUROAXIS → ELYSIUM
// rodasse depois, o primeiro store já teria criado o arquivo novo vazio e a cópia seria
// descartada pela própria guarda dela. Ver src/main/migrateUserData.ts.
import "./migrateUserData";
import { app, BrowserWindow, globalShortcut, ipcMain, clipboard, nativeImage, dialog, shell, powerMonitor } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { sincronizarInicioAutomatico, removerEntradaLegada } from "./autoLaunch";
import { iniciarLogEmArquivo, pastaDeLogs } from "./logArquivo";
import { aplicarBackup, lerBackup, montarBackup } from "../services/backup";
import { montarDiagnostico } from "../services/diagnostico";
import { esquecerAparelhos, listarAparelhos } from "../services/aparelhos";
import * as QRCode from "qrcode";
import { getConfig, getApiKey, setApiKey, hasApiKey, setOverride, getOrCreateServerToken, regenerateServerToken, AppConfig, getGithubToken, setGithubToken } from "./config";
import { limparCacheClima } from "../services/clima";
import { getLocalIPv4, getAllLocalIPv4 } from "./network";
import { inputHost } from "../services/inputHost";
import { startScheduler, stopScheduler } from "../services/scheduler";
import { sendPush } from "../services/push";
import {
  listSessions as listChatSessions, getSession as getChatSession,
  upsertMessages as upsertChatMessages, toggleFavorite as toggleChatFavorite,
  deleteSession as deleteChatSession, renameSession as renameChatSession, StoredMessage,
} from "../services/chatSessionsStore";
import {
  isConnected as isSpotifyConnected, beginLogin as beginSpotifyLogin,
  disconnect as spotifyDisconnect, getNowPlaying as getSpotifyNowPlaying,
  play as spotifyPlay, pause as spotifyPause, next as spotifyNext,
  previous as spotifyPrevious, setVolume as spotifySetVolume, seek as spotifySeek,
  setShuffle as spotifySetShuffle, setRepeat as spotifySetRepeat,
} from "../services/spotify";
import { state } from "./state";
import { notify } from "./notify";
import { createTray, refreshTray, updateLastCommand, buildIcon as iconePadrao } from "./tray";
import { transcribe } from "../services/stt";
import { clearHistory, desfazerUltimoTurno } from "../services/brain";
import { modelosDaGroq } from "../services/catalogoGroq";
import { Confianca, desligarPalavraDeAtivacao, ligarPalavraDeAtivacao, podeInterromper } from "../services/palavraAtivacao";

// O log em arquivo entra antes de tudo que escreve no console (bloco 97).
iniciarLogEmArquivo();
import { getTopHistory } from "../services/history";
import { registrarPergunta, bolhasDoChat } from "../services/perguntas";
import { synthesize, cancelSpeak } from "../services/tts";
import { ElysiumError } from "../services/errors";
import { processCommand, processCommandStream, executarComando } from "../services/command";
import { startServer, setActiveToken, broadcastMailboxEvent, broadcastNotify } from "../services/server";
import { iniciarRotinas, pararRotinas, enfileirarEntrega } from "../services/rotinas";
import { avaliarCondicao } from "../services/agente";
import { emitirEvento, MARCOS_OCIOSO } from "../services/eventos";
import { getRunningApps } from "../actions/systemInfo";
import { baseDoOllama, ollamaDisponivel } from "../services/llm";
import { garantirOllama } from "../services/ollamaVivo";
import { registerRpcBridge } from "./rpcBridge";
import { vigiarDisco } from "../actions/armazenamento";
import { iniciarFoco } from "../services/foco";
import { closeApp } from "../actions/closeApp";
import {
  aoMudarAtualizacao, estadoAtualizacao, iniciarAtualizacoes, instalarAtualizacaoDesktop, verificarAtualizacoes,
  marcarNovidadesVistas, novidadesPendentes,
} from "../services/atualizacao";
import { startMonitor, getDashboardTelemetry, killProcess } from "../actions/systemInfo";
import type { BrainAction } from "../services/brain";
import { mediaControl } from "../actions/mediaControl";
import { logAnomaly, getAnomalyHistory, getInsights } from "../services/telemetryLog";
import { getAllPresets } from "../services/presetsStore";
import {
  checkAndMarkUnseenFromMobile, addMessage, listMessagesForDesktop, inferKind, mailboxEvents,
  isKnownAttachmentPath, listMailboxSessions, createMailboxSession, renameMailboxSession,
  toggleMailboxSessionFavorite, deleteMailboxSession, deleteMailboxMessage,
  getActiveMailboxSessionId, setActiveMailboxSession,
} from "../services/mailboxStore";

// ── windows ───────────────────────────────────────────────────────────────────

let recorderWin: BrowserWindow | null = null;
let configWin:   BrowserWindow | null = null;
let dashWin:     BrowserWindow | null = null;

function createRecorderWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "../renderer/preload-recorder.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, "../renderer/recorder.html"));
  win.on("closed", () => { recorderWin = null; });
  win.webContents.on("render-process-gone", () => {
    recorderWin = null;
    recorderWin = createRecorderWindow();
  });
  return win;
}

function openDashboard(): void {
  if (dashWin && !dashWin.isDestroyed()) {
    if (dashWin.isMinimized()) dashWin.restore();
    dashWin.show(); dashWin.focus(); return;
  }
  dashWin = new BrowserWindow({
    width:     1024,
    height:    720,
    minWidth:  800,
    minHeight: 560,
    resizable: true,
    show:      false,
    title:     "ELYSIUM",
    icon:      iconePadrao(),
    frame:     false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "../renderer/preload-dashboard.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  dashWin.setMenu(null);
  // Mostrar só quando houver o que mostrar. Sem isto, a janela aparece branca por um
  // instante antes do primeiro quadro — é o detalhe que separa "app nativo" de "página".
  dashWin.once("ready-to-show", () => dashWin?.show());
  dashWin.loadFile(path.join(__dirname, "../renderer/dashboard.html"));

  // Push telemetry immediately when renderer finishes loading (no 3 s wait)
  dashWin.webContents.once("did-finish-load", async () => {
    try {
      const t = await getDashboardTelemetry();
      dashWin?.webContents.send("dash:telemetry", t);
    } catch { /* best-effort */ }
  });

  // Hide to tray instead of destroying
  dashWin.on("close", (e) => {
    if (!appQuitting) { e.preventDefault(); dashWin?.hide(); }
  });
  dashWin.on("closed", () => { dashWin = null; });
}

function openConfigWindow(): void {
  if (configWin && !configWin.isDestroyed()) {
    if (configWin.isMinimized()) configWin.restore();
    configWin.show(); configWin.focus(); return;
  }
  configWin = new BrowserWindow({
    width: 480, height: 580, resizable: false,
    title: "Configurar ELYSIUM", skipTaskbar: false,
    icon: iconePadrao(),
    webPreferences: {
      preload: path.join(__dirname, "../renderer/preload-config.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  configWin.setMenu(null);
  configWin.loadFile(path.join(__dirname, "../renderer/config.html"));
  configWin.on("closed", () => { configWin = null; });
}

let appQuitting = false;

// ── speak queue ───────────────────────────────────────────────────────────────

type SpeakItem = { text: string; resolve: () => void };
const speakQueue: SpeakItem[] = [];
let isSpeaking = false;
let currentToken = 0;

function interruptAll(): void {
  currentToken++;
  cancelSpeak();
  speakQueue.length = 0;
  isSpeaking = false;
}

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    speakQueue.push({ text, resolve });
    if (!isSpeaking) drainSpeak();
  });
}

/** A frase que está saindo na caixa de som agora — o barge-in confere se ela tem "Elysium". */
let falandoAgora = "";

async function drainSpeak(): Promise<void> {
  if (speakQueue.length === 0) { isSpeaking = false; return; }
  isSpeaking = true;
  const item = speakQueue.shift()!;
  falandoAgora = item.text;
  try { await synthesize(item.text); } catch { /* best-effort */ }
  falandoAgora = "";
  item.resolve();
  drainSpeak();
}

// ── action label helper ───────────────────────────────────────────────────────

function getActionLabel(action: BrainAction): string {
  switch (action.action) {
    case "open_app":       return `Abrindo ${action.app_name}…`;
    case "close_app":      return `Fechando ${action.app_name}…`;
    case "open_url":       return "Abrindo site…";
    case "play_music":     return `Tocando ${action.query}…`;
    case "volume_control": return "Ajustando volume…";
    case "screenshot":     return "Capturando tela…";
    case "system_info":    return "Consultando sistema…";
    case "clipboard_read": return "Processando clipboard…";
    case "run_preset":     return `Ativando ${action.preset_name}…`;
    case "write_text":     return `Escrevendo ${action.description}…`;
    case "create_file":    return "Criando arquivo…";
    case "list_presets":   return "Listando presets…";
    case "delete_preset":  return `Removendo ${action.preset_name}…`;
    case "create_preset":  return `Criando preset ${action.preset_name}…`;
    case "media_control":  return `Mídia: ${action.operation}…`;
    case "window_management": return `Janela ${action.target_app}: ${action.operation}…`;
    default:               return "Processando…";
  }
}

function getActionsLabel(actions: BrainAction[]): string {
  if (actions.length === 1) return getActionLabel(actions[0]);
  return actions.map(a => getActionLabel(a).replace("…", "")).join(" + ") + "…";
}

// ── telemetry loop (every 3s) ─────────────────────────────────────────────────

let _cpuHighCount  = 0;
let _prevCpuPct    = 0;
let _cpuAltaTiques = 0;
let _ramAltaTiques = 0;
let _ramAlertedAt  = 0;
const ANOM_COOLDOWN = 5 * 60_000; // 5 min between same-type RAM alerts

function startTelemetryLoop(): void {
  const tick = async () => {
    try {
      const t = await getDashboardTelemetry();
      const now = Date.now();

      // ── CPU sustained (≥95% for 2 consecutive ticks = ~6s) ──────────────
      if (t.cpu_pct >= 95) {
        _cpuHighCount++;
        if (_cpuHighCount === 2) { // exactly 2 → log once, reset
          logAnomaly({
            type: "cpu_sustained",
            value: t.cpu_pct,
            topProcess: t.processes[0]?.name,
            details: `CPU ${t.cpu_pct}% por ~6 s`,
          });
          _cpuHighCount = 0;
        }
      } else {
        _cpuHighCount = 0;
      }

      // ── Spike: sudden jump >40 pp from a calm baseline ───────────────────
      if (_prevCpuPct < 55 && t.cpu_pct - _prevCpuPct > 40) {
        logAnomaly({
          type: "spike",
          value: t.cpu_pct,
          topProcess: t.processes[0]?.name,
          details: `Pico CPU: ${_prevCpuPct}% → ${t.cpu_pct}%`,
        });
      }
      _prevCpuPct = t.cpu_pct;

      // ── RAM high ─────────────────────────────────────────────────────────
      if (t.ram_pct > 92 && now - _ramAlertedAt > ANOM_COOLDOWN) {
        _ramAlertedAt = now;
        logAnomaly({
          type: "ram_high",
          value: t.ram_pct,
          topProcess: t.processes[0]?.name,
          details: `RAM ${t.ram_pct}%`,
        });
        // Só a RAM alta vira push: ela é sustentada e costuma exigir ação. Pico de CPU
        // é passageiro demais e viraria spam no celular.
        void sendPush(
          "anomaly",
          "PC sob pressão",
          `RAM em ${t.ram_pct}%${t.processes[0]?.name ? ` — maior consumo: ${t.processes[0].name}` : ""}`,
        );
      }

      // Gatilhos de rotina (bloco 79): CPU e RAM acima de 85% por 2 minutos seguidos (40
      // tiques). O limite fino é da rotina (`gatilho.limite`); aqui só se garante que é
      // sustentado, não um pico. Dispara uma vez por episódio: zera ao cair.
      _cpuAltaTiques = t.cpu_pct >= 85 ? _cpuAltaTiques + 1 : 0;
      _ramAltaTiques = t.ram_pct >= 85 ? _ramAltaTiques + 1 : 0;
      if (_cpuAltaTiques === 40) emitirEvento("cpu.alta", { valor: Math.round(t.cpu_pct), maior: t.processes[0]?.name?.replace(/#\d+$/, "") });
      if (_ramAltaTiques === 40) emitirEvento("ram.alta", { valor: Math.round(t.ram_pct), maior: t.processes[0]?.name?.replace(/#\d+$/, "") });

      if (!dashWin || dashWin.isDestroyed() || !dashWin.isVisible()) return;
      dashWin.webContents.send("dash:telemetry", t);
    } catch { /* best-effort */ }
  };
  setInterval(() => { tick().catch(() => {}); }, 3_000);

  // Janelas que abrem e fecham (bloco 79): a cada 15 s compara a lista de programas com
  // janela. Só nomes de processo; o título vai junto para o filtro ("o Chrome") casar
  // também com apps da loja hospedados no ApplicationFrameHost.
  let _janelas: Map<string, string> | null = null;
  setInterval(async () => {
    try {
      const agora = new Map<string, string>();
      for (const a of await getRunningApps()) {
        const nome = a.name.replace(/#\d+$/, "");
        if (!agora.has(nome)) agora.set(nome, a.title ?? "");
      }
      if (_janelas) {
        for (const [nome, titulo] of agora) if (!_janelas.has(nome)) emitirEvento("app.abriu", { app: nome, titulo });
        for (const nome of _janelas.keys()) if (!agora.has(nome)) emitirEvento("app.fechou", { app: nome });
      }
      _janelas = agora;
    } catch { /* best-effort */ }
  }, 15_000);

  // Ociosidade (bloco 79): sem mouse/teclado. Dispara nos marcos de 5, 15, 30, 60 e 120
  // minutos, uma vez cada; a rotina escolhe o seu (`gatilho.minutos`). Volta a zero com
  // atividade.
  let _marcoOcioso = 0;
  setInterval(() => {
    try {
      const min = Math.floor(powerMonitor.getSystemIdleTime() / 60);
      if (min < 1) { _marcoOcioso = 0; return; }
      for (const m of MARCOS_OCIOSO) if (min >= m && _marcoOcioso < m) { _marcoOcioso = m; emitirEvento("pc.ocioso", { minutos: m }); }
    } catch { /* powerMonitor indisponível */ }
  }, 60_000);
  powerMonitor.on("resume", () => emitirEvento("pc.voltou", { de: "suspensão" }));
  powerMonitor.on("unlock-screen", () => emitirEvento("pc.voltou", { de: "tela bloqueada" }));
}

// ── recording flow ────────────────────────────────────────────────────────────

async function startListening(): Promise<void> {
  if (!recorderWin || recorderWin.isDestroyed()) {
    recorderWin = createRecorderWindow();
    await new Promise<void>((res) => recorderWin!.webContents.once("did-finish-load", res));
  }
  state.set("listening");
  const cfg = getConfig();
  recorderWin.webContents.send("start-recording", {
    silenceMs:    cfg.silenceMs,
    maxRecordMs:  cfg.maxRecordMs,
  });
}

ipcMain.on("audio-data", async (_event, buffer: Buffer) => {
  const meuToken = ++currentToken;
  state.set("processing");
  try {
    const audio = new Uint8Array(buffer);
    const text  = await transcribe(audio);
    if (currentToken !== meuToken) return;

    if (!text) {
      notify("ELYSIUM", "Não entendi o áudio. Tente novamente.");
      state.set("idle");
      return;
    }

    dashWin?.webContents.send("voice:transcript", text);

    const { reply: combined } = await executarComando(text, {
      onActions: (actions) => {
        const label = getActionsLabel(actions);
        dashWin?.webContents.send("voice:action-label", label);
        dashWin?.webContents.send("dash:action-log", { icon: "settings", text: label, ok: true });
      },
      // A voz espera a resposta fechar (§19, bloco 21); só a tela recebe os pedaços.
      onToken: (token) => { if (currentToken === meuToken) dashWin?.webContents.send("chat:chunk", token); },
    });
    if (currentToken !== meuToken) return;
    updateLastCommand(text);
    notify("ELYSIUM", combined);

    dashWin?.webContents.send("voice:reply", combined);
    state.set("speaking");
    await speak(combined);
  } catch (err) {
    if (currentToken !== meuToken) return;
    const msg = err instanceof ElysiumError ? err.spoken : "Tive um problema, mas já voltei ao normal.";
    if (err instanceof ElysiumError) notify("ELYSIUM — Erro", err.message);
    dashWin?.webContents.send("voice:error", msg);
    state.set("speaking");
    try { await speak(msg); } catch { /* ignore */ }
  } finally {
    if (currentToken === meuToken) state.set("idle");
  }
});

ipcMain.on("recorder-error", (_event, msg: string) => {
  notify("ELYSIUM — Microfone", msg);
  dashWin?.webContents.send("voice:error", "Microfone indisponível. Verifique se está conectado.");
  state.set("speaking");
  speak("Não consegui acessar o microfone.")
    .catch(() => {})
    .finally(() => state.set("idle"));
});

ipcMain.on("audio-level", (_event, level: number) => {
  dashWin?.webContents.send("voice:audio-level", level);
});

// ── voice IPC ─────────────────────────────────────────────────────────────────

ipcMain.on("voice:start", () => {
  if (!state.is("idle")) interruptAll();
  startListening();
});

// ── chat IPC ──────────────────────────────────────────────────────────────────

ipcMain.on("chat:send", async (_event, text: string, opcoes?: { refazer?: boolean }) => {
  // Escrever por cima da fala interrompe a fala: quem já leu a resposta na tela não quer
  // esperar o TTS terminar um parágrafo para mandar a pergunta seguinte. Só gravação e
  // processamento continuam bloqueando — aí há um pedido em andamento de verdade.
  if (state.is("speaking")) interruptAll();
  else if (!state.is("idle")) { dashWin?.webContents.send("chat:busy"); return; }
  if (!hasApiKey()) {
    dashWin?.webContents.send("chat:error", "API key não configurada.");
    openConfigWindow();
    return;
  }
  // O token é o que impede o handler interrompido de devolver o estado a "ocioso" no
  // meio do pedido novo: `interruptAll` avança o contador, e só o dono do valor atual
  // encerra o ciclo.
  const meuToken = ++currentToken;
  state.set("processing");
  try {
    // "Refazer" e "editar a última pergunta" (bloco 84): o turno anterior sai do histórico
    // e não conta de novo nas perguntas frequentes.
    if (opcoes?.refazer) desfazerUltimoTurno();
    else registrarPergunta(text);
    const { reply: combined } = await executarComando(text, {
      onActions: (actions) => {
        const label = getActionsLabel(actions);
        dashWin?.webContents.send("voice:action-label", label);
        dashWin?.webContents.send("dash:action-log", { icon: "settings", text: label, ok: true });
      },
      // A voz espera a resposta fechar (§19, bloco 21); só a tela recebe os pedaços.
      onToken: (token) => { if (currentToken === meuToken) dashWin?.webContents.send("chat:chunk", token); },
    });
    if (currentToken !== meuToken) return;
    updateLastCommand(text);
    // Notificação nativa só quando a janela não está à vista: quem digitou no dashboard e
    // está olhando para ele não precisa de um balão do Windows repetindo a resposta.
    if (!dashWin?.isVisible() || !dashWin.isFocused()) notify("ELYSIUM", combined);
    dashWin?.webContents.send("chat:reply", combined);
    state.set("speaking");
    await speak(combined);
  } catch (err) {
    if (currentToken !== meuToken) return;
    const msg = err instanceof ElysiumError ? err.spoken : "Tive um problema, mas já voltei ao normal.";
    if (err instanceof ElysiumError) notify("ELYSIUM — Erro", err.message);
    dashWin?.webContents.send("chat:error", msg);
  } finally {
    if (currentToken === meuToken) state.set("idle");
  }
});

ipcMain.on("chat:clear", () => {
  clearHistory();
  notify("ELYSIUM", "Histórico apagado.");
});

/** Bolhas de partida do chat — ver `perguntas.ts`. */
ipcMain.handle("chat:starters", () => bolhasDoChat(4));

ipcMain.handle("history:get", () => getTopHistory(8));

// ── system IPC ────────────────────────────────────────────────────────────────

ipcMain.on("tts:stop", () => {
  interruptAll();
  state.set("idle");
});

ipcMain.on("system:kill-process", async (_event, pid: number) => {
  try { await killProcess(pid); } catch { /* best-effort */ }
});

ipcMain.on("media:direct", async (_event, op: string) => {
  try {
    const reply = await mediaControl(op as Parameters<typeof mediaControl>[0]);
    dashWin?.webContents.send("dash:action-log", { icon: "music", text: reply, ok: true });
  } catch { /* ignore */ }
});

// ── config IPC ────────────────────────────────────────────────────────────────

ipcMain.handle("config:get-api-key", () => getApiKey());
ipcMain.handle("config:set-api-key", (_e, key: string) => {
  setApiKey(key);
  notify("ELYSIUM", "API key configurada! Pronto para usar.");
});
ipcMain.on("config:close", () => configWin?.close());
ipcMain.on("config:open-window", () => openConfigWindow());

/**
 * Minimizar tem que minimizar.
 *
 * O botão do dashboard chamava `window.close()`, que o handler de `close` intercepta e
 * transforma em `hide()` — ou seja, minimizar fazia a janela SUMIR para a bandeja em vez de
 * ir para a barra de tarefas. Fechar continua indo para a bandeja de propósito: o atalho
 * global, o servidor do celular e os lembretes agendados vivem no processo principal.
 */
ipcMain.on("window:minimize", () => {
  const janela = BrowserWindow.getFocusedWindow() ?? dashWin;
  janela?.minimize();
});

ipcMain.handle("config:get-all", () => getConfig());
// A seção "Sobre" de Ajustes mostra a versão instalada — é a pergunta número um quando algo
// não bate com o handoff.
ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("brain:ollama-status", async (_e, modelo?: string) => {
  const cfg = getConfig();
  return ollamaDisponivel(modelo || cfg.ollamaRouterModel);
});
ipcMain.handle("config:set-all", async (_e, patch: Partial<AppConfig>) => {
  const prev = getConfig();
  setOverride(patch);

  // Trocar a cidade tem que valer AGORA. O cache do clima guarda até uma hora, e guarda
  // inclusive o `null` de quando ainda não havia cidade — sem invalidar aqui, o card
  // continua pedindo para você definir uma cidade que você acabou de definir.
  if (patch.climaCidade !== undefined || patch.climaLat !== undefined || patch.climaLon !== undefined) {
    limparCacheClima();
  }

  if (patch.shortcut && patch.shortcut !== prev.shortcut) {
    globalShortcut.unregisterAll();
    const ok = globalShortcut.register(patch.shortcut, handleShortcut);
    if (!ok) notify("ELYSIUM — Aviso", `Atalho "${patch.shortcut}" não pôde ser registrado.`);
  }

  if (patch.palavraDeAtivacao !== undefined && patch.palavraDeAtivacao !== prev.palavraDeAtivacao) {
    if (patch.palavraDeAtivacao) ligarPalavraDeAtivacao(acordarPorVoz); else desligarPalavraDeAtivacao();
  }

  if (patch.autoLaunch !== undefined && patch.autoLaunch !== prev.autoLaunch) {
    await sincronizarInicioAutomatico(patch.autoLaunch);
  }

  // Sem notificação do Windows aqui. Este handler é chamado ao arrastar um card da tela
  // Início, ao trocar de tema e a cada campo de Ajustes — uma notificação por gravação
  // vira ruído constante. Quem grava explicitamente já mostra um toast na própria tela.
});

ipcMain.handle("config:reset-defaults", () => {
  setOverride({
    shortcut: "Control+Shift+J",
    autoLaunch: true,
    silenceMs: 2500,
    maxRecordMs: 120000,
    sttModel: "whisper-large-v3",
    brainModel: "llama-3.3-70b-versatile",
    routerModel: "llama-3.3-70b-versatile",
    chatHistoryTurns: 6,
    chatIdleResetMs: 300000,
  });
  notify("ELYSIUM", "Configurações restauradas para os padrões.");
});

// ── Spotify (mini-player do dashboard) ────────────────────────────────────────
// Os handlers devolvem { ok, ... } em vez de lançar: o player fica consultando em
// laço, e uma exceção não tratada por tick encheria o console de ruído por algo tão
// banal quanto o Spotify estar fechado.
ipcMain.handle("spotify:status", () => ({ connected: isSpotifyConnected() }));
ipcMain.handle("spotify:login", () => { beginSpotifyLogin(); return { ok: true }; });
ipcMain.handle("spotify:logout", () => { spotifyDisconnect(); return { ok: true }; });

ipcMain.handle("spotify:now-playing", async () => {
  try {
    return { ok: true, nowPlaying: await getSpotifyNowPlaying() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle("spotify:command", async (_e, op: string, value?: number | boolean | string) => {
  try {
    switch (op) {
      case "play":     await spotifyPlay(); break;
      case "pause":    await spotifyPause(); break;
      case "next":     await spotifyNext(); break;
      case "previous": await spotifyPrevious(); break;
      case "volume":   await spotifySetVolume(Number(value)); break;
      case "seek":     await spotifySeek(Number(value)); break;
      case "shuffle":  await spotifySetShuffle(Boolean(value)); break;
      case "repeat":   await spotifySetRepeat(value as "off" | "track" | "context"); break;
      default: return { ok: false, error: `operação desconhecida: ${op}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

// ── Conversas salvas ──────────────────────────────────────────────────────────
ipcMain.handle("chat-sessions:list",     () => listChatSessions());
ipcMain.handle("chat-sessions:get",      (_e, id: string) => getChatSession(id));
ipcMain.handle("chat-sessions:save",     (_e, sessionId: string | null, messages: StoredMessage[]) =>
  upsertChatMessages(sessionId, messages));
ipcMain.handle("chat-sessions:favorite", (_e, id: string) => toggleChatFavorite(id));
ipcMain.handle("chat-sessions:delete",   (_e, id: string) => deleteChatSession(id));
// Renomear existe nos dois lados do switch: o lado da Caixa já tinha, o da IA não.
ipcMain.handle("chat-sessions:rename",   (_e, id: string, title: string) => renameChatSession(id, title));

ipcMain.handle("presets:get", () => getAllPresets());

// ── mailbox self-chat (PC ↔ celular) ────────────────────────────────────────

// Sem `sessionId` devolve a thread inteira — e o que os chamadores antigos esperam.
ipcMain.handle("mailbox:get-thread", (_e, sessionId?: string | null) => listMessagesForDesktop(sessionId ?? null));

// Arquivo arrastado para o lado "Celular" do chat (bloco 84). Mesmo caminho do anexo que
// vem do celular, com o teto de 5 MB do mailboxStore.
ipcMain.handle("mailbox:send-file", (_e, texto: string, anexo: { name: string; mimeType: string; base64: string }, sessionId?: string | null) => {
  if (!anexo?.base64 || !anexo.name) throw new Error("anexo inválido");
  const { id } = addMessage("pc", { kind: "file", text: (texto ?? "").trim() || null, attachment: anexo, sessionId: sessionId ?? null });
  broadcastMailboxEvent("toMobile", id);
  return { id };
});

// Link clicado numa resposta do chat (bloco 84). Só http(s): o markdown vem do modelo, e um
// "file:" ou protocolo de app numa resposta não pode virar execução com um clique.
// ── Dados e diagnóstico (blocos 96 e 97) ─────────────────────────────────────
ipcMain.handle("backup:exportar", async () => {
  const hoje = new Date().toISOString().slice(0, 10);
  const alvo = BrowserWindow.getFocusedWindow() ?? dashWin ?? undefined;
  const escolha = await dialog.showSaveDialog(alvo as BrowserWindow, {
    title: "Exportar tudo do ELYSIUM",
    defaultPath: path.join(app.getPath("documents"), `elysium-backup-${hoje}.json`),
    filters: [{ name: "Backup do ELYSIUM", extensions: ["json"] }],
  });
  if (escolha.canceled || !escolha.filePath) return { cancelado: true };
  const b = montarBackup();
  fs.writeFileSync(escolha.filePath, JSON.stringify(b, null, 2), "utf8");
  return { arquivo: escolha.filePath, memoria: b.memoria.length, lembretes: b.lembretes.length, presets: Object.keys(b.presets).length, rotinas: b.rotinas.length, conversas: b.conversas.length };
});
ipcMain.handle("backup:importar", async () => {
  const alvo = BrowserWindow.getFocusedWindow() ?? dashWin ?? undefined;
  const escolha = await dialog.showOpenDialog(alvo as BrowserWindow, {
    title: "Importar um backup do ELYSIUM",
    defaultPath: app.getPath("documents"),
    filters: [{ name: "Backup do ELYSIUM", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (escolha.canceled || !escolha.filePaths[0]) return { cancelado: true };
  const b = lerBackup(JSON.parse(fs.readFileSync(escolha.filePaths[0], "utf8")));
  // Confirmação no main, como os destrutivos do rpcBridge: importar muda ajustes e soma
  // rotinas — quem decide é o diálogo do sistema, não um clique perdido na tela.
  const { response } = await dialog.showMessageBox(alvo as BrowserWindow, {
    type: "question", buttons: ["Importar", "Cancelar"], defaultId: 0, cancelId: 1,
    title: "Importar backup",
    message: `Backup de ${new Date(b.criadoEm).toLocaleString("pt-BR")} (ELYSIUM ${b.app})`,
    detail: `${b.memoria.length} fatos de memória, ${b.lembretes.length} lembretes, ${Object.keys(b.presets).length} presets, ${b.rotinas.length} rotinas, ${b.conversas.length} conversas e os ajustes.\n\nSoma ao que já existe; nada é apagado. O que já existe com o mesmo nome fica como está.`,
  });
  if (response !== 0) return { cancelado: true };
  return aplicarBackup(b);
});
ipcMain.handle("diagnostico:texto", () => montarDiagnostico());
ipcMain.handle("diagnostico:abrir-logs", async () => { const p = pastaDeLogs(); if (p) await shell.openPath(p); return p; });

// Atualização automática (bloco 95). O estado vai para a tela SEM os caminhos de arquivo —
// o renderer não tem o que fazer com eles — e o token só entra: a tela sabe se existe um
// guardado, nunca qual é.
function estadoParaTela() {
  const e = estadoAtualizacao();
  const semArquivo = <T extends { arquivo: string }>(p?: T) => p ? { ...p, arquivo: undefined } : undefined;
  return { ...e, desktop: semArquivo(e.desktop), celular: semArquivo(e.celular), tokenProprio: Boolean(getGithubToken()) };
}
ipcMain.handle("atualizacao:estado", () => estadoParaTela());
ipcMain.handle("atualizacao:verificar", async () => { await verificarAtualizacoes(); return estadoParaTela(); });
ipcMain.handle("atualizacao:instalar", () => instalarAtualizacaoDesktop());
ipcMain.handle("novidades:pendentes", () => novidadesPendentes());
ipcMain.handle("novidades:vistas", () => marcarNovidadesVistas());
ipcMain.handle("atualizacao:token", async (_e, token: unknown) => {
  setGithubToken(typeof token === "string" ? token : "");
  await verificarAtualizacoes();
  return estadoParaTela();
});
let versaoAvisada = "";
aoMudarAtualizacao((e) => {
  dashWin?.webContents.send("atualizacao:mudou", estadoParaTela());
  // Um balão por versão, quando o instalador termina de baixar — não a cada verificação.
  if (e.desktop?.pronto && e.desktop.versao !== versaoAvisada) {
    versaoAvisada = e.desktop.versao;
    notify("ELYSIUM", `A versão ${e.desktop.versao} está pronta. Ajustes → Sobre → Instalar.`);
  }
});

// Catálogo da Groq para Ajustes e para diagnóstico: só os ids, a chave fica no main.
ipcMain.handle("groq:modelos", (_e, forcar?: boolean) => modelosDaGroq(Boolean(forcar)));

ipcMain.on("link:abrir", (_e, url: string) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
});

ipcMain.on("mailbox:send", (_event, text: string, sessionId?: string | null) => {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return;
  const { id } = addMessage("pc", { kind: inferKind(trimmed), text: trimmed, attachment: null, sessionId: sessionId ?? null });
  broadcastMailboxEvent("toMobile", id);
});

// ── conversas da Caixa ──────────────────────────────────────────────────────
// Mesmo conjunto de acoes das conversas da IA logo acima. Apagar aqui e destrutivo de
// verdade: leva as mensagens e os anexos em disco junto.
ipcMain.handle("mailbox:sessions-list",     ()                            => listMailboxSessions());
ipcMain.handle("mailbox:sessions-create",   (_e, title?: string)          => createMailboxSession(title));
ipcMain.handle("mailbox:sessions-rename",   (_e, id: string, t: string)   => renameMailboxSession(id, t));
ipcMain.handle("mailbox:sessions-favorite", (_e, id: string)              => toggleMailboxSessionFavorite(id));
ipcMain.handle("mailbox:sessions-delete",   (_e, id: string)              => deleteMailboxSession(id));
ipcMain.handle("mailbox:sessions-open",     (_e, id: string)              => setActiveMailboxSession(id));
ipcMain.handle("mailbox:sessions-active",   ()                            => getActiveMailboxSessionId());
ipcMain.handle("mailbox:message-delete",    (_e, id: string)              => deleteMailboxMessage(id));

ipcMain.handle("mailbox:copy-image", async (_event, attachmentPath: string) => {
  if (!isKnownAttachmentPath(attachmentPath)) throw new Error("Caminho de anexo inválido.");
  const image = nativeImage.createFromPath(attachmentPath);
  if (image.isEmpty()) throw new Error("Não foi possível ler a imagem.");
  clipboard.writeImage(image);
});

ipcMain.handle("mailbox:save-as", async (_event, attachmentPath: string, suggestedName: string) => {
  if (!isKnownAttachmentPath(attachmentPath)) throw new Error("Caminho de anexo inválido.");
  const result = dashWin
    ? await dialog.showSaveDialog(dashWin, { defaultPath: suggestedName })
    : await dialog.showSaveDialog({ defaultPath: suggestedName });
  if (result.canceled || !result.filePath) return { saved: false };
  fs.copyFileSync(attachmentPath, result.filePath);
  return { saved: true };
});

ipcMain.handle("mailbox:open-attachment", async (_event, attachmentPath: string) => {
  if (!isKnownAttachmentPath(attachmentPath)) throw new Error("Caminho de anexo inválido.");
  await shell.openPath(attachmentPath);
});

ipcMain.handle("telemetry:get-history",  () => getAnomalyHistory());
ipcMain.handle("telemetry:get-insights", () => getInsights());

// ── pairing (ELYSIUM-M mobile) ───────────────────────────────────────────

async function getPairingPayload() {
  const endpoints = getAllLocalIPv4();
  const cfg       = getConfig();
  const port      = cfg.serverPort ?? 4200;
  const token     = getOrCreateServerToken();
  const ip        = getLocalIPv4();

  // v2 do payload: lista de endereços em vez de um só, para o celular correr todos
  // e sobreviver a troca de IP por DHCP e a sair da rede de casa pelo túnel.
  // `ip` continua presente para não quebrar um Portal antigo ainda não atualizado.
  const qrDataUrl = await QRCode.toDataURL(JSON.stringify({
    v: 2,
    ip,
    port,
    token,
    hostname:  os.hostname(),
    endpoints: endpoints.map(e => e.address),
  }));

  return { ip, port, token, qrDataUrl, endpoints };
}

ipcMain.handle("pairing:get-info", () => getPairingPayload());

// Quem usou o token (bloco 98) — aparece no pareamento.
ipcMain.handle("aparelhos:lista", () => listarAparelhos());

ipcMain.handle("pairing:regenerate-token", async () => {
  const token = regenerateServerToken();
  setActiveToken(token);
  // O token velho deixou de valer agora: a lista de quem o usava vira história.
  esquecerAparelhos();
  notify("ELYSIUM", "Token regenerado. Pareamentos antigos do ELYSIUM-M precisam escanear o QR de novo.");
  return getPairingPayload();
});

// ── shortcut handler ──────────────────────────────────────────────────────────

// ── palavra de ativação (bloco 88) ─────────────────────────────────────────────
// Só acorda com o assistente ocioso e passado um respiro da última fala: a caixa de som
// dizendo "Elysium" numa resposta não pode acordar o próprio ELYSIUM. Não rouba o foco
// (ao contrário do atalho): quem fala de longe pode estar num jogo em tela cheia; a
// bandeja e o som de gravação já dizem que ele está ouvindo.
let ultimoOcioso = Date.now();
state.on("change", (s) => { if (s === "idle") ultimoOcioso = Date.now(); });
function acordarPorVoz(confianca: Confianca): void {
  if (!hasApiKey()) return;
  // Barge-in (fase 12): "Elysium" no meio da fala corta a fala e já começa a ouvir.
  if (state.is("speaking")) {
    if (!podeInterromper(confianca, falandoAgora)) return;
    console.log("[palavra] interrompendo a fala.");
    interruptAll();
    state.set("idle");
    startListening().catch((e) => console.error("[palavra] não consegui começar a ouvir:", e));
    return;
  }
  if (!state.is("idle")) return;
  if (Date.now() - ultimoOcioso < 2500) return;
  startListening().catch((e) => console.error("[palavra] não consegui começar a ouvir:", e));
}

function handleShortcut(): void {
  if (!hasApiKey()) { openConfigWindow(); return; }
  if (!state.is("idle")) {
    interruptAll();
    state.set("idle");
  }
  openDashboard();
  if (!dashWin!.isVisible()) dashWin!.show();
  dashWin!.focus();
  const trigger = () => startListening();
  if (dashWin!.webContents.isLoading()) {
    dashWin!.webContents.once("did-finish-load", trigger);
  } else {
    trigger();
  }
}

// ── app lifecycle ─────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    openDashboard();
  });
}

app.on("ready", async () => {
  if (process.platform === "win32") app.setAppUserModelId("com.zak.elysium");

  const quit = () => {
    appQuitting = true;
    globalShortcut.unregisterAll();
    // O host de entrada é um PowerShell persistente; sem isso ele sobrevive ao app
    // e fica pendurado segurando o stdin.
    inputHost.stop();
    stopScheduler();
  pararRotinas();
    app.exit(0);
  };

  // Ponte dos 52 métodos RPC para o dashboard. Antes do createTray porque o menu da
  // bandeja já pode disparar telas que usam a ponte.
  registerRpcBridge();

  createTray(
    quit,
    openConfigWindow,
    openDashboard,
    () => { openDashboard(); startListening(); },
    (text) => { openDashboard(); ipcMain.emit("chat:send", null, text); },
  );

  state.on("change", (s) => {
    refreshTray(s);
    dashWin?.webContents.send("voice:state", s);
  });

  recorderWin = createRecorderWindow();

  const serverToken = getOrCreateServerToken();
  const cfg = getConfig();
  startServer(serverToken, processCommand, cfg.serverPort ?? 4200, processCommandStream);
  iniciarAtualizacoes({ sair: quit, ocupado: () => state.get() !== "idle" });
  // Cérebro local: se o Ollama estiver parado, sobe já — antes do primeiro pedido pagar a espera.
  if (cfg.routerProvider === "ollama" || cfg.chatProvider === "ollama") void garantirOllama(baseDoOllama());
  // Modo foco (fase 12): distração vira balão no PC; o resumo do fim vai também ao celular.
  iniciarFoco({
    avisar: (titulo, corpo) => {
      notify(titulo, corpo);
      if (/^Foco /.test(titulo)) broadcastNotify(enfileirarEntrega({ tipo: "aviso", titulo, corpo }));
      dashWin?.webContents.send("foco:mudou");
    },
    fecharApp: (nome) => closeApp(nome),
    abertosAgora: () => getRunningApps(),
  });
  // Disco quase cheio (fase 12): no máximo um aviso por dia, no PC e no celular.
  vigiarDisco((titulo, corpo) => {
    notify(titulo, corpo);
    broadcastNotify(enfileirarEntrega({ tipo: "aviso", titulo, corpo }));
    void sendPush("anomaly", titulo, corpo, {});
  });

  const unseenFromMobile = checkAndMarkUnseenFromMobile();
  if (unseenFromMobile.length > 0) {
    const preview = unseenFromMobile.length === 1
      ? (unseenFromMobile[0].text?.slice(0, 80) || unseenFromMobile[0].attachment?.name || "item")
      : `${unseenFromMobile.length} itens`;
    notify("ELYSIUM — Mailbox", `Recebido do celular: ${preview}`);
  }

  mailboxEvents.on("new-message", (msg) => {
    dashWin?.webContents.send("mailbox:new-message", msg);
  });

  startMonitor(notify);
  startTelemetryLoop();

  // O agendador entra depois do servidor e do TTS porque dispara na hora o que venceu
  // com o PC desligado — precisa de tudo de pé para falar e notificar.
  startScheduler((reminder) => {
    notify("ELYSIUM — Lembrete", reminder.text);
    speak(`Lembrete: ${reminder.text}`).catch(() => { /* best-effort */ });
    void sendPush("reminder", "Lembrete", reminder.text, { reminderId: reminder.id });
    // Fila + WS: é o que chega ao celular sem push pela nuvem (bloco 68).
    const entrega = enfileirarEntrega({ tipo: "lembrete", titulo: "Lembrete", corpo: reminder.text, ref: reminder.id });
    broadcastNotify(entrega);
    dashWin?.webContents.send("reminder:fired", reminder);
  });

  // Rotinas: o texto passa pelo mesmo pipeline do chat e da voz. O comando não pode
  // atropelar uma gravação em andamento, então espera o app ficar ocioso (até 60 s).
  iniciarRotinas(
    async (rotina) => {
      const t0 = Date.now();
      while (!state.is("idle") && Date.now() - t0 < 60_000) await new Promise(r => setTimeout(r, 1000));
      const { reply } = await executarComando(rotina.texto);
      return reply;
    },
    (rotina, resultado) => {
      if (rotina.entregar.includes("pc")) {
        notify(`ELYSIUM — ${rotina.nome}`, resultado);
        if (rotina.falar) speak(resultado).catch(() => { /* best-effort */ });
      }
      if (rotina.entregar.includes("celular")) {
        const entrega = enfileirarEntrega({ tipo: "rotina", titulo: rotina.nome, corpo: resultado, ref: rotina.id });
        broadcastNotify(entrega);
        void sendPush("reminder", rotina.nome, resultado, { rotinaId: rotina.id });
      }
      dashWin?.webContents.send("rotina:executada", { id: rotina.id, nome: rotina.nome, resultado });
    },
    // A condição em português ("se o Spotify estiver aberto") é o cérebro com ferramentas
    // de leitura respondendo SIM ou NÃO (bloco 79).
    avaliarCondicao,
  );

  // Antes de registrar o nome novo: senão sobram duas entradas em HKCU\...\Run, e a
  // antiga aponta para o caminho da instalação NEUROAXIS.
  await removerEntradaLegada();
  await sincronizarInicioAutomatico(cfg.autoLaunch);

  if (!hasApiKey()) openConfigWindow();

  const ok = globalShortcut.register(cfg.shortcut, handleShortcut);
  if (cfg.palavraDeAtivacao) ligarPalavraDeAtivacao(acordarPorVoz);
  // O PowerShell da escuta é filho do app; sem isto ele ficaria órfão escutando depois
  // de "Sair" na bandeja.
  app.on("before-quit", () => desligarPalavraDeAtivacao());
  if (!ok) notify("ELYSIUM — Aviso", `Atalho ${cfg.shortcut} não pôde ser registrado. Tente via bandeja.`);

  notify("ELYSIUM", "Pronto! Pressione Ctrl+Shift+J para falar.");
  speak("Oi! O que faremos hoje?").catch(() => { /* best-effort */ });
});

app.on("window-all-closed", () => { /* intentional no-op */ });
