import { getApiKey, getConfig } from "../main/config";
import { apiKeyError, networkError } from "./errors";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

export type BrainAction =
  | { action: "play_music"; query: string }
  | { action: "open_url"; url_or_query: string }
  | { action: "open_app"; app_name: string }
  | { action: "write_text"; content: string; description: string }
  | { action: "chat"; reply: string }
  | { action: "unknown" };

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `Você é o NEUROAXIS, assistente de voz pessoal em português do Brasil. Interprete o pedido e retorne APENAS JSON com uma ação:

{"action":"play_music","query":"<busca no Spotify>"}
{"action":"open_url","url_or_query":"<URL completa ou nome de site ou termo de pesquisa>"}
{"action":"open_app","app_name":"<nome do programa>"}
{"action":"write_text","content":"<texto completo gerado>","description":"<o que é, ex: email para o chefe>"}
{"action":"chat","reply":"<resposta direta e curta em português>"}
{"action":"unknown"}

Regras de decisão:
- play_music → música, cantor, banda, álbum, playlist, "coloca", "toca", "bota"
- open_url → site, YouTube, rede social, "pesquisa", "busca", "abre o site de", serviços Google (Gmail, Drive, Meet, Calendar, Fotos, Maps)
- open_app → programa instalado no PC, "abre o", "inicia o"
- write_text → "escreve", "redige", "cria um texto", "monta um email", "faz uma mensagem", "elabora", "copia para área de transferência" — gere o texto COMPLETO e detalhado no campo content
- chat → perguntas, conversas, cálculos, definições, opiniões — responda em 1-2 frases
- Distingua: "abre o Spotify" (open_app) vs "toca música no Spotify" (play_music)
- URLs fornecidas pelo usuário: use open_url com a URL direta

Exemplos:
"toca Bruno Mars" → {"action":"play_music","query":"Bruno Mars"}
"coloca Bohemian Rhapsody" → {"action":"play_music","query":"Bohemian Rhapsody Queen"}
"toca funk dos anos 2000" → {"action":"play_music","query":"funk anos 2000"}
"música lofi para estudar" → {"action":"play_music","query":"lofi hip hop study"}
"abre o YouTube" → {"action":"open_url","url_or_query":"https://youtube.com"}
"abre o Instagram" → {"action":"open_url","url_or_query":"https://instagram.com"}
"abre meu Gmail" → {"action":"open_url","url_or_query":"https://mail.google.com"}
"abre meu email" → {"action":"open_url","url_or_query":"https://mail.google.com"}
"abre meu Drive" → {"action":"open_url","url_or_query":"https://drive.google.com"}
"abre meu Google Drive" → {"action":"open_url","url_or_query":"https://drive.google.com"}
"abre o Google Meet" → {"action":"open_url","url_or_query":"https://meet.google.com"}
"abre meu Calendar" → {"action":"open_url","url_or_query":"https://calendar.google.com"}
"abre o Google Maps" → {"action":"open_url","url_or_query":"https://maps.google.com"}
"abre o Google Fotos" → {"action":"open_url","url_or_query":"https://photos.google.com"}
"pesquisa clima em São Paulo" → {"action":"open_url","url_or_query":"clima São Paulo"}
"abre o Chrome" → {"action":"open_app","app_name":"chrome"}
"abre o Discord" → {"action":"open_app","app_name":"discord"}
"abre o Spotify" → {"action":"open_app","app_name":"spotify"}
"abre o bloco de notas" → {"action":"open_app","app_name":"bloco de notas"}
"abre a calculadora" → {"action":"open_app","app_name":"calculadora"}
"escreve um email para meu chefe dizendo que vou chegar atrasado amanhã" → {"action":"write_text","content":"Assunto: Atraso amanhã\n\nOlá [Nome],\n\nGostaria de informar que amanhã chegarei um pouco atrasado ao trabalho. Peço desculpas pelo inconveniente e me comprometo a compensar o tempo.\n\nAtenciosamente,\n[Seu nome]","description":"email para o chefe sobre atraso"}
"redige uma mensagem pedindo folga na sexta" → {"action":"write_text","content":"Olá,\n\nVenho por meio desta solicitar uma folga na próxima sexta-feira. Caso necessário, posso repor as atividades conforme combinado.\n\nConto com a compreensão de vocês.\n\nAtenciosamente,\n[Seu nome]","description":"mensagem solicitando folga na sexta"}
"cria um texto sobre inteligência artificial" → {"action":"write_text","content":"<texto completo sobre IA>","description":"texto sobre inteligência artificial"}
"que horas são" → {"action":"chat","reply":"Não tenho acesso ao relógio, mas você pode ver no canto inferior direito da tela."}
"qual a capital do Brasil" → {"action":"chat","reply":"A capital do Brasil é Brasília."}
"quanto é 247 vezes 8" → {"action":"chat","reply":"247 vezes 8 é 1.976."}
"oi" → {"action":"chat","reply":"Oi! Como posso ajudar?"}
"obrigado" → {"action":"chat","reply":"De nada! Precisa de mais alguma coisa?"}

Para write_text: gere o conteúdo COMPLETO e bem formatado no campo content. Use \\n para quebras de linha. O texto deve estar pronto para colar diretamente.

Responda SOMENTE o JSON, nenhum texto adicional, sem markdown.`;

let history: Message[] = [];
let lastActivity = Date.now();

export function clearHistory(): void {
  history = [];
  lastActivity = Date.now();
}

function actionSummary(action: BrainAction): string {
  switch (action.action) {
    case "play_music":  return `Toquei "${action.query}" no Spotify.`;
    case "open_url":    return `Abri: ${action.url_or_query}`;
    case "open_app":    return `Abri o app: ${action.app_name}`;
    case "write_text":  return `Texto pronto: ${action.description}`;
    case "unknown":     return "Não entendi o pedido.";
    default:            return "";
  }
}

export async function decideBrain(text: string): Promise<BrainAction> {
  const cfg    = getConfig();
  const apiKey = getApiKey();
  if (!apiKey) throw apiKeyError();

  const now = Date.now();
  if (now - lastActivity > cfg.chatIdleResetMs) history = [];
  lastActivity = now;

  history.push({ role: "user", content: text });

  const maxMsgs = cfg.chatHistoryTurns * 2;
  if (history.length > maxMsgs) history = history.slice(history.length - maxMsgs);

  let res: Response;
  try {
    res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.brainModel,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });
  } catch (e) {
    throw networkError(String(e));
  }

  if (res.status === 401) throw apiKeyError();
  if (!res.ok) throw networkError(`Brain HTTP ${res.status} ${await safeText(res)}`);

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "{}";

  let action: BrainAction;
  try {
    action = JSON.parse(content) as BrainAction;
    if (!action.action) action = { action: "unknown" };
  } catch {
    action = { action: "unknown" };
  }

  // Store natural language summary so context stays readable for follow-up questions
  const assistantMsg = action.action === "chat" ? action.reply : actionSummary(action);
  history.push({ role: "assistant", content: assistantMsg });

  return action;
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 300); } catch { return ""; }
}
