/**
 * O andamento dos ports do GTA 6 (25/11), pelo arquivo de dados do portwatch-vi.xyz (atualizado a
 * cada ~3 h). Só notícia e progresso: nada de repositório, executável ou endereço de download — são
 * ports do vazamento, e o próprio site avisa dos falsos com malware.
 */
const URL_DADOS = "https://portwatch-vi.xyz/data/tracker.json";
const VALIDADE_MS = 2 * 3_600_000;

type Cru = Record<string, unknown>;
export interface SituacaoDosPorts { atualizado: number | null; noticias: { dia: string; titulo: string; linha: string }[]; maisLonge: { nome: string; resumo: string; declarado: boolean } | null; lider: number | null }

const texto = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/https?:\/\/\S+/g, "").trim().slice(0, n) : "");

/** Quanto o port anda: cada etapa vale mais que a anterior. Pura. */
export function notaDoPort(gta: unknown): number {
  const g = (gta ?? {}) as Record<string, unknown>;
  return [["loads", 1], ["boots", 2], ["menu", 4], ["world", 8], ["playable", 16], ["story", 32]].reduce((s, [k, p]) => s + (Number(g[k as string]) || 0) * (p as number), 0) + (Number(g.render) || 0) * 4 + Math.min(60, Number(g.fps) || 0) / 60 + (Number(g.stability) || 0) * 2;
}

/** O arquivo do site → o que interessa. Pura. */
export function lerPorts(j: Cru): SituacaoDosPorts {
  const noticias = (Array.isArray(j.news) ? j.news as Cru[] : [])
    .map((n) => ({ dia: texto(n.date, 10), titulo: texto(n.title, 160), linha: texto(n.dek, 220) }))
    .filter((n) => n.titulo && /^\d{4}-\d\d-\d\d$/.test(n.dia)).sort((a, b) => b.dia.localeCompare(a.dia)).slice(0, 6);
  const efforts = (Array.isArray(j.efforts) ? j.efforts as Cru[] : []).filter((e) => e.tier === "tracked" && texto(e.name, 60));
  const melhor = [...efforts].sort((a, b) => notaDoPort(b.gta) - notaDoPort(a.gta))[0];
  const hist = Array.isArray(j.history) ? j.history as Cru[] : [];
  const lider = Number(hist[hist.length - 1]?.leader);
  const at = Date.parse(String(j.updated ?? ""));
  return {
    atualizado: Number.isNaN(at) ? null : at, noticias, lider: lider > 0 ? lider : null,
    maisLonge: melhor ? { nome: texto(melhor.name, 60), resumo: texto(melhor.summary, 260), declarado: melhor.verification === "self-reported" } : null,
  };
}

/** Os tópicos do briefing. `desde` = dia da última leitura. Pura. */
export function topicosDosPorts(s: SituacaoDosPorts, max = 3): string[] {
  const t = s.noticias.slice(0, max - 1).map((n) => (n.linha ? `${n.titulo}: ${n.linha}` : n.titulo));
  if (s.maisLonge) t.push(`Mais longe agora: ${s.maisLonge.nome}${s.lider ? ` (${s.lider.toLocaleString("pt-BR")}% na escala do PortWatch)` : ""}${s.maisLonge.declarado ? ", segundo o próprio projeto" : ""}`);
  return t;
}

let cache: { em: number; s: SituacaoDosPorts } | null = null;
export async function situacaoDosPorts(agora = Date.now()): Promise<SituacaoDosPorts | null> {
  if (cache && agora - cache.em < VALIDADE_MS) return cache.s;
  try {
    const r = await fetch(URL_DADOS, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return cache?.s ?? null;
    const s = lerPorts(await r.json() as Cru);
    cache = { em: agora, s };
    return s;
  } catch { return cache?.s ?? null; }
}
