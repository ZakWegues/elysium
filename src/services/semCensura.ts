import { getConfig, setOverride } from "../main/config";
import { composeChatReply, decideBrain, type BrainAction } from "./brain";
import { searchWeb } from "./webSearch";
import type { Canal } from "./estiloResposta";

/**
 * Modo sem censura (05/11, pedido do Zak).
 *
 * Ligado, quem escreve a conversa é o modelo local sem censura (qwen3.5-heretic:4b, no Ollama
 * deste PC), mas a pesquisa continua no Gemini: o Gemini busca e resume, e o local escreve a
 * resposta final por cima disso. Ações (lembrete, abrir app, tela…) seguem pelo roteador, que
 * já sabe executá-las — mudar o modo não pode quebrar o resto do ELYSIUM.
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
  return ligar
    ? "Modo sem censura ligado. A conversa fica no modelo deste PC; pesquisa e ações continuam como antes."
    : "Modo sem censura desligado. Voltei ao cérebro de sempre.";
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
