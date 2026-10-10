import { describe, expect, it } from "vitest";
import { ehAlucinacaoDoWhisper, ehEntradaDoLive, ehSaidaDoLive } from "../src/services/live";

describe("modo live (bloco 217)", () => {
  it("frases que ligam", () => {
    for (const f of ["modo live", "Ely, modo live", "liga o modo live", "vamos conversar", "Vamos conversar um pouco!", "modo conversa", "conversa comigo"]) expect(ehEntradaDoLive(f), f).toBe(true);
    for (const f of ["modo matemática", "modo foco", "vamos conversar sobre física", "o que é live"]) expect(ehEntradaDoLive(f), f).toBe(false);
  });
  it("frases que desligam", () => {
    for (const f of ["tchau", "Tchau, Ely.", "até mais", "chega por hoje", "sai do modo live", "pode parar de ouvir", "encerrar conversa"]) expect(ehSaidaDoLive(f), f).toBe(true);
    for (const f of ["tchau é como se diz adeus?", "fala tchau pro meu irmão", "chega de música"]) expect(ehSaidaDoLive(f), f).toBe(false);
  });
  it("o que o Whisper inventa com áudio vazio não vira pedido", () => {
    expect(ehAlucinacaoDoWhisper("Legendas pela comunidade Amara.org")).toBe(true);
    expect(ehAlucinacaoDoWhisper("Obrigado por assistir.")).toBe(true);
    expect(ehAlucinacaoDoWhisper("Hmm")).toBe(true);
    expect(ehAlucinacaoDoWhisper("obrigado")).toBe(false);
    expect(ehAlucinacaoDoWhisper("que horas são")).toBe(false);
  });
});
