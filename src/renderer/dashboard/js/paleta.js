// dashboard/js/paleta.js — paleta de comandos e a lupa da barra.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// PALETA DE COMANDOS — Ctrl+K
// ─────────────────────────────────────────────────
//
// O bloco 20 da §19, três fases depois. O índice é montado do que o app já tem — abas,
// ações rápidas, programas do `apps.json`, presets, lembretes, memória, conversas — e
// cada item executa por RPC ou por uma função do próprio dashboard. Nada passa pelo
// modelo, exceto o último item da lista, "Perguntar ao ELYSIUM", que é o que sobra quando
// nada casa: aí o texto vai para o chat como se tivesse sido digitado lá.
//
// A busca é por subsequência com acentos dobrados ("calc" acha "calculadora", "lmbr" acha
// "lembrete"). Pontua mais quem casa no começo e quem casa contíguo, e desempata pela
// ordem dos grupos — ação rápida antes de programa, programa antes de conversa.

const paletaVeu   = document.getElementById("paleta-veu");
const paletaInput = document.getElementById("paleta-input");
const paletaLista = document.getElementById("paleta-lista");

let paletaItens = [];       // índice montado ao abrir
let paletaVisiveis = [];    // o que está na tela, já ordenado
let paletaIndice = 0;       // item selecionado
let paletaAberta = false;

const dobrar = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Pontuação de subsequência; null quando não casa. Menor é melhor. */
function pontuar(consulta, alvo) {
  if (!consulta) return 0;
  const q = dobrar(consulta), t = dobrar(alvo);
  const direto = t.indexOf(q);
  if (direto >= 0) return direto === 0 ? 0 : (t[direto - 1] === " " ? 1 : 2) + direto * 0.01;
  let i = 0, primeiro = -1, ultimo = -1, buracos = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) {
      if (primeiro < 0) primeiro = j;
      if (ultimo >= 0 && j !== ultimo + 1) buracos++;
      ultimo = j; i++;
    }
  }
  if (i < q.length) return null;
  // Subsequência só vale quando as letras estão PERTO: "lmbr" em "lembrete" sim, "calc"
  // espalhado por "prinCipAL projeto do Cliente" não. Sem este teto a paleta devolvia lixo
  // de memória para qualquer consulta de quatro letras.
  if (ultimo - primeiro > q.length * 2 + 1) return null;
  return 5 + buracos * 2 + ultimo * 0.01;
}

/** Realça o trecho que casou. Só para exibição — o texto vem sempre escapado. */
function realcar(texto, consulta) {
  const q = dobrar(consulta);
  if (!q) return escHtml(texto);
  const t = dobrar(texto);
  const direto = t.indexOf(q);
  if (direto >= 0) {
    return escHtml(texto.slice(0, direto)) + "<mark>" + escHtml(texto.slice(direto, direto + q.length)) + "</mark>" + escHtml(texto.slice(direto + q.length));
  }
  let saida = "", i = 0;
  for (let j = 0; j < texto.length; j++) {
    const ch = texto[j];
    if (i < q.length && t[j] === q[i]) { saida += "<mark>" + escHtml(ch) + "</mark>"; i++; }
    else saida += escHtml(ch);
  }
  return saida;
}

const GRUPOS = { modo: "Modos da Ely", ia: "Comandos de IA (texto copiado)", nav: "Ir para", acao: "Ações", app: "Abrir programa", preset: "Presets", lembrete: "Lembretes", memoria: "Memória", conversa: "Conversas", trecho: "Dentro das conversas", recado: "Recados da Caixa", chat: "Perguntar" };
const ORDEM_GRUPOS = ["nav", "acao", "modo", "ia", "preset", "app", "lembrete", "memoria", "conversa", "trecho", "recado", "chat"];

/**
 * Busca no TEXTO das conversas (bloco 133). Vem do PC (`chat.search`) com um respiro
 * depois da digitação; os achados valem só para a consulta que os pediu.
 */
let trechosDaConsulta = { q: "", itens: [] };
let buscaTrechoTimer = null;
function buscarTrechos(q) {
  clearTimeout(buscaTrechoTimer);
  if (q.trim().length < 3) { trechosDaConsulta = { q: "", itens: [] }; return; }
  buscaTrechoTimer = setTimeout(async () => {
    try {
      const r = await window.nx.rpc("chat.search", { q });
      if (paletaInput.value !== q) return;
      trechosDaConsulta = { q, itens: (r.result?.achados ?? []).map(a => ({
        grupo: "trecho", icone: "search", texto: a.trecho,
        sub: `${a.titulo} · ${new Date(a.em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`,
        executar: () => { switchView("chat"); switchChatMode("ai"); openConversation(a.sessaoId); },
      })) };
      desenharPaleta();
    } catch { /* sem trechos */ }
  }, 220);
}

function rpcToast(metodo, params, okMsg) {
  return async () => {
    try {
      const r = await window.nx.rpc(metodo, params);
      // O `cancelado` vem no topo da resposta, não dentro de `result` (ver preload-dashboard).
      if (r.cancelado) return;
      if (r.error) { showToast(r.error, true); return; }
      showToast(r.result?.message ?? okMsg ?? "Feito.");
    } catch (err) { showToast(err?.message || "Não deu certo.", true); }
  };
}

/**
 * Comando de IA sobre o texto copiado (bloco 137): roda, devolve à área de transferência e
 * avisa. Estilo Raycast — copiar, Ctrl+K, "Corrigir", Ctrl+V.
 */
function rodarComandoIa(c) {
  return async () => {
    try {
      const copiado = (await window.nx.rpc("clipboard.get")).result?.text ?? "";
      if (!copiado.trim()) { showToast("Copie um texto antes (Ctrl+C).", true); return; }
      showToast(`${c.nome}…`);
      const r = await window.nx.rpc("comandos.run", { comando: c.id, texto: copiado });
      if (r.error) throw new Error(r.error);
      await window.nx.rpc("clipboard.set", { text: r.result.resultado });
      showToast(`Pronto — ${c.nome.toLowerCase()} na área de transferência (Ctrl+V).`);
    } catch (err) { showToast(err?.message || "Não deu certo.", true); }
  };
}

/** Monta o índice. As fontes remotas falham por conta própria — a paleta abre mesmo assim. */
async function montarIndicePaleta() {
  const itens = [
    { grupo: "nav", icone: "home", texto: "Início", executar: () => switchView("inicio") },
    { grupo: "nav", icone: "message-circle", texto: "Chat com a IA", executar: () => { switchView("chat"); switchChatMode("ai"); } },
    { grupo: "nav", icone: "smartphone", texto: "Recados do celular", executar: () => { switchView("chat"); switchChatMode("self"); } },
    { grupo: "nav", icone: "monitor", texto: "PC", chaves: ["programas", "processos", "energia", "monitor"], executar: () => switchView("pc") },
    { grupo: "nav", icone: "calendar", texto: "Rotinas", chaves: ["automações", "agendar"], executar: () => switchView("rotinas") },
    // Fase 16: a aba Hoje e os atalhos de hábito/meta.
    { grupo: "nav", icone: "sun", texto: "Hoje", chaves: ["briefing", "hábitos", "metas", "resumo do dia"], executar: () => switchView("hoje") },
    { grupo: "acao", icone: "check", texto: "Novo hábito", chaves: ["hábito", "streak", "sequência"], executar: () => { switchView("hoje"); formHabito(); } },
    // Fase 18: tarefas e a revisão da semana pela paleta.
    { grupo: "acao", icone: "layers", texto: "Tarefas em tela cheia", chaves: ["tarefas", "todo", "lista", "afazeres"], executar: () => { switchView("hoje"); abrirTarefasCheia(); } },
    { grupo: "acao", icone: "plus", texto: "Nova tarefa", chaves: ["tarefa", "lembrete", "anotar"], executar: () => { switchView("hoje"); formTarefaCheia(null); } },
    { grupo: "acao", icone: "calendar", texto: "Reagendar tarefas atrasadas", chaves: ["atrasadas", "adiar"], executar: async () => { const r = await window.nx.rpc("tarefas.reagendarAtrasadas", { para: "amanha" }); if (r.error) showToast(r.error, true); else showToast(`${r.result.reagendadas} para amanhã.`); } },
    { grupo: "acao", icone: "calendar", texto: "Revisão da semana", chaves: ["semana", "revisão", "review"], executar: () => { switchView("hoje"); abrirRevisaoSemana(); } },
    { grupo: "acao", icone: "star", texto: "Nova meta", chaves: ["meta", "objetivo"], executar: () => { switchView("hoje"); formMeta(); } },
    { grupo: "nav", icone: "plus", texto: "Nova rotina", executar: () => { switchView("rotinas"); setTimeout(() => abrirFormRotina(), 80); } },
    { grupo: "nav", icone: "settings", texto: "Ajustes", executar: () => switchView("ajustes") },
    { grupo: "nav", icone: "edit", texto: "Nova conversa", executar: () => { switchView("chat"); switchChatMode("ai"); startNewConversation(); } },

    // `chaves` são sinônimos que a busca também aceita — inglês e o jeito falado.
    { grupo: "acao", icone: "monitor", texto: "Tirar print", sub: "PNG na Área de Trabalho", chaves: ["screenshot", "captura de tela"], executar: rpcToast("screen.screenshot") },
    { grupo: "acao", icone: "x", texto: "Bloquear a tela", chaves: ["lock", "travar"], executar: rpcToast("power.control", { operation: "lock" }) },
    { grupo: "acao", icone: "minus", texto: "Suspender o PC", chaves: ["sleep", "dormir"], executar: rpcToast("power.control", { operation: "sleep" }) },
    { grupo: "acao", icone: "refresh", texto: "Reiniciar o PC", perigo: true, sub: "pede confirmação", chaves: ["restart", "reboot"], executar: rpcToast("power.control", { operation: "restart" }) },
    { grupo: "acao", icone: "x", texto: "Desligar o PC", perigo: true, sub: "pede confirmação", chaves: ["shutdown"], executar: rpcToast("power.control", { operation: "shutdown" }) },
    { grupo: "acao", icone: "check", texto: "Cancelar desligamento agendado", executar: rpcToast("power.control", { operation: "cancel" }) },
    { grupo: "acao", icone: "play", texto: "Tocar / pausar", executar: () => window.nx.mediaControl("play") },
    { grupo: "acao", icone: "skip-forward", texto: "Próxima faixa", executar: () => window.nx.mediaControl("skip") },
    { grupo: "acao", icone: "skip-back", texto: "Faixa anterior", executar: () => window.nx.mediaControl("previous") },
    { grupo: "acao", icone: "volume-x", texto: "Mudo", chaves: ["volume mudo", "silenciar", "mute"], executar: rpcToast("volume.set", { level: "mute" }, "Mudo.") },
    { grupo: "acao", icone: "volume", texto: "Aumentar o volume", executar: rpcToast("volume.set", { level: "up" }, "Volume +") },
    { grupo: "acao", icone: "volume-1", texto: "Diminuir o volume", executar: rpcToast("volume.set", { level: "down" }, "Volume −") },
    { grupo: "acao", icone: "clipboard", texto: "Mandar a área de transferência pro celular", executar: async () => {
      try {
        const t = (await window.nx.rpc("clipboard.get")).result?.text ?? "";
        if (!t) { showToast("A área de transferência está vazia."); return; }
        await window.nx.mailboxSend(t); showToast("Mandado para o celular.");
      } catch { showToast("Não consegui mandar.", true); }
    } },
    { grupo: "acao", icone: "sliders", texto: "Personalizar a Início", executar: () => { switchView("inicio"); document.getElementById("home-btn-personalizar")?.click(); } },
  ];

  const fontes = [
    async () => {
      // Fase 20: "mat" acha "Modo Matemática"; com um modo ligado, "Sair do modo" também.
      const r = await window.nx.rpc("modos.list");
      for (const m of r.result?.modos ?? []) {
        itens.push({ grupo: "modo", icone: "layers", texto: `Modo ${m.nome}`, sub: m.resumo, chaves: ["modo", m.id], executar: () => trocarModo(m.id) });
      }
      if (r.result?.ativo) itens.push({ grupo: "modo", icone: "x", texto: "Sair do modo", sub: r.result.ativo.nome, chaves: ["modo normal"], executar: () => trocarModo(null) });
    },
    async () => {
      const r = await window.nx.rpc("comandos.list");
      for (const c of r.result?.comandos ?? []) {
        itens.push({ grupo: "ia", icone: "sparkles", texto: c.nome, sub: "texto copiado", chaves: ["ia", "comando", c.id], executar: rodarComandoIa(c) });
      }
    },
    async () => {
      const r = await window.nx.rpc("apps.list");
      for (const p of agruparCatalogo(r.result?.apps ?? [])) {
        itens.push({ grupo: "app", icone: "grid", texto: p.nome, chaves: p.apelidos, executar: async () => {
          try { await window.nx.rpc("apps.open", { name: p.nome }); showToast(`Abrindo ${p.nome}…`); }
          catch { showToast("Não consegui abrir.", true); }
        } });
      }
    },
    async () => {
      const r = await window.nx.rpc("presets.list");
      for (const p of r.result?.presets ?? []) {
        itens.push({ grupo: "preset", icone: "zap", texto: p.name, sub: p.description || "", executar: rpcToast("presets.run", { name: p.name }, `Rodando ${p.name}…`) });
      }
    },
    async () => {
      const r = await window.nx.rpc("rotinas.list");
      for (const x of r.result?.rotinas ?? []) {
        itens.push({ grupo: "preset", icone: "calendar", texto: `Rodar agora: ${x.nome}`, sub: x.hora, executar: rpcToast("rotinas.run", { id: x.id }, "Rodando…") });
      }
    },
    async () => {
      const r = await window.nx.rpc("reminders.list");
      for (const l of (r.result?.reminders ?? []).filter(x => !x.firedAt)) {
        itens.push({ grupo: "lembrete", icone: "clock", texto: `Cancelar: ${l.text}`, sub: quandoTexto(l.dueAt), executar: rpcToast("reminders.cancel", { id: l.id }, "Lembrete cancelado.") });
      }
    },
    async () => {
      const r = await window.nx.rpc("memory.list");
      for (const f of r.result?.facts ?? []) {
        itens.push({ grupo: "memoria", icone: "bulb", texto: `Esquecer: ${f.text}`, executar: rpcToast("memory.remove", { id: f.id }, "Esquecido.") });
      }
    },
    async () => {
      const sessoes = await window.nx.chatSessionsList();
      for (const s of sessoes.slice(0, 30)) {
        itens.push({ grupo: "conversa", icone: "message-circle", texto: s.title || "Conversa", sub: `${s.messages?.length ?? 0} msgs`, executar: () => { switchView("chat"); openConversation(s.id); } });
      }
    },
    async () => {
      // Recados da Caixa (bloco 92): o link que o celular mandou semana passada. Os 200 mais
      // novos; abrir leva à conversa da Caixa onde ele está.
      const msgs = await window.nx.getMailboxThread(null);
      const recentes = [...(msgs ?? [])].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 200);
      for (const m of recentes) {
        const texto = String(m.text ?? "").trim() || m.attachment?.name || "";
        if (!texto) continue;
        const quando = new Date(m.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        itens.push({
          grupo: "recado", icone: m.attachment ? "paperclip" : "inbox",
          texto: texto.replace(/\s+/g, " ").slice(0, 90),
          sub: `${m.from === "pc" ? "do PC" : "do celular"} · ${quando}`,
          executar: () => { switchView("chat"); switchChatMode("self"); if (m.sessionId) openMailboxSession(m.sessionId); },
        });
      }
    },
  ];
  await Promise.all(fontes.map(f => f().catch(() => {})));
  return itens;
}

function filtrarPaleta(consulta) {
  const q = consulta.trim();
  const achados = [];
  for (const it of paletaItens) {
    const candidatos = [it.texto, ...(it.chaves ?? [])];
    let melhor = null;
    for (const c of candidatos) {
      const p = pontuar(q, c);
      if (p !== null && (melhor === null || p < melhor)) melhor = p;
    }
    if (melhor === null) continue;
    achados.push({ it, p: melhor + ORDEM_GRUPOS.indexOf(it.grupo) * 0.001 });
  }
  // Trechos de dentro das conversas: já casaram no PC, sem passar pela pontuação.
  if (trechosDaConsulta.q === consulta) for (const it of trechosDaConsulta.itens) achados.push({ it, p: 50 + ORDEM_GRUPOS.indexOf(it.grupo) * 0.001 });
  achados.sort((a, b) => a.p - b.p);
  let lista = achados.map(a => a.it);
  // Sem consulta, mostra o essencial: navegação e ações. O catálogo inteiro sem filtro
  // seria uma parede de 40 programas.
  if (!q) lista = lista.filter(it => it.grupo === "nav" || it.grupo === "acao");
  else lista = lista.slice(0, 40);
  if (q.length >= 2) {
    lista.push({ grupo: "chat", icone: "cpu", texto: `Perguntar à Ely: “${q}”`, executar: () => {
      switchView("chat"); switchChatMode("ai");
      addBubble("user", q); recordMessage("me", q); window.nx.chatSend(q);
    } });
  }
  return lista;
}

function desenharPaleta() {
  const q = paletaInput.value;
  paletaVisiveis = filtrarPaleta(q);
  if (paletaIndice >= paletaVisiveis.length) paletaIndice = 0;

  if (paletaVisiveis.length === 0) {
    paletaLista.innerHTML = `<div id="paleta-vazio">Nada com esse nome. Continue escrevendo para perguntar à Ely.</div>`;
    return;
  }
  let html = "", grupoAtual = null;
  paletaVisiveis.forEach((it, i) => {
    if (it.grupo !== grupoAtual) { grupoAtual = it.grupo; html += `<div class="paleta-grupo">${GRUPOS[it.grupo]}</div>`; }
    html += `<div class="paleta-item${i === paletaIndice ? " ativo" : ""}${it.perigo ? " perigo" : ""}" data-i="${i}" role="option" aria-selected="${i === paletaIndice}">
      ${ico(it.icone, "ico-sm")}<span>${it.grupo === "chat" || it.grupo === "trecho" ? escHtml(it.texto) : realcar(it.texto, q)}</span>
      ${it.sub ? `<span class="paleta-sub">${escHtml(it.sub)}</span>` : ""}
    </div>`;
  });
  paletaLista.innerHTML = html;
  paletaLista.querySelector(".paleta-item.ativo")?.scrollIntoView({ block: "nearest" });
}

async function abrirPaleta() {
  if (paletaAberta) return;
  paletaAberta = true;
  paletaInput.value = "";
  paletaIndice = 0;
  paletaItens = [];
  paletaVeu.classList.add("aberto");
  paletaInput.focus();
  desenharPaleta();
  paletaItens = await montarIndicePaleta();
  if (paletaAberta) desenharPaleta();
}

function fecharPaleta() {
  if (!paletaAberta) return;
  paletaAberta = false;
  paletaVeu.classList.remove("aberto");
  paletaInput.blur();
}

async function executarPaleta(i) {
  const it = paletaVisiveis[i];
  if (!it) return;
  fecharPaleta();
  try { await it.executar(); } catch (err) { showToast(err?.message || "Não deu certo.", true); }
}

paletaInput.addEventListener("input", () => { paletaIndice = 0; desenharPaleta(); buscarTrechos(paletaInput.value); });
paletaInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); paletaIndice = Math.min(paletaIndice + 1, paletaVisiveis.length - 1); desenharPaleta(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); paletaIndice = Math.max(paletaIndice - 1, 0); desenharPaleta(); }
  else if (e.key === "Enter") { e.preventDefault(); executarPaleta(paletaIndice); }
  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fecharPaleta(); }
});
paletaLista.addEventListener("click", (e) => {
  const item = e.target.closest(".paleta-item");
  if (item) executarPaleta(Number(item.dataset.i));
});
paletaLista.addEventListener("mousemove", (e) => {
  const item = e.target.closest(".paleta-item");
  if (!item) return;
  const i = Number(item.dataset.i);
  if (i !== paletaIndice) { paletaIndice = i; desenharPaleta(); }
});
paletaVeu.addEventListener("click", (e) => { if (e.target === paletaVeu) fecharPaleta(); });

// A lupa da barra de navegação. Digitar com ela focada abre a paleta já com a letra:
// quem clica numa barra de busca espera poder escrever em seguida, não clicar de novo.
const navBusca = document.getElementById("nav-busca");
navBusca?.addEventListener("click", () => abrirPaleta());
navBusca?.addEventListener("keydown", (e) => {
  if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;
  e.preventDefault();
  // O trecho síncrono de abrirPaleta (limpar, focar, desenhar) já rodou quando ela devolve
  // a promessa; a letra entra antes de o índice chegar e não é apagada por ele.
  abrirPaleta(); paletaInput.value = e.key; paletaIndice = 0; desenharPaleta();
});

// Ctrl+K é LOCAL — o atalho global do app continua sendo o Ctrl+Shift+J, e não se mexe.
// Na captura, para vencer o Escape do popover e o Enter do campo de comando.
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    paletaAberta ? fecharPaleta() : abrirPaleta();
  }
}, true);
