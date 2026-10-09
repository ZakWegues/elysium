import { getApiKey, getConfig } from "../main/config";
import { callChat, type Provider } from "./llm";
import { ehCompromisso } from "./planoDeLembrete";
import { listarTarefasTodas, type Tarefa } from "./tarefas";
import type { ItemDespejo } from "./despejo";
import { diaLocal } from "./hora";
import { radicais } from "./texto";

/**
 * "Monta um plano de estudo pra prova de física" (fase 20, bloco 210).
 *
 * A prova já costuma estar nas tarefas ("prova de física sexta 14h"); a Ely acha, divide os
 * assuntos em sessões de amanhã até a antevéspera e deixa a véspera para revisão geral. Os
 * assuntos vêm dele ("assuntos: cinemática, dinâmica") ou do modelo; a DIVISÃO pelos dias é
 * conta, sem modelo (`distribuirSessoes`). Nada é gravado sem ele ver: na voz vira
 * "Confirma? Diga sim."; na tela, a prévia marcável do despejo — e grava pelo mesmo
 * `aplicarDespejo`, então cada sessão é uma tarefa com aviso.
 */

export interface PedidoPlano { materia: string; assuntos: string[]; dia?: string; hora?: string }
export interface Sessao { dia: string; hora: string; texto: string }

const MAX_SESSOES = 14;
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return diaLocal(new Date(a, m - 1, d + n));
}

function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((new Date(a2, m2 - 1, d2).getTime() - new Date(a1, m1 - 1, d1).getTime()) / 86_400_000);
}

/**
 * As sessões de `hoje+1` até a véspera da prova. A véspera é revisão geral (com 2 dias ou
 * mais); os assuntos se espalham pelos dias de antes, em ordem — com mais assuntos que dias,
 * alguns dias pegam dois. Sem dia livre (prova amanhã), uma revisão hoje. Pura.
 */
export function distribuirSessoes(materia: string, assuntos: string[], hoje: string, prova: string, hora = "19:00"): Sessao[] {
  const livres = diasEntre(hoje, prova) - 1;
  if (livres < 0) return [];
  if (livres === 0) return [{ dia: hoje, hora, texto: `Revisão de ${materia}` }];
  const temVespera = livres >= 2;
  const diasDeEstudo = temVespera ? livres - 1 : livres;
  const lista = assuntos.length ? assuntos.slice(0, MAX_SESSOES) : [];
  const sessoes: Sessao[] = [];
  if (!lista.length) {
    for (let i = 1; i <= Math.min(diasDeEstudo, MAX_SESSOES - 1); i++) sessoes.push({ dia: somarDias(hoje, i), hora, texto: `Estudar ${materia}` });
  } else if (lista.length <= diasDeEstudo) {
    // Espalhados: 3 assuntos em 6 dias = dias 1, 3 e 5 (folga entre eles para fixar).
    lista.forEach((a, i) => sessoes.push({ dia: somarDias(hoje, 1 + Math.floor((i * diasDeEstudo) / lista.length)), hora, texto: `Estudar ${materia}: ${a}` }));
  } else {
    const porDia: string[][] = Array.from({ length: diasDeEstudo }, () => []);
    lista.forEach((a, i) => porDia[Math.floor((i * diasDeEstudo) / lista.length)].push(a));
    porDia.forEach((as, i) => sessoes.push({ dia: somarDias(hoje, i + 1), hora, texto: `Estudar ${materia}: ${as.join(" e ")}` }));
  }
  if (temVespera) sessoes.push({ dia: somarDias(prova, -1), hora, texto: `Revisão geral de ${materia} (véspera da prova)` });
  return sessoes;
}

/** As sessões no formato da prévia do despejo. Pura. */
export function sessoesComoItens(sessoes: Sessao[]): ItemDespejo[] {
  return sessoes.map((s, i) => {
    const [a, m, d] = s.dia.split("-").map(Number);
    const dt = new Date(a, m - 1, d);
    return {
      id: `p${i}`, tipo: "tarefa" as const, texto: s.texto.slice(0, 200), quando: `${s.dia}T${s.hora}`, semHora: false,
      rotulo: `${DIAS_SEMANA[dt.getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} às ${s.hora.replace(/:00$/, "h")}`,
    };
  });
}

/** A prova da matéria nas tarefas abertas: compromisso futuro cujo texto fala da matéria. Pura. */
export function acharProva(materia: string, tarefas: Tarefa[], agora = Date.now()): Tarefa | null {
  const alvo = radicais(materia);
  if (!alvo.size) return null;
  const candidatas = tarefas.filter(t => !t.feita && t.prazo !== undefined && t.prazo > agora && ehCompromisso(t.texto)
    && [...alvo].every(r => radicais(t.texto).has(r)));
  return candidatas.sort((a, b) => (a.prazo ?? 0) - (b.prazo ?? 0))[0] ?? null;
}

const GATILHO = /^\s*(?:ely[,!]?\s+)?(?:(?:monta|montar|monte|faz|faça|faca|fazer|cria|criar|crie|organiza|organizar|me\s+(?:ajuda|ajude)\s+a\s+montar)\s+)?(?:um\s+|o\s+|meu\s+)?(?:plano|cronograma|roteiro)\s+de\s+estudos?\s+(?:pra|para|pro|da|de)\s+(?:a\s+|minha\s+)?(?:prova|teste|simulado|avalia[cç][aã]o|recupera[cç][aã]o)\s+(?:de\s+|da\s+|do\s+)?(.+)$/i;

/** "plano de estudo pra prova de física dia 20 às 20h, assuntos: a, b". Pura. */
export function pedidoDePlano(texto: string, hoje = new Date()): PedidoPlano | null {
  const m = GATILHO.exec(String(texto ?? ""));
  if (!m) return null;
  let resto = m[1].trim().replace(/[.!?]+$/, "");
  let assuntos: string[] = [];
  const a = /[,;]?\s*(?:assuntos?|conte[uú]dos?|t[oó]picos?|mat[eé]ria)\s*[:=-]?\s*(.+)$/i.exec(resto);
  if (a) {
    assuntos = a[1].split(/\s*(?:,|;|\be\b)\s*/).map(s => s.trim()).filter(s => s.length >= 2).slice(0, MAX_SESSOES);
    resto = resto.slice(0, a.index).trim();
  }
  let hora: string | undefined;
  // "às 20h", nunca o "a 20" de dentro de "dia 20".
  const h = /(?:^|[\s,])\s*(?:às|as|por volta das)\s+(\d{1,2})(?:[:h](\d{2}))?\s*h?(?=[\s,.]|$)/i.exec(resto);
  if (h && Number(h[1]) < 24) {
    hora = `${String(Number(h[1])).padStart(2, "0")}:${h[2] ?? "00"}`;
    resto = (resto.slice(0, h.index) + resto.slice(h.index + h[0].length)).trim();
  }
  let dia: string | undefined;
  const d = /\s*,?\s*(?:(?:que\s+[eé]\s+)?(?:no\s+)?dia\s+|em\s+)?(\d{1,2})(?:\/(\d{1,2}))?\b/i.exec(resto);
  if (d && /dia|\//.test(d[0])) {
    const n = Number(d[1]);
    let mes = d[2] ? Number(d[2]) - 1 : hoje.getMonth();
    let ano = hoje.getFullYear();
    // "dia 3" com hoje 20: é o mês que vem.
    if (!d[2] && n < hoje.getDate()) mes++;
    if (mes > 11) { mes -= 12; ano++; }
    const dt = new Date(ano, mes, n);
    if (dt.getDate() === n) {
      if (d[2] && dt.getTime() < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) dt.setFullYear(ano + 1);
      dia = diaLocal(dt);
      resto = (resto.slice(0, d.index) + resto.slice(d.index + d[0].length)).trim();
    }
  }
  const materia = resto.replace(/[,;:]+$/, "").replace(/\s+/g, " ").trim();
  if (materia.length < 2 || materia.split(" ").length > 5) return null;
  return { materia, assuntos, ...(dia ? { dia } : {}), ...(hora ? { hora } : {}) };
}

const PROMPT_ASSUNTOS = `Você lista os assuntos de uma prova escolar para montar um plano de estudo.
Responda SOMENTE com JSON: {"assuntos": ["...", "..."]} — de 3 a 6 assuntos curtos (até 5 palavras cada), na ordem em que se costuma estudar, do básico ao avançado. Nada de explicação.`;

/** Os assuntos pelo modelo; em qualquer falha, lista vazia (as sessões saem sem assunto). */
export async function assuntosPelaIa(materia: string): Promise<string[]> {
  const cfg = getConfig();
  const provider: Provider = getApiKey() ? "groq" : "ollama";
  try {
    const bruto = await callChat({
      provider, model: provider === "ollama" ? cfg.ollamaChatModel : cfg.brainModel, json: true,
      messages: [{ role: "system", content: PROMPT_ASSUNTOS }, { role: "user", content: `Prova de ${materia.slice(0, 80)}` }],
      temperature: 0.2, maxTokens: 300, timeoutMs: 30_000,
    });
    const lista = (JSON.parse(bruto) as { assuntos?: unknown }).assuntos;
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string").map(s => s.trim().slice(0, 60)).filter(Boolean).slice(0, 6) : [];
  } catch { return []; }
}

export interface PlanoMontado { itens: ItemDespejo[]; prova: { texto: string; dia: string } | null; resumo: string }

/** O plano inteiro, sem gravar nada. */
export async function montarPlano(p: PedidoPlano, agora = new Date()): Promise<PlanoMontado> {
  const hoje = diaLocal(agora);
  const tarefa = p.dia ? null : acharProva(p.materia, listarTarefasTodas(), agora.getTime());
  const dia = p.dia ?? (tarefa?.prazo !== undefined ? diaLocal(new Date(tarefa.prazo)) : undefined);
  if (!dia) return { itens: [], prova: null, resumo: `Não achei a prova de ${p.materia} nas tarefas. Diga a data: "plano de estudo pra prova de ${p.materia} dia 20".` };
  if (dia <= hoje) return { itens: [], prova: { texto: tarefa?.texto ?? `Prova de ${p.materia}`, dia }, resumo: "A prova é hoje (ou já passou) — não dá para montar sessões." };
  const assuntos = p.assuntos.length ? p.assuntos : await assuntosPelaIa(p.materia);
  const itens = sessoesComoItens(distribuirSessoes(p.materia, assuntos, hoje, dia, p.hora ?? "19:00"));
  const prova = { texto: tarefa?.texto ?? `Prova de ${p.materia}`, dia };
  return { itens, prova, resumo: resumoDoPlano(p.materia, itens, dia) };
}

/** "5 sessões de física, de qua 14/10 a dom 18/10 às 19h, com revisão na véspera." Pura. */
export function resumoDoPlano(materia: string, itens: ItemDespejo[], dia: string): string {
  if (!itens.length) return `Não sobrou dia antes da prova de ${materia}.`;
  const primeiro = itens[0].rotulo?.replace(/ às .*/, "") ?? "";
  const ultimo = itens[itens.length - 1].rotulo ?? "";
  const vespera = itens.some(i => /véspera/.test(i.texto));
  const [, m, d] = dia.split("-");
  return `${itens.length} ${itens.length === 1 ? "sessão" : "sessões"} de ${materia} para a prova de ${d}/${m}: ${itens.length === 1 ? ultimo : `de ${primeiro} a ${ultimo}`}${vespera ? ", com revisão geral na véspera" : ""}.`;
}
