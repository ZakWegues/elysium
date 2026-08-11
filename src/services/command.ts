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
    replies.push(await resolveAction(action, text));
  }

  return replies.filter(Boolean).join(" ");
}

/**
 * Executa uma ação e devolve o que falar.
 *
 * **Use isto, nunca `routeAction` direto**, em qualquer caminho que responda ao
 * usuário — voz, chat do dashboard, ou celular. Conversa é resolvida em duas etapas: o
 * roteador só identifica que o pedido é papo, e a resposta é escrita depois pelo modelo
 * bom, com um prompt curto. Quem chama `routeAction` sozinho recebe string vazia para
 * conversa, e o assistente fica mudo — foi exatamente o que aconteceu com o dashboard
 * quando as duas etapas foram criadas e só este arquivo foi atualizado.
 */
export async function resolveAction(action: BrainAction, userText: string): Promise<string> {
  if (action.action !== "chat") return routeAction(action);

  const composed = await composeChatReply(userText);
  if (composed) return composed;

  // A composição falhou (rede, cota). Se o roteador tiver mandado algum texto, ele
  // serve melhor que um erro seco.
  return action.reply?.trim() || "Não consegui responder isso agora.";
}
