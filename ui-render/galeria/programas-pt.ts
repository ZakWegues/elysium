// Programas OpenUI Lang 1.0 em português, os mesmos cinco pedidos da prova da Fase 3 (roteiro
// com mapa, calculadora de juros, flashcards, comparação em tabela, gastos em gráfico) e a
// conta dividida. Dados fictícios — nada pessoal.

export type Program = { id: string; title: string; note: string; code: string };

export const programasPt: Program[] = [
  {
    id: "pt-juros",
    title: "Calculadora de juros",
    note: "Sliders ligados a $x, @Payment e @Format em reais; o total conta até o valor novo.",
    code: `root = Card([Title("Financiamento", "md"), Text("Mexa nos valores: a parcela e o total se recalculam na hora.", "sm", "muted"), controles, resumo])
$valor = 30000
$taxa = 1.5
$meses = 36
controles = Grid([Slider($valor, 1000, 200000, 1000, "Valor", "R$"), Slider($taxa, 0.5, 5, 0.1, "Juros ao mês", "%"), Slider($meses, 6, 120, 6, "Prazo", "meses")], 3, 200, 6)
parcela = @Payment($valor, $taxa, $meses)
resumo = Grid([Card([Caption("Parcela"), Title(@Format(parcela, "currency", 2, "BRL"), "xl")], "soft", 4, 1), Card([Caption("Total pago"), Title(@Format(parcela * $meses, "currency", 2, "BRL"), "xl")], "soft", 4, 1), Card([Caption("Só de juros"), Title(@Format(parcela * $meses - $valor, "currency", 2, "BRL"), "xl")], "soft", 4, 1)], 3, 160, 4)`,
  },
  {
    id: "pt-flashcards",
    title: "Flashcards de bioquímica",
    note: "Flashcards num Carousel; virar mostra a resposta.",
    code: `root = Col([Title("Bioquímica: enzimas", "md"), Text("Toque no cartão para virar.", "sm", "muted"), Carousel([c1, c2, c3, c4], 260)])
c1 = Flashcard("O que é a energia de ativação?", "A energia mínima para a reação começar. A enzima diminui essa barreira.", "Pense na 'ladeira' da reação")
c2 = Flashcard("Inibição competitiva", "O inibidor disputa o sítio ativo com o substrato. Km sobe, Vmáx não muda.")
c3 = Flashcard("O que mede o Km?", "A concentração de substrato em que a velocidade é metade da Vmáx.")
c4 = Flashcard("Cofator × coenzima", "Cofator: íon inorgânico (Mg²⁺, Zn²⁺). Coenzima: molécula orgânica, muitas vezes vitamina (NAD⁺, FAD).")`,
  },
  {
    id: "pt-roteiro",
    title: "Roteiro com mapa",
    note: "Map com rota pelas ruas (pedida ao host), filtro por categoria e pino escolhido em $parada.",
    code: `root = Col([Title("Sábado no centro de São Paulo", "md"), Text("Toque num pino para escolher por onde começar.", "sm", "muted"), mapa, Card([Row([Icon("map-pin", "sm"), Text("Começando em **" + $parada + "**", "sm")], 2)], "soft", 3)])
$parada = "Pinacoteca"
mapa = Map([m1, m2, m3, m4], true, $parada)
m1 = MapMarker("Pinacoteca", -23.5343, -46.6339, "Museus", "🏛️")
m2 = MapMarker("Mercado Municipal", -23.5418, -46.6295, "Comida", "🥪")
m3 = MapMarker("Theatro Municipal", -23.5452, -46.6386, "Passeio", "🎭")
m4 = MapMarker("Edifício Itália", -23.5453, -46.6437, "Vista", "🌇")`,
  },
  {
    id: "pt-comparacao",
    title: "Comparação em tabela",
    note: "Table com Badge nas células e um veredito.",
    code: `root = Card([Title("Notebook para estudar: qual escolher?", "md"), tabela, Card([Row([Icon("lightbulb", "sm"), Text("Para levar à faculdade todo dia, a **bateria** pesa mais que o processador.", "sm")], 2)], "soft", 3)])
tabela = Table(["", "Modelo A", "Modelo B", "Modelo C"], [["Preço", 3499, 4299, 5199], ["Bateria (h)", 12, 8, 15], ["Peso (kg)", 1.4, 1.8, 1.3], ["Tela", "14\\"", "15,6\\"", "13,3\\""], ["Para quem", Badge("leve e barato", "success"), Badge("tela grande", "info"), Badge("dura o dia todo", "purple")]])`,
  },
  {
    id: "pt-gastos",
    title: "Gastos do mês em gráfico",
    note: "SegmentedControl troca o tipo do Chart; dados fictícios em reais.",
    code: `root = Card([topo, grafico, Grid([total, maior], 2, 200, 4)])
$tipo = "bar"
topo = Row([Col([Title("Gastos do mês", "md"), Caption("Exemplo com números inventados")], 1), Spacer(), SegmentedControl($tipo, [{value: "bar", label: "Barras"}, {value: "donut", label: "Rosca"}])], 3, null, null, true)
gastos = [{categoria: "Moradia", valor: 1500}, {categoria: "Mercado", valor: 820}, {categoria: "Transporte", valor: 310}, {categoria: "Lazer", valor: 260}, {categoria: "Saúde", valor: 180}]
grafico = Chart($tipo, gastos, "categoria", ["valor"], "currency", "BRL")
total = Card([Caption("Total"), Title(@Format(@Sum(gastos.valor), "currency", 2, "BRL"), "xl")], "soft", 4, 1)
maior = Card([Caption("Maior gasto"), Title("Moradia", "xl")], "soft", 4, 1)`,
  },
  {
    id: "pt-conta",
    title: "Dividir a conta",
    note: "Input numérico e Slider de gorjeta; o valor por pessoa conta até o novo número.",
    code: `root = Card([Title("Dividir a conta", "md"), Grid([Input($pessoas, "Pessoas na mesa", "number"), Slider($gorjeta, 0, 20, 1, "Serviço", "%", [{value: 0, label: "Sem"}, {value: 10, label: "10%"}, {value: 20, label: "20%"}])], 2, 200, 6), Card([Row([Text("Total com serviço"), Spacer(), Title(@Format(240 * (1 + $gorjeta / 100), "currency", 2, "BRL"), "lg")]), Row([Text("Cada um", "sm", "muted"), Spacer(), Title(@Format(240 * (1 + $gorjeta / 100) / ($pessoas > 0 ? $pessoas : 1), "currency", 2, "BRL"), "lg")])], "soft", null, 2)])
$pessoas = 4
$gorjeta = 10`,
  },
];
