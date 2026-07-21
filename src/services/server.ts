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
 * Telemetry: every 5 s, sends { type:"telemetry", ...SystemTelemetry } to all WS clients.
 */

import * as http from "node:http";
import * as crypto from "node:crypto";
import type { Socket } from "node:net";
import { transcribe } from "./stt";
import { getSystemTelemetry } from "../actions/systemInfo";

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
  try { client.socket.write(buildTextFrame(text)); } catch { /* gone */ }
}

function broadcastTelemetry(payload: object): void {
  if (wsClients.size === 0) return;
  const frame = buildTextFrame(JSON.stringify({ type: "telemetry", ...payload }));
  for (const c of wsClients) {
    try { c.socket.write(frame); } catch { wsClients.delete(c); }
  }
}

// ── auth helper ───────────────────────────────────────────────────────────────

function authorized(req: http.IncomingMessage, token: string): boolean {
  const hdr = req.headers["authorization"] ?? "";
  if (typeof hdr === "string" && hdr.startsWith("Bearer ")) {
    return hdr.slice(7).trim() === token;
  }
  return false;
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

function makeHandler(
  token: string,
  processCommand: (text: string) => Promise<string>,
): http.RequestListener {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (!authorized(req, token)) {
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

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  };
}

// ── WebSocket upgrade handler ─────────────────────────────────────────────────

function handleUpgrade(
  token: string,
  processCommand: (text: string) => Promise<string>,
  req: http.IncomingMessage,
  socket: Socket,
  head: Buffer,
): void {
  // Reject unauthenticated upgrades
  if (!authorized(req, token)) {
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
      const frame = parseFrame(client.buf);
      if (!frame) break;
      client.buf = client.buf.slice(frame.consumed);

      switch (frame.opcode) {
        case 0x01: // text — control message from client e.g. {"type":"end"}
          handleTextFrame(frame.payload.toString("utf8"));
          break;
        case 0x02: // binary — audio chunk; treat each message as one complete audio file
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
      }
    }
  }

  function handleTextFrame(text: string): void {
    try {
      const msg = JSON.parse(text) as { type?: string; text?: string };
      if (msg.type === "command" && msg.text) {
        processCommand(msg.text)
          .then(reply => sendToClient(client, JSON.stringify({ type: "reply", reply })))
          .catch(err  => sendToClient(client, JSON.stringify({ type: "error", error: String(err) })));
      }
    } catch { /* ignore malformed JSON */ }
  }

  async function processBinaryAudio(audio: Buffer): Promise<void> {
    try {
      const text = await transcribe(new Uint8Array(audio));
      if (!text) {
        sendToClient(client, JSON.stringify({ type: "error", error: "Could not transcribe audio" }));
        return;
      }
      sendToClient(client, JSON.stringify({ type: "transcript", text }));
      const reply = await processCommand(text);
      sendToClient(client, JSON.stringify({ type: "reply", reply }));
    } catch (e) {
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
  const server = http.createServer(makeHandler(token, processCommand));

  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/api/stream")) {
      handleUpgrade(token, processCommand, req, socket as Socket, head);
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
