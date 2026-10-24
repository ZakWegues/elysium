import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { cabeTela, decidirTela, gerarTela, pediuTela, promptDasTelas, type Gerador } from "../src/services/telaInteligente";
import { coordsValidas, criarProxy, fotoAceita, reduzirLinha, type Busca } from "../src/services/uiProxy";

const BOM = 'root = Card([Title("Parcela", "md"), Text("R$ 100")])';

describe("quando a tela sai (22/10)", () => {
  it("pedido explícito", () => {
    for (const t of ["monta uma tela disso", "faz uma calculadora de juros", "me mostra num gráfico", "quero flashcards de bioquímica", "me dá flashcards de bioquímica", "faz isso interativo", "cria uma tabela comparando os dois"]) expect(pediuTela(t), t).toBe(true);
    for (const t of ["qual a capital da França?", "abre o Spotify", "toca uma música", "me conta uma piada"]) expect(pediuTela(t), t).toBe(false);
  });

  it("caberia uma tela", () => {
    for (const t of ["planeja meu sábado em São Paulo", "compara o iPhone 17 com o Pixel 11", "quanto fica um financiamento de 30 mil em 36 vezes?", "dividir a conta de 240 entre 4", "me ajuda a estudar enzimas"]) expect(cabeTela(t), t).toBe(true);
    for (const t of ["oi", "que horas são?", "abre o Chrome", "obrigado"]) expect(cabeTela(t), t).toBe(false);
  });

  it("os quatro modos, com o mesmo pedido", () => {
    const p = "planeja meu sábado";
    expect(decidirTela("nunca", p, "texto", true)).toBe("nada");
    expect(decidirTela("pedir", p, "texto", true)).toBe("nada");
    expect(decidirTela("pedir", "monta uma tela disso", "texto", true)).toBe("gerar");
    expect(decidirTela("perguntar", p, "texto", true)).toBe("oferecer");
    expect(decidirTela("priorizar", p, "texto", true)).toBe("gerar");
    expect(decidirTela("nunca", "monta uma tela disso", "texto", true)).toBe("nada");
    // Conta dividida e financiamento saem prontos, sem modelo: não vale perguntar.
    expect(decidirTela("perguntar", "divide a conta de 380 entre 5", "texto", true)).toBe("gerar");
    expect(decidirTela("pedir", "divide a conta de 380 entre 5", "texto", true)).toBe("nada");
  });

  it("voz nunca gera; sem Hermes nem Groq, nada", () => {
    expect(decidirTela("priorizar", "monta uma tela", "voz", true)).toBe("nada");
    expect(decidirTela("priorizar", "planeja meu sábado", "texto", false)).toBe("nada");
  });
});

describe("geração com validação local e uma nova tentativa (22/10)", () => {
  const roteiro = (respostas: (string | null)[]) => {
    const pedidos: string[] = [];
    let aberturas = 0, fechou = 0;
    const g: Gerador = async (sistema) => {
      aberturas++;
      expect(sistema.length).toBeGreaterThan(10_000);
      return {
        enviar: async (usuario) => {
          pedidos.push(usuario);
          const r = respostas.shift();
          return r === null || r === undefined ? null : { texto: r, provedor: "teste", modelo: "m1" };
        },
        fechar: () => { fechou++; },
      };
    };
    return { g, pedidos, contagem: () => ({ aberturas, fechou }) };
  };

  it("o prompt das telas vem do ui-render e tem as regras da Ely", () => {
    const p = promptDasTelas();
    expect(p).toContain("Brazilian Portuguese");
    expect(p).toContain("BRL");
  });

  it("válida de primeira (com cerca de Markdown em volta)", async () => {
    const { g } = roteiro(["```\n" + BOM + "\n```"]);
    const t = await gerarTela("mostra isso numa tela", "R$ 100", g);
    expect(t?.programa).toBe(BOM);
    expect(t?.tentativas).toBe(1);
    expect(t?.modelo).toBe("m1");
  });

  it("inválida, depois corrigida: os erros voltam ao modelo", async () => {
    const { g, pedidos, contagem } = roteiro(['root = Col([Title("x"), Grafico(1)])', BOM]);
    const reg: { tentativa: number; ok: boolean }[] = [];
    const t = await gerarTela("mostra isso numa tela", "", g, (r) => reg.push(r));
    expect(t?.tentativas).toBe(2);
    expect(pedidos[1]).toMatch(/Grafico/);
    // A correção vai na mesma conversa (abre uma vez, fecha uma vez).
    expect(contagem()).toEqual({ aberturas: 1, fechou: 1 });
    expect(reg.map((r) => r.ok)).toEqual([false, true]);
  });

  it("errou duas vezes: a 3ª vai do zero no próximo modelo (trocar)", async () => {
    const pedidos: string[] = [];
    const respostas = ['root = Col([Title("x"), Grafico(1)])', 'root = Col([Title("x"), Grafico(2)])', BOM];
    let trocas = 0;
    const g: Gerador = async () => ({
      enviar: async (u) => { pedidos.push(u); return { texto: respostas.shift()!, provedor: "teste", modelo: trocas ? "m2" : "m1" }; },
      fechar: () => {},
      trocar: () => { trocas++; return true; },
    });
    const t = await gerarTela("mostra isso numa tela", "", g);
    expect(t?.tentativas).toBe(3);
    expect(t?.modelo).toBe("m2");
    expect(trocas).toBe(1);
    expect(pedidos[2]).toMatch(/Monte uma tela/);
  });

  it("cancelada no meio: null na hora, e a conversa é fechada", async () => {
    let fechou = 0;
    const g: Gerador = async () => ({ enviar: () => new Promise(() => {}), fechar: () => { fechou++; } });
    const c = new AbortController();
    const indo = gerarTela("x", "", g, undefined, c.signal);
    await new Promise((r) => setTimeout(r, 10));
    c.abort();
    expect(await indo).toBeNull();
    expect(fechou).toBe(1);
  });

  it("inválida duas vezes ou sem resposta: sem tela", async () => {
    expect(await gerarTela("x", "", roteiro(["oi, tudo bem?", "root = Col([Title(\"x\""]).g)).toBeNull();
    expect(await gerarTela("x", "", roteiro([null]).g)).toBeNull();
  });
});

describe("proxy de fotos e rotas (22/10)", () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "ely-ui-cache-"));
  const falsa = (corpo: (url: string) => unknown) => {
    const urls: string[] = [];
    const b: Busca = async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => corpo(url) }; };
    return { b, urls };
  };

  it("fotos: só upload.wikimedia.org, sem mapa/logo, e a 2ª vez vem do cache", async () => {
    const { b, urls } = falsa((u) => u.includes("wikipedia") ? { query: { pages: [
      { index: 1, title: "Pinacoteca de São Paulo", thumbnail: { source: "https://upload.wikimedia.org/a/Pinacoteca.jpg" } },
      { index: 2, title: "Pinacoteca mapa", thumbnail: { source: "https://upload.wikimedia.org/a/Mapa_pinacoteca.png" } },
      { index: 3, title: "Pinacoteca falsa", thumbnail: { source: "https://evil.com/Pinacoteca.jpg" } },
    ] } } : { query: { pages: [] } });
    const p = criarProxy(pasta, b);
    expect(await p.fotos("Pinacoteca")).toEqual(["https://upload.wikimedia.org/a/Pinacoteca.jpg"]);
    const n = urls.length;
    expect(await p.fotos("pinacoteca")).toEqual(["https://upload.wikimedia.org/a/Pinacoteca.jpg"]);
    expect(urls.length).toBe(n);
    expect(urls.every((u) => /^https:\/\/(pt\.wikipedia|en\.wikipedia|commons\.wikimedia)\.org\//.test(u))).toBe(true);
  });

  it("rota: coords validadas, OSRM, pontos [lat, lng]", async () => {
    const { b, urls } = falsa(() => ({ code: "Ok", routes: [{ geometry: { coordinates: [[-46.63, -23.53], [-46.64, -23.54]] } }] }));
    const p = criarProxy(pasta, b);
    expect(await p.rota("-46.63,-23.53;-46.64,-23.54")).toEqual([[-23.53, -46.63], [-23.54, -46.64]]);
    expect(urls[0]).toMatch(/^https:\/\/router\.project-osrm\.org\/route\/v1\/driving\//);
    await expect(p.rota("1,2")).rejects.toThrow(/coords/);
    await expect(p.fotos("x")).rejects.toThrow(/consulta/);
  });

  it("regras puras", () => {
    expect(coordsValidas("200,1;2,3")).toBeNull();
    expect(coordsValidas("1,2;3,4;../etc")).toBeNull();
    expect(coordsValidas("1.1234567,2;3,4")).toBe("1.123457,2;3,4");
    expect(fotoAceita("http://upload.wikimedia.org/x.jpg", [])).toBe(false);
    expect(fotoAceita("https://upload.wikimedia.org/Brasao.svg", [])).toBe(false);
    expect(reduzirLinha(Array.from({ length: 5000 }, (_, i) => i), 100)).toHaveLength(100);
  });
});
