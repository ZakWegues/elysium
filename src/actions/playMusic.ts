import { shell } from "electron";

const YT_MUSIC = "https://music.youtube.com/search?q=";

export async function playMusic(query: string): Promise<string> {
  // spotify: protocol opens Spotify directly in the search for that query
  const spotifyUrl = `spotify:search:${query}`;
  try {
    await shell.openExternal(spotifyUrl);
    return `Tocando ${query} no Spotify.`;
  } catch {
    // Spotify not installed — fallback to YouTube Music
    await shell.openExternal(YT_MUSIC + encodeURIComponent(query));
    return `Abrindo ${query} no YouTube Music.`;
  }
}
