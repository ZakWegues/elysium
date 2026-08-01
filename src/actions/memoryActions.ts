import { addFact, listFacts, removeFactByText } from "../services/memoryStore";
import {
  cancelReminderByText, createReminder, listPending, Reminder,
} from "../services/scheduler";

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

export function createReminderAction(text: string, dueAt: string, weekly?: boolean): string {
  let ms: number;
  try {
    ms = parseDueAt(dueAt);
  } catch {
    return "Não entendi para quando é o lembrete.";
  }

  // Um lembrete no passado quase sempre é erro de cálculo do modelo, não pedido real.
  // Disparar na hora seria pior que avisar que não deu certo.
  if (ms <= Date.now() && !weekly) {
    return "Esse horário já passou. Pode repetir dizendo quando?";
  }

  const reminder = createReminder({
    text,
    dueAt: ms,
    kind: weekly ? "weekly" : "once",
    weekday: weekly ? new Date(ms).getDay() : undefined,
  });

  return weekly
    ? `Combinado, toda semana ${formatWhen(reminder.dueAt)}: ${reminder.text}.`
    : `Combinado, te aviso ${formatWhen(reminder.dueAt)}: ${reminder.text}.`;
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
  return removed ? `Cancelei o lembrete: ${removed.text}.` : "Não achei esse lembrete.";
}
