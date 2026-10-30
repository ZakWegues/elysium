import Store from "electron-store";
import type { BrainAction } from "./brain";

/**
 * "O que a Ely fez hoje" (31/10): as ações que mudaram algo (abrir, fechar, volume, lembrete,
 * memória, lista…), com a hora — a linha do tempo do Hoje no PC e no celular. Consultas (clima,
 * listar, buscar na web, conversa) ficam de fora: não fizeram nada. Guarda 7 dias, no máximo 300.
 */

export interface ItemDeAtividade { em: number; texto: string }

const store = new Store<{ itens: ItemDeAtividade[] }>({ name: "atividade", defaults: { itens: [] } });

const MAXIMO = 300;
const SETE_DIAS = 7 * 86_400_000;

/** Só consultam ou conversam — não entram na linha do tempo. */
const SO_CONSULTA = new Set<BrainAction["action"]>([
  "chat", "unknown", "system_info", "weather", "daily_summary", "list_show", "list_reminders", "list_memory",
  "list_presets", "timer_list", "world_time", "calculate", "grade_needed", "web_search", "look_at_screen",
  "clipboard_read", "about_this",
]);

export function contaComoAtividade(a: BrainAction): boolean {
  return !SO_CONSULTA.has(a.action);
}

export function registrarAtividade(texto: string, agora = Date.now()): void {
  const t = texto.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!t) return;
  const itens = store.get("itens").filter(i => agora - i.em < SETE_DIAS);
  itens.push({ em: agora, texto: t });
  store.set("itens", itens.slice(-MAXIMO));
}

/** As de hoje, da mais nova para a mais velha. */
export function atividadeDeHoje(agora = new Date(), limite = 40): ItemDeAtividade[] {
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  return store.get("itens").filter(i => i.em >= inicio && i.em <= agora.getTime()).reverse().slice(0, limite);
}

/** Só para os testes. */
export function zerarAtividade(): void { store.set("itens", []); }
