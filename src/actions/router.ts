import { BrainAction } from "../services/brain";
import { getAllPresets, findPresetKey, deletePresetByKey } from "../services/presetsStore";
import { openUrl } from "./openUrl";
import { openApp } from "./openApp";
import { closeApp } from "./closeApp";
import { volumeControl } from "./volumeControl";
import { playMusic } from "./playMusic";
import { writeText } from "./writeText";
import { createFile } from "./createFile";
import { clipboardRead } from "./clipboardAction";
import { screenshot } from "./screenshot";
import { systemInfo } from "./systemInfo";
import { runPreset } from "./runPreset";
import { mediaControl } from "./mediaControl";
import { windowManagement } from "./windowManagement";
import { createPreset } from "./createPreset";
import { sendToMobile } from "./sendToMobile";
import { powerControl } from "./powerControl";

export async function routeAction(action: BrainAction): Promise<string> {
  switch (action.action) {
    case "play_music":        return playMusic(action.query);
    case "open_url":          return openUrl(action.url_or_query);
    case "open_app":          return openApp(action.app_name);
    case "close_app":         return closeApp(action.app_name);
    case "volume_control":    return volumeControl(action.level);
    case "media_control":     return mediaControl(action.operation);
    case "window_management": return windowManagement(action.target_app, action.operation);
    case "write_text":        return writeText(action.content, action.description);
    case "create_file":       return createFile(action.filename, action.content, action.description);
    case "clipboard_read":    return clipboardRead(action.instruction);
    case "screenshot":        return screenshot(action.filename);
    case "system_info":       return systemInfo(action.query);
    case "run_preset":        return runPreset(action.preset_name);
    case "list_presets":      return listPresetsReply();
    case "delete_preset":     return deletePreset(action.preset_name);
    case "create_preset":     return createPreset(action.preset_name, action.description, action.icon, action.actions);
    case "send_to_mobile":    return sendToMobile(action.content, action.kind);
    case "power_control":     return powerControl(action.operation, action.delay_seconds);
    case "chat":              return action.reply;
    case "unknown":           return "Não entendi o que você pediu. Pode repetir?";
  }
}

function listPresetsReply(): string {
  const presets = getAllPresets();
  const keys = Object.keys(presets);
  if (keys.length === 0) return "Você não tem nenhum preset configurado ainda.";
  const list = keys.map(k => `${presets[k].icon ?? "⚡"} ${presets[k].description ?? k}`).join(", ");
  return `Seus presets: ${list}.`;
}

function deletePreset(presetName: string): string {
  const key = findPresetKey(presetName);
  if (!key) return `Preset "${presetName}" não encontrado.`;
  deletePresetByKey(key);
  return `Preset "${key}" removido.`;
}
