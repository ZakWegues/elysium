/**
 * Captura a janela do dashboard e grava um PNG.
 *
 * POR QUE ISTO EXISTE
 *
 * A verificação programática (`eval-no-dashboard.mjs`) prova que o dado chegou e que a
 * classe foi aplicada — e mesmo assim a tela pode estar errada. No bloco 18 a tela Início
 * nasceu espremida numa coluna estreita com metade da janela vazia, e todo o `eval` dizia
 * que estava certo: era `#layout` sendo flex e o painel sem `flex` encolhendo até o
 * conteúdo. Só a captura pegou.
 *
 * O app precisa estar rodando com `--remote-debugging-port=9222`.
 *
 * USO
 *   node scripts/shot.mjs saida.png
 *   node scripts/shot.mjs saida.png inicio      # troca de aba antes de capturar
 *
 * ⚠️ Desfoque de vidro NÃO aparece na captura (§14 do handoff), e animação também não.
 * Para essas duas coisas o veredito continua sendo olhar a tela.
 */
import fs from "node:fs";

const PORTA = Number(process.env.ELYSIUM_DEBUG_PORT || 9222);
const saida = process.argv[2] || "shot.png";
const aba = process.argv[3];

const alvos = await fetch(`http://127.0.0.1:${PORTA}/json`).then(r => r.json()).catch(() => null);
if (!alvos) {
  console.error(`Não achei a porta de depuração em ${PORTA}.`);
  process.exit(1);
}
const alvo = alvos.find(t => t.type === "page" && /dashboard\.html/.test(t.url));
if (!alvo) {
  console.error("Dashboard não encontrado. Janelas abertas:");
  for (const t of alvos) console.error(`  [${t.type}] ${t.url}`);
  process.exit(1);
}

const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((ok, falha) => {
  ws.addEventListener("open", ok);
  ws.addEventListener("error", () => falha(new Error("falha ao abrir o WebSocket de depuração")));
});

let id = 0;
const pendentes = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  const p = pendentes.get(msg.id);
  if (!p) return;
  pendentes.delete(msg.id);
  msg.error ? p.falha(new Error(msg.error.message)) : p.ok(msg.result);
});
const cmd = (method, params = {}) =>
  new Promise((ok, falha) => { const n = ++id; pendentes.set(n, { ok, falha }); ws.send(JSON.stringify({ id: n, method, params })); });

if (aba) {
  await cmd("Runtime.evaluate", { expression: `switchView(${JSON.stringify(aba)})`, awaitPromise: true });
  // O bloco 24 anima a troca; capturar antes do fim pegaria o quadro do meio.
  await new Promise(r => setTimeout(r, 550));
}

// `captureScreenshot` fica PENDURADO PARA SEMPRE se a janela não estiver visível: o
// compositor do Chromium não produz quadro nenhum com a janela oculta, e o comando
// simplesmente nunca responde — sem erro, sem timeout. Foi o que travou este script no
// bloco 18, e a causa não é o script, é a janela.
//
// O dashboard se esconde ao perder o foco. Para trazê-lo de volta, abra uma segunda
// instância do app: o `second-instance` do main chama `dashWin.show()`.
const {result: vis} = await cmd("Runtime.evaluate", { expression: "document.visibilityState", returnByValue: true });
if (vis?.value === "hidden") {
  console.error("A janela do dashboard está oculta — não há quadro para capturar.");
  console.error("Abra o app de novo (segunda instância) para mostrá-la e repita.");
  process.exit(2);
}
await cmd("Page.bringToFront");
const { data } = await cmd("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(saida, Buffer.from(data, "base64"));
console.log(`${saida} (${(fs.statSync(saida).size / 1024).toFixed(0)} kB)`);
ws.close();
process.exit(0);
