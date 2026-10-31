// dashboard/js/telas.js — telas inteligentes no chat (Fase 3, 22/10; prévia + tela cheia, 23/10).
//
// A tela é o renderer isolado (ui/render.html) num <iframe sandbox="allow-scripts">: origem opaca,
// sem acesso a este app, aos cookies ou ao IPC. Conversa só por postMessage, e TUDO que vem de lá é
// validado aqui (o espelho do protocolo.ts do ui-render): altura, ações (perguntar / abrir link /
// copiar), estado, pedidos de foto e rota (que o main busca) e a roda do mouse.
//
// No chat ela é uma PRÉVIA: altura limitada (o resto esmaece e "Abrir tela inteira" abre a camada
// de tela cheia, que rola sozinha). Enquanto é gerada, um esqueleto vivo com o tempo e "Cancelar";
// se falhar, "Tentar de novo".

const TELA_SRC = "ui/render.html";
/** Altura máxima da prévia no chat; o resto vai para a tela cheia. */
// 26/10: as telas ficaram mais ricas (abertura, números, gráfico): um pouco mais de prévia.
const PREVIA_MAX = 480;
/** iframe.contentWindow → controle da tela (o da prévia ou o da tela cheia). */
const telasAbertas = new Map();

// ── validação do que a tela manda ───────────────────────────────────────────────────────
const ehTexto = (v, max) => typeof v === "string" && v.length <= max;
function mensagemDaTela(m) {
  if (!m || typeof m !== "object" || typeof m.tipo !== "string") return null;
  switch (m.tipo) {
    case "pronta": return { tipo: "pronta" };
    case "altura": return Number.isInteger(m.px) && m.px >= 0 && m.px <= 20000 ? { tipo: "altura", px: m.px } : null;
    case "acao": return ["perguntar", "abrirLink", "copiar", "haptica"].includes(m.acao) && ehTexto(m.valor, 4000) ? { tipo: "acao", acao: m.acao, valor: m.valor } : null;
    case "estado": {
      if (!m.vars || typeof m.vars !== "object" || Array.isArray(m.vars)) return null;
      const json = JSON.stringify(m.vars);
      return json.length <= 50000 ? { tipo: "estado", vars: JSON.parse(json) } : null;
    }
    case "pedido": {
      if (!Number.isInteger(m.id) || m.id < 1 || !["fotos", "rota"].includes(m.rota) || !m.params || typeof m.params !== "object") return null;
      const params = {};
      for (const [k, v] of Object.entries(m.params).slice(0, 5)) { if (!ehTexto(k, 30) || !ehTexto(v, 300)) return null; params[k] = v; }
      return { tipo: "pedido", id: m.id, rota: m.rota, params };
    }
    case "erro": return ehTexto(m.mensagem, 1000) ? { tipo: "erro", mensagem: m.mensagem } : null;
    case "rolar": return typeof m.dy === "number" && Number.isFinite(m.dy) && Math.abs(m.dy) <= 2000 ? { tipo: "rolar", dy: m.dy } : null;
    case "tecla": return m.tecla === "Escape" ? { tipo: "tecla", tecla: "Escape" } : null;
    default: return null;
  }
}

/** Só https, sem usuário/senha na URL (o mesmo `linkSeguro` do protocolo). */
function linkSeguro(valor) {
  try {
    const u = new URL(valor);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.toString();
  } catch { return null; }
}

// ── tema: as cores do dashboard viram as variáveis --iui-* da tela ───────────────────────
function luminancia(cor) {
  const m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(cor || "");
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
function corComputada(variavel, reserva) {
  const sonda = document.createElement("span");
  sonda.style.color = `var(${variavel}, ${reserva})`;
  document.body.appendChild(sonda);
  const c = getComputedStyle(sonda).color;
  sonda.remove();
  return c;
}
function temaDaTela() {
  const fundo = corComputada("--bg", "#0d0d1a");
  const escuro = luminancia(fundo) < 0.5;
  const vars = {
    "--iui-canvas": corComputada("--surface", escuro ? "#1a1a2e" : "#ffffff"),
    "--iui-ink": corComputada("--text", escuro ? "#e6edf6" : "#0d1726"),
    "--iui-muted": corComputada("--muted", escuro ? "#9aa4b5" : "#5b6574"),
    "--iui-faint": corComputada("--muted", escuro ? "#9aa4b5" : "#5b6574"),
    "--iui-on-ink": fundo,
  };
  // Destaque do tema (botão principal, foco, sliders); o texto em cima dele contrasta.
  const destaque = corComputada("--purple-bright", "#9d7fd4");
  vars["--iui-accent"] = destaque;
  vars["--iui-on-accent"] = luminancia(destaque) > 0.5 ? "#111118" : "#ffffff";
  // 30/10: Dark e Glass — superfícies, raios e cores dos gráficos saem do tema (o mesmo que o
  // celular manda em `varsDaFamilia`). A Stark fica com o padrão do renderer.
  if (!document.body.classList.contains("theme-stark")) {
    const vidro = document.body.classList.contains("theme-gl");
    Object.assign(vars, {
      "--iui-surface": vidro ? "rgba(255,255,255,0.06)" : corComputada("--surface2", "#0e1220"),
      "--iui-surface-strong": vidro ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
      "--iui-border": "rgba(255,255,255,0.10)",
      "--iui-border-strong": vidro ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.16)",
      "--iui-radius-lg": "14px", "--iui-radius-xl": "16px",
      "--iui-chart-2": corComputada("--cyan", "#9fd8cf"),
      "--iui-chart-3": corComputada("--blob-1", "#8a6a2e"),
      "--iui-chart-4": corComputada("--blob-3", "#4a3f6b"),
    });
  }
  return { esquema: escuro ? "escuro" : "claro", vars, reduzirMovimento: reduzirMovimento() };
}
function reduzirMovimento() {
  const mov = document.documentElement.dataset.movimento;
  return mov === "nunca" || (mov !== "sempre" && matchMedia("(prefers-reduced-motion: reduce)").matches);
}
// Trocou o tema (classe do body ou variáveis do :root): todas as telas abertas acompanham.
new MutationObserver(() => {
  const tema = temaDaTela();
  for (const [janela] of telasAbertas) janela.postMessage({ tipo: "tema", tema }, "*");
}).observe(document.body, { attributes: true, attributeFilter: ["class"] });

let telasComInternet = true;
window.nx.getConfig?.().then((c) => { telasComInternet = c?.telasComInternet !== false; }).catch(() => {});
document.addEventListener("change", (e) => {
  if (e.target?.dataset?.cfg === "telasComInternet") telasComInternet = e.target.checked;
});

// ── esqueleto vivo enquanto a tela é gerada ─────────────────────────────────────────────
const FRASES = ["Escolhendo o layout…", "Organizando as informações…", "Fazendo as contas…", "Desenhando a tela…", "Ajustando os detalhes…", "Quase lá…"];

function esqueletoHtml() {
  return `<div class="tela-esqueleto" role="status" aria-live="polite">
    <div class="esq-folha" aria-hidden="true">
      <i class="esq-titulo"></i><i class="esq-linha"></i>
      <div class="esq-cartoes"><i></i><i></i><i></i></div>
      <div class="esq-barras"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    </div>
    <div class="esq-rodape">
      <span class="esq-pontos" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="esq-frase">${FRASES[0]}</span>
      <span class="esq-tempo">0 s</span>
      <button type="button" class="esq-cancelar" title="Cancelar a tela">Cancelar</button>
    </div>
  </div>`;
}

/** Frase que troca a cada 4 s e os segundos decorridos; para quando a tela sai do esqueleto. */
function animarEsqueleto(ctrl) {
  const t0 = Date.now();
  let i = 0;
  ctrl.timerEsqueleto = setInterval(() => {
    const esq = ctrl.caixa.querySelector(".tela-esqueleto");
    if (!esq || !ctrl.caixa.isConnected) { clearInterval(ctrl.timerEsqueleto); return; }
    const s = Math.round((Date.now() - t0) / 1000);
    esq.querySelector(".esq-tempo").textContent = `${s} s`;
    if (s > 0 && s % 4 === 0) {
      i = Math.min(i + 1, FRASES.length - 1);
      const frase = esq.querySelector(".esq-frase");
      if (frase.textContent !== FRASES[i]) {
        frase.classList.add("trocando");
        setTimeout(() => { frase.textContent = FRASES[i]; frase.classList.remove("trocando"); }, 160);
      }
    }
  }, 1000);
}

// ── a tela embaixo da bolha ─────────────────────────────────────────────────────────────
/**
 * Põe a tela (ou o esqueleto dela) logo depois da bolha. `estado` = o que foi digitado antes.
 * Devolve o controle: mostrar(programa), falhar(motivo), e `aoCancelar`/`aoTentarDeNovo`.
 */
function montarTela(bolha, { programa = null, estado = null, msgId = null } = {}) {
  const antiga = bolha.parentElement?.querySelector(`.tela-ely[data-de="${bolha.dataset.telaId}"]`);
  if (antiga) { vigia.unobserve(antiga); antiga.remove(); }
  const id = bolha.dataset.telaId || (bolha.dataset.telaId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  const caixa = document.createElement("div");
  caixa.className = "tela-ely gerando";
  caixa.dataset.de = id;
  caixa.innerHTML = programa ? "" : esqueletoHtml();
  bolha.after(caixa);
  bolha.parentElement?.querySelector(`.chat-ver-tela[data-tela="${id}"]`)?.remove();
  if (isAtBottom()) scrollToBottom();

  const ctrl = { caixa, bolha, msgId: msgId ?? bolha.dataset.msg ?? null, programa: null, estado, iframe: null, mostrou: false, alturaConteudo: 0, aoCancelar: null, aoTentarDeNovo: null };
  if (!programa) animarEsqueleto(ctrl);

  ctrl.mostrar = (prog) => {
    clearInterval(ctrl.timerEsqueleto);
    caixa.classList.remove("falhou");
    caixa.querySelector(".tela-falhou")?.remove();
    ctrl.programa = prog;
    criarQuadro(ctrl);
    guardarNaMensagem(ctrl);
    vigia.observe(caixa);
  };

  /** Falhou: sem `aoTentarDeNovo`, some; com ele, vira uma faixa "Tentar de novo". */
  ctrl.falhar = (motivo = "Não consegui montar a tela agora.") => {
    clearInterval(ctrl.timerEsqueleto);
    if (ctrl.iframe) { telasAbertas.delete(ctrl.iframe.contentWindow); ctrl.iframe.remove(); ctrl.iframe = null; }
    vigia.unobserve(caixa);
    if (!ctrl.aoTentarDeNovo) {
      caixa.classList.add("saindo");
      setTimeout(() => caixa.remove(), 220);
      return;
    }
    caixa.className = "tela-ely falhou";
    caixa.style.height = "";
    caixa.innerHTML = `<div class="tela-falhou" role="status"><span></span><button type="button" class="tela-tentar">Tentar de novo</button></div>`;
    caixa.querySelector(".tela-falhou span").textContent = motivo;
  };

  caixa.addEventListener("click", (e) => {
    if (e.target.closest(".esq-cancelar")) { e.target.closest(".esq-cancelar").disabled = true; ctrl.aoCancelar?.(); }
    else if (e.target.closest(".tela-tentar")) {
      const tentar = ctrl.aoTentarDeNovo;
      caixa.className = "tela-ely gerando";
      caixa.innerHTML = esqueletoHtml();
      animarEsqueleto(ctrl);
      tentar?.();
    } else if (e.target.closest(".tela-abrir")) abrirTelaCheia(ctrl);
  });

  caixas.set(caixa, ctrl);
  caixasVivas.add(caixa);
  if (programa) ctrl.mostrar(programa);
  return ctrl;
}

/** O iframe da prévia (de novo ao acordar: o programa e o estado guardados voltam junto). */
function criarQuadro(ctrl) {
  const f = novoIframe();
  ctrl.iframe = f;
  ctrl.caixa.appendChild(f);
  // O contentWindow existe já; as mensagens só são aceitas dele.
  telasAbertas.set(f.contentWindow, ctrl);
  // O "pronta" pode sair antes de alguém ouvir: manda também no load.
  vigiarCargas(f, ctrl);
}

/**
 * 31/10: só a PRIMEIRA carga do iframe é a tela. Uma segunda (a página navegou para outro
 * lugar) deixa de ser ouvida e não recebe mais programa nem estado — senão uma página de fora
 * herdaria a confiança da tela (o `contentWindow` é o mesmo depois de navegar).
 */
function vigiarCargas(f, ctrl) {
  let cargas = 0;
  f.addEventListener("load", () => {
    if (++cargas === 1) { iniciar(ctrl); return; }
    telasAbertas.delete(f.contentWindow);
    console.warn("[telas] a tela navegou para fora — parei de ouvir");
  });
}

function novoIframe() {
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-scripts");
  f.setAttribute("referrerpolicy", "no-referrer");
  f.setAttribute("title", "Tela da Ely");
  f.className = "tela-quadro";
  f.src = TELA_SRC;
  return f;
}

/** A prévia mede o conteúdo: até PREVIA_MAX aparece inteira; acima, corta com esmaecido e botão. */
function ajustarPrevia(ctrl) {
  const cortada = ctrl.alturaConteudo > PREVIA_MAX + 24;
  const h = cortada ? PREVIA_MAX : ctrl.alturaConteudo;
  ctrl.caixa.style.height = `${h}px`;
  if (ctrl.iframe) ctrl.iframe.style.height = `${ctrl.alturaConteudo}px`;
  ctrl.caixa.classList.toggle("cortada", cortada);
  let rodape = ctrl.caixa.querySelector(".tela-mais");
  if (!rodape) {
    rodape = document.createElement("div");
    rodape.className = "tela-mais";
    rodape.innerHTML = `<button type="button" class="tela-abrir" title="Abrir a tela inteira (rola sozinha)"><svg class="ico ico-sm" aria-hidden="true"><use href="#i-maximize"/></svg><span></span></button>`;
    ctrl.caixa.appendChild(rodape);
  }
  rodape.querySelector("span").textContent = cortada ? "Abrir tela inteira" : "Tela cheia";
}

// ── tela cheia ──────────────────────────────────────────────────────────────────────────
let cheiaAberta = null;

function abrirTelaCheia(ctrl) {
  if (!ctrl.programa || cheiaAberta) return;
  const voltarFoco = document.activeElement;
  const camada = document.createElement("div");
  camada.className = "tela-cheia";
  camada.setAttribute("role", "dialog");
  camada.setAttribute("aria-modal", "true");
  camada.setAttribute("aria-label", "Tela da Ely");
  camada.innerHTML = `<div class="tela-cheia-painel">
    <div class="tela-cheia-topo"><span>Tela da Ely</span><span class="tela-cheia-acoes"><button type="button" class="tela-cheia-salvar">${ctrl.salvaId ? "Salva" : "Salvar"}</button><button type="button" class="tela-cheia-celular">Mandar pro celular</button></span><button type="button" class="tela-cheia-fechar" title="Fechar (Esc)"><svg class="ico ico-sm" aria-hidden="true"><use href="#i-x"/></svg></button></div>
  </div>`;
  const f = novoIframe();
  f.classList.add("tela-cheia-quadro");
  camada.querySelector(".tela-cheia-painel").appendChild(f);
  document.body.appendChild(camada);
  const cheia = { cheia: true, base: ctrl, iframe: f, caixa: camada };
  telasAbertas.set(f.contentWindow, cheia);
  vigiarCargas(f, cheia);
  requestAnimationFrame(() => camada.classList.add("aberta"));

  const fechar = () => {
    if (!cheiaAberta) return;
    cheiaAberta = null;
    telasAbertas.delete(f.contentWindow);
    document.removeEventListener("keydown", tecla, true);
    camada.classList.remove("aberta");
    setTimeout(() => camada.remove(), 220);
    // A prévia volta com o que foi digitado na tela cheia.
    if (ctrl.iframe) { telasAbertas.delete(ctrl.iframe.contentWindow); ctrl.iframe.remove(); criarQuadro(ctrl); }
    voltarFoco?.focus?.();
  };
  const tecla = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); fechar(); }
    else if (e.key === "Tab") {
      // O foco fica nos botões do topo (o iframe recebe o dele pelo clique).
      e.preventDefault();
      const bs = [...camada.querySelectorAll(".tela-cheia-topo button")];
      const i = bs.indexOf(document.activeElement);
      bs[(i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length]?.focus();
    }
  };
  document.addEventListener("keydown", tecla, true);
  camada.addEventListener("click", (e) => { if (e.target === camada || e.target.closest(".tela-cheia-fechar")) fechar(); });
  camada.querySelector(".tela-cheia-salvar").addEventListener("click", () => void salvarTelaCheia(ctrl, camada));
  camada.querySelector(".tela-cheia-celular").addEventListener("click", async () => {
    const id = ctrl.salvaId ?? await salvarTelaCheia(ctrl, camada);
    if (!id) return;
    try { await window.nx.rpc("telas.salvas.mandar", { id }); showToast("Mandei pro celular: está no Hoje → Telas salvas."); }
    catch { showToast("Não consegui avisar o celular."); }
  });
  cheiaAberta = { fechar };
  camada.querySelector(".tela-cheia-fechar").focus();
}

/** 31/10: guarda a tela (com o estado) nas Telas salvas; devolve o id. */
async function salvarTelaCheia(ctrl, camada) {
  try {
    const r = await window.nx.rpc("telas.salvas.salvar", { programa: ctrl.programa, ...(ctrl.estado ? { estado: ctrl.estado } : {}) });
    const id = r?.result?.tela?.id;
    if (!id) throw new Error("sem id");
    ctrl.salvaId = id;
    const b = camada.querySelector(".tela-cheia-salvar");
    if (b) b.textContent = "Salva";
    showToast("Salva em Hoje → Telas salvas.");
    if (typeof carregarTelasSalvas === "function") void carregarTelasSalvas();
    return id;
  } catch { showToast("Não consegui salvar a tela."); return null; }
}

// ── telas que dormem ─────────────────────────────────────────────────────────────────────
// Cada tela é um iframe com React (e as de mapa, um contexto WebGL — o Chromium tem limite).
// Fora da vista por 30 s (rolou para longe, trocou de aba), o iframe sai e a caixa guarda a
// altura; voltando para perto da vista (800 px antes), ele é recriado com o estado salvo.
const caixas = new WeakMap();
/** As caixas no chat, para soltar do observer as que saírem (WeakMap não se percorre). */
const caixasVivas = new Set();
const SONO_MS = 30_000;
const vigia = new IntersectionObserver((entradas) => {
  for (const e of entradas) {
    const ctrl = caixas.get(e.target);
    if (!ctrl?.programa) continue;
    clearTimeout(ctrl.timerSono);
    if (e.isIntersecting) { if (!ctrl.iframe) { criarQuadro(ctrl); ctrl.caixa.classList.remove("dormindo"); } }
    else if (ctrl.iframe && ctrl.mostrou) ctrl.timerSono = setTimeout(() => dormir(ctrl), SONO_MS);
  }
}, { rootMargin: "800px 0px" });

function dormir(ctrl) {
  if (!ctrl.iframe) return;
  telasAbertas.delete(ctrl.iframe.contentWindow);
  ctrl.iframe.remove();
  ctrl.iframe = null;
  ctrl.caixa.classList.add("dormindo");
}

function iniciar(ctrl) {
  const base = ctrl.cheia ? ctrl.base : ctrl;
  const w = ctrl.iframe?.contentWindow;
  if (!w || !base.programa) return;
  w.postMessage({ tipo: "config", internet: telasComInternet, modo: ctrl.cheia ? "cheia" : "previa" }, "*");
  w.postMessage({ tipo: "programa", texto: base.programa, tema: temaDaTela(), ...(base.estado ? { estado: base.estado } : {}) }, "*");
}

/** Programa e estado vão junto da mensagem no histórico da conversa (conversas.js). */
let timerGravar = null;
/** 31/10: o estado da tela vai ao main (contexto da Ely) com meio segundo de folga. */
let timerEstadoAoMain = null;
function guardarNaMensagem(ctrl) {
  if (!ctrl.msgId || typeof chatMessages === "undefined") return;
  const m = chatMessages.find((x) => x.id === ctrl.msgId);
  if (!m) return;
  m.tela = { programa: ctrl.programa, ...(ctrl.estado ? { estado: ctrl.estado } : {}) };
  clearTimeout(timerGravar);
  timerGravar = setTimeout(() => persistSession(), 600);
}

window.addEventListener("message", async (e) => {
  const ctrl = telasAbertas.get(e.source);
  if (!ctrl) return;
  const m = mensagemDaTela(e.data);
  if (!m) return;
  const w = e.source;
  const base = ctrl.cheia ? ctrl.base : ctrl;
  if (m.tipo === "pronta") iniciar(ctrl);
  else if (m.tipo === "altura") {
    if (ctrl.cheia || (m.px <= 40 && !ctrl.mostrou)) return;
    ctrl.alturaConteudo = Math.min(m.px, 4000);
    ajustarPrevia(ctrl);
    if (!ctrl.mostrou) {
      ctrl.mostrou = true;
      ctrl.caixa.classList.remove("gerando");
      ctrl.caixa.classList.add("pronta");
      setTimeout(() => ctrl.caixa.querySelector(".tela-esqueleto")?.remove(), 320);
      if (isAtBottom()) setTimeout(scrollToBottom, 60);
    }
  } else if (m.tipo === "tecla") {
    // 31/10: Esc com o foco dentro da tela cheia.
    if (ctrl.cheia) cheiaAberta?.fechar();
  } else if (m.tipo === "rolar") {
    // A roda do mouse em cima da prévia rola o chat (o iframe a engoliria).
    if (!ctrl.cheia) timeline.scrollTop += m.dy;
  } else if (m.tipo === "acao") {
    if (m.acao === "perguntar") {
      const texto = m.valor.trim();
      if (!texto) return;
      cheiaAberta?.fechar();
      tirarLinhasDeResposta();
      addBubble("user", texto);
      recordMessage("me", texto);
      window.nx.chatSend(texto);
    } else if (m.acao === "abrirLink") {
      const url = linkSeguro(m.valor);
      if (!url) { showToast("Link recusado (só https)."); return; }
      // Quem abre é o PC: confirma antes, mostrando o endereço de verdade.
      void confirmarNaTela("Abrir no navegador?", url.length > 160 ? url.slice(0, 157) + "…" : url, "Abrir")
        .then((sim) => { if (sim) window.nx.abrirLink(url); });
    } else if (m.acao === "copiar") {
      try { await navigator.clipboard.writeText(m.valor); showToast("Copiado."); }
      catch { showToast("Não consegui copiar."); }
    }
  } else if (m.tipo === "estado") {
    base.estado = m.vars;
    guardarNaMensagem(base);
    // 31/10: a Ely fica sabendo do que foi marcado/respondido (meio segundo de folga entre cliques).
    clearTimeout(timerEstadoAoMain);
    timerEstadoAoMain = setTimeout(() => {
      if (base.programa) window.nx.uiEstado?.(base.programa, m.vars);
      // Tela salva: o estado novo fica guardado junto.
      if (base.salvaId) window.nx.rpc("telas.salvas.estado", { id: base.salvaId, estado: m.vars }).catch(() => {});
    }, 500);
  } else if (m.tipo === "pedido") {
    let r;
    try { r = await window.nx.uiPedido(m.rota, m.params); } catch { r = { erro: "falhou" }; }
    w.postMessage(r?.dados ? { tipo: "resposta", id: m.id, dados: r.dados } : { tipo: "resposta", id: m.id, erro: String(r?.erro ?? "falhou").slice(0, 200) }, "*");
  } else if (m.tipo === "erro") {
    console.warn("[tela]", m.mensagem);
    if (!ctrl.cheia && !ctrl.mostrou) ctrl.falhar("A tela não montou.");
  }
});

/** A pergunta de uma resposta: a bolha do usuário logo antes dela. */
function perguntaAntes(bolha) {
  let ant = bolha.previousElementSibling;
  while (ant && !ant.classList?.contains("user")) ant = ant.previousElementSibling;
  return ant?.innerText ?? "";
}

/** Gera pelo "Ver como tela" (ou de novo depois de falhar), com cancelar. */
async function gerarAqui(ctrl, pergunta, resposta) {
  const id = `vt-${Date.now().toString(36)}`;
  ctrl.aoCancelar = () => window.nx.uiCancelar?.(id);
  ctrl.aoTentarDeNovo = () => gerarAqui(ctrl, pergunta, resposta);
  const r = await window.nx.uiVerComoTela(pergunta, resposta, id).catch(() => null);
  if (r?.programa) ctrl.mostrar(r.programa);
  else if (r?.cancelada) { ctrl.aoTentarDeNovo = null; ctrl.falhar(); }
  else ctrl.falhar(r?.erro ?? "Não consegui montar a tela agora.");
}

// ── geração vinda do main (oferta aceita, "priorizar", pedido explícito) ────────────────
const telasGerando = new Map();
window.nx.onChatTela?.((x) => {
  if (!x || typeof x.id !== "string") return;
  if (x.estado === "gerando") {
    const bolhas = timeline.querySelectorAll(".bubble.assistant");
    const bolha = bolhas[bolhas.length - 1];
    if (!bolha) return;
    const ctrl = montarTela(bolha);
    ctrl.aoCancelar = () => window.nx.uiCancelar?.(x.id);
    telasGerando.set(x.id, ctrl);
    return;
  }
  const ctrl = telasGerando.get(x.id);
  telasGerando.delete(x.id);
  if (!ctrl) return;
  // "Montando a tela…" vira o texto final (pronta, cancelada ou falhou), na bolha e no histórico.
  if (typeof x.texto === "string" && x.texto) {
    ctrl.bolha.textContent = x.texto;
    const m = typeof chatMessages !== "undefined" ? chatMessages.find((y) => y.id === ctrl.bolha.dataset.msg) : null;
    if (m) { m.text = x.texto; persistSession(); }
  }
  if (typeof x.programa === "string" && x.programa) ctrl.mostrar(x.programa);
  else {
    if (!x.cancelada && typeof x.pergunta === "string") ctrl.aoTentarDeNovo = () => gerarAqui(ctrl, x.pergunta, x.resposta ?? "");
    ctrl.falhar();
  }
});

// ── "Ver como tela" no rodapé da resposta ───────────────────────────────────────────────
async function oferecerVerComoTela(bolha) {
  try {
    const cfg = await window.nx.getConfig();
    if (cfg?.respostasInterativas === "nunca") return;
  } catch { return; }
  if (!bolha?.isConnected || bolha.dataset.telaId && timeline.querySelector(`.tela-ely[data-de="${bolha.dataset.telaId}"]`)) return;
  const id = bolha.dataset.telaId || (bolha.dataset.telaId = `t${Date.now().toString(36)}`);
  let rodape = bolha.nextElementSibling?.classList.contains("chat-extras") ? bolha.nextElementSibling : null;
  if (!rodape) { rodape = document.createElement("div"); rodape.className = "chat-extras"; bolha.after(rodape); }
  if (rodape.querySelector(".chat-ver-tela")) return;
  rodape.insertAdjacentHTML("beforeend", `<button type="button" class="chat-ver-tela" data-tela="${id}" title="Montar esta resposta como uma tela interativa">Ver como tela</button>`);
}

timeline.addEventListener("click", (e) => {
  const b = e.target.closest("button.chat-ver-tela");
  if (!b) return;
  const bolha = timeline.querySelector(`.bubble.assistant[data-tela-id="${b.dataset.tela}"]`);
  if (!bolha) return;
  b.remove();
  const msg = typeof chatMessages !== "undefined" ? chatMessages.find((x) => x.id === bolha.dataset.msg) : null;
  void gerarAqui(montarTela(bolha), perguntaAntes(bolha), msg?.text ?? bolha.innerText);
});

/** A tela salva volta ao reabrir a conversa (conversas.js chama). */
function restaurarTela(bolha, mensagem) {
  if (!mensagem?.tela?.programa) return;
  bolha.dataset.msg = mensagem.id;
  montarTela(bolha, { programa: mensagem.tela.programa, estado: mensagem.tela.estado ?? null, msgId: mensagem.id });
}

/** Ao sair do chat ou trocar de conversa, as telas fechadas param de ouvir. */
function fecharTelasForaDaTela() {
  for (const [janela, ctrl] of telasAbertas) if (!ctrl.cheia && !ctrl.caixa.isConnected) telasAbertas.delete(janela);
  // 31/10: caixas que saíram do chat deixam de ser vigiadas (o observer as mantinha vivas, com
  // iframe e contexto WebGL, até fechar o app).
  for (const caixa of caixasVivas) if (!caixa.isConnected) {
    vigia.unobserve(caixa);
    clearTimeout(caixas.get(caixa)?.timerSono);
    caixasVivas.delete(caixa);
  }
}
new MutationObserver(fecharTelasForaDaTela).observe(timeline, { childList: true });
