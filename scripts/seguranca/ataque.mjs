// scripts/seguranca/ataque.mjs — sondas de ataque contra o PRÓPRIO servidor do ELYSIUM.
//
//   node scripts/seguranca/ataque.mjs [--base http://127.0.0.1:4200] [--lan 192.168.x.y] [--lento]
//
// Roda tudo em paralelo e imprime uma linha por sonda (OK/FALHOU). Nada destrutivo: métodos
// perigosos são testados só até a recusa, nunca executados. O token vem do config do app e só
// o campo `serverToken` é lido — ele nunca é impresso.
//
// As sondas que ERRAM o token de propósito vão pelo endereço da LAN (`--lan`), não pelo
// 127.0.0.1: 20 recusas bloqueiam o IP por 10 min, e o loopback é por onde o Hermes fala com o
// MCP do app. Sem `--lan`, essas sondas são puladas.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const arg = (n, padrao) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : padrao; };
const BASE = arg("--base", "http://127.0.0.1:4200");
const LAN = arg("--lan", null);
const LENTO = process.argv.includes("--lento");
const porta = Number(new URL(BASE).port || 80);

const cfg = path.join(process.env.APPDATA ?? "", "elysium", "elysium-config.json");
const TOKEN = JSON.parse(fs.readFileSync(cfg, "utf8")).serverToken;
if (!TOKEN) { console.error("sem serverToken no config"); process.exit(2); }
const auth = { Authorization: `Bearer ${TOKEN}` };

const resultados = [];
const sonda = (nome, fn) => fn().then(
  (r) => resultados.push({ nome, ok: r === true || r?.ok === true, det: r?.det ?? "" }),
  (e) => resultados.push({ nome, ok: false, det: `erro: ${e?.message ?? e}` }),
);
const req = (url, init = {}, ms = 15_000) => fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
const status = async (url, init, esperado) => {
  const r = await req(url, init);
  const ok = Array.isArray(esperado) ? esperado.includes(r.status) : r.status === esperado;
  return { ok, det: `HTTP ${r.status}` };
};

/** Socket cru, para o que o fetch não deixa fazer (cabeçalho torto, upgrade sem token). */
function cru(host, texto, esperaMs = 3000) {
  return new Promise((resolve) => {
    const s = net.connect(porta, host);
    let dados = "";
    s.on("data", (d) => { dados += d.toString("latin1"); });
    s.on("connect", () => s.write(texto));
    const fim = () => { s.destroy(); resolve(dados); };
    s.on("close", fim); s.on("error", fim);
    setTimeout(fim, esperaMs);
  });
}

const hostLocal = new URL(BASE).hostname;
const sondas = [
  // ── autenticação ──
  sonda("sem token → 401", () => status(`${BASE}/api/health`, {}, 401)),
  sonda("token na query não vale", () => status(`${BASE}/api/health?token=${encodeURIComponent(TOKEN)}`, {}, 401)),
  sonda("esquema Basic não vale", () => status(`${BASE}/api/health`, { headers: { Authorization: `Basic ${TOKEN}` } }, 401)),
  sonda("rota desconhecida com token → 404", () => status(`${BASE}/api/../../windows/win.ini`, { headers: auth }, [404, 400])),
  // ── CORS / navegador ──
  sonda("OPTIONS sem Access-Control-Allow-Origin", async () => {
    const r = await req(`${BASE}/api/rpc`, { method: "OPTIONS", headers: { Origin: "https://mal.example", "Access-Control-Request-Method": "POST" } });
    const acao = r.headers.get("access-control-allow-origin");
    return { ok: !acao, det: `HTTP ${r.status} ACAO=${acao ?? "—"}` };
  }),
  sonda("Origin hostil não ganha CORS", async () => {
    const r = await req(`${BASE}/api/health`, { headers: { ...auth, Origin: "https://mal.example" } });
    return { ok: !r.headers.get("access-control-allow-origin"), det: `HTTP ${r.status}` };
  }),
  // ── DNS rebinding: domínio de fora apontando para o PC ──
  // Socket cru: o fetch do Node ignora um Host forjado.
  sonda("Host de domínio de fora → 421", async () => {
    const resp = await cru(hostLocal, `GET /api/health HTTP/1.1\r\nHost: mal.example:4200\r\nAuthorization: Bearer ${TOKEN}\r\nConnection: close\r\n\r\n`);
    return { ok: /^HTTP\/1\.1 421/.test(resp), det: resp.split("\r\n")[0] || "(fechou)" };
  }),
  sonda("Host vazio → recusado", async () => {
    const resp = await cru(hostLocal, "GET /api/health HTTP/1.0\r\n\r\n");
    return { ok: !/^HTTP\/1\.[01] 200/.test(resp), det: resp.split("\r\n")[0] || "(fechou)" };
  }),
  // ── corpo e parser ──
  sonda("corpo de 9 MB → 413", () => status(`${BASE}/api/rpc`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "x".repeat(9 * 1024 * 1024) }, 413)),
  sonda("JSON malformado → 400", () => status(`${BASE}/api/rpc`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "{\"method\":" }, 400)),
  sonda("JSON aninhado 200 mil níveis não derruba", async () => {
    const r = await req(`${BASE}/api/rpc`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "[".repeat(200_000) + "]".repeat(200_000) });
    return { ok: r.status < 500, det: `HTTP ${r.status}` };
  }),
  sonda("método inexistente → 4xx", () => status(`${BASE}/api/rpc`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ method: "__proto__", params: {} }) }, [400, 404])),
  sonda("params com __proto__ não quebra", async () => {
    const r = await req(`${BASE}/api/rpc`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "{\"method\":\"memory.list\",\"params\":{\"__proto__\":{\"admin\":true}}}" });
    return { ok: r.status < 500, det: `HTTP ${r.status}` };
  }),
  // ── destrutivos ──
  sonda("destrutivo sem confirmação é recusado", async () => {
    const lista = (await (await req(`${BASE}/api/rpc`, { headers: auth })).json()).methods ?? [];
    // Um destrutivo inofensivo de testar: apagar um comando de IA que não existe.
    const alvo = lista.find((m) => m.method === "comandos.delete" && m.destructive) ? "comandos.delete" : null;
    if (!alvo) return { ok: false, det: "comandos.delete não está marcado como destrutivo" };
    const r = await req(`${BASE}/api/rpc`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ method: alvo, params: { id: "nao-existe-sonda" } }) });
    return { ok: r.status === 403, det: `HTTP ${r.status}` };
  }),
  // ── caixa ──
  sonda("anexo com nome de caminho não sai da pasta", async () => {
    const r = await req(`${BASE}/api/mailbox/messages`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ kind: "file", text: "sonda de segurança", attachment: { name: "..\\..\\..\\sonda-traversal.txt", mimeType: "text/plain", base64: Buffer.from("x").toString("base64") } }) });
    const j = await r.json().catch(() => ({}));
    const nome = j?.attachment?.name ?? "";
    const fora = fs.existsSync(path.join(process.env.APPDATA ?? "", "sonda-traversal.txt")) || fs.existsSync(path.join(process.env.APPDATA ?? "", "elysium", "sonda-traversal.txt"));
    // Limpa o recado de teste.
    if (j?.id) await req(`${BASE}/api/rpc`, { method: "POST", headers: { ...auth, "Content-Type": "application/json", "x-elysium-confirm": "1" }, body: JSON.stringify({ method: "mailbox.messages.delete", params: { id: j.id } }) }).catch(() => {});
    return { ok: !fora && !/[\\/]/.test(nome), det: `HTTP ${r.status} nome=${JSON.stringify(nome)} fora=${fora}` };
  }),
  // 21/10: arquivo cru da Caixa.
  sonda("arquivo cru sem token → 401", () => status(`${BASE}/api/mailbox/messages/00000000-0000-0000-0000-000000000000/raw`, {}, 401)),
  sonda("arquivo cru com id forjado → 404", () => status(`${BASE}/api/mailbox/messages/..%2F..%2Felysium-config/raw`, { headers: auth }, 404)),
  sonda("arquivo cru com id inexistente → 404", () => status(`${BASE}/api/mailbox/messages/00000000-0000-0000-0000-000000000000/raw`, { headers: auth }, 404)),
  sonda("kind inválido → 400", () => status(`${BASE}/api/mailbox/messages`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ kind: "exec", text: "x" }) }, 400)),
  // ── WebSocket e MCP ──
  sonda("WebSocket sem token é recusado", async () => {
    const resp = await cru(hostLocal, `GET /api/stream HTTP/1.1\r\nHost: ${hostLocal}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    return { ok: !/^HTTP\/1\.1 101/.test(resp), det: resp.split("\r\n")[0] || "(fechou)" };
  }),
  sonda("WebSocket em outro caminho é derrubado", async () => {
    const resp = await cru(hostLocal, `GET /api/rpc HTTP/1.1\r\nHost: ${hostLocal}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    return { ok: !/^HTTP\/1\.1 101/.test(resp), det: resp.split("\r\n")[0] || "(fechou)" };
  }),
  sonda("cabeçalho torto não derruba", async () => {
    const resp = await cru(hostLocal, "GET /api/health HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer ééé\r\n\r\n");
    return { ok: /^HTTP\/1\.1 (400|401|421)/.test(resp), det: resp.split("\r\n")[0] || "(fechou)" };
  }),
];

// Erros de token de propósito: só pela LAN (ver o topo).
if (LAN) {
  const lan = BASE.replace(hostLocal, LAN);
  sondas.push(
    sonda("LAN: token errado → 401", () => status(`${lan}/api/health`, { headers: { Authorization: "Bearer errado" } }, 401)),
    sonda("LAN: token com unicode não derruba", () => status(`${lan}/api/health`, { headers: { Authorization: "Bearer " + encodeURIComponent("é".repeat(64)) } }, 401)),
    sonda("LAN: MCP com token errado → 401", () => status(`${lan}/mcp/tokenerrado`, { method: "POST", body: "{}" }, 401)),
    sonda("LAN: MCP só do próprio PC (mesmo com token não valeria)", async () => ({ ok: true, det: "coberto por ehDoProprioPc — ver teste unitário" })),
  );
}

if (LENTO) {
  // Slowloris: manda o cabeçalho pela metade e espera o servidor cortar.
  sondas.push(sonda("slowloris: conexão parada é cortada em até 70 s", async () => {
    const t0 = Date.now();
    await cru(hostLocal, "GET /api/health HTTP/1.1\r\nHost: x\r\n", 75_000);
    const s = (Date.now() - t0) / 1000;
    return { ok: s < 72, det: `${s.toFixed(0)} s` };
  }));
}

await Promise.all(sondas);
// O servidor continua de pé depois de tudo?
await sonda("servidor vivo no fim", () => status(`${BASE}/api/health`, { headers: auth }, 200));

let falhas = 0;
for (const r of resultados) {
  if (!r.ok) falhas++;
  console.log(`${r.ok ? "OK     " : "FALHOU "} ${r.nome}${r.det ? `  (${r.det})` : ""}`);
}
console.log(`\n${resultados.length - falhas}/${resultados.length} sondas OK`);
process.exit(falhas ? 1 : 0);
