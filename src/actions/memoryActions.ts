import { addFact, listFacts, removeFactByText } from "../services/memoryStore";
import {
  cancelReminderByText, createReminder, listPending, Reminder,
} from "../services/scheduler";
import { interpretarQuando, planejarLembretes } from "../services/planoDeLembrete";
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

function formatWhen(dueAt: number): string {
  const d = new Date(dueAt);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return mesmoDia ? `hoje às ${hora}` : `${d.toLocaleDateString("pt-BR")} às ${hora}`;
}

/**
 * Fase 17 (08/10): sem hora dita, 16h; compromisso (prova, consulta…) ganha aviso na
 * véspera às 16h; e o lembrete entra na lista de tarefas do Hoje — concluir lá cancela os
 * avisos que faltam. Ver `planoDeLembrete.ts` e `tarefas.ts`.
 */
export function createReminderAction(text: string, dueAt: string, weekly?: boolean, semHora?: boolean): string {
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
