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

/** Tarefa sobre o compromisso ("ligar pro dentista", "marcar consulta") não é o compromisso. */
const TAREFA_DE_VERBO = /^s*(ligar|marcar|agendar|desmarcar|remarcar|mandar|enviar|pagar|comprar|ver|olhar|confirmar|pesquisar|reservar)/i;

export function ehCompromisso(texto: string): boolean {
  return COMPROMISSO.test(texto) && !TAREFA_DE_VERBO.test(texto);
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

// ── data e hora tiradas da FALA, não da conta do modelo (fase 17) ─────────────────────
//
// Testado ao vivo em 08/10 (quinta): "tenho prova de física sexta" virou dia 13 (terça) e
// "amanhã de pagar a luz" virou meia-noite. O 7B erra conta de calendário; o texto do
// pedido diz o dia e a hora sem ambiguidade, então eles vêm daqui quando estão lá.

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const DIAS_SEMANA: [RegExp, number][] = [
  [/\bdomingo\b/, 0], [/\bsegunda\b/, 1], [/\bterca\b/, 2], [/\bquarta\b/, 3],
  [/\bquinta\b/, 4], [/\bsexta\b/, 5], [/\bsabado\b/, 6],
];

/** O dia dito ("amanhã", "sexta", "dia 12", "12/10"), ou null. Pura. */
export function diaDoTexto(texto: string, agora = new Date()): Date | null {
  const t = sem(texto);
  const base = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const mais = (n: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
  if (/\bdepois de amanha\b/.test(t)) return mais(2);
  if (/\bamanha\b/.test(t)) return mais(1);
  const data = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  if (data) {
    const ano = data[3] ? (data[3].length === 2 ? 2000 + Number(data[3]) : Number(data[3])) : base.getFullYear();
    let d = new Date(ano, Number(data[2]) - 1, Number(data[1]));
    if (!data[3] && d < base) d = new Date(ano + 1, Number(data[2]) - 1, Number(data[1]));
    return d;
  }
  const dia = /\bdia (\d{1,2})\b/.exec(t);
  if (dia) {
    let d = new Date(base.getFullYear(), base.getMonth(), Number(dia[1]));
    if (d < base) d = new Date(base.getFullYear(), base.getMonth() + 1, Number(dia[1]));
    return d;
  }
  for (const [re, dow] of DIAS_SEMANA) {
    if (re.test(t)) {
      // A próxima ocorrência DEPOIS de hoje: "sexta" dito numa sexta é a da semana que vem.
      const n = ((dow - base.getDay() + 7) % 7) || 7;
      return mais(n);
    }
  }
  if (/\bhoje\b|\bhj\b|\bmais tarde\b|\bhoje a noite\b/.test(t)) return base;
  return null;
}

/** A hora dita ("às 15h", "15:30", "3 da tarde", "meio-dia"), ou null. Pura. */
export function horaDoTexto(texto: string): { h: number; m: number } | null {
  const t = sem(texto);
  if (/\bmeio[- ]dia\b/.test(t)) return { h: 12, m: 0 };
  if (/\bmeia[- ]noite\b/.test(t)) return { h: 0, m: 0 };
  const m = /\b(?:as|a partir das|ate as)\s+(\d{1,2})(?:[:h](\d{2}))?(?:\s*(h|horas?))?(?:\s+da\s+(manha|tarde|noite))?/.exec(t)
    ?? /\b(\d{1,2})(?::(\d{2})|h(\d{2})?)(?:\s+da\s+(manha|tarde|noite))?/.exec(t)
    ?? /\b(\d{1,2})\s+da\s+(manha|tarde|noite)\b/.exec(t);
  if (!m) {
    // Só o período, sem número: um horário razoável para ele.
    if (/\b(de|pela) manha\b/.test(t)) return { h: 9, m: 0 };
    if (/\b(a|de|pela) tarde\b/.test(t)) return { h: 15, m: 0 };
    if (/\b(a|de|pela) noite\b/.test(t)) return { h: 20, m: 0 };
    return null;
  }
  let h = Number(m[1]);
  const min = Number(m[2] ?? (m.length > 4 ? m[3] : undefined) ?? 0) || 0;
  const periodo = m.find((x, i) => i > 1 && (x === "manha" || x === "tarde" || x === "noite"));
  if ((periodo === "tarde" || periodo === "noite") && h < 12) h += 12;
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

/**
 * Corrige o `quando` do modelo pelo que o Zak FALOU. "daqui a N minutos" fica com o modelo
 * (é conta de relógio, o PC já calcula). Sem dia no texto, o dia do modelo fica; sem hora
 * no texto, vale a hora padrão (16h). Pura.
 */
export function ajustarPeloTexto(pedido: string, quandoDoModelo: string, agora = new Date()): { quando: string; semHora: boolean } | null {
  const t = sem(pedido);
  if (/\bdaqui a\b|\bem \d+ ?(min|minutos|h|horas)\b/.test(t)) return null;
  // Dois dias no mesmo pedido ("amanhã X e sexta Y"): não dá para saber qual é de qual
  // lembrete — fica a conta do modelo.
  const dias = (t.replace(/depois de amanha/g, "DEPOIS").match(/\b(DEPOIS|amanha|hoje|domingo|segunda|terca|quarta|quinta|sexta|sabado|dia \d{1,2}|\d{1,2}\/\d{1,2})\b/g) ?? []);
  if (new Set(dias).size > 1) return null;
  const dia = diaDoTexto(pedido, agora);
  const hora = horaDoTexto(pedido);
  if (!dia && !hora) return null;
  const doModelo = /^(\d{4})-(\d{2})-(\d{2})/.exec(quandoDoModelo.trim());
  const d = dia ?? (doModelo ? new Date(Number(doModelo[1]), Number(doModelo[2]) - 1, Number(doModelo[3])) : new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()));
  const p = (n: number) => String(n).padStart(2, "0");
  const data = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return hora ? { quando: `${data}T${p(hora.h)}:${p(hora.m)}`, semHora: false } : { quando: data, semHora: true };
}
