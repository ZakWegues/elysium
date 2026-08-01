import Store from "electron-store";
import * as crypto from "node:crypto";

/**
 * Lembretes, timers e alarmes.
 *
 * Persistidos em disco e re-armados no boot: um lembrete que só existisse em memória
 * morreria junto com o app, e o app é reiniciado toda vez que o PC liga.
 *
 * Só o próximo disparo fica agendado por vez, com um `setTimeout` único. Agendar
 * todos de uma vez encheria o processo de timers e ainda assim não sobreviveria a um
 * reinício — o estado de verdade é a lista em disco.
 */

export type ReminderKind = "once" | "weekly";

export interface Reminder {
  id: string;
  text: string;
  /** Instante do próximo disparo, em epoch ms. */
  dueAt: number;
  kind: ReminderKind;
  /** Só para `weekly`: 0 = domingo … 6 = sábado. */
  weekday?: number;
  createdAt: number;
  /** Preenchido quando um `once` já disparou; mantido para histórico curto. */
  firedAt?: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Quantos lembretes já disparados manter antes de podar. */
const MAX_FIRED_KEPT = 20;
/**
 * `setTimeout` satura acima de ~24,8 dias (limite de 32 bits). Para prazos maiores,
 * dormimos em etapas e reavaliamos.
 */
const MAX_TIMEOUT_MS = 2_000_000_000;

const store = new Store<{ reminders: Reminder[] }>({
  name: "reminders",
  defaults: { reminders: [] },
});

type FireHandler = (reminder: Reminder) => void;

let timer: NodeJS.Timeout | null = null;
let onFire: FireHandler | null = null;

function all(): Reminder[] {
  return store.get("reminders");
}

function save(list: Reminder[]): void {
  store.set("reminders", list);
}

/** Pendentes, do mais próximo para o mais distante. */
export function listPending(): Reminder[] {
  return all()
    .filter(r => !r.firedAt)
    .sort((a, b) => a.dueAt - b.dueAt);
}

export function listAll(): Reminder[] {
  return all().sort((a, b) => a.dueAt - b.dueAt);
}

export function createReminder(input: {
  text: string;
  dueAt: number;
  kind?: ReminderKind;
  weekday?: number;
}): Reminder {
  const text = input.text.trim();
  if (!text) throw new Error("lembrete sem texto");
  if (!Number.isFinite(input.dueAt)) throw new Error("data inválida");

  const reminder: Reminder = {
    id: crypto.randomBytes(8).toString("hex"),
    text,
    dueAt: input.dueAt,
    kind: input.kind ?? "once",
    weekday: input.weekday,
    createdAt: Date.now(),
  };

  save([...all(), reminder]);
  rearm();
  return reminder;
}

export function cancelReminder(id: string): boolean {
  const list = all();
  const next = list.filter(r => r.id !== id);
  if (next.length === list.length) return false;
  save(next);
  rearm();
  return true;
}

/** Cancela pelo texto — é assim que o comando de voz chega. */
export function cancelReminderByText(query: string): Reminder | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const hit = listPending().find(r => {
    const t = r.text.toLowerCase();
    return t.includes(q) || q.includes(t);
  });
  if (!hit) return null;

  cancelReminder(hit.id);
  return hit;
}

/**
 * Dispara o que já venceu e reagenda o próximo.
 *
 * Lembretes vencidos enquanto o PC estava desligado disparam na volta, de propósito:
 * é melhor avisar atrasado do que engolir em silêncio.
 */
function processDue(): void {
  const now = Date.now();
  const list = all();
  let changed = false;

  for (const reminder of list) {
    if (reminder.firedAt || reminder.dueAt > now) continue;

    try {
      onFire?.(reminder);
    } catch (e) {
      console.error("[scheduler] handler de disparo falhou:", e);
    }

    if (reminder.kind === "weekly") {
      // Avança em semanas até passar do agora — cobre o caso de o PC ter ficado
      // dias desligado, sem disparar uma vez por semana perdida.
      let next = reminder.dueAt;
      while (next <= now) next += WEEK_MS;
      reminder.dueAt = next;
    } else {
      reminder.firedAt = now;
    }
    changed = true;
  }

  if (changed) {
    const fired = list.filter(r => r.firedAt).sort((a, b) => b.firedAt! - a.firedAt!);
    const keep = new Set(fired.slice(0, MAX_FIRED_KEPT).map(r => r.id));
    save(list.filter(r => !r.firedAt || keep.has(r.id)));
  }
}

function rearm(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  const next = listPending()[0];
  if (!next) return;

  const delay = Math.max(0, next.dueAt - Date.now());
  timer = setTimeout(() => {
    processDue();
    rearm();
  }, Math.min(delay, MAX_TIMEOUT_MS));
}

/**
 * Liga o agendador. Chamado uma vez no boot, depois que TTS e notificações já
 * existem — o handler é chamado imediatamente para o que venceu offline.
 */
export function startScheduler(handler: FireHandler): void {
  onFire = handler;
  processDue();
  rearm();
}

export function stopScheduler(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  onFire = null;
}
