/**
 * Texto: as funções que estavam copiadas em ~20 arquivos (fase 20, bloco 202). Puro.
 *
 * Cada cópia tirava o acento de um jeito um pouco diferente (umas com `trim`, outras com a
 * faixa de acentos escrita como caractere literal, que a ferramenta de editar arquivo às vezes
 * estragava). Uma função só, testada.
 */

/** Minúsculas e sem acento: "Ação" → "acao". Não mexe em espaço nem pontuação. */
export function semAcento(texto: string): string {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Radicais de 4 letras sem acento: "chamo", "chama" e "chamado" viram todos "cham". */
export function radicais(texto: string): Set<string> {
  const limpo = semAcento(texto).replace(/[^a-z0-9 ]/g, " ");
  return new Set(limpo.split(/\s+/).filter(p => p.length >= 4).map(p => p.slice(0, 4)));
}

/** "a, b e c" — lista para a fala. */
export function emFrase(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}
