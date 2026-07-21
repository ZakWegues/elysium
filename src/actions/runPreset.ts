import { getPreset } from "../services/presetsStore";
import { routeAction } from "./router";

export async function runPreset(presetName: string): Promise<string> {
  const preset = getPreset(presetName);
  if (!preset) return `Preset "${presetName}" não encontrado.`;

  for (const action of preset.actions) {
    try {
      await routeAction(action);
      await new Promise<void>((r) => setTimeout(r, 600));
    } catch { /* continua mesmo se uma ação falhar */ }
  }

  return `${preset.description} ativado!`;
}
