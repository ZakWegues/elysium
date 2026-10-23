import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Fotos e rotas das telas inteligentes (Fase 2, 22/10). A tela não sai para a internet: pede ao
 * host, e o host pede aqui. Lista fixa de hosts (Wikipedia/Commons e o OSRM público), prazo curto,
 * cache em disco (uma semana, 600 entradas). As fotos voltam como URL do upload.wikimedia.org —
 * o único host de imagem que o CSP da tela aceita.
 *
 * Portado do open-intelligent-ui (`/api/image-search`, `/api/wiki`, `/api/street-route`), com a
 * Wikipedia em português primeiro.
 */

const UA = "ELYSIUM/2 (assistente pessoal; https://github.com/ZakWegues/elysium)";
const HOSTS = new Set(["pt.wikipedia.org", "en.wikipedia.org", "commons.wikimedia.org", "router.project-osrm.org"]);
const PULAR = /\.svg|icon|logo|map|mapa|flag|bandeira|seal|selo|bras[aã]o|coat_of_arms|emblem|medal|escudo|crest|insignia|signature|assinatura|diagram/i;
const LARGURA = 960;
const SEMANA = 7 * 24 * 3600 * 1000;
const MAX_ENTRADAS = 600;
const MAX_PARADAS = 25;

export type Busca = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Cache em disco: um JSON por tipo, com validade. */
function criarCache(arquivo: string) {
  let dados: Record<string, { t: number; v: unknown }> | null = null;
  const ler = () => {
    if (dados) return dados;
    try { dados = JSON.parse(fs.readFileSync(arquivo, "utf8")); } catch { dados = {}; }
    return dados!;
  };
  return {
    pegar<T>(chave: string): T | undefined {
      const e = ler()[chave];
      return e && Date.now() - e.t < SEMANA ? (e.v as T) : undefined;
    },
    guardar(chave: string, v: unknown) {
      const d = ler();
      d[chave] = { t: Date.now(), v };
      const chaves = Object.keys(d);
      if (chaves.length > MAX_ENTRADAS) for (const k of chaves.sort((a, b) => d[a].t - d[b].t).slice(0, chaves.length - MAX_ENTRADAS)) delete d[k];
      try { fs.mkdirSync(path.dirname(arquivo), { recursive: true }); fs.writeFileSync(arquivo, JSON.stringify(d)); } catch { /* sem cache em disco: segue */ }
    },
  };
}

async function pegarJson(busca: Busca, url: string, ms: number): Promise<unknown> {
  const host = new URL(url).hostname;
  if (!HOSTS.has(host)) throw new Error(`host fora da lista: ${host}`);
  const r = await busca(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(ms) });
  if (r.status === 404) return {};
  if (!r.ok) throw new Error(`${host} ${r.status}`);
  return r.json();
}

type Pagina = { index?: number; title?: string; thumbnail?: { source?: string }; imageinfo?: { thumburl?: string; url?: string; mime?: string }[] };

async function consultar(busca: Busca, host: string, params: Record<string, string>): Promise<Pagina[]> {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ action: "query", format: "json", formatversion: "2", ...params })}`;
  const d = (await pegarJson(busca, url, 6000)) as { error?: unknown; query?: { pages?: Pagina[] } };
  // Limite de taxa volta 200 com erro no corpo: lança, para não guardar "sem foto" por uma semana.
  if (d.error) throw new Error(`${host} recusou`);
  return (d.query?.pages ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

const palavras = (t: string) => t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3);

/** Só imagem do upload.wikimedia.org, sem mapa/logo/bandeira, sem repetir. Puro. */
export function fotoAceita(url: string | undefined, ja: string[]): url is string {
  if (!url || PULAR.test(url) || ja.includes(url)) return false;
  try { return new URL(url).hostname === "upload.wikimedia.org" && url.startsWith("https://"); } catch { return false; }
}

/** Valida "lng,lat;lng,lat" (2 a 25 paradas) e devolve a chave normalizada, ou null. Puro. */
export function coordsValidas(coords: string): string | null {
  if (typeof coords !== "string" || coords.length > 700) return null;
  const pontos = coords.split(";").map((p) => p.split(",").map(Number));
  const ok = pontos.length >= 2 && pontos.length <= MAX_PARADAS
    && pontos.every((p) => p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
  return ok ? pontos.map((p) => p.map((n) => Number(n.toFixed(6))).join(",")).join(";") : null;
}

/** Reduz uma linha longa para no máximo `max` pontos (mantém o primeiro e o último). Puro. */
export function reduzirLinha<T>(pontos: T[], max = 1500): T[] {
  if (pontos.length <= max) return pontos;
  const passo = (pontos.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => pontos[Math.round(i * passo)]);
}

export function criarProxy(pastaCache: string, busca: Busca = fetch as unknown as Busca) {
  const cacheFotos = criarCache(path.join(pastaCache, "ui-fotos.json"));
  const cacheRotas = criarCache(path.join(pastaCache, "ui-rotas.json"));

  async function fotos(q: string): Promise<string[]> {
    const consulta = String(q ?? "").replace(/\s+/g, " ").trim();
    if (consulta.length < 2 || consulta.length > 200) throw new Error("consulta de 2 a 200 caracteres");
    const guardado = cacheFotos.pegar<string[]>(consulta.toLowerCase());
    if (guardado) return guardado;
    const achadas: string[] = [];
    const por = (u: string | undefined) => { if (fotoAceita(u, achadas)) achadas.push(u); };
    const queridas = new Set(palavras(consulta));
    // Artigos cujo título fala do assunto (um prato não pode trazer a fachada de uma rede).
    for (const host of ["pt.wikipedia.org", "en.wikipedia.org"]) {
      if (achadas.length >= 3) break;
      const artigos = await consultar(busca, host, { generator: "search", gsrsearch: consulta, gsrlimit: "6", prop: "pageimages", piprop: "thumbnail", pithumbsize: String(LARGURA) });
      artigos.filter((a) => palavras(a.title ?? "").some((w) => queridas.has(w))).forEach((a) => por(a.thumbnail?.source));
    }
    // Depois o Commons, encurtando a descrição se a longa não achar nada.
    const termos = consulta.split(" ");
    for (const t of [...new Set([termos.join(" "), termos.slice(0, 3).join(" "), termos.slice(0, 2).join(" ")])]) {
      if (achadas.length >= 3) break;
      const arquivos = await consultar(busca, "commons.wikimedia.org", { generator: "search", gsrsearch: `${t} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "6", prop: "imageinfo", iiprop: "url|mime", iiurlwidth: String(LARGURA) });
      for (const a of arquivos) { const i = a.imageinfo?.[0]; if (i?.mime?.startsWith("image/")) por(i.thumburl ?? i.url); }
    }
    const lista = achadas.slice(0, 4);
    cacheFotos.guardar(consulta.toLowerCase(), lista);
    return lista;
  }

  async function rota(coords: string): Promise<[number, number][]> {
    const chave = coordsValidas(coords);
    if (!chave) throw new Error(`coords: de 2 a ${MAX_PARADAS} pares lng,lat`);
    const guardada = cacheRotas.pegar<[number, number][]>(chave);
    if (guardada) return guardada;
    const d = (await pegarJson(busca, `https://router.project-osrm.org/route/v1/driving/${chave}?overview=full&geometries=geojson&steps=false`, 10_000)) as { code?: string; routes?: { geometry?: { coordinates?: [number, number][] } }[] };
    const c = d.routes?.[0]?.geometry?.coordinates ?? [];
    if (d.code !== "Ok" || c.length < 2) throw new Error("sem rota pelas ruas");
    const pontos = reduzirLinha(c.map(([lng, lat]) => [lat, lng] as [number, number]));
    cacheRotas.guardar(chave, pontos);
    return pontos;
  }

  return { fotos, rota };
}

let doApp: ReturnType<typeof criarProxy> | null = null;
/** O proxy do app, com o cache na pasta de dados do ELYSIUM (userData/ui-cache). */
export function proxyDoApp(): ReturnType<typeof criarProxy> {
  if (!doApp) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require("electron") as typeof import("electron");
    doApp = criarProxy(path.join(app.getPath("userData"), "ui-cache"));
  }
  return doApp;
}
