/**
 * O "chefe" na medida (19/10). O prompt já pedia "de vez em quando, nunca em toda resposta", e
 * o modelo chamava de chefe em quase toda fala — o Zak achou robótico. Agora quem decide é o
 * código: a cada resposta um sorteio diz se o tratamento pode aparecer (nunca em duas das
 * últimas três), e mesmo quando pode, só na primeira frase. O resto do vocativo some.
 *
 * Só no primeiro período porque a voz fala a resposta frase a frase antes de ela fechar
 * (`falaAntecipada`): a decisão tem que valer igual para cada pedaço e para o texto inteiro.
 */

let historico: boolean[] = [];
let permitidoAgora = false;

/** Sorteia, no começo de cada pedido, se o tratamento pode aparecer na resposta. */
export function decidirVocativo(sorteio: () => number = Math.random): boolean {
  const recente = historico.slice(-2).some(Boolean);
  permitidoAgora = !recente && sorteio() < 0.35;
  historico = [...historico, permitidoAgora].slice(-5);
  return permitidoAgora;
}

export function vocativoPermitido(): boolean {
  return permitidoAgora;
}

/**
 * Para as frases fixas (arranque, modo live): o tratamento pela mesma régua do sorteio, ou "".
 */
export function tratamentoSorteado(tratamento: string, sorteio: () => number = Math.random): string {
  const t = tratamento.trim();
  return t && decidirVocativo(sorteio) ? t : "";
}

/** Só para os testes. */
export function zerarVocativo(): void {
  historico = [];
  permitidoAgora = false;
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Tira o tratamento quando ele é vocativo: "Pronto, chefe." → "Pronto.", "Chefe, achei." →
 * "Achei.", "Certo, chefe, já abri." → "Certo, já abri.". "O chefe do projeto" fica. Pura.
 */
export function tirarVocativo(texto: string, tratamento: string): string {
  const t = tratamento.trim();
  if (!t) return texto;
  const e = escapar(t);
  return texto
    // ", chefe" antes de pontuação ou do fim.
    .replace(new RegExp(`\\s*,\\s*${e}(?=\\s*[.!?…,;:)]|\\s*$)`, "giu"), "")
    // "Chefe, …" no começo de uma frase.
    .replace(new RegExp(`(^|[.!?…]\\s+)${e}\\s*[,!]\\s*(\\p{L})`, "giu"), (_m, antes: string, letra: string) => `${antes}${letra.toUpperCase()}`)
    // "Chefe." sozinho como frase.
    .replace(new RegExp(`(^|[.!?…]\\s+)${e}\\s*[.!]\\s*`, "giu"), "$1")
    .replace(/,\s*([.!?…])/g, "$1")
    .trim();
}

/**
 * Aplica a decisão a um texto: sem permissão, nenhum vocativo; com permissão, só o da primeira
 * frase (`inicio` = este texto começa a resposta). Pura.
 */
export function dosarTratamento(texto: string, tratamento: string, permitido: boolean, inicio = true): string {
  if (!tratamento.trim()) return texto;
  if (!permitido || !inicio) return tirarVocativo(texto, tratamento);
  const m = /^[\s\S]*?[.!?…](?:\s+|$)/.exec(texto);
  const primeira = m ? m[0] : texto;
  const resto = texto.slice(primeira.length);
  return resto ? `${primeira}${tirarVocativo(resto, tratamento)}` : primeira;
}
