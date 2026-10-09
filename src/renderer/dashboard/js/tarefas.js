// dashboard/js/tarefas.js — tarefas em tela cheia no PC (fase 18, 08/10).
//
// O painel "Lembretes e tarefas" do Hoje ganhou um "⤢ Tela cheia": a lista inteira agrupada
// como no Todoist (Atrasadas / Hoje / Amanhã / Próximos / Sem data / Feitas), com busca,
// filtro, quick add com prévia do que a Ely entendeu, adiar, estrela, editar numa gaveta e
// "Desfazer" ao concluir. Teclado: N nova, ↑/↓ escolhe, Espaço conclui, Enter edita,
// Delete apaga, Esc fecha. Scripts clássicos: escopo global — nomes com prefixo tc/tarefasCheia.

let tcTodas = [];
let tcFiltro = "abertas";
let tcBusca = "";
let tcSelecionada = null;
let tcDesfazer = null;

const tcEl = () => document.getElementById("tarefas-cheia");
const TC_DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function tcInicioDoDia(ms) { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
function tcFimDoPrazo(t) { return t.prazo === undefined ? undefined : t.semHora ? tcInicioDoDia(t.prazo) + 86_400_000 - 1 : t.prazo; }
function tcAtrasada(t, agora = Date.now()) { const f = tcFimDoPrazo(t); return !t.feita && f !== undefined && f < agora; }

/** "hoje 16:00", "amanhã · dia todo", "sáb 10:00", "25/10 09:00" — igual ao celular. */
function tcQuando(ms, semHora) {
  const d = new Date(ms);
  const dias = Math.round((tcInicioDoDia(ms) - tcInicioDoDia(Date.now())) / 86_400_000);
  const hora = semHora ? "dia todo" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const sep = semHora ? " · " : " ";
  if (dias === 0) return `hoje${sep}${hora}`;
  if (dias === 1) return `amanhã${sep}${hora}`;
  if (dias === -1) return `ontem${sep}${hora}`;
  if (dias > 1 && dias < 7) return `${TC_DIAS[d.getDay()]}${sep}${hora}`;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}${sep}${hora}`;
}

function tcAgrupar(ts) {
  const hoje = tcInicioDoDia(Date.now()), amanha = hoje + 86_400_000, depois = amanha + 86_400_000;
  const g = { atrasadas: [], hoje: [], amanha: [], proximos: [], semData: [], feitas: [] };
  for (const t of ts) {
    if (t.feita) g.feitas.push(t);
    else if (t.prazo === undefined) g.semData.push(t);
    else if (tcAtrasada(t)) g.atrasadas.push(t);
    else if (t.prazo < amanha) g.hoje.push(t);
    else if (t.prazo < depois) g.amanha.push(t);
    else g.proximos.push(t);
  }
  const ordem = (a, b) => (a.prioridade === "alta" ? 0 : 1) - (b.prioridade === "alta" ? 0 : 1) || (a.prazo ?? Infinity) - (b.prazo ?? Infinity) || a.criadaEm - b.criadaEm;
  const titulos = { atrasadas: "Atrasadas", hoje: "Hoje", amanha: "Amanhã", proximos: "Próximos", semData: "Sem data", feitas: "Feitas" };
  return Object.keys(g).filter(k => g[k].length).map(k => ({ chave: k, titulo: titulos[k], itens: k === "feitas" ? g[k].sort((a, b) => (b.feitaEm ?? 0) - (a.feitaEm ?? 0)) : g[k].sort(ordem) }));
}

function tcVisiveis() {
  const sem = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = sem(tcBusca.trim());
  return tcTodas
    .filter(t => tcFiltro === "todas" || (tcFiltro === "feitas" ? t.feita : !t.feita))
    .filter(t => !q || sem(`${t.texto} ${t.ressalva ?? ""}`).includes(q));
}

function tcDesenhar() {
  const el = tcEl();
  if (!el) return;
  const grupos = tcAgrupar(tcVisiveis());
  const lista = el.querySelector("#tc-lista");
  el.querySelectorAll("[data-tc-filtro]").forEach(b => b.classList.toggle("on", b.dataset.tcFiltro === tcFiltro));
  if (!grupos.length) {
    lista.innerHTML = `<div class="hoje-vazio">${tcBusca ? "Nada com esse texto." : tcFiltro === "feitas" ? "Nada concluído nos últimos 30 dias." : 'Lista limpa. Escreva acima — "prova de física sexta 14h" já vira lembrete.'}</div>`;
    return;
  }
  lista.innerHTML = grupos.map(g => `
    <section class="tc-grupo${g.chave === "atrasadas" ? " atrasadas" : ""}">
      <h4>${g.titulo} <span>${g.itens.length}</span>${g.chave === "atrasadas" ? `<button class="hoje-acao" data-tc-reagendar="1">${ico("calendar", "ico-sm")}<span>Reagendar todas</span></button>` : ""}</h4>
      ${g.itens.map(t => `
        <div class="tc-item${t.feita ? " feita" : ""}${t.id === tcSelecionada ? " sel" : ""}" data-tc-id="${escHtml(t.id)}" tabindex="-1" role="listitem">
          <button class="hoje-check" data-tc-check="1" title="${t.feita ? "Reabrir" : "Concluir (com ressalva opcional)"}" aria-pressed="${t.feita}">${ico("check", "ico-sm")}</button>
          <button class="tc-texto" data-tc-editar="1" title="Editar">
            <span>${t.prioridade === "alta" ? "★ " : ""}${escHtml(t.texto)}</span>
            ${t.prazo !== undefined || t.repete ? `<small class="${tcAtrasada(t) ? "late" : ""}">${t.feita && t.feitaEm ? `feita ${tcQuando(t.feitaEm)}` : t.prazo !== undefined ? `${tcAtrasada(t) ? "atrasada · " : ""}${tcQuando(t.prazo, t.semHora)}` : ""}${t.repete ? ` · ↻ ${t.repete === "diaria" ? "todo dia" : "toda semana"}` : ""}</small>` : ""}
            ${t.ressalva ? `<small class="tc-ressalva">✎ ${escHtml(t.ressalva)}</small>` : ""}
          </button>
          <span class="tc-acoes">
            ${t.feita ? "" : `<button data-tc-estrela="1" title="${t.prioridade === "alta" ? "Tirar a estrela" : "Marcar como importante"}" aria-pressed="${t.prioridade === "alta"}">${ico("star", "ico-sm")}</button>
            <button data-tc-adiar="1" title="Adiar">${ico("clock", "ico-sm")}</button>`}
            <button data-tc-apagar="1" title="Apagar">${ico("trash", "ico-sm")}</button>
          </span>
        </div>`).join("")}
    </section>`).join("");
}

async function tcCarregar() {
  const r = await window.nx.rpc("tarefas.list", { filtro: "todas" });
  if (r.error) { tcEl().querySelector("#tc-lista").innerHTML = `<div class="hoje-vazio">${escHtml(r.error)} <button class="hoje-acao" data-tc-recarregar="1">Tentar de novo</button></div>`; return; }
  tcTodas = r.result.tarefas;
  tcDesenhar();
}

async function abrirTarefasCheia() {
  const el = tcEl();
  if (!el) return;
  hojeEl().scrollTop = 0;
  hojeEl().classList.add("tc-aberta");
  el.hidden = false;
  el.classList.add("aberta");
  await tcCarregar();
  el.querySelector("#tc-novo")?.focus();
}

function fecharTarefasCheia() {
  const el = tcEl();
  if (!el || el.hidden) return;
  el.hidden = true;
  el.classList.remove("aberta");
  hojeEl().classList.remove("tc-aberta");
  carregarHoje();
}

function tcAchar(id) { return tcTodas.find(t => t.id === id); }

async function tcAposMudar() { await tcCarregar(); }

async function tcConcluirRapido(t) {
  const r = await window.nx.rpc("tarefas.concluir", { id: t.id });
  if (r.error) { showToast(r.error, true); return; }
  tcMostrarDesfazer(`Concluída: ${t.texto}${r.result.proxima ? " · a próxima já está na lista" : ""}`, async () => { await window.nx.rpc("tarefas.reabrir", { id: t.id }); tcAposMudar(); });
  tcAposMudar();
}

/** "Desfazer" por 5 s, no canto da tela cheia. */
function tcMostrarDesfazer(texto, voltar) {
  const caixa = tcEl().querySelector("#tc-desfazer");
  clearTimeout(tcDesfazer);
  caixa.innerHTML = `<span>${escHtml(texto)}</span><button data-tc-desfazer="1">Desfazer</button>`;
  caixa.hidden = false;
  caixa.onclick = async (e) => { if (!e.target.closest("[data-tc-desfazer]")) return; caixa.hidden = true; clearTimeout(tcDesfazer); await voltar(); };
  tcDesfazer = setTimeout(() => { caixa.hidden = true; }, 5000);
}

function tcMenuAdiar(t, ancora) {
  document.querySelector(".tc-menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "tc-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = [["1h", "Daqui a 1 hora"], ["hoje16", "Hoje às 16h"], ["amanha", "Amanhã"], ["semana", "Semana que vem"]]
    .map(([k, txt]) => `<button role="menuitem" data-para="${k}">${txt}</button>`).join("");
  const r = ancora.getBoundingClientRect();
  menu.style.top = `${r.bottom + 4}px`;
  menu.style.left = `${Math.max(8, r.right - 180)}px`;
  document.body.appendChild(menu);
  menu.querySelector("button").focus();
  const fechar = () => { menu.remove(); document.removeEventListener("mousedown", fora, true); };
  const fora = (e) => { if (!menu.contains(e.target)) fechar(); };
  document.addEventListener("mousedown", fora, true);
  menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); fechar(); ancora.focus(); } });
  menu.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-para]");
    if (!b) return;
    fechar();
    const res = await window.nx.rpc("tarefas.adiar", { id: t.id, para: b.dataset.para });
    if (res.error) { showToast(res.error, true); return; }
    showToast(res.result.mensagem ?? "Adiada.");
    tcAposMudar();
  });
}

function formTarefaCheia(base) {
  const p2 = (n) => String(n).padStart(2, "0");
  const d = base?.prazo !== undefined ? new Date(base.prazo) : null;
  const dia = d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : "";
  const hora = d && !base.semHora ? `${p2(d.getHours())}:${p2(d.getMinutes())}` : "";
  abrirGaveta({
    titulo: base ? "Editar tarefa" : "Nova tarefa", icone: "check", classe: "gaveta-pc",
    html: `<form class="rot-form" id="tc-form">
      <label>Tarefa<input type="text" name="texto" value="${escHtml(base?.texto ?? "")}" maxlength="200" required autocomplete="off"></label>
      <label>Dia<small>Sem hora: aviso às 16h; prova e consulta avisam também na véspera.</small><input type="date" name="dia" value="${dia}"></label>
      <label>Hora<input type="time" name="hora" value="${hora}"></label>
      <label class="tc-check"><input type="checkbox" name="estrela"${base?.prioridade === "alta" ? " checked" : ""}> ★ Importante (vai para o topo)</label>
      <label>Repete<select name="repete">
        <option value="">Não</option><option value="diaria"${base?.repete === "diaria" ? " selected" : ""}>Todo dia</option><option value="semanal"${base?.repete === "semanal" ? " selected" : ""}>Toda semana</option>
      </select></label>
      ${base?.feita ? `<label>Ressalva<textarea name="ressalva" maxlength="300">${escHtml(base.ressalva ?? "")}</textarea></label>` : ""}
      <div class="home-acoes">
        <button type="submit" class="principal">${ico("check", "ico-sm")}<span>${base ? "Salvar" : "Criar"}</span></button>
        <button type="button" data-cancelar="1">${ico("x", "ico-sm")}<span>Cancelar</span></button>
      </div>
    </form>`,
    aoAbrir: (corpo) => {
      const f = corpo.querySelector("form");
      f.texto.focus();
      f.querySelector("[data-cancelar]").addEventListener("click", () => fecharGaveta());
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const quando = f.dia.value ? (f.hora.value ? `${f.dia.value}T${f.hora.value}` : f.dia.value) : (f.hora.value ? `${new Date().toLocaleDateString("sv-SE")}T${f.hora.value}` : null);
        const semHora = !!quando && !f.hora.value;
        let r;
        if (!base) {
          r = await window.nx.rpc("tarefas.criar", { texto: f.texto.value, quando: quando ?? undefined, semHora, prioridade: f.estrela.checked ? "alta" : undefined, repete: f.repete.value || undefined, interpretar: !quando });
        } else {
          const mudouData = quando !== (dia ? (hora ? `${dia}T${hora}` : dia) : null);
          r = await window.nx.rpc("tarefas.editar", {
            id: base.id, texto: f.texto.value,
            ...(mudouData ? { quando, semHora } : {}),
            prioridade: f.estrela.checked ? "alta" : null,
            repete: f.repete.value || null,
            ...(base.feita ? { ressalva: f.ressalva.value } : {}),
          });
        }
        if (r.error) { showToast(r.error, true); return; }
        fecharGaveta();
        showToast(r.result?.mensagem ?? "Salvo.");
        tcAposMudar();
      });
    },
  });
}

function tcSelecionar(id) {
  tcSelecionada = id;
  tcEl().querySelectorAll(".tc-item").forEach(i => i.classList.toggle("sel", i.dataset.tcId === id));
  tcEl().querySelector(`.tc-item[data-tc-id="${CSS.escape(id ?? "")}"]`)?.focus({ preventScroll: false });
}

// ── eventos ──
document.getElementById("hoje-btn-tarefas-cheia")?.addEventListener("click", abrirTarefasCheia);

tcEl()?.addEventListener("click", async (e) => {
  const alvo = (sel) => e.target.closest(sel);
  if (alvo("[data-tc-fechar]")) { fecharTarefasCheia(); return; }
  if (alvo("[data-tc-recarregar]")) { tcCarregar(); return; }
  const f = alvo("[data-tc-filtro]");
  if (f) { tcFiltro = f.dataset.tcFiltro; tcDesenhar(); return; }
  if (alvo("[data-tc-nova]")) { formTarefaCheia(null); return; }
  if (alvo("[data-tc-reagendar]")) {
    const para = await tcPerguntarReagendar();
    if (!para) return;
    const r = await window.nx.rpc("tarefas.reagendarAtrasadas", { para });
    if (r.error) { showToast(r.error, true); return; }
    showToast(`${r.result.reagendadas} reagendada${r.result.reagendadas === 1 ? "" : "s"}.`);
    tcAposMudar();
    return;
  }
  const item = alvo("[data-tc-id]");
  if (!item) return;
  const t = tcAchar(item.dataset.tcId);
  if (!t) return;
  tcSelecionada = t.id;
  if (alvo("[data-tc-check]")) {
    if (t.feita) { await window.nx.rpc("tarefas.reabrir", { id: t.id }); tcAposMudar(); }
    else concluirTarefaComRessalva(t, tcAposMudar);
    return;
  }
  if (alvo("[data-tc-editar]")) { formTarefaCheia(t); return; }
  if (alvo("[data-tc-estrela]")) {
    const r = await window.nx.rpc("tarefas.editar", { id: t.id, prioridade: t.prioridade === "alta" ? null : "alta" });
    if (r.error) showToast(r.error, true);
    tcAposMudar();
    return;
  }
  const ad = alvo("[data-tc-adiar]");
  if (ad) { tcMenuAdiar(t, ad); return; }
  if (alvo("[data-tc-apagar]")) {
    const r = await window.nx.rpc("tarefas.delete", { id: t.id });
    if (r.cancelado) return;
    if (r.error) { showToast(r.error, true); return; }
    showToast("Tarefa apagada.");
    tcAposMudar();
  }
});

/** Para quando vão as atrasadas: uma gaveta curta com três escolhas. */
function tcPerguntarReagendar() {
  return new Promise((ok) => {
    let escolhido = null;
    abrirGaveta({
      titulo: "Reagendar atrasadas", icone: "calendar", classe: "gaveta-pc",
      html: `<div class="hoje-gerenciar">${[["hoje16", "Hoje às 16h"], ["amanha", "Amanhã"], ["semana", "Semana que vem"]].map(([k, t]) => `<button data-para="${k}">${ico("calendar", "ico-sm")}<span>${t}</span><small></small></button>`).join("")}</div>`,
      aoAbrir: (corpo, signal) => corpo.addEventListener("click", (e) => { const b = e.target.closest("[data-para]"); if (b) { escolhido = b.dataset.para; fecharGaveta(); } }, { signal }),
      aoFechar: () => ok(escolhido),
    });
  });
}

// Quick add com prévia (o que a Ely entendeu, antes de gravar).
let tcPreviaTimer = null;
document.getElementById("tc-novo")?.addEventListener("input", (e) => {
  const texto = e.target.value.trim();
  const previa = document.getElementById("tc-previa");
  clearTimeout(tcPreviaTimer);
  if (texto.length < 4) { previa.textContent = ""; return; }
  tcPreviaTimer = setTimeout(async () => {
    const r = await window.nx.rpc("tarefas.interpretar", { texto });
    const i = r.result;
    previa.className = i?.passou ? "tc-previa late" : "tc-previa";
    previa.textContent = !i?.quando ? "" : i.passou ? "Esse horário já passou" : `"${i.texto}" · ${i.rotulo ?? ""}${i.vespera ? " · aviso na véspera 16h" : ""}`;
  }, 400);
});
document.getElementById("tc-form-novo")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const campo = document.getElementById("tc-novo");
  const texto = campo.value.trim();
  if (!texto) return;
  const r = await window.nx.rpc("tarefas.criar", { texto });
  // Horário que já passou volta como erro: o texto fica no campo.
  if (r.error) { showToast(r.error, true); return; }
  campo.value = "";
  document.getElementById("tc-previa").textContent = "";
  showToast(r.result?.mensagem ?? "Anotado.");
  tcAposMudar();
});
document.getElementById("tc-busca")?.addEventListener("input", (e) => { tcBusca = e.target.value; tcDesenhar(); });

// Teclado, só com a tela cheia aberta e o foco fora de um campo de texto.
document.addEventListener("keydown", (e) => {
  const el = tcEl();
  if (!el || el.hidden || document.getElementById("gaveta-veu")?.classList.contains("aberto")) return;
  if (e.key === "Escape") { e.preventDefault(); fecharTarefasCheia(); return; }
  const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
  if (digitando || e.ctrlKey || e.altKey || e.metaKey) return;
  // Espaço e Enter num botão, link ou item de menu são do controle, não da tarefa selecionada.
  const emControle = /^(BUTTON|A)$/.test(document.activeElement?.tagName ?? "") || document.activeElement?.getAttribute("role") === "menuitem";
  if (emControle && (e.key === " " || e.key === "Enter")) return;
  const ids = [...el.querySelectorAll(".tc-item")].map(i => i.dataset.tcId);
  const atual = ids.indexOf(tcSelecionada);
  if (e.key === "n" || e.key === "N") { e.preventDefault(); document.getElementById("tc-novo")?.focus(); return; }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const prox = e.key === "ArrowDown" ? Math.min(ids.length - 1, atual + 1) : Math.max(0, atual - 1);
    if (ids[prox]) tcSelecionar(ids[prox]);
    return;
  }
  const t = tcAchar(tcSelecionada);
  if (!t) return;
  if (e.key === " ") { e.preventDefault(); if (t.feita) window.nx.rpc("tarefas.reabrir", { id: t.id }).then(tcAposMudar); else tcConcluirRapido(t); }
  else if (e.key === "Enter") { e.preventDefault(); formTarefaCheia(t); }
  else if (e.key === "Delete") { e.preventDefault(); el.querySelector(`.tc-item[data-tc-id="${CSS.escape(t.id)}"] [data-tc-apagar]`)?.click(); }
});
