// dashboard/js/temas.js — THEMES, applyTheme, amostras.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// THEME SYSTEM
// ─────────────────────────────────────────────────
/**
 * Cada tema declara a que FAMÍLIA pertence, e a família é que decide qual bloco de CSS
 * entra em cena. O `lg` nunca foi só uma paleta: são mais de 120 seletores `.theme-lg`
 * (raios, sombras, blur, blobs). Sem a família, dar a esse conjunto uma segunda variação
 * de cor exigiria duplicar tudo.
 *
 *   "lg"  → vidro claro
 *   "ely" → ELYSIUM, vidro sobre azul-noite com luz dourada
 *
 * As duas ganham também a classe `theme-rich`, que carrega só o movimento — idêntico entre
 * elas porque é transform e transition, sem cor.
 *
 * `shaft` é a cor dos feixes de luz e só a família "ely" usa. `blobs` é a camada de fundo
 * das duas.
 */
const THEMES = {
  // 29/10: o design novo do Zak, igual ao do celular (ver css/design.css). A família "ely"
  // com uma classe por cima: `dk` (preto OLED, chapado) e `gl` (vidro líquido sobre orbes).
  dark:  { name: "Dark",  family: "ely", dk: true, purple: "#9fb0ff", purpleBright: "#c3ceff", cyan: "#58d7a2", cyanDark: "#3fb487", bg: "#000000", surface: "#0d0e12", surface2: "#14161c", glassInk: "13,14,18" },
  glass: { name: "Glass", family: "ely", gl: true, purple: "#8fb4ff", purpleBright: "#c4d6ff", cyan: "#b79bff", cyanDark: "#8f72e6", bg: "#05041a", surface: "rgba(255,255,255,0.10)", surface2: "rgba(255,255,255,0.06)", glassInk: "30,26,80", blobs: ["#705cff", "#19d3c5", "#ff4fa3"] },

  // Stark (fase 16): a família "ely" com o acabamento HUD por cima (`stark: true` liga a
  // classe `theme-stark`, ver css/stark.css). "purple" é o acento principal em todo o CSS —
  // aqui ele é o azul do reator; "cyan" vira o âmbar/dourado dos detalhes.
  stark:        { name: "Stark — Reator", family: "ely", stark: true, purple: "#3cc8f0", purpleBright: "#8ee6ff", cyan: "#ffb547", cyanDark: "#d98f2b", bg: "#05080f", surface: "#0b1220", surface2: "#08101b", glassInk: "10,18,32", blobs: ["#0f3a52", "#123047", "#3a2a12"], shaft: "#3cc8f0" },
  "stark-mark": { name: "Stark — Mark",   family: "ely", stark: true, purple: "#ff5a4e", purpleBright: "#ff9183", cyan: "#ffc857", cyanDark: "#d9a43a", bg: "#0b0607", surface: "#170c0e", surface2: "#120909", glassInk: "28,12,14", blobs: ["#5a1414", "#5a4214", "#2a1010"], shaft: "#ff5a4e" },
  "stark-noite":{ name: "Stark — Noite",  family: "ely", stark: true, purple: "#7fb8d8", purpleBright: "#cfeaff", cyan: "#64ffda", cyanDark: "#3fcfae", bg: "#03050a", surface: "#0a0f18", surface2: "#070b12", glassInk: "8,13,22", blobs: ["#1a2a3a", "#123a35", "#20283a"], shaft: "#7fb8d8" },

  // Renascença (13/10, pedido do Zak): a família "ely" com o acabamento de `css/renascenca.css`
  // por cima — nogueira escura, folha de ouro, molduras douradas com cantos ornamentados,
  // serifa clássica (Palatino, que vem no Windows), capitular iluminada e desenhos de estudo
  // ao fundo. "purple" é o ouro; "cyan" é o pigmento da variação (carmim, ultramar, verdete).
  renascenca:          { name: "Renascença — Florença", family: "ely", renascenca: true, purple: "#c9a14a", purpleBright: "#ecd18f", cyan: "#b23a48", cyanDark: "#8c2a36", bg: "#120c07", surface: "#1f150d", surface2: "#180f09", glassInk: "31,21,13", blobs: ["#5a3a14", "#5a1c22", "#3a2814"], shaft: "#c9a14a" },
  "renascenca-veneza": { name: "Renascença — Veneza",   family: "ely", renascenca: true, purple: "#d4ae5c", purpleBright: "#f0d898", cyan: "#3d6fd1", cyanDark: "#2b52a3", bg: "#0b0d18", surface: "#151a2c", surface2: "#101423", glassInk: "21,26,44", blobs: ["#1c2c5a", "#5a4214", "#22204a"], shaft: "#d4ae5c" },
  "renascenca-roma":   { name: "Renascença — Roma",     family: "ely", renascenca: true, purple: "#c7a35a", purpleBright: "#e9d29a", cyan: "#6f9a5b", cyanDark: "#527642", bg: "#0f0d09", surface: "#1c1810", surface2: "#16130c", glassInk: "28,24,16", blobs: ["#3a4a24", "#5a4214", "#2a2416"], shaft: "#c7a35a" },

  ely:         { name: "Campos Elísios", family: "ely", purple: "#d9b168", purpleBright: "#f2d49b", cyan: "#9fd8cf", cyanDark: "#6fb3a9", bg: "#0a0c14", surface: "#131726", surface2: "#0e1220", glassInk: "16,21,36", blobs: ["#8a6a2e", "#2f5d57", "#4a3f6b"], shaft: "#d9b168" },
  "ely-dusk":  { name: "Crepúsculo",     family: "ely", purple: "#f0a850", purpleBright: "#ffc47a", cyan: "#e07a9b", cyanDark: "#b85e7c", bg: "#0b0818", surface: "#171232", surface2: "#110d26", glassInk: "26,18,48", blobs: ["#7a4520", "#6b2f47", "#3b2a6b"], shaft: "#f0a850" },
  "ely-ether": { name: "Éter",           family: "ely", purple: "#a8c4d8", purpleBright: "#d3e4f0", cyan: "#7fd4c8", cyanDark: "#4fa89c", bg: "#080b12", surface: "#111624", surface2: "#0c101c", glassInk: "15,21,34", blobs: ["#33506b", "#2b5f59", "#3a4560"], shaft: "#a8c4d8" },

  lg:          { name: "Vidro Líquido", family: "lg", purple: "#6d4aff", purpleBright: "#7c5cff", cyan: "#22b8cf", cyanDark: "#0e9bb3", bg: "#f2f1f7", surface: "rgba(255,255,255,0.78)", surface2: "rgba(255,255,255,0.6)", glassInk: "243,241,252", blobs: ["#cbb9ff", "#b8ecf3", "#ded7ff"] },
  "lg-tide":   { name: "Vidro — Maré",  family: "lg", purple: "#1e7fd4", purpleBright: "#3d97e6", cyan: "#17b8a6", cyanDark: "#0e9384", bg: "#eef4f9", surface: "rgba(255,255,255,0.78)", surface2: "rgba(255,255,255,0.6)", glassInk: "237,244,251", blobs: ["#b6d8f7", "#b3ecdf", "#cfe6f5"] },
  // Minimal (20/10): as cores são montadas na hora a partir do Windows (claro/escuro + cor de
  // destaque) — `paletaMinimal` no main, aplicada por `applyTheme`. Estes valores são só o
  // ponto de partida antes de o sistema responder.
  minimal:     { name: "Minimal — do sistema", family: "lg", minimal: true, purple: "#0078d4", purpleBright: "#005a9e", cyan: "#52525b", cyanDark: "#3f3f46", bg: "#ffffff", surface: "#f6f6f7", surface2: "#efeff1", glassInk: "246,246,247" },
  "lg-amber":  { name: "Vidro — Âmbar", family: "lg", purple: "#c2602c", purpleBright: "#dd7a41", cyan: "#c9971f", cyanDark: "#a67c12", bg: "#f8f3ec", surface: "rgba(255,255,255,0.78)", surface2: "rgba(255,255,255,0.6)", glassInk: "251,245,236", blobs: ["#f7d4b3", "#f2e2b0", "#f6e3d2"] },
};

/** Todas as famílias existentes, para limpar a classe anterior sem adivinhação. */
const THEME_FAMILIES = ["lg", "ely"];

const FALLBACK_THEME = "stark";

/**
 * 🔴 Os quatro temas antigos saíram, mas a escolha do usuário ficou gravada em disco.
 *
 * Sem esta tabela, um `theme: "default"` guardado faria `THEMES[id]` devolver undefined,
 * `p.purple` estourar, e **o JS do dashboard inteiro morrer na abertura** — janela em
 * branco, sem erro visível para o usuário. É o mesmo tipo de falha silenciosa do modelo
 * aposentado da Groq (ver §7 do handoff): escolha antiga que continua válida no disco
 * depois de deixar de existir no código.
 */
const TEMAS_APOSENTADOS = {
  default: "ely",
  ocean:   "ely-ether",
  ember:   "ely-dusk",
  forest:  "ely",
};

let currentTheme = FALLBACK_THEME;

/**
 * Converte "#6d4aff" em "109,74,255".
 *
 * As variáveis `--purple-rgb`/`--cyan-rgb` existem porque `rgba()` precisa dos
 * componentes separados para receber alfa. Derivar do próprio hex da paleta — em vez de
 * guardar os dois formatos no THEMES — impede que eles saiam de sincronia num tema novo.
 * Valor não-hex (o `lg` usa rgba() em `surface`) devolve null e a variável não é mexida.
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
    console.log(`[tema] "${id}" foi aposentado; usando "${novo}".`);
    window.nx?.setConfig({ theme: novo }).catch(() => {});
    id = novo;
  }

  const t = THEMES[id] ? id : FALLBACK_THEME;
  // Minimal: a paleta do sistema, quando já chegou; senão o ponto de partida da tabela.
  const p = t === "minimal" && coresDoSistema ? { ...THEMES.minimal, ...coresDoSistema.paleta } : THEMES[t];
  currentTheme = t;
  const root = document.documentElement.style;
  root.setProperty("--purple", p.purple);
  root.setProperty("--purple-bright", p.purpleBright);
  root.setProperty("--cyan", p.cyan);
  root.setProperty("--cyan-dark", p.cyanDark);
  root.setProperty("--bg", p.bg);
  root.setProperty("--surface", p.surface);
  root.setProperty("--surface2", p.surface2);
  // A tinta do vidro sai da PALETA do tema, nunca de branco puro: branco puro com
  // desfoque baixo foi o que produziu o aspecto leitoso. Tema sem tinta propria volta
  // ao padrao do :root em vez de herdar a do tema anterior.
  if (p.glassInk) root.setProperty("--glass-ink", p.glassInk);
  else root.removeProperty("--glass-ink");

  const purpleRgb = hexToRgbList(p.purple);
  const cyanRgb   = hexToRgbList(p.cyan);
  if (purpleRgb) root.setProperty("--purple-rgb", purpleRgb);
  if (cyanRgb)   root.setProperty("--cyan-rgb", cyanRgb);

  // Tema sem blobs próprios limpa os do anterior, senão a camada de fundo ficaria com a
  // cor de um tema que já não está mais aplicado. Mesma regra para os feixes.
  for (let i = 0; i < 3; i++) {
    const cor = p.blobs?.[i];
    if (cor) root.setProperty(`--blob-${i + 1}`, cor);
    else root.removeProperty(`--blob-${i + 1}`);
  }
  if (p.shaft) root.setProperty("--shaft", p.shaft);
  else root.removeProperty("--shaft");

  for (const fam of THEME_FAMILIES) {
    document.body.classList.toggle(`theme-${fam}`, fam === p.family);
  }
  document.body.classList.toggle("theme-stark", !!p.stark);
  document.body.classList.toggle("theme-renascenca", !!p.renascenca);
  document.body.classList.toggle("theme-minimal", !!p.minimal);
  document.body.classList.toggle("theme-dk", !!p.dk);
  document.body.classList.toggle("theme-gl", !!p.gl);
  // Classe comum às duas famílias. Carrega só o que é movimento — molas, entradas de modal
  // e bolha, brilho nos botões, a camada de blobs — que é idêntico entre elas.
  document.body.classList.add("theme-rich");

  renderThemeSwatches();
}

function renderThemeSwatches() {
  const wrap = document.getElementById("theme-swatches");
  if (!wrap) return;
  wrap.innerHTML = "";
  const grades = {};
  for (const [fam, rotulo] of [["novo", "Dark e Glass — o design novo, igual ao celular"], ["stark", "Stark — HUD"],["renascenca", "Renascença — ouro e afresco"], ["ely", "ELYSIUM — noite"], ["lg", "Vidro Líquido — dia"], ["minimal", "Minimal — segue o Windows"]]) {
    const bloco = document.createElement("div");
    bloco.innerHTML = `<div class="theme-familia">${rotulo}</div><div class="theme-grade"></div>`;
    wrap.appendChild(bloco);
    grades[fam] = bloco.querySelector(".theme-grade");
  }
  Object.entries(THEMES).forEach(([id, t]) => {
    const div = document.createElement("div");
    div.className = "theme-swatch" + (id === currentTheme ? " active" : "");
    div.title = t.name;
    const cardPrevia = t.family === "lg" ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.10)";
    div.innerHTML = `
      <div class="theme-previa" style="--previa-bg:${t.bg};--previa-card:${cardPrevia}">
        <i style="background:${t.purpleBright}"></i><i style="background:${t.cyan}"></i><b></b>
      </div>
      <span class="theme-swatch-name">${escHtml(t.name)}</span>`;
    div.addEventListener("click", () => {
      applyTheme(id);
      cfgAtual.theme = id;
      window.nx.setConfig({ theme: id }).catch(() => {});
    });
    grades[t.dk || t.gl ? "novo" : t.minimal ? "minimal" : t.stark ? "stark" : t.renascenca ? "renascenca" : t.family].appendChild(div);
  });
}

// Tema Minimal: as cores do Windows chegam depois da abertura e a cada troca de modo ou de cor
// de destaque. Com outro tema ligado, só ficam guardadas.
var coresDoSistema = null; // `var`: o applyTheme pode rodar antes desta linha.
function receberCoresDoSistema(c) {
  if (!c || !c.paleta) return;
  coresDoSistema = c;
  if (currentTheme === "minimal") applyTheme("minimal");
}
window.nx?.sistemaCores?.().then(receberCoresDoSistema).catch(() => {});
window.nx?.onSistemaCores?.(receberCoresDoSistema);

// Os insights do sistema e a faixa de estabilidade de 24 h saíram daqui: os primeiros
// viraram card da tela Início, a segunda foi removida junto com a gaveta de sistema no
// bloco 35 — era um gráfico bonito que não levava a lugar nenhum.
