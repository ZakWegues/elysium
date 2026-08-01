import { shell } from "electron";
import { tryPlayOnSpotify } from "./spotifyControl";

const YT_MUSIC = "https://music.youtube.com/search?q=";

export async function playMusic(query: string): Promise<string> {
  // Com o Spotify conectado, a música começa a tocar de verdade no dispositivo ativo.
  // Antes, o melhor que dava para fazer era abrir o app já na busca certa e deixar o
  // usuário clicar.
  const played = await tryPlayOnSpotify(query);
  if (played) return played;

  // Sem conta conectada, sem Premium, ou sem dispositivo ativo: o protocolo do Spotify
  // abre o app direto na busca.
  const spotifyUrl = `spotify:search:${query}`;
  try {
    await shell.openExternal(spotifyUrl);
    return `Abri ${query} no Spotify.`;
  } catch {
    // Spotify não instalado.
    await shell.openExternal(YT_MUSIC + encodeURIComponent(query));
    return `Abrindo ${query} no YouTube Music.`;
  }
}
