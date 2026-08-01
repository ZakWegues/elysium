import Store from "electron-store";
import * as crypto from "node:crypto";

/**
 * Memória de longo prazo do assistente.
 *
 * Fatos curtos que o usuário pediu para o NEUROAXIS lembrar entre sessões — o
 * histórico de conversa em `brain.ts` é volátil e some por inatividade, então nada
 * dito ontem sobrevive até hoje sem isto.
 *
 * O conteúdo entra no system prompt a cada pedido, então o custo é pago em todas as
 * chamadas ao cérebro. Daí o teto baixo de itens e de tamanho por item: memória é
 * para "meu projeto principal é o NEUROAXIS", não para colar documento.
 */

export interface MemoryFact {
  id: string;
  text: string;
  createdAt: number;
}

/** Acima disto o bloco começa a competir por atenção com as regras de decisão. */
export const MEMORY_MAX_FACTS = 20;
export const MEMORY_MAX_TEXT_LENGTH = 200;

const store = new Store<{ facts: MemoryFact[] }>({
  name: "memory",
  defaults: { facts: [] },
});

export function listFacts(): MemoryFact[] {
  return store.get("facts");
}

/**
 * Guarda um fato novo. Devolve o fato criado, ou o existente quando já havia um
 * equivalente — repetir "lembra que eu moro em Curitiba" não deve gerar duplicata.
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

export function removeFactById(id: string): boolean {
  const facts = store.get("facts");
  const next = facts.filter(f => f.id !== id);
  if (next.length === facts.length) return false;
  store.set("facts", next);
  return true;
}

/**
 * Remove por trecho de texto — é assim que o comando de voz chega ("esquece que eu
 * moro em Curitiba"). Casa por substring nos dois sentidos, como `findPresetKey`.
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

export function clearFacts(): void {
  store.set("facts", []);
}

/**
 * Bloco pronto para injetar no system prompt. String vazia quando não há nada — não
 * vale gastar tokens com um cabeçalho sem conteúdo.
 */
export function buildMemoryBlock(): string {
  const facts = listFacts();
  if (facts.length === 0) return "";
  const lines = facts.map(f => `- ${f.text}`).join("\n");
  return `\n\nFatos que o usuário pediu para você lembrar (use quando forem relevantes, não os recite sem motivo):\n${lines}`;
}
