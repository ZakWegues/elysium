// dashboard/js/voz.js — ondas, máquina de estado, kill switch, ponte nx.*, parallax do fundo, campo de texto, mídia.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// WAVEFORM ANIMATION (rAF loop)
// ─────────────────────────────────────────────────
const bars = [0,1,2,3,4,5,6,7,8].map(i => document.getElementById("b" + i));

// 25/10: o laço só existe enquanto ouve (antes rodava 60 vezes por segundo o tempo todo, à toa).
let ondasRodando = false;
function animLoop() {
  if (appState !== "listening") { ondasRodando = false; return; }
  const silent = (Date.now() - lastLevelTs) > 80;
  if (silent) {
    bars.forEach((bar, i) => {
      currentH[i] = lerp(currentH[i], MIN_H, DECAY_SPEED);
      bar.style.height = currentH[i].toFixed(1) + "px";
    });
  }
  requestAnimationFrame(animLoop);
}
function ligarOndas() { if (!ondasRodando) { ondasRodando = true; requestAnimationFrame(animLoop); } }

// Fundo decorativo parado com a janela sem foco (ver fundo.css).
function acertarFundo() { document.body.classList.toggle("fundo-parado", !focoJanela); }
window.nx.onFocoJanela?.((f) => { focoJanela = f; acertarFundo(); window.dispatchEvent(new Event("ely-estado")); });

// ─────────────────────────────────────────────────
// STATE MACHINE
// ─────────────────────────────────────────────────
const statusBadge  = document.getElementById("status-badge");
const voiceZone    = document.getElementById("voice-zone");
const textZone     = document.getElementById("text-zone");
const waveStatus   = document.getElementById("wave-status");
const barsRow      = document.getElementById("bars-row");
const stopZone     = document.getElementById("stop-zone");
// Sai da barra do chat para o body: a aba do chat escondida levaria o botão junto.
document.body.appendChild(stopZone);

const STATE_LABELS = {
  idle: "Ocioso", listening: "OUVINDO", processing: "PROCESSANDO",
  speaking: "RESPONDENDO", error: "ERRO"
};
const WAVE_LABELS = {
  listening: "Ouvindo…", processing: "Processando…",
  speaking: "Respondendo…"
};

// ── Sons de escuta (02/10, como Alexa/Google) ──
// Um bipe curto subindo quando ela começa a ouvir e um descendo quando para: dá para saber
// sem olhar para a tela se ela pegou o atalho ou o "Ely". Gerados aqui (WebAudio), sem
// arquivo. Desliga em Ajustes → Voz (`somDeEscuta`).
let somDeEscuta = true;
window.nx.getConfig().then((c) => { somDeEscuta = c?.somDeEscuta !== false; }).catch(() => {});
let audioCtx = null;
function bipe(de, para) {
  if (!somDeEscuta) return;
  try {
    audioCtx ??= new AudioContext();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const ganho = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(de, t);
    osc.frequency.exponentialRampToValueAtTime(para, t + 0.12);
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(ganho).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  } catch { /* sem áudio, sem bipe */ }
}

function setState(s) {
  const anterior = appState;
  if (s === "listening" && anterior !== "listening") bipe(660, 990);
  else if (anterior === "listening" && s === "processing") bipe(880, 590);
  appState = s;
  if (s === "listening") ligarOndas();
  window.dispatchEvent(new Event("ely-estado"));
  statusBadge.className = s;
  // O fundo acelera enquanto o app está ouvindo, pensando ou falando.
  document.body.classList.toggle("vivo", s === "listening" || s === "processing" || s === "speaking");
  statusBadge.textContent = STATE_LABELS[s] ?? s.toUpperCase();

  const inVoice = s === "listening" || s === "processing" || s === "speaking";
  voiceZone.classList.toggle("active", inVoice && voiceActive);
  textZone.classList.toggle("hidden", inVoice && voiceActive);
  if (WAVE_LABELS[s]) waveStatus.textContent = WAVE_LABELS[s];
  if (s === "processing") barsRow.classList.add("state-processing");
  else barsRow.classList.remove("state-processing");
  // Animação da voz (08/10): anéis só enquanto ouve; o núcleo volta ao repouso fora disso.
  voiceZone.classList.toggle("ouvindo", s === "listening");
  if (s !== "listening") voiceZone.style.setProperty("--nivel", "0");

  mostrarStop();

  if (s !== "listening") {
    currentH.fill(MIN_H);
    bars.forEach(b => { b.style.height = MIN_H + "px"; });
  }
  if (s === "idle" || s === "error") {
    voiceActive = false;
    voiceZone.classList.remove("active");
    textZone.classList.remove("hidden");
  }
}

// ─────────────────────────────────────────────────
// STOP TTS (kill switch)
// ─────────────────────────────────────────────────
// O botão aparece em QUALQUER fala (02/10): a resposta à voz ("speaking") e também lembrete,
// timer, rotina e resumo do dia, que falam com o app ocioso — o main avisa por "tts:falando".
let ttsFalando = false;
// Também enquanto ela PENSA (02/10, "parar geração" do ChatGPT): uma resposta longa que
// saiu do rumo não precisa ser esperada até o fim. O main descarta o resto pelo token.
// 23/10: a pílula entra e sai com fade + 8 px (classe "visivel"), fica logo abaixo das abas e
// recolhe sozinha 5 s depois de aberta, como a do celular.
let timerPilula = null;
function mostrarStop() {
  const pensando = appState === "processing";
  const ativa = appState === "speaking" || ttsFalando || pensando;
  if (ativa && !stopZone.classList.contains("visivel")) {
    // Abaixo das abas e, no Chat, abaixo do seletor IA/Celular (não cobre nenhum dos dois).
    const fundos = ["viewtabs", "chat-mode-tabs"].map((id) => document.getElementById(id)?.getBoundingClientRect()).filter((r) => r && r.height > 0).map((r) => r.bottom);
    stopZone.style.top = `${Math.round(Math.max(48, ...fundos) + 10)}px`;
  }
  stopZone.classList.toggle("visivel", ativa);
  stopZone.classList.toggle("pensando", pensando);
  if (!ativa) recolherPilula();
  stopZone.querySelector(".pv-rotulo").textContent = pensando ? "Pensando" : "Falando";
  const rotulo = document.querySelector("#stop-btn span");
  if (rotulo) rotulo.textContent = pensando ? "Parar resposta" : "Parar";
  mostrarPensando(pensando && !bolhaEmCurso);
}
function recolherPilula() {
  clearTimeout(timerPilula);
  stopZone.classList.remove("aberta");
  stopZone.querySelector(".pv-cabeca").setAttribute("aria-expanded", "false");
}
stopZone.querySelector(".pv-cabeca").addEventListener("click", () => {
  const abrir = !stopZone.classList.contains("aberta");
  stopZone.classList.toggle("aberta", abrir);
  stopZone.querySelector(".pv-cabeca").setAttribute("aria-expanded", String(abrir));
  clearTimeout(timerPilula);
  if (abrir) timerPilula = setTimeout(recolherPilula, 5000);
});

// "Digitando" (23/10): os três pontos do celular, numa bolha da Ely, entre o envio e o 1º pedaço.
let bolhaPensando = null;
function mostrarPensando(sim) {
  if (sim && !bolhaPensando) {
    const wasBottom = isAtBottom();
    bolhaPensando = document.createElement("div");
    bolhaPensando.className = "bubble assistant pensando";
    bolhaPensando.setAttribute("aria-label", "Ely está pensando");
    bolhaPensando.innerHTML = "<i></i><i></i><i></i>";
    timeline.appendChild(bolhaPensando);
    if (wasBottom) scrollToBottom();
  } else if (!sim && bolhaPensando) {
    bolhaPensando.remove();
    bolhaPensando = null;
  }
}
window.nx.onFalando?.((f) => { ttsFalando = f; mostrarStop(); });

function doStop() {
  window.nx.stopTts();
  // O que já chegou fica na conversa, marcado como interrompido.
  if (bolhaEmCurso) finalizarResposta(textoEmCurso.trimEnd() + " …");
  setState("idle");   // optimistic — backend also sets idle
}

document.getElementById("stop-btn").addEventListener("click", doStop);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (appState === "speaking" || appState === "processing" || ttsFalando)) doStop();
});

// ─────────────────────────────────────────────────
// ELYSIUM API BRIDGE
// ─────────────────────────────────────────────────
window.nx.onState(setState);

// ── Fundo vivo (bloco 69): parallax pelo mouse e reação ao estado ──
//
// Duas variáveis CSS (-1..1) escritas no máximo uma vez por quadro; as camadas do fundo
// as leem com transição longa, então o movimento é sempre suave mesmo com o mouse
// pulando. Fora da janela, volta ao centro devagar.
{
  let px = 0, py = 0, agendado = false;
  const aplicar = () => {
    agendado = false;
    document.documentElement.style.setProperty("--par-x", px.toFixed(3));
    document.documentElement.style.setProperty("--par-y", py.toFixed(3));
  };
  document.addEventListener("mousemove", (e) => {
    if (!movimentoLigado()) return;
    px = (e.clientX / innerWidth) * 2 - 1;
    py = (e.clientY / innerHeight) * 2 - 1;
    if (!agendado) { agendado = true; requestAnimationFrame(aplicar); }
  }, { passive: true });
  document.addEventListener("mouseleave", () => { px = 0; py = 0; requestAnimationFrame(aplicar); });
}

window.nx.onAudioLevel((level) => {
  if (appState !== "listening") return;
  lastLevelTs = Date.now();
  // O núcleo de luz atrás das barras cresce com o volume (chat.css, #voice-zone::before).
  voiceZone.style.setProperty("--nivel", Math.min(1, level * 6).toFixed(2));
  bars.forEach((bar, i) => {
    const variation = 0.7 + Math.random() * 0.6 + OFFSETS[i];
    const target = MIN_H + Math.min(MAX_H - MIN_H, level * 260 * variation);
    currentH[i] = lerp(currentH[i], target, LERP_SPEED);
    bar.style.height = currentH[i].toFixed(1) + "px";
  });
});

window.nx.onTranscript((text) => {
  addBubble("user", text);
  recordMessage("me", text);
});

// Só o texto da zona de voz. O cartão de log vem por `dash:action-log`, que o main manda
// junto — registrar aqui também punha DOIS "Consultando sistema…" por comando.
window.nx.onActionLabel((label) => {
  waveStatus.textContent = label;
});

// ── Resposta em pedaços ─────────────────────────
// O primeiro pedaço cria a bolha; os seguintes só acrescentam texto (sem markdown, para
// não fechar um asterisco pela metade a cada quadro). O reply final substitui o conteúdo
// pela versão renderizada e grava na conversa — a bolha é a mesma, então nada pula.
let bolhaEmCurso = null;
let textoEmCurso = "";

window.nx.onChatChunk((pedaco) => {
  mostrarPensando(false);
  if (!bolhaEmCurso) {
    const wasBottom = isAtBottom();
    document.getElementById("chat-vazio")?.remove();
    bolhaEmCurso = document.createElement("div");
    bolhaEmCurso.className = "bubble assistant escrevendo";
    timeline.appendChild(bolhaEmCurso);
    if (wasBottom) scrollToBottom();
  }
  const wasBottom = isAtBottom();
  textoEmCurso += pedaco;
  bolhaEmCurso.textContent = textoEmCurso;
  if (wasBottom) scrollToBottom();
});

function finalizarResposta(text) {
  mostrarPensando(false);
  let bolha = bolhaEmCurso;
  if (bolhaEmCurso) {
    bolhaEmCurso.classList.remove("escrevendo");
    bolhaEmCurso.innerHTML = renderMarkdown(text);
    bolhaEmCurso = null;
    textoEmCurso = "";
  } else {
    addBubble("assistant", renderMarkdown(text), true);
    const bolhas = timeline.querySelectorAll(".bubble.assistant");
    bolha = bolhas[bolhas.length - 1];
  }
  recordMessage("reply", text);
  // 22/10: a bolha sabe qual mensagem é (a tela inteligente grava junto dela) e ganha o
  // "Ver como tela" no rodapé (telas.js).
  if (bolha && typeof chatMessages !== "undefined" && chatMessages.length) bolha.dataset.msg = chatMessages[chatMessages.length - 1].id;
  if (bolha && typeof oferecerVerComoTela === "function") void oferecerVerComoTela(bolha);
}

/**
 * Fontes da busca (bloco 131) e sugestões de próxima pergunta (bloco 132), num rodapé
 * logo depois da última resposta. As sugestões somem quando você manda outra coisa.
 */
function anexarExtras(x) {
  const bolhas = timeline.querySelectorAll(".bubble.assistant");
  const ultima = bolhas[bolhas.length - 1];
  if (!ultima) return;
  // 22/10: a tela inteligente fica entre a bolha e o rodapé.
  const depois = ultima.nextElementSibling?.classList.contains("tela-ely") ? ultima.nextElementSibling : ultima;
  let rodape = depois.nextElementSibling?.classList.contains("chat-extras") ? depois.nextElementSibling : null;
  if (!rodape) {
    rodape = document.createElement("div");
    rodape.className = "chat-extras";
    depois.after(rodape);
  }
  if (x?.fontes?.length) {
    const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
    rodape.insertAdjacentHTML("beforeend", `<div class="chat-fontes">${x.fontes.map((f, i) =>
      `<button type="button" data-fonte="${escHtml(f.url)}" title="${escHtml(f.titulo)}"><b>${i + 1}</b>${escHtml(host(f.url))}</button>`).join("")}</div>`);
  }
  if (x?.local && !rodape.querySelector(".chat-local")) {
    // Fase 21: "reserva" cobre os dois casos — o Hermes não respondeu, ou a nuvem caiu e o local respondeu.
    rodape.insertAdjacentHTML("afterbegin", `<div class="chat-local" title="O cérebro principal não respondeu a tempo; quem respondeu foi a reserva — pode ser menos preciso.">reserva</div>`);
  }
  // 22/10: respostas rápidas — Sim/Não/opções dela + as prontas + "Outra resposta…".
  if (x?.rapidas) {
    rodape.querySelector(".chat-rapidas")?.remove();
    const r = x.rapidas;
    const botoes = [];
    if (r.sim) botoes.push(["Sim", "sim", "forte"]);
    if (r.nao) botoes.push(["Não", "não", "forte"]);
    for (const o of r.opcoes ?? []) botoes.push([o, o, "forte"]);
    // Com pergunta, as sugestões de continuação saem: uma linha só.
    if (r.pergunta) rodape.querySelector(".chat-sugestoes")?.remove();
    for (const p of r.prontas ?? []) botoes.push([p, p, ""]);
    if (r.pergunta) botoes.push(["Outra resposta…", "", "outra"]);
    if (botoes.length) {
      rodape.insertAdjacentHTML("beforeend", `<div class="chat-rapidas">${botoes.map(([rot, val, tipo], i) =>
        `<button type="button" class="${tipo}" data-rapida="${escHtml(val)}"${tipo === "outra" ? " data-outra=\"1\"" : ""}${i < 4 && tipo === "forte" ? ` title="Alt+${i + 1}"` : ""}>${escHtml(rot)}</button>`).join("")}</div>`);
    }
  }
  if (x?.sugestoes?.length) {
    rodape.querySelector(".chat-sugestoes")?.remove();
    const html = x.sugestoes.map(s => `<button type="button" data-sugestao="${escHtml(s)}">${escHtml(s)}</button>`).join("");
    // Já tem a linha das respostas prontas: as sugestões entram no começo dela (uma linha só).
    const linha = rodape.querySelector(".chat-rapidas");
    if (linha) linha.insertAdjacentHTML("afterbegin", html);
    else rodape.insertAdjacentHTML("beforeend", `<div class="chat-sugestoes">${html}</div>`);
  }
  if (isAtBottom()) scrollToBottom();
}

window.nx.onChatExtras?.(anexarExtras);

timeline.addEventListener("click", (e) => {
  const f = e.target.closest("button[data-fonte]");
  if (f) { window.nx.abrirLink(f.dataset.fonte); return; }
  const rap = e.target.closest("button[data-rapida]");
  if (rap) { responderRapida(rap); return; }
  const s = e.target.closest("button[data-sugestao]");
  if (!s) return;
  const texto = s.dataset.sugestao;
  tirarLinhasDeResposta();
  addBubble("user", texto);
  recordMessage("me", texto);
  window.nx.chatSend(texto);
});

/** As linhas de chips da resposta anterior somem (com fade curto) quando ele responde. */
function tirarLinhasDeResposta() {
  timeline.querySelectorAll(".chat-sugestoes, .chat-rapidas").forEach(n => {
    n.classList.add("saindo");
    setTimeout(() => n.remove(), 140);
  });
}

/** Clique numa resposta rápida: vira mensagem normal; "Outra resposta…" só foca o campo. */
function responderRapida(btn) {
  if (btn.dataset.outra) { cmdInput.focus(); return; }
  const texto = btn.dataset.rapida;
  if (!texto) return;
  tirarLinhasDeResposta();
  addBubble("user", texto);
  recordMessage("me", texto);
  window.nx.chatSend(texto);
}

window.nx.onReply(finalizarResposta);

window.nx.onError((msg) => {
  if (bolhaEmCurso) { bolhaEmCurso.remove(); bolhaEmCurso = null; textoEmCurso = ""; }
  addBubble("error", msg);
  recordMessage("error", msg);
});

window.nx.onChatReply(finalizarResposta);

window.nx.onChatError((msg) => {
  mostrarPensando(false);
  if (bolhaEmCurso) { bolhaEmCurso.remove(); bolhaEmCurso = null; textoEmCurso = ""; }
  addBubble("error", msg);
  recordMessage("error", msg);
});

window.nx.onChatBusy(() => {
  addBubble("system", "Aguarde o assistente terminar…");
});


window.nx.onActionLog((log) => {
  addLog(log.icon ?? "zap", log.text ?? "", log.ok !== false);
});

// ─────────────────────────────────────────────────
// TEXT INPUT
// ─────────────────────────────────────────────────
const cmdInput = document.getElementById("cmd-input");
const sendBtn  = document.getElementById("send-btn");
const micBtn   = document.getElementById("mic-btn");

// O envio de verdade mora em chat-extra.js (bloco 84): anexos, edição da última pergunta e
// o lado "Celular" com arquivos. Aqui fica só o ponto de entrada que os ouvintes já usam.
function sendText() {
  // Pergunta nova: as sugestões da resposta anterior já não servem (bloco 132).
  tirarLinhasDeResposta();
  if (cmdInput.value.trim()) window.dispatchEvent(new CustomEvent("ely:enviou"));
  enviarMensagem();
}

// Fase 22: cada tecla no campo dá um micro-pulso na esfera (esfera.js).
cmdInput.addEventListener("input", () => window.dispatchEvent(new CustomEvent("ely:tecla")));

sendBtn.addEventListener("click", sendText);

// 22/10: Alt+1…4 toca os primeiros botões de resposta (Sim, Não, opções) da última resposta.
cmdInput.addEventListener("keydown", (e) => {
  if (!e.altKey || e.ctrlKey || !/^[1-4]$/.test(e.key)) return;
  const linhas = timeline.querySelectorAll(".chat-rapidas:not(.saindo)");
  const btn = linhas[linhas.length - 1]?.querySelectorAll("button.forte")[Number(e.key) - 1];
  if (!btn) return;
  e.preventDefault();
  responderRapida(btn);
});

// Fase 21: modo live — um clique liga a conversa contínua, outro desliga. O botão acende
// enquanto ele está ligado (venha de onde vier: voz, bolota ou aqui).
const liveBtn = document.getElementById("live-btn");
liveBtn?.addEventListener("click", () => window.nx.alternarLive?.());
window.nx.onLive?.((ligado) => {
  liveBtn?.classList.toggle("active", ligado);
  liveBtn?.setAttribute("aria-pressed", String(ligado));
  if (liveBtn) liveBtn.title = ligado ? "Sair do modo live" : "Modo live: conversa contínua (diga “tchau” para sair)";
});
cmdInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } });

function abrirZonaDeVoz() {
  voiceActive = true;
  micBtn.classList.add("active");
  // O "pulo" do botão ao clicar; a zona de voz nasce com a própria animação (chat.css).
  micBtn.classList.remove("mic-burst"); void micBtn.offsetWidth; micBtn.classList.add("mic-burst");
  setTimeout(() => micBtn.classList.remove("mic-burst"), 560);
  voiceZone.classList.add("active");
  textZone.classList.add("hidden");
}
micBtn.addEventListener("click", () => {
  abrirZonaDeVoz();
  window.nx.startListening();
});

// Fase 22: segurar Espaço no Chat = falar; soltar = mandar. Só com o foco fora de campo de
// texto e com o Chat à vista; numa tecla de botão focado, o Espaço não aperta o botão.
{
  let segurando = false;
  const ehCampo = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const chatVisivel = () => document.getElementById("center")?.offsetParent !== null;
  const soltar = () => { if (!segurando) return; segurando = false; window.nx.soltarParaEnviar?.(); };
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (ehCampo(e.target) || !chatVisivel()) return;
    if (document.querySelector("#paleta-veu.aberto, #gaveta-veu.aberto")) return;
    e.preventDefault();
    if (e.repeat || segurando || appState !== "idle") return;
    segurando = true;
    abrirZonaDeVoz();
    window.nx.segurarParaFalar?.();
  });
  document.addEventListener("keyup", (e) => {
    if (e.code !== "Space" || !segurando) return;
    e.preventDefault();
    soltar();
  });
  window.addEventListener("blur", soltar);
}

// ─────────────────────────────────────────────────
// MEDIA CONTROLS
// ─────────────────────────────────────────────────
// As teclas de mídia do sistema funcionam com qualquer player, não só com o Spotify —
// por isso viraram o estado vazio do card "Tocando" em vez de sumirem junto com o widget.
document.getElementById("view-inicio")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-media]");
  if (btn) window.nx.mediaControl(btn.dataset.media);
});
