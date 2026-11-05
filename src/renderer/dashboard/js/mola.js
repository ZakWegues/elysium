// dashboard/js/mola.js — o jeito de apertar dos botões de vidro (04/11).
//
// O mesmo movimento da biblioteca Glisse (github.com/0kzh/glisse, MIT): apertar faz o botão
// CRESCER um pouco (6 px no lado maior, mola dura); arrastar com ele apertado estica no sentido do
// gesto e amassa no outro, com uma borracha que endurece quanto mais longe; soltar volta numa mola
// mais mole. Tudo por `scale`/`translate` (propriedades próprias, não somam com o `transform` de
// ninguém). "Nunca animar" (e o reduzir movimento do sistema) deixa só o crescer, sem mola.

/** [rigidez, amortecimento] — os do mouse na Glisse. */
const MOLA_APERTO = [417.6, 29.2], MOLA_SOLTA = [230, 23.7];
const MOLA_CRESCE = 6, MOLA_DESLIZA = 8;

const molaEstado = new WeakMap();

function molaSemMovimento() {
  const m = document.documentElement.dataset.movimento;
  if (m === "nunca") return true;
  return m !== "sempre" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function molaDesenhar(el, v) {
  if (Math.abs(v.sx - 1) < 1e-3 && Math.abs(v.sy - 1) < 1e-3 && Math.abs(v.tx) < 0.05 && Math.abs(v.ty) < 0.05) {
    el.style.removeProperty("scale");
    el.style.removeProperty("translate");
    return;
  }
  el.style.scale = `${v.sx.toFixed(4)} ${v.sy.toFixed(4)}`;
  el.style.translate = `${v.tx.toFixed(2)}px ${v.ty.toFixed(2)}px`;
}

/** Leva o elemento até `alvo` pela mola [k, c] (massa 1; dt preso em 0,1 s, como na Glisse). */
function molaIr(el, alvo, [k, c]) {
  let e = molaEstado.get(el);
  if (!e) { e = { v: { sx: 1, sy: 1, tx: 0, ty: 0 }, vel: { sx: 0, sy: 0, tx: 0, ty: 0 }, raf: 0, t: 0 }; molaEstado.set(el, e); }
  e.alvo = alvo; e.k = k; e.c = c;
  if (molaSemMovimento() || document.hidden) {
    cancelAnimationFrame(e.raf); e.raf = 0;
    Object.assign(e.v, alvo); Object.assign(e.vel, { sx: 0, sy: 0, tx: 0, ty: 0 });
    molaDesenhar(el, e.v);
    return;
  }
  if (e.raf) return;
  e.t = performance.now();
  const passo = (agora) => {
    let dt = Math.min(0.1, (agora - e.t) / 1000);
    e.t = agora;
    // Passos de 4 ms: a mola dura (k 417) estoura com o quadro inteiro de uma vez.
    let parado = true;
    while (dt > 0) {
      const h = Math.min(dt, 0.004);
      dt -= h;
      for (const p of ["sx", "sy", "tx", "ty"]) {
        const a = e.k * (e.alvo[p] - e.v[p]) - e.c * e.vel[p];
        e.vel[p] += a * h;
        e.v[p] += e.vel[p] * h;
      }
    }
    for (const p of ["sx", "sy", "tx", "ty"]) {
      const escala = p[0] === "s" ? 1e-3 : 0.05;
      if (Math.abs(e.alvo[p] - e.v[p]) > escala || Math.abs(e.vel[p]) > escala * 10) parado = false;
    }
    if (parado) Object.assign(e.v, e.alvo);
    molaDesenhar(el, e.v);
    e.raf = parado ? 0 : requestAnimationFrame(passo);
  };
  e.raf = requestAnimationFrame(passo);
}

document.addEventListener("pointerdown", (ev) => {
  if (ev.button !== 0) return;
  const el = ev.target instanceof Element ? ev.target.closest(LQ_BOTOES) : null;
  if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return;
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!w || !h) return;
  const s0 = 1 + MOLA_CRESCE / Math.max(w, h);
  const menor = Math.min(w, h), aspecto = Math.max(w, h) / menor;
  const x0 = ev.clientX, y0 = ev.clientY;
  el.classList.add("mola-apertado");
  molaIr(el, { sx: s0, sy: s0, tx: 0, ty: 0 }, MOLA_APERTO);

  const mover = (e) => {
    const dx = e.clientX - x0, dy = e.clientY - y0, len = Math.hypot(dx, dy);
    if (!len) return;
    const nx = dx / len, ny = dy / len;
    const borracha = 1 - 1 / (1 + len / menor / (5 * aspecto));
    const estica = 1 + (MOLA_CRESCE / menor) * borracha * Math.abs(Math.abs(nx) - Math.abs(ny));
    const deitado = Math.abs(nx) > Math.abs(ny);
    molaIr(el, {
      sx: s0 * (deitado ? estica : 1 / estica), sy: s0 * (deitado ? 1 / estica : estica),
      tx: nx * MOLA_DESLIZA * borracha, ty: ny * MOLA_DESLIZA * borracha,
    }, MOLA_APERTO);
  };
  const soltar = () => {
    el.classList.remove("mola-apertado");
    molaIr(el, { sx: 1, sy: 1, tx: 0, ty: 0 }, MOLA_SOLTA);
    document.removeEventListener("pointermove", mover);
    document.removeEventListener("pointerup", soltar);
    document.removeEventListener("pointercancel", soltar);
  };
  document.addEventListener("pointermove", mover, { passive: true });
  document.addEventListener("pointerup", soltar);
  document.addEventListener("pointercancel", soltar);
});

// A parte cheia do trilho das faixas (design.css lê --cheio). As faixas nascem com o HTML de cada
// tela, então a varredura roda a cada mudança da árvore (agrupada num quadro).
const FAIXAS = '.cfg-faixa input[type="range"], .pc-vol input[type="range"], .mus-vol input[type="range"]';
function faixaCheia(el) {
  const min = Number(el.min) || 0, max = Number(el.max) || 100;
  el.style.setProperty("--cheio", `${((Number(el.value) - min) / (max - min || 1)) * 100}%`);
}
document.addEventListener("input", (e) => { if (e.target instanceof Element && e.target.matches(FAIXAS)) faixaCheia(e.target); });
let faixasPendente = 0;
new MutationObserver(() => {
  if (faixasPendente) return;
  faixasPendente = requestAnimationFrame(() => { faixasPendente = 0; document.querySelectorAll(FAIXAS).forEach(faixaCheia); });
}).observe(document.body, { childList: true, subtree: true });
document.querySelectorAll(FAIXAS).forEach(faixaCheia);
