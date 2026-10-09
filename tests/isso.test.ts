import { describe, expect, it } from "vitest";
import { comecoDe, janelaDaFrente, pedidoComIsso } from "../src/services/isso";
import { fastRoute } from "../src/services/fastRoute";

const jan = (processo: string, titulo: string, emFoco = false, minimizada = false) =>
  ({ hwnd: titulo, pid: 1, processo, titulo, minimizada, maximizada: false, emFoco });

describe("'resume isso' (bloco 193)", () => {
  it("reconhece o pedido e o comando", () => {
    expect(pedidoComIsso("resume isso")).toBe("resumir");
    expect(pedidoComIsso("Ely, traduz isso pro inglês")).toBe("ingles");
    expect(pedidoComIsso("traduz isso para o português")).toBe("portugues");
    expect(pedidoComIsso("me explica isso aqui".replace(" aqui", ""))).toBe("explicar");
    expect(pedidoComIsso("corrige o que eu copiei")).toBe("corrigir");
    expect(pedidoComIsso("explica o que tá na tela")).toBe("explicar");
    expect(fastRoute("resume isso")).toEqual([{ action: "about_this", comando: "resumir" }]);
  });

  it("não sequestra pedido com assunto", () => {
    expect(pedidoComIsso("resume o capítulo 3 de Dom Casmurro")).toBeNull();
    expect(pedidoComIsso("traduz bom dia para o inglês")).toBeNull();
    expect(pedidoComIsso("explica como funciona um SSD")).toBeNull();
  });

  it("a janela da frente pula o próprio ELYSIUM", () => {
    expect(janelaDaFrente([jan("ELYSIUM", "ELYSIUM", true), jan("chrome", "Artigo"), jan("Code", "x")])?.titulo).toBe("Artigo");
    expect(janelaDaFrente([jan("chrome", "Artigo"), jan("Code", "Projeto", true)])?.titulo).toBe("Projeto");
    expect(janelaDaFrente([jan("electron", "dev", true)])).toBeNull();
  });

  it("começo do texto para dizer o que usou", () => {
    expect(comecoDe("um dois três quatro cinco seis sete oito")).toBe("um dois três quatro cinco seis…");
    expect(comecoDe("curto")).toBe("curto");
  });
});
