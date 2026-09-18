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

(function animLoop() {
  if (appState === "listening") {
    const silent = (Date.now() - lastLevelTs) > 80;
    if (silent) {
      bars.forEach((bar, i) => {
        currentH[i] = lerp(currentH[i], MIN_H, DECAY_SPEED);
        bar.style.height = currentH[i].toFixed(1) + "px";
      });
    }
  }
  requestAnimationFrame(animLoop);
})();

// ─────────────────────────────────────────────────
// STATE MACHINE
// ─────────────────────────────────────────────────
const statusBadge  = document.getElementById("status-badge");
const voiceZone    = document.getElementById("voice-zone");
const textZone     = document.getElementById("text-zone");
const waveStatus   = document.getElementById("wave-status");
const barsRow      = document.getElementById("bars-row");
const stopZone     = document.getElementById("stop-zone");

const STATE_LABELS = {
  idle: "Ocioso", listening: "OUVINDO", processing: "PROCESSANDO",
  speaking: "RESPONDENDO", error: "ERRO"
};
const WAVE_LABELS = {
  listening: "Ouvindo…", processing: "Processando…",
  speaking: "Respondendo…"
};

function setState(s) {
  appState = s;
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

  // Stop button — only during speaking
  stopZone.style.display = (s === "speaking") ? "flex" : "none";

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
function doStop() {
  window.nx.stopTts();
  setState("idle");   // optimistic — backend also sets idle
}

document.getElementById("stop-btn").addEventListener("click", doStop);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && appState === "speaking") doStop();
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
  if (bolhaEmCurso) {
    bolhaEmCurso.classList.remove("escrevendo");
    bolhaEmCurso.innerHTML = renderMarkdown(text);
    bolhaEmCurso = null;
    textoEmCurso = "";
  } else {
    addBubble("assistant", renderMarkdown(text), true);
  }
  recordMessage("reply", text);
}

window.nx.onReply(finalizarResposta);

window.nx.onError((msg) => {
  if (bolhaEmCurso) { bolhaEmCurso.remove(); bolhaEmCurso = null; textoEmCurso = ""; }
  addBubble("error", msg);
  recordMessage("error", msg);
});

window.nx.onChatReply(finalizarResposta);

window.nx.onChatError((msg) => {
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

function sendText() {
  const text = cmdInput.value.trim();
  if (!text) return;
  // Fileira some assim que a conversa começa: a partir daí ela seria ruído entre a
  // resposta e a próxima pergunta.
  if (chatBolhas) chatBolhas.innerHTML = "";
  if (chatMode === "self") {
    window.nx.mailboxSend(text);
  } else {
    addBubble("user", text);
    recordMessage("me", text);
    window.nx.chatSend(text);
  }
  cmdInput.value = "";
}

sendBtn.addEventListener("click", sendText);
cmdInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } });

micBtn.addEventListener("click", () => {
  voiceActive = true;
  micBtn.classList.add("active");
  voiceZone.classList.add("active");
  textZone.classList.add("hidden");
  window.nx.startListening();
});

// ─────────────────────────────────────────────────
// MEDIA CONTROLS
// ─────────────────────────────────────────────────
// As teclas de mídia do sistema funcionam com qualquer player, não só com o Spotify —
// por isso viraram o estado vazio do card "Tocando" em vez de sumirem junto com o widget.
document.getElementById("view-inicio")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-media]");
  if (btn) window.nx.mediaControl(btn.dataset.media);
});
