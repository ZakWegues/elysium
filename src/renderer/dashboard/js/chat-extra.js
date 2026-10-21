// dashboard/js/chat-extra.js — o chat do desktop de verdade (bloco 84).
//
// Anexos (arrastar, colar, clipe), ações nas bolhas (copiar, refazer, editar a última
// pergunta), links e botão de copiar nos blocos de código, e busca na conversa (Ctrl+F).
// Vem depois de voz.js e conversas.js: usa `cmdInput`, `chatMode`, `chatMessages`,
// `persistSession`, `recordMessage`, `addBubble`, `timeline` e `appState` deles.

// ─────────────────────────────────────────────────
// ANEXOS
// ─────────────────────────────────────────────────
/**
 * O que está esperando o próximo envio. Imagem vai para a visão (`vision.ask`); texto entra
 * no pedido; qualquer outra coisa só vale no lado "Celular" (vira anexo da Caixa).
 */
let anexosPendentes = [];
const chatAnexos = document.getElementById("chat-anexos");
const anexoInput = document.getElementById("anexo-input");

/**
 * Tetos: 12 mil caracteres (~4 mil tokens) é o que sobra no contexto de 8192 depois do prompt do
 * agente. 21/10: arquivo com caminho (arrastado, escolhido no clipe) vai para a Caixa por cópia em
 * disco, até 500 MB; sem caminho (imagem colada) continua em base64, até 5 MB.
 */
const TETO_TEXTO = 12_000;
const TETO_ARQUIVO = 5 * 1024 * 1024;
const TETO_ARQUIVO_CAMINHO = 500 * 1024 * 1024;
const EXT_TEXTO = /\.(txt|md|markdown|json|csv|tsv|log|ini|cfg|conf|yaml|yml|xml|html?|css|js|mjs|cjs|ts|tsx|jsx|py|java|c|cpp|h|cs|go|rs|rb|php|sh|ps1|bat|sql|toml)$/i;

function tipoDoArquivo(f) {
  if (/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.type)) return "imagem";
  if (f.type.startsWith("text/") || EXT_TEXTO.test(f.name)) return "texto";
  return "arquivo";
}

function lerComo(f, modo) {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => falha(r.error);
    if (modo === "texto") r.readAsText(f); else r.readAsDataURL(f);
  });
}

async function adicionarArquivos(lista) {
  for (const f of lista) {
    const caminho = window.nx.caminhoDoArquivo?.(f) || "";
    if (f.size > (caminho ? TETO_ARQUIVO_CAMINHO : TETO_ARQUIVO)) { showToast(`${f.name}: maior que ${caminho ? "500" : "5"} MB`, true); continue; }
    const tipo = tipoDoArquivo(f);
    try {
      const item = { nome: f.name || "colado.png", tipo, mime: f.type || "application/octet-stream", tamanho: f.size, caminho };
      if (tipo === "texto" && f.size > TETO_ARQUIVO * 4) {
        // Texto enorme: só a Caixa (pelo caminho) — para a Ely não cabe mesmo.
        item.texto = ""; item.cortado = true;
      } else if (tipo === "texto") {
        const t = String(await lerComo(f, "texto"));
        item.texto = t.length > TETO_TEXTO ? t.slice(0, TETO_TEXTO) : t;
        item.cortado = t.length > TETO_TEXTO;
      } else if (caminho && (tipo !== "imagem" || f.size > TETO_ARQUIVO)) {
        // Vídeo, PDF, imagem grande: nada é lido aqui — o PC copia pelo caminho.
      } else {
        item.dataUrl = String(await lerComo(f, "dataUrl"));
        item.base64 = item.dataUrl.split(",")[1] ?? "";
      }
      anexosPendentes.push(item);
    } catch (e) {
      showToast(`Não consegui ler ${f.name}`, true);
    }
  }
  desenharAnexos();
  cmdInput.focus();
}

function desenharAnexos() {
  if (!chatAnexos) return;
  chatAnexos.hidden = !anexosPendentes.length;
  chatAnexos.innerHTML = anexosPendentes.map((a, i) => `
    <span class="anexo-chip" title="${escHtml(a.nome)}">
      ${a.tipo === "imagem" && a.dataUrl ? `<img src="${a.dataUrl}" alt="">` : ico(a.tipo === "texto" ? "file-text" : "paperclip", "ico-sm")}
      <span class="anexo-nome">${escHtml(a.nome)}</span>
      <button type="button" data-tirar-anexo="${i}" title="Tirar">${ico("x", "ico-sm")}</button>
    </span>`).join("");
}

chatAnexos?.addEventListener("click", (e) => {
  const b = e.target.closest("[data-tirar-anexo]");
  if (!b) return;
  anexosPendentes.splice(Number(b.dataset.tirarAnexo), 1);
  desenharAnexos();
});

document.getElementById("anexo-btn")?.addEventListener("click", () => anexoInput?.click());
anexoInput?.addEventListener("change", () => {
  adicionarArquivos([...anexoInput.files]);
  anexoInput.value = "";
});

// Colar imagem (print com Win+Shift+S e Ctrl+V direto na barra).
cmdInput.addEventListener("paste", (e) => {
  const arquivos = [...(e.clipboardData?.files ?? [])];
  if (!arquivos.length) return;
  e.preventDefault();
  adicionarArquivos(arquivos);
});

// Arrastar para qualquer lugar do chat. O contador existe porque dragenter/dragleave
// disparam em cada filho que o ponteiro atravessa.
const centro = document.getElementById("center");
let arrastosDentro = 0;
centro?.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer?.types?.includes("Files")) return;
  e.preventDefault();
  arrastosDentro++;
  centro.classList.add("soltando");
});
centro?.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
centro?.addEventListener("dragleave", () => { if (--arrastosDentro <= 0) { arrastosDentro = 0; centro.classList.remove("soltando"); } });
centro?.addEventListener("drop", (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  arrastosDentro = 0;
  centro.classList.remove("soltando");
  adicionarArquivos([...e.dataTransfer.files]);
});
// Solto fora do chat, o Electron navegaria a janela para o arquivo — a tela sumiria.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

// ─────────────────────────────────────────────────
// ENVIAR (chamado pelo sendText de voz.js)
// ─────────────────────────────────────────────────
/** A última pergunta como foi mandada ao cérebro (com o conteúdo dos arquivos) — é o que o "refazer" reenvia. */
let ultimoEnvio = null;
/** Bolha "user" sendo editada; o próximo envio desfaz o turno dela no cérebro. */
let bolhaEmEdicao = null;

function ocupado() {
  return typeof appState !== "undefined" && (appState === "processing" || appState === "listening");
}

async function enviarMensagem() {
  const texto = cmdInput.value.trim();
  const anexos = anexosPendentes;
  if (!texto && !anexos.length) return;
  if (ocupado()) { showToast("Espere o ELYSIUM terminar."); return; }
  anexosPendentes = [];
  desenharAnexos();
  cmdInput.value = "";
  ajustarAlturaDoCampo();
  if (chatBolhas) chatBolhas.innerHTML = "";

  if (chatMode === "self") return enviarParaCaixa(texto, anexos);

  const imagens = anexos.filter(a => a.tipo === "imagem" && a.base64);
  const textos = anexos.filter(a => a.tipo === "texto");
  const outros = anexos.filter(a => a.tipo === "arquivo" || (a.tipo === "imagem" && !a.base64));
  if (outros.length) showToast(`${outros.map(a => a.nome).join(", ")}: aqui só imagem e texto — mande pelo lado Celular.`, true);

  const refazer = Boolean(bolhaEmEdicao);
  if (bolhaEmEdicao) cortarAPartirDe(bolhaEmEdicao);
  sairDaEdicao();

  if (imagens.length) return perguntarSobreImagem(texto, imagens[0], imagens.length > 1);

  let final = texto;
  for (const a of textos) {
    final += `\n\n[Arquivo ${a.nome}${a.cortado ? ", cortado nos primeiros 12 mil caracteres" : ""}]\n${a.texto}`;
  }
  if (!final.trim()) return;
  const marcas = textos.map(a => `📎 ${a.nome}`).join("  ");
  bolhaDoUsuario(texto, textos);
  recordMessage("me", marcas ? `${texto}${texto ? "\n" : ""}${marcas}` : texto);
  ultimoEnvio = { texto, final };
  window.nx.chatSend(final.trim(), refazer ? { refazer: true } : undefined);
}

function bolhaDoUsuario(texto, anexos) {
  const partes = [];
  if (texto) partes.push(`<div>${escHtml(texto).replace(/\n/g, "<br>")}</div>`);
  for (const a of anexos) {
    partes.push(a.tipo === "imagem"
      ? `<img class="bolha-imagem" src="${a.dataUrl}" alt="${escHtml(a.nome)}">`
      : `<span class="anexo-chip mini">${ico("file-text", "ico-sm")}<span class="anexo-nome">${escHtml(a.nome)}</span></span>`);
  }
  addBubble("user", partes.join(""), true);
}

async function perguntarSobreImagem(texto, img, sobrou) {
  if (sobrou) showToast("Uma imagem por pergunta: usei a primeira.");
  const pergunta = texto || "Descreva esta imagem em português, em poucas frases.";
  bolhaDoUsuario(texto, [img]);
  recordMessage("me", `${texto}${texto ? "\n" : ""}🖼️ ${img.nome}`);
  document.getElementById("chat-vazio")?.remove();
  const bolha = document.createElement("div");
  bolha.className = "bubble assistant escrevendo";
  bolha.textContent = "Olhando a imagem…";
  timeline.appendChild(bolha);
  scrollToBottom();
  try {
    const r = await window.nx.rpc("vision.ask", { imageBase64: img.base64, question: pergunta });
    if (r?.error) throw new Error(r.error);
    const resposta = String(r?.result?.answer ?? "").trim() || "Não consegui ver nada nessa imagem.";
    bolha.classList.remove("escrevendo");
    bolha.innerHTML = renderMarkdown(resposta);
    recordMessage("reply", resposta);
  } catch (e) {
    bolha.remove();
    addBubble("error", `Não consegui olhar a imagem: ${e?.message ?? e}`);
    recordMessage("error", "Não consegui olhar a imagem.");
  }
}

/** Lado "Celular": texto vira recado; arquivos viram anexos da Caixa, um por mensagem. */
async function enviarParaCaixa(texto, anexos) {
  if (!anexos.length) { window.nx.mailboxSend(texto); return; }
  const sessao = typeof mailboxSessionId !== "undefined" ? mailboxSessionId : null;
  let primeiro = true;
  for (const a of anexos) {
    try {
      // Com caminho: o arquivo inteiro, por cópia (até 500 MB; texto não é cortado).
      if (a.caminho && window.nx.mailboxSendPath) await window.nx.mailboxSendPath(primeiro ? texto : "", a.caminho, sessao);
      else await window.nx.mailboxSendFile(primeiro ? texto : "", { name: a.nome, mimeType: a.mime, base64: a.base64 ?? btoa(unescape(encodeURIComponent(a.texto ?? ""))) }, sessao);
      primeiro = false;
    } catch (e) {
      showToast(`${a.nome}: não foi (${e?.message ?? e})`, true);
    }
  }
  showToast(anexos.length === 1 ? "Mandado pro celular." : `${anexos.length} arquivos mandados pro celular.`);
}

// ─────────────────────────────────────────────────
// CAMPO QUE CRESCE
// ─────────────────────────────────────────────────
function ajustarAlturaDoCampo() {
  cmdInput.style.height = "auto";
  // +2 da borda (border-box); rolagem só quando passa do teto, senão a barra aparece à toa.
  const alvo = cmdInput.scrollHeight + 2;
  cmdInput.style.height = Math.min(alvo, 180) + "px";
  cmdInput.style.overflowY = alvo > 180 ? "auto" : "hidden";
}
cmdInput.addEventListener("input", ajustarAlturaDoCampo);

// ─────────────────────────────────────────────────
// AÇÕES NAS BOLHAS
// ─────────────────────────────────────────────────
function ultimaBolha(cls) {
  const todas = timeline.querySelectorAll(`.bubble.${cls}`);
  return todas[todas.length - 1] ?? null;
}

/** Desenha a barrinha na hora do hover: "é a última?" muda a cada mensagem, e custa nada. */
timeline.addEventListener("mouseover", (e) => {
  const b = e.target.closest(".bubble.user, .bubble.assistant");
  if (!b || b.classList.contains("escrevendo") || chatMode !== "ai") return;
  let barra = b.querySelector(":scope > .bolha-acoes");
  if (!barra) { barra = document.createElement("div"); barra.className = "bolha-acoes"; b.appendChild(barra); }
  const ultima = b === ultimaBolha(b.classList.contains("user") ? "user" : "assistant");
  const livre = !ocupado();
  const botoes = [`<button data-bolha="copiar" title="Copiar">${ico("copy", "ico-sm")}</button>`];
  if (ultima && livre && b.classList.contains("assistant") && ultimaBolha("user")) botoes.push(`<button data-bolha="refazer" title="Refazer a resposta">${ico("refresh", "ico-sm")}</button>`);
  if (ultima && livre && b.classList.contains("user")) botoes.push(`<button data-bolha="editar" title="Editar a pergunta">${ico("edit", "ico-sm")}</button>`);
  barra.innerHTML = botoes.join("");
});

timeline.addEventListener("click", async (e) => {
  const link = e.target.closest("a[href]");
  if (link) { e.preventDefault(); window.nx.abrirLink(link.href); return; }

  const copiarCodigo = e.target.closest("[data-copiar-codigo]");
  if (copiarCodigo) {
    const pre = copiarCodigo.closest(".codigo")?.querySelector("pre");
    await copiarTexto(pre?.innerText ?? "");
    copiarCodigo.textContent = "Copiado";
    setTimeout(() => { copiarCodigo.textContent = "Copiar"; }, 1400);
    return;
  }

  const acao = e.target.closest("[data-bolha]");
  if (!acao) return;
  const bolha = acao.closest(".bubble");
  if (acao.dataset.bolha === "copiar") {
    const clone = bolha.cloneNode(true);
    clone.querySelector(".bolha-acoes")?.remove();
    await copiarTexto(clone.innerText.trim());
    // Fase 22: o próprio botão confirma (✓ por 1 s) — o toast fica para quem não olhou.
    acao.innerHTML = ico("check", "ico-sm");
    acao.classList.add("feito");
    setTimeout(() => { acao.innerHTML = ico("copy", "ico-sm"); acao.classList.remove("feito"); }, 1000);
    showToast("Copiado.");
  } else if (acao.dataset.bolha === "refazer") {
    refazerUltima();
  } else if (acao.dataset.bolha === "editar") {
    editarUltima(bolha);
  }
});

// Fase 23: botão direito numa bolha abre um menu (estilo Pinterest): Copiar, Mandar pro
// celular e, quando vale, Refazer/Editar — as mesmas ações da barrinha do hover.
function textoDaBolha(bolha) {
  const clone = bolha.cloneNode(true);
  clone.querySelectorAll(".bolha-acoes, .bolha-ok").forEach(n => n.remove());
  return clone.innerText.trim();
}
function fecharMenuBolha() { document.getElementById("bolha-menu")?.remove(); }
timeline.addEventListener("contextmenu", (e) => {
  const bolha = e.target.closest(".bubble.user, .bubble.assistant");
  if (!bolha || bolha.classList.contains("escrevendo") || window.getSelection()?.toString()) return;
  e.preventDefault();
  fecharMenuBolha();
  const ultima = bolha === ultimaBolha(bolha.classList.contains("user") ? "user" : "assistant");
  const livre = !ocupado();
  const itens = [["copiar", "copy", "Copiar"], ["celular", "smartphone", "Mandar pro celular"]];
  if (bolha.classList.contains("assistant")) itens.push(["ouvir", "volume", "Ouvir"]);
  if (chatMode === "ai" && ultima && livre && bolha.classList.contains("assistant") && ultimaBolha("user")) itens.push(["refazer", "refresh", "Refazer a resposta"]);
  if (chatMode === "ai" && ultima && livre && bolha.classList.contains("user")) itens.push(["editar", "edit", "Editar a pergunta"]);
  const m = document.createElement("div");
  m.id = "bolha-menu"; m.className = "bolha-menu"; m.setAttribute("role", "menu");
  m.innerHTML = itens.map(([id, ic, nome]) => `<button role="menuitem" data-menu-bolha="${id}">${ico(ic, "ico-sm")}<span>${nome}</span></button>`).join("");
  document.body.appendChild(m);
  const L = m.offsetWidth, A = m.offsetHeight;
  m.style.left = `${Math.min(e.clientX, innerWidth - L - 8)}px`;
  m.style.top = `${Math.min(e.clientY, innerHeight - A - 8)}px`;
  m.querySelector("button")?.focus();
  m.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-menu-bolha]");
    if (!b) return;
    fecharMenuBolha();
    const t = textoDaBolha(bolha);
    if (b.dataset.menuBolha === "copiar") { await copiarTexto(t); showToast("Copiado."); }
    else if (b.dataset.menuBolha === "celular") { try { await window.nx.mailboxSend(t); showToast("Mandado para o celular."); } catch { showToast("Não consegui mandar.", true); } }
    else if (b.dataset.menuBolha === "ouvir") window.nx.falarTexto?.(t);
    else if (b.dataset.menuBolha === "refazer") refazerUltima();
    else if (b.dataset.menuBolha === "editar") editarUltima(bolha);
  });
});
document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#bolha-menu")) fecharMenuBolha(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharMenuBolha(); });
timeline.addEventListener("scroll", fecharMenuBolha, { passive: true });

// Fase 22: duplo clique na bolha da Ely copia a resposta (e um ✓ aparece nela por 1 s).
timeline.addEventListener("dblclick", async (e) => {
  const bolha = e.target.closest(".bubble.assistant");
  if (!bolha || bolha.classList.contains("escrevendo") || e.target.closest("a, button, pre, code")) return;
  const clone = bolha.cloneNode(true);
  clone.querySelectorAll(".bolha-acoes, .bolha-ok").forEach(n => n.remove());
  await copiarTexto(clone.innerText.trim());
  window.getSelection()?.removeAllRanges();
  bolha.querySelector(":scope > .bolha-ok")?.remove();
  const ok = document.createElement("span");
  ok.className = "bolha-ok"; ok.setAttribute("aria-hidden", "true"); ok.innerHTML = ico("check", "ico-sm");
  bolha.appendChild(ok);
  setTimeout(() => ok.remove(), 1000);
  showToast("Copiado.");
});

async function copiarTexto(t) {
  try { await navigator.clipboard.writeText(t); }
  catch { await window.nx.rpc("clipboard.set", { text: t }); }
}

/** Tira da tela e da conversa gravada tudo a partir desta bolha (inclusive). */
function cortarAPartirDe(bolha) {
  let n = bolha;
  while (n) { const prox = n.nextElementSibling; if (n.classList?.contains("bubble") || n.classList?.contains("log-card")) n.remove(); n = prox; }
  // Na conversa gravada: a partir da última pergunta ("me").
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].from === "me") { chatMessages.splice(i); break; }
  }
  persistSession();
}

function refazerUltima() {
  const perguntaBolha = ultimaBolha("user");
  if (!perguntaBolha) return;
  // Some só a resposta: a pergunta fica na tela e na conversa.
  let n = perguntaBolha.nextElementSibling;
  while (n) { const prox = n.nextElementSibling; if (n.classList?.contains("bubble") || n.classList?.contains("log-card")) n.remove(); n = prox; }
  while (chatMessages.length && chatMessages[chatMessages.length - 1].from !== "me") chatMessages.pop();
  persistSession();
  const me = chatMessages[chatMessages.length - 1];
  const final = ultimoEnvio && me && me.text.startsWith(ultimoEnvio.texto) ? ultimoEnvio.final : me?.text;
  if (!final) return;
  window.nx.chatSend(final.trim(), { refazer: true });
}

function editarUltima(bolha) {
  sairDaEdicao();
  bolhaEmEdicao = bolha;
  bolha.classList.add("editando");
  const clone = bolha.cloneNode(true);
  clone.querySelectorAll(".bolha-acoes, .anexo-chip, img").forEach(x => x.remove());
  cmdInput.value = clone.innerText.trim();
  cmdInput.placeholder = "Editando a última pergunta — Esc cancela";
  ajustarAlturaDoCampo();
  cmdInput.focus();
}

function sairDaEdicao() {
  bolhaEmEdicao?.classList.remove("editando");
  bolhaEmEdicao = null;
  cmdInput.placeholder = chatMode === "ai" ? "Converse com a Ely…" : cmdInput.placeholder;
}

cmdInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && bolhaEmEdicao) { e.preventDefault(); cmdInput.value = ""; ajustarAlturaDoCampo(); sairDaEdicao(); }
});

// ─────────────────────────────────────────────────
// BUSCA NA CONVERSA (Ctrl+F)
// ─────────────────────────────────────────────────
// CSS Custom Highlight API (Chromium 105+): marca os trechos sem mexer no DOM das bolhas,
// então nada do markdown renderizado quebra e não há o que desfazer ao fechar.
const chatBusca = document.getElementById("chat-busca");
const chatBuscaInput = document.getElementById("chat-busca-input");
const chatBuscaConta = document.getElementById("chat-busca-conta");
let achados = [];
let achadoAtual = -1;

function abrirBuscaNoChat() {
  if (!chatBusca) return;
  chatBusca.hidden = false;
  chatBuscaInput.focus();
  chatBuscaInput.select();
  buscarNoChat();
}
function fecharBuscaNoChat() {
  if (!chatBusca) return;
  chatBusca.hidden = true;
  CSS.highlights?.delete("busca-chat");
  CSS.highlights?.delete("busca-chat-atual");
  achados = []; achadoAtual = -1;
}

function buscarNoChat() {
  const termo = chatBuscaInput.value.trim().toLowerCase();
  achados = [];
  const alvo = chatMode === "self" ? document.getElementById("timeline-self") : timeline;
  if (termo.length >= 2 && alvo) {
    const andar = document.createTreeWalker(alvo, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => n.parentElement?.closest(".bolha-acoes, button") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let n = andar.nextNode(); n; n = andar.nextNode()) {
      const t = n.nodeValue.toLowerCase();
      for (let i = t.indexOf(termo); i !== -1; i = t.indexOf(termo, i + termo.length)) {
        const r = new Range(); r.setStart(n, i); r.setEnd(n, i + termo.length); achados.push(r);
      }
    }
  }
  if (CSS.highlights) CSS.highlights.set("busca-chat", new Highlight(...achados));
  achadoAtual = achados.length ? achados.length - 1 : -1; // começa pelo mais recente
  irParaAchado(0);
}

function irParaAchado(passo) {
  if (!achados.length) {
    chatBuscaConta.textContent = chatBuscaInput.value.trim().length >= 2 ? "nada" : "";
    CSS.highlights?.delete("busca-chat-atual");
    return;
  }
  achadoAtual = (achadoAtual + passo + achados.length) % achados.length;
  const r = achados[achadoAtual];
  if (CSS.highlights) CSS.highlights.set("busca-chat-atual", new Highlight(r));
  r.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
  chatBuscaConta.textContent = `${achadoAtual + 1}/${achados.length}`;
}

chatBuscaInput?.addEventListener("input", buscarNoChat);
chatBuscaInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); irParaAchado(e.shiftKey ? 1 : -1); }
  else if (e.key === "Escape") { e.preventDefault(); fecharBuscaNoChat(); cmdInput.focus(); }
});
document.getElementById("chat-busca-cima")?.addEventListener("click", () => irParaAchado(-1));
document.getElementById("chat-busca-baixo")?.addEventListener("click", () => irParaAchado(1));
document.getElementById("chat-busca-fechar")?.addEventListener("click", fecharBuscaNoChat);

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f"
      && document.getElementById("layout")?.dataset.view === "chat") {
    e.preventDefault();
    abrirBuscaNoChat();
  }
});
