// dashboard/js/nucleo.js — constantes, estado, helpers (ico, escHtml, movimentoLigado, toast).
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// CONSTANTS & STATE
// ─────────────────────────────────────────────────
const MIN_H = 3, MAX_H = 36;
const LERP_SPEED  = 0.22;
const DECAY_SPEED = 0.07;
const OFFSETS = [0, 0.1, 0.2, 0.05, 0.15, 0.08, 0.18, 0.03, 0.12];
const CHART_LEN = 60;

let currentH    = new Array(9).fill(MIN_H);
let lastLevelTs = 0;
// 25/10: a janela está em foco? Vem do processo principal (dash:foco); o fundo e a esfera param sem ele.
let focoJanela = true;
let voiceActive = false;
let appState    = "idle";

const cpuHistory = new Array(CHART_LEN).fill(0);
const ramHistory = new Array(CHART_LEN).fill(0);

// Full process list (up to 15) received from telemetry
let allProcesses    = [];
let procModalSortBy = "cpu";   // "cpu" | "ram" | "name"
let procModalFilter = "";

// ─────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }


// Mesmo sprite do markup, para os pedaços de interface montados em JS.
// Presets gravados em disco e mensagens do main ainda carregam emoji do formato
// antigo. Traduz o que dá e cai num ícone genérico no resto — um <use> apontando
// para um símbolo inexistente renderiza um vazio silencioso.
const ICONES_SPRITE = new Set(["home","message-circle","monitor","inbox","sliders","settings","smartphone","cpu","clock","menu","music","droplet","thermometer","battery","battery-charging","plug","hard-drive","activity","clipboard","mic","arrow-up","x","minus","play","pause","skip-back","skip-forward","chevron-up","chevron-down","star","zap","bulb","check","copy","download","paperclip","shuffle","repeat","volume","cloud","grip","refresh","volume-x","volume-1","repeat-1","pin","user","grid","edit","search","bell","calendar","wifi","power","lock","moon","sun","terminal","list","trash","plus","chevron-right","chevron-left","arrow-left","globe","key","bookmark","layers","camera","file-text","send","image","eye","info","alert","mouse","type","external","cpu-chip","sparkles","rotate","tag","phone-call"]);
const ICONES_LOG = {
  "\u2699\uFE0F": "settings", "\u2699": "settings", "\u26A1": "zap",
  "\uD83C\uDFB5": "music", "\uD83D\uDD0A": "volume", "\uD83C\uDFAE": "sliders",
  "\uD83D\uDCA1": "bulb", "\uD83D\uDDA5\uFE0F": "monitor", "\uD83D\uDCF1": "smartphone",
};
function nomeDeIcone(bruto) {
  if (!bruto) return "zap";
  if (ICONES_SPRITE.has(bruto)) return bruto;
  return ICONES_LOG[bruto] ?? "zap";
}
function ico(nome, cls) {
  const n = nomeDeIcone(nome);
  return `<svg class="ico${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
}

/**
 * Um lugar só decide se há movimento. O CSS lê o mesmo atributo por seletor; aqui é para o
 * JS que anima à mão (contagem de números, FLIP do arrasto).
 */
function movimentoLigado() {
  const modo = document.documentElement.dataset.movimento;
  if (modo === "sempre") return true;
  if (modo === "nunca") return false;
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── Micro-detalhes (fase 23, inspirados no designspells.com) ──
/** Estouro de partículas saindo de um elemento (check concluído, estilo Strava). */
function estourar(el, n = 14) {
  if (!el || !movimentoLigado()) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("i");
    p.className = "faisca-p";
    p.style.left = `${cx}px`; p.style.top = `${cy}px`;
    document.body.appendChild(p);
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 22 + Math.random() * 26;
    p.animate([
      { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(0.2)`, opacity: 0 },
    ], { duration: 520 + Math.random() * 200, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => p.remove();
  }
}
/** Fogos discretos: três estouros grandes no alto da janela (todos os hábitos do dia, estilo Chrome). */
function fogos() {
  if (!movimentoLigado()) return;
  const W = innerWidth;
  [[0.3, 0.28, 0], [0.62, 0.2, 180], [0.48, 0.34, 360]].forEach(([fx, fy, atraso]) => setTimeout(() => {
    const alvo = { getBoundingClientRect: () => ({ left: W * fx, top: innerHeight * fy, width: 0, height: 0 }) };
    estourar(alvo, 26);
  }, atraso));
}
/** Item que se dobra e some antes de sair da lista (estilo Things). Resolve quando acabou. */
function dobrarESumir(el) {
  if (!el || !movimentoLigado()) return Promise.resolve();
  const a = el.animate([
    { transform: "perspective(500px) rotateX(0)", opacity: 1, maxHeight: `${el.offsetHeight}px` },
    { transform: "perspective(500px) rotateX(-70deg)", opacity: 0, maxHeight: "0px" },
  ], { duration: 280, easing: "cubic-bezier(.4,0,.6,1)", fill: "forwards" });
  el.style.transformOrigin = "top center"; el.style.overflow = "hidden";
  return a.finished.catch(() => {});
}

function escHtml(s) {
  // String(): número ou undefined chegavam aqui e quebravam o .replace (08/10).
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/**
 * Realce em UMA passada sobre o código cru (bloco 84). A versão anterior fazia replaces em
 * cadeia sobre o HTML já escapado: a regex de string casava o `"kw"` do <span> que a de
 * palavra-chave tinha acabado de inserir, e todo bloco com `const` saía com HTML quebrado
 * na tela. Aqui cada pedaço é classificado uma vez e escapado sozinho.
 */
function highlightCode(code, lang) {
  const l = (lang || "").toLowerCase();
  if (!/^(js|javascript|ts|typescript|tsx|jsx|python|py|bash|sh|ps1|powershell|json|c|cpp|cs|java|go|rs|rust)$/.test(l)) return escHtml(code);
  const comentario = /^(py|python|bash|sh|ps1|powershell)$/.test(l) ? "#[^\\n]*" : "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/";
  const re = new RegExp(`(${comentario})|("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'|\`[^\`]*\`)|\\b(function|const|let|var|return|if|else|elif|for|while|import|export|from|class|new|async|await|def|print|echo|true|false|null|None|True|False|in|of|try|catch|except|finally|Write-Output)\\b|\\b(\\d+(?:\\.\\d+)?)\\b`, "g");
  let saida = "", ultimo = 0;
  for (const m of code.matchAll(re)) {
    saida += escHtml(code.slice(ultimo, m.index));
    const cls = m[1] ? "cmt" : m[2] ? "str" : m[3] ? "kw" : "num";
    saida += `<span class="${cls}">${escHtml(m[0])}</span>`;
    ultimo = m.index + m[0].length;
  }
  return saida + escHtml(code.slice(ultimo));
}

function renderMarkdown(raw) {
  const lines = raw.split("\n");
  let html = "";
  let inCode = false, codeLang = "", codeLines = [];
  // "ul" | "ol" | "" — qual lista está aberta (08/10: a numerada fechava com </ul>, e uma
  // lista com "-" logo depois de uma "1." continuava dentro do <ol>).
  let inList = "";

  function flushList() {
    if (inList) { html += `</${inList}>`; inList = ""; }
  }
  function abrirLista(tag) {
    if (inList === tag) return;
    flushList();
    html += `<${tag}>`;
    inList = tag;
  }

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!inCode && ln.startsWith("```")) {
      flushList();
      codeLang = ln.slice(3).trim();
      inCode = true; codeLines = [];
      continue;
    }
    if (inCode) {
      if (ln.startsWith("```")) {
        html += blocoDeCodigo(codeLines.join("\n"), codeLang);
        inCode = false;
      } else { codeLines.push(ln); }
      continue;
    }
    const trimmed = ln.trim();
    if (!trimmed) { flushList(); continue; }
    // Títulos, citação e linha (bloco 84). Título vira texto forte do tamanho da bolha,
    // não <h1>: numa bolha de chat um h1 de verdade gritaria mais que a própria resposta.
    const titulo = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (titulo) { flushList(); html += `<p class="md-titulo md-t${titulo[1].length}">${inlineRender(titulo[2])}</p>`; continue; }
    if (/^>\s?/.test(trimmed)) { flushList(); html += `<blockquote>${inlineRender(trimmed.replace(/^>\s?/, ""))}</blockquote>`; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flushList(); html += "<hr>"; continue; }
    // Tabela (08/10, como no celular desde a fase 15): cabeçalho + "|---|" + linhas.
    if (trimmed.startsWith("|") && i + 1 < lines.length && mdEhSeparador(lines[i + 1])) {
      flushList();
      const cab = mdCelulas(trimmed);
      i += 2;
      const linhas = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { linhas.push(mdCelulas(lines[i])); i++; }
      i--;
      html += `<div class="md-tabela"><table><thead><tr>${cab.map(c => `<th>${inlineRender(c)}</th>`).join("")}</tr></thead><tbody>${linhas.map(l => `<tr>${cab.map((_, k) => `<td>${inlineRender(l[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      continue;
    }
    if (/^[-*] /.test(trimmed)) {
      abrirLista("ul");
      html += `<li>${inlineRender(trimmed.slice(2))}</li>`;
    } else if (/^\d+\. /.test(trimmed)) {
      abrirLista("ol");
      html += `<li>${inlineRender(trimmed.replace(/^\d+\. /, ""))}</li>`;
    } else {
      flushList();
      html += `<p>${inlineRender(ln)}</p>`;
    }
  }
  if (inCode) html += blocoDeCodigo(codeLines.join("\n"), codeLang);
  flushList();
  return html || `<p>${escHtml(raw)}</p>`;
}

/** Células de uma linha de tabela: "\|" é barra literal; barra dentro de `código` não divide. */
function mdCelulas(linha) {
  const t = linha.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  const out = [];
  let atual = "", emCodigo = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === "\\" && t[i + 1] === "|") { atual += "|"; i++; continue; }
    if (ch === "`") emCodigo = !emCodigo;
    if (ch === "|" && !emCodigo) { out.push(atual.trim()); atual = ""; continue; }
    atual += ch;
  }
  out.push(atual.trim());
  return out;
}

/** A linha "|---|:---:|" que separa o cabeçalho. Exige ao menos uma barra. */
function mdEhSeparador(linha) {
  return linha.includes("|") && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(linha);
}

/** Bloco de código com o botão de copiar — o clique é tratado em chat-extra.js. */
function blocoDeCodigo(codigo, lang) {
  return `<div class="codigo"><div class="codigo-topo"><span>${escHtml(lang || "código")}</span>` +
    `<button type="button" data-copiar-codigo>Copiar</button></div>` +
    `<pre><code>${highlightCode(codigo, lang)}</code></pre></div>`;
}

function inlineRender(s) {
  // Código inline sai primeiro para uma lista à parte: dentro dele nada vira negrito nem
  // link. Links só http(s) — o clique passa pelo main, que também confere o protocolo.
  const codigos = [];
  let t = escHtml(s).replace(/`([^`]+)`/g, (_, c) => { codigos.push(c); return `\u0000${codigos.length - 1}\u0000`; });
  t = t
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g,     "<em>$1</em>")
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codigos[Number(i)]}</code>`);
}
