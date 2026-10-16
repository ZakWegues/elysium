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
    for (const u of ["http://localhost:4200/api", "http://127.0.0.1/", "http://192.168.0.1/", "http://10.0.0.5", "http://172.20.1.1", "http://100.64.0.1", "file:///C:/x", "ftp://a.com", "http://[::1]/", "http://roteador.local/"]) {
      expect(urlPermitida(u), u).toBe(false);
    }
  });
});

describe("DNS rebinding (bloco 192)", async () => {
  const { lookupSeguro } = await import("../src/services/leitorDeLink");
  type Ender = { address: string; family: number };
  const resolvedor = (enderecos: Ender[]) => (_h: string, _o: unknown, cb: (e: NodeJS.ErrnoException | null, a: Ender[]) => void) => cb(null, enderecos);
  const chamar = (lista: Ender[], all: boolean) => new Promise<unknown[]>((ok) => {
    (lookupSeguro(resolvedor(lista) as never) as unknown as (h: string, o: object, cb: (...a: unknown[]) => void) => void)("exemplo.com", { all }, (...a) => ok(a));
  });

  it("recusa na conexão quando o nome aponta para a rede local", async () => {
    const [err] = await chamar([{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }], false);
    expect((err as NodeJS.ErrnoException).code).toBe("ENOTPUBLIC");
    const [err6] = await chamar([{ address: "::ffff:192.168.0.1", family: 6 }], true);
    expect((err6 as NodeJS.ErrnoException).code).toBe("ENOTPUBLIC");
  });

  it("endereço público passa, nos dois formatos de resposta", async () => {
    expect(await chamar([{ address: "93.184.216.34", family: 4 }], false)).toEqual([null, "93.184.216.34", 4]);
    expect(await chamar([{ address: "93.184.216.34", family: 4 }], true)).toEqual([null, [{ address: "93.184.216.34", family: 4 }]]);
  });
});
