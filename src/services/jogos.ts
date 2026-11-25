/**
 * Jogos para o briefing (25/11): o que saiu, o que vem e as promoções da loja da Steam (API pública,
 * sem chave, em reais). As notícias de lançamento vêm da pesquisa, em novidades.ts.
 */
const URL_LOJA = "https://store.steampowered.com/api/featuredcategories?cc=br&l=brazilian";
type Cru = Record<string, unknown>;
export interface JogoDaLoja { nome: string; desconto: number; preco: number }

/** Pura. */
export function lerLoja(j: Cru): { promocoes: JogoDaLoja[]; maisVendidos: JogoDaLoja[] } {
  const ler = (k: string): JogoDaLoja[] => {
    const itens = (j[k] as Cru | undefined)?.items;
    const vistos = new Set<string>();
    return (Array.isArray(itens) ? itens as Cru[] : []).map((i) => ({ nome: String(i.name ?? "").trim().slice(0, 80), desconto: Number(i.discount_percent) || 0, preco: (Number(i.final_price) || 0) / 100 }))
      .filter((i) => i.nome && !vistos.has(i.nome) && !!vistos.add(i.nome));
  };
  return { promocoes: ler("specials").filter((i) => i.desconto >= 30).sort((a, b) => b.desconto - a.desconto), maisVendidos: ler("top_sellers") };
}

/** "Em promoção na Steam: X (−75%, R$ 74,97)". Pura. */
export function topicoDaLoja(l: { promocoes: JogoDaLoja[]; maisVendidos: JogoDaLoja[] }): string | null {
  // Promoção de jogo que está entre os mais vendidos vale mais que a de um desconhecido.
  const famosos = new Set(l.maisVendidos.map((m) => m.nome));
  const p = [...l.promocoes].sort((a, b) => Number(famosos.has(b.nome)) - Number(famosos.has(a.nome)) || b.desconto - a.desconto).slice(0, 2);
  return p.length ? `Em promoção na Steam: ${p.map((x) => `${x.nome} (−${x.desconto}%, R$ ${x.preco.toFixed(2).replace(".", ",")})`).join(" e ")}` : null;
}

export async function promocoesDaSteam(): Promise<string | null> {
  try {
    const r = await fetch(URL_LOJA, { signal: AbortSignal.timeout(10_000) });
    return r.ok ? topicoDaLoja(lerLoja(await r.json() as Cru)) : null;
  } catch { return null; }
}
