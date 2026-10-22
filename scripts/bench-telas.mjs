// Bancada das telas inteligentes (Fase 2). Pede cada prompt ao app de pé (RPC `ui.gerar`) e mede:
// válida na 1ª, válida com a 2ª tentativa, tempo até a tela e o modelo que respondeu.
//   node scripts/bench-telas.mjs --provedor hermes --rodadas 3 [--so id,id] [--sem-texto]
// Precisa do ELYSIUM rodando (instalado ou dev) na 4200. O token sai do config (só esse campo).
import fs from "node:fs";
import path from "node:path";

const arg = (n, p) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : p; };
const provedor = arg("--provedor", "hermes");
const rodadas = Number(arg("--rodadas", "1"));
const so = arg("--so", null)?.split(",");
const modelo = arg("--modelo", undefined);
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const prompts = JSON.parse(fs.readFileSync(path.join(raiz, "scripts", "bench-telas-prompts.json"), "utf8")).filter((p) => !so || so.includes(p.id));
const TOKEN = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, "elysium", "elysium-config.json"), "utf8")).serverToken;

async function gerar(pergunta) {
  const t0 = Date.now();
  const r = await fetch("http://127.0.0.1:4200/api/rpc", {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ method: "ui.gerar", params: { pergunta, provedor, ...(modelo ? { modelo } : {}) } }),
    signal: AbortSignal.timeout(240_000),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ms: Date.now() - t0, ...(j.result ?? { erro: j.error }) };
}

const linhas = [];
for (let rodada = 1; rodada <= rodadas; rodada++) {
  for (const p of prompts) {
    let r;
    try { r = await gerar(p.prompt); } catch (e) { r = { status: 0, erro: String(e), ms: 0 }; }
    const reg = r.registro ?? [];
    const l = {
      rodada, id: p.id, origem: p.origem, provedor,
      ok1: reg[0]?.ok === true, ok: !!r.tela, tentativas: reg.length,
      ms: r.tela?.ms ?? r.ms, modelo: r.tela?.modelo ?? reg.find((x) => x.modelo)?.modelo ?? null,
      declaracoes: r.tela?.declaracoes ?? 0, erros: reg.flatMap((x) => x.erros ?? []).slice(0, 3), status: r.status,
      programa: r.tela?.programa ?? null,
    };
    linhas.push(l);
    console.log(`${rodada} ${p.id.padEnd(15)} ${l.ok ? (l.ok1 ? "✓1" : "✓2") : "✗ "} ${String(Math.round(l.ms / 1000)).padStart(3)} s  ${l.modelo ?? "-"}${l.ok ? "" : "  " + (l.erros[0] ?? r.erro ?? "").slice(0, 90)}`);
  }
}

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "-");
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const porModelo = new Map();
for (const l of linhas) { const k = l.modelo ?? "(sem modelo)"; porModelo.set(k, [...(porModelo.get(k) ?? []), l]); }
console.log(`\n${provedor}: ${linhas.length} pedidos — válida na 1ª ${pct(linhas.filter((l) => l.ok1).length, linhas.length)}, com a 2ª ${pct(linhas.filter((l) => l.ok).length, linhas.length)}, mediana ${Math.round(mediana(linhas.filter((l) => l.ok).map((l) => l.ms)) / 1000)} s até a tela`);
for (const [m, ls] of porModelo) console.log(`  ${m.padEnd(48)} n=${String(ls.length).padStart(2)}  1ª ${pct(ls.filter((l) => l.ok1).length, ls.length).padStart(4)}  final ${pct(ls.filter((l) => l.ok).length, ls.length).padStart(4)}  mediana ${Math.round(mediana(ls.filter((l) => l.ok).map((l) => l.ms)) / 1000)} s`);

const saida = path.join(raiz, "scripts", "bench-resultados", `telas-${provedor}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`);
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, JSON.stringify(linhas, null, 1));
console.log(`\nresultado em ${path.relative(raiz, saida)}`);
