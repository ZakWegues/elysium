import { describe, expect, it } from "vitest";
import { pausaDepoisDe } from "../src/services/cotaGemini";
import { pausaDoHermes } from "../src/services/hermes/cerebro";
import { semFala } from "../src/services/stt";
import { pausaDoStudio } from "../src/services/vozStudioStream";

describe("velocidade e precisão (25/11)", () => {
  it("as pausas dobram e têm teto", () => {
    expect(pausaDepoisDe(1, null)).toBe(60_000);
    expect(pausaDepoisDe(1, 90_000)).toBe(90_000);
    expect(pausaDepoisDe(3, null)).toBe(240_000);
    expect(pausaDepoisDe(20, null)).toBe(30 * 60_000);
    expect([0, 1, 2, 3, 12].map(pausaDoHermes)).toEqual([0, 0, 120_000, 240_000, 15 * 60_000]);
    expect([1, 2, 10].map(pausaDoStudio)).toEqual([60_000, 120_000, 30 * 60_000]);
  });
  it("áudio sem fala não vira pedido", () => {
    expect(semFala({ text: "Obrigado.", segments: [{ no_speech_prob: 0.5, avg_logprob: -0.4 }] })).toBe(true);
    expect(semFala({ text: "Obrigado.", segments: [{ no_speech_prob: 0.02, avg_logprob: -0.2 }] })).toBe(false);
    expect(semFala({ text: "abre o chrome", segments: [{ no_speech_prob: 0.4, avg_logprob: -0.3 }] })).toBe(false);
    expect(semFala({ text: "blá", segments: [{ no_speech_prob: 0.9, avg_logprob: -1 }] })).toBe(true);
    expect(semFala({ text: "oi" })).toBe(false);
  });
});

describe("sessão nova do Hermes no meio da conversa (27/11)", () => {
  it("leva a conversa até aqui; sem conversa, nada", async () => {
    const { blocoDaConversa } = await import("../src/services/hermes/cerebro");
    expect(blocoDaConversa([])).toBe("");
    const b = blocoDaConversa([
      { role: "user", content: "O port de GTA 6 está a quantos porcento segundo o portwatch?" },
      { role: "assistant", content: "Não tenho a informação atualizada." },
    ]);
    expect(b).toMatch(/^\[A CONVERSA ATÉ AGORA/);
    expect(b).toMatch(/Ele: O port de GTA 6/);
    expect(b).toMatch(/Ely: Não tenho/);
  });
});
