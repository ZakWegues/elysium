/**
 * NEUROAXIS local server — HTTP + WebSocket (native Node.js, zero extra deps).
 *
 * Security: every request/connection must carry the 32-byte hex token in
 *   Authorization: Bearer <token>
 *
 * Routes:
 *   GET  /api/health            → { status, version }
 *   POST /api/command           → { text } → { reply }
 *   WS   /api/stream            → binary audio frames → STT → reply (text frame)
 *
 *   POST /api/mailbox/messages               → mobile posts a message, { id, createdAt } (from:"mobile")
 *   GET  /api/mailbox/messages               → full thread (both from:"pc" and from:"mobile"), metadata only
 *   GET  /api/mailbox/messages/:id/content   → full content (base64 attachment included)
 *   POST /api/mailbox/messages/:id/ack       → mobile confirms it read a from:"pc" message
 *
 * Telemetry: every 5 s, sends { type:"telemetry", ...SystemTelemetry } to all WS clients.
 */

import * as http from "node:http";
import * as crypto from "node:crypto";
import type { Socket } from "node:net";
import { transcribe } from "./stt";
import { getSystemTelemetry } from "../actions/systemInfo";
import {
  addMessage, listMessages, getMessageContent, ackMessage,
  AttachmentTooLargeError, MailboxKind,
} from "./mailboxStore";

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const PKG_VERSION = "1.0.0";

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
export function setActiveToken(token: string): void {
  activeToken = token;
}

function authorized(req: http.IncomingMessage): boolean {
  const hdr = req.headers["authorization"] ?? "";
  if (typeof hdr === "string" && hdr.startsWith("Bearer ")) {
    return hdr.slice(7).trim() === activeToken;
  }
  return false;
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

function makeHandler(
  processCommand: (text: string) => Promise<string>,
): http.RequestListener {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (!authorized(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const url = req.url?.split("?")[0] ?? "/";

    // GET /api/health
    if (req.method === "GET" && url === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: PKG_VERSION, wsClients: wsClients.size }));
      return;
    }

    // POST /api/command
    if (req.method === "POST" && url === "/api/command") {
      let body = "";
      for await (const chunk of req) body += chunk;
      let text = "";
      try { text = (JSON.parse(body) as { text?: string }).text?.trim() ?? ""; } catch { /* */ }
      if (!text) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing text field" }));
        return;
      }
      try {
        const reply = await processCommand(text);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ reply }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
      }
      return;
    }

    // POST /api/mailbox/messages — celular → servidor, mensagem entra na thread como from:"mobile"
    if (req.method === "POST" && url === "/api/mailbox/messages") {
      let body = "";
      for await (const chunk of req) body += chunk;
      let parsed: {
        kind?: string; text?: string;
        attachment?: { name?: string; mimeType?: string; base64?: string };
      } | null;
      try { parsed = JSON.parse(body); } catch { parsed = null; }

      const kind = parsed?.kind;
      if (!parsed || (kind !== "link" && kind !== "note" && kind !== "file")) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid body: kind must be link|note|file" }));
        return;
      }

      const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
      if (kind !== "file" && !text) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "text is required when kind != file" }));
        return;
      }

      let attachment: { name: string; mimeType: string; base64: string } | undefined;
      if (parsed.attachment) {
        const a = parsed.attachment;
        if (typeof a.name !== "string" || typeof a.mimeType !== "string" || typeof a.base64 !== "string") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid attachment: name, mimeType, base64 must be strings" }));
          return;
        }
        attachment = { name: a.name, mimeType: a.mimeType, base64: a.base64 };
      }
      if (kind === "file" && !attachment) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "attachment is required when kind == file" }));
        return;
      }

      try {
        const { id, createdAt } = addMessage("mobile", { kind: kind as MailboxKind, text: text || null, attachment });
        broadcastMailboxEvent("toDesktop", id);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id, createdAt }));
      } catch (e) {
        if (e instanceof AttachmentTooLargeError) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "attachment too large, max 5MB" }));
          return;
        }
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
      }
      return;
    }

    // GET /api/mailbox/messages — thread completa (from:"pc" e from:"mobile"), só metadados
    if (req.method === "GET" && url === "/api/mailbox/messages") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: listMessages() }));
      return;
    }

    // GET /api/mailbox/messages/:id/content — conteúdo completo (com base64 do anexo)
    const msgContentMatch = url.match(/^\/api\/mailbox\/messages\/([^/]+)\/content$/);
    if (req.method === "GET" && msgContentMatch) {
      const content = getMessageContent(msgContentMatch[1]);
      if (!content) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(content));
      return;
    }

    // POST /api/mailbox/messages/:id/ack — celular confirma que leu uma mensagem from:"pc"
    const msgAckMatch = url.match(/^\/api\/mailbox\/messages\/([^/]+)\/ack$/);
    if (req.method === "POST" && msgAckMatch) {
      for await (const _chunk of req) { /* drain body, ignored */ }
      const ok = ackMessage(msgAckMatch[1]);
      if (!ok) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  };
}

// ── WebSocket upgrade handler ─────────────────────────────────────────────────

function handleUpgrade(
  processCommand: (text: string) => Promise<string>,
  req: http.IncomingMessage,
  socket: Socket,
  head: Buffer,
): void {
  // Reject unauthenticated upgrades
  if (!authorized(req)) {
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
  wsClients.add(client);

  // Accumulate audio binary blobs from mobile; process each complete message independently.
  const audioAccum: Buffer[] = [];

  function processBuffer(): void {
    while (client.buf.length >= 2) {
      const finBit = (client.buf[0] & 0x80) !== 0;
      const frame = parseFrame(client.buf);
      if (!frame) break;
      client.buf = client.buf.slice(frame.consumed);

      console.log(`[WS] frame recebido: opcode=0x${frame.opcode.toString(16)} fin=${finBit} payload=${frame.payload.length}b`);

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
        case 0x00: // continuation — não suportado, ver aviso acima em 0x02
          console.error(`[WS] frame de continuação (0x00) recebido e ignorado — ${frame.payload.length} bytes de áudio perdidos`);
          break;
        default:
          console.error(`[WS] opcode desconhecido/não tratado: 0x${frame.opcode.toString(16)}`);
      }
    }
  }

  function handleTextFrame(text: string): void {
    try {
      const msg = JSON.parse(text) as { type?: string; text?: string };
      if (msg.type === "command" && msg.text) {
        processCommand(msg.text)
          .then(reply => sendToClient(client, JSON.stringify({ type: "reply", reply })))
          .catch(err  => {
            console.error("[WS] falha ao processar comando de texto:", err);
            sendToClient(client, JSON.stringify({ type: "error", error: String(err) }));
          });
      }
    } catch (e) {
      console.error("[WS] frame de texto não é JSON válido:", e, "raw:", text.slice(0, 200));
    }
  }

  async function processBinaryAudio(audio: Buffer): Promise<void> {
    console.log(`[WS] processando áudio binário: ${audio.length} bytes`);
    try {
      const text = await transcribe(new Uint8Array(audio));
      if (!text) {
        console.error("[WS] transcribe() retornou vazio — ver logs [STT] acima pro motivo");
        sendToClient(client, JSON.stringify({ type: "error", error: "Could not transcribe audio" }));
        return;
      }
      sendToClient(client, JSON.stringify({ type: "transcript", text }));
      const reply = await processCommand(text);
      sendToClient(client, JSON.stringify({ type: "reply", reply }));
    } catch (e) {
      console.error("[WS] falha ao processar áudio (transcrição ou comando):", e);
      sendToClient(client, JSON.stringify({ type: "error", error: String(e) }));
    }
  }

  socket.on("data", (chunk: Buffer) => {
    client.buf = Buffer.concat([client.buf, chunk]);
    processBuffer();
  });

  socket.on("close", () => { wsClients.delete(client); });
  socket.on("error", () => { wsClients.delete(client); });

  void audioAccum; // referenced inside closures above
}

// ── public API ────────────────────────────────────────────────────────────────

export function startServer(
  token: string,
  processCommand: (text: string) => Promise<string>,
  port = 4200,
): void {
  activeToken = token;
  const server = http.createServer(makeHandler(processCommand));

  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/api/stream")) {
      handleUpgrade(processCommand, req, socket as Socket, head);
    } else {
      (socket as Socket).destroy();
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[NEUROAXIS server] listening on 0.0.0.0:${port}`);
  });

  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      console.warn(`[NEUROAXIS server] port ${port} in use, skipping server.`);
    } else {
      console.error("[NEUROAXIS server] error:", e.message);
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
