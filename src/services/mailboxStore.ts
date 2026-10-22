import { app } from "electron";
import Store from "electron-store";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { EventEmitter } from "node:events";

/**
 * Async mailbox / self-chat thread between desktop and ELYSIUM-M (mobile).
 * Metadata (JSON) lives in electron-store; attachment bytes live on disk under
 * userData/mailbox-attachments — never inside the electron-store JSON blob.
 *
 * ## Conversas separadas (antes era UMA thread infinita)
 *
 * O lado da IA sempre teve sessões nomeadas, salváveis e apagáveis; o lado PC era uma
 * thread contínua que só crescia. Era por isso que ela nunca "abria onde parou" de forma
 * confiável: não havia onde parar, só um fim cada vez mais longe.
 *
 * Agora cada recado pertence a uma `sessionId`, e as sessões seguem exatamente a mesma
 * semântica do `chatSessionsStore.ts`: título derivado, favorito tira da poda, teto de 5
 * não-favoritadas, merge por `updatedAt` maior, e o PC é a autoridade.
 *
 * 🔴 A MIGRAÇÃO NASCE FAVORITADA. Todo recado que já existia vai para uma sessão
 * "Recados" marcada `favorite: true`. Sem isso, a primeira poda apagaria o histórico
 * inteiro do usuário no primeiro uso da feature — a retenção não sabe que aquela sessão
 * é a única que existia.
 */

export type MailboxKind = "link" | "note" | "file";
export type MailboxSender = "pc" | "mobile";

/** Anexo que chega em base64 (do celular, dentro do corpo de 8 MB do servidor). */
export const MAILBOX_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/**
 * 21/10: arquivo que sai do PC por caminho (a Ely, o arrastar do dashboard) é copiado em disco,
 * sem passar por base64 — vídeo e PDF grande cabem. O celular baixa pela rota `/raw`, em stream.
 */
export const MAILBOX_MAX_FILE_BYTES = 500 * 1024 * 1024;

const MIME_POR_EXTENSAO: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", rtf: "application/rtf",
  txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", heic: "image/heic", heif: "image/heif", svg: "image/svg+xml",
  mp4: "video/mp4", mkv: "video/x-matroska", mov: "video/quicktime", avi: "video/x-msvideo", webm: "video/webm", "3gp": "video/3gpp",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac",
  zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed", epub: "application/epub+zip",
};

/** O tipo do arquivo pelo nome; desconhecido = octet-stream. Pura. */
export function mimePorNome(nome: string): string {
  const ext = path.extname(nome).slice(1).toLowerCase();
  return MIME_POR_EXTENSAO[ext] ?? "application/octet-stream";
}

export class AttachmentTooLargeError extends Error {}

/** Fires "new-message" with the metadata item whenever a message is added, regardless of origin. */
export const mailboxEvents = new EventEmitter();

export interface MailboxAttachmentMeta {
  name: string;
  mimeType: string;
  sizeBytes: number;
}

interface MailboxAttachmentStored extends MailboxAttachmentMeta {
  filePath: string;
}

interface MailboxMessageStored {
  id: string;
  from: MailboxSender;
  kind: MailboxKind;
  text: string | null;
  attachment: MailboxAttachmentStored | null;
  createdAt: number;
  readAt: number | null;
  /** Opcional só no disco antigo: a migração preenche todas na primeira leitura. */
  sessionId?: string;
}

/** Uma conversa do lado PC. Mesmo formato da sessão do lado da IA, de propósito. */
export interface MailboxSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
}

/** O que a lista devolve: a sessão mais quantas mensagens ela tem. */
export interface MailboxSessionMeta extends MailboxSession {
  count: number;
}

export interface MailboxMessageMeta {
  id: string;
  from: MailboxSender;
  kind: MailboxKind;
  text: string | null;
  attachment: MailboxAttachmentMeta | null;
  createdAt: number;
  readAt: number | null;
  sessionId: string;
}

/** Só pro processo desktop (IPC) — inclui o path absoluto do anexo em disco. Nunca exponha isso por HTTP (mobile não precisa e não deve saber o filesystem local). */
export interface MailboxMessageMetaDesktop {
  id: string;
  from: MailboxSender;
  kind: MailboxKind;
  text: string | null;
  attachment: (MailboxAttachmentMeta & { filePath: string }) | null;
  createdAt: number;
  readAt: number | null;
  sessionId: string;
}

export interface MailboxMessageContent {
  id: string;
  from: MailboxSender;
  kind: MailboxKind;
  text: string | null;
  attachment: (MailboxAttachmentMeta & { base64: string }) | null;
}

export interface NewMailboxItemInput {
  kind: MailboxKind;
  text?: string | null;
  attachment?: { name: string; mimeType: string; base64: string } | null;
  /** 21/10: anexo já gravado em disco (ver `addFileMessage`). Só uso interno. */
  anexoPronto?: MailboxAttachmentStored | null;
  /** Sem isso, o recado cai na conversa aberta agora. */
  sessionId?: string | null;
}

/** Id apagado aqui que o celular ainda não confirmou ter apagado também. */
export interface MailboxTombstone { id: string; at: number; }

type MailboxStoreShape = {
  messages: MailboxMessageStored[];
  sessions: MailboxSession[];
  activeSessionId: string | null;
  /**
   * 🔴 LÁPIDES DO LADO PC. Chave nova dentro do mesmo arquivo — o nome do store não muda.
   *
   * Sem ela o ciclo era: o PC apaga → o celular sincroniza → o passo de
   * `mailbox.sessions.save` reempurra a conversa que ele ainda tem →
   * `mergeMailboxSession` recria → o `list` devolve ela viva. Na tela do PC isso aparece
   * como "sumiu e voltou". O §11 exige lápide nos DOIS sentidos; só existia a do celular.
   */
  deleted: MailboxTombstone[];
};

// 🔴 O NOME DO STORE NAO MUDA. `mailbox.json` ja existe em disco e no migrateUserData;
// renomear acordaria o aparelho atualizado sem dados. Chave NOVA dentro dele e seguro.
const store = new Store<MailboxStoreShape>({
  name: "mailbox",
  defaults: { messages: [], sessions: [], activeSessionId: null, deleted: [] },
});

/**
 * Teto e validade das lápides. Um celular que nunca mais sincroniza não pode fazer este
 * registro crescer para sempre; 180 dias é muito mais que a janela real de um aparelho
 * fora do ar.
 */
const MAX_TOMBSTONES = 200;
const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function lerLapides(): MailboxTombstone[] {
  const corte = Date.now() - TOMBSTONE_TTL_MS;
  return (store.get("deleted") ?? []).filter(t => t.at > corte).slice(-MAX_TOMBSTONES);
}

function gravarLapide(id: string): void {
  const atuais = lerLapides().filter(t => t.id !== id);
  atuais.push({ id, at: Date.now() });
  store.set("deleted", atuais.slice(-MAX_TOMBSTONES));
}

/** Uma conversa criada de novo com o mesmo id deixa de estar apagada. */
function tirarLapide(id: string): void {
  store.set("deleted", lerLapides().filter(t => t.id !== id));
}

function temLapide(id: string): boolean {
  return lerLapides().some(t => t.id === id);
}

/** Ids apagados no PC que o celular ainda precisa aplicar. Vai junto no `list`. */
export function listDeletedMailboxSessionIds(): string[] {
  return lerLapides().map(t => t.id);
}

/** Chamado pelo `mailbox.sessions.ackDeleted`, depois que o celular apagou a cópia dele. */
export function clearDeletedMailboxSessions(ids: string[]): number {
  const alvo = new Set(ids);
  const antes = lerLapides();
  const depois = antes.filter(t => !alvo.has(t.id));
  store.set("deleted", depois);
  return antes.length - depois.length;
}

/** Favoritar e o que tira uma conversa desta contagem. Mesma regra do lado da IA. */
const MAX_NON_FAVORITE_SESSIONS = 5;

/** Id da conversa que recebe tudo que existia antes das sessoes. */
const SESSAO_INICIAL = "mailbox-inicial";

/** Mesma regra usada no app mobile: sem esquema, começa com http(s):// → link; senão nota. */
export function inferKind(content: string): MailboxKind {
  return /^https?:\/\//i.test(content.trim()) ? "link" : "note";
}

function attachmentsDir(): string {
  const dir = path.join(app.getPath("userData"), "mailbox-attachments");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeFileName(name: string): string {
  const base = path.basename(name || "arquivo");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "arquivo";
}

/** Guarda contra passar um path arbitrário (fora da pasta de anexos) pros IPC handlers de copiar/salvar/abrir. */
export function isKnownAttachmentPath(candidate: string): boolean {
  const resolved = path.resolve(candidate);
  return path.dirname(resolved) === attachmentsDir();
}

function saveAttachment(
  id: string,
  att: { name: string; mimeType: string; base64: string },
): MailboxAttachmentStored {
  const buf = Buffer.from(att.base64, "base64");
  if (buf.length > MAILBOX_MAX_ATTACHMENT_BYTES) {
    throw new AttachmentTooLargeError("attachment too large, max 5MB");
  }
  const filePath = path.join(attachmentsDir(), `${id}-${sanitizeFileName(att.name)}`);
  fs.writeFileSync(filePath, buf);
  return { name: att.name, mimeType: att.mimeType, sizeBytes: buf.length, filePath };
}

function toAttachmentMeta(att: MailboxAttachmentStored | null): MailboxAttachmentMeta | null {
  if (!att) return null;
  return { name: att.name, mimeType: att.mimeType, sizeBytes: att.sizeBytes };
}

function toMeta(item: MailboxMessageStored): MailboxMessageMeta {
  return {
    id: item.id, from: item.from, kind: item.kind, text: item.text,
    attachment: toAttachmentMeta(item.attachment),
    createdAt: item.createdAt, readAt: item.readAt,
    sessionId: item.sessionId ?? SESSAO_INICIAL,
  };
}

function toDesktopMeta(item: MailboxMessageStored): MailboxMessageMetaDesktop {
  return {
    id: item.id, from: item.from, kind: item.kind, text: item.text,
    attachment: item.attachment
      ? { name: item.attachment.name, mimeType: item.attachment.mimeType, sizeBytes: item.attachment.sizeBytes, filePath: item.attachment.filePath }
      : null,
    createdAt: item.createdAt, readAt: item.readAt,
    sessionId: item.sessionId ?? SESSAO_INICIAL,
  };
}

/** Adiciona mensagem à conversa. `from:"mobile"` vem do endpoint HTTP; `from:"pc"` é chamada direto pelo processo desktop (voz/chat/self-chat). */
export function addMessage(from: MailboxSender, input: NewMailboxItemInput): { id: string; createdAt: number; sessionId: string } {
  garantirSessoes();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const attachment = input.anexoPronto ?? (input.attachment ? saveAttachment(id, input.attachment) : null);
  const sessionId = resolverSessao(input.sessionId ?? null);
  const item: MailboxMessageStored = {
    id, from, kind: input.kind,
    text: input.text?.trim() || null,
    attachment, createdAt, readAt: null, sessionId,
  };
  const items = store.get("messages");
  items.push(item);
  store.set("messages", items);
  tocarSessao(sessionId, createdAt, item.text);
  // Emite a variante desktop (com filePath) — este evento só é consumido dentro do
  // processo principal (main.ts encaminha pro renderer via IPC), nunca sai por HTTP.
  mailboxEvents.emit("new-message", toDesktopMeta(item));
  return { id, createdAt, sessionId };
}

/**
 * 21/10: manda um arquivo do disco para a conversa, por cópia (sem base64, até 500 MB). Quem
 * chama é o processo do PC — a Ely e o arrastar do dashboard. O id do recado nasce antes, para o
 * nome do arquivo copiado já sair com ele.
 */
export async function addFileMessage(from: MailboxSender, caminho: string, opts: { text?: string | null; sessionId?: string | null } = {}): Promise<{ id: string; createdAt: number; sessionId: string; nome: string; sizeBytes: number }> {
  const st = await fs.promises.stat(caminho);
  if (!st.isFile()) throw new Error("não é um arquivo");
  if (st.size > MAILBOX_MAX_FILE_BYTES) throw new AttachmentTooLargeError("arquivo maior que 500 MB");
  const nome = path.basename(caminho);
  const temporario = crypto.randomUUID();
  const destino = path.join(attachmentsDir(), `${temporario}-${sanitizeFileName(nome)}`);
  await fs.promises.copyFile(caminho, destino);
  const anexo: MailboxAttachmentStored = { name: nome, mimeType: mimePorNome(nome), sizeBytes: st.size, filePath: destino };
  try {
    const r = addMessage(from, { kind: "file", text: opts.text ?? null, sessionId: opts.sessionId ?? null, anexoPronto: anexo });
    return { ...r, nome, sizeBytes: st.size };
  } catch (e) {
    fs.rmSync(destino, { force: true });
    throw e;
  }
}

/** O upload terminou antes do tamanho anunciado (a conexão caiu) ou passou dele. */
export class UploadIncompletoError extends Error {}

/**
 * 22/10: arquivo grande do celular (até 500 MB), em stream direto para o disco — sem base64 e
 * sem passar pela memória. `tamanho` é o Content-Length: o arquivo tem que bater com ele.
 * Qualquer falha no meio apaga o parcial.
 */
export async function receberUpload(
  from: MailboxSender,
  corpo: AsyncIterable<Buffer | string>,
  nome: string,
  tamanho: number,
  opts: { mimeType?: string | null; text?: string | null; sessionId?: string | null } = {},
): Promise<{ id: string; createdAt: number; sessionId: string; nome: string; sizeBytes: number }> {
  if (!Number.isInteger(tamanho) || tamanho <= 0) throw new UploadIncompletoError("tamanho inválido");
  if (tamanho > MAILBOX_MAX_FILE_BYTES) throw new AttachmentTooLargeError("arquivo maior que 500 MB");
  const limpo = sanitizeFileName(nome);
  const destino = path.join(attachmentsDir(), `${crypto.randomUUID()}-${limpo}`);
  const saida = fs.createWriteStream(destino, { flags: "wx" });
  let recebidos = 0;
  try {
    for await (const pedaco of corpo) {
      const buf = Buffer.isBuffer(pedaco) ? pedaco : Buffer.from(pedaco);
      recebidos += buf.length;
      if (recebidos > tamanho) throw new UploadIncompletoError("veio mais do que o anunciado");
      if (!saida.write(buf)) await new Promise<void>((r) => saida.once("drain", r));
    }
    await new Promise<void>((ok, erro) => { saida.end((e?: Error | null) => (e ? erro(e) : ok())); });
    if (recebidos !== tamanho) throw new UploadIncompletoError(`chegaram ${recebidos} de ${tamanho} bytes`);
    const mime = opts.mimeType && /^[\w.+-]+\/[\w.+-]+$/.test(opts.mimeType) && opts.mimeType !== "application/octet-stream" ? opts.mimeType : mimePorNome(limpo);
    const anexo: MailboxAttachmentStored = { name: limpo, mimeType: mime, sizeBytes: recebidos, filePath: destino };
    const r = addMessage(from, { kind: "file", text: opts.text ?? null, sessionId: opts.sessionId ?? null, anexoPronto: anexo });
    return { ...r, nome: limpo, sizeBytes: recebidos };
  } catch (e) {
    // No Windows o arquivo aberto não sai: fecha antes de apagar.
    if (!saida.closed) await new Promise<void>((r) => { saida.once("close", () => r()); saida.destroy(); });
    await fs.promises.rm(destino, { force: true }).catch(() => {});
    throw e;
  }
}

/** O arquivo de um anexo, para a rota `/raw` mandar em stream. undefined = sem anexo ou sumiu. */
export function getAttachmentFile(id: string): { filePath: string; name: string; mimeType: string; sizeBytes: number } | undefined {
  const item = store.get("messages").find(i => i.id === id);
  if (!item?.attachment || !isKnownAttachmentPath(item.attachment.filePath)) return undefined;
  if (!fs.existsSync(item.attachment.filePath)) return undefined;
  const mime = !item.attachment.mimeType || item.attachment.mimeType === "application/octet-stream" ? mimePorNome(item.attachment.name) : item.attachment.mimeType;
  return { filePath: item.attachment.filePath, name: item.attachment.name, mimeType: mime, sizeBytes: item.attachment.sizeBytes };
}

export function listMessages(sessionId?: string | null): MailboxMessageMeta[] {
  garantirSessoes();
  const todas = store.get("messages");
  // Sem filtro devolve a thread inteira, como sempre devolveu. É isso que mantém um app
  // antigo (que não conhece sessão) funcionando contra um PC já atualizado.
  const filtradas = sessionId ? todas.filter(m => (m.sessionId ?? SESSAO_INICIAL) === sessionId) : todas;
  return filtradas.map(toMeta);
}

/** Mesma thread, mas com filePath do anexo — só pra consumo interno do processo desktop (IPC), nunca por HTTP. */
export function listMessagesForDesktop(sessionId?: string | null): MailboxMessageMetaDesktop[] {
  garantirSessoes();
  const todas = store.get("messages");
  const filtradas = sessionId ? todas.filter(m => (m.sessionId ?? SESSAO_INICIAL) === sessionId) : todas;
  return filtradas.map(toDesktopMeta);
}

export function getMessageContent(id: string): MailboxMessageContent | undefined {
  const item = store.get("messages").find((i) => i.id === id);
  if (!item) return undefined;
  let attachment: (MailboxAttachmentMeta & { base64: string }) | null = null;
  if (item.attachment) {
    let base64 = "";
    // Arquivo grande (vídeo, PDF pesado) não vira base64: o app novo baixa pela rota `/raw`;
    // o antigo recebe vazio e mostra que não deu, em vez de o PC carregar 500 MB na memória.
    if (item.attachment.sizeBytes <= MAILBOX_MAX_ATTACHMENT_BYTES) {
      try { base64 = fs.readFileSync(item.attachment.filePath).toString("base64"); } catch { /* anexo sumiu do disco */ }
    }
    attachment = { ...toAttachmentMeta(item.attachment)!, base64 };
  }
  return { id: item.id, from: item.from, kind: item.kind, text: item.text, attachment };
}

export function ackMessage(id: string): boolean {
  const items = store.get("messages");
  const item = items.find((i) => i.id === id);
  if (!item) return false;
  item.readAt = Date.now();
  store.set("messages", items);
  return true;
}

/** Boot-check: marca readAt nas mensagens vindas do celular ainda não vistas pelo PC. Retorna as que acabaram de ser marcadas. */
export function checkAndMarkUnseenFromMobile(): MailboxMessageMeta[] {
  const items = store.get("messages");
  const pending = items.filter((i) => i.from === "mobile" && i.readAt == null);
  if (pending.length === 0) return [];
  const now = Date.now();
  for (const i of pending) i.readAt = now;
  store.set("messages", items);
  return pending.map(toMeta);
}

// ── Conversas do lado PC ──────────────────────────────────────────────────────
//
// O desenho inteiro é o do `chatSessionsStore.ts`, de propósito. O usuário aprende a
// regra uma vez (favoritar tira da poda, apagar apaga mesmo, o PC manda) e ela vale nos
// dois lados do switch. Divergir aqui seria pior que não ter a feature.

/**
 * Sufixo aleatório: só o carimbo de tempo colidiria se PC e celular criassem uma
 * conversa no mesmo milissegundo, e o merge trataria as duas como a mesma.
 */
export function newMailboxSessionId(): string {
  return `mbox-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

/** Primeira linha do primeiro recado, truncada — mesmo critério do lado da IA. */
export function deriveMailboxTitle(texto: string | null | undefined): string {
  const t = (texto ?? "").trim();
  if (!t) return "Novos recados";
  return t.length > 40 ? `${t.slice(0, 40)}...` : t;
}

/**
 * Cria a conversa de migração e carimba nela tudo que existia antes das sessões.
 *
 * Barata e idempotente: sai na primeira linha quando não há mensagem órfã. Pode ser
 * chamada de qualquer entrada pública sem medo.
 *
 * 🔴 O GATILHO É A MENSAGEM ÓRFÃ, NUNCA "a lista de conversas está vazia".
 *
 * Enquanto o teste era `sessions.length > 0 && orfas.length === 0`, apagar a última
 * conversa deixava a lista vazia e a leitura seguinte recriava "Recados" na hora — a
 * linha sumia e voltava, e não havia como apagar a última conversa. Lista vazia é um
 * estado legítimo: o próximo recado cria a conversa dele pelo `resolverSessao`.
 */
function garantirSessoes(): void {
  const sessions = store.get("sessions") ?? [];
  const messages = store.get("messages");
  const orfas = messages.filter(m => !m.sessionId);
  if (orfas.length === 0) return;

  let base = sessions.find(s => s.id === SESSAO_INICIAL);
  if (!base) {
    const nascimento = messages.length > 0 ? messages[0].createdAt : Date.now();
    base = {
      id: SESSAO_INICIAL,
      title: "Recados",
      createdAt: nascimento,
      updatedAt: nascimento,
      // 🔴 Favoritada de saída: é a única conversa que existe no momento da migração, e
      // uma poda que a alcançasse apagaria o histórico inteiro do usuário de uma vez.
      favorite: true,
    };
    sessions.push(base);
  }

  if (orfas.length > 0) {
    for (const m of orfas) m.sessionId = SESSAO_INICIAL;
    base.updatedAt = Math.max(base.updatedAt, ...orfas.map(m => m.createdAt));
    store.set("messages", messages);
  }
  store.set("sessions", sessions);
}

function lerSessoes(): MailboxSession[] {
  garantirSessoes();
  return store.get("sessions");
}

/** Qual conversa recebe um recado que não disse a qual pertence. */
function resolverSessao(pedida: string | null): string {
  const sessions = store.get("sessions");
  if (pedida && sessions.some(s => s.id === pedida)) return pedida;

  const ativa = store.get("activeSessionId");
  if (ativa && sessions.some(s => s.id === ativa)) return ativa;

  // Sem ativa válida, cai na mais recente. Criar uma nova aqui faria cada recado sem
  // sessão nascer sozinho numa conversa própria, que é o oposto do que se pediu.
  const recente = sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (recente) return recente.id;

  return criarSessaoInterna("Novos recados").id;
}

/** Sobe o `updatedAt` e, se a conversa ainda não tem nome próprio, dá título a ela. */
function tocarSessao(id: string, quando: number, texto: string | null): void {
  const sessions = store.get("sessions");
  const s = sessions.find(x => x.id === id);
  if (!s) return;
  s.updatedAt = Math.max(s.updatedAt, quando);
  if (!s.title || s.title === "Novos recados") s.title = deriveMailboxTitle(texto);
  store.set("sessions", sessions);
}

function criarSessaoInterna(title?: string): MailboxSession {
  const agora = Date.now();
  // Ids têm sufixo aleatório, então colidir com um apagado é improvável — mas criar de
  // propósito é o oposto de apagar, e a lápide não pode sobreviver a isso.
  const nova: MailboxSession = {
    id: newMailboxSessionId(),
    title: (title ?? "").trim() || "Novos recados",
    createdAt: agora,
    updatedAt: agora,
    favorite: false,
  };
  const sessions = store.get("sessions");
  sessions.push(nova);
  tirarLapide(nova.id);
  store.set("sessions", sessions);
  store.set("activeSessionId", nova.id);
  podarSessoes();
  return nova;
}

/** Apaga do disco o anexo de uma mensagem. Nunca lança: anexo já sumido não é erro. */
function apagarAnexo(item: MailboxMessageStored): void {
  if (!item.attachment?.filePath) return;
  try { fs.rmSync(item.attachment.filePath, { force: true }); }
  catch (e) { console.error("[mailbox] falha ao apagar anexo:", e); }
}

/**
 * Retenção: favoritas ilimitadas, das demais só as 5 mais recentes.
 *
 * 🔴 Apagar a conversa apaga as mensagens dela E os anexos em disco. Sem isso o
 * `mailbox-attachments` acumularia arquivo que nenhuma mensagem referencia — o JSON
 * encolheria e a pasta só cresceria.
 */
function podarSessoes(): void {
  const sessions = store.get("sessions");
  const sobrando = sessions
    .filter(s => !s.favorite)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(MAX_NON_FAVORITE_SESSIONS);
  if (sobrando.length === 0) return;

  const mortas = new Set(sobrando.map(s => s.id));
  const messages = store.get("messages");
  for (const m of messages) {
    if (mortas.has(m.sessionId ?? SESSAO_INICIAL)) apagarAnexo(m);
  }
  store.set("messages", messages.filter(m => !mortas.has(m.sessionId ?? SESSAO_INICIAL)));
  store.set("sessions", sessions.filter(s => !mortas.has(s.id)));

  const ativa = store.get("activeSessionId");
  if (ativa && mortas.has(ativa)) store.set("activeSessionId", null);
}

/** Mais recentes primeiro, com a contagem de recados de cada uma. */
export function listMailboxSessions(): MailboxSessionMeta[] {
  const sessions = lerSessoes();
  const messages = store.get("messages");
  const contagem = new Map<string, number>();
  for (const m of messages) {
    const sid = m.sessionId ?? SESSAO_INICIAL;
    contagem.set(sid, (contagem.get(sid) ?? 0) + 1);
  }
  return sessions
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(s => ({ ...s, count: contagem.get(s.id) ?? 0 }));
}

export function getMailboxSession(id: string): MailboxSessionMeta | null {
  return listMailboxSessions().find(s => s.id === id) ?? null;
}

export function createMailboxSession(title?: string): MailboxSessionMeta {
  garantirSessoes();
  return { ...criarSessaoInterna(title), count: 0 };
}

export function renameMailboxSession(id: string, title: string): MailboxSessionMeta | null {
  const sessions = lerSessoes();
  const s = sessions.find(x => x.id === id);
  if (!s) return null;
  const limpo = title.trim().slice(0, 60);
  if (!limpo) return getMailboxSession(id);
  s.title = limpo;
  // Renomear NÃO sobe o `updatedAt`: ele é o critério de conflito da sincronização e a
  // ordem da lista. Trocar o nome não é atividade nova na conversa.
  store.set("sessions", sessions);
  return getMailboxSession(id);
}

/** Devolve o novo estado, ou null quando a conversa não existe mais. */
export function toggleMailboxSessionFavorite(id: string): boolean | null {
  const sessions = lerSessoes();
  const s = sessions.find(x => x.id === id);
  if (!s) return null;
  s.favorite = !s.favorite;
  store.set("sessions", sessions);
  // Desfavoritar pode empurrar a conversa para fora do teto. Podar aqui evita que ela
  // suma só no próximo recado, o que pareceria aleatório.
  if (!s.favorite) podarSessoes();
  return s.favorite;
}

export function getActiveMailboxSessionId(): string {
  garantirSessoes();
  // 🔴 Ler qual conversa está ativa não pode CRIAR conversa. Com a lista legitimamente
  // vazia (o usuário apagou todas), o `resolverSessao` fazia nascer uma "Novos recados"
  // sozinha na volta do dashboard — a conversa apagada parecia voltar com outro nome.
  // Vazio é a resposta honesta; quem lê trata como "o PC decide", que é o que já fazia.
  if (store.get("sessions").length === 0) return "";
  return resolverSessao(null);
}

export function setActiveMailboxSession(id: string): boolean {
  const sessions = lerSessoes();
  if (!sessions.some(s => s.id === id)) return false;
  store.set("activeSessionId", id);
  return true;
}

/** 🔴 DESTRUTIVO. Apaga a conversa, as mensagens dela e os anexos em disco. */
export function deleteMailboxSession(id: string): boolean {
  const sessions = lerSessoes();
  // A lápide entra mesmo quando a conversa já não está aqui: o celular pode ter uma cópia
  // que o PC perdeu na poda, e sem o registro ela voltaria no próximo `save`.
  gravarLapide(id);
  if (!sessions.some(s => s.id === id)) return false;

  const messages = store.get("messages");
  for (const m of messages) {
    if ((m.sessionId ?? SESSAO_INICIAL) === id) apagarAnexo(m);
  }
  store.set("messages", messages.filter(m => (m.sessionId ?? SESSAO_INICIAL) !== id));
  store.set("sessions", sessions.filter(s => s.id !== id));
  if (store.get("activeSessionId") === id) store.set("activeSessionId", null);
  return true;
}

/** 🔴 DESTRUTIVO. Apaga um recado só — o DELETE que faltava no contrato (§16 C15). */
export function deleteMailboxMessage(id: string): boolean {
  garantirSessoes();
  const messages = store.get("messages");
  const alvo = messages.find(m => m.id === id);
  if (!alvo) return false;
  apagarAnexo(alvo);
  store.set("messages", messages.filter(m => m.id !== id));
  return true;
}

/**
 * Aplica uma conversa vinda do celular. Vence quem tem `updatedAt` maior, decidido aqui
 * — o PC é a autoridade. O `createdAt` guardado é preservado: o celular pode não saber
 * quando a conversa nasceu.
 */
export function mergeMailboxSession(incoming: MailboxSession): MailboxSessionMeta | null {
  // 🔴 LÁPIDE ANTES DE TUDO. O celular empurra todas as conversas que ele tem, inclusive
  // as que o PC acabou de apagar — ele só descobre a exclusão no `list` do passo
  // seguinte. Sem esta recusa o `save` ressuscitaria a conversa um passo antes de o
  // celular saber que ela morreu.
  if (temLapide(incoming.id)) return null;

  const sessions = lerSessoes();
  const existente = sessions.find(s => s.id === incoming.id);

  if (existente) {
    if (existente.updatedAt < incoming.updatedAt) {
      existente.title = incoming.title || existente.title;
      existente.updatedAt = incoming.updatedAt;
      existente.favorite = !!incoming.favorite;
      store.set("sessions", sessions);
      if (!existente.favorite) podarSessoes();
    }
    return getMailboxSession(incoming.id) ?? { ...existente, count: 0 };
  }

  sessions.push({
    id: incoming.id,
    title: incoming.title || "Novos recados",
    createdAt: incoming.createdAt || Date.now(),
    updatedAt: incoming.updatedAt || Date.now(),
    favorite: !!incoming.favorite,
  });
  store.set("sessions", sessions);
  podarSessoes();
  return getMailboxSession(incoming.id) ?? { ...incoming, count: 0 };
}
