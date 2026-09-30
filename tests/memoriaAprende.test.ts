import { describe, expect, it } from "vitest";
import { addFact, aceitarSugestao, escolherFatos, listarSugestoesDeFato, listFacts, MemoryFact, recusarSugestao, sugerirFato } from "../src/services/memoryStore";
import { interpretarFatos } from "../src/services/aprendizado";

const fato = (text: string, createdAt: number): MemoryFact => ({ id: String(createdAt), text, createdAt });

describe("memória que aprende (bloco 118)", () => {
  it("com poucos fatos, vão todos; com muitos, os que dividem radical com o pedido", () => {
    const poucos = [fato("O usuário ouve rock", 1)];
    expect(escolherFatos(poucos, "qualquer coisa", 12)).toHaveLength(1);
    const muitos = Array.from({ length: 20 }, (_, i) => fato(`Fato aleatório número ${i}`, i));
    muitos.push(fato("O usuário se chama Fulano", 5));
    const escolhidos = escolherFatos(muitos, "como eu me chamo?", 12);
    expect(escolhidos).toHaveLength(12);
    expect(escolhidos.map(f => f.text)).toContain("O usuário se chama Fulano");
  });

  it("interpreta o JSON do modelo e descarta lixo", () => {
    expect(interpretarFatos('{"fatos":["O usuário tem um cachorro chamado Thor","sim",42]}')).toEqual(["O usuário tem um cachorro chamado Thor"]);
    expect(interpretarFatos("texto sem json")).toEqual([]);
    expect(interpretarFatos('ok {"fatos": []} fim')).toEqual([]);
  });

  it("sugestão: aceita vira fato; recusada não volta; fato já sabido não é sugerido", () => {
    addFact("O usuário mora perto do metrô");
    expect(sugerirFato("o usuário mora perto do metrô")).toBeNull();
    const a = sugerirFato("O usuário tem um gato chamado Mingau")!;
    const b = sugerirFato("O usuário estuda engenharia")!;
    expect(listarSugestoesDeFato()).toHaveLength(2);
    aceitarSugestao(a.id);
    expect(listFacts().some(f => f.text.includes("Mingau"))).toBe(true);
    recusarSugestao(b.id);
    expect(sugerirFato("O usuário estuda engenharia")).toBeNull();
    expect(listarSugestoesDeFato()).toHaveLength(0);
  });
});

describe("sugestão parecida com fato guardado", () => {
  it("o mesmo fato com outras palavras não é sugerido", () => {
    addFact("meu peixe se chama Bolota e é um betta azul");
    expect(sugerirFato("O usuário tem um peixe chamado Bolota que é um betta azul.")).toBeNull();
    expect(sugerirFato("O usuário torce para o Corinthians")).not.toBeNull();
  });
});
