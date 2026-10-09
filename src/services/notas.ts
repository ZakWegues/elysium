import { semAcento } from "./texto";
import { formatarNumero } from "./calculadora";

/**
 * "Quanto preciso tirar?" (fase 20, bloco 211) — média escolar sem modelo.
 *
 * "Tirei 6 e 7, a média é 6, quanto preciso na terceira?" é conta de média ponderada que o
 * modelo erra (soma os pesos errado, esquece que a média é 6 e não 7). Aqui é conta exata, e
 * a fala diz o caso que importa: já passou, dá para passar com X, ou não dá mais pela média.
 */

export interface EntradaNota {
  notas: number[];
  /** Mesmo tamanho de `notas`; ausente = peso 1 em todas. */
  pesos?: number[];
  media: number;
  /** Peso de cada prova que falta (padrão 1). */
  pesoFaltante?: number;
  /** Quantas provas faltam (padrão 1; todas com a mesma nota). */
  faltam?: number;
}

export interface ResultadoNota { necessaria: number; escala: number; mediaSeZero: number }

/** A nota que falta. Pura. `null` se a entrada não fecha (sem média, peso zero). */
export function notaNecessaria(e: EntradaNota): ResultadoNota | null {
  const pesos = e.notas.map((_, i) => (e.pesos?.[i] && e.pesos[i] > 0 ? e.pesos[i] : 1));
  const pf = e.pesoFaltante && e.pesoFaltante > 0 ? e.pesoFaltante : 1;
  const faltam = e.faltam && e.faltam > 0 ? Math.min(10, Math.round(e.faltam)) : 1;
  if (!Number.isFinite(e.media) || e.media <= 0) return null;
  const somaPesos = pesos.reduce((a, b) => a + b, 0) + pf * faltam;
  const feito = e.notas.reduce((acc, n, i) => acc + n * pesos[i], 0);
  const escala = Math.max(e.media, ...e.notas) > 10 ? 100 : 10;
  // Arredonda para CIMA em décimos: 5,93 vira 6,0 — com 5,9 ele ficaria abaixo da média.
  const necessaria = Math.ceil(((e.media * somaPesos - feito) / (pf * faltam)) * 10 - 1e-9) / 10;
  return { necessaria, escala, mediaSeZero: feito / somaPesos };
}

/** A fala. Pura. */
export function falaDaNota(r: ResultadoNota, e: EntradaNota): string {
  const n = formatarNumero(r.necessaria);
  const media = formatarNumero(e.media);
  const qual = (e.faltam ?? 1) > 1 ? `em cada uma das ${e.faltam} que faltam` : "na próxima";
  if (r.necessaria <= 0) return `Você já fechou a média: mesmo com zero ${qual}, fica com ${formatarNumero(Math.floor(r.mediaSeZero * 10) / 10)}.`;
  if (r.necessaria > r.escala) return `Pela média não dá mais: precisaria de ${n} ${qual}, acima de ${r.escala}. Vale ver a recuperação.`;
  return `Você precisa de ${n} ${qual} para fechar com ${media}.`;
}

const NUM = /\d+(?:[.,]\d+)?/g;
const MEDIA_ANTES = /(?:media|fechar com|passar com|ficar com|fechar a media com)(?:\s+(?:final|minima|para passar|pra passar|da escola))?(?:\s+(?:e|eh|de|tem que ser|precisa ser|e de))?\s*$/;
const FALTANTE_ANTES = /\b(?:na|da|a|pra|para)\s+(?:ultima|proxima|que falta|terceira|quarta|segunda|quinta|outra|prova|final|recuperacao)\b[^\d]*peso\s*$/;

/** "tirei 6 e 7 (peso 2), média 6, quanto preciso na última de peso 3?" Pura. */
export function pedidoDeMediaEscolar(texto: string): EntradaNota | null {
  const t = semAcento(String(texto ?? "")).toLowerCase();
  // O gatilho é largo ("quanto preciso na terceira"), mas sem média E notas ditas nada casa.
  if (!/\b(?:quanto (?:eu )?(?:preciso|tenho que|devo)\b|que nota (?:eu )?(?:preciso|tenho que tirar)|nota (?:minima|necessaria) (?:pra|para|na))/.test(t)) return null;
  const notas: number[] = [];
  const pesos: (number | undefined)[] = [];
  let media: number | undefined;
  let pesoFaltante: number | undefined;
  let faltam: number | undefined;
  for (const m of t.matchAll(NUM)) {
    const v = Number(m[0].replace(",", "."));
    const antes = t.slice(Math.max(0, m.index! - 40), m.index);
    const depois = t.slice(m.index! + m[0].length, m.index! + m[0].length + 12);
    if (MEDIA_ANTES.test(antes)) { media = v; continue; }
    if (/peso\s*$/.test(antes)) {
      if (FALTANTE_ANTES.test(antes) || !notas.length) pesoFaltante = v;
      else pesos[notas.length - 1] = v;
      continue;
    }
    if (/\bfalta(?:m)?\s*$/.test(antes) && /^\s*provas?\b/.test(depois)) { faltam = v; continue; }
    if (/^\s*(?:a|ª|o|º)?\s*(?:prova|bimestre|trimestre|unidade)/.test(depois) && v <= 6 && Number.isInteger(v)) continue; // "na 3ª prova"
    notas.push(v);
  }
  if (/\b(?:nas|as) (?:duas|2) (?:ultimas|proximas|que faltam)\b/.test(t)) faltam = 2;
  if (/\b(?:nas|as) (?:tres|3) (?:ultimas|proximas|que faltam)\b/.test(t)) faltam = 3;
  if (media === undefined || !notas.length) return null;
  return {
    notas,
    ...(pesos.some(p => p !== undefined) ? { pesos: notas.map((_, i) => pesos[i] ?? 1) } : {}),
    media,
    ...(pesoFaltante !== undefined ? { pesoFaltante } : {}),
    ...(faltam !== undefined ? { faltam } : {}),
  };
}
