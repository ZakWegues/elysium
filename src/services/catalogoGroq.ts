import { getApiKey } from "../main/config";

/**
 * O catálogo de modelos da conta na Groq (bloco 84).
 *
 * A Groq aposenta modelos sem aviso — foi assim com a família Llama inteira (21/08) e com o
 * `qwen/qwen3.6-27b` da visão (achado em 28/09/2026: 404 em "olha esta imagem"). As listas
 * de candidatos do `config.ts` são escritas à mão e envelhecem; perguntar à API é a única
 * fonte que não mente. Cache de 1 h: o catálogo muda em semanas, não em minutos.
 *
 * A chave nunca sai daqui: quem chama recebe só os ids.
 */

const URL_MODELOS = "https://api.groq.com/openai/v1/models";
const VALIDADE_MS = 60 * 60 * 1000;

let cache: { em: number; ids: string[] } | null = null;

export async function modelosDaGroq(forcar = false): Promise<string[]> {
  if (!forcar && cache && Date.now() - cache.em < VALIDADE_MS) return cache.ids;
  const chave = getApiKey();
  if (!chave) return [];
  const res = await fetch(URL_MODELOS, {
    headers: { Authorization: `Bearer ${chave}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Groq /models HTTP ${res.status}`);
  const corpo = await res.json() as { data?: { id?: string; active?: boolean }[] };
  const ids = (corpo.data ?? []).filter(m => m.id && m.active !== false).map(m => m.id as string).sort();
  cache = { em: Date.now(), ids };
  return ids;
}

/**
 * Modelos que aceitam imagem, na ordem de preferência. Padrões por nome porque a API não
 * diz quem enxerga: famílias de visão conhecidas primeiro, depois qualquer id com "vision"
 * ou "vl". Devolve `[]` quando a conta não tem nenhum — aí a visão fica indisponível e a
 * mensagem de erro diz isso, em vez de tentar um modelo de texto.
 */
export function candidatosDeVisao(ids: string[]): string[] {
  // O qwen3.x-27b da Groq é multimodal (o 3.6 era o modelo de visão até sumir; o 3.8,
  // conferido em 28/09/2026, lê texto em imagem).
  const padroes = [/llama-4-maverick/i, /llama-4-scout/i, /^qwen\/qwen3\.\d+-\d+b$/i, /qwen.*(vl|vision)/i, /gemma-3/i, /kimi.*vl/i, /vision/i, /(^|[-/])vl([-/]|$)/i];
  const saida: string[] = [];
  for (const p of padroes) for (const id of ids) if (p.test(id) && !saida.includes(id)) saida.push(id);
  return saida;
}
