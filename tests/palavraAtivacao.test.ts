import { describe, expect, it } from "vitest";
import { linhaAcorda } from "../src/services/palavraAtivacao";

describe("palavra de ativação — o que acorda", () => {
  it("só confiança alta ou média, e só com a palavra", () => {
    expect(linhaAcorda("OUVI|High|elysium")).toBe(true);
    expect(linhaAcorda("OUVI|Medium|ei elysium")).toBe(true);
    expect(linhaAcorda("OUVI|High|Ok Elysium\r")).toBe(true);
    // "Low" é o reconhecedor forçando qualquer barulho na frase mais parecida da lista.
    expect(linhaAcorda("OUVI|Low|elysium")).toBe(false);
    expect(linhaAcorda("OUVI|Rejected|")).toBe(false);
    expect(linhaAcorda("OUVI|High|outra coisa")).toBe(false);
    expect(linhaAcorda("ERRO|OUVI|High|elysium")).toBe(false);
    expect(linhaAcorda("PRONTO")).toBe(false);
  });
});
