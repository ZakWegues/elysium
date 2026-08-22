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
  /**
   * Nome dado à mão. Sem esta marca, a próxima mensagem sobrescreveria o título com o
   * `deriveTitle` da primeira fala e o renomear duraria até o usuário responder.
   */
  titleCustom?: boolean;
}

/** Id apagado aqui que o celular ainda não confirmou ter apagado também. */
export interface ChatTombstone { id: string; at: number; }

/** Favoritar é o que tira uma conversa desta contagem. */
const MAX_NON_FAVORITE_SESSIONS = 5;

/**
 * 🔴 LÁPIDES DO LADO PC. A exclusão feita aqui precisa ficar REGISTRADA, não só sumir
 * da lista.
 *
 * Sem o registro o ciclo era: o PC apaga → o celular sincroniza → o passo de `chat.save`
 * reempurra a conversa que ele ainda tem → `mergeSession` recria → o `chat.list` devolve
 * ela viva. Na tela do PC isso aparece como "sumiu e voltou". O §11 sempre exigiu lápide
 * nos DOIS sentidos; só existia a do celular para o PC.
 *
 * A lápide sai depois do `chat.ackDeleted`, quando o celular confirma que apagou a cópia
 * dele — nunca antes.
 */
const store = new Store<{ sessions: ChatSession[]; deleted: ChatTombstone[] }>({
  name: "chat-sessions",
  defaults: { sessions: [], deleted: [] },
});

/**
 * Teto e validade das lápides. Um celular que nunca mais sincroniza não pode fazer este
 * registro crescer para sempre; 180 dias é muito mais que a janela real de um aparelho
 * fora do ar, e passar disso significa que a conversa já saiu da poda de 5 há muito tempo.
 */
const MAX_TOMBSTONES = 200;
const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function readTombstones(): ChatTombstone[] {
  const corte = Date.now() - TOMBSTONE_TTL_MS;
  return (store.get("deleted") ?? []).filter(t => t.at > corte).slice(-MAX_TOMBSTONES);
}

function addTombstone(id: string): void {
  const atuais = readTombstones().filter(t => t.id !== id);
  atuais.push({ id, at: Date.now() });
  store.set("deleted", atuais.slice(-MAX_TOMBSTONES));
}

/** Uma conversa recriada com o mesmo id deixa de estar apagada. */
function dropTombstone(id: string): void {
  store.set("deleted", readTombstones().filter(t => t.id !== id));
}

function isTombstoned(id: string): boolean {
  return readTombstones().some(t => t.id === id);
}

/** Ids apagados no PC que o celular ainda precisa aplicar. Vai junto no `chat.list`. */
export function listDeletedIds(): string[] {
  return readTombstones().map(t => t.id);
}

/** Chamado pelo `chat.ackDeleted`, depois que o celular apagou a cópia dele. */
export function clearDeleted(ids: string[]): number {
  const alvo = new Set(ids);
  const antes = readTombstones();
  const depois = antes.filter(t => !alvo.has(t.id));
  store.set("deleted", depois);
  return antes.length - depois.length;
}

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
  // Gravar de propósito é o oposto de apagar: se este id tinha lápide, ela sai agora.
  // Só chega aqui pelo PC ou por um `merge` que já passou pelo teste da lápide.
  dropTombstone(session.id);
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
      // Título dado à mão vence o derivado. Sem isto o renomear duraria até a próxima
      // mensagem, que é o mesmo que não existir.
      title:     existing?.titleCustom ? existing.title : deriveTitle(messages),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      favorite:  existing?.favorite  ?? false,
      titleCustom: existing?.titleCustom,
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
export function mergeSession(incoming: ChatSession): ChatSession | null {
  // 🔴 LÁPIDE ANTES DE TUDO. O celular empurra todas as conversas que ele tem, inclusive
  // as que o PC acabou de apagar — ele só descobre a exclusão no `chat.list` do passo
  // seguinte. Sem esta recusa o `save` ressuscitaria a conversa um passo antes de o
  // celular saber que ela morreu, e a lista devolvida traria ela de volta viva.
  if (isTombstoned(incoming.id)) return null;

  const existing = getSession(incoming.id);
  if (existing && existing.updatedAt >= incoming.updatedAt) return existing;

  return saveSession({
    ...incoming,
    // Preserva a origem da conversa: o celular pode não saber quando ela nasceu.
    createdAt: existing?.createdAt ?? incoming.createdAt ?? Date.now(),
    title: incoming.title || deriveTitle(incoming.messages),
    titleCustom: incoming.titleCustom ?? existing?.titleCustom,
  });
}

/**
 * Renomear NÃO sobe o `updatedAt`: ele é o critério de conflito da sincronização e a
 * ordem da lista. Trocar o nome não é atividade nova na conversa. Mesma regra do
 * `renameMailboxSession` do outro lado do switch.
 */
export function renameSession(id: string, title: string): ChatSession | null {
  const sessions = readAll();
  const session = sessions.find(s => s.id === id);
  if (!session) return null;

  const limpo = title.trim().slice(0, 60);
  if (!limpo) return session;
  session.title = limpo;
  session.titleCustom = true;
  store.set("sessions", sessions);
  return session;
}

export function deleteSession(id: string): boolean {
  const sessions = readAll();
  const next = sessions.filter(s => s.id !== id);
  // A lápide entra mesmo quando a conversa já não estava aqui: o celular pode ter uma
  // cópia que o PC perdeu na poda, e sem o registro ela voltaria no próximo `chat.save`.
  addTombstone(id);
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
