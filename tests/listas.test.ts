import { describe, expect, it, vi } from "vitest";

vi.mock("electron-store", () => ({ default: class { get(_k: string, d: unknown) { return d; } set() { /* */ } } }));

describe("listas (bloco 135)", async () => {
  const { normalizarNomeLista, separarItens, juntarItens, acharItem, pedidoDeLista, listaFalada } = await import("../src/services/listas");

  it("nome da lista: sinônimos viram Compras/Tarefas; nome livre fica como foi dito", () => {
    expect(normalizarNomeLista("lista do mercado")).toBe("Compras");
    expect(normalizarNomeLista("supermercado")).toBe("Compras");
    expect(normalizarNomeLista(undefined)).toBe("Compras");
    expect(normalizarNomeLista("afazeres")).toBe("Tarefas");
    expect(normalizarNomeLista("lista de presentes")).toBe("Presentes");
    expect(normalizarNomeLista("Viagem à praia")).toBe("Viagem à praia");
  });

  it("separa itens por vírgula e 'e', sem artigo", () => {
    expect(separarItens("leite, um pacote de café e ovos.")).toEqual(["leite", "pacote de café", "ovos"]);
  });

  it("junta sem duplicar; item já marcado volta a ficar pendente", () => {
    const base = { id: "l", nome: "Compras", atualizadaEm: 0, itens: [
      { id: "1", texto: "Leite", feito: false, em: 0 },
      { id: "2", texto: "café", feito: true, em: 0 },
    ] };
    const r = juntarItens(base, ["leite", "Café", "pão"], 5);
    expect(r.repetidos).toEqual(["leite"]);
    expect(r.adicionados).toEqual(["Café", "pão"]);
    expect(r.lista.itens.map(i => [i.texto, i.feito])).toEqual([["Leite", false], ["café", false], ["pão", false]]);
    expect(base.itens[1].feito).toBe(true);
    expect(acharItem(r.lista, "o pão")?.texto).toBe("pão");
  });

  it("frase de pôr na lista vira pedido; o resto não", () => {
    expect(pedidoDeLista("põe leite, ovo e café na lista do mercado")).toEqual({ itens: ["leite", "ovo", "café"], lista: "Compras" });
    expect(pedidoDeLista("adiciona comprar presente na lista de tarefas")).toEqual({ itens: ["comprar presente"], lista: "Tarefas" });
    expect(pedidoDeLista("coloca pilha na lista")).toEqual({ itens: ["pilha"], lista: "Compras" });
    expect(pedidoDeLista("põe uma música")).toBeNull();
    expect(pedidoDeLista("o que tem na lista")).toBeNull();
  });

  it("lista falada", () => {
    expect(listaFalada({ id: "l", nome: "Compras", atualizadaEm: 0, itens: [
      { id: "1", texto: "leite", feito: false, em: 0 }, { id: "2", texto: "ovo", feito: false, em: 0 }, { id: "3", texto: "pão", feito: true, em: 0 },
    ] })).toBe("Na lista Compras: leite e ovo.");
    expect(listaFalada({ id: "l", nome: "Compras", atualizadaEm: 0, itens: [] })).toBe("A lista Compras está vazia.");
  });
});
