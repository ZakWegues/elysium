import { getConfig, setOverride } from "../main/config";
import { composeChatReply, decideBrain, type BrainAction } from "./brain";
import { searchWeb } from "./webSearch";
import type { Canal } from "./estiloResposta";

/**
 * Modo sem censura (05/11, pedido do dono). Dois níveis:
 *
 * · **pesquisa** (padrão): a conversa é escrita pelo modelo local sem censura
 *   (qwen3.5-heretic:4b), mas a pesquisa continua no Gemini — ele busca e resume, e o local
 *   escreve a resposta por cima. Ações (lembrete, abrir app, tela…) seguem pelo roteador. O
 *   Gemini ainda vê o pedido (para classificar e pesquisar).
 * · **só o PC** (`semCensuraSoLocal`): NADA vai para o Gemini. Tudo é respondido pelo modelo
 *   local, do próprio conhecimento, sem pesquisa na web e sem a classificação do roteador —
 *   para o caso em que o Gemini recusava antes de o local responder. Atalhos diretos ("pausa",
 *   "volume 40") ainda valem porque o `fastRoute` resolve antes, sem modelo.
 */

/** Liga ou desliga pela fala/chat: "modo sem censura", "desliga o modo sem censura", "modo com censura". Pura. */
export function pedidoDeModoCensura(texto: string): boolean | null {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.!?,]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(?:(?:liga|ligar|ativa|ativar|entra no|entrar no|coloca no|bota no)\s+(?:o\s+)?)?modo sem censura$/.test(t)) return true;
  if (/^(?:(?:desliga|desligar|desativa|desativar|sai do|sair do|tira o)\s+(?:o\s+)?)modo sem censura$/.test(t)) return false;
  if (/^(?:(?:liga|ativa|volta pro|volta para o|coloca no|bota no)\s+(?:o\s+)?)?modo com censura$/.test(t)) return false;
  return null;
}

export function trocarModoCensura(ligar: boolean): string {
  setOverride({ semCensura: ligar });
  if (!ligar) return "Modo sem censura desligado. Voltei ao cérebro de sempre.";
  return getConfig().semCensuraSoLocal === true
    ? "Modo sem censura ligado, só o PC. Tudo fica no modelo deste PC; nada vai para o Gemini, nem a pesquisa."
    : "Modo sem censura ligado. A conversa fica no modelo deste PC; pesquisa e ações continuam como antes.";
}

/** Ações que o modelo local responde sozinho: conversa, ou o roteador sem saber o que é. */
function soConversa(acoes: BrainAction[]): boolean {
  return acoes.every(a => a.action === "chat" || a.action === "unknown");
}

/**
 * Responde o pedido no modo sem censura. `reply` pronto → acabou; senão, `acoes` são as ações
 * que o roteador decidiu e que o fluxo normal executa. O turno do usuário já foi registrado.
 */
export async function responderSemCensura(
  texto: string,
  canal: Canal,
  onToken?: (t: string) => void,
): Promise<{ reply: string | null; acoes: BrainAction[] }> {
  // "Só o PC": nem classifica no Gemini — responde tudo no local, do próprio conhecimento.
  // O turno já foi registrado por quem chamou (command.ts), como no caminho de baixo.
  if (getConfig().semCensuraSoLocal === true) {
    const reply = await composeChatReply(texto, onToken, canal, {});
    return { reply: reply ?? "O modelo deste PC não respondeu agora. O Ollama está aberto?", acoes: [{ action: "chat" }] };
  }

  const acoes = await decideBrain(texto, true);
  if (soConversa(acoes)) {
    const reply = await composeChatReply(texto, onToken, canal, {});
    return { reply: reply ?? "O modelo deste PC não respondeu agora. O Ollama está aberto?", acoes: [{ action: "chat" }] };
  }
  const busca = acoes.length === 1 && acoes[0].action === "web_search" ? acoes[0] : null;
  if (busca) {
    // O Gemini pesquisa (e registra as fontes); o local escreve a resposta final.
    let pesquisa = "";
    try { pesquisa = await searchWeb(busca.query); } catch (e) { console.warn("[semCensura] a pesquisa falhou:", e); }
    const reply = await composeChatReply(texto, onToken, canal, { pesquisa: pesquisa || undefined });
    return { reply: reply ?? (pesquisa || "Não consegui responder isso agora."), acoes };
  }
  return { reply: null, acoes };
}

export function semCensuraLigado(): boolean {
  return getConfig().semCensura === true;
}
