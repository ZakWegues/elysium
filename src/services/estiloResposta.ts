/**
 * Como o ELYSIUM responde, conforme o canal e o gosto do dono (blocos 130 e 134). Puro.
 *
 * Até a fase 13 TODA resposta era escrita para ser falada — "1 a 3 frases, nada de
 * markdown", teto de 300 tokens — inclusive quando o Zak digitava no chat. Perguntar "me
 * explica como funciona um SSD" no teclado e receber três frases secas é o oposto do que
 * se elogia no ChatGPT e no Claude. Agora o canal decide:
 *
 * - **voz** (microfone do PC, pedido por voz e áudio do celular, palavra "Elysium"): continua
 *   exatamente como era — curta, corrida, sem marcação.
 * - **texto** (chat do dashboard e o digitado no celular): resposta de chat de verdade,
 *   com markdown quando ajuda e do tamanho que a pergunta pede.
 *
 * Por cima, o estilo (direto / equilibrado / detalhado) e as instruções pessoais, que o
 * Zak escreve em Ajustes → Conversa e moram só na config do app (nunca no código).
 */

export type Canal = "voz" | "texto";
export type Estilo = "direto" | "equilibrado" | "detalhado";

export const ESTILOS: Estilo[] = ["direto", "equilibrado", "detalhado"];
export const MAX_INSTRUCOES = 1500;

export function estiloValido(x: unknown): Estilo {
  return ESTILOS.includes(x as Estilo) ? (x as Estilo) : "equilibrado";
}

/** As regras de forma da resposta de conversa (o prompt de chat). */
export function regrasDaConversa(canal: Canal, estilo: Estilo): string {
  if (canal === "voz") {
    const tamanho = estilo === "detalhado"
      ? "- Responda em até 5 frases. Se o assunto pedir mais, resuma e ofereça continuar."
      : estilo === "direto"
        ? "- Responda em 1 ou 2 frases curtas, direto ao ponto."
        : "- Responda em 1 a 3 frases, direto ao ponto. Se o assunto pedir mais, resuma e ofereça continuar.";
    return `Sua resposta vai ser LIDA EM VOZ ALTA. Portanto:
${tamanho}
- Nada de markdown, listas, títulos, asteriscos ou emoji — só texto corrido natural.`;
  }
  const tamanho = estilo === "direto"
    ? "- Seja curto: a resposta mais enxuta que resolve. Nada de introdução nem de resumo no fim."
    : estilo === "detalhado"
      ? "- Pode se estender: explique o porquê, dê exemplos e o passo a passo quando ajudar."
      : "- Tamanho conforme a pergunta: papo curto, resposta curta; explicação pedida, explicação completa.";
  return `Sua resposta vai aparecer ESCRITA no chat (o markdown é desenhado). Portanto:
${tamanho}
- Use markdown quando deixar mais claro: listas para passos ou opções, **negrito** no essencial, blocos de código com a linguagem. Em resposta de uma ou duas frases, texto puro.
- Comece pela resposta, não por "Claro!" ou "Ótima pergunta".`;
}

/** A linha do prompt do agente sobre como escrever depois de olhar o PC. */
export function regraDoAgente(canal: Canal): string {
  return canal === "voz"
    ? "se era só saber, responda em 1 a 3 frases curtas, em texto corrido (vai ser lida em voz alta), sem listas, sem markdown, sem emoji."
    : "se era só saber, responda de forma clara e completa (vai aparecer escrita no chat; markdown funciona — use lista quando houver vários itens).";
}

export function maxTokensDaConversa(canal: Canal, estilo: Estilo): number {
  if (canal === "voz") return estilo === "detalhado" ? 450 : 300;
  return estilo === "direto" ? 700 : estilo === "detalhado" ? 2000 : 1500;
}

/** O bloco das instruções pessoais, ou "" sem nenhuma. Cortado no teto. */
export function blocoDeInstrucoes(instrucoes: string | undefined): string {
  const t = (instrucoes ?? "").trim().slice(0, MAX_INSTRUCOES);
  if (!t) return "";
  return `\n\n[COMO O USUÁRIO QUER QUE VOCÊ RESPONDA — siga, a não ser que contradiga as regras acima]\n${t}`;
}

/**
 * O que FALAR de uma resposta escrita. O chat digitado também sai na caixa de som, e uma
 * resposta de 15 linhas lida inteira é um discurso: fala o começo (frases inteiras, até
 * ~`limite` caracteres) e avisa que o resto está na tela. Bloco de código não é lido.
 */
export function paraFala(texto: string, limite = 320): string {
  const limpo = texto.replace(/```[\s\S]*?```/g, " ").replace(/\s+/g, " ").trim();
  if (limpo.length <= limite) return limpo;
  const frases = limpo.match(/[^.!?:]+[.!?:]+(\s|$)|[^.!?:]+$/g) ?? [limpo];
  let falado = "";
  for (const f of frases) {
    if (falado && (falado + f).length > limite) break;
    falado += f;
  }
  if (!falado) falado = limpo.slice(0, limite);
  return `${falado.trim().replace(/[:;,]$/, ".")} O resto está na tela.`;
}

/**
 * A persona (fase 16, 07/10): "Jarvis feminino, bem Tony Stark" — o tom da FRIDAY.
 * Confiante, eficiente, humor seco na medida, relatório de status curto. O tratamento
 * ("chefe") vem do config do dono e entra de vez em quando, não em toda frase — repetido
 * vira tique. Pura, para teste.
 */
export function personaStark(tratamento: string): string {
  const t = tratamento.trim();
  const chamar = t ? ` Chame-o de "${t}" de vez em quando (no máximo uma vez por resposta, e nem sempre).` : "";
  return `Seu estilo é o de uma IA de laboratório no estilo do Tony Stark (como a FRIDAY): confiante, eficiente, leal, com um humor seco e rápido quando cabe. Ao concluir algo, confirme como um relatório de status curto ("Feito.", "Pronto, música pausada.", "Sistemas no ar."). Sem bajulação e sem exagero de piada.${chamar}`;
}
