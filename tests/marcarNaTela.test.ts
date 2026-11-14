import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp" }, safeStorage: {}, desktopCapturer: {}, screen: {} }));
import { acharAlvos, falaDaMarca, imagemConfere, limparAlvo, pedidoDeMarca } from "../src/services/marcarNaTela";
import { caixaNaTela } from "../src/services/olhos";
import type { ElementoUia, LeituraUia } from "../src/services/uiaHost";

const el = (i: number, t: string, n: string, extra: Partial<ElementoUia> = {}): ElementoUia => ({ i, t, n, x: 100 + i * 50, y: 100, w: 40, h: 40, a: "", v: "", ...extra });
const chrome: LeituraUia = {
  titulo: "Nova guia", processo: "chrome", x: 0, y: 0, w: 1600, h: 900,
  elementos: [
    el(0, "Document", "Nova guia", { x: 0, y: 0, w: 1600, h: 900 }),
    el(1, "Edit", "Barra de endereço e de pesquisa"),
    el(2, "Hyperlink", "YouTube"),
    el(3, "Text", "YouTube"),
    el(4, "Hyperlink", "Gmail"),
    el(5, "Hyperlink", "Ver no YouTube Music", { x: 700 }),
    el(6, "Button", "Salvar", { o: 1 }),
    el(7, "Hyperlink", "Política de privacidade", { x: 300, y: 800 }),
    el(8, "Hyperlink", "Termos", { x: 400, y: 800 }),
  ],
};

describe("marcar na tela (14/11, o draw do Roamies)", () => {
  it("entende o pedido, o alvo e o tipo da marca", () => {
    expect(pedidoDeMarca("circula o símbolo do YouTube")).toEqual({ alvo: "youtube", tipo: "anel", todos: false });
    expect(pedidoDeMarca("Ely, circula pra mim onde está o símbolo do YouTube.")).toMatchObject({ alvo: "youtube", tipo: "anel" });
    expect(pedidoDeMarca("aponta o botão salvar")).toMatchObject({ alvo: "salvar", tipo: "seta" });
    expect(pedidoDeMarca("sublinha todos os links de termos")).toMatchObject({ alvo: "termos", tipo: "sublinhado", todos: true });
    expect(pedidoDeMarca("me mostra onde fica o campo de busca")).toMatchObject({ alvo: "busca", tipo: "anel" });
    expect(pedidoDeMarca("onde está o Gmail?")).toMatchObject({ alvo: "gmail" });
    expect(pedidoDeMarca("destaca o ícone do Spotify")).toMatchObject({ alvo: "spotify", tipo: "destaque" });
  });

  it("não confunde com outros pedidos", () => {
    for (const q of ["marca uma consulta amanhã às 10", "mostra o clima de hoje", "abre o youtube", "que horas são", "circula", "escreve bom dia aqui"]) expect(pedidoDeMarca(q), q).toBeNull();
  });

  it("limpa o alvo", () => {
    expect(limparAlvo(" o ícone do WhatsApp aqui na tela")).toBe("whatsapp");
    expect(limparAlvo("a palavra 'importante'")).toBe("importante");
  });

  it("acha o alvo pela acessibilidade: o link antes do texto, nada fora da vista nem a página inteira", () => {
    expect(acharAlvos(chrome, "youtube", false).map((e) => e.i)).toEqual([2]);
    expect(acharAlvos(chrome, "salvar", false)).toEqual([]);
    expect(acharAlvos(chrome, "nova guia", false)).toEqual([]);
    expect(acharAlvos(chrome, "youtube", true).map((e) => e.i)).toContain(5);
  });

  it("a frase depois de marcar", () => {
    const p = { alvo: "youtube", tipo: "anel" as const, todos: false };
    expect(falaDaMarca(p, 1, false)).toBe("Aqui.");
    expect(falaDaMarca(p, 1, true)).toBe("Acho que é aqui.");
    expect(falaDaMarca(p, 0, false)).toContain("Não achei");
    expect(falaDaMarca({ ...p, todos: true }, 4, false)).toBe("Achei 4.");
  });

  it("olhos: a caixa 0–1000 vira retângulo na tela; caixa da janela inteira não vale", () => {
    expect(caixaNaTela({ x: 100, y: 0, w: 1000, h: 500 }, { achou: true, x1: 500, y1: 400, x2: 560, y2: 520 })).toEqual({ x: 600, y: 200, w: 60, h: 60 });
    expect(caixaNaTela({ x: 0, y: 0, w: 1000, h: 500 }, { achou: true, x1: 0, y1: 0, x2: 1000, y2: 1000 })).toBeNull();
    expect(caixaNaTela({ x: 0, y: 0, w: 1000, h: 500 }, { achou: false })).toBeNull();
  });
});

describe("conferir o que a imagem achou", () => {
  it("aceita nome que combina, sem nome ou contêiner; recusa outro controle com outro nome", () => {
    expect(imagemConfere({ t: "Hyperlink", n: "youtube.com" }, "youtube")).toBe(true);
    expect(imagemConfere({ t: "Image", n: "" }, "youtube")).toBe(true);
    expect(imagemConfere({ t: "Document", n: "Nova guia" }, "youtube")).toBe(true);
    expect(imagemConfere({ t: "Image", n: "Google" }, "youtube")).toBe(false);
    expect(imagemConfere(null, "youtube")).toBe(true);
  });
});
