import { addFact, listFacts, removeFactByText } from "../services/memoryStore";
import {
  cancelReminderByText, createReminder, listPending, Reminder,
} from "../services/scheduler";
import { ajustarPeloTexto, interpretarQuando, planejarLembretes } from "../services/planoDeLembrete";
import { pedidoAtual } from "../services/contextoComando";
import { criarTarefa, desvincularLembrete } from "../services/tarefas";

// ── memória ───────────────────────────────────────────────────────────────────

export function remember(fact: string): string {
  const { fact: saved, created } = addFact(fact);
  return created ? `Guardei: ${saved.text}.` : "Isso eu já sabia.";
}

export function forget(query: string): string {
  const removed = removeFactByText(query);
  return removed ? `Esqueci: ${removed.text}.` : "Não achei nada assim na memória.";
}

export function listMemory(): string {
  const facts = listFacts();
  if (facts.length === 0) return "Ainda não guardei nada sobre você.";
  return `Eu lembro de: ${facts.map(f => f.text).join("; ")}.`;
}

// ── lembretes ─────────────────────────────────────────────────────────────────

/**
 * Converte o ISO devolvido pelo cérebro em epoch.
 *
 * O modelo manda hora local sem fuso ("2026-08-02T15:00:00"); o `Date` do Node
 * interpreta isso como local, que é o que queremos. Se vier com Z ou offset, também
 * funciona.
 */
function parseDueAt(iso: string): number {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) throw new Error(`data inválida: ${iso}`);
  return ms;
}

/** "hoje às 16h", "amanhã às 8h", "sábado às 10h", "25/12 às 16h" — como se fala (fase 17). */
function formatWhen(dueAt: number): string {
  const d = new Date(dueAt);
  const hoje = new Date();
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const diaD = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((diaD - base) / 86_400_000);
  const hora = d.getMinutes() ? `${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}` : `${d.getHours()}h`;
  if (dias === 0) return `hoje às ${hora}`;
  if (dias === 1) return `amanhã às ${hora}`;
  if (dias > 1 && dias < 7) return `${d.toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "")} às ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hora}`;
}

/**
 * Fase 17 (08/10): sem hora dita, 16h; compromisso (prova, consulta…) ganha aviso na
 * véspera às 16h; e o lembrete entra na lista de tarefas do Hoje — concluir lá cancela os
 * avisos que faltam. Ver `planoDeLembrete.ts` e `tarefas.ts`.
 */
export function createReminderAction(text: string, dueAt: string, weekly?: boolean, semHora?: boolean): string {
  // O dia e a hora que o Zak FALOU valem mais que a conta do modelo (fase 17).
  const pedido = pedidoAtual();
  const ajuste = pedido && !weekly ? ajustarPeloTexto(pedido, dueAt ?? "") : null;
  if (ajuste) { dueAt = ajuste.quando; semHora = ajuste.semHora; }
  const quando = interpretarQuando(dueAt ?? "", semHora);
  if (!quando) return "Não entendi para quando é o lembrete.";
  const avisos = planejarLembretes(text.trim(), quando, Date.now(), weekly);
  // Um lembrete no passado quase sempre é erro de cálculo do modelo, não pedido real.
  // Disparar na hora seria pior que avisar que não deu certo.
  if (!avisos.length || (!weekly && avisos.every(a => a.em <= Date.now()))) {
    return "Esse horário já passou. Pode repetir dizendo quando?";
  }
  const criados = avisos.map(a => createReminder({
    text: a.texto,
    dueAt: a.em,
    kind: weekly ? "weekly" : "once",
    weekday: weekly ? new Date(a.em).getDay() : undefined,
  }));
  if (weekly) return `Combinado, toda semana ${formatWhen(criados[0].dueAt)}: ${criados[0].text}.`;
  const principal = avisos.find(a => !a.vespera) ?? avisos[avisos.length - 1];
  try {
    criarTarefa({ texto: text.trim(), prazo: principal.em, lembreteIds: criados.map(r => r.id), origem: "lembrete" });
  } catch { /* a lista é um extra: o aviso já está agendado */ }
  const vespera = avisos.find(a => a.vespera);
  return vespera
    ? `Combinado: te lembro na véspera, ${formatWhen(vespera.em)}, e no dia, ${formatWhen(principal.em)} — ${text.trim()}.`
    : `Combinado, te aviso ${formatWhen(principal.em)}: ${text.trim()}.`;
}

export function listRemindersAction(): string {
  const pending = listPending();
  if (pending.length === 0) return "Você não tem nenhum lembrete agendado.";
  const list = pending
    .map((r: Reminder) => `${r.text} ${r.kind === "weekly" ? "toda semana " : ""}${formatWhen(r.dueAt)}`)
    .join("; ");
  return `Seus lembretes: ${list}.`;
}

export function cancelReminderAction(query: string): string {
  const removed = cancelReminderByText(query);
  if (removed) desvincularLembrete(removed.id);
  return removed ? `Cancelei o lembrete: ${removed.text}.` : "Não achei esse lembrete.";
}
