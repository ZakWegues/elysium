import Store from "electron-store";
import * as crypto from "node:crypto";

/**
 * Histórico de conversas do dashboard.
 *
 * Espelha, de propósito, a semântica do `chatHistoryStore.ts` do Portal: mesmo formato
 * de sessão, mesmo teto de 5 conversas não favoritadas, favoritas sem limite, mesmo
 * critério de título. Os dois lados guardam localmente e **não sincronizam** — cada um
 * tem a sua conversa. Divergir no comportamento seria pior que não ter a feature,
 * porque o usuário aprenderia uma regra num lugar e ela valeria outra coisa no outro.
 *
 * O `brain.ts` também mantém um histórico, mas é outra coisa: aquele é o contexto
 * volátil mandado ao modelo, some por inatividade e nunca vai pro disco.
 */

export type ChatRole = "me" | "reply" | "error";

export interface StoredMessage {
  id: string;
  from: ChatRole;
  text: string;
  ts: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
  messages: StoredMessage[];
}

/** Favoritar é o que tira uma conversa desta contagem. */
const MAX_NON_FAVORITE_SESSIONS = 5;

const store = new Store<{ sessions: ChatSession[] }>({
  name: "chat-sessions",
  defaults: { sessions: [] },
});

function readAll(): ChatSession[] {
  return store.get("sessions");
}

/** Mais recentes primeiro. */
export function listSessions(): ChatSession[] {
  return readAll().slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): ChatSession | null {
  return readAll().find(s => s.id === id) ?? null;
}

export function newSessionId(): string {
  return `session-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

/** Primeira fala do usuário, truncada — mesmo critério do app. */
export function deriveTitle(messages: StoredMessage[]): string {
  const first = messages.find(m => m.from === "me");
  if (!first) return "Nova conversa";
  return first.text.length > 40 ? `${first.text.slice(0, 40)}...` : first.text;
}

export function saveSession(session: ChatSession): ChatSession {
  const sessions = readAll();
  const index = sessions.findIndex(s => s.id === session.id);
  if (index >= 0) sessions[index] = session;
  else sessions.push(session);

  // Favoritas sobrevivem sempre; das demais, só as 5 mais recentes.
  const favorites = sessions.filter(s => s.favorite);
  const recent = sessions
    .filter(s => !s.favorite)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_NON_FAVORITE_SESSIONS);

  store.set("sessions", [...favorites, ...recent]);
  return session;
}

/**
 * Grava a conversa em andamento. Chamado a cada troca, então precisa ser barato e
 * nunca lançar — uma falha ao gravar histórico não pode derrubar a resposta que o
 * usuário está esperando.
 */
export function upsertMessages(
  sessionId: string | null,
  messages: StoredMessage[],
): ChatSession | null {
  try {
    if (messages.length === 0) return null;

    const existing = sessionId ? getSession(sessionId) : null;
    const now = Date.now();

    const session: ChatSession = {
      id:        existing?.id        ?? sessionId ?? newSessionId(),
      title:     deriveTitle(messages),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      favorite:  existing?.favorite  ?? false,
      messages,
    };

    return saveSession(session);
  } catch (e) {
    console.error("[chat-sessions] falha ao gravar conversa:", e);
    return null;
  }
}

/**
 * Aplica uma conversa vinda do celular.
 *
 * Vence quem tem `updatedAt` maior. Com um usuário e dois aparelhos, isso resolve o
 * conflito real (mexeu no celular depois de mexer no PC) sem a complexidade de
 * relógios vetoriais, e nunca perde a versão mais nova.
 *
 * O PC é a autoridade sobre a retenção: quem sincroniza adota a lista que ele devolve.
 * Se os dois lados podassem por conta própria, cada um mandaria de volta o que o outro
 * acabou de apagar.
 */
export function mergeSession(incoming: ChatSession): ChatSession {
  const existing = getSession(incoming.id);
  if (existing && existing.updatedAt >= incoming.updatedAt) return existing;

  return saveSession({
    ...incoming,
    // Preserva a origem da conversa: o celular pode não saber quando ela nasceu.
    createdAt: existing?.createdAt ?? incoming.createdAt ?? Date.now(),
    title: incoming.title || deriveTitle(incoming.messages),
  });
}

export function deleteSession(id: string): boolean {
  const sessions = readAll();
  const next = sessions.filter(s => s.id !== id);
  if (next.length === sessions.length) return false;
  store.set("sessions", next);
  return true;
}

/** Devolve o novo estado, ou null quando a conversa não existe mais. */
export function toggleFavorite(id: string): boolean | null {
  const sessions = readAll();
  const session = sessions.find(s => s.id === id);
  if (!session) return null;

  session.favorite = !session.favorite;
  store.set("sessions", sessions);

  // Desfavoritar pode empurrar a conversa para fora do teto; reaplicar a poda aqui
  // evita que ela só suma na próxima gravação, o que pareceria aleatório.
  if (!session.favorite) saveSession(session);
  return session.favorite;
}
