import { app } from "electron";
import Store from "electron-store";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { EventEmitter } from "node:events";

/**
 * Async mailbox / self-chat thread between desktop and NEUROAXIS Portal (mobile).
 * Single ordered thread, each message tagged with its origin (`from`).
 * Metadata (JSON) lives in electron-store; attachment bytes live on disk under
 * userData/mailbox-attachments — never inside the electron-store JSON blob.
 */

export type MailboxKind = "link" | "note" | "file";
export type MailboxSender = "pc" | "mobile";

export const MAILBOX_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

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
}

export interface MailboxMessageMeta {
  id: string;
  from: MailboxSender;
  kind: MailboxKind;
  text: string | null;
  attachment: MailboxAttachmentMeta | null;
  createdAt: number;
  readAt: number | null;
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
}

type MailboxStoreShape = { messages: MailboxMessageStored[] };

const store = new Store<MailboxStoreShape>({
  name: "mailbox",
  defaults: { messages: [] },
});

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
  };
}

function toDesktopMeta(item: MailboxMessageStored): MailboxMessageMetaDesktop {
  return {
    id: item.id, from: item.from, kind: item.kind, text: item.text,
    attachment: item.attachment
      ? { name: item.attachment.name, mimeType: item.attachment.mimeType, sizeBytes: item.attachment.sizeBytes, filePath: item.attachment.filePath }
      : null,
    createdAt: item.createdAt, readAt: item.readAt,
  };
}

/** Adiciona mensagem à thread. `from:"mobile"` é criada pelo endpoint HTTP; `from:"pc"` é chamada direto pelo processo desktop (voz/chat/self-chat). */
export function addMessage(from: MailboxSender, input: NewMailboxItemInput): { id: string; createdAt: number } {
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const attachment = input.attachment ? saveAttachment(id, input.attachment) : null;
  const item: MailboxMessageStored = {
    id, from, kind: input.kind,
    text: input.text?.trim() || null,
    attachment, createdAt, readAt: null,
  };
  const items = store.get("messages");
  items.push(item);
  store.set("messages", items);
  // Emite a variante desktop (com filePath) — este evento só é consumido dentro do
  // processo principal (main.ts encaminha pro renderer via IPC), nunca sai por HTTP.
  mailboxEvents.emit("new-message", toDesktopMeta(item));
  return { id, createdAt };
}

export function listMessages(): MailboxMessageMeta[] {
  return store.get("messages").map(toMeta);
}

/** Mesma thread, mas com filePath do anexo — só pra consumo interno do processo desktop (IPC), nunca por HTTP. */
export function listMessagesForDesktop(): MailboxMessageMetaDesktop[] {
  return store.get("messages").map(toDesktopMeta);
}

export function getMessageContent(id: string): MailboxMessageContent | undefined {
  const item = store.get("messages").find((i) => i.id === id);
  if (!item) return undefined;
  let attachment: (MailboxAttachmentMeta & { base64: string }) | null = null;
  if (item.attachment) {
    let base64 = "";
    try { base64 = fs.readFileSync(item.attachment.filePath).toString("base64"); } catch { /* anexo sumiu do disco */ }
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
