import { getApiKey, getConfig, AppConfig } from "../main/config";
import { apiKeyError } from "./errors";
import { callChat, ChatMessage, Provider } from "./llm";
import { quemOcupaGpu } from "./gpuGuard";
import type { MediaOperation } from "../actions/mediaControl";
import type { WinOperation }   from "../actions/windowManagement";
import type { PowerOperation } from "../actions/powerControl";
import { buildMemoryBlock } from "./memoryStore";
import { buildRouterPromptBase } from "./routerPrompt";


export type BrainAction =
  | { action: "play_music";        query: string }
  | { action: "open_url";          url_or_query: string }
  | { action: "open_app";          app_name: string }
  | { action: "close_app";         app_name: string }
  | { action: "volume_control";    level: number | "up" | "down" | "mute" | "unmute" }
  | { action: "media_control";     operation: MediaOperation }
  | { action: "window_management"; target_app: string; operation: WinOperation }
  | { action: "write_text";        content: string; description: string }
  | { action: "create_file";       filename: string; content: string; description: string }
  | { action: "clipboard_read";    instruction: string }
  | { action: "screenshot";        filename?: string }
  | { action: "system_info";       query: string }
  | { action: "run_preset";        preset_name: string }
  | { action: "list_presets" }
  | { action: "delete_preset";     preset_name: string }
  | { action: "create_preset";     preset_name: string; description: string; icon?: string; actions: BrainAction[] }
  | { action: "send_to_mobile";    content: string; kind?: "link" | "note" }
  | { action: "power_control";     operation: PowerOperation; delay_seconds?: number }
  | { action: "remember";          fact: string }
  | { action: "forget";            query: string }
  | { action: "list_memory" }
  | { action: "create_reminder";   text: string; due_at: string; weekly?: boolean }
  | { action: "list_reminders" }
  | { action: "cancel_reminder";   query: string }
  | { action: "web_search";        query: string }
  | { action: "look_at_screen";    question: string }
  // `reply` é opcional: o roteador só sinaliza que é conversa, e quem escreve a
  // resposta é `composeChatReply`. O campo sobrevive como rede de segurança para
  // quando o modelo pequeno responde mesmo assim.
  | { action: "chat";              reply?: string }
  | { action: "unknown" };

interface Message {
  role: "user" | "assistant";
  content: string;
}


/**
 * Prompt final: a parte determinística (texto fixo + data e hora), que mora em
 * `routerPrompt.ts` para a bancada de medição poder ler o mesmo texto sem carregar o
 * Electron, mais o bloco de memória, que é do usuário e muda a cada fato guardado.
 */
function buildSystemPrompt(): string {
  return buildRouterPromptBase() + buildMemoryBlock();
}

/**
 * Prompt de conversa — separado do de roteamento e propositalmente minúsculo.
 *
 * Decidir a ação e escrever a resposta são tarefas diferentes: a primeira é
 * classificação e roda num modelo pequeno com um prompt grande; a segunda é redação e
 * roda no modelo bom com um prompt curto. Juntas numa chamada só, pagávamos o modelo
 * caro pelo prompt gigante de roteamento em todo pedido.
 */
const CHAT_SYSTEM_PROMPT = `Você é o ELYSIUM, assistente pessoal do usuário, falando em português do Brasil.

Sua resposta vai ser LIDA EM VOZ ALTA. Portanto:
- Responda em 1 a 3 frases, direto ao ponto.
- Nada de markdown, listas, títulos ou emoji — só texto corrido natural.
- Nada de "como assistente de IA" ou avisos desnecessários.
- Se não souber, diga que não sabe em uma frase.`;

let history: Message[] = [];
let lastActivity = Date.now();

export function clearHistory(): void {
  history = [];
  lastActivity = Date.now();
}

/**
 * Registra no histórico um comando resolvido localmente, sem passar pelo modelo.
 *
 * Sem isto o cérebro não veria esses turnos e perderia o fio: depois de "pausa"
 * resolvido no atalho, um "continua" seguido de "e aumenta" ficaria sem contexto.
 */
export function noteFastRouted(text: string, actions: BrainAction[]): void {
  const now = Date.now();
  if (now - lastActivity > getConfig().chatIdleResetMs) history = [];
  lastActivity = now;

  history.push({ role: "user", content: text });
  history.push({ role: "assistant", content: actions.map(actionSummary).join(" | ") });

  const maxMsgs = getConfig().chatHistoryTurns * 2;
  if (history.length > maxMsgs) history = history.slice(history.length - maxMsgs);
}

function actionSummary(action: BrainAction): string {
  switch (action.action) {
    case "play_music":        return `Toquei "${action.query}" no Spotify.`;
    case "open_url":          return `Abri: ${action.url_or_query}`;
    case "open_app":          return `Abri o app: ${action.app_name}`;
    case "close_app":         return `Fechei: ${action.app_name}`;
    case "volume_control":    return typeof action.level === "number" ? `Volume: ${action.level}%` : `Volume ${action.level}`;
    case "media_control":     return `Mídia: ${action.operation}`;
    case "window_management": return `Janela ${action.target_app}: ${action.operation}`;
    case "write_text":        return `Texto pronto: ${action.description}`;
    case "create_file":       return `Arquivo criado: ${action.filename}`;
    case "clipboard_read":    return `Clipboard: ${action.instruction}`;
    case "screenshot":        return "Screenshot capturado";
    case "system_info":       return `Info: ${action.query}`;
    case "run_preset":        return `Preset ativado: ${action.preset_name}`;
    case "list_presets":      return "Listou presets";
    case "delete_preset":     return `Removeu preset: ${action.preset_name}`;
    case "create_preset":     return `Criou preset: ${action.preset_name}`;
    case "send_to_mobile":    return `Mandou pro celular: ${action.content}`;
    case "power_control":     return `Energia: ${action.operation}`;
    case "remember":          return `Guardou na memória: ${action.fact}`;
    case "forget":            return `Esqueceu: ${action.query}`;
    case "list_memory":       return "Listou a memória";
    case "create_reminder":   return `Lembrete criado: ${action.text}`;
    case "list_reminders":    return "Listou lembretes";
    case "cancel_reminder":   return `Cancelou lembrete: ${action.query}`;
    case "web_search":        return `Pesquisou: ${action.query}`;
    case "look_at_screen":    return `Olhou a tela: ${action.question}`;
    case "unknown":           return "Não entendi o pedido.";
    default:                  return "";
  }
}

/** Nomes válidos da união `BrainAction`, para reconhecer invenção do modelo. */
const ACOES_VALIDAS = new Set<string>([
  "play_music", "open_url", "open_app", "close_app", "volume_control", "media_control",
  "window_management", "write_text", "create_file", "clipboard_read", "screenshot",
  "system_info", "run_preset", "list_presets", "delete_preset", "create_preset",
  "send_to_mobile", "power_control", "remember", "forget", "list_memory",
  "create_reminder", "list_reminders", "cancel_reminder", "web_search",
  "look_at_screen", "chat", "unknown",
]);

/**
 * Interpreta o JSON do roteador.
 *
 * Devolve `null` quando o resultado é inaproveitável — e é essa diferença que decide o
 * fallback. Antes, qualquer falha virava `unknown` ali mesmo; agora `unknown` continua
 * sendo resposta legítima do modelo ("não entendi"), enquanto `null` significa "este
 * provedor não entregou nada utilizável, vale tentar o outro".
 */
function interpretarAcoes(content: string): BrainAction[] | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }

  let actions: BrainAction[];
  if (Array.isArray(parsed.actions) && parsed.actions.length > 0) actions = parsed.actions as BrainAction[];
  else if (parsed.action) actions = [parsed as unknown as BrainAction];
  else return null;

  // Ação inventada é sintoma de modelo que não seguiu o contrato. Filtrar em silêncio
  // esconderia isso; deixar passar faria o roteador chamar um executor inexistente.
  actions = actions.filter(a => typeof a?.action === "string" && ACOES_VALIDAS.has(a.action));
  return actions.length > 0 ? actions : null;
}

/**
 * Decide qual provedor atende o roteamento agora.
 *
 * Com jogo aberto, o local é pulado mesmo estando configurado: carregar ~2,6 GB na GPU
 * bem na hora em que ela está disputada tiraria quadros do jogo, e ninguém ligaria a
 * queda ao assistente de voz. Ver `gpuGuard.ts`.
 */
async function provedorDoRoteador(cfg: AppConfig): Promise<{ provider: Provider; motivo?: string }> {
  if (cfg.routerProvider !== "ollama") return { provider: "groq" };
  if (!cfg.evitarGpuOcupada) return { provider: "ollama" };

  const ocupada = await quemOcupaGpu();
  if (!ocupada) return { provider: "ollama" };
  if (!getApiKey()) return { provider: "ollama", motivo: `${ocupada} está usando a GPU, mas não há chave da Groq para desviar` };
  return { provider: "groq", motivo: `${ocupada} está usando a GPU; roteando pela nuvem desta vez` };
}

export async function decideBrain(text: string): Promise<BrainAction[]> {
  const cfg = getConfig();

  const now = Date.now();
  if (now - lastActivity > cfg.chatIdleResetMs) history = [];
  lastActivity = now;

  history.push({ role: "user", content: text });

  const maxMsgs = cfg.chatHistoryTurns * 2;
  if (history.length > maxMsgs) history = history.slice(history.length - maxMsgs);

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    ...history.map(m => ({ role: m.role, content: m.content })),
  ];

  const { provider, motivo } = await provedorDoRoteador(cfg);
  if (motivo) console.log(`[brain] ${motivo}`);

  const modelo = provider === "ollama" ? cfg.ollamaRouterModel : cfg.routerModel;

  let actions: BrainAction[] | null = null;
  let falha = "";

  try {
    const content = await callChat({
      provider, model: modelo, messages, temperature: 0.1, maxTokens: 1500, json: true,
    });
    actions = interpretarAcoes(content);
    if (!actions) falha = "resposta sem ação aproveitável";
  } catch (e) {
    falha = e instanceof Error ? e.message : String(e);
  }

  // Rede de segurança. Vale só quando o local falhou: repetir na nuvem o que a nuvem já
  // recusou seria pagar duas vezes pelo mesmo erro.
  if (!actions && provider === "ollama" && cfg.fallbackToGroq && getApiKey()) {
    console.warn(`[brain] o roteador local falhou (${falha}); repetindo na Groq.`);
    try {
      const content = await callChat({
        provider: "groq", model: cfg.routerModel, messages,
        temperature: 0.1, maxTokens: 1500, json: true,
      });
      actions = interpretarAcoes(content);
    } catch (e) {
      falha = e instanceof Error ? e.message : String(e);
    }
  }

  if (!actions) {
    console.error(`[brain] nenhum provedor entregou ação: ${falha}`);
    if (provider === "ollama" && !getApiKey()) throw apiKeyError();
    actions = [{ action: "unknown" }];
  }

  const summaries = actions.map(a =>
    a.action === "chat" ? (a as { action: "chat"; reply: string }).reply : actionSummary(a)
  );
  history.push({ role: "assistant", content: summaries.join(" | ") });

  return actions;
}

/**
 * Escreve a resposta de conversa no modelo bom.
 *
 * Devolve `null` em qualquer falha — quem chama decide o que dizer no lugar. Uma
 * conversa que quebra é bem menos grave que uma ação que não acontece, então isto
 * nunca lança.
 */
export async function composeChatReply(userText: string): Promise<string | null> {
  const cfg = getConfig();

  // O mesmo histórico do roteador, para o modelo entender "e ele?" depois de uma
  // pergunta anterior. Sem o bloco de ações: aqui ele só conversa.
  const recent = history.slice(-cfg.chatHistoryTurns * 2);
  const messages: ChatMessage[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT + buildMemoryBlock() },
    ...recent.map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userText },
  ];

  const tentar = async (provider: Provider): Promise<string | null> => {
    if (provider === "groq" && !getApiKey()) return null;
    const model = provider === "ollama" ? cfg.ollamaChatModel : cfg.brainModel;
    const texto = await callChat({ provider, model, messages, temperature: 0.6, maxTokens: 300, timeoutMs: 30_000 });
    return texto.trim() || null;
  };

  const primeiro: Provider = cfg.chatProvider === "ollama" ? "ollama" : "groq";

  try {
    const reply = await tentar(primeiro);
    if (reply) return reply;
  } catch (e) {
    console.error(`[brain] resposta de conversa falhou no provedor "${primeiro}":`, e);
  }

  if (primeiro === "ollama" && cfg.fallbackToGroq) {
    try {
      return await tentar("groq");
    } catch (e) {
      console.error("[brain] o fallback de conversa na Groq também falhou:", e);
    }
  }

  return null;
}
