import { z } from "zod";
import { semAcento } from "./texto";

/**
 * Telas prontas (24/10). O gerador livre (o modelo escreve o programa OpenUI inteiro, ~10 mil
 * tokens de prompt) levava 30–60 s e errava argumentos; telas grandes saíam cortadas. Para os
 * pedidos comuns, a tela agora é um MODELO testado e o modelo de linguagem só devolve os DADOS em
 * JSON curto (validados aqui pelo zod) — ou nem isso: financiamento e dividir conta saem na hora,
 * com os números tirados do próprio pedido.
 *
 * Sem mapa (decisão do Zak, 24/10): roteiro é linha do tempo com fotos.
 * Tudo aqui é puro (testável); quem chama o modelo é o `telaInteligente.gerarTela`.
 */

export type TipoPronto =
  | "financiamento" | "dividir-conta"
  | "painel" | "comparacao" | "flashcards" | "quiz" | "checklist" | "roteiro" | "cronograma";

function norm(t: string): string {
  return semAcento(t).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Qual tela pronta serve para o pedido (palavras-chave, sem modelo). null = gerador livre. Pura. */
export function tipoDeTelaPronta(pedido: string): TipoPronto | null {
  const t = norm(pedido);
  if (/\bdivid\w* (a |essa |esta )?conta\b|\brachar\b|\bgorjeta\b|taxa de servico/.test(t)) return "dividir-conta";
  if (/\bfinanci\w*|\bemprestim\w*|\bparcel\w*|\bprestac\w*|\bjuros\b|\bconsorcio\b|tabela price|\bsac\b/.test(t) && !/\bcompar/.test(t)) return "financiamento";
  if (/\bquiz\b|\bquestionario\b|\bsimulado\b|\bme testa\b|\bperguntas? (de|sobre)\b/.test(t)) return "quiz";
  if (/\bflash ?cards?\b|cartoes? (de estudo|para estudar)/.test(t)) return "flashcards";
  if (/\bcompar\w*|\bversus\b|\bvs\.?\b|qual (e )?(o |a )?melhor\b/.test(t)) return "comparacao";
  if (/\bcheck ?list\b|\bto-?do\b|lista de (tarefas|compras|coisas|afazeres)|o que (levar|comprar)\b/.test(t)) return "checklist";
  if (/\bcronograma\b|plano de estudos?|\brotina (da|de|semanal)\b|agenda da semana|treino da semana|\bsemana de estudos?\b/.test(t)) return "cronograma";
  if (/\broteiro\b|\bitinerario\b|\bviagem\b|\bpasseio\b|\bmapa\b|planej\w* (o |um |meu |minha )?(dia|sabado|domingo|fim de semana|feriado|viagem|passeio)/.test(t)) return "roteiro";
  if (/\bpainel\b|\bdashboard\b|\bgastos?\b|\bdespesas?\b|\borcamento\b|\bgrafico\b|\bindicadores\b|\bmetricas\b/.test(t)) return "painel";
  return null;
}

/** Os tipos que saem sem modelo (números do próprio texto). */
export function semModelo(tipo: TipoPronto): boolean {
  return tipo === "financiamento" || tipo === "dividir-conta";
}

// ── números do texto ────────────────────────────────────────────────────────────────────

/** "30 mil", "R$ 250.000", "1,2 milhão" → número. Pura. */
function valorEmReais(t: string): number | null {
  const m = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(mil|milh(?:ao|oes)|k)?\b/.exec(t);
  if (!m) return null;
  let n = Number(m[1].replace(/\./g, "").replace(",", "."));
  if (m[2] === "mil" || m[2] === "k") n *= 1000;
  else if (m[2]?.startsWith("milh")) n *= 1_000_000;
  return Number.isFinite(n) ? n : null;
}

/** Os números do pedido de financiamento, com padrão sensato no que faltar. Pura. */
export function numerosDeFinanciamento(texto: string): { valor: number; taxaAno: number; meses: number } {
  const t = norm(texto);
  let valor: number | null = null;
  for (const m of t.matchAll(/(?:r\$\s*)?\d[\d.,]*\s*(?:mil|milh(?:ao|oes)|k)?/g)) {
    const v = valorEmReais(m[0]);
    if (v !== null && v >= 1000) { valor = v; break; }
  }
  let taxaAno: number | null = null;
  const am = /(\d+(?:[.,]\d+)?)\s*%\s*(?:a\.?\s?m\b|ao mes|por mes|mensal)/.exec(t);
  const aa = /(\d+(?:[.,]\d+)?)\s*%\s*(?:a\.?\s?a\b|ao ano|por ano|anual)?/.exec(t);
  if (am) taxaAno = (Math.pow(1 + Number(am[1].replace(",", ".")) / 100, 12) - 1) * 100;
  else if (aa) taxaAno = Number(aa[1].replace(",", "."));
  let meses: number | null = null;
  const anos = /(\d+)\s*anos?\b/.exec(t), mes = /(\d+)\s*(?:meses|mes|vezes|x|parcelas)\b/.exec(t);
  if (mes) meses = Number(mes[1]);
  else if (anos) meses = Number(anos[1]) * 12;
  const vv = valor ?? 100_000;
  return {
    valor: vv,
    taxaAno: taxaAno !== null && taxaAno > 0 && taxaAno < 200 ? Math.round(taxaAno * 10) / 10 : 12,
    meses: meses !== null && meses >= 1 && meses <= 480 ? meses : vv >= 150_000 ? 360 : 48,
  };
}

/** Total e pessoas de "dividir a conta de 240 entre 4". Pura. */
export function numerosDaConta(texto: string): { total: number; pessoas: number; servico: number } {
  const t = norm(texto);
  const pessoas = /(?:entre|por|para)\s+(\d{1,2})\b|(\d{1,2})\s*pessoas/.exec(t);
  const n = pessoas ? Number(pessoas[1] ?? pessoas[2]) : 4;
  let total: number | null = null;
  for (const m of t.matchAll(/(?:r\$\s*)?\d[\d.,]*\s*(?:mil|k)?/g)) {
    const v = valorEmReais(m[0]);
    if (v !== null && v !== n && v >= 10) { total = v; break; }
  }
  const sv = /(\d{1,2})\s*%/.exec(t);
  return { total: total ?? 240, pessoas: n >= 1 && n <= 50 ? n : 4, servico: sv ? Math.min(30, Number(sv[1])) : 10 };
}

// ── esquemas dos dados que o modelo devolve ─────────────────────────────────────────────

const texto = (max: number) => z.string().trim().min(1).max(max);
const titulo = texto(80);

const esquemas = {
  painel: z.object({
    titulo, subtitulo: z.string().max(140).optional(),
    moeda: z.boolean().default(true),
    exemplo: z.boolean().default(false),
    categorias: z.array(z.object({ nome: texto(40), valor: z.number().finite().nonnegative() })).min(2).max(12),
    nota: z.string().max(240).optional(),
  }),
  comparacao: z.object({
    titulo,
    itens: z.array(texto(40)).min(2).max(4),
    criterios: z.array(z.object({ nome: texto(40), valores: z.array(z.string().max(60)) })).min(2).max(10),
    destaques: z.array(z.string().max(30)).optional(),
    veredito: texto(300),
  }),
  flashcards: z.object({
    tema: titulo,
    cartoes: z.array(z.object({ frente: texto(200), verso: texto(400), dica: z.string().max(120).optional() })).min(3).max(12),
  }),
  quiz: z.object({
    tema: titulo,
    perguntas: z.array(z.object({
      pergunta: texto(220),
      opcoes: z.array(texto(120)).min(2).max(5),
      certa: z.number().int().min(0),
      explicacao: z.string().max(300).default(""),
    })).min(3).max(10),
  }),
  checklist: z.object({
    titulo,
    grupos: z.array(z.object({ nome: z.string().max(40).default(""), itens: z.array(texto(120)).min(1).max(15) })).min(1).max(6),
  }),
  roteiro: z.object({
    titulo, resumo: z.string().max(200).optional(), cidade: z.string().max(40).optional(),
    paradas: z.array(z.object({ hora: z.string().max(12).default(""), lugar: texto(60), descricao: texto(240), foto: z.string().max(60).optional() })).min(2).max(8),
    dicas: z.array(texto(160)).max(5).default([]),
  }),
  cronograma: z.object({
    titulo,
    dias: z.array(z.object({ dia: texto(30), itens: z.array(z.object({ hora: z.string().max(12).default(""), tarefa: texto(120) })).min(1).max(10) })).min(1).max(7),
    nota: z.string().max(200).optional(),
  }),
};

export type TipoComDados = keyof typeof esquemas;
export type Dados<T extends TipoComDados> = z.infer<(typeof esquemas)[T]>;

/** O formato pedido ao modelo (curto, em texto, igual para Gemini e Hermes). */
const FORMATOS: Record<TipoComDados, string> = {
  painel: `{"titulo": string, "subtitulo"?: string, "moeda": boolean (valores em reais?), "exemplo": boolean (true se os números forem ilustrativos), "categorias": [{"nome": string, "valor": number}] (2 a 12), "nota"?: string}`,
  comparacao: `{"titulo": string, "itens": [string] (2 a 4 nomes), "criterios": [{"nome": string, "valores": [string] (um por item, na mesma ordem)}] (2 a 10), "destaques"?: [string] (uma etiqueta curta por item, ex.: "mais barato"), "veredito": string}`,
  flashcards: `{"tema": string, "cartoes": [{"frente": string (pergunta ou termo), "verso": string (resposta curta), "dica"?: string}] (5 a 10)}`,
  quiz: `{"tema": string, "perguntas": [{"pergunta": string, "opcoes": [string] (3 ou 4), "certa": number (índice da certa, começando em 0), "explicacao": string (uma frase)}] (5 a 8)}`,
  checklist: `{"titulo": string, "grupos": [{"nome": string (pode ser ""), "itens": [string]}] (1 a 6 grupos)}`,
  roteiro: `{"titulo": string, "resumo"?: string, "cidade": string (a cidade do roteiro), "paradas": [{"hora": string (ex.: "9h"), "lugar": string, "descricao": string (1 frase), "foto": string (nome do lugar + cidade, ex.: "Pinacoteca São Paulo")}] (3 a 7), "dicas": [string] (até 3)}`,
  cronograma: `{"titulo": string, "dias": [{"dia": string (ex.: "Segunda"), "itens": [{"hora": string, "tarefa": string}]}] (1 a 7), "nota"?: string}`,
};

/** O prompt de sistema do pedido de dados: curto (o gerador livre usa ~10 mil tokens). Pura. */
export function sistemaDosDados(tipo: TipoComDados): string {
  return [
    "Você preenche os dados de uma tela interativa da Ely, uma assistente brasileira.",
    "Responda SÓ com um objeto JSON válido, sem Markdown, sem texto antes ou depois, neste formato:",
    FORMATOS[tipo],
    "Regras: tudo em português do Brasil; use o que está na pergunta e na resposta em texto; não invente números de verdade — se faltarem dados reais, use valores plausíveis e marque como exemplo quando houver esse campo; textos curtos (cabem num celular).",
  ].join("\n");
}

/** O pedido do turno (pergunta + resposta em texto, se houver). Pura. */
export function pedidoDosDados(pergunta: string, resposta: string): string {
  return [`Pedido: ${pergunta.slice(0, 1500)}`, ...(resposta.trim() ? ["", "Resposta em texto da Ely (use como fonte):", resposta.slice(0, 5000)] : [])].join("\n");
}

/** Tira o JSON da resposta do modelo (com ou sem cerca de Markdown) e valida. Pura. */
export function lerDados<T extends TipoComDados>(tipo: T, bruto: string): { ok: true; dados: Dados<T> } | { ok: false; erro: string } {
  const sem = bruto.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const i = sem.indexOf("{"), j = sem.lastIndexOf("}");
  if (i < 0 || j <= i) return { ok: false, erro: "a resposta não tem um objeto JSON" };
  let obj: unknown;
  try { obj = JSON.parse(sem.slice(i, j + 1)); } catch (e) { return { ok: false, erro: `JSON inválido: ${e instanceof Error ? e.message : e}` }; }
  const r = esquemas[tipo].safeParse(obj);
  if (!r.success) return { ok: false, erro: r.error.issues.slice(0, 4).map((x) => `${x.path.join(".") || "(raiz)"}: ${x.message}`).join("; ") };
  return { ok: true, dados: r.data as Dados<T> };
}

// ── os programas ────────────────────────────────────────────────────────────────────────

/** Texto como string da linguagem (aspas e barras escapadas). */
const s = (v: string) => JSON.stringify(v);
const num = (n: number) => String(Math.round(n * 100) / 100);
const reais = (expr: string) => `@Format(${expr}, "currency", 2, "BRL")`;

// 26/10 (pedido do Zak: telas "muito mais aprimoradas e completas"): os modelos usam as peças da
// Ely (Hero, StatRow/Stat, Ring, Progress, Timeline, ImageCard, Callout, ScoreBar, Versus, Avatar,
// WeekGrid, QuizCard). Os dados e os esquemas são os mesmos — só o desenho mudou.

export function programaFinanciamento(n: { valor: number; taxaAno: number; meses: number }): string {
  const maxValor = Math.max(n.valor * 3, 50_000), passo = n.valor >= 100_000 ? 5000 : n.valor >= 20_000 ? 1000 : 100;
  const maxMeses = Math.max(n.meses, 420);
  return `root = Col([hero, resumo, partes, grafico, controles, prazos, economia])
$valor = ${num(n.valor)}
$taxa = ${num(n.taxaAno)}
$prazo = ${num(n.meses)}
mensal = (@Pow(1 + $taxa / 100, 1 / 12) - 1) * 100
parcela = @Payment($valor, mensal, $prazo)
total = parcela * $prazo
juros = total - $valor
menos = @Clamp($prazo - 60, 12, 600)
mais = @Clamp($prazo + 60, 12, 600)
hero = Hero("Financiamento", "Parcelas iguais (tabela Price) · " + @Format(mensal, "number", 3) + "% ao mês", "landmark")
resumo = StatRow([Stat("Parcela", ${reais("parcela")}, "calendar"), Stat("Total pago", ${reais("total")}, "wallet"), Stat("Só de juros", ${reais("juros")}, "percent", null, null, "warning")])
partes = Card([Row([Ring(@Round(@Percent(juros, total)), 100, "do total é juros", null, "warning"), Col([Caption("Do que você paga"), Text("Valor emprestado: " + ${reais("$valor")}, "sm"), Text("Juros: " + ${reais("juros")}, "sm"), Text("Prazo: " + $prazo + " meses (" + @Round($prazo / 12, 1) + " anos)", "sm", "muted")], 1)], 4, "center", null, true)], "soft", 3)
grafico = Card([Caption("Quanto ainda falta pagar, ano a ano"), Chart("area", @Amortizacao($valor, mensal, $prazo), "ano", ["saldo"], "currency", "BRL")], "soft", 3)
controles = Col([Slider($valor, ${passo}, ${num(maxValor)}, ${passo}, "Valor financiado", "R$"), Slider($taxa, 1, 40, 0.1, "Juros ao ano", "%"), Slider($prazo, 6, ${maxMeses}, 6, "Prazo", "meses")], 2)
prazos = Table(["Prazo", "Parcela", "Juros no total"], [[menos + " meses", ${reais("@Payment($valor, mensal, menos)")}, ${reais("@Payment($valor, mensal, menos) * menos - $valor")}], [$prazo + " meses (atual)", ${reais("parcela")}, ${reais("juros")}], [mais + " meses", ${reais("@Payment($valor, mensal, mais)")}, ${reais("@Payment($valor, mensal, mais) * mais - $valor")}]])
economia = Callout("Encurtar o prazo para " + menos + " meses economiza " + ${reais("juros - (@Payment($valor, mensal, menos) * menos - $valor)")} + " de juros, com parcela de " + ${reais("@Payment($valor, mensal, menos)")} + ".", "dica", null, "Vale a conta")`;
}

export function programaConta(n: { total: number; pessoas: number; servico: number }): string {
  return `root = Col([hero, resumo, gente, Grid([Input($total, "Total da conta (R$)", "number"), Input($pessoas, "Pessoas", "number")], 2, 140, 3), Slider($servico, 0, 20, 1, "Serviço", "%", [{value: 0, label: "Sem"}, {value: 10, label: "10%"}, {value: 20, label: "20%"}])])
$total = ${num(n.total)}
$pessoas = ${num(n.pessoas)}
$servico = ${num(n.servico)}
comServico = $total * (1 + $servico / 100)
cada = comServico / ($pessoas > 0 ? $pessoas : 1)
hero = Hero("Dividir a conta", "Com " + $servico + "% de serviço, igual para todo mundo", "receipt")
resumo = StatRow([Stat("Cada um", ${reais("cada")}, "users"), Stat("Total com serviço", ${reais("comServico")}, "receipt"), Stat("Só o serviço", ${reais("comServico - $total")}, "percent")])
gente = AvatarRow(@Each(@Range(1, @Clamp($pessoas, 1, 12)), "i", Avatar("Pessoa " + i, ${reais("cada")})))`;
}

function programaPainel(d: Dados<"painel">): string {
  const fmt = d.moeda ? (e: string) => reais(e) : (e: string) => `@Format(${e}, "number", 0)`;
  const dados = `[${d.categorias.map((c) => `{nome: ${s(c.nome)}, valor: ${num(c.valor)}}`).join(", ")}]`;
  const ord = [...d.categorias].sort((a, b) => b.valor - a.valor);
  const total = d.categorias.reduce((a, c) => a + c.valor, 0) || 1;
  const maior = ord[0];
  const parte = Math.round((maior.valor / total) * 100);
  const top3 = Math.round((ord.slice(0, 3).reduce((a, c) => a + c.valor, 0) / total) * 100);
  const sub = d.exemplo ? "Exemplo com números ilustrativos" : d.subtitulo || `${d.categorias.length} categorias`;
  const insights = [
    `Callout(${s(`${maior.nome} é a maior parte: ${parte}% do total.`)}, "insight", null, "Onde mais pesa")`,
    ...(d.categorias.length > 3 ? [`Callout(${s(`As 3 maiores categorias somam ${top3}% do total.`)}, "dica")`] : []),
    ...(d.nota ? [`Callout(${s(d.nota)}, "insight")`] : []),
  ];
  return `root = Col([hero, resumo, Card([Row([Caption("Distribuição"), Spacer(), SegmentedControl($tipo, [{value: "bar", label: "Barras"}, {value: "donut", label: "Rosca"}])], 2, "center"), grafico], "soft", 3), insights, Card([Caption("Detalhes"), tabela], "soft", 3)])
$tipo = "bar"
dados = ${dados}
hero = Hero(${s(d.titulo)}, ${s(sub)}, "chart-pie")
resumo = StatRow([Stat("Total", ${fmt("@Sum(dados.valor)")}, "wallet"), Stat("Maior", ${s(maior.nome)}, "trending-up", null, null, "warning"), Stat("Média", ${fmt("@Avg(dados.valor)")}, "equal")])
grafico = Chart($tipo, @Sort(dados, "valor", "desc"), "nome", ["valor"], ${d.moeda ? `"currency", "BRL"` : `"number"`})
insights = Col([${insights.join(", ")}], 2)
tabela = Table(["Categoria", "Valor", "Parte"], @Each(@Sort(dados, "valor", "desc"), "c", [c.nome, ${fmt("c.valor")}, @Round(@Percent(c.valor, @Sum(dados.valor))) + "%"]))`;
}

function programaComparacao(d: Dados<"comparacao">): string {
  const linhas = d.criterios.map((c) => `[${[s(c.nome), ...d.itens.map((_, i) => s(c.valores[i] ?? "—"))].join(", ")}]`);
  // O vencedor: o item que o veredito cita primeiro (ele diz qual escolher); sem citação, nenhum.
  const v = norm(d.veredito);
  const citado = d.itens.map((it, i) => ({ i, pos: v.indexOf(norm(it)) })).filter((x) => x.pos >= 0).sort((a, b) => a.pos - b.pos)[0];
  const cartoes = d.itens.map((it, i) => `ImageCard(${s(it)}, ${s(it)}${d.destaques?.[i] ? `, null, ${s(d.destaques[i])}` : ""})`);
  return `root = Col([hero, Versus([${cartoes.join(", ")}]${citado ? `, ${citado.i}` : ""}), Card([Caption("Lado a lado"), tabela], "soft", 3), veredito])
hero = Hero(${s(d.titulo)}, ${s(`${d.itens.length} opções · ${d.criterios.length} critérios`)}, "target")
tabela = Table([${["\"\"", ...d.itens.map(s)].join(", ")}], [${linhas.join(", ")}])
veredito = Callout(${s(d.veredito)}, "sucesso", "trophy", "Veredito")`;
}

function programaFlashcards(d: Dados<"flashcards">): string {
  const cartoes = d.cartoes.map((c, i) => `c${i} = Flashcard(${s(c.frente)}, ${s(c.verso)}${c.dica ? `, ${s(c.dica)}` : ""})`);
  return `root = Col([hero, Carousel([${d.cartoes.map((_, i) => `c${i}`).join(", ")}], 270), Callout("Toque no cartão para ver a resposta; arraste para o próximo. Errou? Volte nele no fim.", "dica")])
hero = Hero(${s(d.tema)}, ${s(`${d.cartoes.length} cartões para revisar`)}, "brain")
${cartoes.join("\n")}`;
}

function programaQuiz(d: Dados<"quiz">): string {
  const ps = d.perguntas.map((p) => ({ ...p, certa: Math.min(p.certa, p.opcoes.length - 1) }));
  const n = ps.length;
  const blocos = ps.map((p, i) => `q${i} = QuizCard($r${i}, ${s(`${i + 1}. ${p.pergunta}`)}, [${p.opcoes.map(s).join(", ")}], ${p.certa}${p.explicacao ? `, ${s(p.explicacao)}` : ""})
$r${i} = ""`);
  const pontos = ps.map((p, i) => `($r${i} == ${s(p.opcoes[p.certa])} ? 1 : 0)`).join(" + ");
  const feitas = ps.map((_, i) => `($r${i} != "" ? 1 : 0)`).join(" + ");
  return `root = Col([hero, Progress(feitas, ${n}, "Respondidas"), ${ps.map((_, i) => `q${i}`).join(", ")}, final, Celebration(pontos == ${n})])
pontos = ${pontos}
feitas = ${feitas}
hero = Hero(${s(d.tema)}, ${s(`${n} perguntas · toque numa opção para responder`)}, "graduation-cap")
final = Card([Row([Ring(pontos, ${n}, "acertos", pontos + "/" + ${n}, pontos == ${n} ? "success" : null), Col([Title(feitas < ${n} ? "Continue!" : (pontos == ${n} ? "Gabaritou!" : (pontos >= ${Math.ceil(n * 0.7)} ? "Mandou bem!" : "Bora revisar?")), "md"), Text(feitas < ${n} ? "Faltam " + (${n} - feitas) + " perguntas." : "Você acertou " + pontos + " de " + ${n} + ".", "sm", "muted")], 1)], 4, "center")], "soft", 3)
${blocos.join("\n")}`;
}

function programaChecklist(d: Dados<"checklist">): string {
  let k = 0;
  const vars: string[] = [];
  const grupos = d.grupos.map((g, gi) => {
    const ini = k;
    const itens = g.itens.map((it) => { const v = `$c${k++}`; vars.push(`${v} = false`); return `Checkbox(${v}, ${s(it)}, true)`; });
    const feitosG = Array.from({ length: k - ini }, (_, j) => `($c${ini + j} ? 1 : 0)`).join(" + ");
    return `g${gi} = Card([${g.nome ? `Title(${s(g.nome)}, "sm"), ` : ""}Progress(${feitosG}, ${k - ini}), ${itens.join(", ")}], null, 3, 2)`;
  });
  const total = k, marcados = Array.from({ length: k }, (_, i) => `($c${i} ? 1 : 0)`).join(" + ");
  return `root = Col([topo, ${d.grupos.map((_, i) => `g${i}`).join(", ")}, Celebration(feitos == ${total})])
feitos = ${marcados}
topo = Row([Col([Hero(${s(d.titulo)}, ${s(`${total} itens em ${d.grupos.length} grupo${d.grupos.length > 1 ? "s" : ""}`)}, "list-checks")], 1), Ring(feitos, ${total}, "feito", feitos + "/" + ${total}, feitos == ${total} ? "success" : null)], 3, "center")
${grupos.join("\n")}
${vars.join("\n")}`;
}

function programaRoteiro(d: Dados<"roteiro">): string {
  // 24/10: "Mercado Municipal" sozinho achou a foto de um político; a cidade desfaz a ambiguidade.
  const busca = (p: { lugar: string; foto?: string }) => {
    const q = p.foto || p.lugar;
    return d.cidade && !norm(q).includes(norm(d.cidade)) ? `${q} ${d.cidade}` : q;
  };
  const p0 = d.paradas[0];
  const itens = d.paradas.map((p, i) => `TimelineItem(${s(p.lugar)}, ${s(p.descricao)}, ${s(p.hora || "")}, null${i === 0 ? "" : `, ${s(busca(p))}`})`);
  return `root = Col([capa, hero, linha${d.dicas.length ? ", dicas" : ""}])
capa = ImageCard(${s(busca(p0))}, ${s(p0.lugar)}, ${s(p0.descricao)}, ${s(p0.hora ? `Começa às ${p0.hora}` : "Primeira parada")})
hero = Hero(${s(d.titulo)}, ${s(d.resumo || `${d.paradas.length} paradas${d.cidade ? ` em ${d.cidade}` : ""}`)}, "map-pin")
linha = Timeline([${itens.join(", ")}])${d.dicas.length ? `\ndicas = Col([${d.dicas.map((t) => `Callout(${s(t)}, "dica")`).join(", ")}], 2)` : ""}`;
}

function programaCronograma(d: Dados<"cronograma">): string {
  const dias = `[${d.dias.map((dia) => `{dia: ${s(dia.dia)}, itens: [${dia.itens.map((it) => `{hora: ${s(it.hora || "")}, tarefa: ${s(it.tarefa)}}`).join(", ")}]}`).join(", ")}]`;
  const tarefas = d.dias.reduce((a, x) => a + x.itens.length, 0);
  return `root = Col([hero, StatRow([Stat("Dias", ${s(String(d.dias.length))}, "calendar-days"), Stat("Tarefas", ${s(String(tarefas))}, "list-checks")]), WeekGrid(${dias})${d.nota ? `, Callout(${s(d.nota)}, "dica")` : ""}])
hero = Hero(${s(d.titulo)}, ${s(`${tarefas} tarefas em ${d.dias.length} dia${d.dias.length > 1 ? "s" : ""}`)}, "calendar-days")`;
}

/** Os dados validados viram o programa. Pura. */
export function programaPronto<T extends TipoComDados>(tipo: T, dados: Dados<T>): string {
  switch (tipo) {
    case "painel": return programaPainel(dados as Dados<"painel">);
    case "comparacao": return programaComparacao(dados as Dados<"comparacao">);
    case "flashcards": return programaFlashcards(dados as Dados<"flashcards">);
    case "quiz": return programaQuiz(dados as Dados<"quiz">);
    case "checklist": return programaChecklist(dados as Dados<"checklist">);
    case "roteiro": return programaRoteiro(dados as Dados<"roteiro">);
    default: return programaCronograma(dados as Dados<"cronograma">);
  }
}
