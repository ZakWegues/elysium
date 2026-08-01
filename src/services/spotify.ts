import * as crypto from "node:crypto";
import { shell } from "electron";
import Store from "electron-store";
import { getConfig } from "../main/config";

/**
 * Spotify Web API.
 *
 * ## Por que PKCE e não client secret
 *
 * Este app roda na máquina do usuário. Um "segredo" embutido num binário instalado não
 * é segredo — qualquer um abre o arquivo e lê. O fluxo PKCE foi desenhado exatamente
 * para esse caso: o client ID é público por natureza (aparece na própria URL de login)
 * e a prova de posse é um valor aleatório gerado a cada tentativa. Não há segredo
 * nenhum para vazar aqui.
 *
 * ## O que fica guardado
 *
 * Só o refresh token, em disco, no perfil do usuário — nunca versionado. O access
 * token vive em memória e é renovado sob demanda.
 *
 * ## Limitação de plataforma
 *
 * Controlar reprodução exige conta Premium e um dispositivo ativo. "Ativo" quer dizer
 * um app do Spotify aberto e tocando (ou pausado) em algum lugar — a API não liga o
 * Spotify do nada. Quando não há dispositivo, quem chama cai no comportamento antigo
 * de abrir o app.
 */

const AUTH_URL  = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE  = "https://api.spotify.com/v1";

const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
].join(" ");

interface SpotifyAuth {
  refreshToken: string | null;
}

const store = new Store<{ spotify: SpotifyAuth }>({
  name: "spotify",
  defaults: { spotify: { refreshToken: null } },
});

/** Tentativa de login em curso. Só uma por vez — o `state` precisa casar na volta. */
let pendingLogin: { verifier: string; state: string; startedAt: number } | null = null;

/** O access token vive só em memória: dura uma hora e não vale persistir. */
let accessToken: string | null = null;
let accessTokenExpiresAt = 0;

const LOGIN_WINDOW_MS = 5 * 60_000;

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function redirectUri(): string {
  // Precisa bater EXATAMENTE com o que está cadastrado no painel do Spotify. Loopback
  // explícito, não "localhost": o Spotify passou a rejeitar o nome.
  return `http://127.0.0.1:${getConfig().serverPort ?? 4200}/api/spotify/callback`;
}

export function isConnected(): boolean {
  return !!store.get("spotify").refreshToken;
}

export function disconnect(): void {
  store.set("spotify", { refreshToken: null });
  accessToken = null;
  accessTokenExpiresAt = 0;
}

/** Abre o login no navegador padrão e devolve a URL usada. */
export function beginLogin(): string {
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));

  pendingLogin = { verifier, state, startedAt: Date.now() };

  const url = `${AUTH_URL}?` + new URLSearchParams({
    client_id: getConfig().spotifyClientId,
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    scope: SCOPES,
  }).toString();

  // Navegador do sistema, não uma janela do Electron: o usuário provavelmente já está
  // logado no Spotify ali, e uma janela embutida pedindo senha é indistinguível de
  // phishing.
  void shell.openExternal(url);
  return url;
}

/**
 * Fecha o login com o código devolvido pelo Spotify.
 *
 * O `state` é conferido porque esta rota é a única do servidor sem autenticação — ela
 * precisa ser, já que o Spotify redireciona o navegador e não tem como mandar o bearer
 * token. Sem essa checagem, qualquer um na rede poderia disparar uma troca de código.
 */
export async function completeLogin(code: string, state: string): Promise<void> {
  const pending = pendingLogin;
  pendingLogin = null;

  if (!pending) throw new Error("nenhum login do Spotify em andamento");
  if (pending.state !== state) throw new Error("state não confere");
  if (Date.now() - pending.startedAt > LOGIN_WINDOW_MS) throw new Error("login expirou");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: getConfig().spotifyClientId,
      code_verifier: pending.verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`troca de código falhou: HTTP ${res.status} ${await safeText(res)}`);

  const data = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!data.access_token || !data.refresh_token) throw new Error("resposta de token incompleta");

  accessToken = data.access_token;
  accessTokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  store.set("spotify", { refreshToken: data.refresh_token });
}

async function ensureAccessToken(): Promise<string> {
  // 60 s de folga: um token que expira no meio do voo devolve 401 e perde a ação.
  if (accessToken && Date.now() < accessTokenExpiresAt - 60_000) return accessToken;

  const refreshToken = store.get("spotify").refreshToken;
  if (!refreshToken) throw new Error("Spotify não conectado");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: getConfig().spotifyClientId,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 400 || res.status === 401) {
    // Refresh token revogado (senha trocada, acesso removido). Insistir não resolve —
    // limpa e obriga a reconectar.
    disconnect();
    throw new Error("Spotify desconectado, faça login de novo");
  }
  if (!res.ok) throw new Error(`refresh falhou: HTTP ${res.status}`);

  const data = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("refresh sem access_token");

  accessToken = data.access_token;
  accessTokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  // O Spotify às vezes rotaciona o refresh token; guardar o novo evita perder a sessão.
  if (data.refresh_token) store.set("spotify", { refreshToken: data.refresh_token });

  return accessToken;
}

async function api(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<unknown> {
  const token = await ensureAccessToken();
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  // 204 é a resposta normal dos comandos de reprodução: deu certo, sem corpo.
  if (res.status === 204) return null;
  if (res.status === 404) throw new Error("Nenhum dispositivo do Spotify ativo");
  if (res.status === 403) throw new Error("Ação não permitida — o Spotify exige conta Premium");
  if (!res.ok) throw new Error(`Spotify HTTP ${res.status} ${await safeText(res)}`);

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export interface NowPlaying {
  isPlaying: boolean;
  track: string;
  artist: string;
  album: string;
  albumArt: string | null;
  progressMs: number;
  durationMs: number;
  device: string | null;
}

export async function getNowPlaying(): Promise<NowPlaying | null> {
  const data = await api("/me/player") as {
    is_playing?: boolean;
    progress_ms?: number;
    device?: { name?: string };
    item?: {
      name?: string;
      duration_ms?: number;
      artists?: { name?: string }[];
      album?: { name?: string; images?: { url: string }[] };
    };
  } | null;

  if (!data?.item) return null;

  return {
    isPlaying:  !!data.is_playing,
    track:      data.item.name ?? "",
    artist:     (data.item.artists ?? []).map(a => a.name).filter(Boolean).join(", "),
    album:      data.item.album?.name ?? "",
    // A primeira imagem é a maior; o app reduz na exibição.
    albumArt:   data.item.album?.images?.[0]?.url ?? null,
    progressMs: data.progress_ms ?? 0,
    durationMs: data.item.duration_ms ?? 0,
    device:     data.device?.name ?? null,
  };
}

export async function play(): Promise<void>     { await api("/me/player/play", { method: "PUT" }); }
export async function pause(): Promise<void>    { await api("/me/player/pause", { method: "PUT" }); }
export async function next(): Promise<void>     { await api("/me/player/next", { method: "POST" }); }
export async function previous(): Promise<void> { await api("/me/player/previous", { method: "POST" }); }

export async function setVolume(percent: number): Promise<void> {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  await api("/me/player/volume", { method: "PUT", query: { volume_percent: String(clamped) } });
}

export async function seek(positionMs: number): Promise<void> {
  await api("/me/player/seek", { method: "PUT", query: { position_ms: String(Math.max(0, positionMs)) } });
}

/** Procura e toca no dispositivo ativo. Devolve o que começou a tocar. */
export async function playSearch(query: string): Promise<{ track: string; artist: string }> {
  const found = await api("/search", { query: { q: query, type: "track", limit: "1" } }) as {
    tracks?: { items?: { uri?: string; name?: string; artists?: { name?: string }[] }[] };
  };

  const item = found.tracks?.items?.[0];
  if (!item?.uri) throw new Error(`não achei "${query}" no Spotify`);

  await api("/me/player/play", { method: "PUT", body: { uris: [item.uri] } });
  return {
    track: item.name ?? query,
    artist: (item.artists ?? []).map(a => a.name).filter(Boolean).join(", "),
  };
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 200); } catch { return ""; }
}
