import { shell } from "electron";

const SITE_MAP: Record<string, string> = {
  youtube: "https://youtube.com",
  "youtube music": "https://music.youtube.com",
  google: "https://google.com",
  gmail: "https://mail.google.com",
  instagram: "https://instagram.com",
  twitter: "https://twitter.com",
  "x.com": "https://x.com",
  facebook: "https://facebook.com",
  whatsapp: "https://web.whatsapp.com",
  twitch: "https://twitch.tv",
  reddit: "https://reddit.com",
  netflix: "https://netflix.com",
  github: "https://github.com",
  chatgpt: "https://chat.openai.com",
  spotify: "https://open.spotify.com",
};

const YT_SEARCH = "https://www.youtube.com/results?search_query=";
const GOOGLE_SEARCH = "https://www.google.com/search?q=";

export async function openUrl(urlOrQuery: string): Promise<string> {
  // Already a valid URL
  try {
    const u = new URL(urlOrQuery);
    if (u.protocol === "http:" || u.protocol === "https:") {
      await shell.openExternal(urlOrQuery);
      return `Abrindo ${urlOrQuery}.`;
    }
  } catch { /* not a URL */ }

  // Known site name
  const key = urlOrQuery.toLowerCase().trim();
  const knownUrl = SITE_MAP[key];
  if (knownUrl) {
    await shell.openExternal(knownUrl);
    return `Abrindo ${urlOrQuery}.`;
  }

  // Generic search → Google
  await shell.openExternal(GOOGLE_SEARCH + encodeURIComponent(urlOrQuery));
  return `Pesquisando "${urlOrQuery}" no Google.`;
}
