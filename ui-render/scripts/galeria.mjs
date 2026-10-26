// Gera dist/galeria.html: página de dev que hospeda o render.html como o PC vai hospedar
// (iframe sandbox="allow-scripts", só postMessage), com os programas da galeria original e os
// nossos em português, sem modelo nenhum. Responde os pedidos de foto e rota buscando direto
// (no app quem busca é o PC, com cache — Fase 2).
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const r = await build({
  stdin: {
    contents: `export { programs } from "./programs"; export { compositionPrograms } from "./composition-programs"; export { toolPrograms } from "./tool-programs"; export { programasPt } from "./programas-pt"; export { telasProntas } from "./telas-prontas";`,
    resolveDir: path.join(raiz, "galeria"), loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "error",
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString("base64")}`);
const secoes = [
  ["Telas prontas (ELYSIUM)", mod.telasProntas],
  ["Em português (ELYSIUM)", mod.programasPt],
  ["Galeria original", mod.programs],
  ["Composições", mod.compositionPrograms],
  ["Com ferramentas (dados de exemplo)", mod.toolPrograms],
].map(([titulo, lista]) => ({ titulo, programas: lista.map((p) => ({ id: p.id, titulo: p.title, codigo: p.code })) }));

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Galeria das telas</title>
<style>
:root { color-scheme: dark; --fundo: #0b1220; --texto: #e6edf6; --linha: #22304a; }
:root[data-esquema="claro"] { color-scheme: light; --fundo: #f4f6fa; --texto: #0d1726; --linha: #d6dde8; }
body { margin: 0; background: var(--fundo); color: var(--texto); font: 14px/1.5 system-ui, sans-serif; }
header { position: sticky; top: 0; z-index: 2; display: flex; gap: 8px; align-items: center; padding: 10px 16px; background: var(--fundo); border-bottom: 1px solid var(--linha); }
header button { font: inherit; padding: 4px 10px; border-radius: 8px; border: 1px solid var(--linha); background: transparent; color: inherit; cursor: pointer; }
main { max-width: 760px; margin: 0 auto; padding: 16px; }
:root[data-largura="380"] main { max-width: 380px; }
h2 { margin: 28px 0 8px; font-size: 15px; opacity: .8; }
.ex { margin: 0 0 22px; }
.ex h3 { margin: 0 0 6px; font-size: 13px; font-weight: 600; opacity: .7; }
.ex iframe { width: 100%; height: 120px; border: 0; display: block; background: transparent; }
#log { position: fixed; right: 8px; bottom: 8px; max-width: 360px; max-height: 30vh; overflow: auto; font: 11px ui-monospace, monospace; background: rgba(0,0,0,.6); color: #cde; padding: 6px 8px; border-radius: 8px; white-space: pre-wrap; }
</style></head>
<body>
<header><b>Galeria das telas</b>
<button data-esquema="escuro">Escuro</button><button data-esquema="claro">Claro</button>
<button data-largura="380">380 px</button><button data-largura="760">Largo</button>
<button data-internet="0">Sem internet</button><button data-internet="1">Com internet</button></header>
<main id="main"></main>
<div id="log"></div>
<script type="module">
const SECOES = ${JSON.stringify(secoes).replace(/</g, "\\u003c")};
const TEMAS = {
  escuro: { esquema: "escuro", vars: { "--iui-canvas": "#0b1220", "--iui-ink": "#e6edf6", "--iui-muted": "rgb(230 237 246 / 62%)", "--iui-faint": "rgb(230 237 246 / 50%)", "--iui-on-ink": "#0b1220" } },
  claro: { esquema: "claro", vars: { "--iui-canvas": "#ffffff", "--iui-ink": "#0d1726", "--iui-muted": "rgb(13 23 38 / 62%)", "--iui-faint": "rgb(13 23 38 / 50%)", "--iui-on-ink": "#ffffff" } },
};
const q = new URLSearchParams(location.search);
let esquema = q.get("esquema") || "escuro", internet = q.get("internet") !== "0";
document.documentElement.dataset.esquema = esquema;
if (q.get("largura")) document.documentElement.dataset.largura = q.get("largura");
const so = q.get("so");
const log = (t) => { const el = document.getElementById("log"); el.textContent = (t + "\\n" + el.textContent).slice(0, 4000); };
window.__erros = []; window.__acoes = []; window.__alturas = {};
const RENDER = await (await fetch("render.html")).text();
const quadros = new Map();
const main = document.getElementById("main");
for (const s of SECOES) {
  const lista = s.programas.filter((p) => !so || so.split(",").includes(p.id));
  if (!lista.length) continue;
  const h = document.createElement("h2"); h.textContent = s.titulo; main.append(h);
  for (const p of lista) {
    const ex = document.createElement("section"); ex.className = "ex"; ex.id = "ex-" + p.id;
    ex.innerHTML = "<h3></h3>"; ex.querySelector("h3").textContent = p.titulo + "  ·  " + p.id;
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts");
    // srcdoc: o navegador do painel de dev bloqueia subquadro sandbox por URL. A origem continua
    // opaca (sandbox sem allow-same-origin), igual ao app.
    f.srcdoc = RENDER; f.title = p.titulo;
    // Manda no "pronta" e também no load: se o "pronta" sair antes de alguém ouvir, a tela não fica vazia.
    f.addEventListener("load", () => iniciar(f));
    ex.append(f); main.append(ex);
    quadros.set(f, p);
  }
}
const mandar = (f, m) => f.contentWindow.postMessage(m, "*");
function iniciar(f) { const p = quadros.get(f); mandar(f, { tipo: "config", internet }); mandar(f, { tipo: "programa", texto: p.codigo, tema: TEMAS[esquema] }); }
async function fotos(q) {
  const u = "https://pt.wikipedia.org/w/api.php?" + new URLSearchParams({ action: "query", format: "json", formatversion: "2", origin: "*", generator: "search", gsrsearch: q, gsrlimit: "4", prop: "pageimages", piprop: "thumbnail", pithumbsize: "800" });
  const j = await (await fetch(u)).json();
  return { fotos: (j.query?.pages ?? []).sort((a, b) => a.index - b.index).map((p) => p.thumbnail?.source).filter(Boolean) };
}
async function rota(coords) {
  const j = await (await fetch("https://router.project-osrm.org/route/v1/driving/" + coords + "?overview=full&geometries=geojson")).json();
  return { points: (j.routes?.[0]?.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng]) };
}
addEventListener("message", async (e) => {
  const f = [...quadros.keys()].find((x) => x.contentWindow === e.source);
  if (!f) return;
  const m = e.data, p = quadros.get(f);
  if (m?.tipo === "pronta") iniciar(f);
  else if (m?.tipo === "altura") { (window.__alturas[p.id] ??= []).push(m.px); f.style.height = Math.max(40, m.px) + "px"; }
  else if (m?.tipo === "erro") { window.__erros.push({ id: p.id, erro: m.mensagem }); log("✗ " + p.id + ": " + m.mensagem); }
  else if (m?.tipo === "acao") { window.__acoes.push({ id: p.id, ...m }); log("ação " + m.acao + ": " + m.valor); }
  else if (m?.tipo === "estado") log("estado " + p.id + ": " + JSON.stringify(m.vars).slice(0, 120));
  else if (m?.tipo === "pedido") {
    try { const dados = m.rota === "fotos" ? await fotos(m.params.q) : await rota(m.params.coords); mandar(f, { tipo: "resposta", id: m.id, dados }); }
    catch (err) { mandar(f, { tipo: "resposta", id: m.id, erro: String(err).slice(0, 200) }); }
  }
});
document.querySelector("header").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.esquema) { esquema = b.dataset.esquema; document.documentElement.dataset.esquema = esquema; for (const f of quadros.keys()) mandar(f, { tipo: "tema", tema: TEMAS[esquema] }); }
  if (b.dataset.largura) document.documentElement.dataset.largura = b.dataset.largura;
  if (b.dataset.internet) { const u = new URL(location.href); u.searchParams.set("internet", b.dataset.internet); location.href = u; }
});
</script>
</body></html>
`;
fs.writeFileSync(path.join(raiz, "dist", "galeria.html"), html);
console.log(`galeria.html: ${secoes.reduce((n, s) => n + s.programas.length, 0)} programas`);
