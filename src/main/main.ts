import { app, BrowserWindow, globalShortcut, ipcMain } from "electron";
import * as path from "node:path";
import AutoLaunch from "auto-launch";
import { getConfig, getApiKey, setApiKey, hasApiKey } from "./config";
import { state } from "./state";
import { notify } from "./notify";
import { createTray, refreshTray } from "./tray";
import { transcribe } from "../services/stt";
import { decideBrain, clearHistory } from "../services/brain";
import { trackUsage, getTopHistory } from "../services/history";
import { synthesize } from "../services/tts";
import { routeAction } from "../actions/router";
import { NeuroaxisError } from "../services/errors";

// ── windows ───────────────────────────────────────────────────────────────────

let recorderWin: BrowserWindow | null = null;
let configWin:   BrowserWindow | null = null;
let chatWin:     BrowserWindow | null = null;
let voiceWin:    BrowserWindow | null = null;

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
  return win;
}

function openVoiceWindow(): void {
  if (voiceWin) { voiceWin.focus(); return; }
  voiceWin = new BrowserWindow({
    width: 400,
    height: 440,
    resizable: false,
    title: "NEUROAXIS — Voz",
    webPreferences: {
      preload: path.join(__dirname, "../renderer/preload-voice.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  voiceWin.setMenu(null);
  voiceWin.loadFile(path.join(__dirname, "../renderer/voice-overlay.html"));
  voiceWin.on("closed", () => { voiceWin = null; });
}

function openChatWindow(): void {
  if (chatWin) { chatWin.focus(); return; }
  chatWin = new BrowserWindow({
    width: 480,
    height: 620,
    title: "NEUROAXIS — Chat",
    webPreferences: {
      preload: path.join(__dirname, "../renderer/preload-chat.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  chatWin.setMenu(null);
  chatWin.loadFile(path.join(__dirname, "../renderer/chat.html"));
  chatWin.on("closed", () => { chatWin = null; });
}

function openConfigWindow(): void {
  if (configWin) { configWin.focus(); return; }
  configWin = new BrowserWindow({
    width: 440,
    height: 320,
    resizable: false,
    title: "Configurar NEUROAXIS",
    skipTaskbar: false,
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

// ── speak queue ───────────────────────────────────────────────────────────────

type SpeakItem = { text: string; resolve: () => void };
const speakQueue: SpeakItem[] = [];
let isSpeaking = false;

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
  try {
    const audio = await synthesize(item.text);
    await playAudioInRenderer(audio);
  } catch { /* best-effort — never crash on TTS failure */ }
  item.resolve();
  drainSpeak();
}

function playAudioInRenderer(audio: Buffer): Promise<void> {
  return new Promise((resolve) => {
    if (!recorderWin) { resolve(); return; }
    const timeout = setTimeout(resolve, 60_000);
    ipcMain.once("audio-playback-done", () => { clearTimeout(timeout); resolve(); });
    recorderWin.webContents.send("play-audio", audio);
  });
}

// ── recording flow ────────────────────────────────────────────────────────────

async function startListening(): Promise<void> {
  if (!recorderWin) recorderWin = createRecorderWindow();
  state.set("listening");
  const cfg = getConfig();
  recorderWin.webContents.send("start-recording", {
    silenceMs: cfg.silenceMs,
    maxRecordMs: cfg.maxRecordMs,
  });
}

ipcMain.on("audio-data", async (_event, buffer: Buffer) => {
  state.set("processing");
  try {
    const audio = new Uint8Array(buffer);
    const text  = await transcribe(audio);
    if (!text) { state.set("idle"); return; }

    voiceWin?.webContents.send("voice:transcript", text);

    const action = await decideBrain(text);
    const reply  = await routeAction(action);
    trackUsage(text, action);

    voiceWin?.webContents.send("voice:reply", reply);
    state.set("speaking");
    await speak(reply);
  } catch (err) {
    const msg = err instanceof NeuroaxisError ? err.spoken : "Tive um problema, mas já voltei ao normal.";
    if (err instanceof NeuroaxisError) notify("NEUROAXIS", err.message);
    voiceWin?.webContents.send("voice:error", msg);
    state.set("speaking");
    try { await speak(msg); } catch { /* ignore */ }
  } finally {
    state.set("idle");
  }
});

ipcMain.on("recorder-error", (_event, msg: string) => {
  notify("NEUROAXIS — Microfone", msg);
  voiceWin?.webContents.send("voice:error", "Microfone indisponível. Verifique se está conectado.");
  state.set("speaking");
  speak("Não consegui acessar o microfone.")
    .catch(() => { })
    .finally(() => state.set("idle"));
});

// ── voice IPC ─────────────────────────────────────────────────────────────────

ipcMain.on("voice:start", () => {
  if (state.is("idle")) startListening();
});

// ── chat IPC ──────────────────────────────────────────────────────────────────

ipcMain.on("chat:send", async (_event, text: string) => {
  if (!state.is("idle")) { chatWin?.webContents.send("chat:busy"); return; }
  if (!hasApiKey()) {
    chatWin?.webContents.send("chat:error", "API key não configurada.");
    openConfigWindow();
    return;
  }
  state.set("processing");
  try {
    const action = await decideBrain(text);
    const reply  = await routeAction(action);
    trackUsage(text, action);
    chatWin?.webContents.send("chat:reply", reply);
    state.set("speaking");
    await speak(reply);
  } catch (err) {
    const msg = err instanceof NeuroaxisError ? err.spoken : "Tive um problema, mas já voltei ao normal.";
    chatWin?.webContents.send("chat:error", msg);
  } finally {
    state.set("idle");
  }
});

ipcMain.on("chat:clear", () => { clearHistory(); });
ipcMain.handle("history:get", () => getTopHistory(8));

// ── config IPC ────────────────────────────────────────────────────────────────

ipcMain.handle("config:get-api-key", () => getApiKey());
ipcMain.handle("config:set-api-key", (_e, key: string) => setApiKey(key));
ipcMain.on("config:close", () => configWin?.close());

// ── app lifecycle ─────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = voiceWin ?? chatWin ?? configWin;
    win?.restore();
    win?.focus();
  });
}

app.on("ready", async () => {
  if (process.platform === "win32") app.setAppUserModelId("com.zak.neuroaxis");

  const quit = () => { globalShortcut.unregisterAll(); app.exit(0); };

  createTray(quit, openConfigWindow, openChatWindow, openVoiceWindow);
  state.on("change", (s) => {
    refreshTray(s);
    voiceWin?.webContents.send("voice:state", s);
  });

  recorderWin = createRecorderWindow();

  // Auto-launch sync
  const cfg = getConfig();
  const autoLauncher = new AutoLaunch({ name: "NEUROAXIS", isHidden: true });
  try {
    const enabled = await autoLauncher.isEnabled();
    if (cfg.autoLaunch && !enabled) await autoLauncher.enable();
    else if (!cfg.autoLaunch && enabled) await autoLauncher.disable();
  } catch { /* best-effort */ }

  // API key check
  if (!hasApiKey()) openConfigWindow();

  // Global shortcut → open voice window then start listening
  const ok = globalShortcut.register(cfg.shortcut, () => {
    if (!state.is("idle")) return;
    if (!hasApiKey()) { openConfigWindow(); return; }
    if (!voiceWin) {
      openVoiceWindow();
      voiceWin!.webContents.once("did-finish-load", () => startListening());
    } else {
      startListening();
    }
  });
  if (!ok) notify("NEUROAXIS", `Atalho ${cfg.shortcut} não pôde ser registrado. Tente via bandeja.`);

  notify("NEUROAXIS", "Pronto! Pressione Ctrl+Shift+J para falar.");
});

// Keep alive in tray — never quit on window-all-closed
app.on("window-all-closed", () => { /* intentional no-op */ });
