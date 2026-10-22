// Prova da galeria: abre o Edge headless (fora da tela), carrega a galeria, espera os quadros
// montarem e captura PNG. Também devolve os erros que as telas mandaram ao host.
//   node scripts/prova.mjs <saida.png> "<query da galeria>" [largura]
// Exige o servidor da galeria de pé (node scripts/servir.mjs).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [saida, query = "", largura = "800"] = process.argv.slice(2);
const EDGE = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
const PORTA = 9444;
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "edge-prova-"));
const edge = spawn(EDGE, ["--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`, `--window-size=${largura},1000`, "about:blank"], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let alvo;
for (let i = 0; i < 40 && !alvo; i++) {
  await esperar(250);
  try { alvo = (await (await fetch(`http://127.0.0.1:${PORTA}/json`)).json()).find((t) => t.type === "page"); } catch { /* subindo */ }
}
const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pendentes = new Map();
const eventos = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m); pendentes.delete(m.id); return; }
  // Console e falhas de rede de todos os quadros (Log cobre os iframes).
  // iframe anexado: liga o console dele também.
  if (m.method === "Target.attachedToTarget") { const sid = m.params.sessionId; ws.send(JSON.stringify({ id: ++seq, sessionId: sid, method: "Runtime.enable" })); ws.send(JSON.stringify({ id: ++seq, sessionId: sid, method: "Runtime.runIfWaitingForDebugger" })); }
  if (m.method === "Runtime.consoleAPICalled") eventos.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`.slice(0, 300));
  if (m.method === "Runtime.exceptionThrown") eventos.push(`exceção: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`.slice(0, 300));
  if (m.method === "Log.entryAdded" && m.params.entry.level !== "verbose") eventos.push(`${m.params.entry.level}: ${m.params.entry.text}`.slice(0, 300));
});
const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pendentes.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const avaliar = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await cdp("Page.enable");
await cdp("Log.enable");
await cdp("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
// Viewport alto desde o começo: o Chrome não pinta iframe de origem cruzada fora da área visível.
await cdp("Emulation.setDeviceMetricsOverride", { width: Number(largura), height: Number(process.env.ALTURA ?? 16000), deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: `http://127.0.0.1:8095/galeria.html?${query}` });
// Pronto = todo quadro com altura > 40 px e estável por 1,5 s (ou 25 s no máximo).
let anterior = "", estavel = 0;
const t0 = Date.now();
for (let i = 0; i < Number(process.env.PRAZO_S ?? 25) * 4 && estavel < 6; i++) {
  await esperar(250);
  const alturas = await avaliar(`JSON.stringify([...document.querySelectorAll("iframe")].map(f => f.style.height))`);
  const prontas = alturas && JSON.parse(alturas).length && JSON.parse(alturas).every((h) => parseInt(h) > 40);
  estavel = prontas && alturas === anterior ? estavel + 1 : 0;
  anterior = alturas;
}
await esperar(700); // a cascata de entrada termina
const altura = await avaliar("Math.ceil(document.documentElement.scrollHeight)");
await cdp("Emulation.setDeviceMetricsOverride", { width: Number(largura), height: Math.min(altura, 12000), deviceScaleFactor: 1, mobile: false });
// Redimensionar mexe nos quadros: espera as alturas assentarem de novo.
for (let i = 0, ant = "", est = 0; i < 40 && est < 4; i++) { await esperar(250); const a = await avaliar(`JSON.stringify([...document.querySelectorAll("iframe")].map(f => f.style.height))`); est = a === ant ? est + 1 : 0; ant = a; }
const alturaFinal = await avaliar("Math.ceil(document.documentElement.scrollHeight)");
await cdp("Emulation.setDeviceMetricsOverride", { width: Number(largura), height: Math.min(alturaFinal, 12000), deviceScaleFactor: 1, mobile: false });
await esperar(400);
const shot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
fs.writeFileSync(saida, Buffer.from(shot.result.data, "base64"));
const faltando = await avaliar(`JSON.stringify([...document.querySelectorAll("iframe")].filter(f => parseInt(f.style.height || 0) <= 40).map(f => f.closest("section").id))`);
const historico = process.env.DEBUG ? await avaliar("JSON.stringify(window.__alturas)") : "{}";
const erros = await avaliar("JSON.stringify(window.__erros ?? [])");
console.log(JSON.stringify({ saida, segundos: Math.round((Date.now() - t0) / 1000), alturas: JSON.parse(anterior || "[]"), erros: JSON.parse(erros || "[]"), historico: JSON.parse(historico), faltando: JSON.parse(faltando || "[]"), console: [...new Set(eventos)].slice(0, 30) }, null, 1));
ws.close();
edge.kill();
