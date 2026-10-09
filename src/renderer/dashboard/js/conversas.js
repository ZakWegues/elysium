// dashboard/js/conversas.js — conversas salvas e conversas da Caixa.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// CONVERSAS SALVAS
// ─────────────────────────────────────────────────
// A timeline sempre foi só DOM — não havia lista de mensagens em lugar nenhum, então
// nada sobrevivia a fechar a janela. Esta lista é a fonte da verdade do que é gravado.
let chatMessages  = [];
let chatSessionId = null;

const convList = document.getElementById("conv-list");

function recordMessage(from, text) {
  // Só a conversa com a IA vira sessão. O modo "Eu mesmo" é a caixa de recados, que
  // já tem persistência própria no mailbox.
  if (chatMode !== "ai") return;

  chatMessages.push({
    id: `${from}-${Date.now()}-${chatMessages.length}`,
    from, text, ts: Date.now(),
  });
  persistSession();
}

async function persistSession() {
  if (chatMessages.length === 0) return;
  try {
    const saved = await window.nx.chatSessionsSave(chatSessionId, chatMessages);
    if (saved) chatSessionId = saved.id;
    // A lista virou popover: só vale redesenhar se ele estiver aberto na hora.
    if (convPop?.classList.contains("aberto")) loadConversations();
  } catch (e) {
    console.error("[conversas] falha ao gravar:", e);
  }
}

function relativeTime(ts) {
  const minutes = Math.round((Date.now() - ts) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.round(hours / 24)}d atrás`;
}

/**
 * O popover e UM so, e o que ele lista depende do lado do switch. Manter duas listas,
 * dois popovers e duas telas de historico seria a mesma feature em dois lugares.
 */
function loadConversations() {
  const titulo = document.querySelector("#conv-pop .pop-titulo");
  if (titulo) titulo.textContent = chatMode === "self" ? "Conversas da Caixa" : "Conversas salvas";
  return chatMode === "self" ? loadMailboxSessions() : loadChatConversations();
}

async function loadChatConversations() {
  let sessions = [];
  try { sessions = await window.nx.chatSessionsList(); }
  catch (e) { console.error("[conversas] falha ao listar:", e); }

  convList.replaceChildren();

  if (sessions.length === 0) {
    const empty = document.createElement("div");
    empty.id = "conv-empty";
    empty.textContent = "Nenhuma conversa salva ainda.";
    convList.appendChild(empty);
    return;
  }

  for (const s of sessions) {
    const item = document.createElement("div");
    item.className = "conv-item" + (s.id === chatSessionId ? " conv-active" : "");

    const body = document.createElement("div");
    body.className = "conv-body";

    const title = document.createElement("div");
    title.className = "conv-title";
    // textContent, nunca innerHTML: o título vem do que o usuário digitou.
    title.textContent = s.title;

    const meta = document.createElement("div");
    meta.className = "conv-meta";
    meta.textContent = `${s.messages.length} mensagens · ${relativeTime(s.updatedAt)}`;

    body.append(title, meta);
    body.addEventListener("click", () => openConversation(s.id));

    const star = document.createElement("button");
    star.className = "conv-act" + (s.favorite ? " on" : "");
    star.innerHTML = ico("star", "ico-sm");
    star.classList.toggle("on", !!s.favorite);
    star.title = s.favorite ? "Desfavoritar" : "Favoritar (nunca é apagada sozinha)";
    star.addEventListener("click", async (e) => {
      e.stopPropagation();
      await window.nx.chatSessionsFavorite(s.id);
      loadConversations();
    });

    // Renomear existe nos dois lados do switch, com o mesmo ícone e a mesma edição no
    // lugar. Era o único verbo que só a Caixa tinha.
    const ren = document.createElement("button");
    ren.className = "conv-act";
    ren.innerHTML = ico("edit", "ico-sm");
    ren.title = "Renomear";
    ren.addEventListener("click", (e) => {
      e.stopPropagation();
      renomearNaLista(title, s, window.nx.chatSessionsRename);
    });

    const del = document.createElement("button");
    del.className = "conv-act del";
    del.innerHTML = ico("x", "ico-sm");
    del.title = "Apagar";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      // Fase 20 (bloco 201): pelo RPC, que pergunta antes (o IPC antigo apagava sem perguntar).
      const r = await window.nx.rpc("chat.delete", { id: s.id });
      if (r?.cancelado) return;
      if (r?.error) { showToast(r.error, true); return; }
      if (s.id === chatSessionId) startNewConversation();
      loadConversations();
    });

    item.append(body, ren, star, del);
    convList.appendChild(item);
  }
}

async function openConversation(id) {
  const session = await window.nx.chatSessionsGet(id);
  if (!session) return;

  chatSessionId = session.id;
  chatMessages  = session.messages.slice();

  if (chatMode !== "ai") switchChatMode("ai");
  timeline.replaceChildren();
  for (const m of chatMessages) {
    if (m.from === "me")        addBubble("user", m.text);
    else if (m.from === "error") addBubble("error", m.text);
    else                         addBubble("assistant", renderMarkdown(m.text), true);
  }
  scrollToBottom();

  // O cérebro tem o próprio contexto volátil, que não corresponde ao que acabou de ser
  // carregado. Limpar evita ele responder com base numa conversa que não está à vista.
  window.nx.chatClear();
  loadConversations();
  showToast("Conversa carregada");
}

function startNewConversation() {
  chatSessionId = null;
  chatMessages  = [];
  timeline.replaceChildren();
  window.nx.chatClear();
  loadConversations();
}

document.getElementById("conv-new-btn").addEventListener("click", () => {
  if (chatMode === "self") { startNewMailboxSession(); return; }
  startNewConversation();
  showToast("Nova conversa");
});


// ─────────────────────────────────────────────────
// CONVERSAS DA CAIXA (lado PC do switch)
// ─────────────────────────────────────────────────
//
// 🔴 O MESMO POPOVER SERVE OS DOIS LADOS. O botão de relógio já mora na faixa do switch;
// o que ele lista depende do `chatMode`. Uma segunda lista, com um segundo popover e uma
// segunda tela de histórico, seria a mesma feature mantida em dois lugares — foi o que o
// bloco 43 evitou no celular e vale igual aqui.
//
// A diferença real entre os dois lados é onde o conteúdo mora: a conversa da IA é gravada
// pelo renderer, e a da Caixa já está no `mailboxStore` (ela chega pelo servidor da 4200).
// Por isso aqui só se troca de sessão e se recarrega a thread — não há o que "salvar".
let mailboxSessionId = null;

async function loadMailboxSessions() {
  let sessions = [];
  try { sessions = await window.nx.mailboxSessionsList(); }
  catch (e) { console.error("[caixa] falha ao listar conversas:", e); }

  convList.replaceChildren();

  if (sessions.length === 0) {
    const empty = document.createElement("div");
    empty.id = "conv-empty";
    empty.textContent = "Nenhuma conversa de recados ainda.";
    convList.appendChild(empty);
    return;
  }

  for (const s of sessions) {
    const item = document.createElement("div");
    item.className = "conv-item" + (s.id === mailboxSessionId ? " conv-active" : "");

    const body = document.createElement("div");
    body.className = "conv-body";

    const title = document.createElement("div");
    title.className = "conv-title";
    // textContent, nunca innerHTML: o título é o que o usuário digitou (ou renomeou).
    title.textContent = s.title;

    const meta = document.createElement("div");
    meta.className = "conv-meta";
    meta.textContent = `${s.count} recado${s.count === 1 ? "" : "s"} · ${relativeTime(s.updatedAt)}`;

    body.append(title, meta);
    body.addEventListener("click", () => openMailboxSession(s.id));

    const ren = document.createElement("button");
    ren.className = "conv-act";
    ren.innerHTML = ico("edit", "ico-sm");
    ren.title = "Renomear";
    ren.addEventListener("click", async (e) => {
      e.stopPropagation();
      renomearNaLista(title, s);
    });

    const star = document.createElement("button");
    star.className = "conv-act" + (s.favorite ? " on" : "");
    star.innerHTML = ico("star", "ico-sm");
    star.title = s.favorite ? "Desfavoritar" : "Favoritar (nunca é apagada sozinha)";
    star.addEventListener("click", async (e) => {
      e.stopPropagation();
      await window.nx.mailboxSessionsFavorite(s.id);
      loadConversations();
    });

    const del = document.createElement("button");
    del.className = "conv-act del";
    del.innerHTML = ico("x", "ico-sm");
    del.title = "Apagar (leva os recados e os anexos junto)";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      // Apagar aqui não tem desfazer e ainda remove arquivo do disco. Uma pergunta antes
      // é o equivalente local à confirmação biométrica que o celular paga no RPC.
      // Fase 20: a pergunta agora é a do RPC (a mesma de toda ação que apaga).
      const r = await window.nx.rpc("mailbox.sessions.delete", { id: s.id });
      if (r?.cancelado) return;
      if (r?.error) { showToast(r.error, true); return; }
      if (s.id === mailboxSessionId) {
        mailboxSessionId = null;
        await loadSelfThread();
      }
      loadConversations();
    });

    item.append(body, ren, star, del);
    convList.appendChild(item);
  }
}

/**
 * Renomeia no lugar, sem `prompt()`.
 *
 * O `prompt()` do Chromium é modal do processo inteiro: ele congela o renderer, e com o
 * popover animando por `display` + `allow-discrete` a caixa nativa aparece no meio da
 * transição. Um input no lugar do título resolve os dois.
 */
function renomearNaLista(tituloEl, sessao, renomear = window.nx.mailboxSessionsRename) {
  const input = document.createElement("input");
  input.className = "conv-rename";
  input.value = sessao.title;
  input.maxLength = 60;

  async function confirmar() {
    const novo = input.value.trim();
    input.replaceWith(tituloEl);
    if (!novo || novo === sessao.title) return;
    await renomear(sessao.id, novo);
    loadConversations();
  }

  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") confirmar();
    if (e.key === "Escape") input.replaceWith(tituloEl);
  });
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("blur", confirmar);

  tituloEl.replaceWith(input);
  input.focus();
  input.select();
}

async function openMailboxSession(id) {
  try {
    await window.nx.mailboxSessionsOpen(id);
  } catch (e) {
    console.error("[caixa] falha ao abrir conversa:", e);
    return;
  }
  mailboxSessionId = id;
  if (chatMode !== "self") switchChatMode("self");
  await loadSelfThread();
  loadConversations();
  showToast("Conversa aberta");
}

async function startNewMailboxSession() {
  try {
    const nova = await window.nx.mailboxSessionsCreate();
    mailboxSessionId = nova?.id ?? null;
  } catch (e) {
    console.error("[caixa] falha ao criar conversa:", e);
    return;
  }
  if (chatMode !== "self") switchChatMode("self");
  await loadSelfThread();
  loadConversations();
  showToast("Nova conversa de recados");
}

// O mini-player do Spotify saiu da gaveta: virou o card "Tocando" da tela Início, que
// fala com os mesmos canais `nx.spotify*`. Manter os dois seria manter duas telas em par.
