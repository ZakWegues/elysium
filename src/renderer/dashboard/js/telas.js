// dashboard/js/telas.js — telas inteligentes no chat (Fase 3, 22/10).
//
// A tela é o renderer isolado (ui/render.html) num <iframe sandbox="allow-scripts">: origem opaca,
// sem acesso a este app, aos cookies ou ao IPC. Conversa só por postMessage, e TUDO que vem de lá é
// validado aqui (o espelho do protocolo.ts do ui-render): altura, ações (perguntar / abrir link /
// copiar), estado e pedidos de foto e rota (que o main busca). A tela entra embaixo da resposta,
// com um esqueleto enquanto é gerada; se falhar, o esqueleto some e fica só o texto.

const TELA_SRC = "ui/render.html";
/** iframe.contentWindow → controle da tela. */
const telasAbertas = new Map();

// ── validação do que a tela manda ───────────────────────────────────────────────────────
const ehTexto = (v, max) => typeof v === "string" && v.length <= max;
function mensagemDaTela(m) {
  if (!m || typeof m !== "object" || typeof m.tipo !== "string") return null;
  switch (m.tipo) {
    case "pronta": return { tipo: "pronta" };
    case "altura": return Number.isInteger(m.px) && m.px >= 0 && m.px <= 20000 ? { tipo: "altura", px: m.px } : null;
    case "acao": return ["perguntar", "abrirLink", "copiar"].includes(m.acao) && ehTexto(m.valor, 4000) ? { tipo: "acao", acao: m.acao, valor: m.valor } : null;
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
  const mov = document.documentElement.dataset.movimento;
  const reduzir = mov === "nunca" || (mov !== "sempre" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  return { esquema: escuro ? "escuro" : "claro", vars, reduzirMovimento: reduzir };
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

// ── a tela embaixo da bolha ─────────────────────────────────────────────────────────────
/**
 * Põe a tela (ou o esqueleto dela) logo depois da bolha. `estado` = o que foi digitado antes.
 * Devolve o controle: mostrar(programa), falhar().
 */
function montarTela(bolha, { programa = null, estado = null, msgId = null } = {}) {
  bolha.parentElement?.querySelector(`.tela-ely[data-de="${bolha.dataset.telaId}"]`)?.remove();
  const id = bolha.dataset.telaId || (bolha.dataset.telaId = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  const caixa = document.createElement("div");
  caixa.className = "tela-ely gerando";
  caixa.dataset.de = id;
  caixa.innerHTML = `<div class="tela-esqueleto" aria-label="Montando a tela"><span>Montando a tela…</span></div>`;
  bolha.after(caixa);
  bolha.parentElement?.querySelector(`.chat-ver-tela[data-tela="${id}"]`)?.remove();
  if (isAtBottom()) scrollToBottom();

  const ctrl = { caixa, bolha, msgId: msgId ?? bolha.dataset.msg ?? null, programa: null, estado, iframe: null, mostrou: false };

  ctrl.mostrar = (prog) => {
    ctrl.programa = prog;
    criarQuadro(ctrl);
    guardarNaMensagem(ctrl);
    vigia.observe(caixa);
  };

  ctrl.falhar = () => {
    caixa.classList.add("saindo");
    setTimeout(() => caixa.remove(), 220);
    if (ctrl.iframe) telasAbertas.delete(ctrl.iframe.contentWindow);
    vigia.unobserve(caixa);
  };

  caixas.set(caixa, ctrl);
  if (programa) ctrl.mostrar(programa);
  return ctrl;
}

/** O iframe da tela (de novo ao acordar: o programa e o estado guardados voltam junto). */
function criarQuadro(ctrl) {
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-scripts");
  f.setAttribute("referrerpolicy", "no-referrer");
  f.setAttribute("title", "Tela da Ely");
  f.className = "tela-quadro";
  f.src = TELA_SRC;
  ctrl.iframe = f;
  ctrl.caixa.appendChild(f);
  // O contentWindow existe já; as mensagens só são aceitas dele.
  telasAbertas.set(f.contentWindow, ctrl);
  // O "pronta" pode sair antes de alguém ouvir: manda também no load.
  f.addEventListener("load", () => iniciar(ctrl));
}

// ── telas que dormem ─────────────────────────────────────────────────────────────────────
// Cada tela é um iframe com React (e as de mapa, um contexto WebGL — o Chromium tem limite).
// Fora da vista por 30 s (rolou para longe, trocou de aba), o iframe sai e a caixa guarda a
// altura; voltando para perto da vista (800 px antes), ele é recriado com o estado salvo.
const caixas = new WeakMap();
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
  const w = ctrl.iframe?.contentWindow;
  if (!w || !ctrl.programa) return;
  w.postMessage({ tipo: "config", internet: telasComInternet }, "*");
  w.postMessage({ tipo: "programa", texto: ctrl.programa, tema: temaDaTela(), ...(ctrl.estado ? { estado: ctrl.estado } : {}) }, "*");
}

/** Programa e estado vão junto da mensagem no histórico da conversa (conversas.js). */
let timerGravar = null;
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
  if (m.tipo === "pronta") iniciar(ctrl);
  else if (m.tipo === "altura") {
    if (m.px <= 40 && !ctrl.mostrou) return;
    ctrl.caixa.style.height = `${Math.min(m.px, 4000)}px`;
    if (!ctrl.mostrou) {
      ctrl.mostrou = true;
      ctrl.caixa.classList.remove("gerando");
      ctrl.caixa.classList.add("pronta");
      setTimeout(() => ctrl.caixa.querySelector(".tela-esqueleto")?.remove(), 320);
      if (isAtBottom()) setTimeout(scrollToBottom, 60);
    }
  } else if (m.tipo === "acao") {
    if (m.acao === "perguntar") {
      const texto = m.valor.trim();
      if (!texto) return;
      tirarLinhasDeResposta();
      addBubble("user", texto);
      recordMessage("me", texto);
      window.nx.chatSend(texto);
    } else if (m.acao === "abrirLink") {
      const url = linkSeguro(m.valor);
      if (!url) { showToast("Link recusado (só https)."); return; }
      // Quem abre é o PC: confirma antes, mostrando o endereço de verdade.
      if (confirm(`Abrir no navegador?\n\n${url.length > 160 ? url.slice(0, 157) + "…" : url}`)) window.nx.abrirLink(url);
    } else if (m.acao === "copiar") {
      try { await navigator.clipboard.writeText(m.valor); showToast("Copiado."); }
      catch { showToast("Não consegui copiar."); }
    }
  } else if (m.tipo === "estado") {
    ctrl.estado = m.vars;
    guardarNaMensagem(ctrl);
  } else if (m.tipo === "pedido") {
    let r;
    try { r = await window.nx.uiPedido(m.rota, m.params); } catch { r = { erro: "falhou" }; }
    w.postMessage(r?.dados ? { tipo: "resposta", id: m.id, dados: r.dados } : { tipo: "resposta", id: m.id, erro: String(r?.erro ?? "falhou").slice(0, 200) }, "*");
  } else if (m.tipo === "erro") {
    console.warn("[tela]", m.mensagem);
    if (!ctrl.mostrou) ctrl.falhar();
  }
});

// ── geração vinda do main (oferta aceita, "priorizar", pedido explícito) ────────────────
const telasGerando = new Map();
window.nx.onChatTela?.((x) => {
  if (!x || typeof x.id !== "string") return;
  if (x.estado === "gerando") {
    const bolhas = timeline.querySelectorAll(".bubble.assistant");
    const bolha = bolhas[bolhas.length - 1];
    if (bolha) telasGerando.set(x.id, montarTela(bolha));
    return;
  }
  const ctrl = telasGerando.get(x.id);
  telasGerando.delete(x.id);
  if (!ctrl) return;
  if (typeof x.programa === "string" && x.programa) {
    // Veio do "sim" à oferta: o "Montando a tela…" vira o texto final, na bolha e no histórico.
    if (typeof x.texto === "string" && x.texto) {
      ctrl.bolha.textContent = x.texto;
      const m = typeof chatMessages !== "undefined" ? chatMessages.find((y) => y.id === ctrl.bolha.dataset.msg) : null;
      if (m) m.text = x.texto;
    }
    ctrl.mostrar(x.programa);
  } else ctrl.falhar();
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

timeline.addEventListener("click", async (e) => {
  const b = e.target.closest("button.chat-ver-tela");
  if (!b) return;
  const bolha = timeline.querySelector(`.bubble.assistant[data-tela-id="${b.dataset.tela}"]`);
  if (!bolha) return;
  b.remove();
  const msg = typeof chatMessages !== "undefined" ? chatMessages.find((x) => x.id === bolha.dataset.msg) : null;
  const resposta = msg?.text ?? bolha.innerText;
  // A pergunta: a bolha do usuário logo antes desta resposta.
  let ant = bolha.previousElementSibling;
  while (ant && !ant.classList?.contains("user")) ant = ant.previousElementSibling;
  const ctrl = montarTela(bolha);
  const r = await window.nx.uiVerComoTela(ant?.innerText ?? "", resposta).catch(() => null);
  if (r?.programa) ctrl.mostrar(r.programa);
  else { ctrl.falhar(); showToast(r?.erro ?? "Não consegui montar a tela agora."); }
});

/** A tela salva volta ao reabrir a conversa (conversas.js chama). */
function restaurarTela(bolha, mensagem) {
  if (!mensagem?.tela?.programa) return;
  bolha.dataset.msg = mensagem.id;
  montarTela(bolha, { programa: mensagem.tela.programa, estado: mensagem.tela.estado ?? null, msgId: mensagem.id });
}

/** Ao sair do chat ou trocar de conversa, as telas fechadas param de ouvir. */
function fecharTelasForaDaTela() {
  for (const [janela, ctrl] of telasAbertas) if (!ctrl.caixa.isConnected) telasAbertas.delete(janela);
}
new MutationObserver(fecharTelasForaDaTela).observe(timeline, { childList: true });
