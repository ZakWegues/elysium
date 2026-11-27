import * as crypto from "node:crypto";
import { shell } from "electron";
import Store from "electron-store";
import { cifrarTexto, decifrarTexto, getConfig } from "../main/config";
import { observarFaixa } from "./gostos";
import { melhorFaixa } from "./qualMusica";
import { semAcento } from "./texto";

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
  // 23/11: guardar as sugestões numa playlist. Quem conectou antes precisa reconectar para isso.
  "playlist-modify-private",
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
  store.set("spotify", { refreshToken: cifrarTexto(data.refresh_token) });
}

async function ensureAccessToken(): Promise<string> {
  // 60 s de folga: um token que expira no meio do voo devolve 401 e perde a ação.
  if (accessToken && Date.now() < accessTokenExpiresAt - 60_000) return accessToken;

  const refreshToken = decifrarTexto(store.get("spotify").refreshToken);
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
  if (data.refresh_token) store.set("spotify", { refreshToken: cifrarTexto(data.refresh_token) });
  // Fase 23.2: o token antigo (texto puro) é regravado cifrado.
  else if (!String(store.get("spotify").refreshToken ?? "").startsWith("enc:")) store.set("spotify", { refreshToken: cifrarTexto(refreshToken) });

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
  if (!text) return null;

  // Os comandos de reprodução costumam responder 204 sem corpo, mas nem sempre: o
  // Spotify às vezes devolve 2xx com um corpo que não é JSON (identificador de
  // requisição, corpo vazio com espaços). Estourar aqui reportaria falha para uma ação
  // que JÁ aconteceu — foi exatamente o que acontecia: a música pausava e o app
  // mostrava erro. Quem precisa de dados de verdade trata `null` como "não veio nada".
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export type RepeatState = "off" | "track" | "context";

export interface NowPlaying {
  isPlaying: boolean;
  track: string;
  artist: string;
  album: string;
  albumArt: string | null;
  progressMs: number;
  durationMs: number;
  device: string | null;
  /** Volume do dispositivo, 0-100. Null quando o dispositivo não expõe controle. */
  volumePercent: number | null;
  shuffle: boolean;
  repeat: RepeatState;
}

export async function getNowPlaying(): Promise<NowPlaying | null> {
  const data = await api("/me/player") as {
    is_playing?: boolean;
    progress_ms?: number;
    shuffle_state?: boolean;
    repeat_state?: RepeatState;
    device?: { name?: string; volume_percent?: number };
    item?: {
      name?: string;
      duration_ms?: number;
      artists?: { name?: string }[];
      album?: { name?: string; images?: { url: string }[] };
    };
  } | null;

  if (!data?.item) { observarFaixa(null); return null; }

  const agora: NowPlaying = {
    isPlaying:  !!data.is_playing,
    track:      data.item.name ?? "",
    artist:     (data.item.artists ?? []).map(a => a.name).filter(Boolean).join(", "),
    album:      data.item.album?.name ?? "",
    // A primeira imagem é a maior; o app reduz na exibição.
    albumArt:   data.item.album?.images?.[0]?.url ?? null,
    progressMs: data.progress_ms ?? 0,
    durationMs: data.item.duration_ms ?? 0,
    device:     data.device?.name ?? null,
    volumePercent: data.device?.volume_percent ?? null,
    shuffle:    !!data.shuffle_state,
    repeat:     data.repeat_state ?? "off",
  };
  // 23/11: o que ele ouve até o fim e o que pula entra nas sugestões.
  observarFaixa(agora);
  return agora;
}

export async function setShuffle(on: boolean): Promise<void> {
  await api("/me/player/shuffle", { method: "PUT", query: { state: String(on) } });
}

export async function setRepeat(state: RepeatState): Promise<void> {
  await api("/me/player/repeat", { method: "PUT", query: { state } });
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
  const faixa = await acharFaixa(query);
  if (!faixa) throw new Error(`não achei "${query}" no Spotify`);

  await api("/me/player/play", { method: "PUT", body: { uris: [faixa.uri] } });
  return { track: faixa.track, artist: faixa.artist };
}

// ── 23/11: o aparelho certo, fila e playlist ─────────────────────────────────

/**
 * A faixa da busca que combina com o pedido. O Spotify sempre devolve algo, mesmo sem relação
 * (23/11: "Roll It do System of a Down" tocou Mac Miller); nada que combine = null.
 */
export async function acharFaixa(busca: string, exata?: { titulo: string; artista: string }): Promise<{ uri: string; track: string; artist: string } | null> {
  const buscas = exata?.artista ? [`track:${exata.titulo} artist:${exata.artista}`, `${exata.titulo} ${exata.artista}`] : [busca];
  for (const q of buscas) {
    const found = await api("/search", { query: { q, type: "track", limit: "10" } }) as {
      tracks?: { items?: { uri?: string; name?: string; artists?: { name?: string }[] }[] };
    } | null;
    const faixas = (found?.tracks?.items ?? []).filter(i => i?.uri)
      .map(i => ({ uri: i.uri as string, track: i.name ?? busca, artist: (i.artists ?? []).map(a => a.name).filter(Boolean).join(", ") }));
    const f = melhorFaixa(exata ? `${exata.titulo} ${exata.artista}` : busca, faixas);
    if (f) return f;
  }
  return null;
}

/** Podcast, álbum, playlist ou artista com este nome (25/11) — o que combina melhor. */
export async function acharColecao(busca: string): Promise<{ uri: string; nome: string; tipo: string } | null> {
  const pedido = semAcento(busca);
  const limpa = busca.replace(/\b(?:o |a |os |as )?(?:podcasts?|epis[oó]dios?|[aá]lbum|disco|playlist|r[aá]dio)\b(?:\s+(?:d[aeo]s?|chamad[ao]))?/gi, " ").replace(/\s+/g, " ").trim() || busca;
  const ordem = /podcast|episodio/.test(pedido) ? ["show"] : /album|disco/.test(pedido) ? ["album"] : /playlist/.test(pedido) ? ["playlist"] : ["show", "album", "playlist"];
  type Item = { uri?: string; name?: string; publisher?: string; artists?: { name?: string }[]; owner?: { display_name?: string } };
  const found = await api("/search", { query: { q: limpa, type: ordem.join(","), limit: "8" } }) as Record<string, { items?: (Item | null)[] }> | null;
  for (const tipo of ordem) {
    const itens = (found?.[`${tipo}s`]?.items ?? []).filter((i): i is Item => !!i?.uri)
      .map(i => ({ uri: i.uri as string, tipo, nome: i.name ?? limpa, track: i.name ?? "", artist: i.publisher ?? (i.artists ?? []).map(a => a.name).join(", ") }));
    const m = melhorFaixa(limpa, itens);
    if (m) return { uri: m.uri, nome: m.nome, tipo };
  }
  return null;
}

const TIPOS = { pc: /^computer$/i, celular: /^smartphone$/i };
async function idDoAparelho(aparelho: "pc" | "celular"): Promise<string | null> {
  const r = await api("/me/player/devices") as { devices?: { id?: string | null; type?: string; is_active?: boolean; is_restricted?: boolean }[] } | null;
  const ds = (r?.devices ?? []).filter(d => d.id && !d.is_restricted && TIPOS[aparelho].test(d.type ?? ""));
  return (ds.find(d => d.is_active) ?? ds[0])?.id ?? null;
}

/** Toca a faixa naquele aparelho. false = o Spotify de lá está fechado (ou a conta não deixa). */
export async function tocarNo(aparelho: "pc" | "celular", uri: string | string[] | { contexto: string }): Promise<boolean> {
  try {
    const id = await idDoAparelho(aparelho);
    if (!id) return false;
    await api("/me/player/play", { method: "PUT", query: { device_id: id }, body: typeof uri === "object" && !Array.isArray(uri) ? { context_uri: uri.contexto } : { uris: [uri].flat() } });
    return true;
  } catch (e) {
    console.warn("[spotify] não toquei no aparelho:", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function transferirPara(aparelho: "pc" | "celular"): Promise<boolean> {
  const id = await idDoAparelho(aparelho);
  if (!id) return false;
  await api("/me/player", { method: "PUT", body: { device_ids: [id], play: true } });
  return true;
}

export async function uris(musicas: { titulo: string; artista: string }[]): Promise<string[]> {
  const achadas = await Promise.all(musicas.slice(0, 20).map(m => acharFaixa("", m).catch(() => null)));
  return [...new Set(achadas.filter((f): f is NonNullable<typeof f> => f !== null).map(f => f.uri))];
}

/** Põe na fila do que está tocando. Devolve quantas entraram. */
export async function porNaFila(musicas: { titulo: string; artista: string }[]): Promise<number> {
  let n = 0;
  for (const uri of await uris(musicas)) { await api("/me/player/queue", { method: "POST", query: { uri } }); n++; }
  return n;
}

export async function criarPlaylist(nome: string, musicas: { titulo: string; artista: string }[]): Promise<{ nome: string; total: number; uri: string }> {
  const lista = await uris(musicas);
  if (!lista.length) throw new Error("não achei essas músicas no Spotify");
  try {
    const p = await api("/me/playlists", { method: "POST", body: { name: nome, public: false } }) as { id?: string } | null;
    if (!p?.id) throw new Error("o Spotify não criou a playlist");
    try { await api(`/playlists/${p.id}/items`, { method: "POST", body: { uris: lista } }); }
    catch { await api(`/playlists/${p.id}/tracks`, { method: "POST", body: { uris: lista } }); }
    return { nome, total: lista.length, uri: `spotify:playlist:${p.id}` };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/Premium|scope|HTTP 401/i.test(m)) throw new Error("Saia e conecte o Spotify de novo no PC para liberar playlists.");
    throw e;
  }
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 200); } catch { return ""; }
}
