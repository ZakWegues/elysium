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
 * 26/11 — o seletor igual ao do celular (BarraVidro, modules/vidro/barra no elysium-m): uma mola
 * crítica leva a posição (k 1000, ζ 1, massa 1) e a gota estica pela velocidade (no eixo da barra
 * k 250 ζ 0,6; no outro k 250 ζ 0,7). As abas têm todas o mesmo tamanho, então o seletor tem
 * tamanho fixo no CSS e o laço só escreve `transform` (translate + scale): nada de layout por
 * quadro. Apertar a barra cresce a barra (1,025) e o seletor (1,2), também de mola. O laço de
 * `requestAnimationFrame` para sozinho quando tudo assenta.
 *
 * Antes (31/10–23/11) cada borda era uma mola com quique, e o seletor escrevia width/height e o
 * furo do vidro a cada quadro: era isso que fazia a barra do PC parecer "travada".
 */
const MOLAS = {
  posicao: { k: 1000, c: 2 * Math.sqrt(1000) },
  esticaFrente: { k: 250, c: 2 * Math.sqrt(250) * 0.6 },
  esticaLado: { k: 250, c: 2 * Math.sqrt(250) * 0.7 },
  aperto: { k: 1000, c: 2 * Math.sqrt(1000) },
  // A barra apertada: a mesma mola do celular (barSpring k 240, amortecimento 18, massa 0,9).
  barra: { k: 240 / 0.9, c: 18 / 0.9 },
};
const APERTO_SELETOR = 1.2, APERTO_BARRA = 1.025;
const polegar = {
  // x = início do seletor no eixo da barra; cruz = no outro eixo (não anda de mola).
  // f e l = escala no eixo da barra e no outro (o esticão); s = aperto do seletor; b = da barra.
  x: 0, vx: 0, cruz: 0, f: 1, vf: 0, l: 1, vl: 0, s: 1, vs: 0, b: 1, vb: 0,
  alvo: null, apertado: false, pronto: false, rodando: false, arrastando: false, ultimo: 0,
};
function barraDeitada() {
  return !document.body.classList.contains("barra-esquerda") && !document.body.classList.contains("barra-direita");
}
/**
 * 09/11: as medidas da barra ficam guardadas. Lidas na hora (offsetLeft, clientWidth) logo depois
 * de trocar de aba, elas obrigavam o layout da página inteira no meio da troca (25–33 ms na
 * Início). As abas não mudam de lugar ao trocar de tela: as medidas só caem quando a barra ou uma
 * aba muda de tamanho, ou de lado.
 */
let medidasDaBarra = null;
function esquecerMedidasDaBarra() { medidasDaBarra = null; }
function medidas() {
  if (medidasDaBarra) return medidasDaBarra;
  const barra = document.getElementById("viewtabs");
  const deitada = barraDeitada();
  const abas = new Map();
  for (const el of barra.querySelectorAll(".vtab")) {
    // x/cruz: onde a aba começa nos dois eixos; w/h: o tamanho dela (o mesmo do seletor).
    abas.set(el, {
      x: deitada ? el.offsetLeft : el.offsetTop, cruz: deitada ? el.offsetTop : el.offsetLeft,
      w: el.offsetWidth, h: el.offsetHeight, visivel: el.offsetWidth > 0 && el.offsetHeight > 0,
    });
  }
  medidasDaBarra = { deitada, largura: barra.clientWidth, altura: barra.clientHeight, abas };
  return medidasDaBarra;
}
function alvoDe(el) {
  const m = medidas();
  if (m.deitada !== barraDeitada()) { esquecerMedidasDaBarra(); return alvoDe(el); }
  const o = m.abas.get(el);
  if (o) return { x: o.x, cruz: o.cruz };
  esquecerMedidasDaBarra();
  const n = medidas().abas.get(el);
  return n ? { x: n.x, cruz: n.cruz } : { x: 0, cruz: 0 };
}
/** O "Movimento" do app manda; "auto" segue o Windows (`reduzirMovimento`, telas.js). */
function barraSemMovimento() {
  const mov = document.documentElement.dataset.movimento;
  return mov === "nunca" || (mov !== "sempre" && matchMedia("(prefers-reduced-motion: reduce)").matches);
}
function desenharPolegar() {
  const thumb = document.getElementById("vtab-thumb");
  if (!thumb) return;
  const p = polegar, deitada = medidas().deitada;
  const [tx, ty] = deitada ? [p.x, p.cruz] : [p.cruz, p.x];
  const [sx, sy] = deitada ? [p.f * p.s, p.l * p.s] : [p.l * p.s, p.f * p.s];
  thumb.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  // A barra apertada cresce do centro: o translate de centralizar (design.css) vem junto.
  const barra = document.getElementById("viewtabs");
  const escala = Math.abs(p.b - 1) < 0.0005 ? "" : `${deitada ? "translateX(-50%)" : "translateY(-50%)"} scale(${p.b.toFixed(4)})`;
  if (barra.style.transform !== escala) barra.style.transform = escala;
}
/** Um passo de mola (Euler semi-implícito): devolve [posição, velocidade]. */
function passoDeMola(x, v, alvo, { k, c }, h) {
  v += (-k * (x - alvo) - c * v) * h;
  return [x + v * h, v];
}
function passoDoPolegar(agora) {
  const p = polegar;
  const dt = Math.min(0.032, (agora - (p.ultimo || agora)) / 1000) || 0.016;
  p.ultimo = agora;
  const t = p.alvo;
  if (!t) { p.rodando = false; return; }
  const aS = p.apertado ? APERTO_SELETOR : 1, aB = p.apertado ? APERTO_BARRA : 1;
  // Molas de k 1000 num quadro de 16 ms passam do ponto: o quadro é dividido em passos de 4 ms.
  const n = Math.ceil(dt / 0.004), h = dt / n;
  for (let i = 0; i < n; i++) {
    [p.x, p.vx] = passoDeMola(p.x, p.vx, t.x, MOLAS.posicao, h);
    // O esticão sai da velocidade: correndo, a gota alonga no caminho e afina do outro lado.
    const rapido = Math.abs(p.vx);
    [p.f, p.vf] = passoDeMola(p.f, p.vf, 1 + Math.min(0.35, rapido / 8000), MOLAS.esticaFrente, h);
    [p.l, p.vl] = passoDeMola(p.l, p.vl, 1 - Math.min(0.15, rapido / 20000), MOLAS.esticaLado, h);
    [p.s, p.vs] = passoDeMola(p.s, p.vs, aS, MOLAS.aperto, h);
    [p.b, p.vb] = passoDeMola(p.b, p.vb, aB, MOLAS.barra, h);
  }
  const assentou = Math.abs(p.x - t.x) < 0.3 && Math.abs(p.vx) < 2
    && [p.f - 1, p.l - 1, p.s - aS, p.b - aB].every((d) => Math.abs(d) < 0.002)
    && [p.vf, p.vl, p.vs, p.vb].every((v) => Math.abs(v) < 0.02);
  if (assentou && !p.arrastando) {
    Object.assign(p, { x: t.x, vx: 0, f: 1, vf: 0, l: 1, vl: 0, s: aS, vs: 0, b: aB, vb: 0, rodando: false });
    desenharPolegar();
    // Parado e segurado: agora sim o vidro da barra abre o furo debaixo da lente.
    furarVidroDaBarra();
    return;
  }
  // Andando, o furo sai (uma escrita só): reescrever o clip-path a cada quadro refazia o vidro.
  if (vidroFurado) tirarFuroDoVidro();
  desenharPolegar();
  requestAnimationFrame(passoDoPolegar);
}
/**
 * 23/11: segurado, o seletor é uma gota de vidro (js/liquido.js) que entorta a página atrás dela.
 * 26/11: só segurado (correndo de uma aba para outra ele é só a tinta), e o tamanho dele não muda
 * mais: o filtro é feito uma vez, sem mapa novo por quadro.
 */
let lenteLigada = false, vidroFurado = false;
function lenteDoSeletor(ligar) {
  if (ligar && (!lqFator() || document.body.classList.contains("barra-encolhida"))) return;
  if (ligar === lenteLigada) return;
  lenteLigada = ligar;
  lqSo(document.getElementById("vtab-thumb"), ligar);
  if (!ligar) tirarFuroDoVidro();
}
function tirarFuroDoVidro() {
  document.getElementById("vtabs-vidro").style.clipPath = "";
  vidroFurado = false;
}
/** Debaixo da gota o vidro da barra abre um furo: a lente entorta a página nítida, e não o
 *  desfoque da barra. Só com o seletor parado (fim da mola) — nunca a cada quadro. */
function furarVidroDaBarra() {
  if (!lenteLigada) { if (vidroFurado) tirarFuroDoVidro(); return; }
  const vidro = document.getElementById("vtabs-vidro");
  const p = polegar, m = medidas();
  const aba = m.abas.get(document.querySelector(".vtab.active")) ?? [...m.abas.values()][0];
  if (!aba) return;
  // O seletor apertado cresce do centro: o furo acompanha o tamanho dele.
  const w = aba.w * p.s, h = aba.h * p.s;
  const [x0, y0] = m.deitada ? [p.x, p.cruz] : [p.cruz, p.x];
  const x = x0 + aba.w / 2 - w / 2, y = y0 + aba.h / 2 - h / 2, r = Math.max(0, Math.min(w, h) / 2);
  const nf = (v) => v.toFixed(1), arco = (dx, dy) => `a${nf(r)} ${nf(r)} 0 0 1 ${nf(dx)} ${nf(dy)}`;
  vidro.style.clipPath = `path(evenodd, "M0 0H${m.largura}V${m.altura}H0Z M${nf(x + r)} ${nf(y)}h${nf(w - 2 * r)}${arco(r, r)}v${nf(h - 2 * r)}${arco(-r, r)}h${nf(2 * r - w)}${arco(-r, -r)}v${nf(2 * r - h)}${arco(r, -r)}Z")`;
  vidroFurado = true;
}
function soltarMolas() {
  if (barraSemMovimento()) {
    // Sem animação: tudo no lugar de uma vez (sem aperto nem esticão).
    const t = polegar.alvo;
    if (t) Object.assign(polegar, { x: t.x, vx: 0, f: 1, vf: 0, l: 1, vl: 0, s: 1, vs: 0, b: 1, vb: 0 });
    desenharPolegar();
    furarVidroDaBarra();
    return;
  }
  if (polegar.rodando) return;
  polegar.rodando = true;
  polegar.ultimo = 0;
  requestAnimationFrame(passoDoPolegar);
}
/** Leva o seletor até a aba ativa: de mola (`animar`) ou direto (abertura, redimensionar). */
function moverPolegar(animar = true) {
  const ativa = document.querySelector(".vtab.active");
  if (!ativa || !document.getElementById("vtab-thumb")) return;
  polegar.alvo = alvoDe(ativa);
  // O eixo cruzado não anda de mola: é o mesmo em todas as abas.
  polegar.cruz = polegar.alvo.cruz;
  if (!animar || !polegar.pronto) {
    Object.assign(polegar, { x: polegar.alvo.x, vx: 0, pronto: true });
    if (!polegar.rodando) { desenharPolegar(); furarVidroDaBarra(); }
    return;
  }
  soltarMolas();
}
// A largura do rótulo muda quando a fonte termina de carregar, e a barra pode mudar de
// tamanho sem a janela mudar. Um `resize` de janela não cobre nenhum dos dois casos.
document.fonts?.ready.then(() => { esquecerMedidasDaBarra(); moverPolegar(false); });
{
  // 26/11: direto, sem mola: encolher/abrir a barra não anima mais o tamanho das abas (era layout
  // por quadro), então a aba ativa muda de lugar de uma vez e o seletor vai junto.
  // 10/11: a folga só é medida quando a barra para de mudar de tamanho. Encolhendo ao rolar, a
  // altura dela anda a cada quadro, e cada valor novo de --fb-* refazia o layout da página inteira.
  let folgaPendente = 0;
  const ro = new ResizeObserver(() => {
    esquecerMedidasDaBarra();
    moverPolegar(false);
    clearTimeout(folgaPendente);
    folgaPendente = setTimeout(medirFolgaDaBarra, 480);
  });
  ro.observe(document.getElementById("viewtabs"));
  // Uma aba pode mudar de largura sem a barra mudar (rótulo que some, contador novo).
  document.querySelectorAll("#viewtabs .vtab").forEach((el) => ro.observe(el));
}

/**
 * 31/10: a folga das telas (--fb-*) sai do tamanho REAL da pílula, não de um número fixo. Com 74 px
 * fixos a pílula do topo (52 px + ~64 px de altura) cobria a metade de cima do switch IA/Celular e
 * o começo do Início, do Hoje e das Rotinas. Fechada: as regras do CSS (0) valem.
 */
function medirFolgaDaBarra() {
  // 10/11: calcula as quatro e só escreve a que mudou. Apagar e regravar as variáveis no body a
  // cada chamada recalculava o estilo da página inteira — e o ResizeObserver chama isto a cada
  // quadro enquanto a barra encolhe ou abre.
  const corpo = document.body.style;
  const novo = { "--fb-t": "", "--fb-b": "", "--fb-l": "", "--fb-r": "" };
  const barra = document.getElementById("viewtabs");
  const layout = document.getElementById("layout");
  // Encolhida (rolando), a folga fica a da barra aberta: o conteúdo não pula quando ela encolhe.
  if (document.body.classList.contains("barra-encolhida")) return;
  if (barra && layout && !document.body.classList.contains("barra-fechada")) {
    const b = barra.getBoundingClientRect(), l = layout.getBoundingClientRect();
    if (b.width && b.height) {
      const c = document.body.classList, folga = 10;
      if (c.contains("barra-topo")) novo["--fb-t"] = `${Math.max(0, Math.round(b.bottom - l.top + folga))}px`;
      else if (c.contains("barra-baixo")) novo["--fb-b"] = `${Math.max(0, Math.round(l.bottom - b.top + folga))}px`;
      else if (c.contains("barra-esquerda")) novo["--fb-l"] = `${Math.max(0, Math.round(b.right - l.left + folga))}px`;
      else if (c.contains("barra-direita")) novo["--fb-r"] = `${Math.max(0, Math.round(l.right - b.left + folga))}px`;
    }
  }
  for (const [v, val] of Object.entries(novo)) {
    if (corpo.getPropertyValue(v) === val) continue;
    if (val) corpo.setProperty(v, val); else corpo.removeProperty(v);
  }
}
window.addEventListener("resize", medirFolgaDaBarra);

/**
 * A animação de troca é toda CSS (`@starting-style` + `allow-discrete`). Aqui só se muda
 * o atributo — e é justamente por não haver snapshot cobrindo a página que a barrinha
 * volta a ser vista deslizando.
 */
let inicioAtualizadoEm = 0;
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

  // 26/11: o Chat não remede mais a barra no quadro seguinte: as abas têm tamanho fixo, e a
  // leitura forçava o layout da tela do chat inteira bem no meio da mola.
  if (view === "chat") carregarBolhasChat();
  if (view === "hoje") carregarHoje();
  // Voltar à Início buscava TODOS os dados de novo e redesenhava a grade inteira meio segundo
  // depois da troca (um tranco no meio da animação). Dados de menos de 30 s ficam.
  if (view === "inicio" && Date.now() - inicioAtualizadoEm > 30_000) {
    inicioAtualizadoEm = Date.now();
    atualizarInicio().then(ligarArrasto);
  }
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
  requestAnimationFrame(() => { esquecerMedidasDaBarra(); moverPolegar(false); medirFolgaDaBarra(); });
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

// Segurar e arrastar o seletor (como no celular): apertar já leva o seletor para a aba apertada e
// cresce barra e seletor; arrastando, ele segue o mouse de mola; ao soltar vai para a aba mais perto.
(() => {
  const barra = document.getElementById("viewtabs");
  if (!barra) return;
  let arrasto = null;
  barra.addEventListener("pointerdown", (e) => {
    const aba = e.target.closest(".vtab");
    if (e.button !== 0 || !aba || !polegar.alvo || document.body.classList.contains("barra-encolhida")) return;
    barra.classList.add("segurando");
    // Segurado, o seletor vira lente (js/liquido.js).
    lenteDoSeletor(true);
    polegar.apertado = true;
    polegar.alvo = alvoDe(aba);
    arrasto = { p0: barraDeitada() ? e.clientX : e.clientY, x0: polegar.alvo.x, aba, mexeu: false };
    soltarMolas();
  });
  window.addEventListener("pointermove", (e) => {
    if (!arrasto) return;
    const d = (barraDeitada() ? e.clientX : e.clientY) - arrasto.p0;
    if (!arrasto.mexeu && Math.abs(d) < 6) return;
    arrasto.mexeu = true;
    polegar.arrastando = true;
    // Preso entre a primeira e a última aba à vista: o seletor nunca passa da barra.
    const xs = [...medidas().abas.values()].filter((o) => o.visivel).map((o) => o.x);
    const x = Math.min(Math.max(...xs), Math.max(Math.min(...xs), arrasto.x0 + d));
    polegar.alvo = { ...polegar.alvo, x };
    soltarMolas();
  });
  const soltar = (e) => {
    barra.classList.remove("segurando");
    lenteDoSeletor(false);
    polegar.apertado = false;
    if (!arrasto) return;
    const { mexeu, aba } = arrasto;
    arrasto = null;
    polegar.arrastando = false;
    if (!mexeu) {
      // Soltou na própria aba: o clique que vem junto troca a tela. Fora dela, volta para a ativa.
      if (e.type === "pointerup" && e.target instanceof Node && aba.contains(e.target)) soltarMolas(); else moverPolegar();
      return;
    }
    let melhor = null, dist = Infinity;
    for (const [b, o] of medidas().abas) {
      if (!o.visivel) continue;
      const dd = Math.abs(o.x - polegar.alvo.x);
      if (dd < dist) { dist = dd; melhor = b; }
    }
    // O clique que vem junto com o pointerup não deve trocar de novo (e não fica armado depois).
    const engolir = (ev) => ev.stopPropagation();
    barra.addEventListener("click", engolir, { capture: true, once: true });
    setTimeout(() => barra.removeEventListener("click", engolir, { capture: true }), 0);
    if (melhor && !melhor.classList.contains("active")) switchView(melhor.dataset.view);
    else moverPolegar();
  };
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);
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

// 10/11: encolhida, a barra NÃO abre mais com o mouse em cima (abria e fechava sozinha ao passar
// o mouse); clicar nela abre, como no celular, e rolar para cima também.
document.getElementById("viewtabs")?.addEventListener("click", (e) => {
  if (!document.body.classList.contains("barra-encolhida")) return;
  document.body.classList.remove("barra-encolhida");
  e.stopPropagation();
  e.preventDefault();
}, true);

// Pílula de hover (31/10, ideia do Glass Nav): um segundo seletor, bem fraco, que segue o
// mouse entre as abas. Fica sob o seletor da aba ativa e some ao sair da barra. 26/11: o tamanho
// é o da aba (CSS); aqui só a posição, das medidas guardadas.
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
    const { x, cruz } = alvoDe(aba);
    const [tx, ty] = medidas().deitada ? [x, cruz] : [cruz, x];
    // Na primeira entrada aparece já no lugar; depois desliza de uma aba para outra.
    pilula.classList.toggle("no-lugar", primeira);
    pilula.style.transform = `translate(${tx}px, ${ty}px)`;
    if (primeira) { requestAnimationFrame(() => pilula.classList.remove("no-lugar")); primeira = false; }
    pilula.classList.add("visivel");
  });
  barra.addEventListener("pointerleave", () => { pilula.classList.remove("visivel"); primeira = true; });
})();

// Spotlight nos cards (31/10): a posição do mouse dentro do card vira --mx/--my, e o CSS
// desenha uma luz fraca ali. Um ouvinte só, no #layout.
// 10/11: no máximo uma escrita por quadro (o mouse manda vários eventos por quadro).
{
  let ultimo = null, pendente = 0;
  document.getElementById("layout")?.addEventListener("pointermove", (e) => {
    const card = e.target.closest?.(".home-card, .hoje-painel");
    if (!card) return;
    ultimo = { card, x: e.clientX, y: e.clientY };
    if (pendente) return;
    pendente = requestAnimationFrame(() => {
      pendente = 0;
      const { card: c, x, y } = ultimo;
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", `${Math.round(x - r.left)}px`);
      c.style.setProperty("--my", `${Math.round(y - r.top)}px`);
    });
  }, { passive: true });
}
