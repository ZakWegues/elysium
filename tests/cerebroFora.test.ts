import { describe, expect, it } from "vitest";
import { motivoDaFalha } from "../src/services/brain";
import { enderecoLocal, falhaDeConexao } from "../src/services/ollamaVivo";

describe("cérebro fora do ar (fase 12)", () => {
  it("diz a causa em vez de 'não entendi'", () => {
    expect(motivoDaFalha('HTTP 429 {"error":{"message":"Rate limit reached ... Please try again in 10.7925s."}}')).toMatch(/pausa de 11 segundos/);
    expect(motivoDaFalha("não consegui falar com o Ollama: TypeError: fetch failed")).toMatch(/Ollama/);
    expect(motivoDaFalha("resposta sem ação aproveitável")).toMatch(/não respondeu/);
  });

  it("só tenta subir Ollama local e só por falha de conexão", () => {
    expect(enderecoLocal("http://127.0.0.1:11434")).toBe(true);
    expect(enderecoLocal("http://localhost:11434")).toBe(true);
    expect(enderecoLocal("http://192.168.0.40:11434")).toBe(false);
    expect(falhaDeConexao(new TypeError("fetch failed"))).toBe(true);
    expect(falhaDeConexao(new Error("HTTP 404 model not found"))).toBe(false);
  });
});
