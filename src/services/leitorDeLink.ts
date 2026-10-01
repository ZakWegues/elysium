import { getApiKey, getConfig } from "../main/config";
import { callChat, Provider } from "./llm";
import { canalAtual } from "./contextoComando";
import type { Canal } from "./estiloResposta";

/**
 * "Resume este link" (bloco 138). Baixa a página, tira o que não é texto (script, menu,
 * rodapé, anúncio) e pede o resumo ao modelo — curto na voz, em tópicos no chat.
 *
 * Só http e https, e nunca endereço da rede local: o pedido pode vir do celular, e a
 * porta do PC não pode virar um jeito de ler o roteador ou outro serviço da casa.
 */

const MAX_BYTES = 2_000_000;
const MAX_TEXTO = 12_000;

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»" };

function decodificar(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
}

/** O título e o texto legível de um HTML. Pura. */
export function extrairTextoLegivel(html: string): { titulo: string; texto: string } {
  const titulo = decodificar((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim());
  let corpo = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  // O miolo, quando a página marca: <article> ou <main>.
  const miolo = /<article\b[\s\S]*?<\/article>/i.exec(corpo)?.[0] ?? /<main\b[\s\S]*?<\/main>/i.exec(corpo)?.[0];
  if (miolo && miolo.replace(/<[^>]+>/g, "").trim().length > 400) corpo = miolo;
  corpo = corpo
    .replace(/<(nav|header|footer|aside|form|button)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const texto = decodificar(corpo)
    .split("\n").map(l => l.replace(/[ \t ]+/g, " ").trim()).filter(l => l.length > 1)
    .join("\n").replace(/\n{3,}/g, "\n\n").slice(0, MAX_TEXTO);
  return { titulo, texto };
}

/** Recusa o que não é página pública: outro esquema, localhost, IP de rede local. Pura. */
export function urlPermitida(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0") return false;
  const ip = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  if (/^f[cd][0-9a-f]{2}:|^fe80:/i.test(h)) return false;
  return true;
}

export async function lerLink(url: string): Promise<{ titulo: string; texto: string; url: string }> {
  if (!urlPermitida(url)) throw new Error("Esse endereço não é uma página pública.");
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ELYSIUM", "Accept": "text/html,application/xhtml+xml,text/plain" },
  });
  if (!urlPermitida(res.url || url)) throw new Error("O link redirecionou para um endereço que não é público.");
  if (!res.ok) throw new Error(`A página respondeu ${res.status}.`);
  const tipo = res.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain|xhtml/.test(tipo)) throw new Error("Esse link não é uma página de texto.");
  const buf = await res.arrayBuffer();
  const html = new TextDecoder("utf-8").decode(buf.slice(0, MAX_BYTES));
  const { titulo, texto } = /text\/plain/.test(tipo) ? { titulo: "", texto: html.slice(0, MAX_TEXTO) } : extrairTextoLegivel(html);
  if (texto.length < 80) throw new Error("Não achei texto para ler nessa página (pode precisar de login ou ser só vídeo).");
  return { titulo, texto, url: res.url || url };
}

export async function resumirLink(url: string, canal: Canal = canalAtual()): Promise<string> {
  const pagina = await lerLink(url);
  const cfg = getConfig();
  const pedido = canal === "voz"
    ? "Resuma em português do Brasil, em 2 a 3 frases faladas, sem markdown: do que se trata e o que importa."
    : "Resuma em português do Brasil: uma frase dizendo do que se trata e depois até 5 tópicos curtos com o que importa. Markdown simples.";
  const messages = [
    { role: "system" as const, content: `Você resume páginas da web. ${pedido} Se o texto parecer só menu ou aviso de cookies, diga que a página não tem conteúdo legível.` },
    { role: "user" as const, content: `TÍTULO: ${pagina.titulo}\nURL: ${pagina.url}\n\n${pagina.texto}` },
  ];
  const tentar = (p: Provider) => callChat({ provider: p, model: p === "ollama" ? cfg.ollamaChatModel : cfg.brainModel, messages, temperature: 0.3, maxTokens: canal === "voz" ? 300 : 900, timeoutMs: 90_000 });
  const primeiro: Provider = cfg.chatProvider === "ollama" ? "ollama" : "groq";
  try { return (await tentar(primeiro)).trim(); }
  catch (e) {
    if (primeiro === "groq" || !getApiKey()) throw e;
    return (await tentar("groq")).trim();
  }
}
