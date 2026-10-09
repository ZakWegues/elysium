import { describe, expect, it } from "vitest";
import { matematicaParaOuvido, paraOuvido, simbolosParaOuvido } from "../src/services/falaParaOuvido";
import { cleanTextForSpeech } from "../src/services/tts";

const limpo = (s: string) => s.replace(/\s+/g, " ").trim();

describe("conta para o ouvido (bloco 206)", () => {
  it("símbolos que valem em qualquer conversa", () => {
    expect(limpo(simbolosParaOuvido("x² + y³"))).toBe("x ao quadrado + y ao cubo");
    expect(limpo(simbolosParaOuvido("2¹⁰"))).toBe("2 elevado a 10");
    expect(limpo(simbolosParaOuvido("√9 = 3"))).toBe("raiz quadrada de 9 = 3");
    expect(limpo(simbolosParaOuvido("√(x+1)"))).toBe("raiz quadrada de x+1");
    expect(limpo(simbolosParaOuvido("a ≠ b, a ≥ 2, π"))).toBe("a diferente de b, a maior ou igual a 2, pi");
  });

  it("no modo de conta: operadores, potência, fração e função", () => {
    expect(limpo(matematicaParaOuvido("2x + 5 = 17"))).toBe("2x mais 5 igual a 17");
    expect(limpo(matematicaParaOuvido("x^2 - 4"))).toBe("x ao quadrado menos 4");
    expect(limpo(matematicaParaOuvido("x^{3}"))).toBe("x ao cubo");
    expect(limpo(matematicaParaOuvido("3/4 de 20"))).toBe("3 quartos de 20");
    expect(limpo(matematicaParaOuvido("1/2"))).toBe("1 meio");
    expect(limpo(matematicaParaOuvido("7/13"))).toBe("7 sobre 13");
    expect(limpo(matematicaParaOuvido("2*3 = 6"))).toBe("2 vezes 3 igual a 6");
    expect(limpo(matematicaParaOuvido("12 ÷ 4"))).toBe("12 dividido por 4");
    expect(limpo(matematicaParaOuvido("sen(30°) = 1/2"))).toBe("seno de 30° igual a 1 meio");
    expect(limpo(matematicaParaOuvido("cos x"))).toBe("cosseno de x");
    expect(limpo(matematicaParaOuvido("$\\frac{3}{4}$ e \\sqrt{16}"))).toBe("3 quartos e raiz quadrada de 16");
    expect(limpo(matematicaParaOuvido("-3 + 5"))).toBe("menos 3 mais 5");
  });

  it("não estraga data, palavra nem dinheiro", () => {
    expect(limpo(matematicaParaOuvido("prova 3/4 às 14h"))).toBe("prova 3/4 às 14h");
    expect(limpo(matematicaParaOuvido("dia 3/4"))).toBe("dia 3/4");
    expect(limpo(matematicaParaOuvido("15/10/2026"))).toBe("15/10/2026");
    expect(limpo(matematicaParaOuvido("o sentido da costa"))).toBe("o sentido da costa");
    expect(limpo(matematicaParaOuvido("custa R$ 12"))).toBe("custa R$ 12");
    expect(limpo(matematicaParaOuvido("bem-vindo"))).toBe("bem-vindo");
  });

  it("fora do modo, data continua data e treino continua treino", () => {
    expect(paraOuvido("prova em 3/4")).toBe("prova em 3 de abril");
    expect(paraOuvido("3×10")).toBe("3 séries de 10");
    expect(cleanTextForSpeech("**Resposta:** x = 3/4", true)).toMatch(/x igual a 3 quartos/);
    expect(cleanTextForSpeech("2 * 3 * 4", true)).toMatch(/2 vezes 3 vezes 4/);
    expect(cleanTextForSpeech("prova em 3/4", false)).toMatch(/3 de abril/);
  });
});
