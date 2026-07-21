import type { BrainAction } from "../services/brain";
import { savePreset } from "../services/presetsStore";

export async function createPreset(
  name: string,
  description: string,
  icon: string | undefined,
  actions: BrainAction[],
): Promise<string> {
  if (!actions || actions.length === 0) {
    return "Não consegui definir ações para esse preset.";
  }
  const key = name.trim().toLowerCase();
  savePreset(key, { description, icon, actions });
  return `Preset "${description}" criado! Diga "ativa o modo ${key}" para usar.`;
}
