import { getApiKey, getConfig, marcarModeloMorto } from "../main/config";
import { blocoDoModoNaImagem, modoAtivo } from "./modos";
import { candidatosDeVisao, modelosDaGroq } from "./catalogoGroq";
import { apiKeyError, networkError } from "./errors";
import { captureScreen } from "./screenCapture";

/**
 * Visão — responde perguntas sobre uma imagem.
 *
 * Duas origens: o print da tela do PC ("o que tem na minha tela?", "resume esse erro")
 * e uma foto tirada pelo celular ("o que tá escrito nesta placa?").
 *
 * O modelo usado é de raciocínio e emite o pensamento em blocos `<think>` antes da
 * resposta. Isso precisa sair antes de qualquer coisa: o texto vai ser falado em voz
 * alta, e ouvir o modelo pensando é pior do que inútil.
 */

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const VISION_SYSTEM_PROMPT = `Você descreve e interpreta imagens para um assistente de voz em português do Brasil.

Sua resposta vai ser LIDA EM VOZ ALTA. Portanto:
- Responda em 1 a 3 frases, direto ao ponto.
- Nada de markdown, listas ou títulos.
- Se a pergunta for sobre um texto na imagem, leia o texto relevante em vez de descrever a aparência dele.
- Se a imagem não tiver o que foi perguntado, diga isso em uma frase.`;

/**
 * Remove o raciocínio do modelo.
 *
 * Trata também o caso do bloco não fechado: quando a resposta bate no limite de tokens
 * no meio do pensamento, sobra um `<think>` sem par, e sem este segundo passo a fala
 * sairia como o pensamento inteiro.
 */
function stripThinking(raw: string): string {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const dangling = text.lastIndexOf("<think>");
  if (dangling !== -1) text = text.slice(0, dangling);
  return text.trim();
}

/**
 * Modelo de visão escolhido pelo catálogo quando o configurado sumiu (bloco 84). Vale até o
 * app reiniciar — aí o `healModel` do config já sabe, pela lista de aposentados.
 */
let visaoDescoberta: string | null = null;

export async function askAboutImage(imageBase64: string, question: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw apiKeyError();
  const cfg = getConfig();
  const modelo = visaoDescoberta ?? cfg.visionModel;
  try {
    return await perguntarAoModelo(apiKey, modelo, imageBase64, question);
  } catch (e) {
    // 404 = o modelo saiu do catálogo (qwen3.6 → qwen3.8 em 28/09/2026). Em vez de a
    // visão ficar morta até alguém editar o config, pergunta à Groq o que existe hoje.
    if (!(e instanceof ModeloSumiu)) throw e;
    marcarModeloMorto("groq", modelo);
    const alternativa = candidatosDeVisao(await modelosDaGroq(true).catch(() => [])).find(m => m !== modelo);
    if (!alternativa) throw networkError(`Visão: o modelo ${modelo} saiu da Groq e a conta não tem outro que enxergue.`);
    console.warn(`[visão] ${modelo} sumiu da Groq; usando ${alternativa}.`);
    visaoDescoberta = alternativa;
    return perguntarAoModelo(apiKey, alternativa, imageBase64, question);
  }
}

class ModeloSumiu extends Error {}

function modoNaImagem(): string {
  try { return blocoDoModoNaImagem(modoAtivo()); } catch { return ""; }
}

async function perguntarAoModelo(apiKey: string, modelo: string, imageBase64: string, question: string): Promise<string> {
  const prompt = question.trim() || "O que aparece nesta imagem?";

  let res: Response;
  try {
    res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: "system", content: VISION_SYSTEM_PROMPT + modoNaImagem() },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            ],
          },
        ],
        temperature: 0.3,
        // Folgado de propósito: o raciocínio consome tokens antes da resposta, e um
        // teto apertado corta a resposta justamente por causa do pensamento.
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw networkError(String(e));
  }

  if (res.status === 401) throw apiKeyError();
  if (res.status === 404) throw new ModeloSumiu(modelo);
  if (!res.ok) throw networkError(`Visão HTTP ${res.status} ${await safeText(res)}`);

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const answer = stripThinking(data.choices?.[0]?.message?.content ?? "");
  return answer || "Não consegui interpretar a imagem.";
}

/** Atalho para "o que tem na minha tela?" — captura e pergunta numa tacada só. */
export async function askAboutScreen(question: string): Promise<string> {
  // Menor que o espelhamento: aqui quem lê é o modelo, não o olho humano, e imagem
  // grande só encarece a chamada sem melhorar a leitura.
  const frame = await captureScreen({ maxWidth: 1100, quality: 70 });
  return askAboutImage(frame.base64, question);
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 300); } catch { return ""; }
}
