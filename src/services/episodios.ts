import Store from "electron-store";
import { provedorDeFundo } from "./cerebroHibrido";
import { getConfig } from "../main/config";
import { callChat } from "./llm";
import { radicais } from "./memoryStore";

/**
 * Ela lembra do que vocês conversaram (fase 19, bloco 190).
 *
 * O histórico do cérebro zera depois de 5 minutos parado (`chatIdleResetMs`) e some ao
 * reiniciar o app; a memória de fatos só guarda o que é ESTÁVEL ("tem um cachorro chamado
 * Thor"). Ficava de fora justamente o que faz uma conversa parecer com gente: "semana
 * passada você ia estudar para a prova — e aí?". É o que ChatGPT e Claude chamam de
 * referência às conversas anteriores.
 *
 * Quando a conversa esfria (o mesmo gancho que propõe fatos, `brain.ts`), uma chamada
 * barata escreve um EPISÓDIO: 1 a 3 frases de resumo, os assuntos e o que ficou pendente
 * do lado DELE ("ficou de estudar para a prova"). Nos pedidos seguintes, os episódios que
 * dividem palavras com o pedido entram no prompt com a data ("há 3 dias").
 *
 * Privacidade: roda no provedor de fundo (local, com o "auto"); fica só neste PC
 * (`episodios.json`, entra no backup); dá para apagar um a um ou tudo; e o MODO ANÔNIMO
 * ("Ely, modo anônimo") para de gravar episódios e de propor fatos até ser desligado ou o
 * app reiniciar — vale para a conversa que ele não quer ver lembrada.
 */

export interface Episodio {
  id: string;
  /** Quando a conversa aconteceu (o fim dela). */
  em: number;
  resumo: string;
  assuntos: string[];
  /** O que ELE disse que ia fazer ("estudar para a prova de sexta"). */
  pendencias: string[];
  /** Bloco 191: a Ely já perguntou "e aí, como foi?" sobre as pendências deste episódio. */
  perguntado?: boolean;
}

export const MAX_EPISODIOS = 200;
export const DIAS_GUARDADOS = 90;
const DIA = 86_400_000;

// ── Puras (testadas) ─────────────────────────────────────────────────────────

/** O JSON do modelo → episódio aproveitável, ou null (conversa sem assunto, JSON quebrado). */
export function interpretarEpisodio(bruto: string): Pick<Episodio, "resumo" | "assuntos" | "pendencias"> | null {
  let j: Record<string, unknown>;
  try { j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as Record<string, unknown>; } catch { return null; }
  const resumo = typeof j.resumo === "string" ? j.resumo.trim().replace(/\s+/g, " ") : "";
  if (resumo.length < 15 || resumo.length > 400) return null;
  const lista = (v: unknown, max: number, tam: number) => (Array.isArray(v) ? v : [])
    .filter((x): x is string => typeof x === "string")
    .map(x => x.trim().replace(/\s+/g, " "))
    .filter(x => x.length >= 2 && x.length <= tam)
    .slice(0, max);
  return { resumo, assuntos: lista(j.assuntos, 5, 40), pendencias: lista(j.pendencias, 3, 120) };
}

/** Tira o que passou de 90 dias e mantém os 200 mais recentes. Não muta. */
export function podarEpisodios(lista: Episodio[], agora = Date.now()): Episodio[] {
  return lista
    .filter(e => agora - e.em <= DIAS_GUARDADOS * DIA)
    .sort((a, b) => b.em - a.em)
    .slice(0, MAX_EPISODIOS);
}

/** "hoje", "ontem", "há 3 dias", "há 2 semanas", "há 2 meses". */
export function quandoFoi(em: number, agora = Date.now()): string {
  const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
  const dia = new Date(em); dia.setHours(0, 0, 0, 0);
  const dias = Math.round((hoje.getTime() - dia.getTime()) / DIA);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 14) return `há ${dias} dias`;
  if (dias < 60) return `há ${Math.floor(dias / 7)} semanas`;
  return `há ${Math.floor(dias / 30)} meses`;
}

/**
 * Os episódios que têm a ver com o pedido: pelo menos `minimo` radicais em comum (o mesmo
 * ranqueamento da memória de fatos, `memoryStore.radicais`), os mais parecidos primeiro e
 * os mais recentes no desempate. Episódio de hoje não entra: o histórico da conversa ainda
 * cobre (e repetiria).
 */
export function escolherEpisodios(lista: Episodio[], pedido: string, agora = Date.now(), n = 2, minimo = 2): Episodio[] {
  const doPedido = radicais(pedido);
  if (!doPedido.size) return [];
  const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
  return lista
    .filter(e => minimo <= 1 || e.em < hoje.getTime())
    .map(e => {
      let pontos = 0;
      for (const r of radicais(`${e.resumo} ${e.assuntos.join(" ")} ${e.pendencias.join(" ")}`)) if (doPedido.has(r)) pontos++;
      return { e, pontos };
    })
    .filter(p => p.pontos >= minimo)
    .sort((a, b) => b.pontos - a.pontos || b.e.em - a.e.em)
    .slice(0, n)
    .map(p => p.e);
}

/** Uma linha por episódio: "há 3 dias: resumo (ficou de: X)". */
export function linhaDoEpisodio(e: Episodio, agora = Date.now()): string {
  const pend = e.pendencias.length ? ` (ele ficou de: ${e.pendencias.join("; ")})` : "";
  return `- ${quandoFoi(e.em, agora)}: ${e.resumo}${pend}`;
}

/** O bloco do prompt, ou "" sem nada relevante. */
export function blocoDeEpisodios(eps: Episodio[], agora = Date.now()): string {
  if (!eps.length) return "";
  return `\n\n[CONVERSAS ANTERIORES — o que vocês já conversaram e tem a ver com o pedido. Use se ajudar, com naturalidade ("da última vez você…"); não recite]\n${eps.map(e => linhaDoEpisodio(e, agora)).join("\n")}`;
}

// ── Modo anônimo ─────────────────────────────────────────────────────────────
// Só na memória do processo: reiniciar o app desliga. Persistir um "anônimo" esquecido
// faria a Ely parar de lembrar das coisas sem ninguém entender por quê.
let anonimo = false;
const aoMudar = new Set<(ligado: boolean) => void>();
export function modoAnonimo(): boolean { return anonimo; }
/**
 * Liga ou desliga. A virada avisa o cérebro (`brain.ts`), que ZERA o histórico da conversa: o
 * aprendizado roda no fim da conversa sobre o histórico inteiro, e sem isto desligar o modo
 * anônimo e continuar falando fazia as falas "anônimas" virarem fato e lembrança (a revisão
 * pegou).
 */
export function definirAnonimo(ligar: boolean): boolean {
  const antes = anonimo;
  anonimo = !!ligar;
  if (antes !== anonimo) for (const fn of aoMudar) { try { fn(anonimo); } catch { /* segue */ } }
  return anonimo;
}
export function aoMudarAnonimo(fn: (ligado: boolean) => void): void { aoMudar.add(fn); }

// ── Store ────────────────────────────────────────────────────────────────────

const store = new Store<{ episodios: Episodio[] }>({ name: "episodios", defaults: { episodios: [] } });

export function listarEpisodios(): Episodio[] {
  const l = store.get("episodios");
  return Array.isArray(l) ? l : [];
}

function salvar(lista: Episodio[]): void {
  store.set("episodios", podarEpisodios(lista));
}

export function apagarEpisodio(id: string): boolean {
  const l = listarEpisodios();
  const resto = l.filter(e => e.id !== id);
  if (resto.length === l.length) return false;
  salvar(resto);
  return true;
}

export function apagarTodosEpisodios(): number {
  const n = listarEpisodios().length;
  store.set("episodios", []);
  return n;
}

export function marcarPerguntado(id: string): void {
  salvar(listarEpisodios().map(e => (e.id === id ? { ...e, perguntado: true } : e)));
}

/** Para o backup: soma sem duplicar (mesmo instante e mesmo resumo = o mesmo episódio). */
export function importarEpisodios(vindos: unknown[]): number {
  const atuais = listarEpisodios();
  const chaves = new Set(atuais.map(e => `${e.em}|${e.resumo}`));
  let n = 0;
  for (const v of vindos) {
    const e = v as Partial<Episodio> | null;
    if (!e || typeof e.resumo !== "string" || !Number.isFinite(e.em)) continue;
    const chave = `${e.em}|${e.resumo}`;
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    atuais.push({
      id: typeof e.id === "string" ? e.id : `ep-${Number(e.em).toString(36)}`,
      em: Number(e.em), resumo: e.resumo,
      assuntos: Array.isArray(e.assuntos) ? e.assuntos.filter(x => typeof x === "string") : [],
      pendencias: Array.isArray(e.pendencias) ? e.pendencias.filter(x => typeof x === "string") : [],
      perguntado: !!e.perguntado,
    });
    n++;
  }
  salvar(atuais);
  return n;
}

/** O bloco para o prompt da conversa e do agente. Nunca lança. */
export function blocoDasConversasAnteriores(pedido: string): string {
  try { return blocoDeEpisodios(escolherEpisodios(listarEpisodios(), pedido)); } catch { return ""; }
}

// ── Gravar ───────────────────────────────────────────────────────────────────

const PROMPT = `Você resume, para a memória da assistente Ely, uma conversa que acabou entre ela e o usuário.

Responda só JSON: {"resumo": "...", "assuntos": ["..."], "pendencias": ["..."]}
- resumo: 1 a 3 frases curtas, em terceira pessoa ("Ele perguntou…", "Conversaram sobre…"), com o que importa para retomar o assunto depois. Sem detalhes técnicos de comandos.
- assuntos: até 5 palavras-chave do assunto (ex.: "prova de matemática", "SSD").
- pendencias: até 3 coisas que ELE disse que vai fazer ou que ficaram para depois ("estudar para a prova de sexta"). Só o que ele disse; nada que a Ely sugeriu. Sem nada, lista vazia.
Se a conversa foi só comando rápido (abrir programa, tocar música, volume, hora) sem assunto nenhum, responda {"resumo": ""}.`;

/**
 * Escreve o episódio da conversa que esfriou. `turnos` vem do histórico do cérebro
 * ("Usuário: …" / "Ely: …"); `antes` é o resumo das partes que já tinham sido podadas.
 */
export async function registrarEpisodio(turnos: { role: "user" | "assistant"; content: string }[], antes = "", agora = Date.now()): Promise<Episodio | null> {
  if (anonimo) return null;
  const doUsuario = turnos.filter(t => t.role === "user").map(t => t.content.trim()).join(" ");
  // Conversa curta demais ("pausa", "volume 40") não vira episódio: poupa a chamada.
  if (doUsuario.length < 40) return null;
  const cfg = getConfig();
  const provider = provedorDeFundo(cfg.chatProvider);
  const model = provider === "ollama" ? cfg.ollamaChatModel : cfg.brainModel;
  // Respostas longas cortadas: o resumo precisa do assunto, não do texto inteiro.
  const conversa = turnos
    .map(t => `${t.role === "user" ? "Usuário" : "Ely"}: ${t.content.replace(/\s+/g, " ").slice(0, t.role === "user" ? 400 : 300)}`)
    .join("\n");
  try {
    const bruto = await callChat({
      provider, model, json: true, temperature: 0.1, maxTokens: 300, timeoutMs: 45_000,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: `${antes ? `ANTES DISSO (resumo): ${antes}\n\n` : ""}CONVERSA:\n${conversa}` },
      ],
    });
    const lido = interpretarEpisodio(bruto);
    if (!lido || anonimo) return null;
    const ep: Episodio = { id: `ep-${agora.toString(36)}-${Math.random().toString(36).slice(2, 6)}`, em: agora, ...lido };
    salvar([ep, ...listarEpisodios()]);
    console.log(`[episodios] conversa guardada (${lido.assuntos.length} assunto(s), ${lido.pendencias.length} pendência(s)).`);
    return ep;
  } catch (e) {
    console.warn("[episodios] não consegui resumir a conversa:", e instanceof Error ? e.message : e);
    return null;
  }
}
