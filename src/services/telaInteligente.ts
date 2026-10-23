import * as fs from "node:fs";
import * as path from "node:path";
import { semAcento } from "./texto";

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
  return /\b(monta|monte|montar|faz|faca|fazer|cria|crie|criar|gera|gere|gerar|mostra|mostre|me mostra|quero|desenha|desenhe|me da|me de|manda)\b.{0,40}\b(grafico|mapa|tabela|calculadora|simulador|flashcards?|quiz|planilha|dashboard|painel|cronograma|checklist|comparativo)\b/.test(t);
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
};
export type Gerador = (sistema: string) => Promise<Conversa | null>;

export type Tela = { programa: string; tentativas: number; ms: number; provedor: string; modelo: string | null; declaracoes: number };

/**
 * Gera e valida; uma nova tentativa com os erros. `null` = sem tela (falhou duas vezes, ou ninguém
 * para gerar). `registro` recebe o resultado de cada tentativa (para a bancada e o log).
 */
export async function gerarTela(pergunta: string, respostaTexto: string, gerador: Gerador, registro?: (r: { tentativa: number; ok: boolean; erros: string[]; ms: number; provedor?: string; modelo?: string | null }) => void): Promise<Tela | null> {
  const v = carregarValidador();
  const sistema = promptDasTelas();
  const t0 = Date.now();
  const falhou = (e: unknown) => { console.warn("[UI] gerador falhou:", e instanceof Error ? e.message : e); return null; };
  const conversa = await gerador(sistema).catch(falhou);
  if (!conversa) { registro?.({ tentativa: 1, ok: false, erros: ["sem gerador"], ms: Date.now() - t0 }); return null; }
  try {
    let usuario = pedidoDaTela(pergunta, respostaTexto);
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const t1 = Date.now();
      const r = await conversa.enviar(usuario).catch(falhou);
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
