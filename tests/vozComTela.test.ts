import { describe, expect, it, vi } from "vitest";
import net from "node:net";
import crypto from "node:crypto";

/**
 * 31/10: o áudio do celular anunciado com id (`{type:"audio", id, telas:true}`) segue o caminho
 * do texto — pedido explícito de tela vira tela; sem anúncio, o áudio continua como antes.
 * Servidor de verdade numa porta local; transcrição e gerador são dublês.
 */
vi.mock("../src/services/stt", () => ({ transcribe: async (a: Uint8Array) => new TextDecoder().decode(a) }));
vi.mock("../src/services/geradorDeTelas", async (orig) => ({
  ...(await orig<typeof import("../src/services/geradorDeTelas")>()),
  provedorDeTelas: () => "gemini",
  geradorDeTelas: () => async () => null,
}));
vi.mock("../src/services/telaInteligente", async (orig) => ({
  ...(await orig<typeof import("../src/services/telaInteligente")>()),
  gerarTela: async () => ({ programa: "root = Card([])", ms: 1, tentativas: 1, provedor: "gemini" }),
}));

const TOKEN = "token-de-teste";
const PORTA = 47_000 + Math.floor(Math.random() * 2000);
const respostas: string[] = [];

function frame(opcode: number, dados: Buffer): Buffer {
  const mascara = crypto.randomBytes(4);
  const corpo = Buffer.from(dados.map((b, i) => b ^ mascara[i % 4]));
  const cab = dados.length < 126
    ? Buffer.from([0x80 | opcode, 0x80 | dados.length])
    : Buffer.from([0x80 | opcode, 0x80 | 126, dados.length >> 8, dados.length & 0xff]);
  return Buffer.concat([cab, mascara, corpo]);
}

/** Cliente WS mínimo: manda frames e junta as mensagens de texto do servidor. */
async function conectar(): Promise<{ texto: (o: unknown) => void; binario: (s: string) => void; msgs: Record<string, unknown>[] }> {
  const sock = net.connect(PORTA, "127.0.0.1");
  await new Promise<void>((ok) => sock.once("connect", () => ok()));
  sock.write(`GET /api/stream HTTP/1.1\r\nHost: 127.0.0.1:${PORTA}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString("base64")}\r\nSec-WebSocket-Version: 13\r\nAuthorization: Bearer ${TOKEN}\r\n\r\n`);
  const msgs: Record<string, unknown>[] = [];
  let buf = Buffer.alloc(0);
  let cabecalho = false;
  sock.on("data", (c: Buffer) => {
    buf = Buffer.concat([buf, c]);
    if (!cabecalho) {
      const fim = buf.indexOf("\r\n\r\n");
      if (fim < 0) return;
      buf = buf.subarray(fim + 4);
      cabecalho = true;
    }
    while (buf.length >= 2) {
      let len = buf[1] & 0x7f, ini = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); ini = 4; }
      if (buf.length < ini + len) return;
      if ((buf[0] & 0x0f) === 0x01) msgs.push(JSON.parse(buf.subarray(ini, ini + len).toString("utf8")));
      buf = buf.subarray(ini + len);
    }
  });
  // Os frames só saem depois do 101 — antes disso o servidor ainda não trata o socket como WS.
  await esperar(() => cabecalho);
  return {
    texto: (o) => sock.write(frame(0x01, Buffer.from(JSON.stringify(o)))),
    binario: (s) => sock.write(frame(0x02, Buffer.from(s))),
    msgs,
  };
}

async function esperar(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(cond()).toBe(true);
}

describe("telas pela voz no celular", async () => {
  const { startServer } = await import("../src/services/server");
  startServer(TOKEN, async (t) => { respostas.push(t); return "ok"; }, PORTA);
  await new Promise((r) => setTimeout(r, 100));

  it("áudio anunciado com pedido de gráfico: transcrição e frames com o id, e a tela chega", async () => {
    const c = await conectar();
    const id = "audio-1234567890";
    c.texto({ type: "audio", id, telas: true });
    c.binario("me mostra num gráfico a população das capitais");
    await esperar(() => c.msgs.some((m) => m.type === "ui" && typeof m.programa === "string"));
    expect(c.msgs.find((m) => m.type === "transcript")).toMatchObject({ id, text: "me mostra num gráfico a população das capitais" });
    expect(c.msgs.find((m) => m.type === "reply")).toMatchObject({ id, reply: "Montando a tela…" });
    expect(c.msgs.filter((m) => m.type === "ui").every((m) => m.id === id)).toBe(true);
  });

  it("áudio sem anúncio (app antigo): resposta comum, sem id nem tela", async () => {
    const c = await conectar();
    c.binario("que horas são");
    await esperar(() => c.msgs.some((m) => m.type === "reply"));
    expect(c.msgs.find((m) => m.type === "reply")).toEqual({ type: "reply", reply: "ok" });
    expect(c.msgs.some((m) => m.type === "ui")).toBe(false);
  });
});
