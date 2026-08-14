import { Tray, Menu, MenuItemConstructorOptions, nativeImage, app } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import { AssistantState, stateLabel } from "./state";
import { getConfig, setOverride } from "./config";
import { getTopHistory } from "../services/history";
import { getAllPresets } from "../services/presetsStore";

let tray: Tray | null = null;
let _onQuit: () => void;
let _onConfigOpen: () => void;
let _onChatOpen: () => void;
let _onVoiceOpen: () => void;
let _onCommand: (text: string) => void;
let _currentState: AssistantState = "idle";
let _lastCommand = "";

function buildIcon(): Electron.NativeImage {
  const iconPath = path.join(app.getAppPath(), "build", "icon.ico");
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  const pngPath = path.join(app.getAppPath(), "build", "icon.png");
  if (fs.existsSync(pngPath)) return nativeImage.createFromPath(pngPath);
  const ICON_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIUlEQVQ4T2NkYPj/" +
    "n4GKgHHUAIZRAxhGDWAYNYABAAkAAAH//wIxAAAAAElFTkSuQmCC";
  return nativeImage.createFromDataURL(`data:image/png;base64,${ICON_B64}`);
}

export function createTray(
  onQuit: () => void,
  onConfigOpen: () => void,
  onChatOpen: () => void,
  onVoiceOpen: () => void,
  onCommand: (text: string) => void,
): Tray {
  _onQuit = onQuit;
  _onConfigOpen = onConfigOpen;
  _onChatOpen = onChatOpen;
  _onVoiceOpen = onVoiceOpen;
  _onCommand = onCommand;
  tray = new Tray(buildIcon());
  tray.setToolTip("ELYSIUM");
  refreshMenu("idle");
  return tray;
}

export function refreshTray(st: AssistantState): void {
  _currentState = st;
  refreshMenu(st);
}

export function updateLastCommand(cmd: string): void {
  _lastCommand = cmd;
  refreshMenu(_currentState);
}

function refreshMenu(st: AssistantState): void {
  if (!tray) return;
  const cfg = getConfig();

  // Build Frequentes submenu
  let freqSubmenu: MenuItemConstructorOptions[] = [];
  try {
    const history = getTopHistory(5);
    freqSubmenu = history.map((h): MenuItemConstructorOptions => ({
      label: `${h.icon} ${h.label}`,
      click: () => _onCommand(h.text),
    }));
  } catch { /* ignore */ }
  if (freqSubmenu.length === 0) {
    freqSubmenu = [{ label: "Nenhum histórico ainda", enabled: false }];
  }

  // Build Presets submenu
  let presetSubmenu: MenuItemConstructorOptions[] = [];
  try {
    const presets = getAllPresets();
    presetSubmenu = Object.entries(presets).map(([key, p]): MenuItemConstructorOptions => ({
      label: `${p.icon ?? "⚡"} ${p.description ?? key}`,
      click: () => _onCommand(`ativa o modo ${key}`),
    }));
  } catch { /* ignore */ }
  if (presetSubmenu.length === 0) {
    presetSubmenu = [{ label: "Nenhum preset configurado", enabled: false }];
  }

  const lastLabel = _lastCommand
    ? `📋 ${_lastCommand.length > 32 ? _lastCommand.slice(0, 32) + "…" : _lastCommand}`
    : "📋 Nenhum comando ainda";

  const template: MenuItemConstructorOptions[] = [
    { label: `ELYSIUM — ${stateLabel(st)}`, enabled: false },
    { type: "separator" },
    { label: lastLabel, enabled: false },
    { type: "separator" },
    { label: "⚡ Frequentes", submenu: freqSubmenu },
    { label: "🎮 Presets",    submenu: presetSubmenu },
    { type: "separator" },
    { label: "🖥️ Abrir dashboard…",  click: () => _onChatOpen() },
    { label: "🎤 Ativar voz…",     click: () => _onVoiceOpen() },
    { label: "⚙️  Configurações…", click: () => _onConfigOpen() },
    { type: "separator" },
    {
      label: "🔄 Iniciar com o Windows",
      type: "checkbox",
      checked: cfg.autoLaunch,
      click: (item) => setOverride({ autoLaunch: item.checked }),
    },
    { type: "separator" },
    { label: "✕ Sair", click: () => _onQuit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(`ELYSIUM — ${stateLabel(st)}`);
}
