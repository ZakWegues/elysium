import { composeChatReply, decideBrain, noteFastRouted, recordAssistantReply, BrainAction } from "./brain";
import { fastRoute } from "./fastRoute";
import { routeAction } from "../actions/router";
import { trackUsage } from "./history";

export type ResultadoComando = {
  actions: BrainAction[];
  /** O que falar/mostrar. Vazio só quando nenhuma ação produziu texto. */
  reply: string;
  /** Verdadeiro quando o pedido resolveu no `fastRoute`, sem passar pelo modelo. */
  atalho: boolean;
};

/**
 * O pipeline inteiro de um pedido, sem IPC nem janela — o mesmo para voz, chat do
 * dashboard e celular.
 *
 * Existia em duas cópias: esta (celular) e uma inline no `main.ts` (voz e dashboard). A
 * cópia do `main.ts` chamava `decideBrain` direto e NUNCA passou pelo `fastRoute`: "pausa"
 * dito ao microfone pagava uma chamada de modelo que o celular não pagava. Um caminho só,
 * e o `main.ts` fica com o que é dele — janela, bandeja, voz.
 *
 * `onActions` roda assim que as ações estão decididas e antes de executar: é o que o
 * dashboard usa para mostrar o rótulo "Abrindo o Chrome…" enquanto o executor trabalha.
 */
export async function executarComando(
  text: string,
  onActions?: (actions: BrainAction[]) => void,
): Promise<ResultadoComando> {
  // Comandos fechados ("pausa", "volume 40") não precisam de modelo nenhum. Além de
  // instantâneo, isso preserva a cota de tokens por minuto da Groq para os pedidos
  // que realmente exigem interpretação.
  const shortcut = fastRoute(text);
  const actions = shortcut ?? await decideBrain(text);
  if (shortcut) noteFastRouted(text, shortcut);
  onActions?.(actions);

  const replies: string[] = [];
  for (const action of actions) {
    replies.push(await resolveAction(action, text));
    trackUsage(text, action);
  }

  const reply = replies.filter(Boolean).join(" ");
  // O histórico do cérebro guarda a RESPOSTA, não o resumo da ação: "e ele?" depois de
  // "quem foi Alan Turing" só funciona se o modelo souber o que ele mesmo disse. O atalho
  // já registrou o próprio turno em `noteFastRouted`.
  if (reply && !shortcut) recordAssistantReply(reply);

  return { actions, reply, atalho: shortcut !== null };
}

/** Só a resposta. É o contrato do `POST /api/command` e do WebSocket do celular. */
export async function processCommand(text: string): Promise<string> {
  return (await executarComando(text)).reply;
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
