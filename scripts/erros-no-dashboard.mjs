/**
 * Recarrega o dashboard, percorre as abas e imprime toda exceção e `console.error` do
 * renderer nesse caminho.
 *
 * POR QUE ISTO EXISTE
 *
 * O bloco 76 partiu o `<script>` único em 14 arquivos. Uma função chamada no nível do
 * arquivo antes de o arquivo que a define ter carregado é `ReferenceError` na abertura — e
 * o `eval-no-dashboard.mjs` chega depois, quando o erro já passou. Aqui o ouvinte é ligado
 * ANTES do `reload`, então pega o que acontece no arranque.
 *
 * USO
 *   ELYSIUM_DEBUG_PORT=9333 node scripts/erros-no-dashboard.mjs
 */
const PORTA = Number(process.env.ELYSIUM_DEBUG_PORT || 9222);

const alvos = await fetch(`http://127.0.0.1:${PORTA}/json`).then(r => r.json()).catch(() => null);
const alvo = alvos?.find(t => t.type === "page" && /dashboard\.html/.test(t.url));
if (!alvo) { console.error("Dashboard não encontrado na porta", PORTA); process.exit(1); }

const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((ok, falha) => { ws.addEventListener("open", ok); ws.addEventListener("error", falha); });

let id = 0;
const pendentes = new Map();
const erros = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pendentes.has(msg.id)) { pendentes.get(msg.id)(msg.result); pendentes.delete(msg.id); return; }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    erros.push(`EXCEÇÃO ${d.text} ${d.exception?.description?.split("\n")[0] ?? ""} (${d.url?.split("/").pop()}:${d.lineNumber})`);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    erros.push("console.error " + msg.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 200));
  }
});
const cmd = (method, params = {}) => new Promise(ok => { const n = ++id; pendentes.set(n, ok); ws.send(JSON.stringify({ id: n, method, params })); });
const espera = (ms) => new Promise(r => setTimeout(r, ms));

await cmd("Runtime.enable");
await cmd("Page.enable");
await cmd("Page.reload");
await espera(5000);

// Percorre as abas, abre uma gaveta de cada tipo e a paleta.
const passos = [
  `switchView("inicio")`, `switchView("chat")`, `switchView("pc")`, `abrirPainelPc("programas")`, `fecharGaveta()`,
  `switchView("rotinas")`, `abrirFormRotina()`, `fecharGaveta()`, `switchView("ajustes")`, `abrirSecao("aparencia")`,
  `fecharGaveta()`, `abrirPaleta()`, `fecharPaleta()`, `switchView("inicio")`,
];
for (const p of passos) {
  const r = await cmd("Runtime.evaluate", { expression: p, awaitPromise: true });
  if (r?.exceptionDetails) erros.push(`ao rodar ${p}: ${r.exceptionDetails.exception?.description?.split("\n")[0]}`);
  await espera(400);
}
await espera(1500);

if (erros.length) { console.log(`${erros.length} problema(s):`); for (const e of erros) console.log(" -", e); process.exit(2); }
console.log("Sem exceções nem console.error no arranque e nas abas.");
ws.close();
process.exit(0);
