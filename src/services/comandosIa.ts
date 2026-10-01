import Store from "electron-store";
import { getApiKey, getConfig } from "../main/config";
import { callChat, ChatMessage, Provider } from "./llm";

/**
 * Comandos de IA sobre um texto (bloco 137) — o que mais se elogia no Raycast: copiar um
 * parágrafo, escolher "Corrigir" e colar o resultado, sem abrir conversa nenhuma.
 *
 * Os de fábrica cobrem o dia a dia; o Zak cria os dele (nome + instrução) e eles ficam
 * aqui, nos dados do app. Roda no modelo local da conversa e, se ele falhar, na Groq.
 * O modelo devolve SÓ o texto transformado — sem "Aqui está:", sem aspas — porque o
 * resultado vai direto para a área de transferência.
 */

export interface ComandoIa { id: string; nome: string; instrucao: string; fabrica?: boolean }

export const DE_FABRICA: ComandoIa[] = [
  { id: "corrigir", nome: "Corrigir português", instrucao: "Corrija ortografia, acentuação, pontuação e concordância. Mantenha o tom, o sentido e a formatação; não reescreva o que já está certo.", fabrica: true },
  { id: "ingles", nome: "Traduzir para inglês", instrucao: "Traduza para inglês natural, mantendo o tom e a formatação.", fabrica: true },
  { id: "portugues", nome: "Traduzir para português", instrucao: "Traduza para português do Brasil natural, mantendo o tom e a formatação.", fabrica: true },
  { id: "resumir", nome: "Resumir", instrucao: "Resuma em português do Brasil, em até 5 tópicos curtos com o essencial.", fabrica: true },
  { id: "formal", nome: "Deixar mais formal", instrucao: "Reescreva de forma mais formal e educada, para um e-mail de trabalho, sem mudar o sentido.", fabrica: true },
  { id: "curto", nome: "Deixar mais curto", instrucao: "Reescreva com metade do tamanho ou menos, mantendo tudo o que importa.", fabrica: true },
  { id: "explicar", nome: "Explicar", instrucao: "Explique em português do Brasil, de forma simples e direta, o que este texto (ou código) quer dizer.", fabrica: true },
];

const MAX_TEXTO = 12_000;

/** As mensagens do modelo para um comando. Pura. */
export function mensagensDoComando(cmd: Pick<ComandoIa, "instrucao">, texto: string): ChatMessage[] {
  return [
    { role: "system", content: `Você transforma textos conforme uma instrução.\nINSTRUÇÃO: ${cmd.instrucao.trim()}\nResponda SOMENTE com o resultado — sem introdução, sem comentário, sem aspas em volta, sem "Aqui está".` },
    { role: "user", content: texto.slice(0, MAX_TEXTO) },
  ];
}

/** Tira o que o modelo às vezes põe em volta do resultado. Pura. */
export function limparResultado(bruto: string): string {
  let t = bruto.trim();
  t = t.replace(/^(aqui est[áa]|segue|claro)[^:\n]{0,60}:\s*\n?/i, "");
  if (/^["“].*["”]$/s.test(t) && !t.slice(1, -1).includes("\"")) t = t.slice(1, -1);
  return t.trim();
}

/** Acha o comando pelo id ou pelo nome falado ("corrige", "traduz pro inglês"). Pura. */
export function acharComando(lista: ComandoIa[], alvo: string): ComandoIa | undefined {
  const q = alvo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  if (!q) return undefined;
  const exato = lista.find(c => c.id === q || c.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() === q);
  if (exato) return exato;
  if (/ingl/.test(q)) return lista.find(c => c.id === "ingles");
  if (/portug|traduz/.test(q) && !/corrig/.test(q)) return lista.find(c => c.id === "portugues");
  if (/corrig|revis|ortograf/.test(q)) return lista.find(c => c.id === "corrigir");
  if (/resum/.test(q)) return lista.find(c => c.id === "resumir");
  if (/formal/.test(q)) return lista.find(c => c.id === "formal");
  if (/curt|encurt|reduz/.test(q)) return lista.find(c => c.id === "curto");
  if (/explic/.test(q)) return lista.find(c => c.id === "explicar");
  return lista.find(c => c.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q));
}

// ── store ────────────────────────────────────────────────────────────────────

const store = new Store<{ meus: ComandoIa[] }>({ name: "comandos-ia", defaults: { meus: [] } });

export function listarComandos(): ComandoIa[] {
  return [...DE_FABRICA, ...store.get("meus", [])];
}

export function salvarComando(c: { id?: string; nome: string; instrucao: string }): ComandoIa {
  const nome = c.nome.trim().slice(0, 40), instrucao = c.instrucao.trim().slice(0, 600);
  if (!nome || !instrucao) throw new Error("O comando precisa de nome e instrução.");
  const meus = store.get("meus", []);
  const id = c.id && meus.some(m => m.id === c.id) ? c.id : `c-${Date.now().toString(36)}`;
  const novo = { id, nome, instrucao };
  store.set("meus", [...meus.filter(m => m.id !== id), novo]);
  return novo;
}

export function apagarComando(id: string): boolean {
  const meus = store.get("meus", []);
  store.set("meus", meus.filter(m => m.id !== id));
  return meus.length !== store.get("meus", []).length;
}

export async function rodarComando(idOuNome: string, texto: string): Promise<{ comando: ComandoIa; resultado: string }> {
  const cmd = acharComando(listarComandos(), idOuNome);
  if (!cmd) throw new Error(`Não conheço o comando "${idOuNome}".`);
  if (!texto.trim()) throw new Error("Não há texto para transformar.");
  const cfg = getConfig();
  const messages = mensagensDoComando(cmd, texto);
  const tentar = (provider: Provider) => callChat({
    provider, model: provider === "ollama" ? cfg.ollamaChatModel : cfg.brainModel,
    messages, temperature: 0.2, maxTokens: 2000, timeoutMs: 90_000,
  });
  const primeiro: Provider = cfg.chatProvider === "ollama" ? "ollama" : "groq";
  let bruto: string;
  try { bruto = await tentar(primeiro); }
  catch (e) {
    if (primeiro === "groq" || !getApiKey()) throw e;
    console.warn("[comandos-ia] o local falhou; repetindo na Groq:", e instanceof Error ? e.message : e);
    bruto = await tentar("groq");
  }
  return { comando: cmd, resultado: limparResultado(bruto) };
}
