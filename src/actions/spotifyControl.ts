import { mediaControl, MediaOperation } from "./mediaControl";
import * as spotify from "../services/spotify";

/**
 * Controle de mídia com Spotify na frente e teclas de mídia atrás.
 *
 * A Web API do Spotify dá o que as teclas não dão: saber o que está tocando, pular
 * para uma faixa específica, ajustar volume por número. Mas ela só funciona com conta
 * Premium e um dispositivo ativo, e não serve para YouTube, VLC ou qualquer outro
 * player.
 *
 * Por isso a ordem: tenta o Spotify quando há sessão conectada e cai nas teclas
 * virtuais em qualquer falha. O usuário não deveria precisar saber qual caminho foi
 * usado — só que a música pausou.
 */

export async function smartMediaControl(operation: MediaOperation): Promise<string> {
  if (spotify.isConnected()) {
    try {
      switch (operation) {
        case "play":     await spotify.play();     return "Voltando a tocar.";
        case "pause":    await spotify.pause();    return "Pausado.";
        case "skip":     await spotify.next();     return await describeNext("Próxima faixa.");
        case "previous": await spotify.previous(); return await describeNext("Faixa anterior.");
        // Volume relativo não existe na API: ela só aceita valor absoluto, e ler o
        // atual para somar custaria uma chamada a mais e sairia dessincronizado.
        // Tecla de mídia resolve melhor.
        case "volume_up":
        case "volume_down":
          break;
      }
    } catch (e) {
      console.warn("[spotify] comando falhou, usando tecla de mídia:", e instanceof Error ? e.message : e);
    }
  }

  return mediaControl(operation);
}

/**
 * Pular deixa o Spotify um instante fora de sincronia; sem a pausa, a consulta devolve
 * a faixa antiga. Se não der certo, a confirmação genérica serve.
 */
async function describeNext(fallback: string): Promise<string> {
  try {
    await new Promise(r => setTimeout(r, 400));
    const now = await spotify.getNowPlaying();
    if (now?.track) return `Tocando ${now.track}, de ${now.artist}.`;
  } catch { /* confirmação genérica basta */ }
  return fallback;
}

/**
 * Toca uma busca. Com Spotify conectado e dispositivo ativo, começa a tocar de verdade;
 * senão, quem chama recorre a abrir o app na busca (comportamento antigo).
 */
export async function tryPlayOnSpotify(query: string): Promise<string | null> {
  if (!spotify.isConnected()) return null;
  try {
    const { track, artist } = await spotify.playSearch(query);
    return artist ? `Tocando ${track}, de ${artist}.` : `Tocando ${track}.`;
  } catch (e) {
    console.warn("[spotify] não consegui tocar direto:", e instanceof Error ? e.message : e);
    return null;
  }
}
