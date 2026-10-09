/**
 * "Confirma? Diga sim." (fase 19, bloco 192).
 *
 * Algumas coisas que a Ely faz por voz não têm volta: apagar uma rotina, esquecer um fato,
 * fechar todos os programas menos um. Pelo celular, os métodos destrutivos do RPC já pedem
 * confirmação (cabeçalho `X-Elysium-Confirm`); pela voz e pelo agente não pediam nada. Aqui
 * fica UMA ação pendente por vez: a Ely diz o que vai fazer, e o próximo pedido decide —
 * "sim" executa, "não" desiste, qualquer outra coisa desiste em silêncio e segue como pedido
 * normal (ninguém fica preso numa pergunta). Vale por 30 s.
 */

export interface ConfirmacaoPendente {
  descricao: string;
  executar: () => Promise<string>;
  expiraEm: number;
}

export const VALIDADE_MS = 30_000;

let pendente: ConfirmacaoPendente | null = null;

function sem(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** "sim", "pode", "confirma"… (frase inteira, com ou sem "Ely"). Pura. */
export function ehSim(texto: string): boolean {
  return /^(?:ely )?(sim|s|isso|isso mesmo|confirmo|confirma|confirmado|pode|pode sim|pode ir|pode fazer|pode fechar|pode apagar|manda|manda ver|claro|com certeza|fechado|ok|okay|beleza|bora|faz|faca|faz isso|sim pode|sim por favor)(?: ely)?$/.test(sem(texto));
}

/** "não", "cancela", "deixa"… Pura. */
export function ehNao(texto: string): boolean {
  // Frase inteira: "não, abre o Chrome" é outro pedido (segue normal), não só a recusa.
  return /^(?:ely )?(nao|n|cancela|cancelar|deixa|deixa pra la|esquece|nao precisa|nao faz|nao faca|melhor nao|nem|nao obrigad[oa]|nao valeu)(?: ely)?$/.test(sem(texto));
}

/** Guarda a ação e devolve a pergunta que a Ely fala. */
export function pedirConfirmacao(descricao: string, executar: () => Promise<string>, agora = Date.now()): string {
  pendente = { descricao, executar, expiraEm: agora + VALIDADE_MS };
  return `${descricao} Confirma? Diga sim.`;
}

export function haConfirmacaoPendente(agora = Date.now()): boolean {
  return !!pendente && pendente.expiraEm > agora;
}

export function limparConfirmacao(): void {
  pendente = null;
}

/**
 * O pedido novo responde à pergunta? Devolve a fala (o resultado da ação ou "não fiz"), ou
 * `null` quando não havia pergunta, ela venceu, ou o pedido é outra coisa — aí a pergunta é
 * descartada e o pedido segue o caminho normal.
 */
export async function responderConfirmacao(texto: string, agora = Date.now()): Promise<string | null> {
  const p = pendente;
  if (!p) return null;
  pendente = null;
  if (p.expiraEm <= agora) return null;
  if (ehSim(texto)) {
    try { return (await p.executar()).trim() || "Feito."; }
    catch (e) { return `Não consegui: ${e instanceof Error ? e.message : String(e)}`; }
  }
  if (ehNao(texto)) return "Tudo bem, deixei como estava.";
  return null;
}
