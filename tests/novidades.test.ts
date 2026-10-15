import { describe, expect, it, vi } from "vitest";
vi.mock("electron-store", () => ({ default: class { private m = new Map(); get(k: string) { return this.m.get(k); } set(o: Record<string, unknown>) { for (const [k, v] of Object.entries(o)) this.m.set(k, v); } } }));
vi.mock("../src/services/webSearch", () => ({ searchWeb: vi.fn() }));
import { diaDasNovidades, frasesDasNovidades, topicosDaResposta, TEMAS } from "../src/services/novidades";

describe("novidades do dia (fase 23)", () => {
  it("o dia vira às 6h", () => {
    expect(diaDasNovidades(new Date(2026, 9, 14, 5, 59))).toBe("2026-10-13");
    expect(diaDasNovidades(new Date(2026, 9, 14, 6, 0))).toBe("2026-10-14");
  });
  it("tira os tópicos da resposta, sem markdown nem link", () => {
    const r = "Aqui vão:\n- **Gemini 4** foi lançado pelo Google com raciocínio melhor (https://blog.google)\n- A OpenAI anunciou um modelo menor e mais barato\n- terceiro tópico que sobra";
    expect(topicosDaResposta(r)).toEqual([
      "Gemini 4 foi lançado pelo Google com raciocínio melhor",
      "A OpenAI anunciou um modelo menor e mais barato",
    ]);
  });
  it("resposta de uma linha só vale como tópico; 'não achei' não", () => {
    expect(topicosDaResposta("Estreia Duna 3 nos cinemas nesta quinta.")).toEqual(["Estreia Duna 3 nos cinemas nesta quinta."]);
    expect(topicosDaResposta("Não encontrei nada relevante hoje.")).toEqual([]);
  });
  it("frase para a fala do resumo", () => {
    expect(frasesDasNovidades([{ tema: "IA", topicos: ["Gemini 4 saiu"] }, { tema: "Cinema", topicos: [] }])).toBe("IA: Gemini 4 saiu.");
  });
  it("três assuntos: IA, cinema e em alta (sem música)", () => {
    expect(TEMAS.map(t => t.tema)).toEqual(["IA", "Cinema", "Em alta"]);
  });
});
