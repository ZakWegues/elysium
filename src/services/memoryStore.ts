import Store from "electron-store";
import * as crypto from "node:crypto";
import { radicais, semAcento } from "./texto";

/**
 * Memória de longo prazo do assistente.
 *
 * Fatos curtos que o usuário pediu para o ELYSIUM lembrar entre sessões — o
 * histórico de conversa em `brain.ts` é volátil e some por inatividade, então nada
 * dito ontem sobrevive até hoje sem isto.
 *
 * O conteúdo entra no system prompt a cada pedido, então o custo é pago em todas as
 * chamadas ao cérebro. Daí o teto baixo de itens e de tamanho por item: memória é
 * para "meu projeto principal é o ELYSIUM", não para colar documento.
 */

export interface MemoryFact {
  id: string;
  text: string;
  createdAt: number;
}

/** Acima disto o bloco começa a competir por atenção com as regras de decisão. */
/**
 * Fase 13 (bloco 118): 60 guardados, mas só os ~12 mais relevantes vão no prompt de cada
 * pedido. Com 20 injetados sempre, cada fato novo era mais prompt em TODO pedido — e o
 * modelo local tem 8 mil tokens de contexto para tudo.
 */
export const MEMORY_MAX_FACTS = 60;
export const MEMORY_INJETADOS = 12;
export const MEMORY_MAX_TEXT_LENGTH = 200;

export interface SugestaoDeFato {
  id: string;
  text: string;
  createdAt: number;
}

const store = new Store<{ facts: MemoryFact[]; sugestoes: SugestaoDeFato[]; recusadas: string[] }>({
  name: "memory",
  defaults: { facts: [], sugestoes: [], recusadas: [] },
});

export function listFacts(): MemoryFact[] {
  return store.get("facts");
}

/**
 * Guarda um fato novo. Devolve o fato criado, ou o existente quando já havia um
 * equivalente — repetir "lembra que eu moro em Recife" não deve gerar duplicata.
 */
export function addFact(text: string): { fact: MemoryFact; created: boolean } {
  const clean = text.trim().slice(0, MEMORY_MAX_TEXT_LENGTH);
  if (!clean) throw new Error("fato vazio");

  const facts = store.get("facts");
  const existing = facts.find(f => f.text.toLowerCase() === clean.toLowerCase());
  if (existing) return { fact: existing, created: false };

  const fact: MemoryFact = {
    id: crypto.randomBytes(8).toString("hex"),
    text: clean,
    createdAt: Date.now(),
  };

  // Ao estourar o teto, o mais antigo sai. Fatos recentes tendem a ser os relevantes,
  // e o usuário sempre pode reafirmar algo que quer de volta.
  const next = [...facts, fact].slice(-MEMORY_MAX_FACTS);
  store.set("facts", next);
  return { fact, created: true };
}

/**
 * Corrige um fato (fase 18, 08/10): a pesquisa sobre a memória do ChatGPT — o que mais irrita
 * é não ter como ver e ajustar o que o assistente "acha" que sabe. Apagar e criar de novo
 * perdia a data; editar mantém.
 */
export function editFact(id: string, text: string): MemoryFact | null {
  const clean = text.trim().slice(0, MEMORY_MAX_TEXT_LENGTH);
  if (!clean) return null;
  const facts = store.get("facts");
  const f = facts.find(x => x.id === id);
  if (!f) return null;
  const novo = { ...f, text: clean };
  store.set("facts", facts.map(x => x.id === id ? novo : x));
  return novo;
}

export function removeFactById(id: string): boolean {
  const facts = store.get("facts");
  const next = facts.filter(f => f.id !== id);
  if (next.length === facts.length) return false;
  store.set("facts", next);
  return true;
}

/**
 * Remove por trecho de texto — é assim que o comando de voz chega ("esquece que eu
 * moro em Recife"). Casa por substring nos dois sentidos, como `findPresetKey`.
 */
export function removeFactByText(query: string): MemoryFact | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const facts = store.get("facts");
  const hit = facts.find(f => {
    const t = f.text.toLowerCase();
    return t.includes(q) || q.includes(t);
  });
  if (!hit) return null;

  store.set("facts", facts.filter(f => f.id !== hit.id));
  return hit;
}

/**
 * Bloco pronto para injetar no system prompt. String vazia quando não há nada — não
 * vale gastar tokens com um cabeçalho sem conteúdo.
 */
// ── Relevância (bloco 118) ────────────────────────────────────────────────────

// `radicais` mora em texto.ts (fase 20); fica reexportado para quem já importava daqui.
export { radicais };

/**
 * Os fatos que vão no prompt: todos, se couberem; senão os que mais dividem palavras (pelo
 * radical) com o pedido, e os mais recentes no desempate. Devolve na ordem original — a
 * ordem em que foram guardados também é informação. Pura, para teste.
 */
export function escolherFatos(fatos: MemoryFact[], pedido: string, n = MEMORY_INJETADOS): MemoryFact[] {
  if (fatos.length <= n) return fatos;
  const doPedido = radicais(pedido);
  const pontuados = fatos.map((f, i) => {
    let pontos = 0;
    for (const r of radicais(f.text)) if (doPedido.has(r)) pontos++;
    return { f, i, pontos };
  });
  pontuados.sort((a, b) => b.pontos - a.pontos || b.f.createdAt - a.f.createdAt);
  const escolhidos = new Set(pontuados.slice(0, n).map(p => p.i));
  return fatos.filter((_, i) => escolhidos.has(i));
}

export function buildMemoryBlock(pedido = ""): string {
  const facts = escolherFatos(listFacts(), pedido);
  if (facts.length === 0) return "";
  const lines = facts.map(f => `- ${f.text}`).join("\n");
  return `\n\nFatos que o usuário pediu para você lembrar (use quando forem relevantes, não os recite sem motivo):\n${lines}`;
}

// ── Sugestões (bloco 118) ─────────────────────────────────────────────────────
//
// O cérebro propõe, o Zak decide: um fato só entra na memória com "guardar". Recusado não
// volta a ser sugerido (a lista de recusados guarda o texto normalizado).

const MAX_SUGESTOES = 10;
const MAX_RECUSADAS = 100;

function chave(texto: string): string {
  return semAcento(texto).replace(/[^a-z0-9]/g, "");
}

/**
 * O mesmo fato com outras palavras ("meu peixe se chama Bolota" × "O usuário tem um peixe
 * chamado Bolota"): 60% dos radicais do menor dentro do maior. O cérebro às vezes já guardou
 * pelo "lembra que" e a extração sugeriria de novo.
 */
function parecido(a: string, b: string): boolean {
  const ra = radicais(a), rb = radicais(b);
  const [menor, maior] = ra.size <= rb.size ? [ra, rb] : [rb, ra];
  if (!menor.size) return false;
  let comuns = 0;
  for (const r of menor) if (maior.has(r)) comuns++;
  return comuns / menor.size >= 0.6;
}

export function listarSugestoesDeFato(): SugestaoDeFato[] {
  return store.get("sugestoes");
}

/** Devolve a sugestão criada, ou null se já é fato, já foi sugerida ou foi recusada. */
export function sugerirFato(texto: string): SugestaoDeFato | null {
  const limpo = texto.trim().slice(0, MEMORY_MAX_TEXT_LENGTH);
  if (limpo.length < 8) return null;
  const k = chave(limpo);
  if (listFacts().some(f => chave(f.text) === k || parecido(f.text, limpo))) return null;
  if (store.get("sugestoes").some(s => chave(s.text) === k)) return null;
  if (store.get("recusadas").includes(k)) return null;
  const s: SugestaoDeFato = { id: crypto.randomBytes(8).toString("hex"), text: limpo, createdAt: Date.now() };
  store.set("sugestoes", [...store.get("sugestoes"), s].slice(-MAX_SUGESTOES));
  return s;
}

export function aceitarSugestao(id: string): MemoryFact | null {
  const s = store.get("sugestoes").find(x => x.id === id);
  if (!s) return null;
  store.set("sugestoes", store.get("sugestoes").filter(x => x.id !== id));
  return addFact(s.text).fact;
}

export function recusarSugestao(id: string): boolean {
  const s = store.get("sugestoes").find(x => x.id === id);
  if (!s) return false;
  store.set("sugestoes", store.get("sugestoes").filter(x => x.id !== id));
  store.set("recusadas", [...store.get("recusadas"), chave(s.text)].slice(-MAX_RECUSADAS));
  return true;
}

/**
 * Os fatos da memória que esta resposta USOU (31/10) — o rodapé "Lembrei: …" do chat. Injetado
 * não basta (são até 12 por pedido): conta só o fato que estava no prompt E cuja maioria dos
 * radicais aparece na resposta. Heurística sem modelo; erra para menos, não para mais.
 */
export function fatosUsados(pedido: string, resposta: string, fatos = listFacts()): { id: string; text: string }[] {
  const daResposta = radicais(resposta);
  if (!daResposta.size) return [];
  return escolherFatos(fatos, pedido)
    .filter(f => {
      const rf = radicais(f.text);
      if (rf.size < 2) return false;
      let comuns = 0;
      for (const r of rf) if (daResposta.has(r)) comuns++;
      return comuns / rf.size >= 0.5;
    })
    .slice(0, 3)
    .map(f => ({ id: f.id, text: f.text }));
}
