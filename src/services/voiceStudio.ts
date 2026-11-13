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
export interface VozDoStudio { id: string; nome: string }

/** Nome ou ID de perfil aceito no config: letras, números, espaço, `-`, `_`, `.`. Pura. */
export function perfilValido(v: unknown): v is string {
  return typeof v === "string" && v.length <= 80 && /^[\p{L}\p{N} ._-]*$/u.test(v);
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

/**
 * 12/11: o perfil que a Ely usa. Escolhido em Ajustes → o de lá; vazio → o primeiro perfil em
 * português (o nome diz), senão nenhum (o motor usa a voz padrão dele). Pura.
 */
export function escolherPerfilStudio(escolha: string, vozes: VozDoStudio[]): string | null {
  if (escolha.trim()) return resolverPerfil(escolha, vozes);
  return vozes.find((v) => /portugu|pt-?br|brasil/i.test(v.nome))?.id ?? null;
}
