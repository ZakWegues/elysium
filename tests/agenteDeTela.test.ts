import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp" }, safeStorage: {}, clipboard: {}, shell: {}, desktopCapturer: {}, screen: {} }));
vi.mock("../src/services/ferramentas", () => ({ executarFerramenta: vi.fn() }));
import { acharPorTexto, elementoDestrutivo, garantirEnter, pedacosDaDigitacao, ficouEscrito, janelaParaModelo, literalParaAqui, pedeComposicao, pediuAcaoNaTela, validarRodada } from "../src/services/agenteDeTela";
import { pontoNaTela } from "../src/services/olhos";
import type { LeituraUia } from "../src/services/uiaHost";

const leitura: LeituraUia = {
  titulo: "Nova guia - Google Chrome", processo: "chrome", x: 0, y: 0, w: 1600, h: 900,
  elementos: [
    { i: 0, t: "Button", n: "Fechar", x: 0, y: 0, w: 10, h: 10, a: "", v: "" },
    { i: 1, t: "Edit", n: "Barra de endereço e de pesquisa", x: 0, y: 0, w: 10, h: 10, a: "", v: "", f: 1 } as never,
    { i: 2, t: "Button", n: "Enviar", x: 0, y: 0, w: 10, h: 10, a: "", v: "" },
    { i: 3, t: "Text", n: "Enviar arquivos", x: 0, y: 0, w: 10, h: 10, a: "", v: "" },
    { i: 4, t: "Button", n: "Excluir conta", x: 0, y: 0, w: 10, h: 10, a: "", v: "" },
  ],
};

describe("agente de tela (13/11, no jeito do act_in_app do Roamies)", () => {
  it("valida os passos do modelo: só números que existem, teclas conhecidas", () => {
    const r = validarRodada({
      passos: [
        { do: "preencher", id: 1, texto: "bom dia" }, { do: "clicar", id: 99 }, { do: "tecla", teclas: "Enter" },
        { do: "tecla", teclas: "rm -rf" }, { do: "rolar", direcao: "baixo", fim: true }, { do: "abrir", alvo: "javascript:alert(1)" },
        { do: "abrir", alvo: "https://www.youtube.com/results?search_query=gatos" }, { do: "inventado" },
      ],
      pronto: true, fala: "Escrevi.", marcar: [{ id: 2, texto: "aqui" }, { id: 50 }],
    }, new Set(leitura.elementos.map((e) => e.i)));
    expect(r.passos).toEqual([
      { do: "preencher", id: 1, texto: "bom dia" }, { do: "tecla", teclas: "enter" },
      { do: "rolar", id: -1, direcao: "baixo", fim: true }, { do: "abrir", alvo: "https://www.youtube.com/results?search_query=gatos" },
    ]);
    expect(r.pronto).toBe(true);
    expect(r.marcar).toEqual([{ id: 2, texto: "aqui" }]);
    expect(validarRodada(null, new Set()).passos).toEqual([]);
  });

  it("mostra a janela ao modelo com o campo do cursor marcado", () => {
    const t = janelaParaModelo(leitura);
    expect(t).toContain('Janela: chrome — "Nova guia - Google Chrome"');
    expect(t).toContain("1|Edit|Barra de endereço e de pesquisa (cursor aqui)");
  });

  it("acha pelo texto preferindo botão e nome exato", () => {
    expect(acharPorTexto(leitura, "enviar")?.i).toBe(2);
    expect(acharPorTexto(leitura, "barra de endereco")?.i).toBe(1);
    expect(acharPorTexto(leitura, "inexistente")).toBeNull();
  });

  it("confere se o texto ficou no campo", () => {
    expect(ficouEscrito("bom dia", "bom dia")).toBe(true);
    expect(ficouEscrito("Olá! bom  dia\r\n", "bom dia")).toBe(true);
    expect(ficouEscrito("bom", "bom dia")).toBe(false);
    expect(ficouEscrito(null, "x")).toBe(false);
  });

  it("botão que apaga é destrutivo; o resto não", () => {
    expect(elementoDestrutivo(leitura.elementos[4])).toBe(true);
    expect(elementoDestrutivo(leitura.elementos[2])).toBe(false);
  });

  it("'escreve bom dia aqui' é o atalho literal; destino ou composição não", () => {
    expect(literalParaAqui("escreve bom dia aqui")).toBe("bom dia");
    expect(literalParaAqui("Ely, escreve bom dia")).toBe("bom dia");
    expect(literalParaAqui("digita 'oi, tudo bem?' aqui")).toBe("oi, tudo bem?");
    expect(literalParaAqui("escreve bom dia na barra de pesquisa do Chrome")).toBeNull();
    expect(literalParaAqui("escreve um prompt pedindo pra corrigir o login")).toBeNull();
    expect(literalParaAqui("escreve um poema sobre o mar")).toBeNull();
    expect(literalParaAqui("o que é um buraco negro")).toBeNull();
  });

  it("pedido de fazer vai ao agente; pergunta fica com o guia", () => {
    for (const q of ["clica em enviar", "preenche o nome com Ana", "escolhe Brasil no país", "rola até o final da página", "seleciona a segunda opção"]) expect(pediuAcaoNaTela(q), q).toBe(true);
    for (const q of ["onde fica o botão de enviar", "como faço pra mudar a senha", "abre o spotify", "que horas são"]) expect(pediuAcaoNaTela(q), q).toBe(false);
  });

  it("pesquisar/mandar ganha o Enter que o modelo esqueceu", () => {
    const so = [{ do: "preencher" as const, id: 1, texto: "gatos" }];
    expect(garantirEnter("pesquisa gatos no youtube", so).at(-1)).toEqual({ do: "tecla", teclas: "enter" });
    expect(garantirEnter("escreve gatos na busca", so)).toEqual(so);
    expect(garantirEnter("manda oi no whatsapp", [...so, { do: "clicar", id: 2 }])).toHaveLength(2);
  });

  it("digitação animada: pedaços por linha, quebra separada, no máximo ~70 passos", () => {
    expect(pedacosDaDigitacao("oi")).toEqual(["o", "i"]);
    expect(pedacosDaDigitacao("ab\r\ncd")).toEqual(["a", "b", null, "c", "d"]);
    const longo = pedacosDaDigitacao("x".repeat(700));
    expect(longo.length).toBeLessThanOrEqual(70);
    expect(longo.join("")).toBe("x".repeat(700));
  });

  it("composição usa o modelo maior", () => {
    expect(pedeComposicao("escreve um prompt pro claude code")).toBe(true);
    expect(pedeComposicao("escreve bom dia")).toBe(false);
  });

  it("olhos: 0–1000 da foto vira pixel da tela", () => {
    expect(pontoNaTela({ x: 100, y: 50, w: 1000, h: 500 }, 500, 500)).toEqual({ x: 600, y: 300 });
    expect(pontoNaTela({ x: 0, y: 0, w: 100, h: 100 }, 1200, 10)).toBeNull();
    expect(pontoNaTela({ x: 0, y: 0, w: 100, h: 100 }, "x", 10)).toBeNull();
  });
});
