import Store from "electron-store";
import { semAcento } from "./texto";
import { getAllPresets } from "./presetsStore";
import type { Canal } from "./estiloResposta";

/**
 * Modos da Ely (fase 20, bloco 205): "modo matemática", "modo inglês"…
 *
 * Um modo é um jeito de responder que dura até ele sair — o mesmo pedido ("me explica
 * isso") vira passo a passo no modo matemática e explicação de leigo no modo simples. É o
 * que os GPTs personalizados e os "Gems" fazem, só que ligado pela voz e sem trocar de
 * conversa.
 *
 * Onde o modo entra:
 *  - na CONVERSA, o bloco do modo vai logo depois da persona (`blocoDoModo`);
 *  - no AGENTE, uma linha só (`linhaDoAgente`) — o prompt do agente é grande e caro;
 *  - no híbrido, modo de estudo vai para a nuvem: o modelo local erra conta;
 *  - na voz, o modo inglês troca para a Thalita multilíngue (`voz`).
 *
 * Sai sozinho depois de 6 h sem uso: quem ligou o modo matemática de tarde não quer a
 * resposta do "bom dia" seguinte em passo a passo.
 *
 * Fica fora de colisão com o que já existe: "modo foco" e "modo anônimo" têm regra própria
 * antes desta no `fastRoute`, e um preset com o mesmo nome ("modo estudo") ganha do modo.
 */

export interface Modo {
  id: string;
  nome: string;
  /** Um ou dois caracteres para o chip. */
  icone: string;
  /** Uma linha: o que muda. Vai no agente e na lista. */
  resumo: string;
  /** O bloco que entra no prompt da conversa. */
  instrucao: string;
  /** Acréscimo só para a voz (sem símbolo, sem código lido em voz alta). */
  naVoz?: string;
  /** Perguntas de partida do chat enquanto o modo dura. */
  sugestoes: string[];
  /** Vai para a nuvem no híbrido. */
  nuvem: boolean;
  /** Voz própria do modo (o inglês). */
  voz?: string;
  /** Outras formas de chamar ("redação" → português). */
  apelidos?: string[];
  /** Criado por ele. */
  meu?: boolean;
}

export const EXPIRA_MS = 6 * 3_600_000;
export const MAX_INSTRUCAO_MODO = 1500;
export const MAX_MODOS_MEUS = 12;

export const CATALOGO: Modo[] = [
  {
    id: "matematica", nome: "Matemática", icone: "∑", nuvem: true,
    resumo: "resolve passo a passo e confere a resposta.",
    apelidos: ["mat", "matematica", "calculo", "exatas"],
    instrucao: "Resolva passo a passo: (1) o que foi dado e o que se pede; (2) a fórmula ou a ideia; (3) as contas, uma por linha; (4) a resposta final em negrito. Antes de responder, confira o resultado (substitua de volta ou estime a ordem de grandeza). Se ele mandar a resposta dele, diga se está certa e onde errou, sem refazer tudo do zero. No fim, ofereça em uma linha um exercício parecido para treinar.",
    naVoz: "Na voz: nada de símbolos ou tabelas. Diga as contas por extenso e fale só o caminho principal e o resultado.",
    sugestoes: ["Resolve passo a passo: 2x + 5 = 17", "Qual a derivada de x³ − 4x?", "Me explica regra de três com um exemplo", "Confere minha conta: 15% de 240 dá 32?"],
  },
  {
    id: "portugues", nome: "Português", icone: "Aa", nuvem: true,
    resumo: "corrige explicando a regra; redação no modelo do ENEM.",
    apelidos: ["portugues", "gramatica", "redacao", "lingua portuguesa"],
    instrucao: "Ao corrigir um texto, devolva a versão corrigida e depois cada correção com a regra em uma linha (ex.: \"crase: a + a, antes de palavra feminina\"). Não mude o estilo dele além do necessário. Em redação, siga o modelo do ENEM: tese clara, dois argumentos com repertório e proposta de intervenção completa (agente, ação, meio, finalidade e detalhamento), e diga qual competência cada problema afeta. Para sinônimos, dê de 3 a 5 com o matiz de cada um. Dúvida de gramática: a regra, um exemplo certo e um errado.",
    naVoz: "Na voz: diga só as correções principais e a regra de cada uma.",
    sugestoes: ["Corrige: \"fazem dois anos que eu moro aqui\"", "Quando usa crase?", "Sinônimos de \"importante\"", "Avalia minha introdução de redação"],
  },
  {
    id: "ingles", nome: "Inglês", icone: "EN", nuvem: true, voz: "pt-BR-ThalitaMultilingualNeural",
    resumo: "conversa em inglês e corrige em uma linha.",
    apelidos: ["ingles", "english", "conversacao em ingles", "conversa em ingles"],
    instrucao: "Converse em inglês natural, de nível intermediário (a não ser que ele peça mais fácil ou mais difícil). Se ele errar o inglês, primeiro responda ao conteúdo; depois corrija em UMA linha em português, começando com \"Correção:\" (o certo e o porquê). Se ele escrever em português, responda em inglês e, quando ajudar, mostre como ele poderia ter dito. Pedido de tradução: traduza e explique as expressões idiomáticas. De vez em quando termine com uma pergunta curta para manter a conversa.",
    naVoz: "Na voz: frases curtas e simples; a correção em português vem por último.",
    sugestoes: ["Let's talk about my weekend", "How do I say \"saudade\" in English?", "Corrige: \"I have 20 years old\"", "Me ensina 5 phrasal verbs comuns"],
  },
  {
    id: "ciencias", nome: "Ciências", icone: "⚗", nuvem: true,
    resumo: "física, química e biologia com unidades e fórmula.",
    apelidos: ["ciencias", "ciencia", "fisica", "quimica", "biologia", "natureza"],
    instrucao: "Física, química e biologia. Comece pela ideia em uma frase; depois: dados com unidades, fórmula, conta com as unidades acompanhando e o resultado com unidade e precisão razoável. Confira se a ordem de grandeza faz sentido. Use o termo técnico e explique-o na mesma frase. Diga quando algo é uma simplificação do ensino médio.",
    naVoz: "Na voz: sem fórmulas escritas; diga a relação em palavras (\"a força é a massa vezes a aceleração\").",
    sugestoes: ["Explica a 2ª lei de Newton com um exemplo", "Balanceia: H2 + O2 → H2O", "Diferença entre mitose e meiose", "Quanto tempo a luz leva do Sol até a Terra?"],
  },
  {
    id: "humanas", nome: "Humanas", icone: "🏛", nuvem: true,
    resumo: "contexto, causas, consequências e linha do tempo.",
    apelidos: ["humanas", "historia", "geografia", "filosofia", "sociologia"],
    instrucao: "História, geografia, filosofia e sociologia. Organize em: contexto (onde, quando, quem), causas, o que aconteceu e consequências. Quando ajudar, uma linha do tempo curta de 3 a 5 datas. Separe fato de interpretação e cite as correntes quando houver debate, sem opinião política própria.",
    naVoz: "Na voz: conte como uma história curta, na ordem dos acontecimentos.",
    sugestoes: ["Causas da Primeira Guerra em 5 tópicos", "O que é o contrato social de Rousseau?", "Linha do tempo da Era Vargas", "Diferença entre clima e tempo"],
  },
  {
    id: "estudo", nome: "Estudo (quiz)", icone: "🎯", nuvem: true,
    resumo: "testa com uma pergunta por vez e marca o placar.",
    apelidos: ["estudo", "quiz", "teste", "simulado", "prova", "me testa"],
    instrucao: "Quando ele disser um assunto, teste-o: UMA pergunta por vez (alternativas ou resposta curta) e espere a resposta. Depois de cada resposta: certo ou errado, o porquê em 1 ou 2 frases e a resposta certa; mostre o placar (\"3 de 4\") e faça a próxima pergunta, subindo a dificuldade se ele estiver acertando. Nunca entregue a resposta na própria pergunta. Quando ele errar, acrescente no FIM da sua mensagem uma linha exatamente assim: [[REVISAR: pergunta curta || resposta certa]] — ela vira cartão de revisão e não aparece para ele. Se ele pedir para parar, dê o placar final e os pontos a revisar.",
    naVoz: "Na voz: leia as alternativas devagar, uma por frase.",
    sugestoes: ["Me testa sobre a Revolução Francesa", "Quiz de 5 perguntas de química orgânica", "Me faz perguntas de inglês intermediário", "Me testa sobre função do 1º grau"],
  },
  {
    id: "programacao", nome: "Programação", icone: "</>", nuvem: true,
    resumo: "código primeiro; explica o erro antes de corrigir.",
    apelidos: ["programacao", "codigo", "dev", "programar", "codar"],
    instrucao: "Código primeiro, explicação depois e curta. Diante de um erro: a causa provável em uma frase antes da correção, e mostre só o trecho que muda (não reescreva o arquivo inteiro). Use a linguagem e o estilo que ele já usa. Aponte riscos reais (segurança, dado perdido), sem lista de boas práticas genéricas. Se faltar informação (versão, mensagem de erro inteira), peça só o que falta.",
    naVoz: "Na voz: não leia código. Diga a ideia e ofereça mandar o código pelo chat.",
    sugestoes: ["Por que dá \"undefined is not a function\"?", "Regex para validar e-mail, explicada", "Diferença entre let, const e var", "Revisa esta função para mim"],
  },
  {
    id: "simples", nome: "Simples", icone: "🌱", nuvem: true,
    resumo: "explica como para quem nunca viu o assunto.",
    apelidos: ["simples", "leigo", "facil", "explica simples", "eli5"],
    instrucao: "Explique como para quem nunca viu o assunto: sem jargão (ou explique cada termo na hora), frases curtas, uma analogia do dia a dia e um exemplo concreto. No máximo três ideias por resposta; no fim, ofereça aprofundar.",
    sugestoes: ["O que é inflação?", "Como funciona a internet?", "O que é um algoritmo?", "Por que o céu é azul?"],
  },
];

/** Nomes que já têm dono e nunca viram modo criado por ele. */
const RESERVADOS = new Set(["foco", "anonimo", "normal", "padrao", "silencio", "noturno"]);

interface Estado { ativo: string | null; usadoEm: number; meus: Modo[] }
const store = new Store<Estado>({ name: "modos", defaults: { ativo: null, usadoEm: 0, meus: [] } });

const ouvintes: Array<(m: Modo | null) => void> = [];
/** Quem quer saber da troca (o main avisa o dashboard e o celular). */
export function aoMudarModo(fn: (m: Modo | null) => void): void { ouvintes.push(fn); }
function avisar(m: Modo | null): void {
  for (const fn of ouvintes) { try { fn(m); } catch (e) { console.warn("[modos] aviso falhou:", e); } }
}

function chave(texto: string): string {
  return semAcento(texto ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function listarModos(): Modo[] {
  return [...CATALOGO, ...store.get("meus").map(m => ({ ...m, meu: true }))];
}

/** O modo pelo nome falado: id, nome ou apelido, sem acento. */
export function acharModo(nome: string): Modo | null {
  const k = chave(nome).replace(/^(?:o |a |de |da |do )+/, "").replace(/ (?:agora|por favor|pf)$/, "");
  if (!k) return null;
  for (const m of listarModos()) {
    if (m.id === k || chave(m.nome) === k || (m.apelidos ?? []).some(a => chave(a) === k)) return m;
  }
  return null;
}

/** Um preset com esse nome ganha do modo ("modo estudo" pode ser um preset dele). */
export function presetComNome(nome: string): boolean {
  const k = chave(nome);
  return Object.keys(getAllPresets()).some(p => { const pk = chave(p); return pk === k || pk === `modo ${k}`; });
}

/** O modo ligado, ou `null`. Desliga sozinho depois de 6 h sem uso. */
export function modoAtivo(agora = Date.now()): Modo | null {
  const id = store.get("ativo");
  if (!id) return null;
  if (agora - store.get("usadoEm") > EXPIRA_MS) { store.set("ativo", null); avisar(null); return null; }
  return listarModos().find(m => m.id === id) ?? null;
}

/** Marca uso (conta para as 6 h). */
export function tocarModo(agora = Date.now()): void {
  if (store.get("ativo")) store.set("usadoEm", agora);
}

export function definirModo(id: string | null, agora = Date.now()): Modo | null {
  const m = id ? listarModos().find(x => x.id === id) ?? null : null;
  if (id && !m) return modoAtivo(agora);
  const antes = store.get("ativo");
  store.set("ativo", m?.id ?? null);
  store.set("usadoEm", agora);
  if (antes !== (m?.id ?? null)) avisar(m);
  return m;
}

export type ErroModo = "nome" | "instrucao" | "reservado" | "existe" | "cheio";

/** Valida e cria (ou atualiza, se o id for dele). Devolve o modo ou o motivo da recusa. */
export function salvarModoMeu(entrada: { id?: string; nome: string; instrucao: string; icone?: string }): Modo | ErroModo {
  const nome = String(entrada.nome ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
  const instrucao = String(entrada.instrucao ?? "").trim().slice(0, MAX_INSTRUCAO_MODO);
  if (chave(nome).length < 2) return "nome";
  if (instrucao.length < 10) return "instrucao";
  const k = chave(nome);
  if (RESERVADOS.has(k) || presetComNome(nome)) return "reservado";
  const meus = store.get("meus");
  const editando = entrada.id ? meus.find(m => m.id === entrada.id) : undefined;
  const conflito = listarModos().find(m => m.id !== editando?.id && (chave(m.nome) === k || m.id === k || (m.apelidos ?? []).some(a => chave(a) === k)));
  if (conflito) return "existe";
  if (!editando && meus.length >= MAX_MODOS_MEUS) return "cheio";
  const id = editando?.id ?? `meu-${k.replace(/ /g, "-").slice(0, 24)}-${Date.now().toString(36).slice(-4)}`;
  const icone = (entrada.icone ?? "").trim().slice(0, 2) || "✦";
  const modo: Modo = { id, nome, icone, instrucao, resumo: instrucao.slice(0, 90), sugestoes: [], nuvem: false };
  store.set("meus", editando ? meus.map(m => (m.id === id ? modo : m)) : [...meus, modo]);
  return { ...modo, meu: true };
}

export function apagarModoMeu(id: string): boolean {
  const meus = store.get("meus");
  if (!meus.some(m => m.id === id)) return false;
  store.set("meus", meus.filter(m => m.id !== id));
  if (store.get("ativo") === id) { store.set("ativo", null); avisar(null); }
  return true;
}

/** Para o backup: só os criados por ele (o catálogo vem com o app). */
export function modosParaBackup(): Modo[] { return store.get("meus"); }
/** Importar SOMA (regra do backup): modo com o mesmo nome fica como está. */
export function importarModos(lista: unknown): { somados: number; pulados: number } {
  const r = { somados: 0, pulados: 0 };
  if (!Array.isArray(lista)) return r;
  for (const x of lista.slice(0, MAX_MODOS_MEUS * 2)) {
    const o = x as Partial<Modo>;
    if (typeof o?.nome !== "string" || typeof o?.instrucao !== "string") { r.pulados++; continue; }
    const s = salvarModoMeu({ nome: o.nome, instrucao: o.instrucao, icone: o.icone });
    if (typeof s !== "string") r.somados++;
    else if (s !== "existe") r.pulados++;
  }
  return r;
}

/** O bloco do prompt da conversa. Puro. */
export function blocoDoModo(m: Modo | null, canal: Canal): string {
  if (!m) return "";
  const cab = m.meu ? `[MODO ${m.nome.toUpperCase()} — criado por ele]` : `[MODO ${m.nome.toUpperCase()}]`;
  const voz = canal === "voz" && m.naVoz ? `\n${m.naVoz}` : "";
  return `\n\n${cab} Enquanto este modo estiver ligado, vale acima do estilo normal de resposta:\n${m.instrucao}${voz}`;
}

/** Uma linha no prompt do agente. Pura. */
export function linhaDoAgente(m: Modo | null): string {
  return m ? `\n- Modo ${m.nome} ligado: ao responder conteúdo, ${m.resumo}` : "";
}

/** Para o chip e para o celular. */
export function modoParaCliente(m: Modo | null): { id: string; nome: string; icone: string; resumo: string; meu: boolean } | null {
  return m ? { id: m.id, nome: m.nome, icone: m.icone, resumo: m.resumo, meu: !!m.meu } : null;
}

// ── o que se fala ────────────────────────────────────────────────────────────────

export type PedidoDeModo =
  | { tipo: "ligar"; id: string }
  | { tipo: "desligar" }
  | { tipo: "status" }
  | { tipo: "listar" }
  | { tipo: "criar"; nome: string; instrucao: string };

const LIGAR = /^(?:ely )?(?:(?:liga|ligar|ativa|ativar|entra|entrar|muda|mudar|troca|trocar|vai|vamos|bota|coloca|poe|usa|usar)(?: (?:no|o|pro|para o|pra o|para|pra|em|pelo))? )?modo (.{2,40})$/;
const DESLIGAR = /^(?:ely )?(?:sai|sair|desliga|desligar|desativa|desativar|encerra|encerrar|tira|tirar|fecha|fechar|termina|terminar)(?: (?:do|o|desse|deste|esse|este))? modo(?: (.{2,40}))?$/;
const NORMAL = /^(?:ely )?(?:(?:volta|voltar) (?:ao|pro|para o|pra o) (?:modo )?normal|modo (?:normal|padrao)|sem modo)$/;
const STATUS = /^(?:ely )?(?:em )?(?:que|qual) modo (?:(?:ta|esta|voce ta|voce esta|eu to|eu estou|estamos|tamo) )?(?:ligado|ativo|agora)?$/;
const LISTAR = /^(?:ely )?(?:quais (?:sao )?(?:os )?modos(?: (?:tem|existem|voce tem|disponiveis|que tem|que voce tem))?|lista(?:r)? (?:os )?modos|meus modos|modos disponiveis)$/;
const CRIAR = /^\s*(?:ely[,!]?\s+)?(?:cria|criar|crie|monta|montar)\s+(?:um\s+)?modo\s+(?:chamado\s+)?["“']?(.{2,30}?)["”']?\s*[,:]?\s+(?:que|pra|para|onde|em que|no qual)\s+(.{10,})$/is;

/** "modo matemática", "sai do modo", "cria um modo X que…". `null` = não é sobre modo. */
export function pedidoDeModo(texto: string): PedidoDeModo | null {
  const bruto = String(texto ?? "").trim();
  const t = chave(bruto);
  if (!t || !/\bmodos?\b|\bnormal\b/.test(t)) return null;
  const criar = CRIAR.exec(bruto);
  if (criar) return { tipo: "criar", nome: criar[1].trim(), instrucao: criar[2].trim() };
  if (NORMAL.test(t)) return { tipo: "desligar" };
  if (LISTAR.test(t)) return { tipo: "listar" };
  if (STATUS.test(t)) return { tipo: "status" };
  const des = DESLIGAR.exec(t);
  if (des) {
    // "sai do modo foco" é do foco (regra própria); só desliga se for um modo daqui.
    if (des[1] && !acharModo(des[1])) return null;
    return { tipo: "desligar" };
  }
  const lig = LIGAR.exec(t);
  if (lig) {
    const m = acharModo(lig[1]);
    if (!m || presetComNome(lig[1])) return null;
    return { tipo: "ligar", id: m.id };
  }
  return null;
}
