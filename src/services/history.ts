import Store from "electron-store";
import type { BrainAction } from "./brain";

export interface HistoryEntry {
  text: string;   // original user input (for re-execution)
  label: string;  // display label
  icon: string;
  count: number;
  lastUsed: number;
}

const store = new Store<{ history: HistoryEntry[] }>({
  name: "history",
  defaults: { history: [] },
});

function actionLabel(action: BrainAction): { label: string; icon: string } | null {
  switch (action.action) {
    case "play_music": return { icon: "🎵", label: action.query };
    case "open_url":   return { icon: "🌐", label: action.url_or_query };
    case "open_app":    return { icon: "💻", label: action.app_name };
    case "run_preset":  return { icon: "🎮", label: action.preset_name };
    default:            return null;
  }
}

export function trackUsage(text: string, action: BrainAction): void {
  const meta = actionLabel(action);
  if (!meta) return;

  const history = store.get("history");
  const existing = history.find(h => h.text.toLowerCase() === text.toLowerCase());
  if (existing) {
    existing.count++;
    existing.lastUsed = Date.now();
  } else {
    history.push({ text, label: meta.label, icon: meta.icon, count: 1, lastUsed: Date.now() });
  }
  history.sort((a, b) => b.count - a.count);
  store.set("history", history.slice(0, 50));
}

export function getTopHistory(n = 8): HistoryEntry[] {
  return store.get("history").slice(0, n);
}
