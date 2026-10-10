/**
 * Bancada do Hermes (fase 21, bloco 218) — o mesmo banco de casos da `bench-agente.mjs`, agora
 * com o Hermes pensando: latência (1º sinal, 1ª palavra, total), acerto nas ferramentas do
 * ELYSIUM e fidelidade da persona da Ely.
 *
 * NADA TOCA O PC.
 *  - Roda no perfil `ely-bench` (clone do `ely` com terminal, arquivos, navegador, execução de
 *    código, computer use, memória e agendamento DESLIGADOS — `hermes -p ely-bench tools list`).
 *  - O MCP "elysium" desse perfil aponta para um servidor FALSO aqui dentro: as definições são as
 *    de produção (lista permitida do `mcpElysium.ts`), mas executar é devolver o texto do
 *    cenário (leituras) ou "feito" (ações), e cada chamada é anotada para a nota.
 *  - Toda pergunta do Hermes (aprovação, esclarecimento) é recusada. Se aparecer uma ferramenta
 *    própria perigosa no `tool.start`, o turno é interrompido e o caso conta como falha grave.
 *
 * USO
 *   npm run build && node scripts/bench-hermes.mjs [--casos 10] [--persona-so]
 * Resultado em scripts/bench-resultados/ (fora do git).
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Mesmos dublês da bench-agente: o dist importa electron e electron-store por baixo.
const Module = require("node:module");
const carregarOriginal = Module._load;
Module._load = function (pedido, ...resto) {
  if (pedido === "electron") return new Proxy({}, { get: () => new Proxy(function () {}, { get: () => () => ({}), apply: () => ({}) }) });
  if (pedido === "electron-store") return class { constructor(o) { this.d = { ...(o?.defaults || {}) }; } get(k, d) { return this.d[k] ?? d ?? {}; } set(k, v) { this.d[k] = v; } };
  return carregarOriginal.call(this, pedido, ...resto);
};
const { definicoesDeFerramentas } = require(path.join(raiz, "dist/services/ferramentas.js"));
const { responderMcp, FERRAMENTAS_DO_HERMES } = require(path.join(raiz, "dist/services/mcpElysium.js"));
const { acharHermes, rodarHermes, subirServidor, encerrarArvore } = require(path.join(raiz, "dist/services/hermes/processo.js"));
const { ConexaoHermes } = require(path.join(raiz, "dist/services/hermes/conexao.js"));
const { rodarTurno } = require(path.join(raiz, "dist/services/hermes/sessao.js"));
const { contextoDoTurno } = require(path.join(raiz, "dist/services/hermes/persona.js"));
const { fastRoute } = require(path.join(raiz, "dist/services/fastRoute.js"));

const PERFIL = "ely-bench";
const LEITURA = new Set(["programas_abertos", "estado_do_pc", "processos_pesados", "clima", "lembretes", "rotinas", "presets", "tocando_agora", "espaco_em_disco", "versao_do_elysium", "resumo_do_dia", "ver_lista", "ver_timers", "calcular", "hora_em", "ver_habitos", "painel_do_dia", "ver_tarefas", "treino_de_hoje", "ver_meta_calorias", "revisao_da_semana", "janela_em_foco", "nota_necessaria"]);
const CENARIO_PADRAO = {
  programas_abertos: "Abertos: chrome (GitHub - Google Chrome); Code (elysium - Visual Studio Code); Spotify (lo-fi beats); explorer (Downloads).",
  estado_do_pc: "CPU 23%; RAM 65% (10.3 de 15.9 GB); disco C com 92.2 GB livres de 475.8; ligado há 2 h 10 min; maiores consumos: chrome 12%, Code 8%, Spotify 3%.",
  processos_pesados: "Os que mais pesam: chrome com 12% de CPU e 1800 MB; Code com 8% de CPU e 900 MB; Spotify com 3% de CPU e 400 MB.",
  clima: "Em São Paulo, 22 graus e nublado. Máxima de 24, mínima de 15. Sem chuva à vista.",
  lembretes: "Nenhum lembrete pendente.",
  rotinas: "Rotinas: Bom dia às 07:30 (dias úteis); Estado do PC às 18:00.",
  presets: "Presets: trabalho, jogo.",
  tocando_agora: "Nada tocando no Spotify agora.",
  janela_em_foco: "Na frente agora: \"elysium - Visual Studio Code\" (Code).",
  ver_tarefas: "Tarefas de hoje: comprar pão; estudar física.",
};
const PERIGOSAS = /terminal|shell|exec|computer|mouse|keyboard|file_write|write_file|patch|browser|delete|process/i;

const PERSONA = [
  "oi Ely, tudo bem?", "quem é você?", "me explica rapidinho o que é inflação", "qual a capital da Austrália?",
  "me dá uma dica pra dormir melhor", "você é homem ou mulher?", "me conta uma curiosidade sobre o espaço",
  "o que você acha de eu estudar de madrugada?", "traduz 'bom dia' pro inglês", "obrigado pela ajuda",
];

const argv = process.argv.slice(2);
const arg = (n, p) => { const i = argv.indexOf(`--${n}`); return i === -1 ? p : argv[i + 1]; };
const soPersona = argv.includes("--persona-so");
const { casos: todos } = JSON.parse(fs.readFileSync(path.join(raiz, "scripts/bench-agente-casos.json"), "utf8"));
const casos = todos.slice(0, Number(arg("casos", todos.length)));

// ── MCP falso ────────────────────────────────────────────────────────────────
let chamadas = [];
let cenario = {};
const ex = {
  definicoes: () => definicoesDeFerramentas(),
  executar: async (nome, args) => {
    chamadas.push({ name: nome, args });
    if (LEITURA.has(nome)) return { resultado: cenario[nome] ?? CENARIO_PADRAO[nome] ?? `Sem dados de ${nome}.` };
    return { resultado: `Feito (${nome}).` };
  },
};
const tokenMcp = `bench${Date.now()}`;
const srv = http.createServer(async (req, res) => {
  if (!req.url.startsWith(`/mcp/${tokenMcp}`) || req.method !== "POST") { res.writeHead(req.method === "POST" ? 401 : 405); return res.end(); }
  let b = ""; for await (const c of req) b += c;
  const m = JSON.parse(b);
  const lista = Array.isArray(m) ? m : [m];
  const r = (await Promise.all(lista.map(x => responderMcp(x, ex)))).filter(Boolean);
  if (!r.length) { res.writeHead(202); return res.end(); }
  res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(Array.isArray(m) ? r : r[0]));
});
await new Promise(r => srv.listen(0, "127.0.0.1", r));

const exe = acharHermes();
if (!exe) { console.log("Hermes não instalado."); process.exit(1); }
const lista = await rodarHermes(exe, ["profile", "list"]);
if (!lista.includes(PERFIL)) { console.log(`Falta o perfil ${PERFIL}: hermes profile create ${PERFIL} --clone-from ely --no-alias e desligue as ferramentas próprias (ver o cabeçalho).`); process.exit(1); }
// Trava: confere que o terminal e o computer use estão desligados no perfil da bancada.
const ferr = await rodarHermes(exe, ["-p", PERFIL, "tools", "list"]);
for (const t of ["terminal", "computer_use", "file", "browser", "code_execution"]) {
  if (new RegExp(`enabled\\s+${t}\\b`).test(ferr) && !new RegExp(`disabled\\s+${t}\\b`).test(ferr)) { console.log(`Recusado: ${t} está ligado no perfil ${PERFIL}.`); process.exit(1); }
}
await rodarHermes(exe, ["-p", PERFIL, "config", "set", "mcp_servers.elysium.url", `http://127.0.0.1:${srv.address().port}/mcp/${tokenMcp}`]);
await rodarHermes(exe, ["-p", PERFIL, "config", "set", "mcp_servers.elysium.enabled", "true"]);

const t0 = Date.now();
const servidor = await subirServidor(exe, PERFIL);
console.log(`Hermes (${PERFIL}) no ar em ${Date.now() - t0} ms`);
const con = new ConexaoHermes();
await con.abrir(servidor.url);
await con.chamar("client.capabilities", { server_requests: true });
let aguardando = null;
con.responderPedidosCom((metodo, params) => new Promise(ok => { if (aguardando) aguardando(metodo, params, ok); else ok(metodo === "approval" ? { choice: "deny" } : {}); }));
const perigos = [];
con.ouvir((e) => {
  if (e.type !== "tool.start") return;
  const nome = String(e.payload?.name ?? e.payload?.tool_name ?? "");
  if (nome && !/elysium/i.test(nome) && PERIGOSAS.test(nome)) {
    perigos.push(nome);
    void con.chamar("session.interrupt", { session_id: e.session_id }, 5000).catch(() => {});
  }
});

const DADOS = { nome: "", tratamento: "chefe", estilo: "equilibrado", instrucoes: "", modo: null };

async function turno(texto, canal = "voz") {
  const ses = await con.chamar("session.create", { title: "bench", hidden: true }, 30000);
  const corpo = contextoDoTurno(texto, canal, DADOS, true);
  let primeiro = 0, sinal = 0;
  const desl = con.ouvir((e) => { if (e.session_id !== ses.session_id) return; if (!sinal && /delta|start/.test(e.type)) sinal = Date.now(); });
  const ini = Date.now();
  const fim = await rodarTurno(con, ses.session_id, corpo, { onToken: () => { if (!primeiro) primeiro = Date.now(); }, prazoSinalMs: 30000, prazoTurnoMs: 120000 },
    { aguardar: (fn) => { aguardando = fn ? (m, p, ok) => { fn(m, p, ok); ok(m === "approval" ? { choice: "deny" } : {}); } : null; } });
  desl();
  void con.chamar("session.close", { session_id: ses.session_id }, 5000).catch(() => {});
  const texto2 = fim.tipo === "resposta" ? fim.texto : fim.tipo === "pergunta" ? fim.texto : "";
  return { fim, texto: texto2, sinal: sinal ? sinal - ini : null, primeira: primeiro ? primeiro - ini : null, total: Date.now() - ini };
}

function avaliar(caso, { texto }) {
  const acoes = chamadas.filter(c => !LEITURA.has(c.name));
  const leituras = chamadas.filter(c => LEITURA.has(c.name)).map(c => c.name);
  const erros = [];
  if (caso.esperado === "CHAT") { if (acoes.length) erros.push(`agiu numa conversa: ${acoes.map(a => a.name).join("+")}`); if (!texto) erros.push("sem resposta"); return erros; }
  const esperado = caso.esperado.map(e => { const opcional = e.startsWith("?"); const [nome, trecho] = e.replace(/^\?/, "").split(":"); return { nome, trecho, opcional }; });
  const sobra = [...acoes];
  for (const e of esperado) {
    // Ferramenta fora da lista do MCP (energia, memória…) não tem como ser chamada: o Hermes
    // responder sem agir é o certo; não conta como falta.
    if (!FERRAMENTAS_DO_HERMES.has(e.nome)) continue;
    const i = sobra.findIndex(a => a.name === e.nome && (!e.trecho || e.trecho.toLowerCase().split("|").some(tr => JSON.stringify(a.args).toLowerCase().includes(tr))));
    if (i === -1 && e.opcional) continue;
    if (i === -1) erros.push(`faltou ${e.nome}${e.trecho ? `(…${e.trecho}…)` : ""}`);
    else sobra.splice(i, 1);
  }
  for (const a of sobra) erros.push(`sobrou ${a.name}(${JSON.stringify(a.args).slice(0, 40)})`);
  for (const l of caso.leituras ?? []) if (!l.split("|").some(x => leituras.includes(x) || !FERRAMENTAS_DO_HERMES.has(x))) erros.push(`não olhou ${l}`);
  return erros;
}

/** Persona na voz: curta, sem markdown, sem falar de bastidor, no feminino. */
function notaPersona(texto) {
  const erros = [];
  const frases = texto.split(/(?<=[.!?…])\s+/).filter(f => f.trim().length > 2);
  if (frases.length > 4) erros.push(`${frases.length} frases`);
  if (/[*#`]|^\s*[-•]\s/m.test(texto)) erros.push("markdown");
  if (/\b(hermes|mcp|ferramenta|function|tool)\b/i.test(texto)) erros.push("bastidor");
  if (/\bsou (o|um) (assistente|ia)\b|\b(pronto|obrigado)\b(?= *[,.!]?\s*(chefe)?\s*$)/i.test(texto)) erros.push("masculino");
  if (/\b(the|you|your|is|and)\b/i.test(texto) && !/ingl[eê]s|good morning/i.test(texto)) erros.push("inglês");
  return erros;
}

const p = (xs, q) => { const s = xs.filter(x => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
const linhas = [];
const log = (s) => { console.log(s); linhas.push(s); };
const tempos = { sinal: [], primeira: [], total: [] };

if (!soPersona) {
  let ok = 0, total = 0, atalho = 0;
  for (const caso of casos) {
    let rota = null;
    try { rota = fastRoute(caso.texto); } catch { rota = null; }
    if (rota?.length) { atalho++; ok++; total++; continue; }
    chamadas = []; cenario = caso.cenario ?? {};
    const r = await turno(caso.texto);
    for (const k of Object.keys(tempos)) if (r[k] != null) tempos[k].push(r[k]);
    const erros = r.fim.tipo === "erro" ? [`erro: ${r.fim.motivo}`] : avaliar(caso, r);
    total++; if (!erros.length) ok++;
    log(`${erros.length ? "✗" : "✓"} ${caso.texto} · ${(r.total / 1000).toFixed(1)} s${erros.length ? ` → ${erros.join("; ")}` : ""}`);
  }
  log(`\nAcerto: ${ok}/${total} (${Math.round(100 * ok / total)}%), ${atalho} pelo atalho.`);
}

let personaOk = 0;
for (const frase of PERSONA) {
  chamadas = [];
  const r = await turno(frase);
  for (const k of Object.keys(tempos)) if (r[k] != null) tempos[k].push(r[k]);
  const erros = r.fim.tipo === "erro" ? [`erro: ${r.fim.motivo}`] : notaPersona(r.texto);
  if (!erros.length) personaOk++;
  log(`${erros.length ? "✗" : "✓"} [persona] ${frase} → ${JSON.stringify(r.texto.slice(0, 140))}${erros.length ? ` (${erros.join(", ")})` : ""}`);
}
log(`Persona: ${personaOk}/${PERSONA.length}.`);
log(`Latência (p50 / p90): 1º sinal ${p(tempos.sinal, 0.5)} / ${p(tempos.sinal, 0.9)} ms · 1ª palavra ${p(tempos.primeira, 0.5)} / ${p(tempos.primeira, 0.9)} ms · total ${p(tempos.total, 0.5)} / ${p(tempos.total, 0.9)} ms`);
if (perigos.length) log(`🔴 Ferramentas próprias perigosas tentadas (interrompidas): ${[...new Set(perigos)].join(", ")}`);

const dir = path.join(raiz, "scripts/bench-resultados");
fs.mkdirSync(dir, { recursive: true });
const arq = path.join(dir, `hermes-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
fs.writeFileSync(arq, linhas.join("\n"));
console.log(`\nResultado em ${arq}`);
con.fechar();
encerrarArvore(servidor.filho);
await rodarHermes(exe, ["-p", PERFIL, "config", "unset", "mcp_servers.elysium"]).catch(() => {});
srv.close();
setTimeout(() => process.exit(0), 500);
