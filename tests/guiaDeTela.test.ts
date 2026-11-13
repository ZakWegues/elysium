import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp" }, safeStorage: {} }));
import { acaoDestrutiva, atalhoDeTela, pediuNaTela, pedidoDestrutivo, validarGuia, vksDe } from "../src/services/guiaDeTela";

const leitura = {
  titulo: "Downloads", processo: "explorer",
  elementos: [
    { i: 0, t: "Button", n: "Nova pasta", x: 10, y: 10, w: 80, h: 30, a: "", v: "" },
    { i: 1, t: "Button", n: "Excluir", x: 100, y: 10, w: 80, h: 30, a: "", v: "" },
    { i: 2, t: "Edit", n: "Pesquisar", x: 300, y: 10, w: 200, h: 30, a: "SearchBox", v: "" },
    { i: 3, t: "Button", n: "Desinstalar", x: 520, y: 10, w: 90, h: 30, a: "", v: "" },
  ],
};

describe("guia de tela (13/11)", () => {
  it("reconhece pedido sobre a tela, e deixa o resto com o cérebro", () => {
    for (const q of ["onde fica o botão de nova pasta?", "como eu faço isso aqui", "clica em salvar", "escreve relatório no campo de busca", "fecha essa guia", "me mostra onde muda o tema nesse site"]) expect(pediuNaTela(q), q).toBe(true);
    for (const q of ["o que é um buraco negro", "abre o spotify", "que horas são", "me lembra de ligar amanhã"]) expect(pediuNaTela(q), q).toBe(false);
  });

  it("'fecha essa guia' é sempre Ctrl+W — nunca fechar o programa nem desinstalar", () => {
    expect(atalhoDeTela("fecha essa guia")).toEqual({ tipo: "teclas", teclas: "ctrl+w", descricao: "Fechando a guia…" });
    expect(atalhoDeTela("Ely, feche esta aba")).toMatchObject({ teclas: "ctrl+w" });
    expect(atalhoDeTela("abre uma nova guia")).toMatchObject({ teclas: "ctrl+t" });
    expect(atalhoDeTela("atualiza a página")).toMatchObject({ teclas: "f5" });
    expect(atalhoDeTela("volta")).toMatchObject({ teclas: "alt+left" });
    expect(atalhoDeTela("desinstala esse app")).toBeNull();
    expect(atalhoDeTela("abre a guia de downloads")).toBeNull();
  });

  it("teclas viram teclas virtuais", () => {
    expect(vksDe("ctrl+w")).toEqual([0x11, 0x57]);
    expect(vksDe("alt+f4")).toEqual([0x12, 0x73]);
    expect(vksDe("ctrl+shift+t")).toEqual([0x11, 0x10, 0x54]);
    expect(vksDe("alt+left")).toEqual([0x12, 0x25]);
    expect(vksDe("ctrl+nada")).toBeNull();
  });

  it("destrutivo: pelo nome do elemento ou pela tecla", () => {
    expect(acaoDestrutiva({ tipo: "clicar", i: 1 }, leitura.elementos)).toBe(true);
    expect(acaoDestrutiva({ tipo: "clicar", i: 3 }, leitura.elementos)).toBe(true);
    expect(acaoDestrutiva({ tipo: "clicar", i: 0 }, leitura.elementos)).toBe(false);
    expect(acaoDestrutiva({ tipo: "teclas", teclas: "shift+delete", descricao: "" }, leitura.elementos)).toBe(true);
    expect(acaoDestrutiva({ tipo: "teclas", teclas: "ctrl+w", descricao: "" }, leitura.elementos)).toBe(false);
    expect(pedidoDestrutivo("apaga esse arquivo")).toBe(true);
    expect(pedidoDestrutivo("fecha essa guia")).toBe(false);
  });

  it("o modelo não executa nada destrutivo que ele não pediu; pedindo, vai para a confirmação", () => {
    const g = validarGuia({ fala: "ok", passos: [{ dizer: "Clique", marcas: [{ tipo: "anel", i: 3 }] }], acao: { tipo: "clicar", i: 3 } }, leitura, "fecha essa guia");
    expect(g.acao).toBeNull();
    expect(g.recusa).toBe("destrutiva sem pedido");
    const g2 = validarGuia({ fala: "ok", passos: [], acao: { tipo: "clicar", i: 1 } }, leitura, "exclui esse arquivo");
    expect(g2.acao).toEqual({ tipo: "clicar", i: 1 });
    expect(g2.destrutiva).toBe(true);
    const g3 = validarGuia({ fala: "ok", passos: [], acao: { tipo: "clicar", i: 0 } }, leitura, "clica em nova pasta");
    expect(g3.destrutiva).toBe(false);
  });

  it("descarta marca em elemento que não existe, tipo inválido e tecla esquisita", () => {
    const g = validarGuia({ fala: "x", passos: [{ dizer: "a", marcas: [{ tipo: "anel", i: 99 }, { tipo: "fogo", i: 0 }, { tipo: "num", i: 0 }] }], acao: { tipo: "teclas", teclas: "rm -rf /" } }, leitura, "como faço");
    expect(g.passos[0].marcas).toEqual([{ tipo: "num", i: 0, n: 1 }]);
    expect(g.acao).toBeNull();
  });
});
