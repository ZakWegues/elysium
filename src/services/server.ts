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
import { rapidasPara, type Rapidas } from "./respostasRapidas";
import { getConfig } from "../main/config";
import { proxyDoApp } from "./uiProxy";
import * as crypto from "node:crypto";
import Store from "electron-store";
import { NoncesVistos, verificarAssinatura } from "./assinatura";
import type { Socket } from "node:net";
import { transcribe } from "./stt";
import { getSystemTelemetry } from "../actions/systemInfo";
import {
  addMessage, listMessages, getMessageContent, ackMessage, getAttachmentFile,
  AttachmentTooLargeError, MailboxKind, MAILBOX_MAX_FILE_BYTES, receberUpload, UploadIncompletoError,
} from "./mailboxStore";
import { completeLogin as completeSpotifyLogin } from "./spotify";
import { handleRpc, listRpcMethods, RpcError } from "./rpc";
import { emitirEvento } from "./eventos";
import { sintetizarAudio } from "./tts";
import { registrarAcesso } from "./aparelhos";
import { criarCanal, CanalDeInput } from "./inputCanal";
import { inputHost } from "./inputHost";
import { estadoAtualizacao } from "./atualizacao";
import * as fsAtualizacao from "node:fs";
import { enderecoPermitido, hostPermitido } from "./redeSegura";
import { ehDoProprioPc, ExecutorMcp, responderMcp } from "./mcpElysium";
import { abrirPedido, enviarUi, idValido, parar, pedaco, retomar, soltarDestino, terminar, type Pedido } from "./retomada";
import { atalhoDeTela, cancelarTelaDoCelular, depoisDaResposta, gerarParaCelular } from "./telasDoCelular";
import { geradorDeTelas, provedorDeTelas } from "./geradorDeTelas";

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

/** O pomodoro mudou de fase (fase 20): o card do celular acompanha na hora. */
export function broadcastPomodoro(pomodoro: object): void {
  if (wsClients.size === 0) return;
  const frame = buildTextFrame(JSON.stringify({ type: "pomodoro", pomodoro }));
  for (const c of wsClients) {
    try { c.socket.write(frame); } catch { wsClients.delete(c); }
  }
}

/** O modo da Ely mudou (fase 20): o chip do celular acompanha o do PC. */
export function broadcastModo(modo: object | null): void {
  if (wsClients.size === 0) return;
  const frame = buildTextFrame(JSON.stringify({ type: "modo", modo }));
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
  const mudou = token !== activeToken;
  activeToken = token;
  // Bloco 200: token novo derruba as conexões abertas — o aparelho revogado continuava com o
  // WebSocket de pé, mandando pedido, até a conexão cair sozinha.
  if (mudou) for (const c of [...wsClients]) { try { c.socket.destroy(); } catch { /* já caiu */ } wsClients.delete(c); }
}

const noncesVistos = new NoncesVistos();
const seguranca = new Store<{ assinaturaVista: boolean }>({ name: "seguranca", defaults: { assinaturaVista: false } });

/**
 * 31/10: o Bearer em texto claro só continua valendo onde o caminho já é protegido — o próprio
 * PC e o Tailscale (criptografado). Na rede de casa, depois que o celular novo (que assina os
 * pedidos) apareceu uma vez, o Bearer é recusado: um token capturado na rede não serve mais.
 */
export function bearerPermitido(endereco: string | undefined, assinaturaVista: boolean): boolean {
  if (!assinaturaVista) return true;
  let e = (endereco ?? "").toLowerCase();
  if (e.startsWith("::ffff:")) e = e.slice(7);
  if (e === "::1" || e.startsWith("127.")) return true;
  const m = /^100\.(\d{1,3})\./.exec(e);
  if (m && Number(m[1]) >= 64 && Number(m[1]) <= 127) return true; // 100.64/10 (Tailscale)
  return /^fd7a:115c:a1e0:/.test(e);                                  // IPv6 do Tailscale
}

function authorized(req: http.IncomingMessage): boolean {
  // 31/10: pedido assinado (ver assinatura.ts) — o token não viaja.
  const assinatura = req.headers["x-elysium-assinatura"];
  if (typeof assinatura === "string") {
    const r = verificarAssinatura(assinatura, req.method ?? "GET", req.url ?? "/", activeToken, Math.floor(Date.now() / 1000), noncesVistos);
    // Só um aparelho DE FORA (o celular) liga a obrigatoriedade — um teste no próprio PC não.
    if (r.ok && !seguranca.get("assinaturaVista") && !ehDoProprioPc(req.socket.remoteAddress)) seguranca.set("assinaturaVista", true);
    return r.ok;
  }
  if (!bearerPermitido(req.socket.remoteAddress, seguranca.get("assinaturaVista"))) return false;
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

// ── MCP do Hermes (fase 21) ───────────────────────────────────────────────────

let mcp: { token: string; ex: ExecutorMcp } | null = null;

/** Liga o `/mcp/<token>` (main.ts, na partida, quando o cérebro é o Hermes). */
export function ligarMcp(token: string, ex: ExecutorMcp): void {
  mcp = { token, ex };
}

function mesmoToken(a: string, b: string): boolean {
  const h = (t: string) => crypto.createHash("sha256").update(t, "utf8").digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

async function atenderMcp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const token = (req.url ?? "").split("?")[0].slice("/mcp/".length);
  if (!mcp || !ehDoProprioPc(req.socket.remoteAddress) || !mesmoToken(token, mcp.token)) {
    contarRecusa(req);
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }
  if (req.method === "DELETE") { res.writeHead(200); res.end(); return; }
  if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }); res.end(); return; }
  let corpo: unknown;
  try { corpo = JSON.parse(await readBody(req)); } catch { sendJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }); return; }
  const lista = Array.isArray(corpo) ? corpo : [corpo];
  const respostas = (await Promise.all(lista.map(m => responderMcp(m as object, mcp!.ex)))).filter(Boolean);
  if (!respostas.length) { res.writeHead(202); res.end(); return; }
  sendJson(res, 200, Array.isArray(corpo) ? respostas : respostas[0]);
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

// ── recuo depois de token errado (bloco 200) ──────────────────────────────────
// 20 recusas em 10 min do mesmo IP = 10 min sem resposta. Adivinhar 256 bits não é viável, mas
// um celular com o token VELHO martelando a cada 15 s enchia o log e o disco (cada 401 gravava).
const recusas = new Map<string, { n: number; desde: number; bloqueadoAte: number }>();
const JANELA_RECUSA_MS = 10 * 60_000;

/** Pura, para teste: o estado novo depois de uma recusa. */
export function proximaRecusa(r: { n: number; desde: number; bloqueadoAte: number } | undefined, agora: number): { n: number; desde: number; bloqueadoAte: number } {
  const atual = !r || agora - r.desde > JANELA_RECUSA_MS ? { n: 0, desde: agora, bloqueadoAte: 0 } : { ...r };
  atual.n++;
  if (atual.n >= 20) atual.bloqueadoAte = agora + JANELA_RECUSA_MS;
  return atual;
}

function contarRecusa(req: http.IncomingMessage): void {
  const ip = req.socket.remoteAddress ?? "unknown";
  recusas.set(ip, proximaRecusa(recusas.get(ip), Date.now()));
  if (recusas.size > 256) for (const [k, v] of recusas) if (Date.now() - v.desde > JANELA_RECUSA_MS && v.bloqueadoAte < Date.now()) recusas.delete(k);
}

function recusasDemais(req: http.IncomingMessage): boolean {
  const r = recusas.get(req.socket.remoteAddress ?? "unknown");
  return !!r && r.bloqueadoAte > Date.now();
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
    // Fase 23.2: só rede privada (ou o próprio PC), e o Host tem que ser um IP/o nome deste PC
    // — fecha a porta para a internet (port-forward esquecido) e para DNS rebinding.
    if (!enderecoPermitido(req.socket.remoteAddress)) { req.socket.destroy(); return; }
    if (!hostPermitido(req.headers.host)) { sendJson(res, 421, { error: "Host não aceito" }); return; }
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

    if (recusasDemais(req)) { sendJson(res, 429, { error: "Too many failed attempts" }); return; }

    // Fase 21: o MCP das ferramentas do ELYSIUM para o Hermes. Token próprio no caminho (o
    // cliente MCP do Hermes não manda o nosso cabeçalho), e só do próprio PC.
    if ((req.url ?? "").startsWith("/mcp/")) { await atenderMcp(req, res); return; }

    if (!authorized(req)) {
      contarRecusa(req);
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

    // GET /api/ui/foto?q=… e /api/ui/rota?coords=… — 22/10: fotos e rotas das telas inteligentes
    // (a tela não sai para a internet; o celular pede aqui). Hosts fixos e cache em uiProxy.ts.
    if (req.method === "GET" && (url === "/api/ui/foto" || url === "/api/ui/rota")) {
      const q = new URL(req.url ?? "", "http://127.0.0.1").searchParams;
      if (getConfig().telasComInternet === false) { sendJson(res, 403, { error: "desligado nos Ajustes" }); return; }
      try {
        if (url === "/api/ui/foto") sendJson(res, 200, { fotos: await proxyDoApp().fotos(q.get("q") ?? "") });
        else sendJson(res, 200, { points: await proxyDoApp().rota(q.get("coords") ?? "") });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sendJson(res, /consulta|coords/.test(msg) ? 400 : 502, { error: msg.slice(0, 200) });
      }
      return;
    }

    // GET /api/tts?text=… — a mesma voz neural do PC, em MP3, para o celular tocar (bloco 85).
    // GET e não POST porque quem busca é o player do expo-audio, que só sabe fazer GET com
    // cabeçalhos. O texto passa pelo mesmo limpador da fala (teto de 2600 caracteres, contado depois da expansão).
    if (req.method === "GET" && url === "/api/tts") {
      const texto = new URL(req.url ?? "/", "http://x").searchParams.get("text") ?? "";
      if (!texto.trim()) { sendJson(res, 400, { error: "text vazio" }); return; }
      try {
        // 26/10: WAV quando a voz é a do Gemini, MP3 quando é a do Edge.
        const { audio, tipo } = await sintetizarAudio(texto);
        res.writeHead(200, { "Content-Type": tipo, "Content-Length": audio.length, "Cache-Control": "no-store" });
        res.end(audio);
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
        "Content-Disposition": `attachment; filename="elysium-m-${String(cel.versao).replace(/[^0-9A-Za-z.-]/g, "")}.apk"`,
        "Cache-Control": "no-store",
      });
      fsAtualizacao.createReadStream(cel.arquivo).on("error", () => { if (!res.headersSent) sendJson(res, 404, { error: "Arquivo indisponível" }); else res.destroy(); }).pipe(res);
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

    // PUT /api/mailbox/upload?nome=&tipo=&sessionId=&texto= — 22/10: arquivo grande do celular
    // (até 500 MB), corpo cru em stream direto para o disco. Content-Length obrigatório.
    if (req.method === "PUT" && url === "/api/mailbox/upload") {
      const q = new URL(req.url ?? "", "http://127.0.0.1").searchParams;
      const nome = (q.get("nome") ?? "").trim();
      const tamanho = Number(req.headers["content-length"]);
      if (!nome || nome.length > 200) { sendJson(res, 400, { error: "nome obrigatório" }); return; }
      if (!req.headers["content-length"] || !Number.isInteger(tamanho) || tamanho <= 0) { sendJson(res, 411, { error: "Content-Length obrigatório" }); return; }
      if (tamanho > MAILBOX_MAX_FILE_BYTES) {
        res.writeHead(413, { "Content-Type": "application/json; charset=utf-8", Connection: "close" });
        res.end(JSON.stringify({ error: "arquivo maior que 500 MB" }));
        req.destroy();
        return;
      }
      try {
        const criada = await receberUpload("mobile", req, nome, tamanho, {
          mimeType: q.get("tipo"),
          text: (q.get("texto") ?? "").trim().slice(0, 2000) || null,
          sessionId: (q.get("sessionId") ?? "").trim() || null,
        });
        broadcastMailboxEvent("toDesktop", criada.id);
        sendJson(res, 201, criada);
      } catch (e) {
        if (e instanceof UploadIncompletoError) { if (!res.headersSent && !req.destroyed) sendJson(res, 400, { error: e.message }); return; }
        console.error("[HTTP] upload da caixa falhou:", e);
        if (!res.headersSent && !req.destroyed) sendJson(res, 500, { error: mensagemDeErro(e) });
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

    // GET /api/mailbox/messages/:id/raw — 21/10: o arquivo cru, em stream (vídeo, PDF grande).
    // Mesma autenticação de todo o /api; o caminho em disco vem do store, nunca do pedido.
    const msgRawMatch = url.match(/^\/api\/mailbox\/messages\/([A-Za-z0-9-]{8,64})\/raw$/);
    if (req.method === "GET" && msgRawMatch) {
      const arq = getAttachmentFile(msgRawMatch[1]);
      if (!arq) { sendJson(res, 404, { error: "Not found" }); return; }
      const nomeSeguro = arq.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "arquivo";
      res.writeHead(200, {
        "Content-Type": arq.mimeType,
        "Content-Length": String(arq.sizeBytes),
        "Content-Disposition": `attachment; filename="${nomeSeguro}"; filename*=UTF-8''${encodeURIComponent(arq.name)}`,
        "X-Content-Type-Options": "nosniff",
      });
      const leitura = fsAtualizacao.createReadStream(arq.filePath);
      leitura.on("error", () => res.destroy());
      leitura.pipe(res);
      return;
    }

    // POST /api/mailbox/messages/:id/ack — celular confirma que leu uma mensagem from:"pc"
    const msgAckMatch = url.match(/^\/api\/mailbox\/messages\/([^/]+)\/ack$/);
    if (req.method === "POST" && msgAckMatch) {
      // O corpo é ignorado, mas lido com teto (antes era um for-await sem limite).
      try { await readBody(req); } catch { sendJson(res, 413, { error: "Body too large" }); return; }
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
  // Fase 23.2: mesma barreira de rede do HTTP.
  if (!enderecoPermitido(req.socket.remoteAddress) || !hostPermitido(req.headers.host)) { socket.destroy(); return; }
  // Bloco 200: o upgrade também passa pelo limite (antes só o HTTP passava).
  if (rateLimited(req) || recusasDemais(req)) {
    socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  // Reject unauthenticated upgrades
  if (!authorized(req)) {
    contarRecusa(req);
    registrarAcesso(req, false);
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  const wsKey = req.headers["sec-websocket-key"];
  if (!wsKey || req.headers["upgrade"]?.toLowerCase() !== "websocket" || req.headers["sec-websocket-version"] !== "13") {
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
  // 21/10: quem manda os frames deste cliente. O pedido com id (retomada.ts) guarda esta
  // função; o socket caindo só a solta — o pedido segue e outro socket pode retomar.
  const enviarAqui = (t: string) => sendToClient(client, t);
  socket.on("close", () => { fechado = true; soltarDestino(enviarAqui); });

  const executar = async (texto: string, canal: "voz" | "texto" = "voz", aoPedaco?: (t: string) => void): Promise<{ reply: string; fontes?: Fonte[]; local?: boolean; rapidas?: Rapidas; conversa?: boolean }> => {
    if (!processStream) return { reply: await processCommand(texto, canal) };
    const r = await processStream(texto, aoPedaco ?? ((token) => sendToClient(client, JSON.stringify({ type: "chunk", text: token }))), canal);
    // Bloco 132: as sugestões chegam DEPOIS do reply, numa mensagem própria — o celular já
    // fechou a bolha; app antigo ignora o tipo que não conhece.
    // 22/10: respostas rápidas no próprio reply; com pergunta, sem sugestões de continuação.
    const rapidas = rapidasPara(r.reply, getConfig()) ?? undefined;
    if (deveSugerir(r.actions, canal) && !fechado && !rapidas?.pergunta) {
      sugerirContinuacoes(texto, r.reply)
        .then(sugestoes => { if (sugestoes.length) sendToClient(client, JSON.stringify({ type: "sugestoes", sugestoes })); })
        .catch(() => { /* sem chips */ });
    }
    // `conversa` é o critério da tela (só conversa, sem ação no PC) — vale também para a voz,
    // que não ganha chips mas pode ganhar a oferta de tela (31/10).
    return { reply: r.reply, fontes: r.fontes, local: r.local, rapidas, conversa: deveSugerir(r.actions, "texto") };
  };

  // A tela vai com o ajuste "Telas com internet" (fotos, mapa e rotas) do momento.
  const paraUi = (p: Parameters<typeof enviarUi>[0]) => (f: Record<string, unknown>) => enviarUi(p, { ...f, internet: getConfig().telasComInternet !== false });

  // Fase 22: o trackpad pelo mesmo WebSocket (inputCanal.ts). Um canal por conexão, criado no
  // primeiro frame de entrada — e é aí que o acesso do aparelho é registrado, uma vez só.
  let canalInput: CanalDeInput | null = null;
  let errosDeInput = 0;

  // 31/10: o celular novo anuncia o próximo áudio (`{type:"audio", id, telas}`) antes do frame
  // binário — aí o áudio vira pedido com id (retomada, tela, oferta), como o texto.
  let audioAnunciado: { id: string; telas: boolean } | null = null;

  /**
   * Pedido com id (texto, ou áudio já transcrito): a resposta fica guardada para retomar se o
   * socket cair. Com `comTelas`, pedido explícito e "sim" à oferta vão direto ao gerador.
   */
  function responderPedido(p: Pedido, texto: string, canal: "voz" | "texto", comTelas: boolean, refazer: boolean): void {
    const modoTelas = getConfig().respostasInterativas;
    const atalho = comTelas ? atalhoDeTela(texto, refazer, modoTelas, provedorDeTelas() !== null) : null;
    if (atalho) {
      // "Sim" à oferta ou pedido explícito: direto para o gerador, sem passar pelo agente.
      terminar(p, { type: "reply", reply: "Montando a tela…" });
      void gerarParaCelular(atalho.pergunta, atalho.resposta, geradorDeTelas(), paraUi(p), atalho.daOferta
        ? { pronto: "Pronto, aqui está como tela.", falhou: "Não consegui montar a tela agora. A resposta em texto continua aí em cima." }
        : { pronto: "Pronto, aqui está a tela.", falhou: "Não consegui montar a tela agora. Quer que eu responda em texto?" }, p.id);
      return;
    }
    executar(texto, canal, (t) => pedaco(p, t))
      .then(({ reply, fontes, local, rapidas, conversa }) => {
        if (p.parado) { desfazerTurno(p.texto, reply); return; }
        const tela = comTelas ? depoisDaResposta(texto, reply, conversa === true, modoTelas, provedorDeTelas() !== null) : { reply, gerar: false };
        // Com a oferta no fim, as respostas rápidas viram as da pergunta nova (Sim/Não).
        const rap = tela.reply !== reply ? rapidasPara(tela.reply, getConfig()) ?? undefined : rapidas;
        terminar(p, { type: "reply", reply: tela.reply, ...(fontes?.length ? { fontes } : {}), ...(local ? { local } : {}), ...(rap ? { rapidas: rap } : {}) });
        if (tela.gerar) void gerarParaCelular(texto, reply, geradorDeTelas(), paraUi(p), {}, p.id);
      })
      .catch(err => {
        console.error("[WS] falha ao processar comando:", err);
        terminar(p, { type: "error", error: mensagemDeErro(err) });
      });
  }

  function handleTextFrame(text: string): void {
    try {
      const msg = JSON.parse(text) as { type?: string; text?: string; canal?: string; refazer?: boolean; ev?: unknown; id?: unknown; telas?: unknown; pergunta?: unknown; resposta?: unknown };
      // 21/10: batimento do celular — sem resposta em 2 tentativas ele reabre o socket.
      if (msg.type === "ping") { sendToClient(client, JSON.stringify({ type: "pong" })); return; }
      if (msg.type === "retomar") {
        if (!idValido(msg.id) || !retomar(msg.id, enviarAqui)) sendToClient(client, JSON.stringify({ type: "retomada_falhou", id: idValido(msg.id) ? msg.id : null }));
        return;
      }
      // 23/10: o "Cancelar" do esqueleto da tela no celular.
      if (msg.type === "ui.cancelar") {
        if (idValido(msg.id)) cancelarTelaDoCelular(msg.id);
        return;
      }
      // 23/10: "Ver como tela" (e "Tentar de novo") do celular: gera a tela de uma resposta que já
      // está na tela dele. Os frames `ui` vão com este id, guardados na retomada como os do chat.
      if (msg.type === "ui.ver") {
        if (!idValido(msg.id) || typeof msg.resposta !== "string" || !msg.resposta.trim()) return;
        // "Nunca" nos Ajustes: o esqueleto do celular some (sem tela e sem "tentar de novo").
        if (getConfig().respostasInterativas === "nunca") { sendToClient(client, JSON.stringify({ type: "ui", id: msg.id, falhou: true, cancelada: true })); return; }
        const pergunta = typeof msg.pergunta === "string" ? msg.pergunta.slice(0, 2000) : "";
        const p = abrirPedido(msg.id, pergunta, enviarAqui);
        if (!p) { retomar(msg.id, enviarAqui); return; }
        void gerarParaCelular(pergunta, msg.resposta.slice(0, 6000), geradorDeTelas(), paraUi(p), { falhou: undefined }, msg.id);
        return;
      }
      if (msg.type === "parar") {
        const p = idValido(msg.id) ? parar(msg.id) : null;
        if (p && p.final && typeof p.final.reply === "string") desfazerTurno(p.texto, p.final.reply);
        return;
      }
      if (msg.type === "command" && msg.text && idValido(msg.id)) {
        // Pedido com id: a resposta fica guardada para retomar se o socket cair.
        // 22/10 (Fase 4): o app que desenha telas avisa (`telas: true`); só ele recebe oferta e tela.
        const comTelas = msg.telas === true && msg.canal === "texto";
        if (msg.refazer === true) desfazerUltimoTurno();
        const p = abrirPedido(msg.id, msg.text, enviarAqui);
        if (!p) { retomar(msg.id, enviarAqui); return; } // o mesmo pedido chegou de novo: só reconecta
        responderPedido(p, msg.text, msg.canal === "texto" ? "texto" : "voz", comTelas, msg.refazer === true);
        return;
      }
      if (msg.type === "audio") {
        audioAnunciado = idValido(msg.id) ? { id: msg.id, telas: msg.telas === true } : null;
        return;
      }
      if (msg.type === "input") {
        if (!canalInput) {
          registrarAcesso(req, true);
          canalInput = criarCanal(inputHost, (e) => {
            // Um aviso por conexão a cada 50 falhas — o host caído não pode inundar o log.
            if (errosDeInput++ % 50 === 0) console.warn("[WS] entrada remota falhou:", (e as Error)?.message ?? e);
          });
        }
        const r = canalInput.tratar(msg.ev);
        if (r.pong !== null) sendToClient(client, JSON.stringify({ type: "input.pong", t: r.pong }));
        return;
      }
      if (msg.type === "command" && msg.text) {
        // "Refazer" do celular (bloco 130): o turno anterior sai do histórico, como no dashboard.
        if (msg.refazer === true) desfazerUltimoTurno();
        executar(msg.text, msg.canal === "texto" ? "texto" : "voz")
          // Bloco 131: `fontes` vai junto; app antigo lê só o `reply`.
          .then(({ reply, fontes, local, rapidas }) => {
            if (fechado) { desfazerTurno(msg.text!, reply); console.log("[WS] conexão fechada no meio; resposta descartada."); return; }
            sendToClient(client, JSON.stringify({ type: "reply", reply, ...(fontes?.length ? { fontes } : {}), ...(local ? { local } : {}), ...(rapidas ? { rapidas } : {}) }));
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
    const anuncio = audioAnunciado;
    audioAnunciado = null;
    if (anuncio) {
      // Pedido aberto já na chegada: se o socket cair na transcrição, a retomada acha o pedido.
      const p = abrirPedido(anuncio.id, "", enviarAqui);
      if (!p) { retomar(anuncio.id, enviarAqui); return; }
      audiosEmCurso++;
      try {
        const text = await transcribe(new Uint8Array(audio));
        if (!text) { terminar(p, { type: "error", error: "Could not transcribe audio" }); return; }
        p.texto = text;
        p.destino?.(JSON.stringify({ type: "transcript", text, id: p.id }));
        responderPedido(p, text, "voz", anuncio.telas, false);
      } catch (e) {
        console.error("[WS] falha ao transcrever áudio:", e);
        terminar(p, { type: "error", error: mensagemDeErro(e) });
      } finally {
        audiosEmCurso--;
      }
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
      const { reply, fontes, local, rapidas } = await executar(text);
      // Parado no meio (o mesmo caso do texto): descarta e tira o turno do histórico.
      if (fechado) { desfazerTurno(text, reply); return; }
      sendToClient(client, JSON.stringify({ type: "reply", reply, ...(fontes?.length ? { fontes } : {}), ...(local ? { local } : {}), ...(rapidas ? { rapidas } : {}) }));
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
  // Fase 23.2: teto de conexões e prazos curtos — milhares de sockets parados (slowloris)
  // esgotavam o processo principal; os padrões do Node só cortavam em 60 s/300 s.
  server.maxConnections = 200;
  server.headersTimeout = 15_000;
  server.requestTimeout = 120_000;   // anexo de 5 MB num Wi-Fi ruim ainda cabe

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
  // 31/10: sem sobreposição — se uma leitura demorar mais de 5 s, a próxima espera.
  let lendo = false;
  setInterval(async () => {
    if (wsClients.size === 0 || lendo) return;
    lendo = true;
    try {
      const telem = await getSystemTelemetry();
      broadcastTelemetry(telem);
    } catch { /* best effort */ } finally { lendo = false; }
  }, 5_000);
}
