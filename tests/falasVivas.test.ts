import { beforeEach, describe, expect, it } from "vitest";
import { escolher, esquecerUltimas, fraseDeArranque, fraseDeEspera, fraseDeHabito, fraseDeLembrete, fraseDeTimer, tipoDeEspera } from "../src/services/falasVivas";

beforeEach(() => esquecerUltimas());

describe("falas vivas (bloco 188)", () => {
  it("a espera diz o que ela está fazendo", () => {
    expect(tipoDeEspera("pesquisa o preço da RTX 5070")).toBe("busca");
    expect(tipoDeEspera("quais as notícias de hoje")).toBe("busca");
    expect(tipoDeEspera("o que tem na minha tela?")).toBe("tela");
    expect(tipoDeEspera("resume esse link pra mim")).toBe("leitura");
    expect(tipoDeEspera("fecha o chrome, abre o spotify e toca lo-fi")).toBe("varias");
    expect(tipoDeEspera("quem foi Santos Dumont")).toBe("geral");
    expect(fraseDeEspera("pesquisa o dólar hoje", () => 0)).toBe("Vou pesquisar.");
  });

  it("nunca repete a última frase do mesmo grupo", () => {
    const sempreZero = () => 0;
    const a = escolher("x", ["A", "B", "C"], sempreZero);
    const b = escolher("x", ["A", "B", "C"], sempreZero);
    expect(a).toBe("A");
    expect(b).not.toBe(a);
    // Grupo de uma frase só repete, claro.
    expect(escolher("y", ["Só"], sempreZero)).toBe("Só");
    expect(escolher("y", ["Só"], sempreZero)).toBe("Só");
  });

  it("o conteúdo nunca muda, só a moldura", () => {
    for (let i = 0; i < 6; i++) {
      expect(fraseDeLembrete("estudar matemática.")).toMatch(/estudar matemática\.$/);
      expect(fraseDeTimer("miojo")).toMatch(/miojo/);
      expect(fraseDeHabito("Água")).toMatch(/Água/);
    }
    expect(fraseDeTimer(undefined)).toMatch(/timer|tempo/i);
  });

  it("arranque com o tratamento e o período", () => {
    const f = fraseDeArranque("chefe", 9, () => 0.5);
    expect(f).toMatch(/chefe/);
    expect(fraseDeArranque("chefe", 9, () => 0.5)).not.toBe(f);
    expect(fraseDeArranque("", 22, () => 0.5)).not.toMatch(/,\s*\./);
    esquecerUltimas();
    expect(fraseDeArranque("chefe", 22, () => 0.5)).toBe("Boa noite, chefe. Tudo pronto.");
  });
});
