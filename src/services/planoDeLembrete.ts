/**
 * Como a Ely transforma "me lembra da prova sexta" em avisos (fase 17, 08/10).
 *
 * O Zak pediu três coisas:
 *  - sem hora dita, o lembrete é às **16h** (antes o modelo chutava meia-noite ou 9h);
 *  - para COMPROMISSO (prova, consulta, entrevista, viagem…), avisar também **na véspera**,
 *    às 16h — dá tempo de se preparar;
 *  - todo lembrete vira item da lista de tarefas (ver `tarefas.ts`).
 *
 * Compromisso sem hora ganha o aviso do próprio dia de manhã (8h): "prova sexta" às 16h de
 * sexta chegaria depois da prova. Tudo puro, para teste.
 */

export const HORA_PADRAO = 16;
const HORA_DO_DIA_DO_EVENTO = 8;

/** O que pede preparo e merece aviso na véspera. */
const COMPROMISSO = /\b(prova|provas|exame|teste|simulado|vestibular|enem|concurso|entrevista|consulta|m[eé]dic[oa]|dentista|exame de sangue|reuni[aã]o|apresenta[cç][aã]o|semin[aá]rio|viagem|voo|embarque|anivers[aá]rio|casamento|formatura|audi[eê]ncia|entrega|prazo|defesa|tcc|trabalho de|trabalho para|show|jogo)\b/i;

export function ehCompromisso(texto: string): boolean {
  return COMPROMISSO.test(texto);
}

/**
 * "2026-10-09" → 09/10 às 16h, sem hora; "2026-10-09T15:00" → com hora (horário local).
 * `semHora` força o padrão mesmo com hora no texto (o modelo às vezes manda T00:00 ou T09:00
 * quando o Zak não disse hora nenhuma). Null = data que não se entende.
 */
export function interpretarQuando(quando: string, semHora = false): { ms: number; temHora: boolean } | null {
  const t = quando.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  if (!m) {
    const ms = new Date(t).getTime();
    return Number.isFinite(ms) ? { ms, temHora: !semHora } : null;
  }
  const [, a, mes, d, h, min] = m;
  const temHora = h !== undefined && !semHora;
  // Construído pelos números, no fuso local: `new Date("2026-10-09")` seria meia-noite UTC
  // (21h da véspera no Brasil).
  const data = new Date(Number(a), Number(mes) - 1, Number(d), temHora ? Number(h) : HORA_PADRAO, temHora ? Number(min) : 0, 0, 0);
  return Number.isFinite(data.getTime()) ? { ms: data.getTime(), temHora } : null;
}

export interface Aviso { texto: string; em: number; vespera?: boolean }

/** Os avisos de um pedido de lembrete, em ordem. Os que já passaram ficam de fora. */
export function planejarLembretes(texto: string, quando: { ms: number; temHora: boolean }, agora = Date.now(), semanal = false): Aviso[] {
  // Semanal repete sozinho (o agendador avança a data): um aviso só, sem véspera.
  if (semanal) return [{ texto, em: quando.ms }];
  const dia = new Date(quando.ms);
  const avisos: Aviso[] = [];
  if (ehCompromisso(texto)) {
    const vespera = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() - 1, HORA_PADRAO, 0, 0, 0).getTime();
    if (vespera > agora) avisos.push({ texto: `Amanhã: ${texto}`, em: vespera, vespera: true });
    const noDia = quando.temHora ? quando.ms : new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), HORA_DO_DIA_DO_EVENTO, 0, 0, 0).getTime();
    if (noDia > agora) avisos.push({ texto, em: noDia });
  } else if (quando.ms > agora) {
    avisos.push({ texto, em: quando.ms });
  }
  return avisos;
}
