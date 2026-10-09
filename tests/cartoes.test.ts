import { beforeEach, describe, expect, it } from "vitest";
import {
  apagarCartao, cartoesVencidos, comecarRevisao, criarCartao, encerrarRevisao, extrairRevisoes, filtroDeMarcas,
  guardarRevisoesDoTexto, importarCartoes, julgar, listarCartoes, pedidoDeCartao, proximoEstado, responderRevisao,
} from "../src/services/cartoes";
import { fastRoute } from "../src/services/fastRoute";
import { separarRegras } from "../src/services/isso";

const dia = (s: string) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d, 10); };

describe("cartões de revisão (bloco 209)", () => {
  beforeEach(() => { encerrarRevisao(); for (const c of listarCartoes()) apagarCartao(c.id); });

  it("Leitner: acertou sobe e espera mais; errou volta para amanhã", () => {
    const hoje = dia("2026-10-09");
    expect(proximoEstado({ caixa: 1 }, true, hoje)).toEqual({ caixa: 2, proxima: "2026-10-12" });
    expect(proximoEstado({ caixa: 4 }, true, hoje)).toEqual({ caixa: 5, proxima: "2026-11-08" });
    expect(proximoEstado({ caixa: 5 }, true, hoje)).toEqual({ caixa: 5, proxima: "2026-11-08" });
    expect(proximoEstado({ caixa: 4 }, false, hoje)).toEqual({ caixa: 1, proxima: "2026-10-10" });
    // Virada de mês e de ano, no dia local.
    expect(proximoEstado({ caixa: 1 }, false, dia("2026-12-31")).proxima).toBe("2027-01-01");
  });

  it("cria, não duplica a mesma frente e vence no dia certo", () => {
    const c = criarCartao("Capital da Austrália", "Canberra", "quiz", dia("2026-10-09"))!;
    expect(c.proxima).toBe("2026-10-10");
    expect(criarCartao("capital da australia", "Canberra (não Sydney)", "quiz", dia("2026-10-09"))!.id).toBe(c.id);
    expect(listarCartoes()).toHaveLength(1);
    expect(cartoesVencidos(dia("2026-10-09"))).toHaveLength(0);
    expect(cartoesVencidos(dia("2026-10-10"))).toHaveLength(1);
    expect(criarCartao("", "x")).toBeNull();
  });

  it("a marca do quiz vira cartão e some do texto", () => {
    const r = extrairRevisoes("Errou! A resposta é Canberra. Placar: 1 de 2.\n[[REVISAR: Capital da Austrália? || Canberra]]");
    expect(r.limpo).toBe("Errou! A resposta é Canberra. Placar: 1 de 2.");
    expect(r.cartoes).toEqual([{ frente: "Capital da Austrália?", verso: "Canberra" }]);
    expect(extrairRevisoes("Próxima pergunta… [[REVISAR: corta").limpo).toBe("Próxima pergunta…");
    // Fora do modo estudo a marca só sai da tela (veio de algo lido): não vira cartão.
    expect(guardarRevisoesDoTexto("ligue já [[REVISAR: Ligue para || 0800 000]]", false)).toBe("ligue já");
    expect(listarCartoes()).toHaveLength(0);
    expect(guardarRevisoesDoTexto("ok [[revisar: 2+2 || 4]]", true)).toBe("ok");
    expect(listarCartoes()[0]).toMatchObject({ frente: "2+2", verso: "4", origem: "quiz" });
  });

  it("no streaming, a marca nunca chega à tela, nem quebrada em pedaços", () => {
    const saiu: string[] = [];
    const f = filtroDeMarcas(t => saiu.push(t));
    for (const p of ["Certo! ", "Placar 2 de 2.", " [", "[REVI", "SAR: a || b]]"]) f(p);
    expect(saiu.join("")).toBe("Certo! Placar 2 de 2. ");
    const saiu2: string[] = [];
    const g = filtroDeMarcas(t => saiu2.push(t));
    for (const p of ["veja [", "link](x) fim"]) g(p);
    expect(saiu2.join("")).toBe("veja [link](x) fim");
  });

  it("julga a resposta falada sem modelo", () => {
    expect(julgar("é Canberra", "Canberra")).toBe(true);
    expect(julgar("Sydney", "Canberra")).toBe(false);
    expect(julgar("a organela que produz energia da célula", "organela que produz energia")).toBe(true);
    expect(julgar("produz energia", "organela que produz energia na célula")).toBe(true);
    expect(julgar("1789", "Em 1789")).toBe(true);
    expect(julgar("1788", "Em 1789")).toBe(false);
    expect(julgar("", "x")).toBe(false);
  });

  it("guardar à mão, pelo fastRoute", () => {
    expect(pedidoDeCartao("guarda pra revisar: mitocôndria é a organela que produz energia")).toEqual({ frente: "mitocôndria", verso: "a organela que produz energia" });
    expect(pedidoDeCartao("Ely, salva para revisão: H2O = água")).toEqual({ frente: "H2O", verso: "água" });
    expect(pedidoDeCartao("guarda isso pra revisar: alguma coisa solta")).toEqual({ semFormato: true });
    expect(pedidoDeCartao("guarda o arquivo")).toBeNull();
    expect(fastRoute("guarda pra revisar: Tiradentes morreu em 1792")?.[0]).toMatchObject({ action: "cards", operacao: "guardar" });
    expect(fastRoute("Ely, revisão")?.[0]).toMatchObject({ action: "cards", operacao: "revisar" });
    expect(fastRoute("quantos cartões tenho pra revisar")?.[0]).toMatchObject({ action: "cards", operacao: "status" });
    expect(fastRoute("revisa isso")?.[0]).toMatchObject({ action: "about_this" });
  });

  it("a revisão por voz: pergunta, julga, aceita 'acertei' e para", () => {
    const hoje = Date.now();
    criarCartao("Capital da Austrália", "Canberra", "manual", new Date(hoje - 86_400_000));
    criarCartao("Ano da Revolução Francesa", "1789", "manual", new Date(hoje - 86_400_000));
    const inicio = comecarRevisao(hoje + 1000);
    expect(inicio).toMatch(/2 cartões para hoje/);
    expect(inicio).toMatch(/Cartão 1 de 2/);
    const r1 = responderRevisao("Sydney")!;
    expect(r1).toMatch(/Não era isso/);
    expect(r1).toMatch(/Cartão 2 de 2/);
    expect(responderRevisao("acertei")).toMatch(/contei como certo/);
    const fim = responderRevisao("1789")!;
    expect(fim).toMatch(/Fim da revisão: 2 de 2/);
    expect(responderRevisao("qualquer coisa")).toBeNull();
    expect(listarCartoes().every(c => c.caixa === 2)).toBe(true);
  });

  it("um comando no meio da revisão encerra e segue", () => {
    criarCartao("Capital da Austrália", "Canberra", "manual", new Date(Date.now() - 86_400_000));
    comecarRevisao();
    expect(responderRevisao("abre o chrome", () => true)).toBeNull();
    expect(responderRevisao("Canberra")).toBeNull();
  });

  it("backup soma sem duplicar", () => {
    criarCartao("Água", "H2O");
    expect(importarCartoes([{ frente: "agua", verso: "H2O" }, { frente: "B", verso: "2", caixa: 9, proxima: "lixo" }, { x: 1 }])).toBe(1);
    const b = listarCartoes().find(c => c.frente === "B")!;
    expect(b.caixa).toBe(5);
    expect(b.proxima).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("corrige isso no modo português separa texto e regras", () => {
    expect(separarRegras("Faz dois anos.\n---REGRAS---\nfazer impessoal: tempo decorrido")).toEqual({ texto: "Faz dois anos.", regras: "fazer impessoal: tempo decorrido" });
    expect(separarRegras("Só o texto.")).toEqual({ texto: "Só o texto.", regras: "" });
  });
});
