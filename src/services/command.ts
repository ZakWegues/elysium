import { composeChatReply, decideBrain, noteFastRouted, BrainAction } from "./brain";
import { fastRoute } from "./fastRoute";
import { routeAction } from "../actions/router";

/** Pure command processor — no IPC, no window references. Safe to call from server or main. */
export async function processCommand(text: string): Promise<string> {
  // Comandos fechados ("pausa", "volume 40") não precisam de modelo nenhum. Além de
  // instantâneo, isso preserva a cota de tokens por minuto da Groq para os pedidos
  // que realmente exigem interpretação.
  const shortcut = fastRoute(text);
  const actions = shortcut ?? await decideBrain(text);
  if (shortcut) noteFastRouted(text, shortcut);

  const replies: string[] = [];

  for (const action of actions) {
    replies.push(await resolve(action, text));
  }

  return replies.filter(Boolean).join(" ");
}

/**
 * Conversa é resolvida em duas etapas: o roteador (modelo pequeno) só identifica que
 * o pedido é papo, e a resposta em si é escrita pelo modelo bom, com um prompt curto.
 * Isso mantém o prompt gigante de roteamento longe do modelo caro.
 */
async function resolve(action: BrainAction, userText: string): Promise<string> {
  if (action.action !== "chat") return routeAction(action);

  const composed = await composeChatReply(userText);
  if (composed) return composed;

  // A composição falhou (rede, cota). Se o roteador tiver mandado algum texto, ele
  // serve melhor que um erro seco.
  return action.reply?.trim() || "Não consegui responder isso agora.";
}
