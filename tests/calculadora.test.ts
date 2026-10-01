import { describe, expect, it } from "vitest";
import { calcular, formatarNumero } from "../src/services/calculadora";

describe("calculadora (bloco 138)", () => {
  it("contas básicas, precedência e parênteses", () => {
    expect(calcular("2 + 3 * 4")).toBe(14);
    expect(calcular("(2 + 3) * 4")).toBe(20);
    expect(calcular("2 ^ 10")).toBe(1024);
    expect(calcular("-3 + 5")).toBe(2);
    expect(calcular("10 / 4")).toBe(2.5);
  });

  it("falado e no jeito brasileiro", () => {
    expect(calcular("quanto é 15% de 230?")).toBeCloseTo(34.5);
    expect(calcular("200 mais 10%")).toBeCloseTo(220);
    expect(calcular("1.234,5 vezes 2")).toBeCloseTo(2469);
    expect(calcular("3.5 x 2")).toBe(7);
    expect(calcular("raiz de 144")).toBe(12);
    expect(calcular("12 dividido por 4 mais 1")).toBe(4);
    expect(calcular("5 ao quadrado")).toBe(25);
  });

  it("o que não é conta devolve null", () => {
    expect(calcular("abre o chrome")).toBeNull();
    expect(calcular("2 +")).toBeNull();
    expect(calcular("(2 + 3")).toBeNull();
    expect(calcular("")).toBeNull();
  });

  it("formata em pt-BR", () => {
    expect(formatarNumero(1234.5)).toBe("1.234,5");
    expect(formatarNumero(1 / 3)).toBe("0,333333");
  });
});
