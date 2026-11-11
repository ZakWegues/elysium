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
      ["roteiro de um dia no centro de Recife", "roteiro"],
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
    roteiro: { titulo: "Um dia no centro de Recife", cidade: "Recife", paradas: [{ hora: "9h", lugar: "Pinacoteca", descricao: "Abre cedo e é perto da Luz.", foto: "Pinacoteca Recife" }, { hora: "12h", lugar: "Mercado Municipal", descricao: "Sanduíche de mortadela." }], dicas: ["Vá de metrô."] },
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
    expect(p).toContain('"Mercado Municipal Recife")');
    expect(p).toContain('ImageCard("Pinacoteca Recife"');
  });

  it("lerDados aceita cerca de Markdown e recusa o que não bate com o esquema", () => {
    expect(lerDados("flashcards", "```json\n" + JSON.stringify(exemplos.flashcards) + "\n```").ok).toBe(true);
    const r = lerDados("quiz", JSON.stringify({ tema: "x", perguntas: [] }));
    expect(r.ok).toBe(false);
    expect(lerDados("painel", "não sei").ok).toBe(false);
    expect(sistemaDosDados("roteiro")).toMatch(/JSON/);
  });
});

describe("variação dos modelos prontos (31/10)", () => {
  it("a cor do topo é estável por assunto e varia entre assuntos", async () => {
    const { tomDe } = await import("../src/services/telasProntas");
    expect(tomDe("Gastos do mês")).toBe(tomDe("gastos do mes"));
    const cores = new Set(["Gastos do mês", "Viagem a Paris", "Revisão de biologia", "Quiz de história", "Mudança", "Cronograma da prova"].map(tomDe));
    expect([...cores].every(c => /^chart[1-6]$/.test(c))).toBe(true);
    expect(cores.size).toBeGreaterThan(2);
  });
});

describe("telas prontas ricas e com variações (11/11)", () => {
  const ok = (tipo: TipoComDados, dados: unknown) => {
    const d = lerDados(tipo, JSON.stringify(dados));
    expect(d.ok, d.ok ? "" : d.erro).toBe(true);
    const p = d.ok ? programaPronto(tipo, d.dados) : "";
    expect(valida(p)).toBe("ok");
    return p;
  };

  it("roteiro de vários dias vira abas por dia, com custo total", () => {
    const p = ok("roteiro", {
      titulo: "Serra Gaúcha em 3 dias", cidade: "Gramado",
      paradas: [
        { dia: "Dia 1 · Gramado", hora: "9h", lugar: "Lago Negro", descricao: "Pedalinho e trilha curta.", custo: 0, duracao: "1h30" },
        { dia: "Dia 1 · Gramado", hora: "14h", lugar: "Rua Coberta", descricao: "Café colonial.", custo: 90, transporte: "a pé, 10 min" },
        { dia: "Dia 2 · Canela", hora: "9h", lugar: "Cascata do Caracol", descricao: "Mirante e bondinho.", custo: 60 },
        { dia: "Dia 3 · Bento", hora: "10h", lugar: "Vale dos Vinhedos", descricao: "Degustação.", custo: 120 },
      ],
      dicas: ["Leve casaco: à noite esfria."],
    });
    expect(p).toContain("Tabs(");
    expect(p).toContain("≈ R$ 270");
  });

  it("comparação com notas e prós/contras usa abas; sem eles, a tabela simples", () => {
    const rica = ok("comparacao", {
      titulo: "Notebooks até 5 mil", itens: ["Acer", "Lenovo"],
      criterios: [{ nome: "Tela", valores: ["IPS 15,6\"", "OLED 14\""], notas: [6, 9] }, { nome: "Bateria", valores: ["7 h", "10 h"], notas: [6, 8] }],
      pros: [["Preço"], ["Tela", "Bateria"]], contras: [["Pesado"], ["Mais caro"]], veredito: "Lenovo para quem usa fora de casa.",
    });
    expect(rica).toContain("Tabs(");
    expect(rica).toContain("ScoreBar(");
  });

  it("painel com limite e série mostra orçamento e evolução", () => {
    const p = ok("painel", {
      titulo: "Gastos de outubro", moeda: true,
      categorias: [{ nome: "Mercado", valor: 950, limite: 800 }, { nome: "Lazer", valor: 300, limite: 400 }, { nome: "Contas", valor: 600 }],
      serie: [{ rotulo: "Ago", valor: 1700 }, { rotulo: "Set", valor: 1780 }, { rotulo: "Out", valor: 1850 }],
      dicas: ["Faça a lista antes do mercado."],
    });
    expect(p).toContain("Acima do orçamento");
    expect(p).toContain("Chart(\"area\"");
  });

  it("cronograma curto vira um cartão por dia", () => {
    const p = ok("cronograma", { titulo: "Fim de semana de estudo", dias: [{ dia: "Sábado", itens: [{ hora: "9h", tarefa: "Bioquímica", duracao: "2h" }] }, { dia: "Domingo", itens: [{ hora: "10h", tarefa: "Revisão" }] }] });
    expect(p).not.toContain("WeekGrid");
  });

  it("pedido longo vai ao gerador livre; o simples fica na pronta", async () => {
    const { pedidoRico } = await import("../src/services/telasProntas");
    expect(pedidoRico("planeja um roteiro de um dia no Recife", "roteiro")).toBe(false);
    expect(pedidoRico("planeja uma viagem de carro de dez dias pela Serra Gaúcha", "roteiro")).toBe(false);
    expect(pedidoRico("me monta o passo a passo para trocar o pneu", "checklist")).toBe(true);
    expect(pedidoRico("quero um painel dos meus gastos " + "com muita coisa ".repeat(10), "painel")).toBe(true);
    expect(pedidoRico("divide a conta de 300 reais " + "por favor ".repeat(20), "dividir-conta")).toBe(false);
  });
});
