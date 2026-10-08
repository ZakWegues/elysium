/**
 * ELYSIUM local server — HTTP + WebSocket (native Node.js, zero extra deps).
 *
 * Security: every request/connection must carry the 32-byte hex token in
 *   Authorization: Bearer <token>
 * Não há CORS: o cliente é um app nativo, não um browser. Requisições são limitadas
 * por taxa e o corpo tem teto de tamanho.
 *
 * Routes:
 *   GET  /api/health            → { status, version }
 *   GET  /api/tts?text=         → audio/mpeg na voz neural do PC (bloco 85)
 *   GET  /api/update/apk        → o APK mais novo do ELYSIUM-M, guardado pelo PC (bloco 95)
 *   POST /api/command           → { text } → { reply }     (linguagem natural → cérebro)
 *   GET  /api/rpc               → { methods }              (descoberta)
 *   POST /api/rpc               → { method, params } → { result }  (chamada tipada)
 *   WS   /api/stream            → binary audio frames → STT → reply (text frame)
 *
 * Métodos RPC marcados `destructive` exigem o header X-Elysium-Confirm: 1.
 *
 *   POST /api/mailbox/messages               → mobile posts a message, { id, createdAt } (from:"mobile")
 *   GET  /api/mailbox/messages[?sessionId=]  → thread, metadata only; sem sessionId devolve tudo
 *   GET  /api/mailbox/messages/:id/content   → full content (base64 attachment included)
 *   POST /api/mailbox/messages/:id/ack       → mobile confirms it read a from:"pc" message
 *
 * Telemetry: every 5 s, sends { type:"telemetry", ...SystemTelemetry } to all WS clients.
 */

import * as http from "node:http";
import { desfazerTurno, desfazerUltimoTurno } from "./brain";
import type { ResultadoComando } from "./command";
import type { Fonte } from "./contextoComando";
import { deveSugerir, sugerirContinuacoes } from "./continuacoes";
import * as crypto from "node:crypto";
import type { Socket } from "node:net";
import { transcribe } from "./stt";
import { getSystemTelemetry } from "../actions/systemInfo";
import {
  addMessage, listMessages, getMessageContent, ackMessage,
  AttachmentTooLargeError, MailboxKind,
} from "./mailboxStore";
import { completeLogin as completeSpotifyLogin } from "./spotify";
import { handleRpc, listRpcMethods, RpcError } from "./rpc";
import { emitirEvento } from "./eventos";
import { sintetizarMp3 } from "./tts";
import { registrarAcesso } from "./aparelhos";
import { estadoAtualizacao } from "./atualizacao";
import * as fsAtualizacao from "node:fs";

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";


/** Teto de corpo por requisição. Anexo do mailbox em base64 (5 MB) infla ~33%. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * Rate limit: janela deslizante simples por IP de origem.
 *
 * 60 req/s é folgado de propósito. O trackpad remoto manda um `input.move` por
 * evento de arrasto; com o limite anterior (12/s) o primeiro deslizar do dedo já
 * batia no 429. O objetivo aqui é conter laço descontrolado, não policiar uso
 * legítimo — a autenticação é o token.
 */
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_REQUESTS = 600;

/**
 * A mensagem que vai para o celular quando algo quebra: só o texto do erro, sem pilha nem
 * nome de classe — o detalhe fica no log do PC (08/10).
 */
function mensagemDeErro(e: unknown): string {
  return e instanceof Error && e.message ? e.message.slice(0, 300) : "erro interno no PC";
}

/**
 * Limites do WebSocket (08/10). Sem eles, um cliente (com token) podia mandar um frame
 * dizendo ter 2 GB e o `client.buf` crescia até a memória acabar; e uma conexão morta (Wi-Fi
 * caiu sem fechar) ficava aberta para sempre. O áudio de um pedido tem bem menos de 8 MB.
 */
const WS_MAX_FRAME = 8 * 1024 * 1024;
const WS_PING_MS = 30_000;
const WS_OCIOSO_MS = 90_000;
const WS_AUDIOS_SIMULTANEOS = 2;

// ── WS frame codec ────────────────────────────────────────────────────────────

interface WSFrame {
  opcode: number;
  payload: Buffer;
  consumed: number;
}

function parseFrame(buf: Buffer): WSFrame | null {
  if (buf.length < 2) return null;

  const opcode  = buf[0] & 0x0f;
  const masked  = !!(buf[1] & 0x80);
  let plen      = buf[1] & 0x7f;
  let offset    = 2;

  if (plen === 126) {
    if (buf.length < 4) return null;
    plen   = buf.readUInt16BE(2);
    offset = 4;
  } else if (plen === 127) {
    if (buf.length < 10) return null;
    plen   = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  const maskStart = offset;
  if (masked) offset += 4;
  if (buf.length < offset + plen) return null;

  let payload = buf.slice(offset, offset + plen);
  if (masked) {
    const mk  = buf.slice(maskStart, maskStart + 4);
    const out = Buffer.allocUnsafe(plen);
    for (let i = 0; i < plen; i++) out[i] = payload[i] ^ mk[i % 4];
    payload = out;
  }

  return { opcode, payload, consumed: offset + plen };
}

function buildTextFrame(data: string): Buffer {
  const p = Buffer.from(data, "utf8");
  return buildFrame(0x01, p);
}

function buildCloseFrame(): Buffer {
  return buildFrame(0x08, Buffer.alloc(0));
}

function buildFrame(opcode: number, p: Buffer): Buffer {
  let hdr: Buffer;
  if (p.length < 126) {
    hdr    = Buffer.allocUnsafe(2);
    hdr[0] = 0x80 | opcode;
    hdr[1] = p.length;
  } else if (p.length < 65536) {
    hdr    = Buffer.allocUnsafe(4);
    hdr[0] = 0x80 | opcode;
    hdr[1] = 126;
    hdr.writeUInt16BE(p.length, 2);
  } else {
    hdr    = Buffer.allocUnsafe(10);
    hdr[0] = 0x80 | opcode;
    hdr[1] = 127;
    hdr.writeBigUInt64BE(BigInt(p.length), 2);
  }
  return Buffer.concat([hdr, p]);
}

// ── WS client state ───────────────────────────────────────────────────────────

interface WSClient {
  socket: Socket;
  buf:    Buffer;
}

const wsClients = new Set<WSClient>();

function sendToClient(client: WSClient, text: string): void {
  try { client.socket.write(buildTextFrame(text)); } catch (e) {
    console.error("[WS] falha ao enviar frame pro cliente (provavelmente desconectado):", e);
  }
}

function broadcastTelemetry(payload: object): void {
  if (wsClients.size === 0) return;
  const frame = buildTextFrame(JSON.stringify({ type: "telemetry", ...payload }));
  for (const c of wsClients) {
    try { c.socket.write(frame); } catch { wsClients.delete(c); }
  }
}

/** Real-time nudge for mobile: "há item novo, refaz o GET". Puramente otimização de UX. */
/**
 * Uma entrega (rotina executada, lembrete disparado) para os celulares com WS aberto.
 * O app mostra como notificação local na hora; quem não estiver conectado pega depois
 * por `notify.pending` (rotinas.ts).
 */
export function broadcastNotify(entrega: { id: string; tipo: string; titulo: string; corpo: string; em: number; ref?: string }): void {
  if (wsClients.size === 0) return;
  const frame = buildTextFrame(JSON.stringify({ type: "notify", ...entrega }));
  for (const c of wsClients) {
    try { c.socket.write(frame); } catch { wsClients.delete(c); }
  }
}

/** O estado do app no PC mudou (janela, tela bloqueada, encerrando) — o celular atualiza na hora. */
export function broadcastEstadoPc(estado: object): void {
  if (wsClients.size === 0) return;
  const frame = buildTextFrame(JSON.stringify({ type: "pc.estado", ...estado }));
  for (const c of wsClients) {
    try { c.socket.write(frame); } catch { wsClients.delete(c); }
  }
}

export function broadcastMailboxEvent(direction: "toMobile" | "toDesktop", id: string): void {
  if (wsClients.size === 0) return;
  const frame = buildTextFrame(JSON.stringify({ type: "mailbox_new", direction, id }));
  for (const c of wsClients) {
    try { c.socket.write(frame); } catch { wsClients.delete(c); }
  }
}

// ── auth ──────────────────────────────────────────────────────────────────────

// Mutável (não const de closure) para que regenerar o token (pareamento do
// Portal) invalide sessões antigas imediatamente, sem precisar reiniciar o app.
let activeToken = "";

/** Atualiza o token aceito pelo servidor em runtime — ver src/main/main.ts (pairing:regenerate-token). */
/**
 * Quantos clientes têm um WebSocket aberto agora.
 *
 * É o sinal certo para "o celular está conectado": o app mantém a conexão aberta enquanto
 * está em uso, e ela cai quando ele sai de alcance. Ter token gravado não prova nada — o
 * token continua lá com o celular desligado do outro lado da cidade.
 */
/**
 * Se o servidor do celular está de pé (bloco 127). Com a porta ocupada — um ELYSIUM de
 * desenvolvimento esquecido aberto, ou outro programa na 4200 — o app subia SEM servidor e
 * não dizia nada: o celular só via "PC fora do ar" e a atualização pelo celular recusava.
 */
const servidor = { ouvindo: false, erro: null as string | null };
export function estadoDoServidor(): { ouvindo: boolean; erro: string | null } { return { ...servidor }; }

export function clientesConectados(): number {
  return wsClients.size;
}

export function setActiveToken(token: string): void {
  activeToken = token;
}

function authorized(req: http.IncomingMessage): boolean {
  const hdr = req.headers["authorization"] ?? "";
  if (typeof hdr === "string" && hdr.startsWith("Bearer ")) {
    const supplied = hdr.slice(7).trim();
    if (!activeToken) return false;
    // Comparação de tempo constante: evita distinguir um token quase certo de um
    // completamente errado pelo tempo de resposta.
    // 🔴 08/10: compara os HASHES, não os textos. Antes conferia o tamanho em caracteres e o
    // timingSafeEqual compara bytes — um token de 64 caracteres com um "é" no meio tinha o
    // mesmo tamanho em caracteres e outro em bytes, o timingSafeEqual lançava RangeError e o
    // processo principal caía. Sem token nenhum: qualquer aparelho na rede derrubava o PC.
    // Os dois hashes têm sempre 32 bytes.
    const h = (t: string) => crypto.createHash("sha256").update(t, "utf8").digest();
    return crypto.timingSafeEqual(h(supplied), h(activeToken));
  }
  return false;
}

// ── callback do OAuth do Spotify ──────────────────────────────────────────────

function escaparHtml(t: string): string {
  const mapa: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return t.replace(/[&<>"']/g, c => mapa[c]);
}

/** Página simples devolvida ao navegador — o usuário volta para o app depois. */
function spotifyResultPage(title: string, message: string, ok: boolean): string {
  const color = ok ? "#1db954" : "#e5484d";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>ELYSIUM</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f0f28;color:#f1f5f9;display:flex;
align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center;max-width:420px;padding:32px">
<div style="font-size:44px;margin-bottom:12px">${ok ? "&#10003;" : "&#10007;"}</div>
<h1 style="font-size:20px;margin:0 0 8px;color:${color}">${title}</h1>
<p style="color:#94a3b8;line-height:1.5;margin:0">${message}</p>
</div></body></html>`;
}

async function handleSpotifyCallback(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const params = new URL(req.url ?? "", "http://127.0.0.1").searchParams;
  const sendPage = (status: number, title: string, message: string, ok: boolean) => {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(spotifyResultPage(title, message, ok));
  };

  // O usuário pode ter clicado em "cancelar" na tela do Spotify.
  const denied = params.get("error");
  if (denied) {
    sendPage(200, "Login cancelado", "Você pode tentar de novo pelo ELYSIUM quando quiser.", false);
    return;
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    sendPage(400, "Resposta incompleta", "O Spotify não devolveu o código de autorização.", false);
    return;
  }

  try {
    await completeSpotifyLogin(code, state);
    sendPage(200, "Spotify conectado", "Pode fechar esta aba e voltar para o ELYSIUM.", true);
  } catch (e) {
    console.error("[spotify] callback falhou:", e);
    // A mensagem do erro vai para dentro do HTML: escapada, nunca crua.
    sendPage(400, "Não deu certo", escaparHtml(String(e instanceof Error ? e.message : e)), false);
  }
}

// ── rate limit ────────────────────────────────────────────────────────────────

const rateBuckets = new Map<string, number[]>();

/** true quando a requisição deve ser barrada (429). */
function rateLimited(req: http.IncomingMessage): boolean {
  const ip = req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const hits = (rateBuckets.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateBuckets.set(ip, hits);

  // Poda preguiçosa: sem isso o Map cresce sem limite ao longo de dias ligado.
  if (rateBuckets.size > 64) {
    for (const [key, times] of rateBuckets) {
      if (times.every(t => now - t >= RATE_LIMIT_WINDOW_MS)) rateBuckets.delete(key);
    }
  }

  return hits.length > RATE_LIMIT_MAX_REQUESTS;
}

// ── leitura de corpo com teto ─────────────────────────────────────────────────

class BodyTooLargeError extends Error {}

async function readBody(req: http.IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError();
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

function makeHandler(
  processCommand: (text: string, canal?: "voz" | "texto") => Promise<string>,
): http.RequestListener {
  return async (req, res) => {
    // Sem CORS de propósito. O cliente é um app React Native, que não é browser e
    // nunca precisou de preflight. Manter Access-Control-Allow-Origin:* deixava
    // qualquer página aberta em qualquer máquina da rede chamar esta API de dentro
    // do browser — e agora ela desliga o PC, lê o clipboard e mata processos.
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (rateLimited(req)) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }

    // Callback do OAuth do Spotify — a ÚNICA rota sem bearer token, e não há como ser
    // diferente: quem chega aqui é o navegador redirecionado pelo Spotify, que não tem
    // como carregar o nosso token. A proteção equivalente é o `state` aleatório, que
    // `completeLogin` confere contra o login em andamento; sem ele, a troca de código
    // é recusada. Vem depois do rate limit de propósito.
    if (req.method === "GET" && (req.url ?? "").startsWith("/api/spotify/callback")) {
      await handleSpotifyCallback(req, res);
      return;
    }

    if (!authorized(req)) {
      registrarAcesso(req, false);
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
    registrarAcesso(req, true);

    const url = req.url?.split("?")[0] ?? "/";

    // GET /api/health
    if (req.method === "GET" && url === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      // A versão vem do próprio app: um número escrito à mão aqui já ficou para trás uma vez.
      res.end(JSON.stringify({ status: "ok", version: estadoAtualizacao().atual, wsClients: wsClients.size }));
      return;
    }

    // GET /api/tts?text=… — a mesma voz neural do PC, em MP3, para o celular tocar (bloco 85).
    // GET e não POST porque quem busca é o player do expo-audio, que só sabe fazer GET com
    // cabeçalhos. O texto passa pelo mesmo limpador da fala (teto de 2600 caracteres, contado depois da expansão).
    if (req.method === "GET" && url === "/api/tts") {
      const texto = new URL(req.url ?? "/", "http://x").searchParams.get("text") ?? "";
      if (!texto.trim()) { sendJson(res, 400, { error: "text vazio" }); return; }
      try {
        const mp3 = await sintetizarMp3(texto);
        res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": mp3.length, "Cache-Control": "no-store" });
        res.end(mp3);
      } catch (e) {
        sendJson(res, 502, { error: `síntese falhou: ${e instanceof Error ? e.message : String(e)}` });
      }
      return;
    }

    // GET /api/update/apk — o APK que o PC baixou da release do elysium-m (bloco 95). O
    // celular baixa daqui, com o token de sempre, em vez de falar com o GitHub: não precisa
    // de credencial nem de internet, só de alcançar o PC.
    if (req.method === "GET" && url === "/api/update/apk") {
      const cel = estadoAtualizacao().celular;
      if (!cel?.pronto || !fsAtualizacao.existsSync(cel.arquivo)) { sendJson(res, 404, { error: "nenhum APK guardado no PC" }); return; }
      res.writeHead(200, {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": fsAtualizacao.statSync(cel.arquivo).size,
        "Content-Disposition": `attachment; filename="elysium-m-${cel.versao}.apk"`,
        "Cache-Control": "no-store",
      });
      fsAtualizacao.createReadStream(cel.arquivo).pipe(res);
      return;
    }

    // POST /api/command
    if (req.method === "POST" && url === "/api/command") {
      let body: string;
      try { body = await readBody(req); } catch { sendJson(res, 413, { error: "Body too large" }); return; }
      let text = "";
      // Bloco 130: "texto" = digitado no celular (resposta de chat); sem campo, voz (o curto de sempre).
      let canalHttp: "voz" | "texto" = "voz";
      try {
        const j = JSON.parse(body) as { text?: string; canal?: string };
        text = j.text?.trim() ?? "";
        if (j.canal === "texto") canalHttp = "texto";
      } catch { /* */ }
      if (!text) {
        sendJson(res, 400, { error: "Missing text field" });
        return;
      }
      try {
        const reply = await processCommand(text, canalHttp);
        sendJson(res, 200, { reply });
      } catch (e) {
        console.error("[HTTP] /api/command falhou:", e);
        sendJson(res, 500, { error: mensagemDeErro(e) });
      }
      return;
    }

    // GET /api/rpc — descoberta: quais métodos existem e quais exigem confirmação
    if (req.method === "GET" && url === "/api/rpc") {
      sendJson(res, 200, { methods: listRpcMethods() });
      return;
    }

    // POST /api/rpc — chamada tipada e determinística (ver src/services/rpc.ts)
    if (req.method === "POST" && url === "/api/rpc") {
      let body: string;
      try { body = await readBody(req); } catch { sendJson(res, 413, { error: "Body too large" }); return; }

      let parsed: { method?: unknown; params?: unknown };
      try { parsed = JSON.parse(body) as { method?: unknown; params?: unknown }; }
      catch { sendJson(res, 400, { error: "Body inválido: JSON esperado" }); return; }

      // Aceita o header antigo junto com o novo porque desktop e celular NÃO atualizam
      // ao mesmo tempo: o desktop é build local, o celular é APK/OTA. Se o servidor só
      // aceitasse o nome novo, existiria uma janela em que todo método destrutivo
      // devolveria 403 para um app ainda não atualizado — e o sintoma no celular seria
      // "falhou", sem pista da causa. O nome antigo sai depois que o APK novo estiver
      // instalado e confirmado.
      const confirmed =
        req.headers["x-elysium-confirm"] === "1" || req.headers["x-neuroaxis-confirm"] === "1";

      try {
        const result = await handleRpc(parsed.method, parsed.params, { confirmed });
        sendJson(res, 200, { result });
      } catch (e) {
        if (e instanceof RpcError) {
          sendJson(res, e.status, { error: e.message });
          return;
        }
        console.error("[RPC] erro não tratado:", e);
        sendJson(res, 500, { error: mensagemDeErro(e) });
      }
      return;
    }

    // POST /api/mailbox/messages — celular → servidor, mensagem entra na thread como from:"mobile"
    if (req.method === "POST" && url === "/api/mailbox/messages") {
      let body: string;
      try { body = await readBody(req); } catch { sendJson(res, 413, { error: "Body too large" }); return; }
      let parsed: {
        kind?: string; text?: string; sessionId?: string;
        attachment?: { name?: string; mimeType?: string; base64?: string };
      } | null;
      try { parsed = JSON.parse(body); } catch { parsed = null; }

      const kind = parsed?.kind;
      if (!parsed || (kind !== "link" && kind !== "note" && kind !== "file")) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "invalid body: kind must be link|note|file" }));
        return;
      }

      const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
      if (kind !== "file" && !text) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "text is required when kind != file" }));
        return;
      }

      let attachment: { name: string; mimeType: string; base64: string } | undefined;
      if (parsed.attachment) {
        const a = parsed.attachment;
        if (typeof a.name !== "string" || typeof a.mimeType !== "string" || typeof a.base64 !== "string") {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "invalid attachment: name, mimeType, base64 must be strings" }));
          return;
        }
        attachment = { name: a.name, mimeType: a.mimeType, base64: a.base64 };
      }
      if (kind === "file" && !attachment) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "attachment is required when kind == file" }));
        return;
      }

      try {
        // `sessionId` ausente cai na conversa aberta no PC. E o que mantem um app antigo,
        // que nao conhece sessao, mandando recado para um PC ja atualizado.
        const sessionId = typeof parsed.sessionId === "string" && parsed.sessionId.trim()
          ? parsed.sessionId.trim()
          : null;
        const criada = addMessage("mobile", { kind: kind as MailboxKind, text: text || null, attachment, sessionId });
        broadcastMailboxEvent("toDesktop", criada.id);
        res.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(criada));
      } catch (e) {
        if (e instanceof AttachmentTooLargeError) {
          res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "attachment too large, max 5MB" }));
          return;
        }
        console.error("[HTTP] caixa falhou:", e);
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: mensagemDeErro(e) }));
      }
      return;
    }

    // GET /api/mailbox/messages[?sessionId=] — só metadados. Sem o parâmetro devolve a
    // thread inteira, exatamente como antes: é o que mantém compatível o app que ainda
    // não sabe que existem conversas separadas.
    if (req.method === "GET" && url === "/api/mailbox/messages") {
      const sessionId = new URL(req.url ?? "", "http://127.0.0.1").searchParams.get("sessionId");
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ items: listMessages(sessionId) }));
      return;
    }

    // GET /api/mailbox/messages/:id/content — conteúdo completo (com base64 do anexo)
    const msgContentMatch = url.match(/^\/api\/mailbox\/messages\/([^/]+)\/content$/);
    if (req.method === "GET" && msgContentMatch) {
      const content = getMessageContent(msgContentMatch[1]);
      if (!content) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(content));
      return;
    }

    // POST /api/mailbox/messages/:id/ack — celular confirma que leu uma mensagem from:"pc"
    const msgAckMatch = url.match(/^\/api\/mailbox\/messages\/([^/]+)\/ack$/);
    if (req.method === "POST" && msgAckMatch) {
      for await (const _chunk of req) { /* drain body, ignored */ }
      const ok = ackMessage(msgAckMatch[1]);
      if (!ok) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found" }));
  };
}

// ── WebSocket upgrade handler ─────────────────────────────────────────────────

/** Um pedido com os pedaços da resposta no caminho. Ver `processCommandStream`. */
type ComandoComStream = (text: string, onToken: (token: string) => void, canal?: "voz" | "texto") => Promise<ResultadoComando>;

function handleUpgrade(
  processCommand: (text: string, canal?: "voz" | "texto") => Promise<string>,
  processStream: ComandoComStream | undefined,
  req: http.IncomingMessage,
  socket: Socket,
  head: Buffer,
): void {
  // Reject unauthenticated upgrades
  if (!authorized(req)) {
    registrarAcesso(req, false);
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  const wsKey = req.headers["sec-websocket-key"];
  if (!wsKey || req.headers["upgrade"]?.toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(wsKey + WS_MAGIC)
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );

  const client: WSClient = { socket, buf: head };
  // Vivo? O OkHttp do celular responde ping sozinho; sem nada chegando por 90 s, fecha.
  let ultimoSinal = Date.now();
  const vigia = setInterval(() => {
    if (Date.now() - ultimoSinal > WS_OCIOSO_MS) { socket.destroy(); return; }
    try { socket.write(buildFrame(0x09, Buffer.alloc(0))); } catch { /* fechando */ }
  }, WS_PING_MS);
  let audiosEmCurso = 0;
  wsClients.add(client);
  // Gatilho "quando o celular conectar" (bloco 79). Só o primeiro cliente conta: dois
  // apps abertos não são dois "conectou".
  if (wsClients.size === 1) emitirEvento("celular.conectou");

  function processBuffer(): void {
    while (client.buf.length >= 2) {
      const finBit = (client.buf[0] & 0x80) !== 0;
      const frame = parseFrame(client.buf);
      if (!frame) break;
      client.buf = client.buf.slice(frame.consumed);

      switch (frame.opcode) {
        case 0x01: // text — control message from client e.g. {"type":"end"}
          handleTextFrame(frame.payload.toString("utf8"));
          break;
        case 0x02: // binary — audio chunk; treat each message as one complete audio file
          if (!finBit) {
            console.error("[WS] frame binário chegou fragmentado (fin=false) — mensagem NÃO é tratada como completa, continuation frames (0x00) não são suportados. Áudio provavelmente truncado/corrompido.");
          }
          processBinaryAudio(frame.payload);
          break;
        case 0x08: // close
          socket.write(buildCloseFrame());
          socket.end();
          wsClients.delete(client);
          break;
        case 0x09: // ping → pong
          socket.write(buildFrame(0x0a, frame.payload));
          break;
        case 0x0a: // pong (resposta ao nosso ping) — o `ultimoSinal` já foi atualizado
          break;
        case 0x00: // continuation — não suportado, ver aviso acima em 0x02
          console.error(`[WS] frame de continuação (0x00) recebido e ignorado — ${frame.payload.length} bytes de áudio perdidos`);
          break;
        default:
          console.error(`[WS] opcode desconhecido/não tratado: 0x${frame.opcode.toString(16)}`);
      }
    }
  }

  // Os pedaços viajam como `{type:"chunk", text}` antes do `{type:"reply"}` final, que
  // continua trazendo a resposta inteira. App antigo que não conhece "chunk" ignora e
  // segue lendo o reply — o contrato não quebra.
  /**
   * O celular fechou a conexão no meio (o botão "Parar", 02/10): a resposta que ainda vem não
   * tem para quem ir, e o turno sai do histórico — senão a conversa seguinte continuaria de
   * uma resposta que ninguém leu (07/10).
   */
  let fechado = false;
  socket.on("close", () => { fechado = true; });

  const executar = async (texto: string, canal: "voz" | "texto" = "voz"): Promise<{ reply: string; fontes?: Fonte[]; local?: boolean }> => {
    if (!processStream) return { reply: await processCommand(texto, canal) };
    const r = await processStream(texto, (token) => sendToClient(client, JSON.stringify({ type: "chunk", text: token })), canal);
    // Bloco 132: as sugestões chegam DEPOIS do reply, numa mensagem própria — o celular já
    // fechou a bolha; app antigo ignora o tipo que não conhece.
    if (deveSugerir(r.actions, canal) && !fechado) {
      sugerirContinuacoes(texto, r.reply)
        .then(sugestoes => { if (sugestoes.length) sendToClient(client, JSON.stringify({ type: "sugestoes", sugestoes })); })
        .catch(() => { /* sem chips */ });
    }
    return { reply: r.reply, fontes: r.fontes, local: r.local };
  };

  function handleTextFrame(text: string): void {
    try {
      const msg = JSON.parse(text) as { type?: string; text?: string; canal?: string; refazer?: boolean };
      if (msg.type === "command" && msg.text) {
        // "Refazer" do celular (bloco 130): o turno anterior sai do histórico, como no dashboard.
        if (msg.refazer === true) desfazerUltimoTurno();
        executar(msg.text, msg.canal === "texto" ? "texto" : "voz")
          // Bloco 131: `fontes` vai junto; app antigo lê só o `reply`.
          .then(({ reply, fontes, local }) => {
            if (fechado) { desfazerTurno(msg.text!, reply); console.log("[WS] conexão fechada no meio; resposta descartada."); return; }
            sendToClient(client, JSON.stringify({ type: "reply", reply, ...(fontes?.length ? { fontes } : {}), ...(local ? { local } : {}) }));
          })
          .catch(err  => {
            console.error("[WS] falha ao processar comando de texto:", err);
            sendToClient(client, JSON.stringify({ type: "error", error: mensagemDeErro(err) }));
          });
      }
    } catch (e) {
      console.error("[WS] frame de texto não é JSON válido:", e, "raw:", text.slice(0, 200));
    }
  }

  async function processBinaryAudio(audio: Buffer): Promise<void> {
    // Cada áudio é uma transcrição paga na Groq: mais de dois ao mesmo tempo é laço, não gente.
    if (audiosEmCurso >= WS_AUDIOS_SIMULTANEOS) {
      sendToClient(client, JSON.stringify({ type: "error", error: "Ainda estou cuidando dos últimos áudios — tente de novo em instantes." }));
      return;
    }
    audiosEmCurso++;
    try {
      const text = await transcribe(new Uint8Array(audio));
      if (!text) {
        console.error("[WS] transcribe() retornou vazio — ver logs [STT] acima pro motivo");
        sendToClient(client, JSON.stringify({ type: "error", error: "Could not transcribe audio" }));
        return;
      }
      sendToClient(client, JSON.stringify({ type: "transcript", text }));
      const { reply, fontes, local } = await executar(text);
      // Parado no meio (o mesmo caso do texto): descarta e tira o turno do histórico.
      if (fechado) { desfazerTurno(text, reply); return; }
      sendToClient(client, JSON.stringify({ type: "reply", reply, ...(fontes?.length ? { fontes } : {}), ...(local ? { local } : {}) }));
    } catch (e) {
      console.error("[WS] falha ao processar áudio (transcrição ou comando):", e);
      sendToClient(client, JSON.stringify({ type: "error", error: mensagemDeErro(e) }));
    } finally {
      audiosEmCurso--;
    }
  }

  socket.on("data", (chunk: Buffer) => {
    ultimoSinal = Date.now();
    client.buf = Buffer.concat([client.buf, chunk]);
    // Frame maior que o teto (ou um cabeçalho dizendo que vem um assim): fecha com 1009
    // ("mensagem grande demais") antes de acumular — não depois de a memória acabar.
    if (client.buf.length > WS_MAX_FRAME + 16 || tamanhoAnunciado(client.buf) > WS_MAX_FRAME) {
      console.warn(`[WS] frame acima de ${WS_MAX_FRAME} bytes; conexão fechada.`);
      try { socket.write(buildFrame(0x08, Buffer.from([0x03, 0xf1]))); } catch { /* já fechando */ }
      socket.destroy();
      return;
    }
    processBuffer();
  });

  socket.on("close", () => { clearInterval(vigia); wsClients.delete(client); });
  socket.on("error", () => { clearInterval(vigia); wsClients.delete(client); });
}

/** O tamanho que o cabeçalho do próximo frame anuncia (0 se ainda não chegou inteiro). */
export function tamanhoAnunciado(buf: Buffer): number {
  if (buf.length < 2) return 0;
  const len = buf[1] & 0x7f;
  if (len < 126) return len;
  if (len === 126) return buf.length >= 4 ? buf.readUInt16BE(2) : 0;
  return buf.length >= 10 ? Number(buf.readBigUInt64BE(2)) : 0;
}

// ── public API ────────────────────────────────────────────────────────────────

export function startServer(
  token: string,
  processCommand: (text: string, canal?: "voz" | "texto") => Promise<string>,
  port = 4200,
  processStream?: ComandoComStream,
): void {
  activeToken = token;
  const server = http.createServer(makeHandler(processCommand));

  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/api/stream")) {
      handleUpgrade(processCommand, processStream, req, socket as Socket, head);
    } else {
      (socket as Socket).destroy();
    }
  });

  server.on("listening", () => {
    servidor.ouvindo = true;
    servidor.erro = null;
    console.log(`[ELYSIUM server] listening on 0.0.0.0:${port}`);
  });
  server.listen(port, "0.0.0.0");

  // Porta ocupada: tenta de novo a cada 30 s em vez de desistir para sempre — quando o outro
  // processo fecha, o celular volta a alcançar este PC sem reiniciar nada.
  let avisou = false;
  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      servidor.ouvindo = false;
      servidor.erro = `a porta ${port} está ocupada por outro programa`;
      if (!avisou) console.warn(`[ELYSIUM server] port ${port} in use; tentando de novo a cada 30 s.`);
      avisou = true;
      setTimeout(() => { server.close(); server.listen(port, "0.0.0.0"); }, 30_000).unref();
    } else {
      servidor.erro = e.message;
      console.error("[ELYSIUM server] error:", e.message);
    }
  });

  // Telemetry broadcast every 5 s to all connected WS clients
  setInterval(async () => {
    if (wsClients.size === 0) return;
    try {
      const telem = await getSystemTelemetry();
      broadcastTelemetry(telem);
    } catch { /* best effort */ }
  }, 5_000);
}
