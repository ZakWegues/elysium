import { describe, expect, it } from "vitest";
import { pedeResposta } from "../src/services/live";

describe("responder sem chamar de novo (19/10)", () => {
  it("abre o microfone só quando ela termina perguntando", () => {
    expect(pedeResposta("Achei duas pastas. Qual delas?")).toBe(true);
    expect(pedeResposta("Vou desligar o PC em 30 segundos. Confirma? Diga sim.")).toBe(true);
    expect(pedeResposta("Quer que eu abra?\" ")).toBe(true);
    expect(pedeResposta("Pronto.")).toBe(false);
    expect(pedeResposta("Achei o arquivo 'por que?' na pasta.")).toBe(false);
    expect(pedeResposta("")).toBe(false);
  });
});
