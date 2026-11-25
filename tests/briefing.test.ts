import { describe, expect, it, vi } from "vitest";
vi.mock("../src/main/config", () => ({ getConfig: () => ({}), setOverride: () => {} }));
const { limparAssuntos, pedidoDeAssunto, tipoDoAssunto } = await import("../src/services/assuntosDoBriefing");
const { lerGithub, topicosDoGithub } = await import("../src/services/github");
const { lerLoja, topicoDaLoja } = await import("../src/services/jogos");
const { lerPorts, notaDoPort, topicosDosPorts } = await import("../src/services/portwatch");

describe("briefing (25/11)", () => {
  it("os assuntos são dele", () => {
    expect(limparAssuntos(["IA", "ia", "", 3, "  Jogos  "])).toEqual(["IA", "Jogos"]);
    expect(["GitHub", "Ports do GTA 6", "portwatch", "Jogos", "Games indie", "Fórmula 1"].map(tipoDoAssunto)).toEqual(["github", "ports", "ports", "jogos", "jogos", "pesquisa"]);
    expect(pedidoDeAssunto("Ely, põe os ports do GTA 6 no meu briefing")).toEqual({ acao: "por", assunto: "ports do GTA 6" });
    expect(pedidoDeAssunto("tira cinema do briefing.")).toEqual({ acao: "tirar", assunto: "cinema" });
    expect(pedidoDeAssunto("o que tem no meu briefing?")).toEqual({ acao: "listar" });
    expect(pedidoDeAssunto("põe leite na lista")).toBe(null);
  });
  it("ports: notícia e progresso, sem endereço", () => {
    const s = lerPorts({ updated: "2026-11-25T01:00:00Z", history: [{ leader: 64.2 }], news: [{ date: "2026-11-24", title: "Velha" }, { date: "2026-11-25", title: "Nova https://mau.com/x", dek: "Linha" }], efforts: [{ name: "A", tier: "tracked", gta: { loads: 1 }, summary: "x" }, { name: "B", tier: "tracked", verification: "self-reported", gta: { loads: 1, boots: 1, menu: 1, world: 1 } }, { name: "C", tier: "flagged", gta: { story: 1 } }] });
    expect(s.maisLonge).toMatchObject({ nome: "B", declarado: true });
    expect(notaDoPort({ story: 1 })).toBeGreaterThan(notaDoPort({ playable: 1 }));
    const t = topicosDosPorts(s);
    expect(t[0]).toBe("Nova: Linha");
    expect(t[2]).toBe("Mais longe agora: B (64,2% na escala do PortWatch), segundo o próprio projeto");
    expect(t.join(" ")).not.toContain("http");
  });
  it("steam e github", () => {
    const l = lerLoja({ specials: { items: [{ name: "Desconhecido", discount_percent: 90, final_price: 199 }, { name: "Famoso", discount_percent: 75, final_price: 7497 }, { name: "Pouco", discount_percent: 10 }] }, top_sellers: { items: [{ name: "Famoso" }] } });
    expect(topicoDaLoja(l)).toBe("Em promoção na Steam: Famoso (−75%, R$ 74,97) e Desconhecido (−90%, R$ 1,99)");
    const agora = Date.parse("2026-11-25T12:00:00Z");
    const g = lerGithub({ data: { viewer: { repositories: { nodes: [{ name: "app", issues: { totalCount: 1 }, pullRequests: { totalCount: 2 }, defaultBranchRef: { target: { statusCheckRollup: { state: "FAILURE" } } } }, { name: "velho", isArchived: true }] }, starredRepositories: { nodes: [{ nameWithOwner: "a/b", latestRelease: { tagName: "v2", publishedAt: "2026-11-24T12:00:00Z" } }, { nameWithOwner: "c/d", latestRelease: { tagName: "v1", publishedAt: "2020-01-01T00:00:00Z" } }] } } } }, agora);
    expect(topicosDoGithub(g)).toEqual(["CI falhando em app", "2 PRs abertos e 1 issue aberta", "Versão nova: b v2"]);
    expect(lerGithub({})).toEqual({ meus: [], versoes: [] });
  });
});
