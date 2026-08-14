import { getApiKey, getConfig } from "../main/config";
import { apiKeyError, networkError } from "./errors";

/**
 * Uma porta só para os dois provedores de chat: a Groq (nuvem) e o Ollama (local).
 *
 * Antes o `brain.ts` tinha dois `fetch` quase idênticos, um em `decideBrain` e outro em
 * `composeChatReply`. Com dois provedores viraria quatro, e a próxima correção de
 * cabeçalho ou de timeout seria aplicada em três lugares e esquecida no quarto.
 *
 * 🔴 O OLLAMA USA O ENDPOINT NATIVO, NÃO O COMPATÍVEL COM OPENAI
 *
 * Medido em 14/08/2026, não suposto:
 *
 *   POST /v1/chat/completions  → honra `response_format: json_object`,
 *                                mas IGNORA `keep_alive` (o `ollama ps` seguiu
 *                                mostrando o padrão de 5 minutos)
 *   POST /api/chat             → honra `format: "json"` E `keep_alive`
 *                                (o prazo caiu para 59 s como pedido)
 *
 * O `keep_alive` é o que tira o modelo da VRAM sozinho depois de um minuto sem comando —
 * sem ele, ~2,6 GB ficam presos na GPU o tempo todo, competindo com jogo aberto nesta
 * máquina de 8 GB. Por isso o caminho nativo, mesmo sendo um formato de corpo a mais
 * para manter.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type Provider = "groq" | "ollama";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatPedido {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  /** Pede JSON estrito. O roteador usa; a conversa não. */
  json?: boolean;
  timeoutMs?: number;
}

/** Erro de provedor com a causa legível, para quem chama decidir se cai no fallback. */
export class ProviderError extends Error {
  constructor(public provider: Provider, message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Endereço base do Ollama sem o sufixo `/v1`, que só serve ao endpoint compatível. */
function baseOllama(): string {
  const bruto = (getConfig().ollamaBaseUrl || "http://127.0.0.1:11434").trim();
  return bruto.replace(/\/+$/, "").replace(/\/v1$/, "");
}

async function chamarGroq(p: ChatPedido): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw apiKeyError();

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: p.model,
        messages: p.messages,
        temperature: p.temperature,
        max_tokens: p.maxTokens,
        ...(p.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(p.timeoutMs ?? 30_000),
    });
  } catch (e) {
    throw networkError(String(e));
  }

  if (res.status === 401) throw apiKeyError();
  if (!res.ok) throw new ProviderError("groq", `HTTP ${res.status} ${await corpoCurto(res)}`);

  const dados = await res.json() as { choices?: { message?: { content?: string } }[] };
  return dados.choices?.[0]?.message?.content ?? "";
}

async function chamarOllama(p: ChatPedido): Promise<string> {
  const cfg = getConfig();

  let res: Response;
  try {
    res = await fetch(`${baseOllama()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: p.model,
        messages: p.messages,
        stream: false,
        ...(p.json ? { format: "json" } : {}),
        // Descarrega da VRAM sozinho depois deste tempo sem uso. Ver o cabeçalho.
        keep_alive: cfg.ollamaKeepAlive || "60s",
        options: {
          temperature: p.temperature,
          num_predict: p.maxTokens,
        },
      }),
      // Mais folgado que o da nuvem de propósito: a primeira chamada depois de o modelo
      // sair da VRAM paga o recarregamento, que nesta máquina leva alguns segundos.
      signal: AbortSignal.timeout(p.timeoutMs ?? 60_000),
    });
  } catch (e) {
    throw new ProviderError("ollama", `não consegui falar com o Ollama: ${String(e)}`);
  }

  if (!res.ok) throw new ProviderError("ollama", `HTTP ${res.status} ${await corpoCurto(res)}`);

  const dados = await res.json() as { message?: { content?: string } };
  return dados.message?.content ?? "";
}

export async function callChat(p: ChatPedido): Promise<string> {
  return p.provider === "ollama" ? chamarOllama(p) : chamarGroq(p);
}

/** O Ollama está de pé e com o modelo pedido? Usado pelo dashboard e pela config. */
export async function ollamaDisponivel(modelo?: string): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const res = await fetch(`${baseOllama()}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return { ok: false, detalhe: `o Ollama respondeu HTTP ${res.status}` };

    const nomes = ((await res.json()) as { models?: { name: string }[] }).models?.map(m => m.name) ?? [];
    if (!modelo) return { ok: true, detalhe: `${nomes.length} modelo(s) disponível(is)` };

    const achou = nomes.some(n => n === modelo || n.startsWith(`${modelo}:`));
    return achou
      ? { ok: true, detalhe: `"${modelo}" disponível` }
      : { ok: false, detalhe: `"${modelo}" não foi baixado — rode: ollama pull ${modelo}` };
  } catch {
    return { ok: false, detalhe: "o Ollama não está rodando (inicie o serviço)" };
  }
}

async function corpoCurto(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 300); } catch { return ""; }
}
