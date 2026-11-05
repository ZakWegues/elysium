// dashboard/js/abas.js — switchView, polegar, Ctrl+1..4.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// NAVEGAÇÃO POR ABAS
// ─────────────────────────────────────────────────
//
// Os mesmos destinos do celular. O trabalho pesado é CSS: com `data-view` no #layout, as
// gavetas deixam de ser painéis deslizantes e viram conteúdo de largura cheia. Nenhum
// markup foi movido — o que já funcionava continua exatamente onde estava.

const layoutEl = document.getElementById("layout");
const vtabs = document.querySelectorAll(".vtab");

/** Última aba usada, para o app reabrir onde você estava. */
const VIEW_KEY = "elysium_view";

/**
 * 31/10 — o seletor "gelatina" da barra (o do celular, que o Zak achou perfeito). Cada BORDA
 * do seletor é uma mola própria: a borda que vai na frente é mais dura e chega antes, a de
 * trás é mais mole e chega depois — o seletor estica no caminho e volta a ter o tamanho da
 * aba ao chegar, com um balanço pequeno. Tudo num laço de `requestAnimationFrame` que para
 * sozinho quando as molas assentam. As bordas ficam presas dentro da barra: o seletor nunca
 * passa dela.
 */
const polegar = {
  // Bordas atuais e velocidades: a = início (esquerda/topo), b = fim (direita/baixo);
  // c e d são o eixo cruzado (topo/baixo numa barra deitada), sem esticão.
  a: 0, b: 0, c: 0, d: 0, va: 0, vb: 0, vc: 0, vd: 0,
  alvo: null, pronto: false, rodando: false, arrastando: false, ultimo: 0,
};
function barraDeitada() {
  return !document.body.classList.contains("barra-esquerda") && !document.body.classList.contains("barra-direita");
}
function bordasDe(el) {
  return barraDeitada()
    ? { a: el.offsetLeft, b: el.offsetLeft + el.offsetWidth, c: el.offsetTop, d: el.offsetTop + el.offsetHeight }
    : { a: el.offsetTop, b: el.offsetTop + el.offsetHeight, c: el.offsetLeft, d: el.offsetLeft + el.offsetWidth };
}
function limitesDaBarra() {
  const barra = document.getElementById("viewtabs");
  // Segurando, o seletor cresce 12% a partir do centro (design.css, 04/11) — a folga cobre a
  // metade disso dos DOIS lados; antes ele vazava pela direita.
  const folga = 4 + (barra.classList.contains("segurando") ? Math.max(0, polegar.b - polegar.a) * 0.06 : 0);
  return barraDeitada()
    ? { min: folga, max: barra.clientWidth - folga }
    : { min: folga, max: barra.clientHeight - folga };
}
function desenharPolegar() {
  const thumb = document.getElementById("vtab-thumb");
  if (!thumb) return;
  const p = polegar;
  const deitada = barraDeitada();
  const x = deitada ? p.a : p.c, y = deitada ? p.c : p.a;
  const w = deitada ? p.b - p.a : p.d - p.c, h = deitada ? p.d - p.c : p.b - p.a;
  thumb.style.left = "0px";
  thumb.style.top = "0px";
  thumb.style.width = `${Math.max(0, w)}px`;
  thumb.style.height = `${Math.max(0, h)}px`;
  // 31/10: a posição vai na propriedade `translate`, não no `transform`: o `scale` do "segurando"
  // (design.css) multiplica o que está no transform — na última aba, 222 px viravam 233 e o seletor
  // vazava pela direita. O translate individual é aplicado por fora da escala.
  thumb.style.transform = "none";
  thumb.style.translate = `${x}px ${y}px`;
}
function passoDoPolegar(agora) {
  const p = polegar;
  const dt = Math.min(0.032, (agora - (p.ultimo || agora)) / 1000) || 0.016;
  p.ultimo = agora;
  const t = p.alvo;
  if (!t) { p.rodando = false; return; }
  // Quem vai na frente é mais dura (chega antes); a de trás, mais mole (estica o seletor).
  const indo = t.a + t.b > p.a + p.b ? 1 : -1;
  const kFrente = 520, kTras = 210, kCruz = 400;
  const amort = (k) => 2 * Math.sqrt(k) * 0.72;
  const mola = (x, v, alvo, k) => { const acc = -k * (x - alvo) - amort(k) * v; v += acc * dt; return [x + v * dt, v]; };
  [p.a, p.va] = mola(p.a, p.va, t.a, indo < 0 ? kFrente : kTras);
  [p.b, p.vb] = mola(p.b, p.vb, t.b, indo > 0 ? kFrente : kTras);
  [p.c, p.vc] = mola(p.c, p.vc, t.c, kCruz);
  [p.d, p.vd] = mola(p.d, p.vd, t.d, kCruz);
  const lim = limitesDaBarra();
  p.a = Math.max(lim.min, p.a); p.b = Math.min(lim.max, p.b);
  desenharPolegar();
  const parado = [p.a - t.a, p.b - t.b, p.c - t.c, p.d - t.d].every((d) => Math.abs(d) < 0.3)
    && [p.va, p.vb, p.vc, p.vd].every((v) => Math.abs(v) < 2);
  if (parado && !p.arrastando) {
    Object.assign(p, { a: t.a, b: t.b, c: t.c, d: t.d, va: 0, vb: 0, vc: 0, vd: 0, rodando: false });
    desenharPolegar();
    return;
  }
  requestAnimationFrame(passoDoPolegar);
}
function soltarMolas() {
  if (polegar.rodando) return;
  polegar.rodando = true;
  polegar.ultimo = 0;
  requestAnimationFrame(passoDoPolegar);
}
/** Leva o seletor até a aba ativa: de mola (`animar`) ou direto (abertura, redimensionar). */
function moverPolegar(animar = true) {
  const ativa = document.querySelector(".vtab.active");
  if (!ativa || !document.getElementById("vtab-thumb")) return;
  polegar.alvo = bordasDe(ativa);
  // O ajuste "Movimento" do app manda; "auto" segue o Windows (`reduzirMovimento`, telas.js).
  const mov = document.documentElement.dataset.movimento;
  const reduzir = mov === "nunca" || (mov !== "sempre" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (!animar || !polegar.pronto || reduzir) {
    Object.assign(polegar, polegar.alvo, { va: 0, vb: 0, vc: 0, vd: 0, pronto: true });
    desenharPolegar();
    return;
  }
  soltarMolas();
}
// A largura do rótulo muda quando a fonte termina de carregar, e a barra pode mudar de
// tamanho sem a janela mudar. Um `resize` de janela não cobre nenhum dos dois casos.
document.fonts?.ready.then(() => moverPolegar(false));
new ResizeObserver(() => { moverPolegar(polegar.rodando); medirFolgaDaBarra(); }).observe(document.getElementById("viewtabs"));

/**
 * 31/10: a folga das telas (--fb-*) sai do tamanho REAL da pílula, não de um número fixo. Com 74 px
 * fixos a pílula do topo (52 px + ~64 px de altura) cobria a metade de cima do switch IA/Celular e
 * o começo do Início, do Hoje e das Rotinas. Fechada: as regras do CSS (0) valem.
 */
function medirFolgaDaBarra() {
  const corpo = document.body.style;
  for (const v of ["--fb-t", "--fb-b", "--fb-l", "--fb-r"]) corpo.removeProperty(v);
  const barra = document.getElementById("viewtabs");
  const layout = document.getElementById("layout");
  if (!barra || !layout || document.body.classList.contains("barra-fechada")) return;
  const b = barra.getBoundingClientRect(), l = layout.getBoundingClientRect();
  if (!b.width || !b.height) return;
  const c = document.body.classList, folga = 10;
  if (c.contains("barra-topo")) corpo.setProperty("--fb-t", `${Math.max(0, Math.round(b.bottom - l.top + folga))}px`);
  else if (c.contains("barra-baixo")) corpo.setProperty("--fb-b", `${Math.max(0, Math.round(l.bottom - b.top + folga))}px`);
  else if (c.contains("barra-esquerda")) corpo.setProperty("--fb-l", `${Math.max(0, Math.round(b.right - l.left + folga))}px`);
  else if (c.contains("barra-direita")) corpo.setProperty("--fb-r", `${Math.max(0, Math.round(l.right - b.left + folga))}px`);
}
window.addEventListener("resize", medirFolgaDaBarra);

/**
 * A animação de troca é toda CSS (`@starting-style` + `allow-discrete`). Aqui só se muda
 * o atributo — e é justamente por não haver snapshot cobrindo a página que a barrinha
 * volta a ser vista deslizando.
 */
function switchView(view) {
  // Trocar de aba com a gaveta aberta devolve o que estava nela (o QR ao popover, etc.).
  // Fase 23: PC e Rotinas saíram da barra e viraram gavetas (central.js). Quem ainda pede a
  // aba (paleta antiga, atalho da Início) ganha a gaveta por cima da aba atual.
  if (view === "pc" || view === "rotinas") { setTimeout(view === "pc" ? abrirCentral : abrirRotinas, 0); return; }
  if (typeof voltarPara !== "undefined") voltarPara = null;
  if (typeof fecharGaveta === "function") fecharGaveta();
  layoutEl.setAttribute("data-view", view);
  vtabs.forEach(b => {
    const ativa = b.dataset.view === view;
    b.classList.toggle("active", ativa);
    b.setAttribute("aria-selected", ativa ? "true" : "false");
    // Tab só para na aba ativa; entre as abas, as setas (08/10).
    b.tabIndex = ativa ? 0 : -1;
    if (ativa) b.classList.remove("has-news");
  });
  moverPolegar();
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* modo privado, ignora */ }

  // Chat e Caixa são a mesma tela em modos diferentes: reaproveita o switchChatMode que já
  // existe em vez de duplicar a lógica dos dois timelines.
  // A Caixa deixou de ser aba: virou o lado direito do switch, dentro do Chat.

  if (view === "chat") { requestAnimationFrame(() => moverPolegar(false)); carregarBolhasChat(); }
  if (view === "hoje") carregarHoje();
  if (view === "inicio") atualizarInicio().then(ligarArrasto);
  // Os canvas nascem dentro de um painel oculto, e elemento em `display:none` mede zero.
  // Só ao entrar na aba dá para saber a largura real.
}

vtabs.forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));

// Acessibilidade das abas (fase 18): cada aba aponta para o seu painel (aria-controls ↔
// tabpanel), tem nome mesmo quando a janela estreita esconde o rótulo, e as setas ← → (e
// Home/End) andam entre elas, como manda o padrão de abas do WAI-ARIA.
const PAINEL_DA_ABA = { inicio: "view-inicio", chat: "center", hoje: "view-hoje", pc: "view-pc", rotinas: "view-rotinas", ajustes: "drawer-right" };
vtabs.forEach(b => {
  const nome = b.querySelector(".vtab-label")?.textContent?.trim() || b.dataset.view;
  const painel = document.getElementById(PAINEL_DA_ABA[b.dataset.view] ?? "");
  b.id = b.id || `aba-${b.dataset.view}`;
  b.setAttribute("aria-label", nome);
  b.title = b.title || nome;
  b.tabIndex = b.classList.contains("active") ? 0 : -1;
  if (painel) {
    b.setAttribute("aria-controls", painel.id);
    painel.setAttribute("role", "tabpanel");
    painel.setAttribute("aria-labelledby", b.id);
  }
});
document.getElementById("viewtabs")?.addEventListener("keydown", (e) => {
  const lista = [...vtabs];
  const i = lista.indexOf(document.activeElement);
  if (i < 0) return;
  let j = null;
  if (e.key === "ArrowRight") j = (i + 1) % lista.length;
  else if (e.key === "ArrowLeft") j = (i - 1 + lista.length) % lista.length;
  else if (e.key === "Home") j = 0;
  else if (e.key === "End") j = lista.length - 1;
  if (j === null) return;
  e.preventDefault();
  lista[j].focus();
  switchView(lista[j].dataset.view);
});

// Ctrl+1..4 percorre os destinos, como no navegador. Fica fora do input de comando para
// não roubar a digitação.
document.addEventListener("keydown", (e) => {
  if (!e.ctrlKey || e.altKey || e.shiftKey) return;
  const n = Number(e.key);
  if (!Number.isInteger(n) || n < 1 || n > vtabs.length) return;
  e.preventDefault();
  switchView(vtabs[n - 1].dataset.view);
});

// ─────────────────────────────────────────────────
// BARRA NO JEITO DO NUVIO (30–31/10)
// ─────────────────────────────────────────────────
//
// A barra flutua POR CIMA das telas (não empurra nada): as telas só ganham uma folga
// interna do lado dela, e o conteúdo passa por baixo com o desfoque. Lado (topo, baixo,
// esquerda, direita) e aberta/fechada vêm da config; o botão de abrir e fechar fica no
// canto superior esquerdo da janela. Segurar faz o seletor crescer e arrastar leva ele
// junto (de mola); rolar o conteúdo para baixo esconde os nomes, rolar para cima traz.

const LADOS = [["topo", "Topo"], ["baixo", "Embaixo"], ["esquerda", "Esquerda"], ["direita", "Direita"]];
let barraCfg = { lado: "topo", fechada: false };

function aplicarBarra(cfg) {
  const lado = LADOS.some(([l]) => l === cfg?.barraLado) ? cfg.barraLado : "topo";
  // `barraRecolhida` (nome antigo da config) agora quer dizer "barra fechada".
  barraCfg = { lado, fechada: cfg?.barraRecolhida === true };
  document.body.classList.add("barra-nuvio");
  for (const [l] of LADOS) document.body.classList.toggle(`barra-${l}`, l === lado);
  document.body.classList.toggle("barra-fechada", barraCfg.fechada);
  const botao = document.getElementById("nav-recolher");
  if (botao) {
    const texto = barraCfg.fechada ? "Abrir a barra de abas" : "Fechar a barra de abas";
    botao.title = texto;
    botao.setAttribute("aria-label", texto);
    botao.setAttribute("aria-expanded", barraCfg.fechada ? "false" : "true");
  }
  desenharOpcoesDaBarra();
  requestAnimationFrame(() => { moverPolegar(false); medirFolgaDaBarra(); });
}

function gravarBarra(patch) {
  aplicarBarra({ barraLado: barraCfg.lado, barraRecolhida: barraCfg.fechada, ...patch });
  window.nx.setConfig(patch).catch(() => {});
}

function desenharOpcoesDaBarra() {
  const caixa = document.getElementById("barra-opcoes");
  if (!caixa) return;
  caixa.innerHTML = LADOS.map(([l, nome]) =>
    `<button type="button" class="barra-opcao${l === barraCfg.lado ? " ativa" : ""}" data-lado="${l}">${nome}</button>`).join("") +
    `<button type="button" class="barra-opcao${barraCfg.fechada ? " ativa" : ""}" data-fechar="1">Fechada</button>`;
}
document.getElementById("barra-opcoes")?.addEventListener("click", (e) => {
  const b = e.target.closest(".barra-opcao");
  if (!b) return;
  if (b.dataset.lado) gravarBarra({ barraLado: b.dataset.lado });
  else gravarBarra({ barraRecolhida: !barraCfg.fechada });
});
document.getElementById("nav-recolher")?.addEventListener("click", () => gravarBarra({ barraRecolhida: !barraCfg.fechada }));

// Segurar e arrastar o seletor: as bordas seguem o mouse de mola, e ao soltar ele vai para
// a aba mais perto.
(() => {
  const barra = document.getElementById("viewtabs");
  if (!barra) return;
  let arrasto = null;
  barra.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !e.target.closest(".vtab") || !polegar.alvo) return;
    barra.classList.add("segurando");
    // Segurado, o seletor vira lente (js/liquido.js): a varredura pega a classe nova.
    lqLogo();
    arrasto = { p0: barraDeitada() ? e.clientX : e.clientY, alvo0: { ...polegar.alvo }, mexeu: false };
  });
  window.addEventListener("pointermove", (e) => {
    if (!arrasto) return;
    const d = (barraDeitada() ? e.clientX : e.clientY) - arrasto.p0;
    if (!arrasto.mexeu && Math.abs(d) < 6) return;
    arrasto.mexeu = true;
    polegar.arrastando = true;
    const lim = limitesDaBarra();
    const largura = arrasto.alvo0.b - arrasto.alvo0.a;
    const a = Math.min(lim.max - largura, Math.max(lim.min, arrasto.alvo0.a + d));
    polegar.alvo = { ...arrasto.alvo0, a, b: a + largura };
    soltarMolas();
  });
  window.addEventListener("pointerup", () => {
    barra.classList.remove("segurando");
    lqLogo();
    if (!arrasto) return;
    const { mexeu } = arrasto;
    arrasto = null;
    polegar.arrastando = false;
    if (!mexeu) return;
    const meio = (polegar.alvo.a + polegar.alvo.b) / 2;
    let melhor = null, dist = Infinity;
    for (const b of vtabs) {
      const o = bordasDe(b);
      const dd = Math.abs((o.a + o.b) / 2 - meio);
      if (dd < dist) { dist = dd; melhor = b; }
    }
    // O clique que vem junto com o pointerup não deve trocar de novo.
    barra.addEventListener("click", (ev) => ev.stopPropagation(), { capture: true, once: true });
    if (melhor && !melhor.classList.contains("active")) switchView(melhor.dataset.view);
    else moverPolegar();
  });
})();

// Rolar para baixo encolhe a barra até só a aba ativa (Glass Nav); rolar para cima abre de novo.
(() => {
  const ultimo = new WeakMap();
  let acumulado = 0;
  document.getElementById("layout")?.addEventListener("scroll", (e) => {
    const el = e.target;
    if (!(el instanceof Element) || barraCfg.fechada) return;
    const y = el.scrollTop;
    const delta = y - (ultimo.get(el) ?? y);
    ultimo.set(el, y);
    if ((delta > 0 && acumulado < 0) || (delta < 0 && acumulado > 0)) acumulado = 0;
    acumulado += delta;
    const escondida = document.body.classList.contains("barra-encolhida");
    if (y <= 4 && escondida) { document.body.classList.remove("barra-encolhida"); acumulado = 0; }
    else if (acumulado > 60 && !escondida) { document.body.classList.add("barra-encolhida"); acumulado = 0; }
    else if (acumulado < -60 && escondida) { document.body.classList.remove("barra-encolhida"); acumulado = 0; }
  }, { capture: true, passive: true });
})();

// Pílula de hover (31/10, ideia do Glass Nav): um segundo seletor, bem fraco, que segue o
// mouse entre as abas. Fica sob o seletor da aba ativa e some ao sair da barra.
(() => {
  const barra = document.getElementById("viewtabs");
  if (!barra) return;
  const pilula = document.createElement("span");
  pilula.id = "vtab-hover";
  barra.insertBefore(pilula, barra.firstChild);
  let primeira = true;
  barra.addEventListener("pointerover", (e) => {
    const aba = e.target.closest?.(".vtab");
    if (!aba || aba.classList.contains("active")) { pilula.classList.remove("visivel"); return; }
    // Na primeira entrada aparece já no lugar; depois desliza de uma aba para outra.
    if (primeira) pilula.style.transition = "none";
    pilula.style.width = `${aba.offsetWidth}px`;
    pilula.style.height = `${aba.offsetHeight}px`;
    pilula.style.transform = `translate(${aba.offsetLeft}px, ${aba.offsetTop}px)`;
    if (primeira) { void pilula.offsetWidth; pilula.style.transition = ""; primeira = false; }
    pilula.classList.add("visivel");
  });
  barra.addEventListener("pointerleave", () => { pilula.classList.remove("visivel"); primeira = true; });
})();

// Spotlight nos cards (31/10): a posição do mouse dentro do card vira --mx/--my, e o CSS
// desenha uma luz fraca ali. Um ouvinte só, no #layout.
document.getElementById("layout")?.addEventListener("pointermove", (e) => {
  const card = e.target.closest?.(".home-card, .hoje-painel");
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty("--mx", `${e.clientX - r.left}px`);
  card.style.setProperty("--my", `${e.clientY - r.top}px`);
}, { passive: true });
