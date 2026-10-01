import { describe, expect, it, vi } from "vitest";

vi.mock("../src/main/config", () => ({ getApiKey: () => "x", getConfig: () => ({}) }));

describe("fontes da busca (bloco 131)", async () => {
  const { extrairFontes, limparCitacoes } = await import("../src/services/webSearch");
  const executadas = [
    { type: "browser_search", search_results: { results: [
      { title: "USD/BRL - Cotação", url: "https://br.investing.com/currencies/usd-brl" },
      { title: "Dólar Hoje", url: "https://dolarhoje.com/" },
      { title: "Outra do mesmo site", url: "https://dolarhoje.com/turismo" },
      { title: "Wise", url: "https://wise.com/br/x" },
    ] } },
    { type: "browser.open", search_results: { results: [{ title: "dolarhoje.com - viewing lines [0 - 69]", url: "https://dolarhoje.com/" }] } },
  ];

  it("abertas primeiro, título do buscador, um por site", () => {
    expect(extrairFontes(executadas)).toEqual([
      { titulo: "Dólar Hoje", url: "https://dolarhoje.com/" },
      { titulo: "USD/BRL - Cotação", url: "https://br.investing.com/currencies/usd-brl" },
      { titulo: "Wise", url: "https://wise.com/br/x" },
    ]);
    expect(extrairFontes(undefined)).toEqual([]);
  });

  it("tira as marcas de citação do gpt-oss", () => {
    expect(limparCitacoes("O dólar está em R$ 5,19 【0†L6-L11】.")).toBe("O dólar está em R$ 5,19.");
  });
});

describe("sugestões de próxima pergunta (bloco 132)", async () => {
  const { deveSugerir, interpretarSugestoes } = await import("../src/services/continuacoes");

  it("só em conversa escrita", () => {
    expect(deveSugerir([{ action: "chat" }], "texto")).toBe(true);
    expect(deveSugerir([{ action: "web_search", query: "x" }], "texto")).toBe(true);
    expect(deveSugerir([{ action: "chat" }], "voz")).toBe(false);
    expect(deveSugerir([{ action: "media_control", operation: "pause" } as never], "texto")).toBe(false);
  });

  it("valida o JSON: até 3, sem repetir, sem a própria pergunta", () => {
    expect(interpretarSugestoes('{"sugestoes":["E o HD?","e o hd?","Qual dura mais?","como funciona um SSD","Quarta"]}', "Como funciona um SSD"))
      .toEqual(["E o HD?", "Qual dura mais?", "Quarta"]);
    expect(interpretarSugestoes("lixo")).toEqual([]);
    expect(interpretarSugestoes('texto antes {"sugestoes":["Vale a pena?"]} depois')).toEqual(["Vale a pena?"]);
  });
});
