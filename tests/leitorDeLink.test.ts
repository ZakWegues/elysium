import { describe, expect, it, vi } from "vitest";

vi.mock("../src/main/config", () => ({ getApiKey: () => "", getConfig: () => ({}) }));

describe("leitor de link (bloco 138)", async () => {
  const { extrairTextoLegivel, urlPermitida } = await import("../src/services/leitorDeLink");

  it("tira script, menu e rodapé; prefere o <article>; decodifica entidades", () => {
    const corpo = "Parágrafo com conteúdo de verdade. ".repeat(20);
    const html = `<html><head><title>Notícia &amp; mais</title><style>.x{}</style></head><body>
      <nav>Início Sobre Contato</nav><script>alert(1)</script>
      <article><h1>Título</h1><p>${corpo}</p><p>Fim&nbsp;do texto &#8212; ok</p></article>
      <footer>Copyright</footer></body></html>`;
    const r = extrairTextoLegivel(html);
    expect(r.titulo).toBe("Notícia & mais");
    expect(r.texto).toMatch(/^Título\n/);
    expect(r.texto).toMatch(/Fim do texto — ok/);
    expect(r.texto).not.toMatch(/alert|Copyright|Contato/);
  });

  it("só página pública: nada de rede local, localhost ou outro esquema", () => {
    expect(urlPermitida("https://g1.globo.com/x")).toBe(true);
    for (const u of ["http://localhost:4200/api", "http://127.0.0.1/", "http://192.168.15.1/", "http://10.0.0.5", "http://172.20.1.1", "http://100.64.0.1", "file:///C:/x", "ftp://a.com", "http://[::1]/", "http://roteador.local/"]) {
      expect(urlPermitida(u), u).toBe(false);
    }
  });
});
