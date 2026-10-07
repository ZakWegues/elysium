/**
 * Cérebro híbrido (fase 16, 07/10): quem escreve a resposta de CONVERSA.
 *
 * O teste da fase 15 mostrou o qwen2.5:7b local inventando fato histórico (Santos Dumont).
 * Para ação e conversa curta ("oi", "valeu", "abre o Chrome") o local é ótimo — rápido,
 * grátis, sem rede. Para pergunta de CONHECIMENTO e para o chat escrito, o gpt-oss-120b da
 * Groq acerta muito mais. O áudio já vai para a Groq (Whisper), então a linha de
 * privacidade é a mesma de antes.
 *
 * `chatProvider: "auto"` faz essa escolha por pedido; "ollama" e "groq" continuam
 * forçando um lado só. Puro, para teste.
 */

export type PreferenciaChat = "groq" | "ollama" | "auto";

/** Pergunta que pede saber algo do mundo (e não só conversa ou ação). */
export function ehPerguntaDeConhecimento(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  if (t.length < 8) return false;
  if (/^(oi|olá|ola|e aí|e ai|tudo bem|valeu|obrigad[oa]|bom dia|boa tarde|boa noite|tchau|beleza)\b/.test(t) && t.length < 30) return false;
  if (/^(quem (foi|é|e|era|inventou|descobriu|criou|escreveu)|o que (é|e|foi|significa|aconteceu)|quando (foi|é|e|aconteceu|começou|comecou|surgiu)|onde (fica|é|e|nasceu)|por ?que|como (funciona|surgiu|se faz|fazer|é feito)|qual (é|e|foi|a diferença|o maior|o menor|a capital)|quais (são|sao|foram)|quantos?|quantas?|explica|me explica|me conta sobre|me fala sobre|história d|resum[ea])/.test(t)) return true;
  // Pergunta longa (mais de ~10 palavras) quase sempre pede conteúdo, não ação.
  return t.split(/\s+/).length >= 11 && t.includes("?");
}

/** Qual provedor escreve esta resposta. Sem chave da Groq, sempre o local. */
export function provedorDaConversa(pref: PreferenciaChat | string | undefined, pergunta: string, canal: "voz" | "texto", temChave: boolean): "groq" | "ollama" {
  if (pref === "groq") return temChave ? "groq" : "ollama";
  if (pref === "ollama") return "ollama";
  if (!temChave) return "ollama";
  return canal === "texto" || ehPerguntaDeConhecimento(pergunta) ? "groq" : "ollama";
}

/** Para as tarefas baratas de fundo (sugestões, aprendizado): "auto" fica no local. */
export function provedorDeFundo(pref: PreferenciaChat | string | undefined): "groq" | "ollama" {
  return pref === "groq" ? "groq" : "ollama";
}
