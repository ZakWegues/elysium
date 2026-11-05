// dashboard/js/liquido.js — vidro líquido de verdade (31/10; óptica nova em 04/11).
//
// Cada superfície ganha um filtro SVG com MAPA DE DESLOCAMENTO do tamanho dela, aplicado pelo
// `backdrop-filter` (`url(#lq-N)` antes do desfoque) — só o Chromium faz isso, e o Electron é
// Chromium. 04/11: a óptica segue a da biblioteca Glisse (github.com/0kzh/glisse, MIT):
//   - "painel" (ilhas, menus, botões): um domo — o aro (25% do lado menor) puxa o fundo para
//     dentro em arco, o miolo fica limpo;
//   - "lente" (polegares segurados): superfície squircle e refração de Snell com n = 1,5 — o
//     deslocamento sai em px de verdade, do ângulo de entrada e da espessura do vidro;
//   - dispersão: R, G e B deslocados em escalas diferentes (1,08 / 1,04 / 1) e somados;
//   - brilho: três faixas suaves no aro, com a luz vindo de cima à esquerda (45°), e um fio de
//     1,2 px na aresta — fraco de propósito (o Zak: "pouco reflexo forçado").
//
// Força por tema: Glass inteiro, Dark 80%, Stark nada. O ajuste "Vidro líquido" (Aparência)
// liga, deixa leve ou desliga; "Nunca animar" tira o brilho que segue o cursor.

// Só o que FLUTUA (a caixa de digitar volta em 04/11 com tinta grossa, ver liquido.css).
const LQ_PAINEIS = [
  "#viewtabs", ".chat-switch", "#paleta", ".modal-box", "#input-bar", "#toast-el",
  ".pop", "#preset-pop", ".modo-pop", ".bolha-menu", ".tc-menu",
].join(", ");
// Botões e chips: o mesmo domo, e a mola de apertar (js/mola.js).
const LQ_BOTOES = [
  "#topbar button", "#topbar #status-badge", ".save-btn", ".send-btn", ".mic-btn", "#preset-btn",
  "#conv-btn", ".pop-form-acoes button", "#home-btn-personalizar", "#pc-reler", ".hoje-botoes button",
  ".home-chips span", ".modo-chip", ".home-clima-chip", ".gp-chips > *", ".clima-chips > *",
].join(", ");
// Lentes (perfil "lente", marcadas com data-lq-perfil): o seletor da barra enquanto segurado.
const LQ_LENTES = "#viewtabs.segurando #vtab-thumb";
const LQ_ALVOS = `${LQ_PAINEIS}, ${LQ_BOTOES}, ${LQ_LENTES}`;
/** Filtros vivos no máximo: os maiores visíveis ganham a lente; o resto fica só com o desfoque. */
const LQ_TETO = 40;
/** Força do domo: fração do lado menor (a Glisse usa 0,45; mais intenso desde 05/11),
 *  com teto para as gavetas grandes. A lente dos polegares ganha o mesmo reforço. */
const LQ_DOMO = 0.62, LQ_DOMO_MAX = 84, LQ_LENTE_GANHO = 1.35;
/** A lente segurada estica com a mola pixel a pixel: o tamanho dela anda em degraus deste
 *  tamanho (sempre para cima, o filtro cobre o elemento inteiro), senão cada pixel era um
 *  mapa novo e o arrasto travava (05/11). */
const LQ_DEGRAU_LENTE = 6;

const lqSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
lqSvg.setAttribute("aria-hidden", "true");
lqSvg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
document.body.appendChild(lqSvg);

/** elemento → chave do filtro que está nele. */
const lqFiltros = new Map();
/** chave → { id, usos } — elementos do mesmo tamanho dividem o filtro (os chips, os botões). */
const lqCache = new Map();
let lqSeq = 0;
let lqModo = "ligado";

/** Tema × ajuste, de 0 a 1. 0 = sem vidro líquido. */
function lqFator() {
  if (lqModo === "desligado") return 0;
  const b = document.body.classList;
  // 05/11: o Dark com 80% (era metade): o Zak quer o vidro bem visível.
  const tema = b.contains("theme-stark") ? 0 : b.contains("theme-gl") ? 1 : 0.8;
  return tema * (lqModo === "leve" ? 0.45 : 1);
}

/** Distância (negativa por dentro) ao retângulo arredondado e a normal para fora. */
function lqSdf(px, py, hx, hy, rr) {
  const qx = Math.abs(px) - hx, qy = Math.abs(py) - hy;
  let dist, nx, ny;
  if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; dist = l - rr; nx = qx / l; ny = qy / l; }
  else if (qx > qy) { dist = qx - rr; nx = 1; ny = 0; }
  else { dist = qy - rr; nx = 0; ny = 1; }
  return { dentro: -dist, nx: nx * (Math.sign(px) || 1), ny: ny * (Math.sign(py) || 1) };
}

/** Geometria da lente (Glisse): bisel e espessura em px, e o maior deslocamento que ela dá. */
function lqLente(w, h) {
  const m = Math.min(w, h);
  const bisel = Math.min(10, Math.max(4, m * 0.12)), espessura = Math.min(24, Math.max(8, m * 0.2));
  // Na aresta o raio entra quase rasante: tan(90° − asin(1/1,5)) × espessura.
  return { bisel, espessura, max: Math.tan(Math.PI / 2 - Math.asin(1 / 1.5)) * (espessura + bisel) };
}

/** Quanto desloca (0–1, para dentro) a `dentro` px da aresta, em cada perfil. */
function lqPerfil(perfil, dentro, w, h, g) {
  if (perfil === "lente") {
    if (dentro >= g.bisel) return 0;
    const t = Math.max(0, dentro) / g.bisel;
    const sup = (1 - (1 - t) ** 4) ** 0.25;
    const entrada = Math.atan((1 - t) ** 3 / Math.max(sup ** 3, 1e-4));
    const saida = Math.asin(Math.sin(entrada) / 1.5);
    return (Math.tan(entrada - saida) * (g.espessura + sup * g.bisel)) / g.max;
  }
  // Domo: aro de 25% do lado menor; o arco é íngreme na aresta e some no miolo.
  const aro = Math.min(w, h) * 0.25;
  if (dentro >= aro) return 0;
  const t = 1 - Math.max(0, dentro) / aro;
  return 1 - Math.sqrt(1 - t * t);
}

/**
 * O mapa: canal R = deslocamento em x, G = em y (0,5 = parado), o vetor aponta para dentro. E o
 * brilho: alfa branco no aro, mais forte onde a normal encara a luz (cima-esquerda). Meia
 * resolução nos dois (o feImage estica).
 */
const lqMapasGuardados = new Map();
function lqMapas(perfil, w, h, r) {
  const chave = `${perfil}|${w}|${h}|${r}`;
  const achado = lqMapasGuardados.get(chave);
  if (achado) { lqMapasGuardados.delete(chave); lqMapasGuardados.set(chave, achado); return achado; }
  const feito = lqDesenharMapas(perfil, w, h, r);
  lqMapasGuardados.set(chave, feito);
  // Os mais antigos saem: cada par de PNG é pequeno, mas a lista não cresce sem fim.
  if (lqMapasGuardados.size > 64) lqMapasGuardados.delete(lqMapasGuardados.keys().next().value);
  return feito;
}

function lqDesenharMapas(perfil, w, h, r) {
  const k = 0.5;
  const cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(h * k));
  const fazer = () => { const c = document.createElement("canvas"); c.width = cw; c.height = ch; return c; };
  const cm = fazer(), cl = fazer();
  const xm = cm.getContext("2d"), xl = cl.getContext("2d");
  const im = xm.createImageData(cw, ch), il = xl.createImageData(cw, ch);
  const rr = Math.min(r, w / 2, h / 2), hx = w / 2 - rr, hy = h / 2 - rr;
  const g = lqLente(w, h);
  const faixa = perfil === "lente" ? g.bisel : Math.min(w, h) * 0.25;
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const px = (i + 0.5) / k - w / 2, py = (j + 0.5) / k - h / 2;
      const { dentro, nx, ny } = lqSdf(px, py, hx, hy, rr);
      const m = lqPerfil(perfil, dentro, w, h, g);
      const o = (j * cw + i) * 4;
      im.data[o] = Math.round(255 * (0.5 - 0.5 * nx * m));
      im.data[o + 1] = Math.round(255 * (0.5 - 0.5 * ny * m));
      im.data[o + 2] = 128;
      im.data[o + 3] = 255;
      // Brilho: luz a 45° de cima-esquerda; o lado oposto devolve um reflexo mais fraco.
      const luz = -(nx + ny) * Math.SQRT1_2;
      const glint = Math.max(luz, 0) ** 3, refl = Math.max(-luz, 0) ** 3;
      const d = Math.max(0, dentro) / Math.max(faixa, 1);
      let a = 0;
      if (d < 1) {
        const bandas = [0.18, 0.42, 0.66].reduce((s, c) => s + Math.exp(-(((d - c) / 0.22) ** 2)), 0) / 3;
        // Na lente as três faixas viravam anéis em volta do polegar (o "contorno zoado"): ali
        // fica só um terço delas, e o brilho mora no fio da aresta.
        a = bandas * (0.06 + 0.8 * glint + 0.35 * refl) * 0.85 * 0.35 * (perfil === "lente" ? 0.3 : 1);
      }
      if (dentro >= 0 && dentro < 1.22) a += 0.22 * (0.35 + 0.65 * glint);
      il.data[o] = il.data[o + 1] = il.data[o + 2] = 255;
      il.data[o + 3] = Math.round(255 * Math.min(1, a));
    }
  }
  xm.putImageData(im, 0, 0);
  xl.putImageData(il, 0, 0);
  return { mapa: cm.toDataURL(), luz: cl.toDataURL() };
}

/**
 * Um filtro: três deslocamentos (um por canal, em escalas diferentes), somados de volta, e o
 * brilho por cima em `screen`. Mesmo tamanho, raio, perfil e força = mesmo filtro.
 */
function lqFiltro(perfil, w, h, r, fator) {
  const forca = perfil === "lente" ? lqLente(w, h).max * LQ_LENTE_GANHO * fator : Math.min(LQ_DOMO_MAX, LQ_DOMO * Math.min(w, h)) * fator;
  const chave = `${perfil}|${w}|${h}|${r}|${forca.toFixed(1)}`;
  const achado = lqCache.get(chave);
  if (achado) { achado.usos++; return chave; }
  const id = `lq-${++lqSeq}`;
  const { mapa, luz } = lqMapas(perfil, w, h, r);
  const caixa = `x="0" y="0" width="${w}" height="${h}"`;
  const canal = (s, m, nome) =>
    `<feDisplacementMap in="SourceGraphic" in2="mapa" scale="${(forca * s).toFixed(2)}" xChannelSelector="R" yChannelSelector="G" result="d${nome}"/>` +
    `<feColorMatrix in="d${nome}" type="matrix" values="${m} 0 0 0 1 0" result="${nome}"/>`;
  const filtro = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  filtro.id = id;
  for (const [a, v] of [["x", 0], ["y", 0], ["width", w], ["height", h], ["filterUnits", "userSpaceOnUse"], ["primitiveUnits", "userSpaceOnUse"], ["color-interpolation-filters", "sRGB"]]) filtro.setAttribute(a, v);
  filtro.innerHTML =
    `<feImage ${caixa} href="${mapa}" preserveAspectRatio="none" result="mapa"/>` +
    canal(1.08, "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0 ", "r") +
    canal(1.04, "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0 ", "g") +
    canal(1, "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0 ", "b") +
    `<feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg"/>` +
    `<feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1" result="cor"/>` +
    `<feImage ${caixa} href="${luz}" preserveAspectRatio="none" result="luz"/>` +
    `<feBlend in="luz" in2="cor" mode="screen"/>`;
  lqSvg.appendChild(filtro);
  lqCache.set(chave, { id, usos: 1 });
  return chave;
}

function lqSoltar(chave) {
  const f = lqCache.get(chave);
  if (!f || --f.usos > 0) return;
  lqSvg.querySelector(`#${f.id}`)?.remove();
  lqCache.delete(chave);
}

function lqRaio(el, w, h) {
  const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return Math.min(r, w / 2, h / 2);
}

/** Aplica (ou refaz, se o tamanho mudou) o filtro de um elemento. */
function lqAplicar(el) {
  const fator = lqFator();
  let w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (!fator || w < 24 || h < 24) { lqTirar(el); return; }
  const perfil = el.dataset.lqPerfil === "lente" ? "lente" : "painel";
  if (perfil === "lente") { w = Math.ceil(w / LQ_DEGRAU_LENTE) * LQ_DEGRAU_LENTE; h = Math.ceil(h / LQ_DEGRAU_LENTE) * LQ_DEGRAU_LENTE; }
  const chave = lqFiltro(perfil, w, h, Math.round(lqRaio(el, w, h)), fator);
  const atual = lqFiltros.get(el);
  if (atual === chave) { lqSoltar(chave); return; }
  if (atual) lqSoltar(atual);
  // O desfoque que a superfície já tinha continua, depois da lente.
  const base = (getComputedStyle(el).getPropertyValue("--lq-blur") || "blur(3px) saturate(150%)").trim();
  el.style.backdropFilter = `url(#${lqCache.get(chave).id}) ${base}`;
  el.classList.add("lq");
  lqFiltros.set(el, chave);
}

function lqTirar(el) {
  const atual = lqFiltros.get(el);
  if (atual) lqSoltar(atual);
  lqFiltros.delete(el);
  el.style.backdropFilter = "";
  el.classList.remove("lq");
}

const lqTamanho = new ResizeObserver((entradas) => {
  for (const e of entradas) if (lqFiltros.has(e.target)) lqAplicar(e.target);
});

/**
 * Procura superfícies novas (modais, menus e a paleta nascem depois), esquece as que saíram e
 * guarda a lente para as LQ_TETO maiores visíveis: três deslocamentos por superfície custam.
 */
function lqVarrer() {
  const visiveis = [...document.querySelectorAll(LQ_ALVOS)]
    .filter((el) => el.offsetWidth >= 24 && el.offsetHeight >= 24 && el.getClientRects().length)
    .sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
  const vivos = new Set(visiveis.slice(0, LQ_TETO));
  for (const el of [...lqFiltros.keys()]) {
    if (!vivos.has(el)) { lqTamanho.unobserve(el); lqTirar(el); }
  }
  for (const el of vivos) {
    if (!lqFiltros.has(el)) lqTamanho.observe(el);
    lqAplicar(el);
  }
}

/** Liga ou tira a lente de um elemento só, sem varrer a página (o seletor ao segurar: a
 *  varredura inteira forçava layout de todos os alvos bem no quadro do clique). */
function lqSo(el, ligar) {
  if (ligar) { lqTamanho.observe(el); lqAplicar(el); }
  else { lqTamanho.unobserve(el); lqTirar(el); }
}

/** Desenha de antemão os mapas que o seletor usa quando é segurado e esticado (a largura dele
 *  e alguns degraus acima): assim o primeiro arrasto não para para desenhar. */
function lqAquecerSeletor() {
  const t = document.getElementById("vtab-thumb");
  if (!t || !lqFator()) return;
  const h = Math.ceil(t.offsetHeight / LQ_DEGRAU_LENTE) * LQ_DEGRAU_LENTE;
  const w0 = Math.ceil(t.offsetWidth / LQ_DEGRAU_LENTE) * LQ_DEGRAU_LENTE;
  if (w0 < 24 || h < 24) return;
  for (let k = -1; k <= 6; k++) {
    const w = w0 + k * LQ_DEGRAU_LENTE;
    lqMapas("lente", w, h, Math.round(lqRaio(t, w, h)));
  }
}
(window.requestIdleCallback ?? setTimeout)(() => lqAquecerSeletor(), { timeout: 3000 });

let lqPendente = 0;
function lqLogo() {
  if (lqPendente) return;
  lqPendente = requestAnimationFrame(() => { lqPendente = 0; lqVarrer(); });
}
new MutationObserver(lqLogo).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "data-view"] });
// Troca de tema muda a força (Glass/Dark/Stark).
new MutationObserver(lqLogo).observe(document.body, { attributes: true, attributeFilter: ["class"] });

/** O brilho que acompanha o cursor DENTRO da superfície (só ele; nada segue o mouse fora). */
document.addEventListener("pointermove", (e) => {
  const el = e.target instanceof Element ? e.target.closest(".lq") : null;
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${Math.round(e.clientX - r.left)}px`);
  el.style.setProperty("--my", `${Math.round(e.clientY - r.top)}px`);
}, { passive: true });

/**
 * A lente dos polegares (switch e faixa segurados, seletor da barra): um filtro de perfil
 * "lente" por tamanho, publicado numa variável CSS — pseudo-elemento não recebe estilo inline.
 */
function lqPolegares() {
  const fator = lqFator();
  const raiz = document.documentElement.style;
  for (const [nome, w, h] of [["--lq-polegar-switch", 30, 26], ["--lq-polegar-faixa", 46, 30]]) {
    const chave = raiz.getPropertyValue(`${nome}-chave`);
    if (!fator) { if (chave) lqSoltar(chave); raiz.removeProperty(nome); raiz.removeProperty(`${nome}-chave`); continue; }
    const nova = lqFiltro("lente", w, h, Math.round(h / 2), fator);
    // Mesmo filtro de antes (a classe do body muda por muita coisa além do tema): nada a trocar.
    if (nova === chave) { lqSoltar(nova); continue; }
    if (chave) lqSoltar(chave);
    raiz.setProperty(nome, `url(#${lqCache.get(nova).id})`);
    raiz.setProperty(`${nome}-chave`, nova);
  }
}

/** Chamado pelo ajuste "Vidro líquido" (ligado | leve | desligado). */
function aplicarVidroLiquido(modo) {
  lqModo = modo === "leve" || modo === "desligado" ? modo : "ligado";
  document.documentElement.dataset.vidro = lqModo;
  for (const el of [...lqFiltros.keys()]) lqTirar(el);
  lqPolegares();
  lqVarrer();
}
new MutationObserver(lqPolegares).observe(document.body, { attributes: true, attributeFilter: ["class"] });

window.nx?.getConfig?.().then((c) => aplicarVidroLiquido(c?.vidroLiquido)).catch(() => aplicarVidroLiquido("ligado"));
