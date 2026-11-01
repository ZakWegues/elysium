// dashboard/js/chat.js — timeline e modo do chat (IA / Celular).
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// TIMELINE
// ─────────────────────────────────────────────────
const timeline = document.getElementById("timeline");

function isAtBottom() {
  return timeline.scrollHeight - timeline.scrollTop <= timeline.clientHeight + 60;
}
function scrollToBottom() {
  timeline.scrollTo({ top: timeline.scrollHeight, behavior: "smooth" });
}

function addBubble(cls, content, isHtml = false) {
  const wasBottom = isAtBottom();
  // A primeira mensagem de verdade tira o convite do centro; o selo de sistema não conta.
  if (cls !== "system") document.getElementById("chat-vazio")?.remove();
  const div = document.createElement("div");
  div.className = "bubble " + cls;
  if (isHtml) div.innerHTML = content;
  else div.textContent = content;
  timeline.appendChild(div);
  if (wasBottom) scrollToBottom();
}

function mostrarChatVazio() {
  if (document.getElementById("chat-vazio")) return;
  const div = document.createElement("div");
  div.id = "chat-vazio";
  const atalho = escHtml(formatShortcutTexto());
  div.innerHTML = `
    <div class="marca">EL</div>
    <h2 id="chat-vazio-saudacao">${saudacao()}.</h2>
    <p>Pergunte, peça, mande abrir. Fale com <kbd>${atalho}</kbd> de qualquer lugar,
       escreva aqui embaixo, ou abra a paleta com <kbd>Ctrl+K</kbd>.</p>
    <p class="dica-ptt">Segure <kbd>Espaço</kbd> para falar · <kbd>Ctrl+K</kbd> comandos · <kbd>?</kbd> atalhos</p>`;
  timeline.appendChild(div);
  // O nome vem da config (fase 13): dado pessoal mora nos dados do app, não no código.
  window.nx.getConfig().then((c) => {
    const nome = String(c?.nomeDoUsuario ?? "").trim();
    const h2 = document.getElementById("chat-vazio-saudacao");
    if (nome && h2) h2.textContent = `${saudacao()}, ${nome}.`;
  }).catch(() => {});
}

/** O atalho gravado, como texto de tela ("Ctrl+Shift+J"). `loadConfig` já roda antes. */
function formatShortcutTexto() {
  const sc = document.getElementById("shortcut-input")?.value || "Control+Shift+J";
  return String(sc).replace(/CommandOrControl/g, "Ctrl").replace(/Control/g, "Ctrl");
}

function addLog(icon, text, success = true) {
  const wasBottom = isAtBottom();
  const div = document.createElement("div");
  div.className = "log-card";
  div.innerHTML = `<span class="log-icon">${ico(icon, "ico-sm")}</span><span>${escHtml(text)}</span><span class="${success ? "log-ok" : "log-err"}">${success ? ico("check", "ico-sm") : ico("x", "ico-sm")}</span>`;
  timeline.appendChild(div);
  if (wasBottom) scrollToBottom();
}

// ─────────────────────────────────────────────────
// CHAT MODE (IA vs Eu mesmo / self-chat via mailbox)
// ─────────────────────────────────────────────────
let chatMode = "ai"; // "ai" | "self"
let selfMessages = [];
let selfLoaded = false;

const timelineSelf = document.getElementById("timeline-self");
const chatTabAi   = document.getElementById("chat-tab-ai");
const chatTabSelf = document.getElementById("chat-tab-self");

let toastTimer = null;
function showToast(msg, isError = false) {
  let el = document.getElementById("toast-el");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast-el";
    document.body.appendChild(el);
  }
  el.className = isError ? "error" : "";
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = "0"; }, 1800);
}

function buildAttachmentEl(attachment) {
  const isImage = (attachment.mimeType || "").startsWith("image/");
  if (isImage && attachment.filePath) {
    const wrap = document.createElement("div");
    wrap.className = "attachment-image-wrap";

    const img = document.createElement("img");
    img.className = "attachment-image";
    img.src = "file://" + attachment.filePath.replace(/\\/g, "/");
    img.alt = attachment.name;
    wrap.appendChild(img);

    const bar = document.createElement("div");
    bar.className = "attachment-hover-bar";

    const copyBtn = document.createElement("button");
    copyBtn.className = "attachment-btn";
    copyBtn.title = "Copiar";
    copyBtn.innerHTML = ico("copy", "ico-sm");
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try { await window.nx.mailboxCopyImage(attachment.filePath); showToast("Copiado!"); }
      catch { showToast("Falha ao copiar imagem.", true); }
    });

    const dlBtn = document.createElement("button");
    dlBtn.className = "attachment-btn";
    dlBtn.title = "Baixar";
    dlBtn.innerHTML = ico("download", "ico-sm");
    dlBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const result = await window.nx.mailboxSaveAs(attachment.filePath, attachment.name);
        if (result && result.saved) showToast("Salvo!");
      } catch { showToast("Falha ao salvar.", true); }
    });

    bar.appendChild(copyBtn);
    bar.appendChild(dlBtn);
    wrap.appendChild(bar);
    return wrap;
  }

  const el = document.createElement("div");
  el.className = "attachment-file";
  // Bloco 199: sem os caracteres que invertem a direção do texto ("fdp\u202Eexe.pdf" aparecia
  // como "fdpfdp.exe"), o nome mostrado é o nome de verdade.
  const nomeLimpo = String(attachment.name ?? "").replace(/[\u202a-\u202e\u2066-\u2069\u200e\u200f]/g, "");
  el.innerHTML = ico("paperclip", "ico-sm") + `<span>${escHtml(nomeLimpo)}</span>`;
  el.title = "Clique para abrir";
  el.addEventListener("click", () => {
    window.nx.mailboxOpenAttachment(attachment.filePath)
      .then((r) => { if (r && r.aberto === false) showToast("Esse tipo de arquivo não abre direto — mostrei na pasta."); })
      .catch(() => showToast("Falha ao abrir arquivo.", true));
  });
  return el;
}

function renderSelfTimeline() {
  const wasBottom = timelineSelf.scrollHeight - timelineSelf.scrollTop <= timelineSelf.clientHeight + 60;
  timelineSelf.innerHTML = "";
  // 31/10: sem recados, um estado vazio no meio (como o do modo IA) — a área ficava em branco.
  if (!selfMessages.length) {
    timelineSelf.innerHTML = `<div class="self-vazio"><svg class="ico" aria-hidden="true"><use href="#i-smartphone"/></svg><b>Recados com o celular</b><span>O que você escrever aqui aparece no app do celular, e o que mandar de lá aparece aqui. Arquivos também.</span></div>`;
    return;
  }
  selfMessages.forEach(m => {
    const bubble = document.createElement("div");
    bubble.className = "bubble " + (m.from === "pc" ? "user" : "assistant");
    if (m.text) {
      const textEl = document.createElement("div");
      textEl.textContent = m.text;
      bubble.appendChild(textEl);
    }
    if (m.attachment) bubble.appendChild(buildAttachmentEl(m.attachment));
    timelineSelf.appendChild(bubble);
  });
  if (wasBottom) timelineSelf.scrollTo({ top: timelineSelf.scrollHeight, behavior: "smooth" });
}

async function loadSelfThread() {
  try {
    // Sem sessao escolhida, pergunta ao PC qual e a ativa. A thread inteira nao serve
    // mais: era justamente ela, infinita, que fazia a rolagem abrir no meio.
    if (!mailboxSessionId) {
      try { mailboxSessionId = await window.nx.mailboxSessionsActive(); } catch { /* PC sem sessao ainda */ }
    }
    const items = await window.nx.getMailboxThread(mailboxSessionId);
    selfMessages = items || [];
    selfLoaded = true;
    renderSelfTimeline();
  } catch { /* ignore */ }
}

const chatBolhas = document.getElementById("chat-bolhas");

/**
 * Carrega e desenha a fileira. Sorteia no processo principal (`perguntas.ts`), não aqui:
 * é lá que mora a contagem de frequência, e sortear nos dois lugares daria duas heurísticas
 * para manter em par quando o celular pedir as mesmas.
 */
async function carregarBolhasChat() {
  if (!chatBolhas) return;
  // Uma conversa em andamento não precisa de sugestão de partida; a fileira só faz sentido
  // enquanto a tela está em branco.
  if (chatMode !== "ai" || chatMessages.length > 0) { chatBolhas.innerHTML = ""; return; }
  try {
    const lista = await window.nx.chatStarters();
    chatBolhas.innerHTML = (lista ?? [])
      .map(t => `<button class="chat-bolha" data-pergunta="${escHtml(t)}">${escHtml(t)}</button>`)
      .join("");
  } catch { chatBolhas.innerHTML = ""; }
}

chatBolhas?.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-pergunta]");
  if (!b) return;
  const texto = b.dataset.pergunta;
  // Os três passos, e não os dois que as pílulas de histórico faziam: sem o
  // `recordMessage` a mensagem aparece na tela mas não entra na conversa salva.
  addBubble("user", texto);
  recordMessage("me", texto);
  window.nx.chatSend(texto);
  chatBolhas.innerHTML = "";
});

function switchChatMode(mode) {
  if (mode === chatMode) return;
  chatMode = mode;
  chatTabAi.classList.toggle("active", mode === "ai");
  chatTabSelf.classList.toggle("active", mode === "self");
  timeline.classList.toggle("hidden", mode !== "ai");
  timelineSelf.classList.toggle("hidden", mode !== "self");
  cmdInput.placeholder = mode === "ai"
    ? "Converse com a Ely…"
    : "Recado pra você mesmo (aparece no celular)…";
  micBtn.classList.toggle("hidden", mode !== "ai");
  if (mode === "self") {
    document.getElementById("chat-tab-self")?.classList.remove("tem-novidade");
    if (!selfLoaded) loadSelfThread();
  }
  // O popover e compartilhado: trocar de lado troca o que ele lista.
  if (convPop?.classList.contains("aberto")) loadConversations();
  // O polegar segue este atributo, por CSS. Sem medir, sem JS de posição.
  document.querySelector(".chat-switch")?.setAttribute("data-modo", mode);
  document.getElementById("center")?.classList.toggle("modo-self", mode === "self");
  carregarBolhasChat();
}

chatTabAi.addEventListener("click", () => switchChatMode("ai"));
chatTabSelf.addEventListener("click", () => switchChatMode("self"));

window.nx.onMailboxMessage((msg) => {
  // Recado de outra conversa nao entra na thread aberta. Sem esta guarda, abrir uma
  // conversa antiga e receber um recado novo misturaria as duas na tela.
  if (mailboxSessionId && msg?.sessionId && msg.sessionId !== mailboxSessionId) {
    if (convPop?.classList.contains("aberto")) loadConversations();
    return;
  }
  selfMessages.push(msg);
  if (chatMode === "self") renderSelfTimeline();
  if (convPop?.classList.contains("aberto")) loadConversations();
});

/**
 * 31/10: confirmação na própria tela do app, no lugar do `confirm()` do sistema (que destoava
 * do resto e travava a janela inteira). Devolve true no "sim". Esc ou clique fora = não.
 */
function confirmarNaTela(titulo, detalhe = "", rotuloSim = "Confirmar") {
  return new Promise((resolver) => {
    const voltarFoco = document.activeElement;
    const veu = document.createElement("div");
    veu.className = "confirma-veu";
    veu.innerHTML = `<div class="confirma-caixa" role="alertdialog" aria-modal="true" aria-labelledby="confirma-titulo">
      <strong id="confirma-titulo"></strong><p class="confirma-detalhe"></p>
      <div class="confirma-acoes"><button type="button" class="confirma-nao">Cancelar</button><button type="button" class="confirma-sim primario"></button></div></div>`;
    veu.querySelector("#confirma-titulo").textContent = titulo;
    const p = veu.querySelector(".confirma-detalhe");
    if (detalhe) p.textContent = detalhe; else p.remove();
    veu.querySelector(".confirma-sim").textContent = rotuloSim;
    const fechar = (sim) => {
      document.removeEventListener("keydown", tecla, true);
      veu.classList.remove("aberto");
      setTimeout(() => veu.remove(), 180);
      voltarFoco?.focus?.();
      resolver(sim);
    };
    const tecla = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fechar(false); }
      else if (e.key === "Tab") {
        const [nao, sim] = veu.querySelectorAll("button");
        e.preventDefault();
        (document.activeElement === sim ? nao : sim).focus();
      }
    };
    veu.addEventListener("click", (e) => {
      if (e.target === veu || e.target.closest(".confirma-nao")) fechar(false);
      else if (e.target.closest(".confirma-sim")) fechar(true);
    });
    document.addEventListener("keydown", tecla, true);
    document.body.appendChild(veu);
    requestAnimationFrame(() => veu.classList.add("aberto"));
    veu.querySelector(".confirma-sim").focus();
  });
}
