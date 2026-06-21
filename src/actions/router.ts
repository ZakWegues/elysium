import { BrainAction } from "../services/brain";
import { openUrl } from "./openUrl";
import { openApp } from "./openApp";
import { playMusic } from "./playMusic";
import { writeText } from "./writeText";

export async function routeAction(action: BrainAction): Promise<string> {
  switch (action.action) {
    case "play_music":  return playMusic(action.query);
    case "open_url":    return openUrl(action.url_or_query);
    case "open_app":    return openApp(action.app_name);
    case "write_text":  return writeText(action.content, action.description);
    case "chat":        return action.reply;
    case "unknown":     return "Não entendi o que você pediu. Pode repetir?";
  }
}
