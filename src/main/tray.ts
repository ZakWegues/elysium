import { Tray, Menu, nativeImage, app } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import { AssistantState, stateLabel } from "./state";
import { getConfig, setOverride } from "./config";

let tray: Tray | null = null;
let _onQuit: () => void;
let _onConfigOpen: () => void;
let _onChatOpen: () => void;
let _onVoiceOpen: () => void;

function buildIcon(): Electron.NativeImage {
  const iconPath = path.join(app.getAppPath(), "build", "icon.ico");
  if (fs.existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  const pngPath = path.join(app.getAppPath(), "build", "icon.png");
  if (fs.existsSync(pngPath)) return nativeImage.createFromPath(pngPath);
  // Fallback: 16x16 purple square encoded as minimal PNG
  const ICON_B64 =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIUlEQVQ4T2NkYPj/" +
    "n4GKgHHUAIZRAxhGDWAYNYABAAkAAAH//wIxAAAAAElFTkSuQmCC";
  return nativeImage.createFromDataURL(`data:image/png;base64,${ICON_B64}`);
}

export function createTray(onQuit: () => void, onConfigOpen: () => void, onChatOpen: () => void, onVoiceOpen: () => void): Tray {
  _onQuit = onQuit;
  _onConfigOpen = onConfigOpen;
  _onChatOpen = onChatOpen;
  _onVoiceOpen = onVoiceOpen;
  tray = new Tray(buildIcon());
  tray.setToolTip("NEUROAXIS");
  refreshMenu("idle");
  return tray;
}

export function refreshTray(st: AssistantState): void {
  refreshMenu(st);
}

function refreshMenu(st: AssistantState): void {
  if (!tray) return;
  const cfg = getConfig();
  const menu = Menu.buildFromTemplate([
    { label: `Status: ${stateLabel(st)}`, enabled: false },
    { type: "separator" },
    {
      label: "Iniciar com o Windows",
      type: "checkbox",
      checked: cfg.autoLaunch,
      click: (item) => setOverride({ autoLaunch: item.checked }),
    },
    { label: "Abrir voz…",          click: () => _onVoiceOpen() },
    { label: "Abrir chat…",         click: () => _onChatOpen() },
    { label: "Configurar API key…", click: () => _onConfigOpen() },
    { type: "separator" },
    { label: "Sair", click: () => _onQuit() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`NEUROAXIS — ${stateLabel(st)}`);
}
