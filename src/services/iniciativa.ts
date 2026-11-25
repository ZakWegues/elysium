import Store from "electron-store";
import { getConfig } from "../main/config";
import { pendentesDeAcompanhamento, marcarAcompanhado } from "./acompanhamento";
import { assuntosDoBriefing } from "./assuntosDoBriefing";
import { climaAgora } from "./clima";
import { conversasNovas, importancia } from "./notificacoesDoCelular";
import { novidadesEmCache } from "./novidades";
import { listarTarefas } from "./tarefas";
import { eventosDoDia } from "./agenda";
import { semAcento } from "./texto";

/**
 * A Ely puxa conversa (25/11 — "só o fato do Elysium iniciar uma conversa já me deixa feliz"). De
 * tempos em tempos ela olha o que sabe e escolhe, no máximo, UMA coisa que vale dizer. As regras vêm
 * do que irrita nos outros assistentes: poucas vezes por dia, espaçadas, nunca sobre o que já foi
 * dito ou feito, nada em jogo, foco ou de noite; e o tipo que ele dispensa para de aparecer. Ela só
 * conversa e oferece: agir continua precisando do sim dele. Tudo puro, menos o fim do arquivo.
 */
export type TipoDeIniciativa = "compromisso" | "tarefa" | "acompanhamento" | "mensagem" | "novidade" | "clima" | "saudade";
export interface Iniciativa {
  id: string; tipo: TipoDeIniciativa; texto: string;
  /** Por que ela está falando disso (aparece embaixo). */
  porque: string;
  /** Um próximo passo pronto: o que aparece no botão e o pedido que ele manda. */
  passo?: { rotulo: string; pedido: string };
  peso: number;
}

export interface Fatos {
  agora: Date;
  eventos: { titulo: string; inicio: number }[];
  tarefas: { id: string; texto: string; prazo?: number; feita: boolean }[];
  acompanhamentos: { id: string; pergunta: string }[];
  /** Conversas do celular importantes e paradas (quem mandou e há quantos minutos). */
  mensagens: { quem: string; app: string; em: number }[];
  novidades: { tema: string; topicos: string[] }[];
  chuvaEm: { hora: number; texto: string } | null;
  ultimaConversa: number;
}

const MIN = 60_000;
const minutos = (ms: number) => Math.max(1, Math.round(ms / MIN));
const semFim = (t: string) => t.replace(/[.!?]+$/, "");

/** Tudo o que daria para dizer agora, sem filtro. Pura. */
export function candidatas(f: Fatos): Iniciativa[] {
  const t = f.agora.getTime(), dia = f.agora.toDateString(), h = f.agora.getHours();
  const saida: Iniciativa[] = [];
  for (const e of f.eventos) {
    const falta = e.inicio - t;
    if (falta > 20 * MIN && falta < 75 * MIN) saida.push({ id: `c:${e.inicio}:${e.titulo}`, tipo: "compromisso", peso: 10, texto: `Daqui a ${minutos(falta)} minutos você tem ${semFim(e.titulo)}. Quer que eu te lembre dez minutos antes?`, porque: "está na sua agenda", passo: { rotulo: "Lembra, sim", pedido: `me lembra de ${semFim(e.titulo)} em ${Math.max(5, minutos(falta) - 10)} minutos` } });
  }
  if (h >= 17) {
    const deHoje = f.tarefas.filter((x) => !x.feita && x.prazo && x.prazo > t - 12 * 60 * MIN && new Date(x.prazo).toDateString() === f.agora.toDateString());
    if (deHoje.length) saida.push({ id: `t:${dia}:${deHoje[0].id}`, tipo: "tarefa", peso: 7, texto: deHoje.length === 1 ? `Ainda falta “${semFim(deHoje[0].texto)}” para hoje. Faz agora ou passo para amanhã?` : `Faltam ${deHoje.length} tarefas para hoje, a primeira é “${semFim(deHoje[0].texto)}”. Quer que eu passe alguma para amanhã?`, porque: "vence hoje", passo: { rotulo: "Passa para amanhã", pedido: `adia ${semFim(deHoje[0].texto)} para amanhã` } });
  }
  for (const a of f.acompanhamentos.slice(0, 1)) saida.push({ id: a.id, tipo: "acompanhamento", peso: 6, texto: a.pergunta, porque: "você tinha me contado" });
  for (const m of f.mensagens) {
    const ha = t - m.em;
    if (ha > 40 * MIN && ha < 6 * 60 * MIN) saida.push({ id: `m:${semAcento(m.quem)}:${dia}`, tipo: "mensagem", peso: 8, texto: `${m.quem} te mandou mensagem no ${m.app} há ${ha < 90 * MIN ? `${minutos(ha)} minutos` : `${Math.round(ha / (60 * MIN))} horas`} e parece importante. Quer que eu leia?`, porque: "é de alguém importante, e você ainda não viu", passo: { rotulo: "Lê para mim", pedido: `o que ${m.quem} me mandou` } });
  }
  for (const n of f.novidades) {
    const topico = n.topicos[0];
    if (topico) saida.push({ id: `n:${semAcento(topico).slice(0, 60)}`, tipo: "novidade", peso: 4, texto: `Vi uma coisa sobre ${n.tema}: ${semFim(topico)}. Quer que eu conte mais?`, porque: `você acompanha ${n.tema}`, passo: { rotulo: "Conta mais", pedido: `conta mais sobre: ${semFim(topico)}` } });
  }
  if (f.chuvaEm && f.chuvaEm.hora > h && f.chuvaEm.hora - h <= 3 && h >= 8) saida.push({ id: `w:${dia}`, tipo: "clima", peso: 5, texto: `Vem ${f.chuvaEm.texto} lá pelas ${f.chuvaEm.hora}h. Se for sair, leva guarda-chuva.`, porque: "a previsão mudou" });
  // Um oi no fim da tarde, se passou o dia sem se falar. Vale pouco: só quando não há mais nada.
  if (h >= 18 && h < 21 && t - f.ultimaConversa > 9 * 60 * MIN) saida.push({ id: `s:${dia}`, tipo: "saudade", peso: 1, texto: "Hoje a gente quase não se falou. Como foi o seu dia?", porque: "passou o dia sem conversa" });
  return saida;
}

export interface EstadoDaIniciativa {
  /** Quando ela falou por iniciativa própria (só hoje interessa). */
  ditas: { id: string; tipo: TipoDeIniciativa; em: number }[];
  /** Quanto ele gosta de cada tipo: começa em 1; 👎 corta pela metade, 👍 sobe um pouco. */
  gosto: Partial<Record<TipoDeIniciativa, number>>;
}

export const GOSTO_MINIMO = 0.3;
const INTERVALO_MS = 90 * MIN;

/** A que vale dizer agora, ou nenhuma. Pura. */
export function escolher(cands: Iniciativa[], e: EstadoDaIniciativa, o: { agora: Date; porDia: number; ocupado: boolean }): Iniciativa | null {
  const t = o.agora.getTime(), h = o.agora.getHours() + o.agora.getMinutes() / 60;
  if (o.porDia <= 0 || o.ocupado || h < 8 || h >= 22.5) return null;
  const hoje = e.ditas.filter((d) => new Date(d.em).toDateString() === o.agora.toDateString());
  if (hoje.length >= o.porDia) return null;
  const ultima = Math.max(0, ...e.ditas.map((d) => d.em));
  const jaDitas = new Set(e.ditas.map((d) => d.id));
  const validas = cands.filter((c) => !jaDitas.has(c.id) && (e.gosto[c.tipo] ?? 1) >= GOSTO_MINIMO
    // Novidade: uma por dia; o resto vai no briefing.
    && !(c.tipo === "novidade" && hoje.some((d) => d.tipo === "novidade")))
    .map((c) => ({ c, p: c.peso * (e.gosto[c.tipo] ?? 1) })).sort((a, b) => b.p - a.p);
  const melhor = validas[0];
  if (!melhor) return null;
  // Compromisso não espera o intervalo; o resto sim.
  if (melhor.c.tipo !== "compromisso" && t - ultima < INTERVALO_MS) return null;
  return melhor.c;
}

/** 👍/👎 de um tipo. Pura. */
export function novoGosto(atual: number | undefined, gostou: boolean): number {
  const v = atual ?? 1;
  return Math.max(0.05, Math.min(1.6, gostou ? v + 0.15 : v * 0.5));
}

/** "Para de me avisar disso", "não quero esse tipo de aviso", "adorei você ter falado". Pura. */
export function opiniaoSobreIniciativa(texto: string): "gostou" | "nao" | null {
  const t = semAcento(texto).replace(/[.!]+$/, "").trim();
  if (t.length > 90) return null;
  if (/^(?:nao (?:quero|precisa|me (?:avisa|fala|manda))|para de|pare de|chega de).{0,40}\b(?:aviso|avisos|avisar|disso|desse tipo|isso|falar disso)\b/.test(t)) return "nao";
  if (/^(?:gostei|adorei|curti|bom saber|continua).{0,40}\b(?:avis\w+|falado|lembrado|isso|assim)\b/.test(t)) return "gostou";
  return null;
}

// ── store e fatos ───────────────────────────────────────────────────────────────────────────

const store = new Store<{ estado: EstadoDaIniciativa }>({ name: "iniciativa", defaults: { estado: { ditas: [], gosto: {} } } });
function estado(): EstadoDaIniciativa {
  const e = store.get("estado");
  return { ditas: Array.isArray(e?.ditas) ? e.ditas : [], gosto: { ...e?.gosto } };
}

let ultima: { i: Iniciativa; em: number } | null = null;
export function ultimaIniciativa(agora = Date.now()): Iniciativa | null {
  return ultima && agora - ultima.em < 30 * MIN ? ultima.i : null;
}

async function juntarFatos(agora: Date, ultimaConversa: number): Promise<Fatos> {
  const t = agora.getTime();
  const seguro = async <T>(fn: () => Promise<T> | T, v: T): Promise<T> => { try { return await fn(); } catch { return v; } };
  const querem = new Set(assuntosDoBriefing());
  return {
    agora, ultimaConversa,
    eventos: await seguro(async () => ((await eventosDoDia(0)) ?? []).filter((e) => !e.diaInteiro).map((e) => ({ titulo: e.titulo, inicio: e.inicio })), []),
    tarefas: await seguro(() => listarTarefas().map((x) => ({ id: x.id, texto: x.texto, prazo: x.prazo, feita: !!x.feita })), []),
    acompanhamentos: await seguro(() => pendentesDeAcompanhamento(t), []),
    mensagens: await seguro(() => conversasNovas(undefined, t).filter((c) => importancia(c, { pessoas: getConfig().notifPessoas ?? [] }) >= 4).map((c) => ({ quem: c.quem, app: c.app, em: c.em })), []),
    novidades: await seguro(() => (novidadesEmCache(agora) ?? []).filter((n) => querem.has(n.tema) && n.tema !== "GitHub"), []),
    chuvaEm: await seguro(async () => { const h = (await climaAgora())?.horas?.find((x) => x.chuva); return h ? { hora: h.hora, texto: "chuva" } : null; }, null),
  };
}

/** A hora de olhar (o main chama a cada 10 min). Devolve o que dizer, já anotado como dito. */
export async function olharIniciativa(o: { ocupado: boolean; ultimaConversa: number }, agora = new Date()): Promise<Iniciativa | null> {
  const porDia = getConfig().iniciativasPorDia ?? 4;
  if (porDia <= 0 || o.ocupado) return null;
  const e = estado();
  const i = escolher(candidatas(await juntarFatos(agora, o.ultimaConversa)), e, { agora, porDia, ocupado: o.ocupado });
  if (!i) return null;
  e.ditas = [...e.ditas, { id: i.id, tipo: i.tipo, em: agora.getTime() }].slice(-300);
  store.set("estado", e);
  if (i.tipo === "acompanhamento") marcarAcompanhado(i.id);
  ultima = { i, em: agora.getTime() };
  return i;
}

/** O que ele achou da última. Devolve a fala, ou null se não havia iniciativa recente. */
export function opinar(op: "gostou" | "nao", agora = Date.now()): string | null {
  const i = ultimaIniciativa(agora);
  if (!i) return null;
  const e = estado();
  e.gosto[i.tipo] = novoGosto(e.gosto[i.tipo], op === "gostou");
  store.set("estado", e);
  return op === "gostou" ? "Boa, vou continuar avisando." : (e.gosto[i.tipo] as number) < GOSTO_MINIMO ? "Certo, não falo mais disso por conta própria." : "Anotado, vou falar menos disso.";
}
