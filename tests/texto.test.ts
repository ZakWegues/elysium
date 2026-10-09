import { describe, expect, it } from "vitest";
import { emFrase, radicais, semAcento } from "../src/services/texto";
import { diaLocal, hhmm, isoLocal } from "../src/services/hora";

describe("texto e hora (bloco 202)", () => {
  it("sem acento, radicais e lista falada", () => {
    expect(semAcento("Ação Já ÇÃO")).toBe("acao ja cao");
    expect([...radicais("Chamado chamo, ótimo")]).toEqual(["cham", "otim"]);
    expect(emFrase(["a"])).toBe("a");
    expect(emFrase(["a", "b", "c"])).toBe("a, b e c");
  });
  it("data e hora locais, não UTC", () => {
    const d = new Date(2026, 9, 9, 22, 5);
    expect(diaLocal(d)).toBe("2026-10-09");
    expect(isoLocal(d)).toBe("2026-10-09T22:05");
    expect(hhmm(d)).toBe("22:05");
  });
});
