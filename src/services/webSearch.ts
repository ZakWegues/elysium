import { getApiKey, getConfig } from "../main/config";
import { apiKeyError, networkError } from "./errors";

/**
 * Busca na web.
 *
 * Não há chave de serviço de busca em lugar nenhum do projeto, e isso é de propósito:
 * os modelos `groq/compound*` são sistemas agênticos que pesquisam sozinhos e devolvem
 * a resposta já redigida. Uma conta a menos para o usuário criar, um segredo a menos
 * para guardar, e a mesma chave da Groq que já existe.
 */

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const SEARCH_SYSTEM_PROMPT = `Você responde perguntas pesquisando na web, para um assistente de voz em português do Brasil.

Sua resposta vai ser LIDA EM VOZ ALTA. Portanto:
- Responda em 1 a 3 frases, direto ao ponto, já com a informação encontrada.
- Nada de markdown, listas, títulos, links ou citações de fonte.
- Números e datas por extenso quando ficarem mais naturais falados.
- Se a busca não achar, diga isso em uma frase em vez de inventar.`;

export async function searchWeb(query: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw apiKeyError();
  const cfg = getConfig();

  let res: Response;
  try {
    res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.searchModel,
        messages: [
          { role: "system", content: SEARCH_SYSTEM_PROMPT },
          { role: "user", content: query },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
      // Generoso: o modelo faz buscas de verdade antes de responder, então demora bem
      // mais que uma chamada de texto comum.
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw networkError(String(e));
  }

  if (res.status === 401) throw apiKeyError();
  if (!res.ok) {
    if (res.status === 429) {
      return "Minha ferramenta de pesquisa atingiu o limite de consultas por minuto. Aguarde um pouquinho e pergunte de novo!";
    }
    throw networkError(`Busca HTTP ${res.status} ${await safeText(res)}`);
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string; executed_tools?: { type: string }[] } }[];
  };
  const message = data.choices?.[0]?.message;
  const answer = (message?.content ?? "")
    // O modelo às vezes deixa markdown escapar mesmo instruído a não usar; isso seria
    // lido em voz alta como "asterisco asterisco".
    .replace(/\*\*/g, "")
    .trim();

  if (!message?.executed_tools?.some(t => t.type === "search")) {
    console.warn("[busca] o modelo respondeu sem pesquisar — resposta pode estar desatualizada");
  }

  return answer || "Não achei nada sobre isso.";
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 300); } catch { return ""; }
}

