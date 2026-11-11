// As telas prontas do PC (src/services/telasProntas.ts, 24/10) com dados de exemplo: o mesmo
// código que monta a tela no chat, para ver cada tipo na galeria sem modelo nenhum. Dados
// fictícios — nada pessoal.
import { lerDados, programaConta, programaFinanciamento, programaPronto, type TipoComDados } from "../../src/services/telasProntas";
import type { Program } from "./programas-pt";

const exemplos: Record<TipoComDados, { titulo: string; dados: unknown }> = {
  painel: { titulo: "Painel de gastos", dados: { titulo: "Gastos de outubro", moeda: true, exemplo: true, categorias: [{ nome: "Moradia", valor: 1500, limite: 1500 }, { nome: "Mercado", valor: 920, limite: 800 }, { nome: "Transporte", valor: 310, limite: 400 }, { nome: "Lazer", valor: 240, limite: 300 }], serie: [{ rotulo: "Jul", valor: 2700 }, { rotulo: "Ago", valor: 2850 }, { rotulo: "Set", valor: 2790 }, { rotulo: "Out", valor: 2970 }], nota: "Mercado subiu 12% sobre setembro.", dicas: ["Faça a lista antes de ir ao mercado."] } },
  comparacao: { titulo: "Comparação", dados: { titulo: "Notebook A × Notebook B", itens: ["Notebook A", "Notebook B"], criterios: [{ nome: "Preço", valores: ["R$ 4.299", "R$ 5.199"], notas: [8, 6] }, { nome: "Bateria", valores: ["8 h", "12 h"], notas: [6, 9] }, { nome: "Peso", valores: ["1,8 kg", "1,3 kg"], notas: [5, 9] }, { nome: "Tela", valores: ["IPS 15,6\"", "OLED 14\""], notas: [6, 9] }], destaques: ["preço", "portabilidade"], pros: [["Mais barato", "Tela maior"], ["Leve", "Bateria longa", "Tela OLED"]], contras: [["Pesado"], ["R$ 900 a mais"]], veredito: "Para levar todo dia, o Notebook B; para gastar menos, o A." } },
  flashcards: { titulo: "Flashcards", dados: { tema: "Enzimas", cartoes: [{ frente: "O que é Km?", verso: "A concentração de substrato em que v = Vmáx/2." }, { frente: "Inibição competitiva", verso: "Km sobe, Vmáx igual.", dica: "disputa o sítio ativo" }, { frente: "Cofator", verso: "Íon inorgânico que a enzima precisa." }] } },
  quiz: { titulo: "Quiz", dados: { tema: "História do Brasil", perguntas: [{ pergunta: "Em que ano foi a Independência?", opcoes: ["1500", "1822", "1889"], certa: 1, explicacao: "7 de setembro de 1822." }, { pergunta: "Quem proclamou a República?", opcoes: ["Deodoro da Fonseca", "Getúlio Vargas"], certa: 0, explicacao: "Em 15 de novembro de 1889." }, { pergunta: "Capital antes de Brasília?", opcoes: ["Salvador", "Rio de Janeiro"], certa: 1 }] } },
  checklist: { titulo: "Checklist", dados: { titulo: "Viagem para a praia", grupos: [{ nome: "Roupas", itens: ["Roupa de banho", "Chinelo", "Boné"] }, { nome: "Cuidados", itens: ["Protetor FPS 50", "Repelente"] }] } },
  roteiro: { titulo: "Roteiro (sem mapa)", dados: { titulo: "Serra Gaúcha em 3 dias", cidade: "Gramado", resumo: "Gramado, Canela e Vale dos Vinhedos", paradas: [{ dia: "Dia 1 · Gramado", hora: "9h", lugar: "Lago Negro", descricao: "Pedalinho e trilha curta entre as hortênsias.", custo: 0, duracao: "1h30" }, { dia: "Dia 1 · Gramado", hora: "14h", lugar: "Rua Coberta", descricao: "Café colonial e lojas.", custo: 90, transporte: "a pé, 10 min" }, { dia: "Dia 2 · Canela", hora: "9h", lugar: "Cascata do Caracol", descricao: "Mirante de 131 m e bondinho.", custo: 60, transporte: "carro, 20 min" }, { dia: "Dia 3 · Bento", hora: "10h", lugar: "Vale dos Vinhedos", descricao: "Degustação em vinícola familiar.", custo: 120, duracao: "3h" }], dicas: ["Leve casaco: à noite esfria.", "Reserve o café colonial."] } },
  cronograma: { titulo: "Cronograma", dados: { titulo: "Semana de estudos", dias: [{ dia: "Segunda", itens: [{ hora: "19h", tarefa: "Bioquímica" }, { hora: "20h", tarefa: "Exercícios" }] }, { dia: "Terça", itens: [{ tarefa: "Revisão" }] }], nota: "Uma hora por dia." } },
};

export const telasProntas: Program[] = [
  { id: "pronta-financiamento", title: "Financiamento (sem modelo)", note: "Números tirados do pedido.", code: programaFinanciamento({ valor: 300000, taxaAno: 10, meses: 360 }) },
  { id: "pronta-conta", title: "Dividir a conta (sem modelo)", note: "Números tirados do pedido.", code: programaConta({ total: 380, pessoas: 5, servico: 10 }) },
  ...(Object.keys(exemplos) as TipoComDados[]).map((tipo) => {
    const d = lerDados(tipo, JSON.stringify(exemplos[tipo].dados));
    if (!d.ok) throw new Error(`exemplo de ${tipo} inválido: ${d.erro}`);
    return { id: `pronta-${tipo}`, title: exemplos[tipo].titulo, note: "O modelo só manda os dados (JSON).", code: programaPronto(tipo, d.dados) };
  }),
];
