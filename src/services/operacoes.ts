import { cancelReminder } from "./scheduler";
import { concluirTarefa, editarTarefaProxima, obterTarefa, type Tarefa } from "./tarefas";
import { adiarPara, type Adiamento } from "./planoDeLembrete";
import { proximaDaRepeticao, reagendarTarefa } from "../actions/memoryActions";
import { acharHabito, avancarMeta, listarHabitos, listarMetas, marcarHabito, resumirHabito, type Meta } from "./habitos";

/**
 * Regras de negócio que tinham duas ou três cópias (fase 20, bloco 202).
 *
 * O RPC (celular e dashboard), as ferramentas do agente e o roteador de voz faziam a mesma
 * coisa cada um do seu jeito — e divergiram: concluir uma tarefa que REPETE pelo celular criava
 * a próxima; pela voz, não. Aqui fica a regra uma vez só, devolvendo DADOS; cada porta só
 * transforma o resultado na resposta dela (JSON no RPC, frase na voz).
 */

export interface Conclusao { tarefa: Tarefa; proxima: Tarefa | null; jaEstava: boolean }

/** Conclui, cancela os avisos que faltavam e, se repete, cria a próxima (uma vez só). */
export function concluirTarefaCompleta(id: string, ressalva?: string): Conclusao | null {
  const r = concluirTarefa(id, ressalva);
  if (!r) return null;
  for (const l of r.lembretes) cancelReminder(l);
  const proxima = r.jaEstava ? null : proximaDaRepeticao(r.tarefa);
  if (proxima) editarTarefaProxima(r.tarefa.id, proxima.id);
  return { tarefa: r.tarefa, proxima, jaEstava: !!r.jaEstava };
}

/** Adia pelo atalho ("1h", "hoje16", "amanha", "semana"). */
export function adiarTarefaPor(id: string, para: Adiamento): { ok: boolean; mensagem: string; tarefa?: Tarefa } {
  const t = obterTarefa(id);
  if (!t) return { ok: false, mensagem: "Não achei essa tarefa." };
  const alvo = adiarPara(t.prazo, !!t.semHora, para);
  return reagendarTarefa(id, alvo.quando, alvo.semHora);
}

export type MarcacaoHabito =
  | { ok: true; nome: string; feito: boolean; sequencia: number }
  | { ok: false; existentes: string[] };

export function marcarHabitoPorNome(nome: string, feito = true): MarcacaoHabito {
  const todos = listarHabitos();
  const h = acharHabito(todos, nome);
  if (!h) return { ok: false, existentes: todos.map(x => x.nome) };
  const novo = marcarHabito(h.id, feito);
  return { ok: true, nome: h.nome, feito, sequencia: novo ? resumirHabito(novo).sequencia : 0 };
}

/** A frase de um hábito marcado — a mesma na voz e no agente. Pura. */
export function falaDoHabito(r: MarcacaoHabito, pedido: string): string {
  if (!r.ok) return r.existentes.length ? `Não achei o hábito ${pedido}. Os cadastrados: ${r.existentes.join(", ")}.` : "Ainda não há hábitos cadastrados — dá para criar na página Hoje.";
  if (!r.feito) return `Desmarquei ${r.nome} de hoje.`;
  return `${r.nome} marcado. Sequência de ${r.sequencia} dia${r.sequencia === 1 ? "" : "s"}.`;
}

export type AvancoMeta = { ok: true; meta: Meta } | { ok: false; existentes: string[] };

export function avancarMetaPorNome(nome: string, quanto: number): AvancoMeta {
  const metas = listarMetas();
  const achada = acharHabito(metas.map(m => ({ ...m, nome: m.titulo })), nome);
  if (!achada) return { ok: false, existentes: metas.map(m => m.titulo) };
  const m = avancarMeta(achada.id, Number.isFinite(quanto) && quanto !== 0 ? quanto : 1);
  return m ? { ok: true, meta: m } : { ok: false, existentes: metas.map(x => x.titulo) };
}

/** A frase de uma meta avançada. Pura. */
export function falaDaMeta(r: AvancoMeta, pedido: string): string {
  if (!r.ok) return r.existentes.length ? `Não achei a meta ${pedido}. As cadastradas: ${r.existentes.join(", ")}.` : "Ainda não há metas cadastradas.";
  const m = r.meta;
  return m.concluidaEm ? `Meta ${m.titulo} concluída: ${m.progresso} de ${m.alvo}.` : `Meta ${m.titulo}: ${m.progresso} de ${m.alvo}${m.unidade ? " " + m.unidade : ""}.`;
}

/** A frase de uma tarefa concluída. Pura. */
export function falaDaConclusao(c: Conclusao): string {
  const ressalva = c.tarefa.ressalva ? `, com a ressalva "${c.tarefa.ressalva}"` : "";
  const prox = c.proxima?.prazo !== undefined ? ` A próxima já está na lista.` : "";
  return `Concluída: ${c.tarefa.texto}${ressalva}.${prox}`;
}
