import { describe, expect, it } from "vitest";
import { contraste, hexDoDestaque, paletaMinimal } from "../src/services/paletaMinimal";

describe("tema Minimal (20/10)", () => {
  it("lê a cor de destaque do Windows", () => {
    expect(hexDoDestaque("0078d4ff")).toBe("#0078d4");
    expect(hexDoDestaque("#FF8800")).toBe("#ff8800");
    expect(hexDoDestaque("lixo")).toBeNull();
    expect(hexDoDestaque(undefined)).toBeNull();
  });

  it("claro ou escuro conforme o sistema, com o destaque como acento", () => {
    const claro = paletaMinimal(false, "0078d4ff");
    expect(claro.family).toBe("lg");
    expect(claro.bg).toBe("#ffffff");
    expect(claro.purple).toBe("#0078d4");
    const escuro = paletaMinimal(true, "0078d4ff");
    expect(escuro.family).toBe("ely");
    expect(escuro.bg).toBe("#101012");
  });

  it("o acento sempre lê sobre o fundo (amarelo no branco, azul-marinho no preto)", () => {
    expect(contraste(paletaMinimal(false, "#ffee00").purple, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(contraste(paletaMinimal(true, "#001040").purple, "#101012")).toBeGreaterThanOrEqual(3);
  });

  it("sem cor do sistema, cai no azul padrão do Windows", () => {
    expect(paletaMinimal(false).purple).toBe("#0078d4");
  });
});
