// dashboard/js/temas.js — THEMES, applyTheme, amostras, fundo.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// THEME SYSTEM
// ─────────────────────────────────────────────────
/**
 * 30/10 — três estilos, cada um em três cores, iguais aos do celular:
 *
 *   Dark  → a noite do ELYSIUM (vidro escuro, aurora, manchas, feixes de luz)
 *   Glass → a mesma base com vidro de verdade sobre manchas fortes (`theme-gl`, css/design.css)
 *   Stark → o HUD (`theme-stark`, css/stark.css)
 *
 * Todos são da família "ely" (a base escura de base.css/rich.css). Vidro Líquido claro,
 * Renascença e Minimal saíram com o CSS deles; quem tinha um deles gravado cai no Dark.
 *
 * As variáveis continuam se chamando `--purple` e `--cyan` mesmo valendo ouro e éter.
 * `shaft` é a cor dos feixes de luz; `blobs`, as três manchas do fundo.
 */
const THEMES = {
  "dark-elisio":     { name: "Campos Elísios", grupo: "dark", family: "ely", purple: "#d9b168", purpleBright: "#f2d49b", cyan: "#9fd8cf", cyanDark: "#6fb3a9", bg: "#0a0c14", surface: "#131726", surface2: "#0e1220", glassInk: "16,21,36", blobs: ["#8a6a2e", "#2f5d57", "#4a3f6b"], shaft: "#d9b168" },
  "dark-mare":       { name: "Éter",           grupo: "dark", family: "ely", purple: "#a8c4d8", purpleBright: "#d3e4f0", cyan: "#7fd4c8", cyanDark: "#4fa89c", bg: "#080b12", surface: "#111624", surface2: "#0c101c", glassInk: "15,21,34", blobs: ["#33506b", "#2b5f59", "#3a4560"], shaft: "#a8c4d8" },
  "dark-crepusculo": { name: "Crepúsculo",     grupo: "dark", family: "ely", purple: "#f0a850", purpleBright: "#ffc47a", cyan: "#e07a9b", cyanDark: "#b85e7c", bg: "#0b0818", surface: "#171232", surface2: "#110d26", glassInk: "26,18,48", blobs: ["#7a4520", "#6b2f47", "#3b2a6b"], shaft: "#f0a850" },

  "glass-elisio":     { name: "Âmbar",      grupo: "glass", family: "ely", gl: true, purple: "#f0a060", purpleBright: "#ffc08a", cyan: "#f2c14e", cyanDark: "#c99a2e", bg: "#120905", surface: "#22140c", surface2: "#1a0f09", glassInk: "34,20,12", blobs: ["#d2692e", "#c9971f", "#a8326e"] },
  "glass-mare":       { name: "Maré",       grupo: "glass", family: "ely", gl: true, purple: "#6cb6ff", purpleBright: "#a5d2ff", cyan: "#3fe0c8", cyanDark: "#25b39f", bg: "#040d1a", surface: "#0c1a2e", surface2: "#081424", glassInk: "12,26,46", blobs: ["#1e7fd4", "#17b8a6", "#4b4bd8"] },
  "glass-crepusculo": { name: "Crepúsculo", grupo: "glass", family: "ely", gl: true, purple: "#a58cff", purpleBright: "#c9baff", cyan: "#4fd6e8", cyanDark: "#2fb0c2", bg: "#0a0720", surface: "#171236", surface2: "#110d2a", glassInk: "23,18,54", blobs: ["#6d4aff", "#22b8cf", "#c04bd8"] },

  // Stark (fase 16): "purple" é o acento principal (o azul do reator); "cyan", o âmbar dos detalhes.
  stark:         { name: "Reator", grupo: "stark", family: "ely", stark: true, purple: "#3cc8f0", purpleBright: "#8ee6ff", cyan: "#ffb547", cyanDark: "#d98f2b", bg: "#05080f", surface: "#0b1220", surface2: "#08101b", glassInk: "10,18,32", blobs: ["#0f3a52", "#123047", "#3a2a12"], shaft: "#3cc8f0" },
  "stark-mark":  { name: "Mark",   grupo: "stark", family: "ely", stark: true, purple: "#ff5a4e", purpleBright: "#ff9183", cyan: "#ffc857", cyanDark: "#d9a43a", bg: "#0b0607", surface: "#170c0e", surface2: "#120909", glassInk: "28,12,14", blobs: ["#5a1414", "#5a4214", "#2a1010"], shaft: "#ff5a4e" },
  "stark-noite": { name: "Noite",  grupo: "stark", family: "ely", stark: true, purple: "#7fb8d8", purpleBright: "#cfeaff", cyan: "#64ffda", cyanDark: "#3fcfae", bg: "#03050a", surface: "#0a0f18", surface2: "#070b12", glassInk: "8,13,22", blobs: ["#1a2a3a", "#123a35", "#20283a"], shaft: "#7fb8d8" },
};

const GRUPOS = [["dark", "Dark"], ["glass", "Glass"], ["stark", "Stark"]];

/** Todas as famílias existentes, para limpar a classe anterior sem adivinhação. */
const THEME_FAMILIES = ["ely"];

const FALLBACK_THEME = "dark-elisio";

/**
 * 🔴 Temas que saíram, mas cuja escolha ficou gravada em disco.
 *
 * Sem esta tabela, um id antigo faria `THEMES[id]` devolver undefined, `p.purple` estourar e
 * **o JS do dashboard inteiro morrer na abertura** — janela em branco, sem erro visível.
 */
const TEMAS_APOSENTADOS = {
  default: "dark-elisio", ocean: "dark-mare", ember: "dark-crepusculo", forest: "dark-elisio",
  ely: "dark-elisio", "ely-dusk": "dark-crepusculo", "ely-ether": "dark-mare",
  lg: "glass-crepusculo", "lg-tide": "glass-mare", "lg-amber": "glass-elisio",
  renascenca: "dark-elisio", "renascenca-veneza": "dark-mare", "renascenca-roma": "dark-crepusculo",
  minimal: "dark-mare", dark: "dark-elisio", glass: "glass-crepusculo",
};

let currentTheme = FALLBACK_THEME;

/**
 * Converte "#6d4aff" em "109,74,255".
 *
 * As variáveis `--purple-rgb`/`--cyan-rgb` existem porque `rgba()` precisa dos
 * componentes separados para receber alfa. Valor não-hex devolve null e a variável não é mexida.
 */
function hexToRgbList(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function getThemeColor(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function applyTheme(id) {
  // Tema aposentado é traduzido e REGRAVADO, para o disco parar de carregar um id morto.
  if (TEMAS_APOSENTADOS[id]) {
    const novo = TEMAS_APOSENTADOS[id];
    console.log(`[tema] "${id}" saiu; usando "${novo}".`);
    window.nx?.setConfig({ theme: novo }).catch(() => {});
    id = novo;
  }

  const t = THEMES[id] ? id : FALLBACK_THEME;
  const p = THEMES[t];
  currentTheme = t;
  const root = document.documentElement.style;
  root.setProperty("--purple", p.purple);
  root.setProperty("--purple-bright", p.purpleBright);
  root.setProperty("--cyan", p.cyan);
  root.setProperty("--cyan-dark", p.cyanDark);
  root.setProperty("--bg", p.bg);
  root.setProperty("--surface", p.surface);
  root.setProperty("--surface2", p.surface2);
  // A tinta do vidro sai da PALETA do tema, nunca de branco puro: branco puro é o "leitoso".
  root.setProperty("--glass-ink", p.glassInk);

  const purpleRgb = hexToRgbList(p.purple);
  const cyanRgb   = hexToRgbList(p.cyan);
  if (purpleRgb) root.setProperty("--purple-rgb", purpleRgb);
  if (cyanRgb)   root.setProperty("--cyan-rgb", cyanRgb);

  for (let i = 0; i < 3; i++) root.setProperty(`--blob-${i + 1}`, p.blobs[i]);
  if (p.shaft) root.setProperty("--shaft", p.shaft);
  else root.removeProperty("--shaft");

  for (const fam of THEME_FAMILIES) {
    document.body.classList.toggle(`theme-${fam}`, fam === p.family);
  }
  document.body.classList.toggle("theme-stark", !!p.stark);
  document.body.classList.toggle("theme-gl", !!p.gl);
  // Classe comum: só o que é movimento — molas, entradas, a camada de manchas.
  document.body.classList.add("theme-rich");

  renderThemeSwatches();
}

// ── Fundo (30/10): o animado do tema, um papel colorido ou uma imagem do Zak ──
const PAPEIS = { nebulosa: "Nebulosa", "por-do-sol": "Pôr do sol", oceano: "Oceano" };
let fundoAtual = { tipo: "animado" };

function lerFundoDash(bruto) {
  try {
    const f = JSON.parse(bruto || "");
    if (f?.tipo === "papel" && PAPEIS[f.id]) return f;
    if (f?.tipo === "imagem" && typeof f.uri === "string" && f.uri.startsWith("file:")) return f;
  } catch { /* cai no animado */ }
  return { tipo: "animado" };
}

function aplicarFundo(bruto) {
  fundoAtual = lerFundoDash(bruto);
  const html = document.documentElement;
  for (const id of Object.keys(PAPEIS)) html.classList.toggle(`fundo-papel-${id}`, fundoAtual.tipo === "papel" && fundoAtual.id === id);
  html.classList.toggle("fundo-imagem", fundoAtual.tipo === "imagem");
  document.body.classList.toggle("fundo-proprio", fundoAtual.tipo !== "animado");
  if (fundoAtual.tipo === "imagem") html.style.setProperty("--fundo-img", `url("${fundoAtual.uri.replace(/"/g, "%22")}")`);
  else html.style.removeProperty("--fundo-img");
}

function gravarFundo(f) {
  const bruto = JSON.stringify(f);
  aplicarFundo(bruto);
  cfgAtual.fundoDash = bruto;
  window.nx.setConfig({ fundoDash: bruto }).catch(() => {});
  renderThemeSwatches();
}

function renderThemeSwatches() {
  const wrap = document.getElementById("theme-swatches");
  if (!wrap) return;
  wrap.innerHTML = "";
  for (const [grupo, rotulo] of GRUPOS) {
    const bloco = document.createElement("div");
    bloco.innerHTML = `<div class="theme-familia">${rotulo}</div><div class="theme-grade"></div>`;
    const grade = bloco.querySelector(".theme-grade");
    for (const [id, t] of Object.entries(THEMES)) {
      if (t.grupo !== grupo) continue;
      const div = document.createElement("div");
      div.className = "theme-swatch" + (id === currentTheme ? " active" : "");
      div.title = `${rotulo} — ${t.name}`;
      div.innerHTML = `
        <div class="theme-previa" style="--previa-bg:${t.bg};--previa-card:rgba(255,255,255,0.10)">
          <i style="background:${t.purpleBright}"></i><i style="background:${t.cyan}"></i><b></b>
        </div>
        <span class="theme-swatch-name">${escHtml(t.name)}</span>`;
      div.addEventListener("click", () => {
        applyTheme(id);
        cfgAtual.theme = id;
        window.nx.setConfig({ theme: id }).catch(() => {});
      });
      grade.appendChild(div);
    }
    wrap.appendChild(bloco);
  }

  // Fundo: animado, os três papéis e uma imagem do PC.
  const bloco = document.createElement("div");
  bloco.innerHTML = `<div class="theme-familia">Fundo</div><div class="theme-grade"></div>`;
  const grade = bloco.querySelector(".theme-grade");
  const opcoes = [["animado", "Animado do tema", null], ...Object.entries(PAPEIS).map(([id, nome]) => [id, nome, id])];
  for (const [chave, nome, papel] of opcoes) {
    const ativo = papel ? fundoAtual.tipo === "papel" && fundoAtual.id === papel : fundoAtual.tipo === "animado";
    const div = document.createElement("div");
    div.className = "theme-swatch fundo-amostra" + (ativo ? " active" : "");
    div.innerHTML = `<div class="theme-previa ${papel ? `previa-papel-${papel}` : ""}"></div><span class="theme-swatch-name">${escHtml(nome)}</span>`;
    div.addEventListener("click", () => gravarFundo(papel ? { tipo: "papel", id: papel } : { tipo: "animado" }));
    grade.appendChild(div);
    void chave;
  }
  const img = document.createElement("div");
  img.className = "theme-swatch fundo-amostra" + (fundoAtual.tipo === "imagem" ? " active" : "");
  img.innerHTML = `<div class="theme-previa previa-imagem"></div><span class="theme-swatch-name">${fundoAtual.tipo === "imagem" ? "Trocar imagem" : "Imagem do PC"}</span>`;
  img.addEventListener("click", async () => {
    const uri = await window.nx.escolherFundo?.().catch(() => null);
    if (uri) gravarFundo({ tipo: "imagem", uri });
  });
  grade.appendChild(img);
  wrap.appendChild(bloco);
}

// Os insights do sistema e a faixa de estabilidade de 24 h saíram daqui: os primeiros
// viraram card da tela Início, a segunda foi removida junto com a gaveta de sistema no
// bloco 35 — era um gráfico bonito que não levava a lugar nenhum.
