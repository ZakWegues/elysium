import { COMBINA_MINIMO, combina } from "./qualMusica";
import { semAcento } from "./texto";

/**
 * A API pública da Deezer (23/11): artista, parecidos, mais tocadas e o trecho de 30 s. Sem chave
 * e sem conta. É a fonte das sugestões porque o Spotify fechou a recomendação e os artistas
 * parecidos para apps novos. Só vai para fora o nome de um artista ou o id de uma música.
 */
const BASE = "https://api.deezer.com";

export interface ArtistaDz { id: number; nome: string; foto: string | null }
export interface MusicaDz { id: number; titulo: string; artista: string; artistaId: number; capa: string | null; duracao: number }

type Cru = Record<string, unknown>;
const texto = (v: unknown): string => (typeof v === "string" ? v : "");

/** Só endereço da própria Deezer vai para as telas. Pura. */
export function urlDaDeezer(v: unknown): string | null {
  const u = texto(v);
  return /^https:\/\/[a-z0-9.-]+\.dzcdn\.net\//.test(u) ? u : null;
}

/** Pura. */
export function lerArtista(a: Cru): ArtistaDz | null {
  const id = Number(a.id), nome = texto(a.name);
  return id > 0 && nome ? { id, nome, foto: urlDaDeezer(a.picture_medium) } : null;
}

/** Pura. */
export function lerMusica(m: Cru): MusicaDz | null {
  const id = Number(m.id), titulo = texto(m.title), art = (m.artist ?? {}) as Cru, alb = (m.album ?? {}) as Cru;
  if (!(id > 0) || !titulo || !texto(art.name) || m.readable === false) return null;
  return { id, titulo, artista: texto(art.name), artistaId: Number(art.id) || 0, capa: urlDaDeezer(alb.cover_medium), duracao: Number(m.duration) || 0 };
}

// A Deezer aceita 50 pedidos a cada 5 s: no máximo 6 ao mesmo tempo, com cache por dia.
let vagas = 6;
const fila: (() => void)[] = [];
async function vaga<T>(fn: () => Promise<T>): Promise<T> {
  if (vagas > 0) vagas--; else await new Promise<void>((r) => fila.push(r));
  try { return await fn(); } finally { const p = fila.shift(); if (p) p(); else vagas++; }
}

const cache = new Map<string, { em: number; v: unknown }>();
const DIA = 86_400_000;

async function pegar(caminho: string, validade: number): Promise<Cru | null> {
  const c = cache.get(caminho);
  if (c && Date.now() - c.em < validade) return c.v as Cru;
  return vaga(async () => {
    for (let i = 0; i < 2; i++) {
      try {
        const res = await fetch(BASE + caminho, { signal: AbortSignal.timeout(10_000) });
        const j = (res.ok ? await res.json() : null) as Cru | null;
        const erro = (j?.error ?? null) as Cru | null;
        if (erro && Number(erro.code) === 4) { await new Promise((r) => setTimeout(r, 2500)); continue; }
        if (!j || erro) return null;
        if (validade) {
          if (cache.size > 800) cache.delete(cache.keys().next().value as string);
          cache.set(caminho, { em: Date.now(), v: j });
        }
        return j;
      } catch { return null; }
    }
    return null;
  });
}

const lista = (j: Cru | null): Cru[] => (Array.isArray(j?.data) ? (j!.data as Cru[]) : []);
const semNulos = <T>(xs: (T | null)[]): T[] => xs.filter((x): x is T => x !== null);

export async function buscarArtistas(q: string, limite = 8): Promise<ArtistaDz[]> {
  return semNulos(lista(await pegar(`/search/artist?q=${encodeURIComponent(q)}&limit=${limite}`, DIA)).map(lerArtista));
}

/** O artista com este nome (o igual, se vier; senão o primeiro). */
export async function acharArtista(nome: string): Promise<ArtistaDz | null> {
  const achados = await buscarArtistas(nome, 5);
  return achados.find((a) => semAcento(a.nome) === semAcento(nome)) ?? achados[0] ?? null;
}

export async function parecidos(id: number): Promise<ArtistaDz[]> {
  return semNulos(lista(await pegar(`/artist/${id}/related?limit=20`, DIA)).map(lerArtista));
}

export async function maisTocadas(id: number, limite = 10): Promise<MusicaDz[]> {
  return semNulos(lista(await pegar(`/artist/${id}/top?limit=${limite}`, DIA)).map(lerMusica));
}

/** A música com este nome e artista — null se a que vier não combina com o pedido (23/11). */
export async function acharMusica(titulo: string, artista: string): Promise<MusicaDz | null> {
  const aspas = (t: string) => `"${t.replace(/"/g, " ")}"`;
  const buscas = artista ? [`artist:${aspas(artista)} track:${aspas(titulo)}`, `${titulo} ${artista}`] : [titulo];
  for (const q of buscas) {
    const achadas = semNulos(lista(await pegar(`/search?q=${encodeURIComponent(q)}&limit=8`, DIA)).map(lerMusica))
      .filter((m) => combina(titulo, { track: m.titulo, artist: "" }) >= COMBINA_MINIMO && (!artista || combina(artista, { track: "", artist: m.artista }) >= COMBINA_MINIMO));
    if (achadas.length) return achadas[0];
  }
  return null;
}

/** O trecho de 30 s. O endereço vence em minutos: pedido na hora de tocar, nunca guardado. */
export async function previa(id: number): Promise<string | null> {
  const j = await pegar(`/track/${id}`, 0);
  return j ? urlDaDeezer(j.preview) : null;
}
