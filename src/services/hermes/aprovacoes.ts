/**
 * As perguntas que o Hermes faz ao cliente, na língua da Ely (fase 21, bloco 213). Puro.
 *
 * - `approval`: o agente quer rodar um comando que pede licença. Vira "Vou rodar … Confirma?
 *   Diga sim." pelo `pedirConfirmacao` de sempre; "sim" = `session` (19/10: o mesmo tipo de
 *   comando não pergunta de novo nesta conversa), qualquer outra coisa = `deny`. Nunca `always`:
 *   a licença não fica valendo para depois da sessão.
 * - `clarify`: o agente precisa de uma resposta (com ou sem opções). A Ely faz a pergunta e o
 *   próximo pedido do dono é a resposta.
 * - `sudo`, `secret`, `vault.*` e o resto: recusados sem perguntar. Senha e segredo não passam
 *   pela voz, e o ELYSIUM não guarda nenhum.
 */

export type TipoDePergunta = "aprovacao" | "esclarecimento" | "recusar";

export function tipoDaPergunta(metodo: string): TipoDePergunta {
  if (metodo === "approval") return "aprovacao";
  if (metodo === "clarify") return "esclarecimento";
  return "recusar";
}

/** A resposta de recusa no formato que cada pergunta espera. */
export function respostaDeRecusa(metodo: string): Record<string, unknown> {
  if (metodo === "approval") return { choice: "deny" };
  // `clarify` sem `answers` é "cancelar tudo"; os outros aceitam objeto vazio como desistência.
  return {};
}

function curto(t: string, max = 160): string {
  const limpo = t.replace(/\s+/g, " ").trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo;
}

/** "Vou rodar `x` no PC." — o que a Ely fala antes do "Confirma? Diga sim.". */
export function descricaoDaAprovacao(params: Record<string, unknown>): string {
  const desc = typeof params.description === "string" ? params.description.trim() : "";
  const cmd = typeof params.command === "string" ? params.command.trim() : "";
  const ferramenta = typeof params.tool_name === "string" ? params.tool_name.trim() : "";
  // Segurança (23.2): a descrição é escrita pelo próprio modelo — uma página com injeção podia
  // pedir licença para "limpar o cache" e rodar outra coisa. O comando de verdade vai sempre
  // junto, e inteiro até 300 caracteres.
  if (desc && cmd) return `Preciso da sua licença para isto: ${curto(desc)}. O comando é: ${curto(cmd, 300)}.`.replace(/\.\.$/, ".");
  if (desc) return `Preciso da sua licença para isto: ${curto(desc)}.`.replace(/\.\.$/, ".");
  if (cmd) return `Preciso rodar um comando no PC: ${curto(cmd, 300)}.`;
  if (ferramenta) return `Preciso da sua licença para usar ${ferramenta}.`;
  return "Preciso da sua licença para continuar.";
}

export interface PerguntaDeEsclarecimento { qid: string; question: string; choices?: string[] | null }

/** A pergunta falada: a primeira do conjunto, com as opções se houver. */
export function falaDoEsclarecimento(params: Record<string, unknown>): string {
  const qs = Array.isArray(params.questions) ? (params.questions as PerguntaDeEsclarecimento[]) : [];
  const q = qs[0];
  if (!q?.question) return "Pode me dar mais detalhes?";
  const opcoes = q.choices?.filter(Boolean) ?? [];
  return opcoes.length ? `${curto(q.question, 220)} Opções: ${opcoes.slice(0, 6).join(", ")}.` : curto(q.question, 260);
}

/**
 * A resposta do dono vira `answers`: para cada pergunta, o texto dele (se a pergunta tem opções e
 * ele disse uma delas, vai a opção exata).
 */
export function respostasDoEsclarecimento(params: Record<string, unknown>, texto: string): Record<string, unknown> {
  const qs = Array.isArray(params.questions) ? (params.questions as PerguntaDeEsclarecimento[]) : [];
  const answers: Record<string, string> = {};
  const dito = texto.trim();
  for (const q of qs) {
    const opcao = q.choices?.find(c => c && dito.toLowerCase().includes(c.toLowerCase()));
    answers[q.qid] = opcao ?? dito;
  }
  return { answers };
}
