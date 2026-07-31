import { addMessage, inferKind, MailboxKind } from "../services/mailboxStore";
import { broadcastMailboxEvent } from "../services/server";

export async function sendToMobile(content: string, kind?: MailboxKind): Promise<string> {
  const resolvedKind = kind ?? inferKind(content);
  const { id } = addMessage("pc", { kind: resolvedKind, text: content, attachment: null });
  broadcastMailboxEvent("toMobile", id);
  return "Mandei pro seu celular.";
}
