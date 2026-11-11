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

describe("interromper a fala dizendo Elysium (fase 12)", async () => {
  const { podeInterromper } = await import("../src/services/palavraAtivacao");
  it("confiança alta ou média (19/10)", () => {
    expect(podeInterromper("High", "Em Recife, 22 graus.")).toBe(true);
    expect(podeInterromper("Medium", "Em Recife, 22 graus.")).toBe(true);
  });
  it("nunca quando a própria fala diz o nome", () => {
    expect(podeInterromper("High", "Eu sou o ELYSIUM, seu assistente.")).toBe(false);
  });
  it("nunca quando a palavra ouvida está na fala dela (eco da caixa de som)", () => {
    expect(podeInterromper("High", "Separei isso para você.", "para")).toBe(false);
    expect(podeInterromper("High", "Separei isso para você.", "chega")).toBe(true);
    expect(podeInterromper("High", "Separei isso para você.", "ely para")).toBe(true);
  });
});

describe("o que o reconhecedor ouviu (19/10)", async () => {
  const { lerLinha } = await import("../src/services/palavraAtivacao");
  it("acordar, parar e voz", () => {
    expect(lerLinha("OUVI|High|ei ely")).toEqual({ tipo: "acordar", confianca: "High", texto: "ei ely" });
    expect(lerLinha("OUVI|Medium|ely para")?.tipo).toBe("parar");
    expect(lerLinha("OUVI|High|chega\r")?.tipo).toBe("parar");
    expect(lerLinha("OUVI|Rejected|")).toEqual({ tipo: "voz" });
    expect(lerLinha("VOZ|")).toEqual({ tipo: "voz" });
    expect(lerLinha("PRONTO")).toBeNull();
    expect(lerLinha("ERRO|x")).toBeNull();
  });
});
