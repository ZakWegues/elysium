import { getApiKey, getConfig } from "../main/config";
import { apiKeyError, networkError } from "./errors";
import { nomesParaOuvir } from "./gostos";

const GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * Transcrição de voz via Groq Whisper.
 * Recebe o áudio gravado (webm/opus do MediaRecorder) e devolve o texto PT-BR.
 */
export async function transcribe(audio: Uint8Array): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw apiKeyError();

  if (!audio || audio.byteLength < 1024) {
    console.error(`[STT] áudio vazio/curto demais (${audio?.byteLength ?? 0} bytes) — tratando como silêncio`);
    // áudio vazio/curto demais — trata como fala não captada
    return "";
  }

  const { mime, ext, label } = detectAudioType(audio);
  console.log(`[STT] transcrevendo ${audio.byteLength} bytes, formato detectado pela assinatura: ${label} — enviado à Groq como ${mime}/${ext}`);

  const cfg = getConfig();
  const form = new FormData();
  const blob = new Blob([Buffer.from(audio)], { type: mime });
  form.append("file", blob, `audio.${ext}`);
  form.append("model", cfg.sttModel);
  form.append("language", "pt");
  // 25/11: com detalhes, para saber quando não havia fala nenhuma.
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  // 23/11: os artistas dele ajudam o nome em inglês a sair certo. Áudio curto fica sem: no silêncio
  // o Whisper repetiria a lista.
  const nomes = audio.byteLength > 24_000 ? nomesParaOuvir() : [];
  if (nomes.length) form.append("prompt", `Pedido em português para a Ely. Pode citar: ${nomes.join(", ")}.`.slice(0, 600));

  let res: Response;
  try {
    res = await fetch(GROQ_STT_URL, {
      // 31/10: o pedido de voz não pode ficar pendurado sem prazo.
      signal: AbortSignal.timeout(30_000),
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (e) {
    console.error("[STT] falha de rede ao chamar a Groq:", e);
    throw networkError(String(e));
  }

  if (res.status === 401) throw apiKeyError();
  if (!res.ok) {
    const text = await safeText(res);
    console.error(`[STT] Groq retornou ${res.status}: ${text}`);
    throw networkError(`STT HTTP ${res.status} ${text}`);
  }

  let data: { text?: string; segments?: { text?: string; no_speech_prob?: number; avg_logprob?: number }[] };
  try {
    data = (await res.json()) as typeof data;
  } catch (e) {
    console.error("[STT] resposta da Groq não é JSON válido:", e);
    throw networkError(`resposta inválida da Groq: ${String(e)}`);
  }
  if (semFala(data)) {
    console.log("[STT] áudio sem fala; descartado");
    return "";
  }
  return (data.text || "").trim();
}

/** O que o Whisper inventa no silêncio. */
const DE_SILENCIO = /^(?:obrigad[oa]|muito obrigad[oa]|tchau(?: tchau)?|legendas? (?:pela|por).*|inscreva-se.*|e a[íi]|[.…\s]*|amara\.org.*)[.!…]?$/i;

/** Áudio sem fala: todos os trechos dizem isso, ou é uma frase típica de silêncio com dúvida. Pura. */
export function semFala(d: { text?: string; segments?: { no_speech_prob?: number; avg_logprob?: number }[] }): boolean {
  const s = d.segments ?? [];
  if (!s.length) return false;
  const duvida = (x: { no_speech_prob?: number }) => x.no_speech_prob ?? 0;
  if (s.every((x) => duvida(x) > 0.7 && (x.avg_logprob ?? 0) < -0.5)) return true;
  return DE_SILENCIO.test((d.text ?? "").trim()) && s.every((x) => duvida(x) > 0.25 || (x.avg_logprob ?? 0) < -0.7);
}

/** Identifica o container real pelos magic bytes (independe do que o cliente alega mandar) e escolhe mime/extensão corretos pra Groq. */
function detectAudioType(audio: Uint8Array): { mime: string; ext: string; label: string } {
  const b = audio;
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    return { mime: "audio/webm", ext: "webm", label: "webm/mkv (EBML)" };
  }
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    return { mime: "audio/mp4", ext: "m4a", label: `mp4/m4a (ftyp, brand="${brand}")` };
  }
  if (b.length >= 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) {
    return { mime: "audio/ogg", ext: "ogg", label: "ogg" };
  }
  if (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    return { mime: "audio/mpeg", ext: "mp3", label: "mp3 (ID3)" };
  }
  if (b.length >= 4 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
    return { mime: "audio/wav", ext: "wav", label: "wav/riff" };
  }
  const hex = Array.from(b.slice(0, 4)).map(x => x.toString(16).padStart(2, "0")).join(" ");
  // desconhecido — assume webm (comportamento original, cobre o gravador desktop)
  return { mime: "audio/webm", ext: "webm", label: `desconhecido (primeiros bytes: ${hex}), assumindo webm` };
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}
