import { getApiKey, getConfig } from "../main/config";
import { apiKeyError, networkError } from "./errors";

const GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * Transcrição de voz via Groq Whisper.
 * Recebe o áudio gravado (webm/opus do MediaRecorder) e devolve o texto PT-BR.
 */
export async function transcribe(audio: Uint8Array): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw apiKeyError();

  if (!audio || audio.byteLength < 1024) {
    // áudio vazio/curto demais — trata como fala não captada
    return "";
  }

  const cfg = getConfig();
  const form = new FormData();
  const blob = new Blob([Buffer.from(audio)], { type: "audio/webm" });
  form.append("file", blob, "audio.webm");
  form.append("model", cfg.sttModel);
  form.append("language", "pt");
  form.append("response_format", "json");
  form.append("temperature", "0");

  let res: Response;
  try {
    res = await fetch(GROQ_STT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (e) {
    throw networkError(String(e));
  }

  if (res.status === 401) throw apiKeyError();
  if (!res.ok) {
    const text = await safeText(res);
    throw networkError(`STT HTTP ${res.status} ${text}`);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text || "").trim();
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}
