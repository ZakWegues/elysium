import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp" }, safeStorage: {} }));
import { escritaRapida, insistiu, janelaAlvo, pediuParaEscrever, validarEscrita } from "../src/services/escreverNoApp";

const j = (processo: string, titulo = "", extra = {}) => ({ hwnd: String(Math.random()).slice(2, 8), pid: 1, processo, titulo, minimizada: false, maximizada: false, emFoco: false, ...extra });

describe("escrever no programa (13/11, como o Roamies)", () => {
  it("reconhece pedido de escrever em algum lugar", () => {
    for (const q of ["escreve bom dia na barra de pesquisa do Chrome", "escreve pro Claude Code corrigir o bug do login", "digita oi no WhatsApp", "pesquisa receita de bolo no google", "escreve aqui: reunião às 15h"]) expect(pediuParaEscrever(q), q).toBe(true);
    for (const q of ["escreve um poema sobre o mar", "o que é um buraco negro", "abre o chrome", "me manda um resumo"]) expect(pediuParaEscrever(q), q).toBe(false);
  });

  it("literal curto sai sem modelo, com o lugar e o Enter certos", () => {
    expect(escritaRapida("escreve bom dia na barra de pesquisa do Chrome")).toMatchObject({ texto: "bom dia", app: "chrome", lugar: "endereco", enviar: false, melhorou: false });
    expect(escritaRapida("pesquisa gatos fofos no google")).toMatchObject({ texto: "gatos fofos", lugar: "endereco", enviar: true });
    expect(escritaRapida("Ely, digita \"oi, tudo bem?\" no WhatsApp")).toMatchObject({ texto: "oi, tudo bem?", lugar: "foco", enviar: false });
    // prompt/mensagem ou longo: vai ao modelo (para melhorar)
    expect(escritaRapida("escreve um prompt pedindo para corrigir o login no Claude Code")).toBeNull();
    expect(escritaRapida("escreve que eu vou chegar atrasado porque o trânsito está horrível no WhatsApp")).toBeNull();
  });

  it("acha a janela certa: o citado, o Claude Code pelo título, ou a da frente", () => {
    const js = [j("chrome", "Google"), j("WindowsTerminal", "claude — ELYSIUM"), j("WindowsTerminal", "PowerShell"), j("notepad", "nota")];
    expect(janelaAlvo("escreve oi no chrome", "", js, null)?.processo).toBe("chrome");
    expect(janelaAlvo("escreve pro claude code arrumar o bug", "claude code", js, null)?.titulo).toBe("claude — ELYSIUM");
    expect(janelaAlvo("escreve aqui", "", js, js[3])?.processo).toBe("notepad");
    expect(janelaAlvo("escreve no excel", "excel", js, js[0])).toBeNull();
    // camadas por cima nunca são o alvo
    expect(janelaAlvo("escreve aqui", "roamies", [j("roamies", "Roamies")], null)).toBeNull();
  });

  it("insistir refaz o pedido anterior", () => {
    for (const q of ["faz de qualquer jeito", "Ely, pode fazer", "faz isso", "faz logo", "sim, faz", "eu quero, faz assim mesmo"]) expect(insistiu(q), q).toBe(true);
    for (const q of ["faz um bolo de chocolate", "o que você faz?", "abre o spotify"]) expect(insistiu(q), q).toBe(false);
  });

  it("valida o que o modelo devolveu", () => {
    expect(validarEscrita({ texto: "\"Olá\"", lugar: "foco", enviar: true, melhorou: true, fala: "Escrevi." })).toMatchObject({ texto: "Olá", lugar: "foco", enviar: true });
    expect(validarEscrita({ texto: "x", lugar: "lugar-estranho" })?.lugar).toBe("foco");
    expect(validarEscrita({ texto: "" })).toBeNull();
  });
});
