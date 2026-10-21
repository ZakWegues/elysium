import { addFileMessage, addMessage, inferKind, MailboxKind } from "../services/mailboxStore";
import { sendPush } from "../services/push";
import { broadcastMailboxEvent } from "../services/server";

/** 21/10: manda um ARQUIVO do PC para a Caixa do celular, com push ("A Ely te mandou: x.pdf"). */
export async function sendFileToMobile(caminho: string, texto?: string): Promise<{ nome: string; sizeBytes: number }> {
  const r = await addFileMessage("pc", caminho, { text: texto ?? null });
  broadcastMailboxEvent("toMobile", r.id);
  void sendPush("mailbox", "A Ely te mandou um arquivo", r.nome, { tipo: "caixa", id: r.id }).catch(() => { /* best-effort */ });
  return { nome: r.nome, sizeBytes: r.sizeBytes };
}

export async function sendToMobile(content: string, kind?: MailboxKind): Promise<string> {
  const resolvedKind = kind ?? inferKind(content);
  const { id } = addMessage("pc", { kind: resolvedKind, text: content, attachment: null });
  broadcastMailboxEvent("toMobile", id);
  return "Mandei pro seu celular.";
}
