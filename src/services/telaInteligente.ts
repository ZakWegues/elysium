import * as fs from "node:fs";
import * as path from "node:path";
import { semAcento } from "./texto";
import { lerDados, numerosDaConta, numerosDeFinanciamento, pedidoDosDados, programaConta, programaFinanciamento, programaPronto, semModelo, sistemaDosDados, tipoDeTelaPronta, type TipoComDados, type TipoPronto } from "./telasProntas";

/**
 * Telas inteligentes (Fase 2, 22/10) — a resposta da Ely vira uma tela interativa (OpenUI Lang),
 * desenhada pelo renderer isolado (ui-render). Aqui: quando gerar, a geração em si (2ª chamada,
 * com o prompt do OpenUI e a resposta em texto como contexto), a validação local (parse + esquema,
 * no lugar da Cloud da Thesys) e UMA nova tentativa devolvendo os erros ao modelo. Falhou de
 * novo: nada de tela (a resposta em texto já foi entregue) e uma linha `[UI]` no log.
 *
 * Quem gera: o Hermes (sessão oculta e descartável), senão a Groq com modelo grande. Nunca o
 * modelo local de 7B: sem os dois, não há tela nem oferta.
 */

export type ModoInterativo = "nunca" | "pedir" | "perguntar" | "priorizar";
export type Decisao = "gerar" | "oferecer" | "nada";

export const OFERTA = "Quer que eu monte isso como tela?";

function norm(t: string): string {
  return semAcento(t).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Pedido explícito de tela ("monta uma tela", "me mostra num gráfico", "faz uma calculadora"). Puro. */
export function pediuTela(texto: string): boolean {
  const t = norm(texto);
  if (/\b(como|numa|em|uma) tela\b|\btela interativa\b|\binterativ[oa]\b|\bfaz(er)? (isso )?visual\b/.test(t)) return true;
  return /\b(monta|monte|montar|faz|faca|fazer|cria|crie|criar|gera|gere|gerar|mostra|mostre|me mostra|quero|desenha|desenhe|me da|me de|manda)\b.{0,80}\b(grafico|mapa|tabela|calculadora|simulador|flashcards?|quiz|planilha|dashboard|painel|cronograma|checklist|comparativo|roteiro|itinerario)\b/.test(t);
}

/**
 * 31/10: "interativo", "completo", "do zero", "diferente"… = a pessoa quer mais que o modelo pronto;
 * vai direto ao gerador livre. Puro.
 */
export function querTelaLivre(texto: string): boolean {
  return /\b(interativ[oa]|complet[oa]|detalhad[oa]|personalizad[oa]|do zero|diferente|criativ[oa]|caprichad[oa]|elaborad[oa])\b/.test(norm(texto));
}

/**
 * Caberia uma tela? Classificador barato (regra + palavra-chave, sem modelo): planejar, comparar,
 * calcular, simular, roteiro, orçamento, dividir conta, estudar… Puro.
 */
export function cabeTela(pergunta: string): boolean {
  const t = norm(pergunta);
  if (t.length < 12) return false;
  return /\b(planej\w*|roteiro|itinerario|viagem|compar\w*|calcul\w*|simul\w*|orcamento|financiamento|emprestimo|juros|parcel\w*|divid\w* (a )?conta|rachar|flashcards?|quiz|estud\w*|revis\w* para|cronograma|grafico|tabela|mapa|treino da semana|cardapio|lista de compras|passo a passo|checklist|gastos?|investiment\w*|meta de)\b/.test(t);
}

/** O que fazer com a resposta, conforme o ajuste "Respostas interativas" e o canal. Puro. */
export function decidirTela(modo: ModoInterativo | string | undefined, pergunta: string, canal: "voz" | "texto", temGerador: boolean): Decisao {
  if (canal === "voz" || !temGerador || modo === "nunca") return "nada";
  if (pediuTela(pergunta)) return "gerar";
  if (modo === "pedir") return "nada";
  if (!cabeTela(pergunta)) return "nada";
  // 24/10: financiamento e conta dividida saem prontos do texto, sem modelo e em milissegundos:
  // perguntar antes custaria mais que mostrar.
  const tipo = tipoDeTelaPronta(pergunta);
  if (tipo && semModelo(tipo)) return "gerar";
  return modo === "priorizar" ? "gerar" : "oferecer";
}

// ── geração ─────────────────────────────────────────────────────────────────────────────

type Validacao = { ok: boolean; programa: string; erros: string[]; declaracoes: number };
type Validador = { validarPrograma: (bruto: string) => Validacao };

/** Onde mora o renderer pronto: no app empacotado (dist/renderer/ui) ou no repo (ui-render/dist). */
function pastaDoRenderer(): string {
  const candidatos = [path.join(__dirname, "..", "renderer", "ui"), path.join(__dirname, "..", "..", "ui-render", "dist")];
  return candidatos.find((p) => fs.existsSync(path.join(p, "validador.cjs"))) ?? candidatos[1];
}

let validador: Validador | null = null;
let prompt: string | null = null;
export function carregarValidador(): Validador {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!validador) validador = require(path.join(pastaDoRenderer(), "validador.cjs")) as Validador;
  return validador;
}
export function promptDasTelas(): string {
  if (prompt === null) prompt = fs.readFileSync(path.join(pastaDoRenderer(), "prompt.txt"), "utf8");
  return prompt;
}

/** O pedido do turno: a pergunta e a resposta em texto que a tela tem de mostrar. Puro. */
export function pedidoDaTela(pergunta: string, respostaTexto: string): string {
  const comTexto = respostaTexto.trim().length > 0;
  return [
    comTexto
      ? "Monte uma tela interativa (OpenUI Lang) para este pedido do usuário, com o conteúdo da resposta em texto abaixo."
      : "Monte uma tela interativa (OpenUI Lang) que responda a este pedido do usuário.",
    "Responda SÓ com o programa, começando por `root = `. Não use ferramentas.",
    "",
    `Pedido do usuário: ${pergunta.slice(0, 2000)}`,
    ...(comTexto ? ["", "Resposta em texto da Ely (o conteúdo que a tela deve mostrar, de forma visual e interativa):", respostaTexto.slice(0, 6000)] : []),
  ].join("\n");
}

/** A 2ª tentativa: os erros do validador voltam ao modelo. Puro. */
export function pedidoDeCorrecao(programa: string, erros: string[]): string {
  return [
    "O programa abaixo não passou na validação. Corrija e devolva o programa INTEIRO, só o programa, começando por `root = `.",
    "Erros:",
    ...erros.map((e) => `- ${e}`),
    "",
    "Programa:",
    programa.slice(0, 40_000),
  ].join("\n");
}

/**
 * Uma conversa com o modelo: abre com o prompt das telas; `enviar` manda o pedido e, se precisar,
 * a correção — na MESMA conversa (o modelo já tem o contexto; o prompt de ~10k tokens não vai de
 * novo). `null` = ninguém para gerar.
 */
export type Conversa = {
  enviar: (usuario: string) => Promise<{ texto: string; provedor: string; modelo: string | null } | null>;
  fechar: () => void;
  /** Passa para o próximo modelo (conversa nova). false = não há outro. */
  trocar?: () => boolean;
};
export type Gerador = (sistema: string) => Promise<Conversa | null>;

export type Tela = { programa: string; tentativas: number; ms: number; provedor: string; modelo: string | null; declaracoes: number };

type Registro = (r: { tentativa: number; ok: boolean; erros: string[]; ms: number; provedor?: string; modelo?: string | null }) => void;

/**
 * Tela pronta: as instantâneas (financiamento, dividir conta) saem do próprio texto; as outras pedem
 * ao modelo só os DADOS em JSON (prompt curto) — duas tentativas, a 2ª com o erro do zod. O
 * programa montado ainda passa no validador (cinto de segurança). null = cai no gerador livre.
 */
async function telaPronta(
  tipo: TipoPronto, pergunta: string, resposta: string, gerador: Gerador, v: Validador,
  ouCancela: <T>(p: Promise<T>) => Promise<T | null>, registro?: Registro, sinal?: AbortSignal,
): Promise<Omit<Tela, "ms"> | null> {
  const t1 = Date.now();
  const pronto = (programa: string, tentativas: number, provedor: string, modelo: string | null) => {
    const val = v.validarPrograma(programa);
    registro?.({ tentativa: tentativas, ok: val.ok, erros: val.erros, ms: Date.now() - t1, provedor, modelo });
    if (!val.ok) { console.warn(`[UI] tela pronta "${tipo}" inválida: ${val.erros.slice(0, 3).join(" | ")}`); return null; }
    console.log(`[UI] tela pronta "${tipo}" em ${Date.now() - t1} ms (${provedor}${modelo ? ` ${modelo}` : ""})`);
    return { programa: val.programa, tentativas, provedor, modelo, declaracoes: val.declaracoes };
  };
  if (semModelo(tipo)) {
    const texto = `${pergunta}\n${resposta}`;
    return pronto(tipo === "financiamento" ? programaFinanciamento(numerosDeFinanciamento(texto)) : programaConta(numerosDaConta(texto)), 0, "pronta", null);
  }
  const t = tipo as TipoComDados;
  const conversa = await ouCancela(gerador(sistemaDosDados(t)).catch(() => null));
  if (!conversa) return null;
  try {
    let usuario = pedidoDosDados(pergunta, resposta);
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      if (sinal?.aborted) return null;
      const r = await ouCancela(conversa.enviar(usuario).catch(() => null));
      if (!r) return null;
      const d = lerDados(t, r.texto);
      if (d.ok) return pronto(programaPronto(t, d.dados), tentativa, r.provedor, r.modelo);
      console.warn(`[UI] dados da tela "${t}" inválidos (tentativa ${tentativa}): ${d.erro}`);
      registro?.({ tentativa, ok: false, erros: [d.erro], ms: Date.now() - t1, provedor: r.provedor, modelo: r.modelo });
      usuario = `O JSON não passou na validação: ${d.erro}. Devolva o objeto JSON INTEIRO corrigido, só ele.`;
    }
    return null;
  } finally {
    conversa.fechar();
  }
}

/**
 * Gera e valida; uma nova tentativa com os erros. `null` = sem tela (falhou duas vezes, ninguém
 * para gerar, ou `sinal` cancelou — quem chamou confere `sinal.aborted`). `registro` recebe o
 * resultado de cada tentativa (para a bancada e o log).
 */
export async function gerarTela(...args: Parameters<typeof gerarTelaCrua>): Promise<Tela | null> {
  const tela = await gerarTelaCrua(...args);
  if (tela) aoMostrar?.(tela.programa);
  return tela;
}

/** Quem quer saber de cada tela pronta (31/10: o main põe o texto dela no contexto da Ely). */
let aoMostrar: ((programa: string) => void) | null = null;
export function quandoMostrarTela(fn: ((programa: string) => void) | null): void {
  aoMostrar = fn;
}

/** Palavras de estilo do OpenUI (tamanho, tom, alinhamento) e ícones — não são conteúdo. */
const ESTILO = new Set(["sm", "md", "lg", "xl", "muted", "soft", "center", "start", "end", "success", "warning", "danger", "info", "insight", "dica", "primary", "number", "currency", "brl", "bar", "donut", "line", "area", "pie", "desc", "asc", "nome", "valor",
  "brain", "calendar", "equal", "landmark", "percent", "receipt", "target", "trophy", "users", "wallet", "star", "heart", "clock", "check", "info", "map", "home", "book"]);

/**
 * O que a tela mostra, em texto corrido (31/10): os textos do programa, sem ícones e palavras de
 * estilo, com o número quando vem logo depois ({nome: "Mercado", valor: 800} → "Mercado (800)").
 * É o que a Ely "lembra" da tela no pedido seguinte. Puro.
 */
export function textoDaTela(programa: string, max = 1500): string {
  const vistos = new Set<string>();
  const partes: string[] = [];
  for (const m of programa.matchAll(/"((?:[^"\\\n]|\\.)*)"(\s*,\s*(?:\w+\s*:\s*)?(-?\d+(?:\.\d+)?)\b)?/g)) {
    let t: string;
    try { t = (JSON.parse(`"${m[1]}"`) as string).trim(); } catch { continue; }
    if (t.length < 2 || !/[\p{L}\d]/u.test(t) || ESTILO.has(t.toLowerCase()) || /^[a-z0-9]+(-[a-z0-9]+)+$/.test(t) || /^chart\d$/.test(t) || vistos.has(t)) continue;
    vistos.add(t);
    partes.push(m[3] !== undefined ? `${t} (${m[3]})` : t);
  }
  const texto = partes.join(" · ");
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

/**
 * O que a pessoa FEZ na tela, em texto (31/10): cada variável de estado (`$c0`, `$r1`…) vira o
 * rótulo que vem logo depois dela no programa — `Checkbox($c0, "Camiseta")` + `true` →
 * "Camiseta: marcado"; `QuizCard($r0, "1. Capital da França?", …)` + "Paris" → "1. Capital da
 * França?: Paris". Sem rótulo, ou sem resposta (""), fica de fora. Puro.
 */
export function estadoEmTexto(programa: string, vars: Record<string, unknown>, max = 1200): string {
  const partes: string[] = [];
  for (const [nome, valor] of Object.entries(vars ?? {})) {
    if (!/^\$?\w+$/.test(nome)) continue;
    const v = nome.startsWith("$") ? nome : `$${nome}`;
    const m = new RegExp(`\\${v}\\s*,\\s*"((?:[^"\\\\\\n]|\\\\.)*)"`).exec(programa);
    if (!m) continue;
    let rotulo: string;
    try { rotulo = (JSON.parse(`"${m[1]}"`) as string).trim(); } catch { continue; }
    if (!rotulo) continue;
    const dito = valor === true ? "marcado" : valor === false ? "desmarcado"
      : typeof valor === "number" ? String(valor)
      : typeof valor === "string" && valor.trim() ? valor.trim().slice(0, 120) : null;
    if (dito) partes.push(`${rotulo}: ${dito}`);
  }
  const t = partes.join(" · ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

async function gerarTelaCrua(pergunta: string, respostaTexto: string, gerador: Gerador, registro?: (r: { tentativa: number; ok: boolean; erros: string[]; ms: number; provedor?: string; modelo?: string | null }) => void, sinal?: AbortSignal): Promise<Tela | null> {
  const v = carregarValidador();
  const sistema = promptDasTelas();
  const t0 = Date.now();
  const falhou = (e: unknown) => { console.warn("[UI] gerador falhou:", e instanceof Error ? e.message : e); return null; };
  // Cancelar (o ✕ do esqueleto): a espera em curso acaba na hora e a conversa é fechada.
  const cancelado = new Promise<null>((ok) => {
    if (sinal?.aborted) ok(null);
    else sinal?.addEventListener("abort", () => ok(null), { once: true });
  });
  const ouCancela = <T>(p: Promise<T>) => (sinal ? Promise.race([p, cancelado]) : p);
  // 24/10: os pedidos comuns têm tela pronta (o modelo só manda os dados, ou nem isso).
  const tipo = querTelaLivre(pergunta) ? null
    : tipoDeTelaPronta(pergunta) ?? (/\b(disso|isso|dessa|desse)\b/i.test(pergunta) ? tipoDeTelaPronta(respostaTexto) : null);
  if (tipo) {
    const pronta = await telaPronta(tipo, pergunta, respostaTexto, gerador, v, ouCancela, registro, sinal);
    if (pronta) return { ...pronta, ms: Date.now() - t0 };
    if (sinal?.aborted) return null;
    console.warn(`[UI] tela pronta "${tipo}" não saiu; indo pelo gerador livre`);
  }
  const abrindo = gerador(sistema).catch(falhou);
  // Cancelou enquanto a sessão abria: quando ela abrir, fecha (senão ficaria pendurada no Hermes).
  void abrindo.then((c) => { if (sinal?.aborted) c?.fechar(); });
  const conversa = await ouCancela(abrindo);
  if (!conversa) { registro?.({ tentativa: 1, ok: false, erros: [sinal?.aborted ? "cancelada" : "sem gerador"], ms: Date.now() - t0 }); return null; }
  try {
    let usuario = pedidoDaTela(pergunta, respostaTexto);
    // 1ª e 2ª (correção) no mesmo modelo; errou as duas: uma 3ª, do zero, no próximo modelo da lista
    // (23/10: o nemotron às vezes erra a ordem dos argumentos duas vezes seguidas).
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      if (sinal?.aborted) return null;
      if (tentativa === 3) {
        if (!conversa.trocar?.()) return null;
        usuario = pedidoDaTela(pergunta, respostaTexto);
      }
      const t1 = Date.now();
      const r = await ouCancela(conversa.enviar(usuario).catch(falhou));
      if (sinal?.aborted) return null;
      if (!r) { registro?.({ tentativa, ok: false, erros: ["sem resposta do modelo"], ms: Date.now() - t1 }); return null; }
      const val = v.validarPrograma(r.texto);
      registro?.({ tentativa, ok: val.ok, erros: val.erros, ms: Date.now() - t1, provedor: r.provedor, modelo: r.modelo });
      if (val.ok) return { programa: val.programa, tentativas: tentativa, ms: Date.now() - t0, provedor: r.provedor, modelo: r.modelo, declaracoes: val.declaracoes };
      console.warn(`[UI] tela inválida (tentativa ${tentativa}, ${r.provedor}${r.modelo ? ` ${r.modelo}` : ""}): ${val.erros.slice(0, 3).join(" | ")}`);
      usuario = pedidoDeCorrecao(val.programa || r.texto, val.erros);
    }
    return null;
  } finally {
    conversa.fechar();
  }
}
