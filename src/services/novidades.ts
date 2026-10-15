import Store from "electron-store";
import { searchWeb } from "./webSearch";

/**
 * Novidades do dia (fase 23, pedido do Zak): IA, cinema e YouTube/tecnologia no briefing, para ele
 * se atualizar sem procurar. Uma pesquisa por assunto, uma vez por dia (o "dia" vira às 6h), pelo
 * `searchWeb` — que vai pelo Hermes quando ele é o cérebro e cai na Groq se não der.
 *
 * Nunca segura o Hoje nem o resumo: quem pede recebe o que está no cache (ou nada) e a busca do
 * dia roda por trás.
 */

export interface Novidade { tema: string; topicos: string[] }

export const TEMAS: { tema: string; pergunta: string }[] = [
  { tema: "IA", pergunta: "Quais as novidades mais importantes de inteligência artificial nos últimos dias (lançamentos de modelos como Gemini, GPT, Claude, Llama, Grok, novidades de empresas de IA)?" },
  { tema: "Cinema", pergunta: "Quais filmes estreiam ou estão em cartaz nos cinemas do Brasil nesta semana, e algum lançamento de streaming que esteja em alta?" },
  { tema: "Em alta", pergunta: "O que está em alta hoje no YouTube e no mundo da tecnologia (vídeos, lançamentos de produtos, assuntos virais)?" },
];

const FORMATO = "Responda só com até 2 tópicos, um por linha, começando com \"- \", cada um com no máximo 18 palavras, citando nomes. Sem introdução nem conclusão.";

/** O "dia" das novidades: vira às 6h (de madrugada ainda vale o de ontem). Puro. */
export function diaDasNovidades(agora = new Date()): string {
  const d = new Date(agora.getTime() - 6 * 3600_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Os tópicos de uma resposta: linhas de lista, sem markdown, até `max`. Puro. */
export function topicosDaResposta(texto: string, max = 2): string[] {
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const itens = linhas.filter(l => /^([-*•]|\d+[.)])\s+/.test(l));
  const base = itens.length ? itens : linhas.length === 1 ? linhas : [];
  return base
    .map(l => l.replace(/^([-*•]|\d+[.)])\s+/, "").replace(/\*\*|__|`/g, "").replace(/\s*\(?https?:\/\/\S+\)?/g, "").trim())
    .filter(l => l.length > 8 && !/^(não (achei|encontrei)|desculp)/i.test(l))
    .slice(0, max);
}

/** Uma frase para a fala do resumo: "IA: x. Cinema: y." Puro. */
export function frasesDasNovidades(n: Novidade[]): string {
  return n.filter(x => x.topicos.length).map(x => `${x.tema}: ${x.topicos[0].replace(/[.!?]?$/, ".")}`).join(" ");
}

const store = new Store<{ dia: string; itens: Novidade[] }>({ name: "novidades" });
let emCurso: Promise<Novidade[]> | null = null;

/** O que já se sabe hoje (pode ser vazio). Dispara a busca do dia se ainda não houve. */
export function novidadesEmCache(agora = new Date()): Novidade[] | null {
  const dia = diaDasNovidades(agora);
  if (store.get("dia") === dia) return store.get("itens") ?? null;
  void buscarNovidades(agora);
  return null;
}

/** Busca as novidades do dia (uma vez; chamadas em paralelo esperam a mesma). */
export function buscarNovidades(agora = new Date()): Promise<Novidade[]> {
  const dia = diaDasNovidades(agora);
  if (store.get("dia") === dia) return Promise.resolve(store.get("itens") ?? []);
  if (emCurso) return emCurso;
  emCurso = (async () => {
    const itens: Novidade[] = [];
    // Uma por vez: o Hermes atende uma sessão de pesquisa e a Groq tem teto por minuto.
    for (const t of TEMAS) {
      try {
        const r = await searchWeb(`${t.pergunta}\n${FORMATO}`);
        const topicos = topicosDaResposta(r);
        if (topicos.length) itens.push({ tema: t.tema, topicos });
      } catch (e) {
        console.warn(`[novidades] ${t.tema}:`, e instanceof Error ? e.message : e);
      }
    }
    // Só grava o dia se algo veio — sem rede, tenta de novo na próxima vez.
    if (itens.length) store.set({ dia, itens });
    console.log(`[novidades] ${itens.length} assunto(s) para ${dia}`);
    return itens;
  })().finally(() => { emCurso = null; });
  return emCurso;
}
