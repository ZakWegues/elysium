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

/**
 * 14/11 (o dono: "só pede permissão quando a coisa é séria, tipo deletar"): o comando ou a ação
 * apaga, desinstala, formata, desliga, mexe no registro/sistema, mata processo, paga ou publica?
 * Só isso vira pergunta; o resto o Hermes roda direto (no jeito do Roamies: SAFE roda, ASK pergunta). Pura.
 */
export function aprovacaoPerigosa(params: Record<string, unknown>): boolean {
  const txt = [params.command, params.description, params.tool_name].filter((x) => typeof x === "string").join(" \n ");
  const t = txt.toLowerCase();
  return /\b(rm|rmdir|del|erase|rd|format|diskpart|shutdown|restart-computer|stop-computer|reg\s+delete|remove-item|remove-itemproperty|clear-content|clear-recyclebin|uninstall|winget\s+uninstall|stop-process|taskkill|kill|pkill|set-executionpolicy|bcdedit|cipher\s+\/w|vssadmin|net\s+user|git\s+(push\s+--force|reset\s+--hard|clean\s+-f)|drop\s+(table|database)|truncate|mkfs|dd\s+if=)\b/.test(t)
    || /\b(apag|exclu|delet|remov|desinstal|format|deslig|reinici|apaga|limpa(r)? (tudo|a lixeira|o disco)|esvazi|mata(r)? o processo|pag(ar|amento)|transfer|pix|public|revog)/.test(t)
    || /\s>\s*[a-z]:\|\s>\s*\/|>\s*\$null/.test(t) && /\b(windows|system32|program files)\b/.test(t);
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
