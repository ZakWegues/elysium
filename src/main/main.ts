import { app, BrowserWindow, globalShortcut, ipcMain, clipboard, nativeImage, dialog, shell } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import AutoLaunch from "auto-launch";
import * as QRCode from "qrcode";
import { getConfig, getApiKey, setApiKey, hasApiKey, setOverride, getOrCreateServerToken, regenerateServerToken, AppConfig } from "./config";
import { getLocalIPv4, getAllLocalIPv4 } from "./network";
import { inputHost } from "../services/inputHost";
import { state } from "./state";
import { notify } from "./notify";
import { createTray, refreshTray, updateLastCommand } from "./tray";
import { transcribe } from "../services/stt";
import { decideBrain, clearHistory } from "../services/brain";
import { trackUsage, getTopHistory } from "../services/history";
import { synthesize, cancelSpeak } from "../services/tts";
import { routeAction } from "../actions/router";
import { NeuroaxisError } from "../services/errors";
import { processCommand } from "../services/command";
import { startServer, setActiveToken, broadcastMailboxEvent } from "../services/server";
import { startMonitor, getDashboardTelemetry, killProcess } from "../actions/systemInfo";
import type { BrainAction } from "../services/brain";
import { mediaControl } from "../actions/mediaControl";
import { logAnomaly, getAnomalyHistory, getInsights } from "../services/telemetryLog";
import { getAllPresets } from "../services/presetsStore";
import { checkAndMarkUnseenFromMobile, addMessage, listMessagesForDesktop, inferKind, mailboxEvents, isKnownAttachmentPath } from "../services/mailboxStore";

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
    title:     "NEUROAXIS",
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
    title: "Configurar NEUROAXIS", skipTaskbar: false,
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

async function drainSpeak(): Promise<void> {
  if (speakQueue.length === 0) { isSpeaking = false; return; }
  isSpeaking = true;
  const item = speakQueue.shift()!;
  try { await synthesize(item.text); } catch { /* best-effort */ }
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
      }

      if (!dashWin || dashWin.isDestroyed() || !dashWin.isVisible()) return;
      dashWin.webContents.send("dash:telemetry", t);
    } catch { /* best-effort */ }
  };
  setInterval(() => { tick().catch(() => {}); }, 3_000);
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
  const token = ++currentToken;
  state.set("processing");
  try {
    const audio = new Uint8Array(buffer);
    const text  = await transcribe(audio);
    if (currentToken !== token) return;

    if (!text) {
      notify("NEUROAXIS", "Não entendi o áudio. Tente novamente.");
      state.set("idle");
      return;
    }

    dashWin?.webContents.send("voice:transcript", text);

    const actions = await decideBrain(text);
    if (currentToken !== token) return;

    const label = getActionsLabel(actions);
    dashWin?.webContents.send("voice:action-label", label);
    dashWin?.webContents.send("dash:action-log", { icon: "⚙️", text: label, ok: true });

    const replies: string[] = [];
    for (const action of actions) {
      const reply = await routeAction(action);
      trackUsage(text, action);
      replies.push(reply);
    }
    updateLastCommand(text);
    const combined = replies.filter(Boolean).join(" ");
    notify("NEUROAXIS", combined);

    dashWin?.webContents.send("voice:reply", combined);
    state.set("speaking");
    await speak(combined);
  } catch (err) {
    if (currentToken !== token) return;
    const msg = err instanceof NeuroaxisError ? err.spoken : "Tive um problema, mas já voltei ao normal.";
    if (err instanceof NeuroaxisError) notify("NEUROAXIS — Erro", err.message);
    dashWin?.webContents.send("voice:error", msg);
    state.set("speaking");
    try { await speak(msg); } catch { /* ignore */ }
  } finally {
    if (currentToken === token) state.set("idle");
  }
});

ipcMain.on("recorder-error", (_event, msg: string) => {
  notify("NEUROAXIS — Microfone", msg);
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

ipcMain.on("chat:send", async (_event, text: string) => {
  if (!state.is("idle")) { dashWin?.webContents.send("chat:busy"); return; }
  if (!hasApiKey()) {
    dashWin?.webContents.send("chat:error", "API key não configurada.");
    openConfigWindow();
    return;
  }
  state.set("processing");
  try {
    const actions = await decideBrain(text);
    const label = getActionsLabel(actions);
    dashWin?.webContents.send("voice:action-label", label);
    dashWin?.webContents.send("dash:action-log", { icon: "⚙️", text: label, ok: true });

    const replies: string[] = [];
    for (const action of actions) {
      const reply = await routeAction(action);
      trackUsage(text, action);
      replies.push(reply);
    }
    updateLastCommand(text);
    const combined = replies.filter(Boolean).join(" ");
    notify("NEUROAXIS", combined);
    dashWin?.webContents.send("chat:reply", combined);
    state.set("speaking");
    await speak(combined);
  } catch (err) {
    const msg = err instanceof NeuroaxisError ? err.spoken : "Tive um problema, mas já voltei ao normal.";
    if (err instanceof NeuroaxisError) notify("NEUROAXIS — Erro", err.message);
    dashWin?.webContents.send("chat:error", msg);
  } finally {
    state.set("idle");
  }
});

ipcMain.on("chat:clear", () => {
  clearHistory();
  notify("NEUROAXIS", "Histórico apagado.");
});

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
    dashWin?.webContents.send("dash:action-log", { icon: "🎵", text: reply, ok: true });
  } catch { /* ignore */ }
});

// ── config IPC ────────────────────────────────────────────────────────────────

ipcMain.handle("config:get-api-key", () => getApiKey());
ipcMain.handle("config:set-api-key", (_e, key: string) => {
  setApiKey(key);
  notify("NEUROAXIS", "API key configurada! Pronto para usar.");
});
ipcMain.on("config:close", () => configWin?.close());
ipcMain.on("config:open-window", () => openConfigWindow());

ipcMain.handle("config:get-all", () => getConfig());
ipcMain.handle("config:set-all", async (_e, patch: Partial<AppConfig>) => {
  const prev = getConfig();
  setOverride(patch);

  if (patch.shortcut && patch.shortcut !== prev.shortcut) {
    globalShortcut.unregisterAll();
    const ok = globalShortcut.register(patch.shortcut, handleShortcut);
    if (!ok) notify("NEUROAXIS — Aviso", `Atalho "${patch.shortcut}" não pôde ser registrado.`);
  }

  if (patch.autoLaunch !== undefined && patch.autoLaunch !== prev.autoLaunch) {
    try {
      const autoLauncher = new AutoLaunch({ name: "NEUROAXIS", isHidden: true });
      if (patch.autoLaunch) await autoLauncher.enable();
      else await autoLauncher.disable();
    } catch { /* best-effort */ }
  }

  notify("NEUROAXIS", "Configurações salvas.");
});

ipcMain.handle("config:reset-defaults", () => {
  setOverride({
    shortcut: "Control+Shift+J",
    autoLaunch: true,
    silenceMs: 2500,
    maxRecordMs: 120000,
    sttModel: "whisper-large-v3",
    brainModel: "llama-3.3-70b-versatile",
    chatHistoryTurns: 6,
    chatIdleResetMs: 300000,
  });
  notify("NEUROAXIS", "Configurações restauradas para os padrões.");
});

ipcMain.handle("presets:get", () => getAllPresets());

// ── mailbox self-chat (PC ↔ celular) ────────────────────────────────────────

ipcMain.handle("mailbox:get-thread", () => listMessagesForDesktop());

ipcMain.on("mailbox:send", (_event, text: string) => {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return;
  const { id } = addMessage("pc", { kind: inferKind(trimmed), text: trimmed, attachment: null });
  broadcastMailboxEvent("toMobile", id);
});

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

// ── pairing (NEUROAXIS Portal mobile) ───────────────────────────────────────────

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

ipcMain.handle("pairing:regenerate-token", async () => {
  const token = regenerateServerToken();
  setActiveToken(token);
  notify("NEUROAXIS", "Token regenerado. Pareamentos antigos do Portal precisam escanear o QR de novo.");
  return getPairingPayload();
});

// ── shortcut handler ──────────────────────────────────────────────────────────

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
  if (process.platform === "win32") app.setAppUserModelId("com.zak.neuroaxis");

  const quit = () => {
    appQuitting = true;
    globalShortcut.unregisterAll();
    // O host de entrada é um PowerShell persistente; sem isso ele sobrevive ao app
    // e fica pendurado segurando o stdin.
    inputHost.stop();
    app.exit(0);
  };

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
  startServer(serverToken, processCommand, cfg.serverPort ?? 4200);

  const unseenFromMobile = checkAndMarkUnseenFromMobile();
  if (unseenFromMobile.length > 0) {
    const preview = unseenFromMobile.length === 1
      ? (unseenFromMobile[0].text?.slice(0, 80) || unseenFromMobile[0].attachment?.name || "item")
      : `${unseenFromMobile.length} itens`;
    notify("NEUROAXIS — Mailbox", `Recebido do celular: ${preview}`);
  }

  mailboxEvents.on("new-message", (msg) => {
    dashWin?.webContents.send("mailbox:new-message", msg);
  });

  startMonitor(notify);
  startTelemetryLoop();

  const autoLauncher = new AutoLaunch({ name: "NEUROAXIS", isHidden: true });
  try {
    const enabled = await autoLauncher.isEnabled();
    if (cfg.autoLaunch && !enabled) await autoLauncher.enable();
    else if (!cfg.autoLaunch && enabled) await autoLauncher.disable();
  } catch { /* best-effort */ }

  if (!hasApiKey()) openConfigWindow();

  const ok = globalShortcut.register(cfg.shortcut, handleShortcut);
  if (!ok) notify("NEUROAXIS — Aviso", `Atalho ${cfg.shortcut} não pôde ser registrado. Tente via bandeja.`);

  notify("NEUROAXIS", "Pronto! Pressione Ctrl+Shift+J para falar.");
  speak("Oi! O que faremos hoje?").catch(() => { /* best-effort */ });
});

app.on("window-all-closed", () => { /* intentional no-op */ });
