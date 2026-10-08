import { AsyncLocalStorage } from "node:async_hooks";
import { getPreset } from "../services/presetsStore";
import { routeAction } from "./router";

/**
 * A cadeia de presets desta execução. Um preset que roda a si mesmo (ou A → B → A) virava um
 * laço infinito, uma volta a cada 600 ms (08/10): agora nenhum preset entra duas vezes na
 * mesma cadeia, e a cadeia tem no máximo 3 níveis. A cadeia vive no contexto assíncrono de
 * cada execução — uma rotina e um pedido rodando o mesmo preset ao mesmo tempo não se barram.
 */
const cadeia = new AsyncLocalStorage<string[]>();
const PROFUNDIDADE_MAX = 3;

export async function runPreset(presetName: string): Promise<string> {
  const preset = getPreset(presetName);
  if (!preset) return `Preset "${presetName}" não encontrado.`;
  const chave = preset.description + "|" + presetName.toLowerCase();
  const emExecucao = cadeia.getStore() ?? [];
  if (emExecucao.includes(chave) || emExecucao.length >= PROFUNDIDADE_MAX) {
    console.warn(`[presets] "${presetName}" não roda: cadeia de presets em laço ou funda demais.`);
    return `O preset "${presetName}" chamaria a si mesmo — pulei para não entrar em laço.`;
  }
  await cadeia.run([...emExecucao, chave], async () => {
    for (const action of preset.actions) {
      try {
        await routeAction(action);
        await new Promise<void>((r) => setTimeout(r, 600));
      } catch { /* continua mesmo se uma ação falhar */ }
    }
  });

  return `${preset.description} ativado!`;
}
