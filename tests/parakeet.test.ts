import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp" } }));
import { juntar, limparTexto } from "../src/services/parakeet";

describe("transcrição local (Parakeet, 13/11)", () => {
  it("o nome dela sai certo", () => {
    expect(limparTexto("L, me explica como funciona.")).toBe("Ely, me explica como funciona.");
    expect(limparTexto("Eli, abre o Spotify")).toBe("Ely, abre o Spotify");
    expect(limparTexto("Elie, me explica")).toBe("Ely, me explica");
    expect(limparTexto("ok Eli abre o chrome")).toBe("ok Ely abre o chrome");
    expect(limparTexto("Lá fora está frio")).toBe("Lá fora está frio");
    expect(limparTexto("o livro do Eli Wallach")).toBe("o livro do Eli Wallach");
  });
  it("tira marcas e espaços sobrando", () => {
    expect(limparTexto("  oi <unk>  tudo   bem ")).toBe("oi tudo bem");
  });
  it("junta pedaços e corta pelos últimos N", () => {
    const a = new Float32Array([1, 2, 3]), b = new Float32Array([4, 5]);
    expect([...juntar([a, b])]).toEqual([1, 2, 3, 4, 5]);
    expect([...juntar([a, b], 4)]).toEqual([2, 3, 4, 5]);
    expect([...juntar([a, b], 2)]).toEqual([4, 5]);
    expect(juntar([]).length).toBe(0);
  });
});
