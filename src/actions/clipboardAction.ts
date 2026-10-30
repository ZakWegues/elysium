import { clipboard } from "electron";
import { getApiKey, getConfig } from "../main/config";
import { apiKeyError, networkError } from "../services/errors";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

// Direct text-transformation call — bypasses action routing and chat history
async function transformText(instruction: string, content: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw apiKeyError();

  const cfg = getConfig();
  let res: Response;
  try {
    res = await fetch(GROQ_CHAT_URL, {
      // 31/10: sem prazo, a ação travava para sempre se a Groq não respondesse.
      signal: AbortSignal.timeout(20_000),
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.brainModel,
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente de transformação de texto. Siga a instrução e retorne APENAS o texto transformado, em português do Brasil, sem explicações extras.",
          },
          {
            role: "user",
            content: `Instrução: ${instruction}\n\nTexto:\n${content.slice(0, 3000)}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });
  } catch (e) {
    throw networkError(String(e));
  }

  if (!res.ok) throw networkError(`HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (data.choices?.[0]?.message?.content ?? "").trim() || "Não consegui processar o texto.";
}

export async function clipboardRead(instruction: string): Promise<string> {
  const text = clipboard.readText().trim();
  if (!text) return "A área de transferência está vazia.";

  const result = await transformText(instruction, text);
  // Write result back to clipboard so user can paste it
  clipboard.writeText(result);
  return `Pronto! Resultado copiado para a área de transferência: ${result.slice(0, 120)}${result.length > 120 ? "…" : ""}`;
}
