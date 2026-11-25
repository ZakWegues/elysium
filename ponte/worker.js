/**
 * A ponte do ELYSIUM (25/11): o PC e o celular ligam para cá, cada um, e os bytes passam de um lado
 * para o outro. Nada aqui tem chave: o conteúdo já vem cifrado de ponta a ponta (ponteCripto.ts).
 *
 *   /pc/<sala>   o PC, com o segredo da ponte (Bearer)
 *   /cel/<sala>  o celular, com a credencial dele (Bearer); só entra se o PC a autorizou
 *
 * PC → aqui:  texto = JSON de controle; binário = [u32 conexão][bytes]
 * aqui → PC:  texto = { abriu, quem } | { fechou }; binário = [u32 conexão][bytes]
 * celular:    binário puro, nos dois sentidos
 *
 * Com hibernação: parada, não gasta. O "p" do PC é respondido sem acordar a sala.
 */

const MAX_CELULARES = 8;
const MAX_QUADRO = 512 * 1024;

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (t) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));

/** Tempo igual para qualquer diferença (compara os hashes). */
async function iguais(a, b) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

const bearer = (req) => (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");

export class Sala {
  constructor(ctx) {
    this.ctx = ctx;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("p", "q"));
  }

  pc() { return this.ctx.getWebSockets("pc").find((w) => w.readyState === WebSocket.OPEN); }

  async fetch(req) {
    const lado = new URL(req.url).pathname.split("/")[1];
    const [cliente, servidor] = Object.values(new WebSocketPair());
    if (lado === "pc") {
      for (const velho of this.ctx.getWebSockets("pc")) { try { velho.close(4409, "outra conexão do PC"); } catch { /* já fechado */ } }
      for (const c of this.ctx.getWebSockets("cel")) { try { c.close(4404, "o PC reconectou"); } catch { /* já fechado */ } }
      this.ctx.acceptWebSocket(servidor, ["pc"]);
      return new Response(null, { status: 101, webSocket: cliente });
    }
    const quem = await sha256(bearer(req));
    const permitidos = (await this.ctx.storage.get("permitidos")) ?? [];
    if (!permitidos.includes(quem)) return new Response("recusado", { status: 403 });
    const pc = this.pc();
    if (!pc) return new Response("o PC não está ligado na ponte", { status: 503 });
    if (this.ctx.getWebSockets("cel").length >= MAX_CELULARES) return new Response("conexões demais", { status: 429 });
    const n = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    this.ctx.acceptWebSocket(servidor, ["cel", `c${n}`]);
    servidor.serializeAttachment({ n, quem });
    pc.send(JSON.stringify({ abriu: n, quem }));
    return new Response(null, { status: 101, webSocket: cliente });
  }

  async webSocketMessage(ws, msg) {
    const tam = typeof msg === "string" ? msg.length : msg.byteLength;
    if (tam > MAX_QUADRO) { ws.close(1009, "grande demais"); return; }
    const cel = ws.deserializeAttachment();
    if (cel) {
      if (typeof msg === "string") return;
      const pc = this.pc();
      if (!pc) { ws.close(4404, "o PC saiu"); return; }
      const quadro = new Uint8Array(4 + msg.byteLength);
      new DataView(quadro.buffer).setUint32(0, cel.n);
      quadro.set(new Uint8Array(msg), 4);
      pc.send(quadro);
      return;
    }
    if (typeof msg === "string") {
      let m;
      try { m = JSON.parse(msg); } catch { return; }
      if (Array.isArray(m.permitidos)) {
        const lista = m.permitidos.filter((x) => /^[0-9a-f]{64}$/.test(x)).slice(0, 32);
        await this.ctx.storage.put("permitidos", lista);
        for (const c of this.ctx.getWebSockets("cel")) if (!lista.includes(c.deserializeAttachment()?.quem)) c.close(4403, "revogado");
      }
      if (typeof m.fechar === "number") for (const c of this.ctx.getWebSockets(`c${m.fechar}`)) c.close(4400, "fechado pelo PC");
      return;
    }
    const n = new DataView(msg).getUint32(0);
    for (const c of this.ctx.getWebSockets(`c${n}`)) { try { c.send(msg.slice(4)); } catch { /* fechando */ } }
  }

  async webSocketClose(ws, codigo) { this.saiu(ws, codigo); }
  async webSocketError(ws) { this.saiu(ws, 1011); }

  saiu(ws, codigo) {
    const cel = ws.deserializeAttachment();
    try { ws.close(codigo >= 1000 && codigo !== 1005 && codigo !== 1006 ? codigo : 1000); } catch { /* já fechado */ }
    if (cel) { try { this.pc()?.send(JSON.stringify({ fechou: cel.n })); } catch { /* o PC também saiu */ } return; }
    if (!this.pc()) for (const c of this.ctx.getWebSockets("cel")) { try { c.close(4404, "o PC saiu"); } catch { /* já fechado */ } }
  }
}

export default {
  async fetch(req, env) {
    const m = /^\/(pc|cel)\/([0-9a-f]{32})$/.exec(new URL(req.url).pathname);
    if (!m) return new Response("ok");
    if (req.headers.get("upgrade") !== "websocket") return new Response("só WebSocket", { status: 426 });
    const credencial = bearer(req);
    if (!/^[0-9a-f]{64}$/.test(credencial)) return new Response("recusado", { status: 403 });
    if (m[1] === "pc" && !(env.PONTE_SEGREDO && (await iguais(credencial, env.PONTE_SEGREDO)))) return new Response("recusado", { status: 403 });
    return env.SALA.get(env.SALA.idFromName(m[2])).fetch(req);
  },
};
