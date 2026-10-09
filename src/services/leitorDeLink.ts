import * as dns from "node:dns/promises";
import * as dnsCb from "node:dns";
import * as http from "node:http";
import * as https from "node:https";
import * as zlib from "node:zlib";
import type { LookupFunction } from "node:net";
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

type Resolvedor = (host: string, opcoes: dnsCb.LookupAllOptions, cb: (err: NodeJS.ErrnoException | null, enderecos: dnsCb.LookupAddress[]) => void) => void;

/**
 * O `lookup` da conexão (fase 19, bloco 192): resolve o nome NA HORA DE CONECTAR e recusa se
 * algum endereço for privado. A conferência de antes (`resolvePublico`) resolvia o nome, e o
 * `fetch` resolvia DE NOVO ao conectar — um DNS que responde público na primeira e
 * 127.0.0.1 na segunda ("DNS rebinding") passava. Agora o IP conferido é o IP usado.
 * O resolvedor é injetável para teste.
 */
export function lookupSeguro(resolver: Resolvedor = dnsCb.lookup as unknown as Resolvedor): LookupFunction {
  return ((host: string, opcoes: dnsCb.LookupOptions, cb: (...a: unknown[]) => void) => {
    resolver(host, { ...opcoes, all: true }, (err, enderecos) => {
      if (err) { cb(err); return; }
      const lista = Array.isArray(enderecos) ? enderecos : [];
      if (!lista.length || lista.some(e => ipPrivado(e.address))) {
        const e = new Error("Esse endereço não é uma página pública.") as NodeJS.ErrnoException;
        e.code = "ENOTPUBLIC";
        cb(e);
        return;
      }
      if (opcoes?.all) cb(null, lista);
      else cb(null, lista[0].address, lista[0].family);
    });
  }) as LookupFunction;
}

interface Resposta { status: number; headers: http.IncomingHttpHeaders; corpo: Buffer }

/**
 * Um GET com o `lookupSeguro`, prazo TOTAL de 15 s e teto de bytes (no fio e depois de
 * descomprimir — um "gzip bomba" de 4 MB pede gigabytes no processo principal). Sem seguir
 * redirecionamento.
 */
function baixar(url: string): Promise<Resposta> {
  return new Promise((ok, falha) => {
    // O `timeout` do request é de OCIOSIDADE: um servidor que pinga um byte a cada 10 s
    // segurava o pedido para sempre. Este é o prazo do pedido inteiro.
    const prazo = setTimeout(() => req.destroy(new Error("A página demorou demais para responder.")), 15_000);
    const u = new URL(url);
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(u, {
      method: "GET",
      lookup: lookupSeguro(),
      timeout: 15_000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ELYSIUM",
        "Accept": "text/html,application/xhtml+xml,text/plain",
        "Accept-Encoding": "gzip, deflate, br",
      },
    }, (res) => {
      const pedacos: Buffer[] = [];
      let total = 0;
      res.on("data", (c: Buffer) => {
        total += c.length;
        // Passou do teto: o resto não interessa (a página é cortada em MAX_BYTES de qualquer jeito).
        if (total > MAX_BYTES * 2) { res.destroy(); return; }
        pedacos.push(c);
      });
      let feito = false;
      const fim = () => {
        if (feito) return;
        feito = true;
        let corpo = Buffer.concat(pedacos);
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        clearTimeout(prazo);
        const teto = { maxOutputLength: MAX_BYTES * 2 };
        try {
          if (enc.includes("gzip")) corpo = zlib.gunzipSync(corpo, teto);
          else if (enc.includes("br")) corpo = zlib.brotliDecompressSync(corpo, teto);
          else if (enc.includes("deflate")) corpo = zlib.inflateSync(corpo, teto);
        } catch (e) {
          // Passou do teto descomprimindo: não é página de texto que se leia.
          if ((e as NodeJS.ErrnoException)?.code === "ERR_BUFFER_TOO_LARGE" || /buffer|too large|maxOutputLength/i.test(String(e))) {
            falha(new Error("A página é grande demais para ler."));
            return;
          }
          /* cortado no teto do fio ou corrompido: usa o que veio */
        }
        ok({ status: res.statusCode ?? 0, headers: res.headers, corpo });
      };
      res.on("end", fim);
      res.on("close", fim);
      res.on("error", falha);
    });
    req.on("timeout", () => req.destroy(new Error("A página demorou demais para responder.")));
    req.on("error", (e) => { clearTimeout(prazo); falha(e); });
    req.end();
  });
}

export async function lerLink(url: string): Promise<{ titulo: string; texto: string; url: string }> {
  if (!urlPermitida(url)) throw new Error("Esse endereço não é uma página pública.");
  // Redirecionamento à mão (08/10): com "follow" os saltos do meio aconteciam ANTES de
  // qualquer conferência — um link público podia levar o PC a bater num endereço interno.
  // Cada salto agora passa pela mesma conferência, com DNS, e no máximo 3 saltos.
  // Fase 19: a conexão usa o `lookupSeguro` — o IP conferido é o IP conectado.
  let atual = url;
  let res: Resposta | null = null;
  for (let salto = 0; salto <= 3; salto++) {
    if (!urlPermitida(atual) || !(await resolvePublico(atual))) {
      throw new Error(salto ? "O link redirecionou para um endereço que não é público." : "Esse endereço não é uma página pública.");
    }
    res = await baixar(atual);
    const loc = res.headers.location;
    const destino = res.status >= 300 && res.status < 400 && loc ? String(loc) : null;
    if (!destino) break;
    atual = new URL(destino, atual).toString();
    if (salto === 3) throw new Error("O link redireciona demais.");
  }
  if (!res) throw new Error("Não consegui abrir o link.");
  if (res.status < 200 || res.status >= 300) throw new Error(`A página respondeu ${res.status}.`);
  const tipo = String(res.headers["content-type"] ?? "");
  if (!/text\/html|text\/plain|xhtml/.test(tipo)) throw new Error("Esse link não é uma página de texto.");
  const html = new TextDecoder("utf-8").decode(res.corpo.subarray(0, MAX_BYTES));
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
