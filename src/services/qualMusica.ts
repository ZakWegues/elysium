import { semAcento } from "./texto";

/**
 * Qual música ele quer (23/11). "Toca a que você achar mais parecida" e "toca ela" iam ao pé da
 * letra para a busca do Spotify, que sempre devolve alguma coisa — e tocava qualquer música. Aqui
 * ficam as contas puras: se o que voltou combina com o pedido, se o pedido é um nome ou aponta para
 * a conversa, e qual item da última lista ele escolheu.
 */

const LIGACAO = new Set(["a", "o", "as", "os", "de", "do", "da", "dos", "das", "e", "the", "feat", "ft", "com", "musica", "som", "faixa", "cancao", "banda", "no", "na"]);

/** As palavras que contam, sem acento nem pontuação. Pura. */
export function palavras(texto: string): string[] {
  const todas = semAcento(texto).replace(/['’]/g, "").replace(/[^a-z0-9Ѐ-￿]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const fortes = todas.filter((p) => !LIGACAO.has(p));
  return fortes.length ? fortes : todas;
}

function distancia(a: string, b: string): number {
  let antes = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const linha = [i];
    for (let j = 1; j <= b.length; j++) linha[j] = Math.min(antes[j] + 1, linha[j - 1] + 1, antes[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    antes = linha;
  }
  return antes[b.length];
}
/** A transcrição erra letras: uma em palavra média, duas em palavra longa. */
export function igual(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  return n >= 4 && distancia(a, b) <= (n >= 7 ? 2 : 1);
}

/**
 * Quanto a faixa combina com a busca, de 0 a 1. As palavras que são do artista saem da conta; o
 * resto tem de estar no título — só o artista bater não basta. Pura.
 */
export function combina(busca: string, faixa: { track: string; artist: string }): number {
  const ws = palavras(busca);
  if (!ws.length) return 0;
  const titulo = palavras(faixa.track.replace(/\s+-\s+.*$|\([^)]*\)|\[[^\]]*\]/g, "")), tituloInteiro = palavras(faixa.track), artista = palavras(faixa.artist);
  const noTitulo = (p: string) => tituloInteiro.some((t) => igual(p, t));
  const conta = (resto: string[]) => {
    const achadas = resto.filter(noTitulo).length / resto.length;
    const preciso = titulo.length ? titulo.filter((t) => resto.some((p) => igual(p, t))).length / titulo.length : 0;
    return achadas * 0.8 + preciso * 0.2;
  };
  const resto = ws.filter((p) => !artista.some((t) => igual(p, t)));
  // Só o nome do artista ("toca Portishead") ou o título igual ao artista.
  if (!resto.length) return Math.max(0.9, conta(ws));
  return Math.max(conta(resto), conta(ws));
}
export const COMBINA_MINIMO = 0.5;

/** A que melhor combina com a busca, ou null se nenhuma combina. Pura. */
export function melhorFaixa<T extends { track: string; artist: string }>(busca: string, faixas: T[]): T | null {
  let melhor: T | null = null, nota = COMBINA_MINIMO;
  for (const f of faixas) {
    const n = combina(busca, f);
    // No empate fica a primeira, que é a mais tocada.
    if (n > nota || (n === nota && !melhor)) { melhor = f; nota = n; }
  }
  return melhor;
}

const PRONOME = /^(?:ela|ele|elas|eles|essa|esse|essas|esses|esta|este|estas|estes|isso|isto|aquela|aquele|aquelas|aqueles|dessas?|desses?|todas?|todos?|tudo|outra|outro|alguma|algum|qualquer|algo|uma dessas|uma delas|uma)(?:\s+(?:que|ai|la|ali|agora|de novo|mesmo|mesma|musicas?|sons?|faixas?|uma|coisa|da lista|dessas?|delas|primeiro|por favor))*$/;
const DESCRICAO = /^(?:a|o|as|os)\s+(?:que|mais|melhor|primeir|segund|terceir|quart[ao]|quint[ao]|sext[ao]|setim|oitav|non[ao]|decim|ultim|penultim|outr|dois|duas|tres|quatro|cinco|seis|lista|numero|musicas?$)|\b(?:parecid|semelhante|recomend|sugeri|que voce|da lista|dessa lista|que (?:eu )?(?:te )?(?:falei|disse|pedi)|que eu (?:gosto|curto)|mesma (?:vibe|pegada|linha)|em ingles)|^(?:alguma coisa|qualquer|algo|umas? musicas?|musicas? (?:que|tipo|do tipo|de|no estilo))\b/;

/** O pedido aponta para a conversa ("ela", "a segunda", "a mais parecida") em vez de dar um nome? Pura. */
export function ehReferencia(busca: string): boolean {
  const t = semAcento(busca).replace(/[.!?,"]+/g, " ").replace(/\s+/g, " ").trim();
  return PRONOME.test(t) || DESCRICAO.test(t);
}

const ORDEM = ["primeir", "segund", "terceir", "quart", "quint", "sext", "setim", "oitav", "non", "decim"];
const NUMERO: Record<string, number> = { dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6 };

/** Quais itens da última lista ele escolheu. null = não dá para saber pela lista. Pura. */
export function escolherDaLista<T extends { titulo: string; artista: string }>(busca: string, itens: T[]): T[] | null {
  if (!itens.length) return null;
  const t = semAcento(busca).replace(/[.!?,"]+/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(?:todas?|todos|tudo|a lista|as musicas|essas|elas|as que voce)\b/.test(t) && !/\bprimeir|ultim/.test(t)) return itens;
  const varias = /\b(\d|dois|duas|tres|quatro|cinco|seis)\s+(primeir|ultim)/.exec(t);
  if (varias) {
    const n = NUMERO[varias[1]] ?? Number(varias[1]);
    return varias[2] === "primeir" ? itens.slice(0, n) : itens.slice(-n);
  }
  if (/\bpenultim/.test(t)) return itens.length > 1 ? [itens[itens.length - 2]] : null;
  if (/\bultim/.test(t)) return [itens[itens.length - 1]];
  const numero = /\b(?:numero|musica)\s+(\d{1,2})\b|^(?:a\s+)?(\d{1,2})$/.exec(t);
  const i = numero ? Number(numero[1] ?? numero[2]) - 1 : ORDEM.findIndex((o) => new RegExp(`\\b${o}[ao]\\b`).test(t));
  if (i >= 0) return itens[i] ? [itens[i]] : null;
  // "a do Audioslave": o artista é da lista.
  const doArtista = !/^(?:a|o|as|os|uma?|alguma?)\s+(?:musica\s+|som\s+)?d[aeo]s?\s/.test(t) ? [] : itens.filter((m) => { const ps = palavras(m.artista); return ps.length > 0 && ps.every((p) => palavras(t).some((x) => igual(x, p))); });
  if (doArtista.length) return [doArtista[0]];
  // A lista já vem da mais parecida para a menos.
  if (/\b(?:mais parecid|melhor|que voce (?:achar|quiser|preferir|escolher)|qualquer|uma d)/.test(t)) return [itens[0]];
  return null;
}

/** "não, nada a ver", "não é essa": ele está corrigindo a música que acabou de tocar. Pura. */
export function corrigeMusica(texto: string): boolean {
  const t = semAcento(texto).trim();
  return t.length < 400 && /^(?:nao\b|nada a ver|errou|errada?\b|ta errad|outra\b|essa nao|nao e ess)/.test(t)
    && /\b(?:music|ess[ae]|outra|falando|falei|disse|quis dizer|pedi|nome|em ingles|banda|toca)/.test(t);
}
export interface MusicaDita { titulo: string; artista: string }

/** O JSON do modelo → músicas aproveitáveis. Pura. */
export function lerMusicas(bruto: string, chave = "musicas", max = 14): (MusicaDita & { porque: string })[] {
  let j: Record<string, unknown>;
  try { j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as Record<string, unknown>; } catch { return []; }
  const lista = j?.[chave];
  if (!Array.isArray(lista)) return [];
  const limpo = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
  const vistas = new Set<string>();
  const saida: (MusicaDita & { porque: string })[] = [];
  for (const x of lista as Record<string, unknown>[]) {
    const m = { titulo: limpo(x?.titulo, 120), artista: limpo(x?.artista, 80), porque: limpo(x?.porque, 90) };
    const k = semAcento(`${m.titulo}|${m.artista}`);
    if (!m.titulo || vistas.has(k)) continue;
    vistas.add(k);
    saida.push(m);
    if (saida.length >= max) break;
  }
  return saida;
}
