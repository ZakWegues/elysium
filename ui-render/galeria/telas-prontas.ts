// As telas prontas do PC (src/services/telasProntas.ts, 24/10) com dados de exemplo: o mesmo
// código que monta a tela no chat, para ver cada tipo na galeria sem modelo nenhum. Dados
// fictícios — nada pessoal.
import { lerDados, programaConta, programaFinanciamento, programaPronto, type TipoComDados } from "../../src/services/telasProntas";
import type { Program } from "./programas-pt";

const exemplos: Record<TipoComDados, { titulo: string; dados: unknown }> = {
  painel: { titulo: "Painel de gastos", dados: { titulo: "Gastos de outubro", moeda: true, exemplo: true, categorias: [{ nome: "Moradia", valor: 1500 }, { nome: "Mercado", valor: 820 }, { nome: "Transporte", valor: 310 }, { nome: "Lazer", valor: 240 }], nota: "Mercado subiu 12% sobre setembro." } },
  comparacao: { titulo: "Comparação", dados: { titulo: "Notebook A × Notebook B", itens: ["Notebook A", "Notebook B"], criterios: [{ nome: "Preço", valores: ["R$ 4.299", "R$ 5.199"] }, { nome: "Bateria", valores: ["8 h", "12 h"] }, { nome: "Peso", valores: ["1,8 kg", "1,3 kg"] }], destaques: ["preço", "portabilidade"], veredito: "Para levar todo dia, o B; para gastar menos, o A." } },
  flashcards: { titulo: "Flashcards", dados: { tema: "Enzimas", cartoes: [{ frente: "O que é Km?", verso: "A concentração de substrato em que v = Vmáx/2." }, { frente: "Inibição competitiva", verso: "Km sobe, Vmáx igual.", dica: "disputa o sítio ativo" }, { frente: "Cofator", verso: "Íon inorgânico que a enzima precisa." }] } },
  quiz: { titulo: "Quiz", dados: { tema: "História do Brasil", perguntas: [{ pergunta: "Em que ano foi a Independência?", opcoes: ["1500", "1822", "1889"], certa: 1, explicacao: "7 de setembro de 1822." }, { pergunta: "Quem proclamou a República?", opcoes: ["Deodoro da Fonseca", "Getúlio Vargas"], certa: 0, explicacao: "Em 15 de novembro de 1889." }, { pergunta: "Capital antes de Brasília?", opcoes: ["Salvador", "Rio de Janeiro"], certa: 1 }] } },
  checklist: { titulo: "Checklist", dados: { titulo: "Viagem para a praia", grupos: [{ nome: "Roupas", itens: ["Roupa de banho", "Chinelo", "Boné"] }, { nome: "Cuidados", itens: ["Protetor FPS 50", "Repelente"] }] } },
  roteiro: { titulo: "Roteiro (sem mapa)", dados: { titulo: "Um dia no centro de SP", cidade: "São Paulo", paradas: [{ hora: "9h", lugar: "Pinacoteca", descricao: "Abre cedo e fica perto da Luz.", foto: "Pinacoteca" }, { hora: "12h", lugar: "Mercado Municipal", descricao: "Almoço e frutas." }, { hora: "15h", lugar: "Theatro Municipal", descricao: "Visita guiada à tarde." }], dicas: ["Vá de metrô."] } },
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
