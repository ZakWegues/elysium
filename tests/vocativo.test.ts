import { beforeEach, describe, expect, it } from "vitest";
import { decidirVocativo, dosarTratamento, tirarVocativo, zerarVocativo } from "../src/services/vocativo";

describe("o \"chefe\" na medida (19/10)", () => {
  beforeEach(() => zerarVocativo());

  it("tira o vocativo, não a palavra", () => {
    expect(tirarVocativo("Pronto, chefe.", "chefe")).toBe("Pronto.");
    expect(tirarVocativo("Chefe, achei três arquivos.", "chefe")).toBe("Achei três arquivos.");
    expect(tirarVocativo("Certo, chefe, já abri.", "chefe")).toBe("Certo, já abri.");
    expect(tirarVocativo("Feito. Chefe. Mais algo?", "chefe")).toBe("Feito. Mais algo?");
    expect(tirarVocativo("O chefe do projeto mandou e-mail.", "chefe")).toBe("O chefe do projeto mandou e-mail.");
    expect(tirarVocativo("Tudo certo, Chefe!", "chefe")).toBe("Tudo certo!");
  });

  it("com permissão, só na primeira frase", () => {
    const t = "Pronto, chefe. Baixei os dois, chefe. Quer abrir?";
    expect(dosarTratamento(t, "chefe", true)).toBe("Pronto, chefe. Baixei os dois. Quer abrir?");
    expect(dosarTratamento(t, "chefe", false)).toBe("Pronto. Baixei os dois. Quer abrir?");
    expect(dosarTratamento("Baixei os dois, chefe.", "chefe", true, false)).toBe("Baixei os dois.");
    expect(dosarTratamento("Pronto, chefe.", "", false)).toBe("Pronto, chefe.");
  });

  it("nunca em respostas seguidas, e na maioria das vezes não", () => {
    expect(decidirVocativo(() => 0)).toBe(true);
    expect(decidirVocativo(() => 0)).toBe(false);
    expect(decidirVocativo(() => 0)).toBe(false);
    expect(decidirVocativo(() => 0)).toBe(true);
    expect(decidirVocativo(() => 0.9)).toBe(false);
  });
});

describe("frases fixas com o tratamento sorteado (19/10)", async () => {
  const { tratamentoSorteado } = await import("../src/services/vocativo");
  it("só às vezes, nunca seguido", () => {
    zerarVocativo();
    expect(tratamentoSorteado("chefe", () => 0)).toBe("chefe");
    expect(tratamentoSorteado("chefe", () => 0)).toBe("");
    expect(tratamentoSorteado("", () => 0)).toBe("");
  });
});
