/**
 * Bancada do cérebro com ferramentas (bloco 82) — mede modelos locais no laço do agente.
 *
 * POR QUE OUTRA BANCADA
 *
 * A `bench-router.mjs` mede o roteador clássico: uma chamada, um JSON de ações. Desde o
 * bloco 78 o caminho principal é o agente: o modelo recebe as 33 ferramentas, chama as
 * que quiser, lê o resultado e chama mais. Um modelo pode ser bom em JSON e péssimo em
 * escolher ferramenta, ou o contrário — e "fecha tudo menos o VS Code" só existe no
 * segundo caminho. Por isso os casos aqui são compostos e condicionais.
 *
 * NADA TOCA O PC. As ferramentas são as de produção (mesmos nomes, descrições e esquemas,
 * lidos do `dist/`), mas executar é devolver um texto combinado (`cenario` do caso ou o
 * padrão abaixo). O prompt é o de produção (`promptDoAgente`). O laço reproduz o do
 * `agente.ts` no essencial: até 4 rodadas, rodada de ação encerra, rodada só de leitura
 * volta ao modelo, e um pedido composto ganha uma volta a mais depois da ação.
 *
 * USO
 *   node scripts/bench-agente.mjs                              # qwen2.5:7b (o de produção)
 *   node scripts/bench-agente.mjs --modelos llama3.1:8b,qwen2.5:7b,llama3.2:3b
 *   node scripts/bench-agente.mjs --repeticoes 3
 *
 * Precisa do `npm run build` antes (lê o dist) e do Ollama de pé.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// O dist importa electron e electron-store por baixo (config, executores). Aqui não há
// app: os dois viram dublês vazios, e o que interessa (definições e prompt) é puro.
const Module = require("node:module");
const carregarOriginal = Module._load;
Module._load = function (pedido, ...resto) {
  if (pedido === "electron") return new Proxy({}, { get: () => new Proxy(function () {}, { get: () => () => ({}), apply: () => ({}) }) });
  if (pedido === "electron-store") return class { constructor(o) { this.d = { ...(o?.defaults || {}) }; } get(k, d) { return this.d[k] ?? d ?? {}; } set(k, v) { this.d[k] = v; } };
  return carregarOriginal.call(this, pedido, ...resto);
};
const { definicoesDeFerramentas } = require(path.join(raiz, "dist/services/ferramentas.js"));
const { promptDoAgente, chamadasEmTexto } = require(path.join(raiz, "dist/services/agente.js"));
// Fase 18: o que o atalho resolve sem modelo (condicionais, treino, listas…) conta à parte —
// na produção esses pedidos nem chegam ao modelo.
const { fastRoute } = require(path.join(raiz, "dist/services/fastRoute.js"));

const OLLAMA = "http://127.0.0.1:11434/api/chat";
const LEITURA = new Set(["programas_abertos", "estado_do_pc", "processos_pesados", "clima", "lembretes", "memoria", "rotinas", "presets", "tocando_agora", "area_de_transferencia", "espaco_em_disco", "versao_do_elysium", "resumo_do_dia", "agenda", "ver_lista", "ver_timers", "calcular", "resumir_link", "hora_em", "ver_habitos", "painel_do_dia", "ver_tarefas", "treino_de_hoje", "ver_meta_calorias", "revisao_da_semana"]);

/** O PC de mentira: o que cada leitura devolve quando o caso não diz outra coisa. */
const CENARIO_PADRAO = {
  programas_abertos: "Abertos: chrome (GitHub - Google Chrome); Code (elysium - Visual Studio Code); Spotify (lo-fi beats); explorer (Downloads).",
  estado_do_pc: "CPU 23%; RAM 65% (10.3 de 15.9 GB); disco C com 92.2 GB livres de 475.8; ligado há 2 h 10 min; maiores consumos: chrome 12%, Code 8%, Spotify 3%.",
  processos_pesados: "Os que mais pesam: chrome com 12% de CPU e 1800 MB; Code com 8% de CPU e 900 MB; Spotify com 3% de CPU e 400 MB.",
  clima: "Em São Paulo, 22 graus e nublado. Máxima de 24, mínima de 15. Sem chuva à vista.",
  lembretes: "Nenhum lembrete pendente.",
  memoria: "O principal projeto do Zak é o ELYSIUM.",
  rotinas: "Rotinas: Bom dia às 07:30 (dias úteis); Estado do PC às 18:00.",
  presets: "Presets: trabalho, jogo.",
  tocando_agora: "Nada tocando no Spotify agora.",
  area_de_transferencia: "Área de transferência: https://github.com/ZakWegues/elysium",
};
const acaoOk = (nome, args) => {
  const a = JSON.stringify(args ?? {});
  switch (nome) {
    case "abrir_programa": return `Abrindo ${args?.nome ?? "programa"}.`;
    case "fechar_programa": return `${args?.nome ?? "programa"} fechado.`;
    case "tocar_musica": return `Tocando ${args?.busca ?? args?.query ?? "música"} no Spotify.`;
    case "midia": return "Feito.";
    case "volume": return "Volume ajustado.";
    case "criar_lembrete": return "Lembrete criado.";
    case "criar_rotina": return "Rotina criada.";
    case "apagar_rotina": return "Rotina apagada.";
    case "lembrar_fato": return "Guardado.";
    case "tirar_print": return "Print salvo na Área de Trabalho.";
    case "mandar_para_o_celular": return "Mandei pro celular.";
    case "energia": return "Desligamento agendado.";
    default: return `Feito (${nome} ${a}).`;
  }
};

const argv = process.argv.slice(2);
const arg = (n, p) => { const i = argv.indexOf(`--${n}`); return i === -1 ? p : argv[i + 1]; };
const modelos = arg("modelos", "qwen2.5:7b").split(",");
const repeticoes = Number(arg("repeticoes", 1));
const { casos } = JSON.parse(fs.readFileSync(path.join(raiz, "scripts/bench-agente-casos.json"), "utf8"));

const tools = definicoesDeFerramentas().map(d => ({ type: "function", function: { name: d.name, description: d.description, parameters: d.parameters } }));

async function chat(modelo, messages) {
  const r = await fetch(OLLAMA, { method: "POST", body: JSON.stringify({ model: modelo, messages, tools, stream: false, options: { temperature: 0.1, num_predict: 600, num_ctx: 8192 }, keep_alive: "10m" }) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const j = await r.json();
  const m = j.message ?? {};
  return { content: m.content ?? "", toolCalls: (m.tool_calls ?? []).map(c => ({ name: c.function?.name, args: c.function?.arguments ?? {} })), bruto: m };
}

/** Reproduz o laço do agente com o PC de mentira; devolve as chamadas e o texto final. */
async function rodarCaso(modelo, caso) {
  const messages = [{ role: "system", content: promptDoAgente() }, { role: "user", content: caso.texto }];
  const chamadas = [];
  const composto = /\s(e|depois|também|tambem)\s|,/.test(caso.texto.toLowerCase());
  let continuou = false, texto = "";
  for (let rodada = 0; rodada < 4; rodada++) {
    const r = await chat(modelo, messages);
    // Igual à produção (fase 14): chamada escrita em texto vira chamada de verdade.
    if (!r.toolCalls.length) { const e = chamadasEmTexto(r.content, new Map(tools.map(t => [t.function.name, t.function.parameters]))); if (e.length) { r.toolCalls = e.map(c => ({ name: c.name, args: c.args })); r.content = ""; } }
    if (!r.toolCalls.length) { texto = r.content.trim(); break; }
    messages.push(r.bruto);
    for (const c of r.toolCalls) {
      const res = LEITURA.has(c.name) ? (caso.cenario?.[c.name] ?? CENARIO_PADRAO[c.name] ?? "Sem dados.") : acaoOk(c.name, c.args);
      chamadas.push(c);
      messages.push({ role: "tool", content: res });
    }
    if (r.toolCalls.some(c => !LEITURA.has(c.name))) {
      if (!composto || continuou) break;
      continuou = true;
    }
  }
  return { chamadas, texto };
}

function avaliar(caso, { chamadas, texto }) {
  const acoes = chamadas.filter(c => !LEITURA.has(c.name));
  const leituras = chamadas.filter(c => LEITURA.has(c.name)).map(c => c.name);
  const erros = [];
  if (caso.esperado === "CHAT") {
    // Como na produção (agente.ts, bloco 130): texto sem nenhuma ferramenta É conversa — a
    // resposta de verdade vem da composeChatReply, com a persona e o canal. Só falha se agiu.
    const conversa = /^\W*chat\b/i.test(texto) || /^\s*\{[^}]*"chat"/i.test(texto) || (!chamadas.length && texto.length > 0);
    if (!conversa) erros.push(`esperava CHAT, veio ${acoes.length ? acoes.map(a => a.name).join("+") : JSON.stringify(texto.slice(0, 50))}`);
    if (acoes.length) erros.push("agiu numa conversa");
    return erros;
  }
  const esperado = caso.esperado.map(e => { const opcional = e.startsWith("?"); const [nome, trecho] = e.replace(/^\?/, "").split(":"); return { nome, trecho, opcional }; });
  const sobra = [...acoes];
  for (const e of esperado) {
    const i = sobra.findIndex(a => a.name === e.nome && (!e.trecho || e.trecho.toLowerCase().split("|").some(tr => JSON.stringify(a.args).toLowerCase().includes(tr))));
    if (i === -1 && e.opcional) continue;
    if (i === -1) erros.push(`faltou ${e.nome}${e.trecho ? `(…${e.trecho}…)` : ""}`);
    else sobra.splice(i, 1);
  }
  for (const a of sobra) erros.push(`sobrou ${a.name}(${JSON.stringify(a.args).slice(0, 40)})`);
  for (const l of caso.leituras ?? []) if (!l.split("|").some(x => leituras.includes(x))) erros.push(`não olhou ${l}`);
  if (!acoes.length && caso.esperado.length === 0 && !texto && !leituras.length) erros.push("não respondeu nada");
  return erros;
}

const pct = (a, b) => `${Math.round((100 * a) / b)}%`;
const p = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0; };

for (const modelo of modelos) {
  console.log(`\n══ ${modelo} ══`);
  // Aquece: a primeira chamada carrega o modelo (até 18 s) e não pode entrar na latência.
  try { await chat(modelo, [{ role: "user", content: "oi" }]); } catch (e) { console.log(`  indisponível: ${e.message.slice(0, 120)}`); continue; }
  let ok = 0, total = 0, atalho = 0; const tempos = []; const falhas = []; const porCaso = [];
  for (const caso of casos) for (let i = 0; i < repeticoes; i++) {
    let rota = null;
    try { rota = fastRoute(caso.texto); } catch { rota = null; }
    if (rota?.length) { atalho++; ok++; total++; porCaso.push({ texto: caso.texto, ok: true, atalho: rota.map(a => a.action) }); continue; }
    const t0 = Date.now();
    let res;
    try { res = await rodarCaso(modelo, caso); } catch (e) { falhas.push(`${caso.texto} → erro: ${e.message.slice(0, 80)}`); total++; continue; }
    tempos.push(Date.now() - t0);
    const erros = avaliar(caso, res);
    total++;
    if (!erros.length) ok++;
    else falhas.push(`${caso.texto} → ${erros.join("; ")}`);
    porCaso.push({ texto: caso.texto, ok: !erros.length, erros, ms: Date.now() - t0, chamadas: res.chamadas.map(c => c.name) });
  }
  console.log(`  acerto ${ok}/${total} (${pct(ok, total)}) · ${atalho} pelo atalho · p50 ${p(tempos, 0.5)} ms · p95 ${p(tempos, 0.95)} ms`);
  for (const f of falhas) console.log(`  ✗ ${f}`);
  // Fase 18: o resultado fica gravado para comparar uma rodada com a outra (fora do git).
  const pasta = path.join(raiz, "scripts", "bench-resultados");
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-${modelo.replace(/[^\w.-]/g, "_")}.json`);
  fs.writeFileSync(arquivo, JSON.stringify({ modelo, quando: new Date().toISOString(), ok, total, atalho, p50: p(tempos, 0.5), p95: p(tempos, 0.95), casos: porCaso }, null, 2));
  console.log(`  gravado em ${path.relative(raiz, arquivo)}`);
}
