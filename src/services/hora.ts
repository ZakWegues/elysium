/**
 * Data e hora no horário LOCAL (fase 20, bloco 202). Puro.
 *
 * O `YYYY-MM-DDTHH:MM` local era montado à mão em uns dez lugares (`padStart(2, "0")` em
 * série) — e `toISOString()` não serve: é UTC, e às 22h em São Paulo vira o dia seguinte.
 */
const p2 = (n: number) => String(n).padStart(2, "0");

/** "2026-10-09" (dia local). */
export function diaLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** "2026-10-09T14:05" (minuto local) — o formato que o `interpretarQuando` entende. */
export function isoLocal(d: Date = new Date()): string {
  return `${diaLocal(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** "14:05". */
export function hhmm(d: Date = new Date()): string {
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
