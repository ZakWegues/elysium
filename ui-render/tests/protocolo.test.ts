import { describe, expect, it } from "vitest";
import { linkSeguro, mensagemDaTela, mensagemDoHost } from "../src/protocolo";

const tema = { esquema: "escuro" as const };

describe("protocolo host ↔ tela", () => {
  it("aceita as mensagens do host no formato", () => {
    expect(mensagemDoHost.safeParse({ tipo: "programa", texto: 'root = Title("Oi")', tema }).success).toBe(true);
    expect(mensagemDoHost.safeParse({ tipo: "tema", tema: { esquema: "claro", vars: { "--iui-ink": "#111" }, reduzirMovimento: true } }).success).toBe(true);
    expect(mensagemDoHost.safeParse({ tipo: "config", internet: false }).success).toBe(true);
    expect(mensagemDoHost.safeParse({ tipo: "resposta", id: 3, dados: { fotos: [] } }).success).toBe(true);
  });

  it("recusa tipo desconhecido, campo faltando e programa gigante", () => {
    expect(mensagemDoHost.safeParse({ tipo: "eval", codigo: "alert(1)" }).success).toBe(false);
    expect(mensagemDoHost.safeParse({ tipo: "programa", texto: "x" }).success).toBe(false);
    expect(mensagemDoHost.safeParse({ tipo: "programa", texto: "x".repeat(200_001), tema }).success).toBe(false);
    expect(mensagemDoHost.safeParse("programa").success).toBe(false);
    expect(mensagemDoHost.safeParse(null).success).toBe(false);
  });

  it("tema não injeta CSS: nome fora de --iui-*, url(), ; ou chaves são recusados", () => {
    const comVars = (vars: Record<string, string>) => mensagemDoHost.safeParse({ tipo: "tema", tema: { esquema: "escuro", vars } }).success;
    expect(comVars({ "--iui-ink": "rgb(1 2 3 / 50%)" })).toBe(true);
    expect(comVars({ color: "red" })).toBe(false);
    expect(comVars({ "--iui-ink": "url(https://x.com/a.png)" })).toBe(false);
    expect(comVars({ "--iui-ink": "red; background: url(x)" })).toBe(false);
    expect(comVars({ "--iui-ink": "red}body{display:none" })).toBe(false);
    expect(comVars({ "--iui-ink": "</style><script>" })).toBe(false);
  });

  it("o host recusa o que a tela manda fora do esquema", () => {
    expect(mensagemDaTela.safeParse({ tipo: "acao", acao: "perguntar", valor: "e amanhã?" }).success).toBe(true);
    expect(mensagemDaTela.safeParse({ tipo: "acao", acao: "executar", valor: "rm -rf" }).success).toBe(false);
    expect(mensagemDaTela.safeParse({ tipo: "altura", px: -5 }).success).toBe(false);
    expect(mensagemDaTela.safeParse({ tipo: "altura", px: 1e9 }).success).toBe(false);
    expect(mensagemDaTela.safeParse({ tipo: "pedido", id: 1, rota: "arquivo", params: { caminho: "C:/" } }).success).toBe(false);
    expect(mensagemDaTela.safeParse({ tipo: "acao", acao: "copiar", valor: "x".repeat(4001) }).success).toBe(false);
  });

  it("link: só https, sem usuário/senha", () => {
    expect(linkSeguro("https://pt.wikipedia.org/wiki/Enzima")).toBe("https://pt.wikipedia.org/wiki/Enzima");
    for (const ruim of ["javascript:alert(1)", "file:///C:/Windows/win.ini", "http://exemplo.com", "data:text/html,<b>", "https://user:senha@exemplo.com", "nada"]) {
      expect(linkSeguro(ruim), ruim).toBeNull();
    }
  });
});
