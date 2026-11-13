import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp" }, safeStorage: {} }));
import { achatar, pediuDesenho, validarCartoes } from "../src/services/desenhoRapido";

describe("desenho rápido da Ely flutuante (12/11)", () => {
  it("reconhece pedido de explicação ou desenho", () => {
    expect(pediuDesenho("me explica como funciona um buraco negro")).toBe(true);
    expect(pediuDesenho("Como é que funciona o motor do carro?")).toBe(true);
    expect(pediuDesenho("desenha o sistema solar")).toBe(true);
    expect(pediuDesenho("o que é fotossíntese")).toBe(true);
    expect(pediuDesenho("me testa sobre o sistema solar")).toBe(true);
    expect(pediuDesenho("me mostra uma foto de golden retriever")).toBe(true);
    expect(pediuDesenho("resolve 2x + 3 = 11")).toBe(true);
    expect(pediuDesenho("um motor de 4 tempos em 3D")).toBe(true);
    expect(pediuDesenho("abre o spotify")).toBe(false);
    expect(pediuDesenho("que horas são")).toBe(false);
  });

  it("aceita o diagrama do buraco negro e prende as coordenadas", () => {
    const [c] = validarCartoes({ cartoes: [{ tipo: "diagrama", titulo: "Buraco negro", partes: [
      { forma: "ponto", x: 0, y: 0, r: 0.05, rotulo: "Singularidade" },
      { forma: "anel", x: 0, y: 0, r: 0.4, tom: "a", rotulo: "Horizonte de eventos" },
      { forma: "circulo", x: 9, y: 0, r: 0.08, tom: "roxo-errado", movimento: "orbita" },
    ] }] });
    expect(c.tipo).toBe("diagrama");
    if (c.tipo !== "diagrama") return;
    expect(c.partes).toHaveLength(3);
    expect(c.partes[2].x).toBe(0);
    expect(c.partes[2].tom).toBeUndefined();
    expect(c.partes[2].movimento).toBe("orbita");
  });

  it("descarta tipo desconhecido, cartão vazio e ligação para nó que não existe", () => {
    const r = validarCartoes([
      { tipo: "script", codigo: "alert(1)" },
      { tipo: "cartao" },
      { tipo: "fluxo", nos: [{ id: "a", texto: "Coração" }, { id: "b", texto: "Pulmão" }], ligacoes: [{ de: "a", para: "b", andando: true }, { de: "a", para: "z" }] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].tipo === "fluxo" && r[0].ligacoes).toEqual([{ de: "a", para: "b", andando: true }]);
  });

  it("fluxo sem nenhuma ligação vira a sequência dos nós", () => {
    const [f] = validarCartoes([{ tipo: "fluxo", nos: [{ id: "1", texto: "Admissão" }, { id: "2", texto: "Compressão" }, { id: "3", texto: "Explosão" }] }]);
    expect(f.tipo === "fluxo" && f.ligacoes).toEqual([{ de: "1", para: "2", andando: true }, { de: "2", para: "3", andando: true }]);
  });

  it("corta textos e listas longas em vez de recusar, e no máximo 2 cartões", () => {
    const longo = "x".repeat(500);
    const r = validarCartoes([
      { tipo: "cartao", titulo: longo, itens: Array(10).fill("item") },
      { tipo: "passos", itens: Array(9).fill({ titulo: "passo" }) },
      { tipo: "cartao", texto: "terceiro" },
    ]);
    expect(r).toHaveLength(2);
    expect(r[0].tipo === "cartao" && r[0].titulo?.length).toBe(70);
    expect(r[0].tipo === "cartao" && r[0].itens?.length).toBe(6);
    expect(r[1].tipo === "passos" && r[1].itens.length).toBe(6);
  });

  it("o cartão do esquema ({tipo, titulo, <tipo>: {...}}) fica achatado; o já achatado passa igual", () => {
    expect(achatar({ tipo: "passos", titulo: "Como", passos: { itens: [{ titulo: "a" }] } })).toEqual({ tipo: "passos", titulo: "Como", itens: [{ titulo: "a" }] });
    expect(achatar({ tipo: "cartao", texto: "oi" })).toEqual({ tipo: "cartao", texto: "oi" });
    expect(validarCartoes([achatar({ tipo: "diagrama", titulo: "Átomo", diagrama: { partes: [{ forma: "ponto", x: 0, y: 0, r: 5, movimento: "nenhum" }] } })])).toHaveLength(1);
    // Inteiros de −100 a 100 viram a escala do desenho.
    expect(achatar({ tipo: "diagrama", diagrama: { partes: [{ forma: "anel", x: 50, y: -20, r: 40 }] } })).toEqual({ tipo: "diagrama", partes: [{ forma: "anel", x: 0.5, y: -0.2, r: 0.4 }] });
  });
});
