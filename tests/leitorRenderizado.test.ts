import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: class {}, session: { fromPartition: () => ({}) } }));
const { enderecoDoSite, resultadosDaBusca } = await import("../src/services/leitorRenderizado");
vi.mock("../src/main/config", () => ({ getApiKey: () => "", getConfig: () => ({}), getGeminiKey: () => "" }));
const { siteDoPedido } = await import("../src/services/webSearch");

describe("ler o site de verdade (27/11)", () => {
  it("endereço quando ele disse o domínio; só o nome → busca", () => {
    expect(enderecoDoSite("portwatch-vi.xyz")).toBe("https://portwatch-vi.xyz");
    expect(enderecoDoSite("https://x.com/a")).toBe("https://x.com/a");
    expect(enderecoDoSite("www.steamdb.info/app/1")).toBe("https://www.steamdb.info/app/1");
    expect(enderecoDoSite("portwatch")).toBeNull();
    expect(enderecoDoSite("o portwatch")).toBeNull();
  });

  it("pedido de abrir site: com o nome, só 'entra aí', ou não é", () => {
    expect(siteDoPedido("Entra no portwatch e me diz a quantos por cento está")).toEqual({ site: "portwatch" });
    expect(siteDoPedido("O port de GTA 6 está a quantos porcento pronto de acordo com o portwatch?")).toEqual({ site: "portwatch" });
    expect(siteDoPedido("segundo o steamdb.info, quantos jogando?")).toEqual({ site: "steamdb.info" });
    expect(siteDoPedido("Entra aí e me diz.")).toEqual({ site: null });
    expect(siteDoPedido("qual a cotação do dólar hoje?")).toBeNull();
    expect(siteDoPedido("abre o spotify")).toBeNull();
    expect(siteDoPedido("quem ganhou o jogo ontem?")).toBeNull();
  });

  it("os 3 primeiros da busca do Bing, um por domínio, sem o redirecionador", () => {
    const a1 = (u: string) => `https://www.bing.com/ck/a?!&amp;&amp;p=x&amp;u=a1${Buffer.from(u).toString("base64url")}&amp;ntb=1`;
    const html = [
      `<h2><a target="_blank" href="${a1("https://portwatch.online/")}">a</a></h2>`,
      `<h2><a target="_blank" href="${a1("https://portwatch.online/outra")}">a2</a></h2>`,
      `<h2><a href="https://portwatch-vi.xyz/">b</a></h2>`,
      `<h2><a href="${a1("https://www.bing.com/images")}">c</a></h2>`,
      `<h2><a href="${a1("https://portwatchvi.com/")}">d</a></h2>`,
      `<h2><a href="${a1("https://quarto.com/")}">e</a></h2>`,
    ].join("");
    expect(resultadosDaBusca(html)).toEqual(["https://portwatch.online/", "https://portwatch-vi.xyz/", "https://portwatchvi.com/"]);
    expect(resultadosDaBusca("<html></html>")).toEqual([]);
  });
});
