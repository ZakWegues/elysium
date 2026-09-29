import { describe, expect, it } from "vitest";
import { compararVersoes, partesDaVersao } from "../src/services/atualizacao";
import { mascarar } from "../src/main/logArquivo";

describe("atualização automática (bloco 95)", () => {
  it("lê a tag da release com ou sem o v", () => {
    expect(partesDaVersao("v1.5.0")).toEqual([1, 5, 0]);
    expect(partesDaVersao("1.10.2-beta.1")).toEqual([1, 10, 2]);
  });

  it("compara número a número, não como texto", () => {
    expect(compararVersoes("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compararVersoes("v1.5.0", "1.5.0")).toBe(0);
    expect(compararVersoes("1.4.0", "1.5.0")).toBeLessThan(0);
    expect(compararVersoes("1.5", "1.5.0")).toBe(0);
  });

  it("o log esconde token do GitHub", () => {
    const t = mascarar("token ghp_ABCDEFGHIJKLMNOPQRSTUV e github_pat_11AAAAAAAAAAAAAAAAAAAAAA_bbbbbbbbbb");
    expect(t).not.toMatch(/ABCDEFGHIJKLMNOP/);
    expect(t).not.toMatch(/11AAAAAAAAAAAAAAAA/);
    expect(t).toContain("ghp_[oculto]");
  });
});

describe("instalar sozinho de madrugada", async () => {
  const { horaDeInstalarSozinho } = await import("../src/services/atualizacao");
  const as = (h: number) => new Date(2026, 8, 30, h, 20);
  it("só entre 3 e 5 h, com o PC parado e o app ocioso", () => {
    expect(horaDeInstalarSozinho(as(3), 20 * 60, false)).toBe(true);
    expect(horaDeInstalarSozinho(as(4), 20 * 60, false)).toBe(true);
    expect(horaDeInstalarSozinho(as(5), 20 * 60, false)).toBe(false);
    expect(horaDeInstalarSozinho(as(2), 20 * 60, false)).toBe(false);
    expect(horaDeInstalarSozinho(as(3), 5 * 60, false)).toBe(false);   // alguém mexeu no PC
    expect(horaDeInstalarSozinho(as(3), 20 * 60, true)).toBe(false);   // ELYSIUM falando
  });
});
