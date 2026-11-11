import { getGeminiKey } from "../main/config";
import { cotaEsgotada, registrarUsoGemini } from "./cotaGemini";
import type { Humor } from "./humor";

/**
 * A voz da Ely pelo Gemini (26/10, pedido do dono: "uma voz legal de graça"). Com a chave do Google
 * AI Studio dele, os modelos TTS do Gemini falam com entonação de gente e aceitam o TOM por
 * descrição ("calma, baixinho") — o que o Edge gratuito não faz. Falhou, sem chave ou cota
 * esgotada → `null`, e quem chama cai na voz neural do Edge (nunca na robótica).
 *
 * API de interações (`/v1beta/interactions`, a da documentação atual); a `generateContent` antiga
 * fica de reserva. O áudio volta em WAV (RIFF, 24 kHz, mono, 16 bits).
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";
/** O Lite primeiro: fala curta precisa sair rápido; o completo é a reserva. */
const MODELOS_TTS = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"];

export const VOZ_GEMINI_PADRAO = "Kore";

/** As vozes prontas do Gemini, com o jeito de cada uma em português (para Ajustes → Voz). */
export const VOZES_GEMINI: { nome: string; jeito: string }[] = [
  { nome: "Kore", jeito: "firme" }, { nome: "Aoede", jeito: "leve" }, { nome: "Leda", jeito: "jovem" },
  { nome: "Sulafat", jeito: "calorosa" }, { nome: "Despina", jeito: "suave" }, { nome: "Achernar", jeito: "macia" },
  { nome: "Vindemiatrix", jeito: "gentil" }, { nome: "Zephyr", jeito: "luminosa" }, { nome: "Autonoe", jeito: "clara e viva" },
  { nome: "Callirrhoe", jeito: "tranquila" }, { nome: "Erinome", jeito: "clara" }, { nome: "Laomedeia", jeito: "animada" },
  { nome: "Pulcherrima", jeito: "direta" }, { nome: "Gacrux", jeito: "madura" }, { nome: "Sadachbia", jeito: "alegre" },
  { nome: "Achird", jeito: "amigável" }, { nome: "Puck", jeito: "animado" }, { nome: "Charon", jeito: "informativo" },
  { nome: "Fenrir", jeito: "empolgado" }, { nome: "Orus", jeito: "firme" }, { nome: "Iapetus", jeito: "claro" },
  { nome: "Umbriel", jeito: "tranquilo" }, { nome: "Algieba", jeito: "suave" }, { nome: "Enceladus", jeito: "sussurrado" },
  { nome: "Algenib", jeito: "rouco" }, { nome: "Rasalgethi", jeito: "informativo" }, { nome: "Alnilam", jeito: "firme" },
  { nome: "Schedar", jeito: "equilibrado" }, { nome: "Zubenelgenubi", jeito: "descontraído" }, { nome: "Sadaltager", jeito: "sábio" },
];

export function vozGeminiValida(nome: string | undefined): string {
  return VOZES_GEMINI.some((v) => v.nome === nome) ? (nome as string) : VOZ_GEMINI_PADRAO;
}

/**
 * O tom da fala pelo contexto (pedido do dono): calma e baixa de noite, mais rápida com pressa,
 * acolhedora com cansaço ou tristeza; no resto, natural e simpática. Sempre sotaque do Brasil
 * (sem isso o modelo às vezes puxa o de Portugal). Vai em `speech_metadata.style`, que o modelo
 * NÃO lê em voz alta. Pura.
 */
export function estiloDaFala(o: { noite?: boolean; humor?: Humor; velocidade?: number } = {}): string {
  const partes = ["Brazilian Portuguese (pt-BR) accent", "natural, warm and friendly, like a helpful assistant talking to a friend"];
  if (o.noite) partes.push("calm, soft and a little quieter, it is late at night");
  if (o.humor === "apressado") partes.push("a bit faster and to the point");
  if (o.humor === "cansado" || o.humor === "triste") partes.push("gentle, caring and slower");
  const v = Number(o.velocidade);
  if (Number.isFinite(v) && v >= 4) partes.push("slightly fast pace");
  else if (Number.isFinite(v) && v <= -4) partes.push("slightly slow pace");
  return partes.join("; ");
}

/** Duração de um WAV PCM 16 bits mono (cabeçalho de 44 bytes). Pura. */
export function duracaoDoWav(wav: Buffer, taxa = 24_000): number {
  return Math.max(0, Math.round(((wav.length - 44) / (taxa * 2)) * 1000));
}

/** PCM cru (L16) → WAV, para quando a API devolver sem cabeçalho. Pura. */
export function pcmParaWav(pcm: Buffer, taxa = 24_000): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(taxa, 24); h.writeUInt32LE(taxa * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

type Busca = (url: string, init?: RequestInit) => Promise<Response>;

/** O áudio da resposta das interações (`steps[].content[]` do tipo audio, ou `output_audio`). Pura. */
export function audioDaInteracao(j: unknown): Buffer | null {
  const o = j as { output_audio?: { data?: string }; steps?: { type?: string; content?: { type?: string; data?: string }[] }[] };
  let dado = o.output_audio?.data;
  if (!dado) for (const s of o.steps ?? []) for (const c of s.content ?? []) if (c.type === "audio" && c.data) dado = c.data;
  if (!dado) return null;
  const b = Buffer.from(dado, "base64");
  return b.subarray(0, 4).toString() === "RIFF" ? b : pcmParaWav(b);
}

/** O áudio da `generateContent` antiga (`inlineData` em PCM L16). Pura. */
export function audioDoGenerate(j: unknown): Buffer | null {
  const o = j as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] };
  const dado = o.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!dado) return null;
  const b = Buffer.from(dado, "base64");
  return b.subarray(0, 4).toString() === "RIFF" ? b : pcmParaWav(b);
}

/** Fala pelo Gemini. `null` = sem chave, cota esgotada ou nenhum modelo respondeu. */
export async function sintetizarVozGemini(
  texto: string, voz: string, estilo: string,
  o: { prazoMs?: number; busca?: Busca; chave?: string } = {},
): Promise<{ wav: Buffer; modelo: string } | null> {
  const chave = o.chave ?? getGeminiKey();
  if (!chave || !texto.trim()) return null;
  const busca = o.busca ?? fetch;
  const nome = vozGeminiValida(voz);
  for (const modelo of MODELOS_TTS) {
    if (cotaEsgotada(modelo)) continue;
    const sinal = AbortSignal.timeout(o.prazoMs ?? 12_000);
    const cabecalhos = { "x-goog-api-key": chave, "Content-Type": "application/json" };
    try {
      let r = await busca(`${BASE}/interactions`, {
        method: "POST", headers: cabecalhos, signal: sinal,
        body: JSON.stringify({
          model: modelo,
          input: [{ type: "user_input", content: [{ type: "text", text: texto, annotations: [{ type: "speech_metadata", style: estilo }] }] }],
          response_format: { type: "audio", mime_type: "audio/wav", sample_rate: 24_000 },
          generation_config: { speech_config: [{ voice: nome }] },
        }),
      });
      let wav: Buffer | null = null;
      if (r.ok) wav = audioDaInteracao(await r.json());
      else if (r.status === 400 || r.status === 404) {
        // API antiga de reserva (modelo sem interações nesta conta).
        r = await busca(`${BASE}/models/${modelo}:generateContent`, {
          method: "POST", headers: cabecalhos, signal: sinal,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `Fale com este tom (${estilo}): ${texto}` }] }],
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: nome } } } },
          }),
        });
        if (r.ok) wav = audioDoGenerate(await r.json());
      }
      registrarUsoGemini("voz", modelo, r.status, r.ok ? "" : await r.text().catch(() => ""));
      if (wav && wav.length > 44) return { wav, modelo };
      if (!r.ok) console.warn(`[voz-gemini] ${modelo} respondeu ${r.status}`);
    } catch (e) {
      console.warn(`[voz-gemini] ${modelo} falhou:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}
