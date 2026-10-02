import { getApiKey, getConfig, nomeDoUsuario } from "../main/config";
import { callChat, Provider } from "./llm";

/**
 * O resumo do que saiu do histórico (bloco 80).
 *
 * O histórico do cérebro guarda `chatHistoryTurns` turnos (6 por padrão) e cortava o resto.
 * Vinte turnos depois, "e onde ele nasceu?" não tinha mais o "ele". Agora o que cai do
 * histórico não some: vira um parágrafo curto, escrito pelo modelo de conversa, que entra
 * no prompt como "o que veio antes". Uma chamada barata (150 tokens, temperatura baixa) por
 * poda, feita em segundo plano — o pedido que causou a poda não espera por ela.
 *
 * Estado: `resumo` (o parágrafo) + `pendentes` (turnos que caíram e ainda não foram
 * dobrados no resumo). Enquanto a compactação não termina, os pendentes vão crus no prompt,
 * para nada ficar de fora nem por um pedido.
 */

export interface TurnoResumo {
  role: "user" | "assistant";
  content: string;
}

let resumo = "";
let pendentes: TurnoResumo[] = [];
/** O lote que está sendo dobrado agora: continua no prompt até o resumo novo chegar. */
let emVoo: TurnoResumo[] = [];
let compactando: Promise<void> | null = null;
let agendado: ReturnType<typeof setTimeout> | null = null;

/** Trocável nos testes — a compactação de verdade chama o modelo. */
export type Compactador = (resumoAtual: string, turnos: TurnoResumo[]) => Promise<string>;
let compactador: Compactador = compactarComModelo;
export function usarCompactador(fn: Compactador | null): void { compactador = fn ?? compactarComModelo; }

export function limparResumo(): void {
  resumo = "";
  pendentes = [];
  emVoo = [];
  if (agendado) { clearTimeout(agendado); agendado = null; }
}

/** Turnos que saíram do histórico: entram nos pendentes e disparam a compactação. */
export function guardarTurnosPodados(turnos: TurnoResumo[]): void {
  if (!turnos.length) return;
  pendentes.push(...turnos);
  compactarEmSegundoPlano();
}

/** O bloco para o prompt: resumo + pendentes crus, ou vazio quando não há nada. */
export function blocoDoResumo(): string {
  const linhas: string[] = [];
  if (resumo) linhas.push(resumo);
  for (const t of [...emVoo, ...pendentes]) linhas.push(t.role === "user" ? `Usuário: ${t.content}` : `Ely: ${t.content}`);
  return linhas.join("\n");
}

/** Só para os testes e o log. */
export function estadoDoResumo(): { resumo: string; pendentes: number } {
  return { resumo, pendentes: emVoo.length + pendentes.length };
}

/** Espera a compactação em curso (testes). */
export async function aguardarCompactacao(): Promise<void> {
  while (agendado || compactando) {
    if (compactando) await compactando;
    else await new Promise(r => setTimeout(r, 30));
  }
}

function compactarEmSegundoPlano(): void {
  // Um turno cai em duas mensagens (pergunta, depois resposta): sem a espera, seriam duas
  // chamadas ao modelo por turno podado.
  if (agendado || compactando) return;
  agendado = setTimeout(() => { agendado = null; iniciarCompactacao(); }, 100);
}

function iniciarCompactacao(): void {
  if (compactando || !pendentes.length) return;
  compactando = (async () => {
    // Enquanto houver pendentes, dobra-os em lotes: um pedido longo pode derrubar vários
    // turnos de uma vez, e um novo lote pode chegar durante a chamada anterior.
    while (pendentes.length) {
      emVoo = pendentes;
      pendentes = [];
      try {
        const novo = (await compactador(resumo, emVoo)).trim();
        if (novo) resumo = novo.slice(0, 900);
        console.log(`[resumo] ${emVoo.length} mensagens dobradas → "${resumo.slice(0, 100)}"`);
        emVoo = [];
      } catch (e) {
        // Sem modelo, os turnos ficam crus (limitados) em vez de sumir.
        console.warn("[resumo] compactação falhou:", (e as Error).message);
        pendentes = [...emVoo.slice(-4), ...pendentes];
        emVoo = [];
        break;
      }
    }
  })().finally(() => { compactando = null; });
}

async function compactarComModelo(resumoAtual: string, turnos: TurnoResumo[]): Promise<string> {
  const cfg = getConfig();
  const provider: Provider = cfg.chatProvider === "ollama" ? "ollama" : (getApiKey() ? "groq" : "ollama");
  const model = provider === "ollama" ? cfg.ollamaChatModel : cfg.brainModel;
  const conversa = turnos.map(t => (t.role === "user" ? `Usuário: ${t.content}` : `Ely: ${t.content}`)).join("\n");
  return callChat({
    provider, model, temperature: 0.2, maxTokens: 180, timeoutMs: 20_000,
    messages: [
      { role: "system", content: `Você resume conversas entre o ${nomeDoUsuario()} e o ELYSIUM, o assistente do PC dele. Escreva UM parágrafo curto em português, em terceira pessoa, com só o que ainda importa para continuar a conversa: assuntos, nomes, decisões, pedidos feitos, o que foi respondido. Sem cumprimentos, sem listas, sem markdown, no máximo 80 palavras.` },
      { role: "user", content: `${resumoAtual ? `Resumo até agora:\n${resumoAtual}\n\n` : ""}Turnos novos:\n${conversa}\n\nResumo atualizado:` },
    ],
  });
}
