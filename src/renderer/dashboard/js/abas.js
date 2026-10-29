// dashboard/js/abas.js — switchView, polegar, Ctrl+1..5.
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
 * 30/10 — o seletor "gelatina" da barra do Nuvio. Lê a geometria real da aba (as abas não
 * têm o mesmo tamanho, e a barra pode estar deitada ou em pé). Ao trocar de aba, o seletor
 * primeiro ESTICA cobrindo a de origem e a de destino, depois encolhe sobre a nova com um
 * pouco de passagem — a mola do Nuvio, feita com a Web Animations API.
 */
let caixaDoPolegar = null;
function caixaDe(el) {
  return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
}
function quadroDo(c) {
  return { left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px` };
}
function moverPolegar(animar = true) {
  const ativa = document.querySelector(".vtab.active");
  const thumb = document.getElementById("vtab-thumb");
  if (!ativa || !thumb) return;
  const alvo = caixaDe(ativa);
  const antes = caixaDoPolegar;
  caixaDoPolegar = alvo;
  Object.assign(thumb.style, quadroDo(alvo));
  const mesma = antes && antes.x === alvo.x && antes.y === alvo.y && antes.w === alvo.w && antes.h === alvo.h;
  if (!animar || !antes || mesma || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const x0 = Math.min(antes.x, alvo.x), y0 = Math.min(antes.y, alvo.y);
  const esticada = {
    x: x0, y: y0,
    w: Math.max(antes.x + antes.w, alvo.x + alvo.w) - x0,
    h: Math.max(antes.y + antes.h, alvo.y + alvo.h) - y0,
  };
  thumb.animate(
    [quadroDo(antes), { ...quadroDo(esticada), offset: 0.42 }, quadroDo(alvo)],
    { duration: 460, easing: "cubic-bezier(0.34, 1.32, 0.64, 1)" },
  );
}
// A largura do rótulo muda quando a fonte termina de carregar, e a barra pode mudar de
// tamanho sem a janela mudar (o rótulo some abaixo de 880px). Um `resize` de janela não
// cobre nenhum dos dois casos.
document.fonts?.ready.then(() => moverPolegar(false));
new ResizeObserver(() => moverPolegar(false)).observe(document.getElementById("viewtabs"));

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

// Ctrl+1..6 percorre os destinos, como no navegador. Fica fora do input de comando para
// não roubar a digitação.
document.addEventListener("keydown", (e) => {
  if (!e.ctrlKey || e.altKey || e.shiftKey) return;
  const n = Number(e.key);
  if (!Number.isInteger(n) || n < 1 || n > vtabs.length) return;
  e.preventDefault();
  switchView(vtabs[n - 1].dataset.view);
});

// ─────────────────────────────────────────────────
// BARRA NO JEITO DO NUVIO (30/10)
// ─────────────────────────────────────────────────
//
// Lado (topo, baixo, esquerda, direita) e recolhida (só ícones) vêm da config e são
// trocados em Ajustes → Aparência ou pelo botão do fim da barra. Segurar o mouse na barra
// faz o seletor crescer; arrastar leva ele junto e solta na aba mais perto. Rolar o
// conteúdo para baixo esconde os nomes (60 px), rolar para cima traz de volta.

const LADOS = [["topo", "Topo"], ["baixo", "Embaixo"], ["esquerda", "Esquerda"], ["direita", "Direita"]];
let barraCfg = { lado: "topo", recolhida: false };

function aplicarBarra(cfg) {
  const lado = LADOS.some(([l]) => l === cfg?.barraLado) ? cfg.barraLado : "topo";
  barraCfg = { lado, recolhida: cfg?.barraRecolhida === true };
  document.body.classList.add("barra-nuvio");
  for (const [l] of LADOS) document.body.classList.toggle(`barra-${l}`, l === lado);
  document.body.classList.toggle("barra-icones", barraCfg.recolhida);
  const botao = document.getElementById("nav-recolher");
  if (botao) {
    const texto = barraCfg.recolhida ? "Mostrar os nomes" : "Recolher a barra";
    botao.title = texto;
    botao.setAttribute("aria-label", texto);
  }
  desenharOpcoesDaBarra();
  requestAnimationFrame(() => moverPolegar(false));
}

function gravarBarra(patch) {
  const cfg = { barraLado: barraCfg.lado, barraRecolhida: barraCfg.recolhida, ...patch };
  aplicarBarra(cfg);
  window.nx.setConfig(patch).catch(() => {});
}

function desenharOpcoesDaBarra() {
  const caixa = document.getElementById("barra-opcoes");
  if (!caixa) return;
  caixa.innerHTML = LADOS.map(([l, nome]) =>
    `<button type="button" class="barra-opcao${l === barraCfg.lado ? " ativa" : ""}" data-lado="${l}">${nome}</button>`).join("") +
    `<button type="button" class="barra-opcao${barraCfg.recolhida ? " ativa" : ""}" data-recolher="1">Só ícones</button>`;
}
document.getElementById("barra-opcoes")?.addEventListener("click", (e) => {
  const b = e.target.closest(".barra-opcao");
  if (!b) return;
  if (b.dataset.lado) gravarBarra({ barraLado: b.dataset.lado });
  else gravarBarra({ barraRecolhida: !barraCfg.recolhida });
});
document.getElementById("nav-recolher")?.addEventListener("click", () => gravarBarra({ barraRecolhida: !barraCfg.recolhida }));

// Segurar e arrastar o seletor.
(() => {
  const barra = document.getElementById("viewtabs");
  const thumb = document.getElementById("vtab-thumb");
  if (!barra || !thumb) return;
  let arrasto = null;
  barra.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !e.target.closest(".vtab")) return;
    barra.classList.add("segurando");
    arrasto = { x0: e.clientX, y0: e.clientY, caixa: caixaDoPolegar, mexeu: false };
  });
  window.addEventListener("pointermove", (e) => {
    if (!arrasto || !arrasto.caixa) return;
    const deitada = barraCfg.lado === "topo" || barraCfg.lado === "baixo";
    const d = deitada ? e.clientX - arrasto.x0 : e.clientY - arrasto.y0;
    if (!arrasto.mexeu && Math.abs(d) < 6) return;
    arrasto.mexeu = true;
    const c = arrasto.caixa;
    thumb.style.left = `${deitada ? c.x + d : c.x}px`;
    thumb.style.top = `${deitada ? c.y : c.y + d}px`;
  });
  window.addEventListener("pointerup", (e) => {
    barra.classList.remove("segurando");
    if (!arrasto) return;
    const { mexeu } = arrasto;
    arrasto = null;
    if (!mexeu) return;
    // Solta na aba cujo centro está mais perto do centro do seletor.
    const t = thumb.getBoundingClientRect();
    const cx = t.left + t.width / 2, cy = t.top + t.height / 2;
    let melhor = null, dist = Infinity;
    for (const b of vtabs) {
      const r = b.getBoundingClientRect();
      const dd = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      if (dd < dist) { dist = dd; melhor = b; }
    }
    // O clique que vem junto com o pointerup não deve trocar de novo.
    barra.addEventListener("click", (ev) => ev.stopPropagation(), { capture: true, once: true });
    if (melhor && !melhor.classList.contains("active")) switchView(melhor.dataset.view);
    else moverPolegar();
    void e;
  });
})();

// Rolar para baixo esconde os nomes; rolar para cima traz de volta (só se não estiver recolhida).
(() => {
  let ultimo = new WeakMap(), acumulado = 0;
  document.getElementById("layout")?.addEventListener("scroll", (e) => {
    const el = e.target;
    if (!(el instanceof Element) || barraCfg.recolhida) return;
    const y = el.scrollTop;
    const delta = y - (ultimo.get(el) ?? y);
    ultimo.set(el, y);
    if ((delta > 0 && acumulado < 0) || (delta < 0 && acumulado > 0)) acumulado = 0;
    acumulado += delta;
    const escondida = document.body.classList.contains("barra-icones");
    if (y <= 4 && escondida) { document.body.classList.remove("barra-icones"); acumulado = 0; }
    else if (acumulado > 60 && !escondida) { document.body.classList.add("barra-icones"); acumulado = 0; }
    else if (acumulado < -60 && escondida) { document.body.classList.remove("barra-icones"); acumulado = 0; }
    else return;
    requestAnimationFrame(() => moverPolegar(false));
  }, { capture: true, passive: true });
})();
