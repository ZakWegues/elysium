// dashboard/js/liquido.js — vidro líquido de verdade (31/10).
//
// O Zak pediu "Liquid Glass de verdade, com distorção do fundo". O desfoque sozinho não dobra
// nada; aqui cada superfície ganha um filtro SVG próprio com um MAPA DE DESLOCAMENTO do tamanho
// dela: a borda funciona como lente (o fundo é puxado para dentro e entorta perto da aresta, como
// na curva de um vidro grosso), o meio fica quase limpo. O filtro entra pelo `backdrop-filter`
// (`url(#lq-N)` antes do desfoque) — só o Chromium faz isso, e o Electron é Chromium.
//
// Força por tema: Glass inteiro, Dark metade, Stark nada. O ajuste "Vidro líquido" (Aparência)
// liga, deixa leve ou desliga; "Nunca animar" tira o brilho que segue o cursor.

// 31/10 (2.37): só o que FLUTUA. Barra de cima, caixa de digitar, faixa IA/Celular e gavetas encostam
// nas bordas da janela, e a lente fazia nelas uma moldura de refração solta no meio da tela.
const LQ_ALVOS = "#viewtabs, .chat-switch, #paleta, .modal-box";
/** Deslocamento máximo (px) na aresta, no Glass com o ajuste ligado. */
const LQ_FORCA = 72;

const lqSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
lqSvg.setAttribute("aria-hidden", "true");
lqSvg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
document.body.appendChild(lqSvg);

/** elemento → { id, w, h, r } do filtro que está nele. */
const lqFiltros = new Map();
let lqSeq = 0;
let lqModo = "ligado";

/** Quanto entorta agora: tema × ajuste. 0 = sem vidro líquido. */
function lqEscala() {
  if (lqModo === "desligado") return 0;
  const b = document.body.classList;
  const tema = b.contains("theme-stark") ? 0 : b.contains("theme-gl") ? 1 : 0.5;
  return LQ_FORCA * tema * (lqModo === "leve" ? 0.45 : 1);
}

/**
 * O mapa: canal R = deslocamento em x, G = em y (0,5 = parado). Perto da aresta do retângulo
 * arredondado o vetor aponta para dentro, com força crescendo em curva até a borda. Feito em meia
 * resolução (o feImage estica) — uma barra de 1000×60 são 15 mil pixels.
 */
function lqMapa(w, h, r) {
  const k = 0.5;
  const cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(h * k));
  const c = document.createElement("canvas");
  c.width = cw; c.height = ch;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(cw, ch);
  const rr = Math.min(r, w / 2, h / 2);
  const borda = Math.max(10, Math.min(34, Math.min(w, h) * 0.5));
  const hx = w / 2 - rr, hy = h / 2 - rr;
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const px = (i + 0.5) / k - w / 2, py = (j + 0.5) / k - h / 2;
      const qx = Math.abs(px) - hx, qy = Math.abs(py) - hy;
      // Distância (negativa por dentro) ao retângulo arredondado e a normal para fora.
      let dist, nx, ny;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        dist = l - rr; nx = qx / l; ny = qy / l;
      } else if (qx > qy) {
        dist = qx - rr; nx = 1; ny = 0;
      } else {
        dist = qy - rr; nx = 0; ny = 1;
      }
      nx *= Math.sign(px) || 1; ny *= Math.sign(py) || 1;
      const dentro = -dist;
      const t = dentro < borda ? 1 - Math.max(0, dentro) / borda : 0;
      const m = t * t;
      const o = (j * cw + i) * 4;
      img.data[o] = Math.round(255 * (0.5 - 0.5 * nx * m));
      img.data[o + 1] = Math.round(255 * (0.5 - 0.5 * ny * m));
      img.data[o + 2] = 128;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function lqRaio(el, w, h) {
  const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return Math.min(r, w / 2, h / 2);
}

/** Aplica (ou refaz, se o tamanho mudou) o filtro de um elemento. */
function lqAplicar(el) {
  const escala = lqEscala();
  const atual = lqFiltros.get(el);
  if (!escala) { if (atual) lqTirar(el); return; }
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (w < 24 || h < 24) return;
  const r = lqRaio(el, w, h);
  if (atual && atual.w === w && atual.h === h && atual.r === r && atual.escala === escala) return;
  const id = atual?.id ?? `lq-${++lqSeq}`;
  let filtro = lqSvg.querySelector(`#${id}`);
  if (!filtro) {
    filtro = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filtro.id = id;
    filtro.setAttribute("filterUnits", "userSpaceOnUse");
    filtro.setAttribute("primitiveUnits", "userSpaceOnUse");
    filtro.setAttribute("color-interpolation-filters", "sRGB");
    filtro.innerHTML = '<feImage result="mapa" preserveAspectRatio="none"/><feDisplacementMap in="SourceGraphic" in2="mapa" xChannelSelector="R" yChannelSelector="G"/>';
    lqSvg.appendChild(filtro);
  }
  for (const [a, v] of [["x", 0], ["y", 0], ["width", w], ["height", h]]) filtro.setAttribute(a, v);
  const img = filtro.querySelector("feImage");
  for (const [a, v] of [["x", 0], ["y", 0], ["width", w], ["height", h]]) img.setAttribute(a, v);
  img.setAttribute("href", lqMapa(w, h, r));
  filtro.querySelector("feDisplacementMap").setAttribute("scale", String(escala));
  // O desfoque que a superfície já tinha continua, depois da lente.
  const base = (getComputedStyle(el).getPropertyValue("--lq-blur") || "blur(14px) saturate(165%)").trim();
  el.style.backdropFilter = `url(#${id}) ${base}`;
  el.classList.add("lq");
  lqFiltros.set(el, { id, w, h, r, escala });
}

function lqTirar(el) {
  const atual = lqFiltros.get(el);
  if (atual) lqSvg.querySelector(`#${atual.id}`)?.remove();
  lqFiltros.delete(el);
  el.style.backdropFilter = "";
  el.classList.remove("lq");
}

const lqTamanho = new ResizeObserver((entradas) => {
  for (const e of entradas) lqAplicar(e.target);
});

/** Procura superfícies novas (modais e a paleta nascem depois) e esquece as que saíram. */
function lqVarrer() {
  for (const el of document.querySelectorAll(LQ_ALVOS)) {
    if (!lqFiltros.has(el)) lqTamanho.observe(el);
    lqAplicar(el);
  }
  for (const el of [...lqFiltros.keys()]) {
    if (!el.isConnected) { lqTamanho.unobserve(el); lqTirar(el); }
  }
}

let lqPendente = 0;
function lqLogo() {
  if (lqPendente) return;
  lqPendente = requestAnimationFrame(() => { lqPendente = 0; lqVarrer(); });
}
new MutationObserver(lqLogo).observe(document.body, { childList: true, subtree: true });
// Troca de tema muda a força (Glass/Dark/Stark).
new MutationObserver(() => {
  for (const el of lqFiltros.keys()) { const a = lqFiltros.get(el); if (a) a.escala = -1; }
  lqLogo();
}).observe(document.body, { attributes: true, attributeFilter: ["class"] });

/** O brilho que acompanha o cursor DENTRO da superfície (só ele; nada segue o mouse fora). */
document.addEventListener("pointermove", (e) => {
  const el = e.target instanceof Element ? e.target.closest(".lq") : null;
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${Math.round(e.clientX - r.left)}px`);
  el.style.setProperty("--my", `${Math.round(e.clientY - r.top)}px`);
}, { passive: true });

/** Chamado pelo ajuste "Vidro líquido" (ligado | leve | desligado). */
function aplicarVidroLiquido(modo) {
  lqModo = modo === "leve" || modo === "desligado" ? modo : "ligado";
  document.documentElement.dataset.vidro = lqModo;
  for (const el of lqFiltros.keys()) { const a = lqFiltros.get(el); if (a) a.escala = -1; }
  lqVarrer();
}

window.nx?.getConfig?.().then((c) => aplicarVidroLiquido(c?.vidroLiquido)).catch(() => aplicarVidroLiquido("ligado"));
