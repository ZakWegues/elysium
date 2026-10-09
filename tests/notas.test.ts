import { describe, expect, it } from "vitest";
import { falaDaNota, notaNecessaria, pedidoDeMediaEscolar } from "../src/services/notas";
import { fastRoute } from "../src/services/fastRoute";
import { executarFerramenta } from "../src/services/ferramentas";

describe("quanto preciso tirar (bloco 211)", () => {
  it("média simples e ponderada", () => {
    expect(notaNecessaria({ notas: [6, 7], media: 6 })?.necessaria).toBe(5);
    // (7·(2+3+3) − (5·2 + 8·3)) / 3 = (56 − 34) / 3 = 7,33… → 7,4 (para cima).
    expect(notaNecessaria({ notas: [5, 8], pesos: [2, 3], media: 7, pesoFaltante: 3 })?.necessaria).toBe(7.4);
    // Duas provas faltando: (6·4 − (4+5)) / 2 = 7,5.
    expect(notaNecessaria({ notas: [4, 5], media: 6, faltam: 2 })?.necessaria).toBe(7.5);
    expect(notaNecessaria({ notas: [6], media: 0 })).toBeNull();
  });

  it("os três finais na fala", () => {
    const passou = { notas: [10, 10], media: 6 };
    expect(falaDaNota(notaNecessaria(passou)!, passou)).toMatch(/já fechou a média: mesmo com zero na próxima, fica com 6,6/);
    const naoDa = { notas: [1, 2], media: 7 };
    expect(falaDaNota(notaNecessaria(naoDa)!, naoDa)).toMatch(/não dá mais: precisaria de 18 na próxima, acima de 10/);
    const normal = { notas: [6, 7], media: 6 };
    expect(falaDaNota(notaNecessaria(normal)!, normal)).toBe("Você precisa de 5 na próxima para fechar com 6.");
  });

  it("entende o que se fala", () => {
    expect(pedidoDeMediaEscolar("tirei 6 e 7, a média é 6, quanto preciso na terceira?")).toEqual({ notas: [6, 7], media: 6 });
    expect(pedidoDeMediaEscolar("quanto preciso tirar pra fechar com 7 se tirei 5,5 e 8?")).toEqual({ notas: [5.5, 8], media: 7 });
    expect(pedidoDeMediaEscolar("tirei 5 com peso 2 e 8 com peso 3, média 7, quanto preciso tirar na última de peso 3?"))
      .toEqual({ notas: [5, 8], pesos: [2, 3], media: 7, pesoFaltante: 3 });
    expect(pedidoDeMediaEscolar("tirei 4 e 5, média 6, quanto preciso nas duas últimas?")).toEqual({ notas: [4, 5], media: 6, faltam: 2 });
    expect(pedidoDeMediaEscolar("quanto preciso tirar na 3ª prova se tirei 6 e 7 e a média é 6")).toEqual({ notas: [6, 7], media: 6 });
    expect(pedidoDeMediaEscolar("quanto preciso tirar?")).toBeNull();
    expect(pedidoDeMediaEscolar("tirei 6 e 7")).toBeNull();
    expect(fastRoute("tirei 6 e 7, a média é 6, quanto preciso na terceira?")?.[0]).toMatchObject({ action: "grade_needed", notas: [6, 7], media: 6 });
  });

  it("a ferramenta do agente faz a mesma conta", async () => {
    expect(await executarFerramenta("nota_necessaria", { notas: [6, 7], media: 6 })).toBe("Você precisa de 5 na próxima para fechar com 6.");
  });
});

describe("nota necessária: casos da revisão", () => {
  it("dinheiro não é nota; ordinal não é nota", () => {
    expect(pedidoDeMediaEscolar("quanto preciso guardar por mês pra ficar com 5000 se eu tenho 2000?")).toBeNull();
    expect(pedidoDeMediaEscolar("tirei 8 na 1ª prova e 5 na 2ª, média 6, quanto preciso na 3ª?")).toEqual({ notas: [8, 5], media: 6 });
  });
});
