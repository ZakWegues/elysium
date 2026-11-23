import Store from "electron-store";
import { ESTILOS, MOMENTOS, type Momento } from "./catalogoMusical";
import { acharArtista, buscarArtistas, maisTocadas, parecidos, type ArtistaDz, type MusicaDz } from "./deezer";
import { semAcento } from "./texto";

/**
 * O gosto musical dele e as sugestões (23/11 — "para descobrir novas músicas que eu talvez goste").
 *
 * A conta é uma regra de três em cima dos artistas parecidos: cada artista de que ele gosta vota
 * nos parecidos com ele (o primeiro vale mais); quem recebe voto de vários sobe. Quem ele não
 * gosta tira voto dos parecidos. Estilo, música marcada e o que ele ouve ou pula no Spotify também
 * contam. As funções puras ficam no topo, testadas; o resto é store e rede.
 */

export type Valor = 1 | -1 | 0;
export interface Escutado { nome: string; ok: number; pulou: number }
export interface MusicaMarcada { valor: Valor; titulo: string; artista: string }
export interface Gostos {
  estilos: Record<string, Valor>;
  /** nome sem acento → resposta (0 = não conheço). */
  artistas: Record<string, { nome: string; valor: Valor }>;
  musicas: Record<string, MusicaMarcada>;
  escutados: Record<string, Escutado>;
  /** O que ela aprendeu pela conversa ("eu amo Lonely Day"), para ele ver e apagar. */
  aprendidos?: Aprendido[];
}
export interface Aprendido { tipo: "artista" | "musica"; nome: string; artista?: string; id?: number; valor: 1 | -1; em: number }

export interface Semente { nome: string; peso: number; estilo?: string }
export interface Candidato { artista: ArtistaDz; pontos: number; porque: string[] }
export interface Sugestao { id: number; titulo: string; artista: string; capa: string | null; motivo: string }

const chave = (nome: string) => semAcento(nome).trim();
const ESTILO_DO_ARTISTA = new Map<string, string>();
for (const e of ESTILOS) for (const a of e.artistas) if (!ESTILO_DO_ARTISTA.has(chave(a))) ESTILO_DO_ARTISTA.set(chave(a), e.id);

/** Os artistas de partida e quanto cada um pesa (negativo = afasta). Pura. */
export function sementes(g: Gostos): Semente[] {
  const peso = new Map<string, Semente>();
  const somar = (nome: string, p: number) => {
    const k = chave(nome);
    const s = peso.get(k) ?? { nome, peso: 0, estilo: ESTILO_DO_ARTISTA.get(k) };
    s.peso += p;
    peso.set(k, s);
  };
  for (const a of Object.values(g.artistas)) if (a.valor) somar(a.nome, a.valor * 2);
  for (const m of Object.values(g.musicas)) if (m.valor) somar(m.artista, m.valor === 1 ? 0.8 : -0.4);
  for (const e of Object.values(g.escutados)) somar(e.nome, Math.min(1.2, e.ok * 0.25) - Math.min(1, e.pulou * 0.25));
  for (const e of ESTILOS) {
    const v = g.estilos[e.id];
    // Só o estilo marcado: os primeiros artistas dele que não foram respondidos entram de leve.
    if (v === 1) for (const a of e.artistas.slice(0, 5)) if (!g.artistas[chave(a)]) somar(a, 0.5);
    if (v === -1) for (const a of e.artistas) if (!g.artistas[chave(a)]) somar(a, -0.6);
  }
  return [...peso.values()].filter((s) => Math.abs(s.peso) >= 0.2).sort((a, b) => Math.abs(b.peso) - Math.abs(a.peso));
}

/** Quanto a semente vale neste momento do dia. Pura. */
export function pesoNoMomento(s: Semente, momento: Momento): number {
  if (momento === "geral") return s.peso;
  const estilo = ESTILOS.find((e) => e.id === s.estilo);
  if (!estilo || s.peso < 0) return s.peso;
  return s.peso * (estilo.momentos.includes(momento) ? 1.8 : 0.35);
}

/** Os votos: cada semente nos parecidos com ela. Quem não gosta, e quem já respondeu, fora. Pura. */
export function votar(sems: { semente: Semente; peso: number; parecidos: ArtistaDz[] }[], g: Gostos): Candidato[] {
  const por = new Map<string, Candidato & { votos: { nome: string; p: number }[] }>();
  for (const { semente, peso, parecidos: ps } of sems) {
    ps.forEach((a, i) => {
      const p = peso * (1 - i / (ps.length + 4));
      const c = por.get(chave(a.nome)) ?? { artista: a, pontos: 0, porque: [], votos: [] };
      c.pontos += p;
      if (p > 0) c.votos.push({ nome: semente.nome, p });
      por.set(chave(a.nome), c);
    });
  }
  return [...por.values()]
    .filter((c) => c.pontos > 0 && g.artistas[chave(c.artista.nome)]?.valor !== -1)
    .map(({ votos, artista, pontos }) => ({ artista, pontos, porque: votos.sort((a, b) => b.p - a.p).slice(0, 2).map((v) => v.nome) }))
    .sort((a, b) => b.pontos - a.pontos);
}

/** "porque você gosta de Portishead e Tricky". Pura. */
export function motivoDe(porque: string[], direto: boolean): string {
  if (direto) return "de quem você já gosta";
  return porque.length ? `porque você gosta de ${porque.join(" e ")}` : "pelo seu gosto";
}

/** Sorteio repetível: a mesma semente dá a mesma ordem. Pura. */
export function sorteio(semente: string): () => number {
  let h = 2166136261;
  for (const c of semente) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

/** Ouviu quase toda = gostou; largou cedo = pulou; no meio não diz nada. Pura. */
export function leituraDaFaixa(ouvidoMs: number, duracaoMs: number): "ok" | "pulou" | null {
  if (duracaoMs < 30_000) return null;
  const f = ouvidoMs / duracaoMs;
  return f >= 0.7 ? "ok" : f <= 0.3 ? "pulou" : null;
}

// ── o store ─────────────────────────────────────────────────────────────────────────────────

const VAZIO: Gostos = { estilos: {}, artistas: {}, musicas: {}, escutados: {} };
const store = new Store<{ gostos: Gostos; fotos: Record<string, ArtistaDz> }>({ name: "gostos", defaults: { gostos: VAZIO, fotos: {} } });

export function lerGostos(): Gostos {
  const g = store.get("gostos") as Partial<Gostos> | undefined;
  return { estilos: { ...g?.estilos }, artistas: { ...g?.artistas }, musicas: { ...g?.musicas }, escutados: { ...g?.escutados }, aprendidos: Array.isArray(g?.aprendidos) ? [...g.aprendidos] : [] };
}
function gravar(g: Gostos): void { store.set("gostos", g); sugestoesFeitas.clear(); }

export function marcarEstilo(id: string, valor: Valor | null): void {
  if (!ESTILOS.some((e) => e.id === id)) throw new Error("estilo desconhecido");
  const g = lerGostos();
  if (valor === null) delete g.estilos[id]; else g.estilos[id] = valor;
  gravar(g);
}
export function marcarArtista(nome: string, valor: Valor | null): void {
  const g = lerGostos(), k = chave(nome);
  if (!k) return;
  if (valor === null) delete g.artistas[k]; else g.artistas[k] = { nome: nome.trim().slice(0, 80), valor };
  // Ele respondeu à mão: vale a resposta dele, não mais o que ela aprendeu.
  g.aprendidos = (g.aprendidos ?? []).filter((a) => a.tipo !== "artista" || chave(a.nome) !== k);
  gravar(g);
}
export function marcarMusica(id: number, titulo: string, artista: string, valor: Valor | null): void {
  const g = lerGostos();
  if (valor === null) delete g.musicas[id]; else g.musicas[id] = { valor, titulo: titulo.slice(0, 120), artista: artista.slice(0, 80) };
  g.aprendidos = (g.aprendidos ?? []).filter((a) => a.tipo !== "musica" || a.id !== id);
  // A lista já mostrada continua na tela: só esta música sai (quem avalia não perde as outras).
  store.set("gostos", g);
  for (const s of sugestoesFeitas.values()) s.itens = s.itens.filter((x) => x.id !== id);
}

/**
 * O que ele disse numa conversa (23/11). Devolve o aprendido se mudou algo; null se ela já sabia.
 * Só os 80 mais novos aparecem na lista; a marca continua valendo.
 */
export function aprender(x: { tipo: "artista"; nome: string } | { tipo: "musica"; nome: string; artista: string; id: number }, valor: 1 | -1, agora = Date.now()): Aprendido | null {
  const g = lerGostos();
  if (x.tipo === "artista") {
    const k = chave(x.nome);
    if (!k || g.artistas[k]?.valor === valor) return null;
    g.artistas[k] = { nome: x.nome.slice(0, 80), valor };
  } else {
    if (g.musicas[x.id]?.valor === valor) return null;
    g.musicas[x.id] = { valor, titulo: x.nome.slice(0, 120), artista: x.artista.slice(0, 80) };
  }
  const novo: Aprendido = { ...x, valor, em: agora };
  g.aprendidos = [novo, ...(g.aprendidos ?? []).filter((a) => a.tipo !== x.tipo || (x.tipo === "musica" ? a.id !== x.id : chave(a.nome) !== chave(x.nome)))].slice(0, 80);
  gravar(g);
  return novo;
}

/** Nomes que ajudam a transcrição a acertar ("System of Fade Down" → System of a Down). */
export function nomesParaOuvir(max = 24): string[] {
  const g = lerGostos();
  const nomes = [
    ...(g.aprendidos ?? []).filter((a) => a.valor === 1).flatMap((a) => (a.artista ? [a.artista, a.nome] : [a.nome])),
    ...Object.values(g.escutados).filter((e) => e.ok > e.pulou).reverse().map((e) => e.nome),
    ...Object.values(g.artistas).filter((a) => a.valor === 1).reverse().map((a) => a.nome),
  ];
  return [...new Set(nomes)].slice(0, max);
}

/** O que está tocando, visto de tempos em tempos: aprende com o que ele ouve e pula. */
let faixa: { nome: string; artista: string; ouvido: number; duracao: number; em: number; tocando: boolean } | null = null;
export function observarFaixa(n: { track: string; artist: string; durationMs: number; progressMs: number; isPlaying: boolean } | null, agora = Date.now()): void {
  if (faixa && n && faixa.nome === n.track && faixa.artista === n.artist) {
    faixa.ouvido = Math.max(faixa.ouvido, n.progressMs);
    faixa.em = agora; faixa.tocando = n.isPlaying;
    return;
  }
  // Trocou: até a próxima leitura a faixa antiga seguiu tocando (no máximo um intervalo). Parou de
  // olhar há muito tempo: não dá para saber como acabou.
  if (faixa && n && agora - faixa.em < 90_000) {
    const r = leituraDaFaixa(faixa.ouvido + (faixa.tocando ? Math.min(agora - faixa.em, 45_000) * 0.5 : 0), faixa.duracao);
    if (r) {
      const g = lerGostos(), nome = faixa.artista.split(", ")[0], k = chave(nome);
      const e = g.escutados[k] ?? { nome, ok: 0, pulou: 0 };
      e[r] = Math.min(20, e[r] + 1);
      g.escutados[k] = e;
      // Só os 200 mais recentes: reescrever põe no fim.
      const ordem = Object.entries(g.escutados).filter(([c]) => c !== k).slice(-199);
      g.escutados = Object.fromEntries([...ordem, [k, e]]);
      store.set("gostos", g);
    }
  }
  faixa = n ? { nome: n.track, artista: n.artist, ouvido: n.progressMs, duracao: n.durationMs, em: agora, tocando: n.isPlaying } : null;
}

// ── o questionário ──────────────────────────────────────────────────────────────────────────

async function resolver(nome: string): Promise<ArtistaDz | null> {
  const fotos = store.get("fotos") as Record<string, ArtistaDz>;
  const k = chave(nome);
  if (fotos[k]) return fotos[k];
  const a = await acharArtista(nome);
  if (a) store.set("fotos", { ...(store.get("fotos") as Record<string, ArtistaDz>), [k]: a });
  return a;
}

/** Os artistas de um estilo, com foto (sem rede: só o nome). */
export async function artistasDoEstilo(id: string): Promise<{ nome: string; foto: string | null }[]> {
  const e = ESTILOS.find((x) => x.id === id);
  if (!e) return [];
  return Promise.all(e.artistas.map(async (nome) => ({ nome, foto: (await resolver(nome).catch(() => null))?.foto ?? null })));
}

export async function procurarArtista(q: string): Promise<{ nome: string; foto: string | null }[]> {
  return (await buscarArtistas(q, 8)).map((a) => ({ nome: a.nome, foto: a.foto }));
}

/** Músicas para perguntar: das sementes positivas, sem as já respondidas. */
export async function musicasParaPerguntar(): Promise<Sugestao[]> {
  const g = lerGostos();
  const boas = sementes(g).filter((s) => s.peso > 0).slice(0, 30);
  const rnd = sorteio(`perguntas-${Object.keys(g.musicas).length}`);
  const escolhidas = boas.map((s) => ({ s, o: rnd() / Math.sqrt(s.peso) })).sort((a, b) => a.o - b.o).slice(0, 12).map((x) => x.s);
  const por = await Promise.all(escolhidas.map(async (s) => { const a = await resolver(s.nome); return a ? maisTocadas(a.id, 10) : []; }));
  const saida: Sugestao[] = [];
  por.forEach((ms) => { const m = ms.find((x) => !g.musicas[x.id]); if (m) saida.push({ ...simples(m), motivo: "" }); });
  return saida;
}

const simples = (m: MusicaDz) => ({ id: m.id, titulo: m.titulo, artista: m.artista, capa: m.capa });

// ── as sugestões ────────────────────────────────────────────────────────────────────────────

const sugestoesFeitas = new Map<Momento, { em: number; itens: Sugestao[] }>();
let rodada = 0;
const VALIDADE = 12 * 3_600_000;

/** Já respondeu o bastante para sugerir? Pura. */
export function temGostoBastante(g: Gostos): boolean {
  return Object.values(g.artistas).filter((a) => a.valor === 1).length >= 3
    || Object.values(g.estilos).filter((v) => v === 1).length >= 1
    || Object.values(g.musicas).filter((m) => m.valor === 1).length >= 3
    || Object.values(g.escutados).filter((e) => e.ok >= 3).length >= 3;
}

export async function sugerir(momento: Momento = "geral", refazer = false, quantas = 12): Promise<{ pronto: boolean; momento: Momento; itens: Sugestao[] }> {
  if (!MOMENTOS.includes(momento)) momento = "geral";
  const g = lerGostos();
  if (!temGostoBastante(g)) return { pronto: false, momento, itens: [] };
  const feita = sugestoesFeitas.get(momento);
  if (feita && !refazer && Date.now() - feita.em < VALIDADE && feita.itens.length >= 3) return { pronto: true, momento, itens: feita.itens };
  if (refazer) rodada++;

  const usadas = sementes(g).map((s) => ({ semente: s, peso: pesoNoMomento(s, momento) })).sort((a, b) => Math.abs(b.peso) - Math.abs(a.peso)).slice(0, 40);
  const comParecidos = await Promise.all(usadas.map(async (u) => {
    const a = await resolver(u.semente.nome).catch(() => null);
    return { ...u, parecidos: a ? await parecidos(a.id) : [] };
  }));
  const rnd = sorteio(`${new Date().toDateString()}-${momento}-${rodada}`);
  // Artista novo primeiro; um em cada quatro é de quem ele já gosta (música que talvez não conheça).
  const novos = votar(comParecidos, g).filter((c) => g.artistas[chave(c.artista.nome)]?.valor !== 1).slice(0, 36)
    .map((c) => ({ c, o: c.pontos * (0.55 + 0.9 * rnd()) })).sort((a, b) => b.o - a.o).slice(0, quantas + 4).map((x) => x.c);
  const conhecidos = usadas.filter((u) => u.peso > 0 && u.semente.peso >= 1.5).map((u) => ({ u, o: u.peso * (0.4 + rnd()) })).sort((a, b) => b.o - a.o).slice(0, Math.ceil(quantas / 4)).map((x) => x.u.semente);

  const escolher = (ms: MusicaDz[], de: number, ate: number): MusicaDz | null => {
    const livres = ms.slice(de, ate).filter((m) => !g.musicas[m.id]);
    return livres.length ? livres[Math.floor(rnd() * livres.length)] : null;
  };
  const dosNovos = await Promise.all(novos.map(async (c) => {
    const m = escolher(await maisTocadas(c.artista.id, 15), 0, 8);
    return m ? { ...simples(m), motivo: motivoDe(c.porque, false) } : null;
  }));
  const dosConhecidos = await Promise.all(conhecidos.map(async (s) => {
    const a = await resolver(s.nome);
    const m = a ? escolher(await maisTocadas(a.id, 25), 8, 25) : null;
    return m ? { ...simples(m), motivo: motivoDe([], true) } : null;
  }));
  const a = dosNovos.filter((x): x is Sugestao => x !== null), b = dosConhecidos.filter((x): x is Sugestao => x !== null);
  const itens: Sugestao[] = [];
  while (itens.length < quantas && (a.length || b.length)) {
    const x = itens.length % 4 === 3 && b.length ? b.shift()! : (a.shift() ?? b.shift()!);
    if (!itens.some((y) => y.id === x.id)) itens.push(x);
  }
  // Sem internet não guarda a lista vazia.
  if (itens.length) sugestoesFeitas.set(momento, { em: Date.now(), itens });
  return { pronto: true, momento, itens };
}

/** O catálogo com as respostas, para as telas. */
export function estadoDosGostos(): { estilos: { id: string; nome: string; valor: Valor | null }[]; gosta: string[]; naoGosta: string[]; respostas: Record<string, Valor>; aprendidos: Aprendido[]; pronto: boolean } {
  const g = lerGostos();
  const artistas = Object.values(g.artistas);
  return {
    estilos: ESTILOS.map((e) => ({ id: e.id, nome: e.nome, valor: g.estilos[e.id] ?? null })),
    gosta: artistas.filter((a) => a.valor === 1).map((a) => a.nome),
    naoGosta: artistas.filter((a) => a.valor === -1).map((a) => a.nome),
    respostas: Object.fromEntries(artistas.map((a) => [a.nome, a.valor])),
    aprendidos: g.aprendidos ?? [],
    pronto: temGostoBastante(g),
  };
}
