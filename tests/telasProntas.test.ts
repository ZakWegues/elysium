import { describe, expect, it } from "vitest";
import { carregarValidador } from "../src/services/telaInteligente";
import {
  lerDados, numerosDaConta, numerosDeFinanciamento, programaConta, programaFinanciamento, programaPronto, sistemaDosDados, tipoDeTelaPronta,
  type TipoComDados,
} from "../src/services/telasProntas";

const v = carregarValidador();
const valida = (programa: string) => {
  const r = v.validarPrograma(programa);
  return r.ok ? "ok" : r.erros.slice(0, 3).join(" | ");
};

describe("telas prontas: qual tela (24/10)", () => {
  it("pedidos reais vão para o tipo certo", () => {
    const casos: [string, string | null][] = [
      ["faz uma calculadora de financiamento", "financiamento"],
      ["Gera uma calculadora de financiamento", "financiamento"],
      ["quanto fica um empréstimo de 30 mil em 36 vezes?", "financiamento"],
      ["divide a conta de 240 entre 4", "dividir-conta"],
      ["me mostra um painel dos meus gastos do mês", "painel"],
      ["faz um dashboard das vendas", "painel"],
      ["compara o iPhone 17 com o Pixel 11", "comparacao"],
      ["me dá flashcards de bioquímica", "flashcards"],
      ["faz um quiz de história do Brasil", "quiz"],
      ["monta um checklist pra viagem", "checklist"],
      ["roteiro de um dia no centro de São Paulo", "roteiro"],
      ["Quero que você gere um mapa do centro", "roteiro"],
      ["monta um cronograma de estudos pra semana", "cronograma"],
      ["qual a capital da França?", null],
      ["me explica fotossíntese", null],
    ];
    for (const [pedido, tipo] of casos) expect(tipoDeTelaPronta(pedido), pedido).toBe(tipo);
  });

  it("números do financiamento e da conta saem do texto, com padrão sensato", () => {
    expect(numerosDeFinanciamento("financiamento de 300 mil a 10% ao ano em 30 anos")).toEqual({ valor: 300000, taxaAno: 10, meses: 360 });
    expect(numerosDeFinanciamento("empréstimo de R$ 30.000 em 36 vezes a 1,5% ao mês")).toMatchObject({ valor: 30000, meses: 36 });
    expect(numerosDeFinanciamento("empréstimo de R$ 30.000 em 36 vezes a 1,5% ao mês").taxaAno).toBeCloseTo(19.6, 1);
    expect(numerosDeFinanciamento("faz uma calculadora de financiamento")).toEqual({ valor: 100000, taxaAno: 12, meses: 48 });
    expect(numerosDaConta("divide a conta de 240 entre 4")).toEqual({ total: 240, pessoas: 4, servico: 10 });
    expect(numerosDaConta("rachar 380 reais por 5 pessoas sem 0% de serviço").pessoas).toBe(5);
  });
});

describe("telas prontas: os programas passam no validador do renderer (24/10)", () => {
  it("instantâneas", () => {
    expect(valida(programaFinanciamento({ valor: 300000, taxaAno: 10, meses: 360 }))).toBe("ok");
    expect(valida(programaConta({ total: 240, pessoas: 4, servico: 10 }))).toBe("ok");
  });

  const exemplos: Record<TipoComDados, unknown> = {
    painel: { titulo: "Gastos de outubro", moeda: true, exemplo: true, categorias: [{ nome: "Moradia", valor: 1500 }, { nome: "Mercado", valor: 820 }, { nome: "Transporte", valor: 310 }], nota: "Mercado subiu 12% sobre setembro." },
    comparacao: { titulo: "iPhone 17 × Pixel 11", itens: ["iPhone 17", "Pixel 11"], criterios: [{ nome: "Preço", valores: ["R$ 7.999", "R$ 6.499"] }, { nome: "Bateria", valores: ["dia inteiro", "dia e meio"] }], destaques: ["ecossistema", "câmera"], veredito: "Para foto, o Pixel; para quem tem Mac, o iPhone." },
    flashcards: { tema: "Enzimas", cartoes: [{ frente: "O que é Km?", verso: "A [S] em que v = Vmáx/2." }, { frente: "Inibição competitiva", verso: "Km sobe, Vmáx igual.", dica: "disputa o sítio ativo" }, { frente: "Cofator", verso: "Íon inorgânico." }] },
    quiz: { tema: "História do Brasil", perguntas: [{ pergunta: "Em que ano foi a Independência?", opcoes: ["1500", "1822", "1889"], certa: 1, explicacao: "7 de setembro de 1822." }, { pergunta: "Quem proclamou a República?", opcoes: ["Deodoro", "Getúlio"], certa: 0, explicacao: "Deodoro da Fonseca, 1889." }, { pergunta: "Capital antes de Brasília?", opcoes: ["Salvador", "Rio de Janeiro"], certa: 1 }] },
    checklist: { titulo: "Viagem para a praia", grupos: [{ nome: "Roupas", itens: ["Biquíni", "Chinelo"] }, { nome: "", itens: ["Protetor \"FPS 50\""] }] },
    roteiro: { titulo: "Um dia no centro de SP", cidade: "São Paulo", paradas: [{ hora: "9h", lugar: "Pinacoteca", descricao: "Abre cedo e é perto da Luz.", foto: "Pinacoteca São Paulo" }, { hora: "12h", lugar: "Mercado Municipal", descricao: "Sanduíche de mortadela." }], dicas: ["Vá de metrô."] },
    cronograma: { titulo: "Semana de estudos", dias: [{ dia: "Segunda", itens: [{ hora: "19h", tarefa: "Bioquímica" }] }, { dia: "Terça", itens: [{ tarefa: "Revisão" }] }], nota: "Uma hora por dia." },
  };

  for (const tipo of Object.keys(exemplos) as TipoComDados[]) {
    it(tipo, () => {
      const d = lerDados(tipo, JSON.stringify(exemplos[tipo]));
      expect(d.ok, d.ok ? "" : d.erro).toBe(true);
      if (d.ok) expect(valida(programaPronto(tipo, d.dados))).toBe("ok");
    });
  }

  it("roteiro: a busca da foto leva a cidade (sem repetir)", () => {
    const d = lerDados("roteiro", JSON.stringify(exemplos.roteiro));
    const p = d.ok ? programaPronto("roteiro", d.dados) : "";
    expect(p).toContain('SearchImage("Mercado Municipal São Paulo"');
    expect(p).toContain('SearchImage("Pinacoteca São Paulo"');
  });

  it("lerDados aceita cerca de Markdown e recusa o que não bate com o esquema", () => {
    expect(lerDados("flashcards", "```json\n" + JSON.stringify(exemplos.flashcards) + "\n```").ok).toBe(true);
    const r = lerDados("quiz", JSON.stringify({ tema: "x", perguntas: [] }));
    expect(r.ok).toBe(false);
    expect(lerDados("painel", "não sei").ok).toBe(false);
    expect(sistemaDosDados("roteiro")).toMatch(/JSON/);
  });
});
