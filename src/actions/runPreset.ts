import { getPreset } from "../services/presetsStore";
import { routeAction } from "./router";

/**
 * Presets em execução agora. Um preset que roda a si mesmo (ou A → B → A) virava um laço
 * infinito, uma volta a cada 600 ms (08/10): agora nenhum preset entra duas vezes na mesma
 * cadeia, e a cadeia tem no máximo 3 níveis.
 */
const emExecucao: string[] = [];
const PROFUNDIDADE_MAX = 3;

export async function runPreset(presetName: string): Promise<string> {
  const preset = getPreset(presetName);
  if (!preset) return `Preset "${presetName}" não encontrado.`;
  const chave = preset.description + "|" + presetName.toLowerCase();
  if (emExecucao.includes(chave) || emExecucao.length >= PROFUNDIDADE_MAX) {
    console.warn(`[presets] "${presetName}" não roda: cadeia de presets em laço ou funda demais.`);
    return `O preset "${presetName}" chamaria a si mesmo — pulei para não entrar em laço.`;
  }
  emExecucao.push(chave);
  try {
    for (const action of preset.actions) {
      try {
        await routeAction(action);
        await new Promise<void>((r) => setTimeout(r, 600));
      } catch { /* continua mesmo se uma ação falhar */ }
    }
  } finally {
    emExecucao.splice(emExecucao.indexOf(chave), 1);
  }

  return `${preset.description} ativado!`;
}
