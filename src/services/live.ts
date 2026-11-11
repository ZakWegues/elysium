import { semAcento } from "./texto";

/**
 * Modo live (fase 21, bloco 217) — conversa contínua em turnos: ela responde e volta a ouvir
 * sozinha, sem atalho, até ele dizer "tchau", usar o botão do live ou ficar 60 s calado.
 *
 * Opt-in de propósito: o dono tirou a mão livre em 02/10. Liga só quando ele pede, nunca fica
 * ligado depois de reiniciar, e o microfone aberto aparece (esfera ciano no Chat). Como a voz toca pelo
 * PowerShell, o cancelamento de eco do navegador não a enxerga: o live é ALTERNADO (ela termina
 * de falar, depois ouve) — interromper falando por cima só funcionaria de fone.
 *
 * Aqui só a parte pura: que frase liga, que frase desliga, e o que é "nada" do Whisper.
 */

export const SILENCIO_LIVE_MS = 60_000;

/**
 * 19/10: quando a resposta falada termina numa pergunta, o microfone abre sozinho por este tempo
 * — dá para responder sem dizer "Ely" de novo. Ninguém falou, fecha calado.
 */
export const JANELA_RESPOSTA_MS = 7_000;

/**
 * A resposta pede uma resposta dele? Termina em pergunta (a última frase, ignorando aspas e
 * espaço) ou é o "Confirma? Diga sim." da confirmação. Uma "?" no meio de um nome de arquivo ou
 * citação não conta. Pura.
 */
export function pedeResposta(reply: string): boolean {
  const t = reply.trim().replace(/["'”’»)\]\s]+$/u, "");
  if (!t) return false;
  if (/Confirma\? Diga sim\.?$/.test(t)) return true;
  return t.endsWith("?");
}

function norm(t: string): string {
  return semAcento(t).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().replace(/^(ely|elysium) /, "").replace(/ (ely|elysium)$/, "");
}

/** "modo live", "vamos conversar", "conversa comigo"… (frase inteira). Pura. */
export function ehEntradaDoLive(texto: string): boolean {
  return /^(liga |ativa |entra no |abre o )?(o )?modo (live|ao vivo|conversa)$|^vamos conversar( um pouco)?$|^conversa comigo$|^bora conversar$/.test(norm(texto));
}

/** "tchau", "sai do modo live", "chega", "pode parar de ouvir"… Pura. */
export function ehSaidaDoLive(texto: string): boolean {
  return /^(tchau|tchau tchau|ate mais|ate logo|falou|valeu tchau|obrigad[oa] tchau|chega|chega por hoje|encerra(r)?( a)? conversa|para de ouvir|pode parar de ouvir|sai(r)? do modo (live|ao vivo|conversa)|desliga( o)? modo (live|ao vivo|conversa)|fim do modo (live|conversa))$/.test(norm(texto));
}

/**
 * Frases que o Whisper inventa com áudio quase vazio (ruído, respiração) — no live o microfone
 * fica aberto e isso aparecia como pedido. Pura.
 */
export function ehAlucinacaoDoWhisper(texto: string): boolean {
  const t = norm(texto);
  if (t.length < 2) return true;
  // "obrigado" sozinho NÃO entra: com a espera pela fala, o áudio só vai quando houve voz, e um
  // "obrigado" dele é resposta de verdade.
  return /^(obrigad[oa] por assistir|legendas? (pela comunidade|por).*|inscreva se.*|tchau tchau tchau|hu*m+|h+m+|ah+|uh+|music|musica)$/.test(t)
    || /amara org|legendas pela comunidade|subtitles by/.test(t);
}
