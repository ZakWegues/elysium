import { describe, expect, it } from "vitest";
import { normalizarTelefone, pedidoDeLigacao, roteiroDaLigacao, telefoneMascarado } from "../src/services/telefone";

describe("telefone da Ely (13/10)", () => {
  it("normaliza o número para E.164 (Brasil por padrão)", () => {
    expect(normalizarTelefone("(12) 9 0000-1234")).toBe("+5512900001234");
    expect(normalizarTelefone("55 12 900001234")).toBe("+5512900001234");
    expect(normalizarTelefone("+1 555 123 4567")).toBe("+15551234567");
    expect(normalizarTelefone("123")).toBeNull();
    expect(telefoneMascarado("+5512900001234")).toBe("+55 •• •••••-1234");
  });
  it("frases de ligação", () => {
    expect(pedidoDeLigacao("Ely, me liga")).toEqual({ mensagem: "" });
    expect(pedidoDeLigacao("me liga agora")).toEqual({ mensagem: "" });
    expect(pedidoDeLigacao("me liga daqui a 20 minutos")).toEqual({ mensagem: "", minutos: 20 });
    expect(pedidoDeLigacao("me liga em meia hora pra me lembrar de tirar o bolo")).toEqual({ mensagem: "Tirar o bolo", minutos: 30 });
    expect(pedidoDeLigacao("me liga daqui a 2 horas e me avisa que é hora da reunião")).toEqual({ mensagem: "É hora da reunião", minutos: 120 });
    expect(pedidoDeLigacao("liga o computador")).toBeNull();
    expect(pedidoDeLigacao("ele me liga todo dia")).toBeNull();
  });
  it("roteiro na persona, com o recado e sem dado pessoal fixo", () => {
    const r = roteiroDaLigacao("Tirar o bolo", { nome: "", tratamento: "chefe" });
    expect(r.first_sentence).toBe("Oi, chefe! Aqui é a Ely. Tirar o bolo");
    expect(r.task).toContain("português do Brasil");
    expect(r.task).toContain("\"Tirar o bolo\"");
  });
});
