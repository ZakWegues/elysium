import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// O arquivo é um script do dashboard (sem import/export); no Node ele se expõe por module.exports.
const require = createRequire(import.meta.url);
const L = require("../src/renderer/dashboard/js/esfera-logica.js") as {
  RITMO_PENSANDO: number; NASCER_MS: number;
  easeOutCubic(k: number): number;
  fatorNoturno(h: number): { giro: number; brilho: number; respira: number };
  pulsoDeTecla(n: number): number;
};

describe("esfera — fator noturno", () => {
  it("é noite das 22h às 6h", () => {
    for (const h of [22, 23, 0, 3, 5, 5.99]) expect(L.fatorNoturno(h).giro).toBe(0.6);
    expect(L.fatorNoturno(23).brilho).toBe(0.75);
  });
  it("é dia das 6h às 22h", () => {
    for (const h of [6, 12, 18, 21.99]) expect(L.fatorNoturno(h)).toEqual({ giro: 1, brilho: 1, respira: 1 });
  });
  it("aceita hora fora de 0–23", () => {
    expect(L.fatorNoturno(24 + 23).giro).toBe(0.6);
    expect(L.fatorNoturno(-1).giro).toBe(0.6);
  });
});

describe("esfera — pulso de tecla", () => {
  it("soma 0,08 até o teto de 0,35", () => {
    expect(L.pulsoDeTecla(0)).toBeCloseTo(0.08);
    expect(L.pulsoDeTecla(0.3)).toBeCloseTo(0.35);
  });
  it("não abaixa quem já está alto", () => {
    expect(L.pulsoDeTecla(0.8)).toBe(0.8);
  });
});

describe("esfera — curva e constantes", () => {
  it("easeOutCubic vai de 0 a 1 e é presa nas pontas", () => {
    expect(L.easeOutCubic(0)).toBe(0);
    expect(L.easeOutCubic(1)).toBe(1);
    expect(L.easeOutCubic(2)).toBe(1);
    expect(L.easeOutCubic(0.5)).toBeCloseTo(0.875);
  });
  it("ritmo do pensando e tempo de nascer", () => {
    expect(L.RITMO_PENSANDO).toBe(4);
    expect(L.NASCER_MS).toBe(900);
  });
});
