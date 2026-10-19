import { semAcento } from "./texto";
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
  /**
   * Fase 21: quem perguntou precisa saber do "não" (o agente do Hermes fica parado esperando
   * a licença). Chamado no "não", quando a pergunta vence ou é trocada por outro pedido.
   */
  cancelar?: () => void;
}

export const VALIDADE_MS = 30_000;

let pendente: ConfirmacaoPendente | null = null;

function sem(t: string): string {
  return semAcento(t).replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * "sim", "pode", "confirma"… Pura.
 *
 * 19/10: antes só valia a frase inteira, e "sim, pode baixar tudo" virava pedido novo — o modelo
 * tentava de novo, pedia licença de novo, e o Zak ficou num laço de permissões baixando arquivos
 * do Classroom. Agora:
 *  - "sim…" vale com o que vier depois ("sim, pode baixar"), menos "sim, mas antes…";
 *  - "pode…", "manda…", "ok…" valem com até duas palavras depois ("pode baixar", "pode sim"), ou
 *    com "tudo"/"continua"/"segue" — "pode abrir o Spotify" é outro pedido;
 *  - "não" em qualquer lugar nunca é sim.
 */
export function ehSim(texto: string): boolean {
  const t = sem(texto).toLowerCase().replace(/^(?:(?:ei|oi) )?ely /, "").replace(/ ely$/, "");
  if (/\bnao\b/.test(t)) return false;
  if (/^(sim|s)\b/.test(t)) return !/\b(mas|antes|primeiro|depois)\b/.test(t);
  const m = /^(isso|confirmo|confirma|confirmado|pode|manda|claro|com certeza|fechado|ok|okay|beleza|bora|faz|faca|libera|liberado|autorizo|autorizado|vai|segue|continua|aprovado|aprovo)\b(.*)$/.exec(t);
  if (!m) return false;
  const resto = m[2].trim();
  return !resto || resto.split(" ").length <= 2 || /\b(tudo|continua|segue|pode ir)\b/.test(resto);
}

/** "sim, pode tudo", "libera tudo", "não precisa perguntar"… — licença para o resto da tarefa. Pura. */
export function ehLiberaTudo(texto: string): boolean {
  const t = sem(texto).toLowerCase();
  return /\b(pra|para) tudo\b|\b(libera|liberado|pode|autoriz\w*) tudo\b|\btudo liberado\b|\bsem (me )?perguntar\b|\bnao (precisa|pergunt\w*)\b.*\bpergunt|\bnao pergunt\w* mais\b|\bpara sempre\b/.test(t);
}

/**
 * 19/10: licença ampla por 15 min — durante uma tarefa longa (baixar vários arquivos), as
 * aprovações do Hermes e as perguntas de "conteúdo de fora" passam sem perguntar. Desligar,
 * reiniciar e o que apaga continuam perguntando sempre (quem decide é cada ferramenta).
 */
export const LIBERACAO_MS = 15 * 60_000;
let liberadoAte = 0;

export function liberar(agora = Date.now()): void { liberadoAte = agora + LIBERACAO_MS; }
export function liberacaoAtiva(agora = Date.now()): boolean { return liberadoAte > agora; }
export function encerrarLiberacao(): void { liberadoAte = 0; }

/** "não", "cancela", "deixa"… Pura. */
export function ehNao(texto: string): boolean {
  // Frase inteira: "não, abre o Chrome" é outro pedido (segue normal), não só a recusa.
  return /^(?:ely )?(nao|n|cancela|cancelar|deixa|deixa pra la|esquece|nao precisa|nao faz|nao faca|melhor nao|nem|nao obrigad[oa]|nao valeu)(?: ely)?$/.test(sem(texto));
}

/** Guarda a ação e devolve a pergunta que a Ely fala. */
export function pedirConfirmacao(descricao: string, executar: () => Promise<string>, agora = Date.now(), cancelar?: () => void): string {
  descartar();
  pendente = { descricao, executar, expiraEm: agora + VALIDADE_MS, cancelar };
  if (cancelar) {
    // Ninguém respondeu em 30 s: avisa quem perguntou, sem esperar o próximo pedido.
    const p = pendente;
    setTimeout(() => { if (pendente === p) descartar(); }, VALIDADE_MS + 500).unref?.();
  }
  return `${descricao} Confirma? Diga sim.`;
}

export function haConfirmacaoPendente(agora = Date.now()): boolean {
  return !!pendente && pendente.expiraEm > agora;
}

export function limparConfirmacao(): void {
  descartar();
}

function descartar(): void {
  const p = pendente;
  pendente = null;
  try { p?.cancelar?.(); } catch { /* quem perguntou já foi */ }
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
  const cancelar = () => { try { p.cancelar?.(); } catch { /* */ } };
  if (p.expiraEm <= agora) { cancelar(); return null; }
  if (ehSim(texto) || ehLiberaTudo(texto) && !ehNao(texto)) {
    if (ehLiberaTudo(texto)) liberar(agora);
    try { return (await p.executar()).trim() || "Feito."; }
    catch (e) { return `Não consegui: ${e instanceof Error ? e.message : String(e)}`; }
  }
  cancelar();
  if (ehNao(texto)) return "Tudo bem, deixei como estava.";
  return null;
}
