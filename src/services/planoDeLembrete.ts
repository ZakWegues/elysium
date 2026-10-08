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
const TAREFA_DE_VERBO = /^\s*(ligar|marcar|agendar|desmarcar|remarcar|mandar|enviar|pagar|comprar|ver|olhar|confirmar|pesquisar|reservar)\b/i;

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
const NOMES_DIAS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

/**
 * O dia da semana só vale como DATA com contexto (08/10): "segunda prova", "quinta série",
 * "terça parte" e "sexta aula" viravam segunda, quinta, terça e sexta-feira. Conta como data:
 * "-feira"; uma preposição antes ("na sexta", "até quarta", "próxima segunda", "toda terça");
 * ou o dia no fim da frase / seguido de hora, período ou "que vem" ("prova sexta", "sexta 14h",
 * "sexta de manhã", "sexta que vem").
 */
function diasDaSemanaNoTexto(t: string): number[] {
  const achados: number[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const n = NOMES_DIAS[dow];
    const comFeira = new RegExp(`\\b${n}[- ]feira\\b`);
    const comPreposicao = new RegExp(`\\b(?:na|no|nesta|neste|nessa|nesse|esta|este|essa|esse|proxima|proximo|ate|toda|todo|de|para|pra|pro|a partir de)\\s+${n}\\b`);
    const noFimOuAntesDeHora = new RegExp(`\\b${n}\\b(?=\\s*$|\\s*[,.;!?]|\\s+(?:as|a|de|da|pela|que vem|\\d))`);
    if (comFeira.test(t) || comPreposicao.test(t) || noFimOuAntesDeHora.test(t)) achados.push(dow);
  }
  return achados;
}
function diaDaSemanaNoTexto(t: string): number | null {
  return diasDaSemanaNoTexto(t)[0] ?? null;
}

/** Dia N no mês de `base`; se não existir (31 de abril) ou já passou, o mês seguinte. Null se nunca existe. */
function diaNoMes(base: Date, n: number): Date | null {
  if (n < 1 || n > 31) return null;
  for (let k = 0; k < 3; k++) {
    const d = new Date(base.getFullYear(), base.getMonth() + k, n);
    // "dia 31" num mês de 30 dias virava dia 1 do mês seguinte, calado (08/10).
    if (d.getDate() === n && d >= base) return d;
  }
  return null;
}

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
  if (dia) return diaNoMes(base, Number(dia[1]));
  const dow = diaDaSemanaNoTexto(t);
  if (dow !== null) {
    // A próxima ocorrência DEPOIS de hoje: "sexta" dito numa sexta é a da semana que vem.
    const n = ((dow - base.getDay() + 7) % 7) || 7;
    return mais(n);
  }
  if (/\bhoje\b|\bhj\b|\bmais tarde\b|\bhoje a noite\b/.test(t)) return base;
  return null;
}

/**
 * A hora dita ("às 15h", "15:30", "3 da tarde", "meio-dia"), ou null. Pura.
 * `ambigua`: "às 3", sem período nem minutos nem "h" — pode ser 3h ou 15h (08/10: virava
 * sempre 03:00, e o lembrete "já tinha passado"). Quem chama decide com o resto do contexto.
 */
export function horaDoTexto(texto: string): { h: number; m: number; ambigua?: boolean } | null {
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
  // "12 da noite" é meia-noite, não meio-dia (08/10).
  if (periodo === "noite" && h === 12) h = 0;
  else if ((periodo === "tarde" || periodo === "noite") && h < 12) h += 12;
  if (h > 23 || min > 59) return null;
  // Ambígua: 1 a 11 sem período, sem minutos e sem "h"/"horas" depois ("às 3", mas não "às 3h").
  const comUnidade = /^\d{1,2}(?:[:h]\d{2}|\s*h(?:oras?)?\b)/.test(m[0].replace(/^(?:as|a partir das|ate as)\s+/, ""));
  const ambigua = !periodo && !comUnidade && h >= 1 && h <= 11 && !min;
  return ambigua ? { h, m: min, ambigua: true } : { h, m: min };
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
  const outrosDias = new Set(t.replace(/depois de amanha/g, "DEPOIS").match(/\b(DEPOIS|amanha|hoje|dia \d{1,2}|\d{1,2}\/\d{1,2})\b/g) ?? []);
  if (outrosDias.size + diasDaSemanaNoTexto(t).length > 1) return null;
  const dia = diaDoTexto(pedido, agora);
  const hora = horaDoTexto(pedido);
  if (!dia && !hora) return null;
  const doModelo = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}))?/.exec(quandoDoModelo.trim());
  const d = dia ?? (doModelo ? new Date(Number(doModelo[1]), Number(doModelo[2]) - 1, Number(doModelo[3])) : new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()));
  const p = (n: number) => String(n).padStart(2, "0");
  const data = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  if (!hora) return { quando: data, semHora: true };
  const h = hora.ambigua ? resolverAmbigua(hora.h, hora.m, d, doModelo?.[4] !== undefined ? Number(doModelo[4]) : null, agora) : hora.h;
  return { quando: `${data}T${p(h)}:${p(hora.m)}`, semHora: false };
}

/**
 * "às 3": 3h ou 15h? Se o modelo escolheu a da tarde, fica a dele (ele viu a frase inteira) —
 * repetir o "3" literal não prova nada, era exatamente o bug. Senão: de 1 a 6 é tarde (ninguém
 * marca lembrete às 4 da manhã sem dizer "da manhã"); de 7 a 11 é manhã — a não ser que seja
 * hoje e a manhã já tenha passado. Pura.
 */
export function resolverAmbigua(h: number, m: number, dia: Date, horaDoModelo: number | null, agora = new Date()): number {
  if (horaDoModelo === h + 12) return horaDoModelo;
  if (h <= 6) return h + 12;
  const manha = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h, m).getTime();
  return manha <= agora.getTime() ? h + 12 : h;
}

// ── "prova de física sexta 14h" → texto + quando (fase 18) ───────────────────────────────

const DIA_FALADO = /\s*\b(?:(?:na|no|nesta|neste|nessa|nesse|esta|este|essa|esse|proxima|proximo|ate|de|para|pra|pro)\s+)?(?:depois de amanha|amanha|hoje|hj|domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[- ]feira)?(?:\s+que vem)?\b/i;
const DATA_FALADA = /\s*\b(?:(?:no|para|pra|ate)\s+)?(?:dia\s+\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;
const HORA_FALADA = /\s*\b(?:(?:as|a partir das|ate as)\s+\d{1,2}(?:[:h]\d{2})?(?:\s*h(?:oras?)?)?|\d{1,2}(?::\d{2}|h\d{0,2}))(?:\s+da\s+(?:manha|tarde|noite))?\b|\s*\b(?:de|pela|a)\s+(?:manha|tarde|noite)\b|\s*\b(?:ao\s+)?meio[- ]dia\b|\s*\bmeia[- ]noite\b/i;

/**
 * Tira do texto da tarefa as palavras de data e hora que viraram prazo: "prova de física sexta
 * às 14h" → "Prova de física". Trabalha sobre a versão sem acento para achar as posições e corta
 * o original nas mesmas posições (normalizar não muda o comprimento do texto em pt-BR). Pura.
 */
export function limparDataDoTexto(texto: string): string {
  let original = texto.normalize("NFC");
  for (const re of [HORA_FALADA, DATA_FALADA, DIA_FALADO, HORA_FALADA]) {
    const alvo = sem(original);
    const m = re.exec(alvo);
    if (!m) continue;
    // Dia da semana sem contexto ("segunda prova") não é data: não corta.
    if (re === DIA_FALADO && !/hoje|hj|amanha/.test(m[0]) && !diasDaSemanaNoTexto(alvo).length) continue;
    original = (original.slice(0, m.index) + " " + original.slice(m.index + m[0].length)).replace(/\s+/g, " ");
  }
  const limpo = original.replace(/\s+([,.;!?])/g, "$1").replace(/[\s,;-]+$/g, "").replace(/^\s*(?:de|que|tenho|tem)\s+(?=\S)/i, (x) => /tenho|tem/i.test(x) ? "" : x).trim();
  return limpo ? limpo.charAt(0).toUpperCase() + limpo.slice(1) : texto.trim();
}

/**
 * Uma tarefa escrita do jeito que se fala, para o "quick add" (Todoist): o texto limpo e,
 * se houver data ou hora nele, o `quando` no formato do `interpretarQuando`. Pura.
 */
export function interpretarTexto(texto: string, agora = new Date()): { texto: string; quando: string | null; semHora: boolean } {
  const t = sem(texto);
  const dia = diaDoTexto(texto, agora);
  const hora = horaDoTexto(texto);
  if (!dia && !hora) return { texto: texto.trim(), quando: null, semHora: false };
  const outrosDias = new Set(t.match(/\b(amanha|hoje|dia \d{1,2}|\d{1,2}\/\d{1,2})\b/g) ?? []);
  if (outrosDias.size + diasDaSemanaNoTexto(t).length > 1) return { texto: texto.trim(), quando: null, semHora: false };
  const d = dia ?? new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const p = (n: number) => String(n).padStart(2, "0");
  const data = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const limpo = limparDataDoTexto(texto);
  if (!hora) return { texto: limpo, quando: data, semHora: true };
  const h = hora.ambigua ? resolverAmbigua(hora.h, hora.m, d, null, agora) : hora.h;
  // Só hora, sem dia, e ela já passou hoje: é amanhã ("lembra de ligar às 9" dito às 10).
  let dataFinal = data;
  if (!dia && new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, hora.m).getTime() <= agora.getTime()) {
    const am = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    dataFinal = `${am.getFullYear()}-${p(am.getMonth() + 1)}-${p(am.getDate())}`;
  }
  return { texto: limpo, quando: `${dataFinal}T${p(h)}:${p(hora.m)}`, semHora: false };
}

export type Adiamento = "1h" | "hoje16" | "amanha" | "semana";

/**
 * Para onde vai uma tarefa adiada (fase 18, o "soneca" do Todoist). Pura.
 *  - "1h": daqui a uma hora, arredondada para o próximo quarto de hora;
 *  - "hoje16": hoje às 16h (se já passou, amanhã às 16h);
 *  - "amanha": amanhã, na mesma hora que tinha (sem hora: dia todo);
 *  - "semana": daqui a 7 dias, mesma hora (sem hora: dia todo).
 */
export function adiarPara(prazo: number | undefined, semHora: boolean, para: Adiamento, agora = new Date()): { quando: string; semHora: boolean } {
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date, comHora: boolean) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${comHora ? `T${p(d.getHours())}:${p(d.getMinutes())}` : ""}`;
  if (para === "1h") {
    const d = new Date(agora.getTime() + 60 * 60_000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return { quando: iso(d, true), semHora: false };
  }
  if (para === "hoje16") {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), HORA_PADRAO, 0);
    if (d.getTime() <= agora.getTime()) d.setDate(d.getDate() + 1);
    return { quando: iso(d, true), semHora: false };
  }
  const base = prazo !== undefined && prazo > agora.getTime() && para === "semana" ? new Date(prazo) : new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const hora = prazo !== undefined && !semHora ? new Date(prazo) : null;
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (para === "amanha" ? 1 : 7), hora ? hora.getHours() : HORA_PADRAO, hora ? hora.getMinutes() : 0);
  return hora ? { quando: iso(d, true), semHora: false } : { quando: iso(d, false), semHora: true };
}
