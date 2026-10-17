/**
 * Voz pelo VoiceStudio (17/10): o estúdio de modelos de voz abertos que roda neste PC
 * (OmniVoice, CosyVoice, VoxCPM2…). Ele expõe uma API no formato da OpenAI em
 * `127.0.0.1:3900` — `POST /v1/audio/speech` devolve o áudio, `GET /v1/audio/voices` lista os
 * perfis de voz criados lá.
 *
 * O endereço é fixo no próprio PC de propósito: um campo de URL nos Ajustes deixaria um script
 * na página mandar tudo que a Ely fala para um servidor de fora. Fechado ou sem GPU, quem
 * chama cai na voz do Edge — a Ely nunca fica muda por causa dele.
 */

export const VOICESTUDIO_URL = "http://127.0.0.1:3900";
/** A primeira fala carrega o modelo na GPU; as seguintes saem em poucos segundos. */
const TIMEOUT_MS = 60_000;

export interface VozDoStudio { id: string; nome: string }

/** Nome ou ID de perfil aceito no config: letras, números, espaço, `-`, `_`, `.`. Pura. */
export function perfilValido(v: unknown): v is string {
  return typeof v === "string" && v.length <= 80 && /^[\p{L}\p{N} ._-]*$/u.test(v);
}

/**
 * A velocidade da fala (em %, a mesma régua do Edge) no `speed` da API (1 = normal). Pura.
 */
export function velocidadeDoStudio(ratePct: string): number {
  const n = Number(String(ratePct).replace("%", ""));
  const v = 1 + (Number.isFinite(n) ? n : 0) / 100;
  return Math.max(0.5, Math.min(2, Math.round(v * 100) / 100));
}

/**
 * Acha o perfil pelo nome (como aparece no VoiceStudio, sem diferença de maiúscula) ou pelo
 * ID. Vazio = a voz padrão do motor ativo. Pura.
 */
export function resolverPerfil(escolha: string, vozes: VozDoStudio[]): string {
  const alvo = escolha.trim();
  if (!alvo) return "default";
  const porId = vozes.find((v) => v.id === alvo);
  if (porId) return porId.id;
  const dobrar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const porNome = vozes.find((v) => dobrar(v.nome) === dobrar(alvo));
  return porNome ? porNome.id : alvo;
}

async function comTempo(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

/** Os perfis de voz do VoiceStudio, ou null se ele não estiver aberto. */
export async function vozesDoStudio(): Promise<VozDoStudio[] | null> {
  try {
    const r = await comTempo(`${VOICESTUDIO_URL}/v1/audio/voices`, {}, 3000);
    if (!r.ok) return null;
    const j = await r.json() as { voices?: { voice_id?: unknown; name?: unknown; type?: unknown }[] };
    return (j.voices ?? [])
      .filter((v) => v.type === "profile" && typeof v.voice_id === "string")
      .map((v) => ({ id: String(v.voice_id), nome: String(v.name ?? v.voice_id) }));
  } catch { return null; }
}

let cacheVozes: { em: number; vozes: VozDoStudio[] } | null = null;

/** Sintetiza no VoiceStudio e devolve o MP3. Lança se ele estiver fechado ou falhar. */
export async function sintetizarNoStudio(texto: string, perfil: string, ratePct: string): Promise<Buffer> {
  if (perfil.trim() && (!cacheVozes || Date.now() - cacheVozes.em > 60_000)) {
    const vozes = await vozesDoStudio();
    if (!vozes) throw new Error("VoiceStudio fechado");
    cacheVozes = { em: Date.now(), vozes };
  }
  const voice = resolverPerfil(perfil, cacheVozes?.vozes ?? []);
  const r = await comTempo(`${VOICESTUDIO_URL}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `tts-1` é o apelido do motor que estiver ativo no VoiceStudio.
    body: JSON.stringify({ model: "tts-1", input: texto, voice, response_format: "mp3", speed: velocidadeDoStudio(ratePct), language: "pt" }),
  }, TIMEOUT_MS);
  if (!r.ok) throw new Error(`VoiceStudio respondeu ${r.status}`);
  const mp3 = Buffer.from(await r.arrayBuffer());
  if (!mp3.length) throw new Error("VoiceStudio devolveu áudio vazio");
  return mp3;
}

const KBPS_MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const KBPS_MPEG2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

/**
 * O bitrate do MP3 pelo cabeçalho do primeiro quadro (pula a etiqueta ID3). O Edge manda
 * sempre 48 kbps; o VoiceStudio passa pelo ffmpeg e pode mandar outro — sem isto a duração
 * (e o pulso da bolota) sairia errada. Pura; devolve null se não achar.
 */
export function kbpsDoMp3(buf: Buffer): number | null {
  let i = 0;
  if (buf.length > 10 && buf.toString("latin1", 0, 3) === "ID3") {
    i = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  }
  for (const fim = Math.min(buf.length - 3, i + 64 * 1024); i < fim; i++) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
    const versao = (buf[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const camada = (buf[i + 1] >> 1) & 3; // 1 = Layer III
    if (versao === 1 || camada !== 1) continue;
    const kbps = (versao === 3 ? KBPS_MPEG1_L3 : KBPS_MPEG2_L3)[buf[i + 2] >> 4];
    if (kbps) return kbps;
  }
  return null;
}
