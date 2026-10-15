import type { Canal } from "../estiloResposta";
import type { Fonte } from "../contextoComando";

/**
 * Pesquisa na web pelo Hermes (fase 23, pedido do Zak: "ele é melhor nisso"). Puro — testado em
 * tests/hermesPesquisa.test.ts. Quem roda o turno é `pesquisarViaHermes` em `cerebro.ts`.
 *
 * O Hermes pesquisa com as ferramentas dele (busca e navegador), numa sessão SÓ de pesquisa — a
 * conversa com a Ely não fica poluída. Ele devolve a resposta e, no fim, as fontes num bloco
 * fixo que daqui vira os chips de fonte do chat.
 */

const MARCA_FONTES = "FONTES:";

/** O pedido de pesquisa: atual, datado, curto, com fontes num formato que dá para ler. */
export function promptDePesquisa(pergunta: string, canal: Canal, agora = new Date()): string {
  const data = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const forma = canal === "voz"
    ? "A resposta vai ser LIDA EM VOZ ALTA: 1 a 3 frases, sem markdown, sem links, números naturais de falar."
    : "A resposta aparece num chat: comece pelo fato direto, depois o contexto essencial em poucas linhas; markdown simples (negrito, lista curta), sem tabelas nem títulos.";
  return [
    `[PESQUISA NA WEB — hoje é ${data}]`,
    "Pesquise AGORA na internet (use suas ferramentas de busca e abra as páginas que importam) e responda em português do Brasil.",
    "Prefira fontes recentes e confiáveis; diga de quando é a informação quando isso importar (lançamento, preço, placar, previsão).",
    "Não rode comandos no computador, não crie arquivos, não use memória — só pesquise e responda.",
    forma,
    "Se não achar, diga em uma frase em vez de inventar.",
    `Termine com uma linha "${MARCA_FONTES}" e, abaixo, de 2 a 4 linhas no formato "- título | https://endereço" das páginas que você usou.`,
    "",
    `Pergunta: ${pergunta.trim()}`,
  ].join("\n");
}

/** Separa a resposta do bloco de fontes. Fontes repetidas (mesmo site) ficam uma só. */
export function separarFontes(texto: string, maximo = 4): { texto: string; fontes: Fonte[] } {
  const i = texto.lastIndexOf(MARCA_FONTES);
  if (i < 0) return { texto: texto.trim(), fontes: [] };
  const corpo = texto.slice(0, i).trim();
  const fontes: Fonte[] = [];
  const hosts = new Set<string>();
  for (const linha of texto.slice(i + MARCA_FONTES.length).split(/\r?\n/)) {
    const m = /(https?:\/\/[^\s)>\]]+)/.exec(linha);
    if (!m) continue;
    const url = m[1].replace(/[.,;]+$/, "");
    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { continue; }
    if (hosts.has(host)) continue;
    hosts.add(host);
    const titulo = linha.slice(0, m.index).replace(/^[\s\-*•\d.]+/, "").replace(/\s*[|—–-]\s*$/, "").trim();
    fontes.push({ titulo: titulo || host, url });
    if (fontes.length >= maximo) break;
  }
  return { texto: corpo, fontes };
}

/**
 * Filtro do streaming: deixa passar o texto e segura o bloco "FONTES:" (que vira chips no fim).
 * Recebe pedaços (deltas) e só emite o que já se sabe que não é o começo da marca.
 */
export function criarFiltroDeFontes(emitir?: (t: string) => void): { empurrar: (t: string) => void } {
  let acumulado = "";
  let emitido = 0;
  let parou = false;
  return {
    empurrar(t: string) {
      if (parou || !emitir) return;
      acumulado += t;
      const i = acumulado.indexOf(MARCA_FONTES);
      if (i >= 0) {
        const resto = acumulado.slice(emitido, i).replace(/\s+$/, "");
        if (resto) emitir(resto);
        parou = true;
        return;
      }
      // Segura o fim que ainda pode virar "FONTES:".
      const seguro = acumulado.length - (MARCA_FONTES.length - 1);
      if (seguro > emitido) { emitir(acumulado.slice(emitido, seguro)); emitido = seguro; }
    },
  };
}

/** Linha da persona: no chat, quando pesquisar na web, devolver as fontes no bloco fixo. */
export function regraDeFontes(canal: Canal): string {
  return canal === "voz"
    ? "Se pesquisar na web, responda só o resultado, sem links nem fontes."
    : `Se pesquisar na web, termine com uma linha "${MARCA_FONTES}" e de 2 a 4 linhas "- título | https://endereço" das páginas usadas (elas viram botões no chat).`;
}

/** Na voz, nada de markdown nem endereço escapando. */
export function limparParaVoz(texto: string): string {
  return texto.replace(/\*\*|__|`/g, "").replace(/https?:\/\/\S+/g, "").replace(/[ \t]{2,}/g, " ").trim();
}
