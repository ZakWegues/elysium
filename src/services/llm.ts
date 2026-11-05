import { falhaDeConexao, garantirOllama } from "./ollamaVivo";
import { getApiKey, getConfig, getGeminiKey, marcarModeloMorto } from "../main/config";
import { apiKeyError, networkError } from "./errors";
import { modelosGemini } from "./gemini";
import { registrarUsoGemini } from "./cotaGemini";

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
/** O Gemini fala o mesmo dialeto da Groq (OpenAI) neste endereço — ver `noGemini`. */
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

/**
 * 24/10: com a chave do Gemini, o que ia para o Ollama (as rotinas de fundo e a conversa curta)
 * vai para o Flash-Lite — sem modelo de 2,6 GB na GPU nem servidor local para manter de pé. O
 * Ollama só entra se o Gemini falhar e a reserva offline estiver ligada em Ajustes.
 */
function noGemini(p: { provider: Provider }): boolean {
  return p.provider === "ollama" && !!getGeminiKey();
}
let ultimoModeloLeve = "";
async function modeloLeveGemini(): Promise<string> {
  ultimoModeloLeve = (await modelosGemini(getGeminiKey())).lite[0];
  return ultimoModeloLeve;
}

export type Provider = "groq" | "ollama";
/** Quem respondeu de fato: o Gemini atende os pedidos "ollama" quando há chave (24/10). */
type ProvedorReal = Provider | "gemini";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Só em mensagens do assistente que pediram ferramentas (bloco 78). */
  tool_calls?: ChamadaDeFerramenta[];
  /** Só em mensagens `tool`: a qual chamada este resultado responde. */
  tool_call_id?: string;
  /** Só em mensagens `tool`: o nome da ferramenta (o Ollama usa isto em vez do id). */
  name?: string;
}

// ── Ferramentas (bloco 78) ────────────────────────────────────────────────────
//
// Os dois provedores falam o dialeto da OpenAI para ferramentas, com uma diferença que
// importa: a Groq devolve `arguments` como STRING JSON e exige `tool_call_id` na resposta;
// o Ollama devolve `arguments` como OBJETO e ignora o id (aceita `tool_name`). Aqui os
// dois viram o mesmo `ChamadaDeFerramenta`, e a mensagem `tool` leva id e nome.

export interface DefinicaoDeFerramenta {
  name: string;
  description: string;
  /** JSON Schema dos argumentos (`type: "object"`). */
  parameters: Record<string, unknown>;
}

export interface ChamadaDeFerramenta {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface RespostaComFerramentas {
  /** Texto do assistente (vazio quando ele só pediu ferramentas). */
  content: string;
  toolCalls: ChamadaDeFerramenta[];
}

/** Uma chamada SEM stream, com ferramentas oferecidas. Nenhum dos dois provedores é obrigado a usá-las. */
export interface PedidoComFerramentas {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  tools: DefinicaoDeFerramenta[];
  temperature: number;
  maxTokens: number;
  timeoutMs?: number;
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
  /**
   * Quanto o modelo raciocina antes de responder (só modelos com raciocínio na Groq, como o
   * gpt-oss). Texto curto e criativo (frase do Hoje, dica, ideia) pede "low": no padrão o
   * raciocínio comia o teto inteiro e a resposta saía vazia (08/10).
   */
  esforco?: "low" | "medium" | "high";
  /**
   * Recebe cada pedaço de texto conforme o modelo escreve. Presente → a chamada é feita
   * em modo stream (NDJSON no Ollama, SSE na Groq) e o retorno continua sendo o texto
   * inteiro, então quem não liga para pedaços não muda nada.
   *
   * Com stream o timeout vira INATIVIDADE (tempo sem chegar pedaço), não total: uma
   * resposta longa não pode ser morta por ser longa, e um modelo travado ainda é pego.
   */
  onToken?: (token: string) => void;
  /** 05/11: vai direto ao Ollama, sem passar pelo Gemini (modo sem censura). */
  soLocal?: boolean;
}

/** Erro de provedor com a causa legível, para quem chama decidir se cai no fallback. */
export class ProviderError extends Error {
  constructor(public provider: ProvedorReal, message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

/**
 * O sinal de timeout da CONEXÃO.
 *
 * Sem stream, `AbortSignal.timeout` cobre tudo — cabeçalhos e corpo — e é o que se quer.
 * Com stream ele mataria uma resposta longa no meio, porque continua contando enquanto o
 * corpo chega; aí o sinal só vale até os cabeçalhos (`liberar()` depois do `fetch`) e o
 * corpo fica com o timeout de inatividade do `lerLinhas`.
 */
function sinalDeConexao(p: ChatPedido): { signal: AbortSignal; liberar: () => void } {
  const padrao = p.provider === "ollama" ? 60_000 : 30_000;
  const ms = p.timeoutMs ?? padrao;
  if (!p.onToken) return { signal: AbortSignal.timeout(ms), liberar: () => {} };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`sem resposta em ${ms} ms`)), ms);
  return { signal: ctrl.signal, liberar: () => clearTimeout(timer) };
}

/** Endereço base do Ollama sem o sufixo `/v1`, que só serve ao endpoint compatível. */
function baseOllama(): string {
  const bruto = (getConfig().ollamaBaseUrl || "http://127.0.0.1:11434").trim();
  return bruto.replace(/\/+$/, "").replace(/\/v1$/, "");
}

/**
 * `fetch` para o Ollama que, se o servidor estiver fora do ar, tenta subi-lo uma vez e
 * repete o pedido (ver `ollamaVivo.ts`). Erro HTTP do Ollama passa direto: esse não se
 * resolve ligando nada.
 */
async function fetchOllama(url: string, init: RequestInit): Promise<Response> {
  try { return await fetch(url, init); }
  catch (e) {
    if (!falhaDeConexao(e) || !(await garantirOllama(baseOllama()))) throw e;
    return fetch(url, init);
  }
}

/**
 * Quando a Groq recusou por limite (429) pela última vez. O card "Saúde" usa: limite
 * recente com o Ollama fora do ar é exatamente o "não responde" de 29/09/2026.
 */
let ultimoLimiteGroq = 0;
export function momentoDoUltimoLimiteGroq(): number {
  return ultimoLimiteGroq;
}

export function baseDoOllama(): string {
  return baseOllama();
}

async function chamarGroq(p: ChatPedido, gemini = false): Promise<string> {
  const apiKey = gemini ? getGeminiKey() : getApiKey();
  if (!apiKey) throw apiKeyError();
  const nome: ProvedorReal = gemini ? "gemini" : "groq";

  let res: Response;
  const conexao = sinalDeConexao(p);
  try {
    res = await fetch(gemini ? GEMINI_URL : GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: gemini ? await modeloLeveGemini() : p.model,
        messages: p.messages,
        temperature: p.temperature,
        max_tokens: p.maxTokens,
        ...(p.json ? { response_format: { type: "json_object" } } : {}),
        ...(p.onToken ? { stream: true } : {}),
        ...(p.esforco && /gpt-oss/i.test(p.model) ? { reasoning_effort: p.esforco } : {}),
      }),
      signal: conexao.signal,
    });
  } catch (e) {
    throw networkError(String(e));
  } finally {
    conexao.liberar();
  }

  if (gemini) registrarUsoGemini("texto", ultimoModeloLeve, res.status);
  if (res.status === 401) throw apiKeyError();
  if (!res.ok) {
    const corpo = await corpoCurto(res);
    // Modelo aposentado: anota para o `getConfig()` seguinte já devolver o padrão, em
    // vez de bater no mesmo id morto em todo comando até alguém editar o código.
    if (!gemini && res.status === 404 && /model_not_found|does not exist/i.test(corpo)) {
      marcarModeloMorto("groq", p.model);
    }
    if (!gemini && res.status === 429) ultimoLimiteGroq = Date.now();
    throw new ProviderError(nome, `HTTP ${res.status} ${corpo}`);
  }

  if (p.onToken) {
    // SSE: linhas "data: {...}" separadas por linha em branco, terminando em "data: [DONE]".
    return lerLinhas(res, p.timeoutMs ?? 30_000, (linha) => {
      if (!linha.startsWith("data:")) return null;
      const bruto = linha.slice(5).trim();
      if (!bruto || bruto === "[DONE]") return null;
      try {
        const j = JSON.parse(bruto) as { choices?: { delta?: { content?: string } }[] };
        return j.choices?.[0]?.delta?.content ?? null;
      } catch { return null; }
    }, p.onToken);
  }

  const dados = await res.json() as { choices?: { message?: { content?: string } }[] };
  return dados.choices?.[0]?.message?.content ?? "";
}

async function chamarOllama(p: ChatPedido): Promise<string> {
  const cfg = getConfig();

  let res: Response;
  const conexao = sinalDeConexao(p);
  try {
    res = await fetchOllama(`${baseOllama()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: p.model,
        messages: p.messages,
        stream: Boolean(p.onToken),
        // 29/10: modelos que pensam (qwen3.5) gastavam o teto pensando e devolviam vazio.
        think: false,
        ...(p.json ? { format: "json" } : {}),
        // Descarrega da VRAM sozinho depois deste tempo sem uso. Ver o cabeçalho.
        keep_alive: cfg.ollamaKeepAlive || "60s",
        options: {
          temperature: p.temperature,
          num_predict: p.maxTokens,
          num_ctx: cfg.ollamaNumCtx || 8192,
        },
      }),
      // Mais folgado que o da nuvem de propósito: a primeira chamada depois de o modelo
      // sair da VRAM paga o recarregamento, que nesta máquina leva alguns segundos.
      signal: conexao.signal,
    });
  } catch (e) {
    throw new ProviderError("ollama", `não consegui falar com o Ollama: ${String(e)}`);
  } finally {
    conexao.liberar();
  }

  if (!res.ok) {
    const corpo = await corpoCurto(res);
    // O Ollama devolve `{"error":"model 'x' not found"}` quando o modelo não foi puxado
    // nesta máquina. Mesmo tratamento do lado da nuvem — ver `marcarModeloMorto`.
    // `400 invalid model name` é o mesmo caso na prática: um nome que o Ollama não aceita.
    if ((res.status === 404 && /not found/i.test(corpo)) || (res.status === 400 && /invalid model/i.test(corpo))) {
      marcarModeloMorto("ollama", p.model);
    }
    throw new ProviderError("ollama", `HTTP ${res.status} ${corpo}`);
  }

  if (p.onToken) {
    // NDJSON: um objeto por linha, `message.content` com o pedaço, `done: true` no fim.
    return lerLinhas(res, p.timeoutMs ?? 60_000, (linha) => {
      try {
        const j = JSON.parse(linha) as { message?: { content?: string }; done?: boolean };
        return j.message?.content ?? null;
      } catch { return null; }
    }, p.onToken);
  }

  const dados = await res.json() as { message?: { content?: string } };
  return dados.message?.content ?? "";
}

/**
 * Lê o corpo linha a linha, entrega cada pedaço a `onToken` e devolve o texto inteiro.
 *
 * O timeout é de inatividade: o cronômetro recomeça a cada byte que chega. Cancelar o
 * leitor aborta a conexão — o modelo local para de gerar, em vez de terminar a resposta
 * para ninguém e segurar a GPU.
 */
async function lerLinhas(
  res: Response,
  inatividadeMs: number,
  extrair: (linha: string) => string | null,
  onToken: (token: string) => void,
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let texto = "", resto = "";

  let timer: NodeJS.Timeout | undefined;
  const rearmar = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { reader.cancel("inatividade").catch(() => {}); }, inatividadeMs);
  };
  rearmar();

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      rearmar();
      resto += decoder.decode(value, { stream: true });
      const linhas = resto.split(/\r?\n/);
      resto = linhas.pop() ?? "";
      for (const linha of linhas) {
        const pedaco = extrair(linha.trim());
        if (pedaco) { texto += pedaco; onToken(pedaco); }
      }
    }
    const ultimo = extrair(resto.trim());
    if (ultimo) { texto += ultimo; onToken(ultimo); }
  } finally {
    clearTimeout(timer);
  }
  return texto;
}

export async function callChat(p: ChatPedido): Promise<string> {
  if (!p.soLocal && noGemini(p)) {
    try { return await chamarGroq(p, true); }
    catch (e) { if (!getConfig().ollamaReserva) throw e; }
  }
  return p.provider === "ollama" ? chamarOllama(p) : chamarGroq(p);
}

/** Mensagens no formato de cada provedor: a Groq quer `arguments` em string, o Ollama em objeto. */
function mensagensParaFerramentas(msgs: ChatMessage[], provider: Provider): unknown[] {
  return msgs.map(m => {
    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant",
        content: m.content ?? "",
        tool_calls: m.tool_calls.map(c => ({
          id: c.id, type: "function",
          function: { name: c.name, arguments: provider === "groq" ? JSON.stringify(c.args) : c.args },
        })),
      };
    }
    if (m.role === "tool") {
      return provider === "groq"
        ? { role: "tool", tool_call_id: m.tool_call_id, content: m.content }
        : { role: "tool", tool_name: m.name, content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

function lerChamadas(brutas: unknown): ChamadaDeFerramenta[] {
  if (!Array.isArray(brutas)) return [];
  return brutas.flatMap((c, i) => {
    const fn = (c as { function?: { name?: string; arguments?: unknown } }).function;
    if (!fn?.name) return [];
    let args: Record<string, unknown> = {};
    if (typeof fn.arguments === "string") { try { args = JSON.parse(fn.arguments); } catch { args = {}; } }
    else if (fn.arguments && typeof fn.arguments === "object") args = fn.arguments as Record<string, unknown>;
    return [{ id: (c as { id?: string }).id ?? `chamada-${i}`, name: fn.name, args }];
  });
}

export async function callChatComFerramentas(p: PedidoComFerramentas): Promise<RespostaComFerramentas> {
  const tools = p.tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const gemini = noGemini(p);
  const messages = mensagensParaFerramentas(p.messages, gemini ? "groq" : p.provider);

  if (p.provider === "groq" || gemini) {
    const apiKey = gemini ? getGeminiKey() : getApiKey();
    if (!apiKey) throw apiKeyError();
    let res: Response;
    try {
      res = await fetch(gemini ? GEMINI_URL : GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: gemini ? await modeloLeveGemini() : p.model, messages, tools, tool_choice: "auto", temperature: p.temperature, max_tokens: p.maxTokens }),
        signal: AbortSignal.timeout(p.timeoutMs ?? 30_000),
      });
    } catch (e) { throw networkError(String(e)); }
    if (gemini) registrarUsoGemini("texto", ultimoModeloLeve, res.status);
    if (res.status === 401) throw apiKeyError();
    if (!res.ok) {
      const corpo = await corpoCurto(res);
      if (!gemini && res.status === 404 && /model_not_found|does not exist/i.test(corpo)) marcarModeloMorto("groq", p.model);
      if (!gemini && res.status === 429) ultimoLimiteGroq = Date.now();
    throw new ProviderError(gemini ? "gemini" : "groq", `HTTP ${res.status} ${corpo}`);
    }
    const dados = await res.json() as { choices?: { message?: { content?: string | null; tool_calls?: unknown } }[] };
    const msg = dados.choices?.[0]?.message;
    return { content: msg?.content ?? "", toolCalls: lerChamadas(msg?.tool_calls) };
  }

  const cfg = getConfig();
  let res: Response;
  try {
    res = await fetchOllama(`${baseOllama()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: p.model, messages, tools, stream: false, think: false,
        keep_alive: cfg.ollamaKeepAlive || "60s",
        options: { temperature: p.temperature, num_predict: p.maxTokens, num_ctx: cfg.ollamaNumCtx || 8192 },
      }),
      signal: AbortSignal.timeout(p.timeoutMs ?? 60_000),
    });
  } catch (e) { throw new ProviderError("ollama", `não consegui falar com o Ollama: ${String(e)}`); }
  if (!res.ok) {
    const corpo = await corpoCurto(res);
    if ((res.status === 404 && /not found/i.test(corpo)) || (res.status === 400 && /invalid model/i.test(corpo))) marcarModeloMorto("ollama", p.model);
    throw new ProviderError("ollama", `HTTP ${res.status} ${corpo}`);
  }
  const dados = await res.json() as { message?: { content?: string; tool_calls?: unknown } };
  return { content: dados.message?.content ?? "", toolCalls: lerChamadas(dados.message?.tool_calls) };
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
