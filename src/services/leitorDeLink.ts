import * as dns from "node:dns/promises";
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

/**
 * IP que não é da internet pública: loopback, rede local, link-local, CGNAT, e o IPv4 escrito
 * dentro de um IPv6 ("::ffff:127.0.0.1" ou "::ffff:7f00:1" — 08/10, passava antes). Pura.
 */
export function ipPrivado(ip: string): boolean {
  let h = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapeado = /^(?:0{0,4}:){0,5}:?ffff:(.+)$/.exec(h) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (mapeado) {
    const resto = mapeado[1];
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(resto);
    h = hex ? [parseInt(hex[1], 16) >> 8, parseInt(hex[1], 16) & 255, parseInt(hex[2], 16) >> 8, parseInt(hex[2], 16) & 255].join(".") : resto;
  }
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (!h.includes(":")) return false;
  return h === "::" || h === "::1" || /^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h);
}

/** Recusa o que não é página pública: outro esquema, localhost, IP de rede local. Pura. */
export function urlPermitida(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".localhost") || h === "0.0.0.0") return false;
  return !ipPrivado(h);
}

/**
 * O nome resolve para um IP público? Um domínio qualquer pode apontar para 127.0.0.1
 * ("127.0.0.1.nip.io") — conferir só o texto da URL deixava passar (08/10).
 */
async function resolvePublico(url: string): Promise<boolean> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (/^[\d.]+$/.test(host) || host.includes(":")) return !ipPrivado(host);
  try {
    const ips = await dns.lookup(host, { all: true });
    return ips.length > 0 && ips.every(i => !ipPrivado(i.address));
  } catch {
    return false;
  }
}

export async function lerLink(url: string): Promise<{ titulo: string; texto: string; url: string }> {
  if (!urlPermitida(url)) throw new Error("Esse endereço não é uma página pública.");
  // Redirecionamento à mão (08/10): com "follow" os saltos do meio aconteciam ANTES de
  // qualquer conferência — um link público podia levar o PC a bater num endereço interno.
  // Cada salto agora passa pela mesma conferência, com DNS, e no máximo 3 saltos.
  let atual = url;
  let res: Response | null = null;
  for (let salto = 0; salto <= 3; salto++) {
    if (!urlPermitida(atual) || !(await resolvePublico(atual))) {
      throw new Error(salto ? "O link redirecionou para um endereço que não é público." : "Esse endereço não é uma página pública.");
    }
    res = await fetch(atual, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ELYSIUM", "Accept": "text/html,application/xhtml+xml,text/plain" },
    });
    const destino = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!destino) break;
    atual = new URL(destino, atual).toString();
    if (salto === 3) throw new Error("O link redireciona demais.");
  }
  if (!res) throw new Error("Não consegui abrir o link.");
  if (!res.ok) throw new Error(`A página respondeu ${res.status}.`);
  const tipo = res.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain|xhtml/.test(tipo)) throw new Error("Esse link não é uma página de texto.");
  const buf = await res.arrayBuffer();
  const html = new TextDecoder("utf-8").decode(buf.slice(0, MAX_BYTES));
  const { titulo, texto } = /text\/plain/.test(tipo) ? { titulo: "", texto: html.slice(0, MAX_TEXTO) } : extrairTextoLegivel(html);
  if (texto.length < 80) throw new Error("Não achei texto para ler nessa página (pode precisar de login ou ser só vídeo).");
  return { titulo, texto, url: atual };
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
