import { describe, expect, it } from "vitest";
import { criarFiltroDeFontes, limparParaVoz, promptDePesquisa, regraDeFontes, separarFontes } from "../src/services/hermes/pesquisa";

describe("pesquisa pelo Hermes (fase 23)", () => {
  it("o pedido leva a data, a pergunta e o formato das fontes", () => {
    const p = promptDePesquisa("lançou o Gemini 4?", "texto", new Date(2026, 9, 14));
    expect(p).toContain("2026");
    expect(p).toContain("Pergunta: lançou o Gemini 4?");
    expect(p).toContain("FONTES:");
    expect(p).toContain("Não rode comandos");
  });
  it("voz pede resposta curta sem markdown", () => {
    expect(promptDePesquisa("x", "voz")).toContain("LIDA EM VOZ ALTA");
  });
  it("separa resposta e fontes, sem repetir site", () => {
    const r = separarFontes("O Gemini 4 saiu ontem.\n\nFONTES:\n- Blog do Google | https://blog.google/gemini-4.\n- Outra página do Google | https://blog.google/x\n- The Verge — https://www.theverge.com/ai/123\nlinha sem link");
    expect(r.texto).toBe("O Gemini 4 saiu ontem.");
    expect(r.fontes).toEqual([
      { titulo: "Blog do Google", url: "https://blog.google/gemini-4" },
      { titulo: "The Verge", url: "https://www.theverge.com/ai/123" },
    ]);
  });
  it("sem bloco de fontes, devolve o texto inteiro", () => {
    expect(separarFontes("Só a resposta.")).toEqual({ texto: "Só a resposta.", fontes: [] });
  });
  it("limpa markdown e links para a voz", () => {
    expect(limparParaVoz("**Sim**, veja https://x.com agora")).toBe("Sim, veja agora");
  });
});

describe("filtro de fontes no streaming", () => {
  it("passa o texto e segura o bloco FONTES", () => {
    const saida: string[] = [];
    const f = criarFiltroDeFontes((t) => saida.push(t));
    for (const p of ["O Gemini ", "4 saiu.", "\n\nFON", "TES:\n- x | https://a.com"]) f.empurrar(p);
    expect(saida.join("")).toBe("O Gemini 4 saiu.");
  });
  it("sem emissor não quebra", () => {
    expect(() => criarFiltroDeFontes().empurrar("oi")).not.toThrow();
  });
  it("regra de fontes muda com o canal", () => {
    expect(regraDeFontes("texto")).toContain("FONTES:");
    expect(regraDeFontes("voz")).not.toContain("FONTES:");
  });
});
