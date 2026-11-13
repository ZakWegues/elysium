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
export function provedorDaConversa(pref: PreferenciaChat | string | undefined, pergunta: string, canal: "voz" | "texto", temChave: boolean, modoDeEstudo = false): "groq" | "ollama" {
  if (pref === "groq") return temChave ? "groq" : "ollama";
  if (pref === "ollama") return "ollama";
  if (!temChave) return "ollama";
  // Fase 20: no modo matemática (e nos outros de estudo) até "e o 3?" é conteúdo — o
  // modelo local erra conta e regra de gramática.
  return canal === "texto" || modoDeEstudo || ehPerguntaDeConhecimento(pergunta) ? "groq" : "ollama";
}

/** Para as tarefas baratas de fundo (sugestões, aprendizado): "auto" fica no local. */
export function provedorDeFundo(pref: PreferenciaChat | string | undefined): "groq" | "ollama" {
  return pref === "groq" ? "groq" : "ollama";
}

/**
 * 12/11, a via rápida: pergunta de conhecimento que não depende de hoje (notícia, preço, clima,
 * placar), nem do PC ou da vida do dono, não precisa do Hermes — vai direto à composição de
 * conversa (gpt-oss-120b na Groq, em streaming, com a persona, a memória e o histórico de sempre).
 * Medido: 1º pedaço em ~0,6 s e resposta em ~0,8 s, contra 6–7 s pelo Hermes. Na dúvida, Hermes. Puro.
 */
export function viaRapida(texto: string): boolean {
  const t = texto.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!ehPerguntaDeConhecimento(texto)) return false;
  // Precisa da internet (o que muda com o tempo) ou de pesquisar.
  if (/\b(hoje|agora|ontem|amanha|esta semana|essa semana|atual|atualmente|ultim[oa]s?|recente|recentemente|noticias?|placar|jogo|partida|campeonato|resultado|preco|precos|custa|cotacao|dolar|euro|bitcoin|clima|previsao|temperatura|chover|chuva|lancamento|lancou|eleic|presidente atual|20[2-9]\d|pesquis|procur|busca|google|internet|site|link)\b/.test(t)) return false;
  // É sobre o PC, as coisas dele ou a vida dele (ferramentas e memória do Hermes).
  if (/\b(pc|computador|notebook|meu|minha|meus|minhas|eu|arquivo|pasta|programa|janela|aberto|aberta|spotify|bateria|ram|cpu|disco|lembrete|agenda|tarefa|email|e-mail|whatsapp|celular|tela|isso|disso|aqui)\b/.test(t)) return false;
  return true;
}
