import { pedeResposta } from "./live";
import { semAcento } from "./texto";

/**
 * Respostas rápidas (22/10) — os botões embaixo da última resposta da Ely, como os de escolha
 * do Claude: quando ela pergunta algo, um toque responde (Sim, Não, as opções que ela mesma
 * ofereceu) e o "Outra resposta…" foca a caixa de texto. Mais as respostas prontas do dono,
 * editáveis nos Ajustes.
 *
 * Tudo por regra, sem modelo: sai junto da resposta, sem atraso. O clique vira mensagem normal
 * (o "Sim" da confirmação segue o `ehSim` de sempre).
 */

export type Rapidas = {
  /** A resposta termina numa pergunta. Com isso a linha substitui as sugestões de continuação. */
  pergunta: boolean;
  sim: boolean;
  nao: boolean;
  /** Escolhas tiradas do próprio texto ("café ou chá?", lista numerada), no máx. 4. */
  opcoes: string[];
  /** As respostas prontas dos Ajustes. */
  prontas: string[];
};

export const RESPOSTAS_PRONTAS_PADRAO = ["pode fazer", "agora não", "explica melhor", "manda no celular"];
export const MAX_PRONTAS = 6;
/** Abaixo disto (sem pergunta), é aviso de status: sem respostas prontas. */
const RESPOSTA_CURTA = 120;
const MAX_OPCOES = 4;
const MAX_OPCAO = 40;

/** Pergunta aberta: "qual…", "onde…", "como…" — Sim/Não não responde. */
const ABERTA = /^(o que|oque|para onde|pra onde|de onde|qual|quais|quando|onde|aonde|como|quanto|quantos|quantas|quem|por que|porque|pra que|para que|de que|em que)\b/;
/** "Qual você prefere", "o que acha": abertura antes da vírgula. */
const ABERTURA = /^(qual|quais|o que)$|\b(prefere|preferir|escolhe|escolher|acha|quer|sugere)$/
/** A pergunta pede para escolher de uma lista acima dela. */
const ESCOLHA = /\b(qual|quais|prefere|preferir|escolhe|escolher|escolha|algum|alguma|por onde|comeco|comecar)\b/;

function norm(t: string): string {
  return semAcento(t).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Limpa uma opção: markdown, pontuação das pontas, maiúscula no começo. */
function limparOpcao(t: string): string {
  const s = t.replace(/\*\*|__|`/g, "").replace(/^[\s,;:–—-]+|[\s,;:.!–—-]+$/g, "").trim();
  return s ? s[0].toLocaleUpperCase("pt-BR") + s.slice(1) : "";
}

/** A última frase do texto (a pergunta), sem aspas no fim. */
function ultimaFrase(texto: string): string {
  const t = texto.trim().replace(/["'”’»)\]\s]+$/u, "");
  const linhas = t.split(/\n+/);
  const ultima = linhas[linhas.length - 1];
  const partes = ultima.split(/(?<=[.!?…:])\s+/);
  return partes[partes.length - 1].trim();
}

/**
 * "Prefere café ou chá?", "de carro, de ônibus ou de bicicleta?" → as alternativas. O começo
 * da 1ª ("Você prefere ir de carro") é cortado pelo tamanho da última ("de bicicleta"). Pura.
 */
function opcoesDoOu(pergunta: string): string[] {
  const m = /^(.+?)\s+ou\s+(.+?)\?$/u.exec(pergunta);
  if (!m) return [];
  const direita = m[2].trim();
  if (/^(nao|não|algo assim|outra coisa|outro|outra|mais|quer outra|prefere outra)\b/i.test(semAcento(direita))) return [];
  const esquerda = m[1].split(/,\s*/);
  // "Qual você prefere, praia ou montanha?": a abertura antes da vírgula não é opção.
  if (esquerda.length > 1 && ABERTURA.test(norm(esquerda[0]))) esquerda.shift();
  const nPalavras = direita.split(/\s+/).length;
  const primeira = esquerda[0].split(/\s+/);
  // Começo longo demais ("procure o arquivo inteiro na pasta… ou deixa?") não é escolha.
  if (primeira.length > nPalavras + 4) return [];
  esquerda[0] = primeira.length > nPalavras + 1 ? primeira.slice(-nPalavras).join(" ") : esquerda[0];
  // "Prefere café" com a direita "chá": sobra o verbo — corta a 1ª palavra quando a 1ª opção
  // ficou maior que a outra.
  if (esquerda.length === 1 && primeira.length === nPalavras + 1) esquerda[0] = primeira.slice(1).join(" ");
  const todas = [...esquerda, direita].map(limparOpcao);
  if (todas.length > MAX_OPCOES || todas.some(o => !o || o.length > MAX_OPCAO)) return [];
  return todas;
}

/** Itens da lista (numerada ou com marcador) logo antes da pergunta. Pura. */
function opcoesDaLista(texto: string): string[] {
  const linhas = texto.trim().split(/\n/).map(l => l.trim());
  linhas.pop(); // a linha da pergunta
  while (linhas.length && !linhas[linhas.length - 1]) linhas.pop();
  const itens: string[] = [];
  for (let i = linhas.length - 1; i >= 0; i--) {
    const m = /^(?:\d+[.)]|[-•*])\s+(.+)$/.exec(linhas[i]);
    if (!m) break;
    // "**Praia** — sol e mar" → "Praia"
    const titulo = m[1].split(/\s[–—-]\s|:\s/)[0];
    itens.unshift(limparOpcao(titulo));
  }
  if (itens.length < 2 || itens.some(o => !o || o.length > MAX_OPCAO)) return [];
  return itens.slice(0, MAX_OPCOES);
}

/** O que mostrar embaixo da resposta. `prontas` vem dos Ajustes. Pura. */
export function opcoesDaResposta(reply: string, prontas: string[] = []): Rapidas {
  const vazio: Rapidas = { pergunta: false, sim: false, nao: false, opcoes: [], prontas: limparProntas(prontas) };
  // 31/10: resposta curta de status ("Volume em 30%.", "Nada para desfazer.") não pede
  // "pode fazer"/"explica melhor" — as prontas ficam para perguntas e respostas com conteúdo.
  if (!pedeResposta(reply)) return reply.trim().length < RESPOSTA_CURTA ? { ...vazio, prontas: [] } : vazio;
  const t = reply.trim().replace(/["'”’»)\]\s]+$/u, "");
  if (/Confirma\? Diga sim\.?$/.test(t)) return { ...vazio, pergunta: true, sim: true, nao: true };
  const pergunta = ultimaFrase(t);
  const p = norm(pergunta);
  let opcoes = opcoesDoOu(pergunta);
  if (!opcoes.length && ESCOLHA.test(p)) opcoes = opcoesDaLista(t);
  if (opcoes.length) return { ...vazio, pergunta: true, opcoes };
  const simNao = !ABERTA.test(p);
  return { ...vazio, pergunta: true, sim: simNao, nao: simNao };
}

/** Saneia a lista dos Ajustes: texto curto, sem repetir, no máx. 6. Pura. */
export function limparProntas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const s of lista) {
    if (typeof s !== "string") continue;
    const t = s.replace(/\s+/g, " ").trim().slice(0, MAX_OPCAO);
    const k = norm(t);
    if (!t || vistas.has(k)) continue;
    vistas.add(k);
    out.push(t);
    if (out.length >= MAX_PRONTAS) break;
  }
  return out;
}

/**
 * O que vai junto da resposta, conforme os Ajustes: nada com o ajuste desligado ou sem
 * pergunta nem pronta para mostrar. Pura.
 */
export function rapidasPara(reply: string, cfg: { respostasRapidas?: boolean; respostasProntas?: unknown }): Rapidas | null {
  if (cfg.respostasRapidas === false) return null;
  const r = opcoesDaResposta(reply, limparProntas(cfg.respostasProntas ?? RESPOSTAS_PRONTAS_PADRAO));
  return r.pergunta || r.prontas.length ? r : null;
}
