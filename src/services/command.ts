import { composeChatReply, decideBrain, noteFastRouted, recordAssistantReply, registrarTurnoUsuario, BrainAction } from "./brain";
import { fastRoute } from "./fastRoute";
import { agir } from "./agente";
import { ferramenta } from "./ferramentas";
import { routeAction } from "../actions/router";
import { trackUsage } from "./history";
import { getConfig } from "../main/config";
import type { Canal } from "./estiloResposta";

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
export type GanchosComando = {
  /** Ações decididas, antes de executar — para o rótulo "Abrindo o Chrome…". */
  onActions?: (actions: BrainAction[]) => void;
  /** Pedaço de resposta de conversa, conforme o modelo escreve. Só o `chat` emite. */
  onToken?: (token: string) => void;
  /**
   * Bloco 130: de onde veio o pedido. "voz" (padrão — microfone, áudio do celular) mantém
   * a resposta curta para falar; "texto" (chat digitado) responde como chat.
   */
  canal?: Canal;
};

export async function executarComando(
  text: string,
  ganchos: GanchosComando = {},
): Promise<ResultadoComando> {
  // Comandos fechados ("pausa", "volume 40") não precisam de modelo nenhum. Além de
  // instantâneo, isso preserva a cota de tokens por minuto da Groq para os pedidos
  // que realmente exigem interpretação.
  const shortcut = fastRoute(text);
  if (shortcut) noteFastRouted(text, shortcut);

  // O cérebro com ferramentas (bloco 78): olha o PC, age em etapas e escreve a resposta.
  // "CHAT" vira a composição de sempre (com streaming); falha do provedor cai no roteador
  // clássico logo abaixo — ele continua inteiro como rede de segurança.
  let actions: BrainAction[] | null = shortcut;
  let replyPronta: string | null = null;
  if (!shortcut && getConfig().cerebroFerramentas !== false) {
    registrarTurnoUsuario(text);
    const r = await agir(text, {
      canal: ganchos.canal,
      onChamada: (nome, args) => { const eq = ferramentaComoAcao(nome, args); if (eq) ganchos.onActions?.([eq]); },
    });
    if (r?.modo === "ferramentas") {
      actions = r.acoes.length ? r.acoes : [{ action: "chat" }];
      replyPronta = r.reply;
      // A resposta chega inteira; o dashboard e o celular esperam pedaços — um pedaço só.
      if (replyPronta) ganchos.onToken?.(replyPronta);
    } else if (r?.modo === "chat") {
      actions = [{ action: "chat" }];
    } else {
      actions = await decideBrain(text, true);
    }
  }
  if (!actions) actions = await decideBrain(text);
  ganchos.onActions?.(actions);

  const replies: string[] = [];
  if (replyPronta !== null) {
    replies.push(replyPronta);
    for (const action of actions) trackUsage(text, action);
  } else {
    for (const action of actions) {
      replies.push(await resolveAction(action, text, ganchos.onToken, ganchos.canal));
      trackUsage(text, action);
    }
  }

  const reply = replies.filter(Boolean).join(" ");
  // O histórico do cérebro guarda a RESPOSTA, não o resumo da ação: "e ele?" depois de
  // "quem foi Alan Turing" só funciona se o modelo souber o que ele mesmo disse. O atalho
  // já registrou o próprio turno em `noteFastRouted`.
  if (reply && !shortcut) recordAssistantReply(reply);

  return { actions, reply, atalho: shortcut !== null };
}

/** A ação equivalente a uma ferramenta, para o rótulo "Abrindo o Chrome…" enquanto ela roda. */
function ferramentaComoAcao(nome: string, args: Record<string, unknown>): BrainAction | null {
  return ferramenta(nome)?.acao?.(args) ?? null;
}

/** Só a resposta. É o contrato do `POST /api/command`. */
export async function processCommand(text: string, canal: Canal = "voz"): Promise<string> {
  return (await executarComando(text, { canal })).reply;
}

/** A resposta com os pedaços no caminho — o que o WebSocket do celular usa. */
export async function processCommandStream(text: string, onToken: (token: string) => void, canal: Canal = "voz"): Promise<string> {
  return (await executarComando(text, { onToken, canal })).reply;
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
export async function resolveAction(
  action: BrainAction,
  userText: string,
  onToken?: (token: string) => void,
  canal: Canal = "voz",
): Promise<string> {
  if (action.action !== "chat") return routeAction(action);

  const composed = await composeChatReply(userText, onToken, canal);
  if (composed) return composed;

  // A composição falhou (rede, cota). Se o roteador tiver mandado algum texto, ele
  // serve melhor que um erro seco.
  return action.reply?.trim() || "Não consegui responder isso agora.";
}
