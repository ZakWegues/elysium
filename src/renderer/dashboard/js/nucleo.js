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

function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function highlightCode(code, lang) {
  let s = escHtml(code);
  if (/^(js|ts|python|py|bash|sh|ps1|powershell)$/.test(lang || "")) {
    s = s.replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span class="cmt">$1</span>');
    s = s.replace(/\b(function|const|let|var|return|if|else|for|while|import|export|from|class|new|async|await|def|print|echo|Write-Output)\b/g, '<span class="kw">$1</span>');
    s = s.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)/g, '<span class="str">$1</span>');
    s = s.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="num">$1</span>');
  }
  return s;
}

function renderMarkdown(raw) {
  const lines = raw.split("\n");
  let html = "";
  let inCode = false, codeLang = "", codeLines = [];
  let inList = false;

  function flushList() {
    if (inList) { html += "</ul>"; inList = false; }
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
        html += `<pre><code>${highlightCode(codeLines.join("\n"), codeLang)}</code></pre>`;
        inCode = false;
      } else { codeLines.push(ln); }
      continue;
    }
    const trimmed = ln.trim();
    if (!trimmed) { flushList(); continue; }
    if (/^[-*] /.test(trimmed)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inlineRender(trimmed.slice(2))}</li>`;
    } else if (/^\d+\. /.test(trimmed)) {
      if (!inList) { html += "<ol>"; inList = true; }
      html += `<li>${inlineRender(trimmed.replace(/^\d+\. /, ""))}</li>`;
    } else {
      flushList();
      html += `<p>${inlineRender(ln)}</p>`;
    }
  }
  if (inCode) html += `<pre><code>${highlightCode(codeLines.join("\n"), codeLang)}</code></pre>`;
  flushList();
  return html || `<p>${escHtml(raw)}</p>`;
}

function inlineRender(s) {
  return escHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g,     "<em>$1</em>")
    .replace(/_([^_]+)_/g,       "<em>$1</em>");
}
