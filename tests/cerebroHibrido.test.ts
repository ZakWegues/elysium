import { describe, expect, it } from "vitest";
import { ehPerguntaDeConhecimento, provedorDaConversa, provedorDeFundo } from "../src/services/cerebroHibrido";

describe("cérebro híbrido (fase 16)", () => {
  it("reconhece pergunta de conhecimento; conversa curta não", () => {
    expect(ehPerguntaDeConhecimento("quem foi Santos Dumont?")).toBe(true);
    expect(ehPerguntaDeConhecimento("como funciona um buraco negro")).toBe(true);
    expect(ehPerguntaDeConhecimento("qual a capital da Austrália")).toBe(true);
    expect(ehPerguntaDeConhecimento("oi, tudo bem?")).toBe(false);
    expect(ehPerguntaDeConhecimento("valeu")).toBe(false);
  });
  it("auto: texto e conhecimento na nuvem, voz curta no local; sem chave sempre local", () => {
    expect(provedorDaConversa("auto", "oi tudo bem", "texto", true)).toBe("groq");
    expect(provedorDaConversa("auto", "quem foi Turing?", "voz", true)).toBe("groq");
    expect(provedorDaConversa("auto", "valeu", "voz", true)).toBe("ollama");
    expect(provedorDaConversa("auto", "quem foi Turing?", "voz", false)).toBe("ollama");
    expect(provedorDaConversa("ollama", "quem foi Turing?", "texto", true)).toBe("ollama");
    expect(provedorDaConversa("groq", "oi", "voz", true)).toBe("groq");
    expect(provedorDeFundo("auto")).toBe("ollama");
  });
  it("migração: local vira híbrido uma vez; nuvem fica", async () => {
    const { migrarCerebroHibrido } = await import("../src/main/config");
    expect(migrarCerebroHibrido({ chatProvider: "ollama" })).toEqual({ cerebroHibridoAplicado: true, chatProvider: "auto" });
    expect(migrarCerebroHibrido({ chatProvider: "groq" })).toEqual({ cerebroHibridoAplicado: true });
    expect(migrarCerebroHibrido({ cerebroHibridoAplicado: true })).toBeNull();
  });
});
