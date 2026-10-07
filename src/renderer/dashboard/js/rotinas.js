// dashboard/js/rotinas.js — aba Rotinas.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// ABA ROTINAS
// ─────────────────────────────────────────────────
//
// Uma rotina é um texto que o ELYSIUM executa numa hora, em certos dias, como se o Zak
// tivesse falado — e a resposta vira notificação no PC e/ou entrega para o celular. O
// serviço mora em src/services/rotinas.ts; aqui é só a tela. Os lembretes da coluna da
// direita reaproveitam o painel da aba PC (mesmo HTML, mesmos ouvintes).

const DIAS_CURTOS = ["D", "S", "T", "Q", "Q", "S", "S"];
const DIAS_LONGOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * Modelos prontos (fase 16): as rotinas que mais se elogiam em assistentes (o "bom dia"
 * da Alexa, o fim de expediente, a hora de dormir). Um toque abre o formulário já
 * preenchido — nada é criado sem o Zak salvar.
 */
const ROTINAS_MODELO = [
  { nome: "Briefing da manhã", texto: "me dá o resumo do dia", hora: "07:30", dias: [1, 2, 3, 4, 5], falar: true, entregar: ["pc", "celular"] },
  { nome: "Fim do expediente", texto: "como foi meu dia? o que ficou pendente nas listas e nos hábitos?", hora: "18:30", dias: [1, 2, 3, 4, 5], entregar: ["pc", "celular"] },
  { nome: "Hora de dormir", texto: "abaixa o volume para 15", hora: "23:00", dias: [], entregar: ["pc"] },
  { nome: "Pausa para água", texto: "me lembra, numa frase curta, de beber um copo de água agora", hora: "15:00", dias: [1, 2, 3, 4, 5], entregar: ["celular"] },
  { nome: "Revisão da semana", texto: "como estão meus hábitos e minhas metas esta semana?", hora: "18:00", dias: [5], falar: true, entregar: ["pc", "celular"] },
];

const ROTINAS_EXEMPLO = [
  { nome: "Bom dia", texto: "como está o tempo hoje?", hora: "07:30", dias: [1, 2, 3, 4, 5], falar: true },
  { nome: "Lembretes do dia", texto: "quais são os meus lembretes de hoje?", hora: "08:00", dias: [] },
  { nome: "Modo trabalho", texto: "roda o preset trabalho", hora: "09:00", dias: [1, 2, 3, 4, 5], entregar: ["pc"] },
  { nome: "Estado do PC", texto: "como está o PC?", hora: "18:00", dias: [] },
  // Por evento (bloco 79): o gatilho substitui a hora.
  { nome: "Celular chegou", texto: "quais são os meus lembretes de hoje?", hora: "00:00", dias: [], gatilho: { tipo: "evento", evento: "celular.conectou" }, entregar: ["celular"] },
  { nome: "PC pesado", texto: "o que está pesando no PC?", hora: "00:00", dias: [], gatilho: { tipo: "evento", evento: "ram.alta", limite: 90 } },
  { nome: "Boa noite", texto: "pausa a música", hora: "00:00", dias: [], gatilho: { tipo: "evento", evento: "pc.ocioso", minutos: 30 }, condicao: "se estiver tocando alguma coisa", entregar: ["pc"] },
];

/** Os gatilhos por evento, com rótulo — mesma tabela de eventos.ts, preenchida pelo rotinas.list. */
let EVENTOS_ROTINA = [];

let rotinasCache = [];

/** "quando o Chrome abrir · a cada 60 min" para o cartão; o PC já manda `quando`. */
function gatilhoTexto(r) {
  if (!r.gatilho || r.gatilho.tipo !== "evento") return null;
  const cada = r.gatilho.cada ?? 60;
  return `${r.quando ?? "por evento"}${cada ? ` · no máximo a cada ${cada >= 60 ? `${Math.round(cada / 60)} h` : `${cada} min`}` : ""}`;
}

function diasTexto(dias) {
  if (!dias?.length || dias.length === 7) return "todos os dias";
  if (dias.length === 5 && [1, 2, 3, 4, 5].every(d => dias.includes(d))) return "dias úteis";
  if (dias.length === 2 && dias.includes(0) && dias.includes(6)) return "fins de semana";
  return dias.map(d => DIAS_LONGOS[d]).join(", ");
}

function desenharModelos() {
  const alvo = document.getElementById("rot-modelos");
  if (!alvo) return;
  // Some o modelo que já virou rotina (mesmo nome): oferecer de novo seria duplicar.
  const nomes = new Set(rotinasCache.map(r => r.nome.toLowerCase()));
  const livres = ROTINAS_MODELO.map((m, i) => ({ m, i })).filter(({ m }) => !nomes.has(m.nome.toLowerCase()));
  alvo.hidden = !livres.length;
  alvo.innerHTML = `<span class="rot-modelos-rotulo">Modelos prontos</span>${livres.map(({ m, i }) => `<button data-modelo="${i}" title="${escHtml(m.texto)}">${ico("plus", "ico-sm")}${escHtml(m.nome)}<small>${escHtml(m.hora)}</small></button>`).join("")}`;
}

function desenharRotinas() {
  desenharModelos();
  const alvo = document.getElementById("rot-lista");
  if (!alvo) return;
  if (!rotinasCache.length) {
    alvo.innerHTML = `<div class="rot-card rot-vazio">Nenhuma rotina ainda. Uma rotina é um pedido que o ELYSIUM faz sozinho na hora marcada — a resposta chega no PC e no celular.
      <div class="gp-chips">${ROTINAS_EXEMPLO.map((r, i) => `<button data-exemplo="${i}">${escHtml(r.nome)} · ${escHtml(r.gatilho ? (EVENTOS_ROTINA.find(e => e.id === r.gatilho.evento)?.rotulo ?? "por evento") : r.hora)}</button>`).join("")}</div></div>`;
    return;
  }
  alvo.innerHTML = rotinasCache.map(r => `
    <div class="rotina${r.ativa ? "" : " pausada"}" data-rotina="${escHtml(r.id)}">
      <div>
        ${gatilhoTexto(r)
          ? `<div class="rotina-hora rotina-evento" title="${escHtml(gatilhoTexto(r))}">${ico(ICONE_EVENTO[r.gatilho.evento] ?? "zap")}</div><div class="rotina-proxima">${escHtml(r.quando ?? "por evento")}</div>`
          : `<div class="rotina-hora">${escHtml(r.hora)}</div><div class="rotina-proxima">${r.ativa && r.proxima ? escHtml(quandoTexto(r.proxima)) : "pausada"}</div>`}
      </div>
      <div style="min-width:0">
        <div class="rotina-nome">${escHtml(r.nome)}
          <span class="rotina-entrega" title="Para onde vai a resposta">${r.entregar.includes("pc") ? ico("monitor", "ico-sm") : ""}${r.entregar.includes("celular") ? ico("smartphone", "ico-sm") : ""}${r.falar ? ico("mic", "ico-sm") : ""}</span>
        </div>
        <div class="rotina-texto" title="${escHtml(r.texto)}">“${escHtml(r.texto)}”</div>
        ${r.condicao ? `<div class="rotina-condicao">${ico("bulb", "ico-sm")}<span>só ${escHtml(r.condicao)}</span></div>` : ""}
        ${gatilhoTexto(r) ? "" : `<div class="rotina-dias" title="${escHtml(diasTexto(r.dias))}">${DIAS_CURTOS.map((d, i) => `<span class="${!r.dias.length || r.dias.includes(i) ? "on" : ""}">${d}</span>`).join("")}</div>`}
        ${r.ultimoResultado ? `<div class="rotina-resultado"><em>última vez, ${escHtml(quandoTexto(r.ultimaExecucao))}</em>${escHtml(r.ultimoResultado)}</div>` : ""}
        ${(r.historico?.length ?? 0) > 1 ? `<details class="rotina-hist"><summary>últimas ${r.historico.length} execuções</summary>${r.historico.map(h => `<div><em>${escHtml(quandoTexto(h.em))}</em> ${escHtml(h.resultado)}</div>`).join("")}</details>` : ""}
      </div>
      <div class="rotina-acoes">
        <label class="cfg-switch" title="${r.ativa ? "Pausar" : "Ativar"}"><input type="checkbox" data-rot-ativa="${escHtml(r.id)}"${r.ativa ? " checked" : ""}><span></span></label>
        <div class="linha">
          <button data-rot-rodar="${escHtml(r.id)}" title="Rodar agora">${ico("play", "ico-sm")}</button>
          <button data-rot-editar="${escHtml(r.id)}" title="Editar">${ico("edit", "ico-sm")}</button>
          <button data-rot-apagar="${escHtml(r.id)}" class="perigo" title="Apagar">${ico("trash", "ico-sm")}</button>
        </div>
      </div>
    </div>`).join("");
}

async function desenharEntregas() {
  const alvo = document.getElementById("rot-entregas");
  if (!alvo) return;
  let lista = [];
  try { lista = (await window.nx.rpc("notify.history")).result?.entregas ?? []; } catch { /* segue */ }
  if (!lista.length) { alvo.innerHTML = `<div class="home-empty">Nada entregue ainda. Lembretes e rotinas com destino "celular" aparecem aqui.</div>`; return; }
  alvo.innerHTML = lista.slice(0, 12).map(e => `
    <div class="entrega">${ico(e.tipo === "lembrete" ? "bell" : e.tipo === "rotina" ? "calendar" : "info", "ico-sm")}
      <div class="entrega-txt"><b>${escHtml(e.titulo)}</b><span title="${escHtml(e.corpo)}">${escHtml(e.corpo)}</span></div>
      <div class="entrega-meta"><i>${escHtml(quandoTexto(e.em))}</i><i class="${e.entregueEm ? "ok" : "pend"}">${e.entregueEm ? "no celular" : "aguardando"}</i></div>
    </div>`).join("");
}

async function desenharLembretesRotinas() {
  const alvo = document.getElementById("rot-lembretes");
  if (!alvo) return;
  alvo.innerHTML = await PAINEIS_PC.lembretes.render();
}

const ICONE_EVENTO = { "celular.conectou": "smartphone", "pc.ocioso": "moon", "pc.voltou": "sun", "app.abriu": "grid", "app.fechou": "x", "cpu.alta": "cpu", "ram.alta": "layers" };

async function carregarRotinas() {
  try {
    const r = (await window.nx.rpc("rotinas.list")).result ?? {};
    rotinasCache = r.rotinas ?? [];
    if (Array.isArray(r.eventos) && r.eventos.length) EVENTOS_ROTINA = r.eventos;
  } catch { rotinasCache = []; }
  desenharRotinas();
  await Promise.all([desenharLembretesRotinas(), desenharEntregas()]);
}

/** Formulário na gaveta. `base` é a rotina a editar ou um exemplo para pré-preencher. */
function abrirFormRotina(base = {}) {
  const dias = Array.isArray(base.dias) ? base.dias : [];
  const g = base.gatilho && base.gatilho.tipo === "evento" ? base.gatilho : null;
  const entregar = base.entregar ?? ["pc", "celular"];
  abrirGaveta({
    titulo: base.id ? "Editar rotina" : "Nova rotina", icone: "calendar", classe: "gaveta-pc",
    html: `<form class="rot-form" id="rot-form" data-id="${escHtml(base.id ?? "")}">
      <label>Nome<input type="text" name="nome" value="${escHtml(base.nome ?? "")}" placeholder="Ex.: Bom dia" required autocomplete="off"></label>
      <label>O que o ELYSIUM faz<small>Escreva como falaria: uma pergunta, um comando, um preset.</small>
        <textarea name="texto" placeholder="Ex.: como está o tempo hoje?" required>${escHtml(base.texto ?? "")}</textarea></label>
      <div class="rot-exemplos gp-chips">${ROTINAS_EXEMPLO.filter((r, i, arr) => arr.findIndex(x => x.texto === r.texto) === i).map(r => `<button type="button" data-exemplo-texto="${ROTINAS_EXEMPLO.indexOf(r)}">${escHtml(r.texto)}</button>`).join("")}</div>
      <label>Quando<small>Numa hora marcada, ou quando algo acontecer no PC.</small>
        <div class="gp-chips rot-quando">
          <button type="button" data-quando="hora" class="${g ? "" : "aceso"}">${ico("clock", "ico-sm")} Numa hora</button>
          <button type="button" data-quando="evento" class="${g ? "aceso" : ""}">${ico("zap", "ico-sm")} Num evento</button>
        </div>
      </label>
      <div class="rot-por-hora"${g ? " hidden" : ""}>
        <label>Hora<input type="time" name="hora" value="${escHtml(g ? "08:00" : (base.hora ?? "08:00"))}"></label>
        <label>Dias<small>Nenhum marcado = todos os dias.</small>
          <div class="rot-dias">${DIAS_CURTOS.map((d, i) => `<button type="button" data-dia="${i}" class="${dias.includes(i) ? "on" : ""}" title="${DIAS_LONGOS[i]}">${d}</button>`).join("")}</div></label>
      </div>
      <div class="rot-por-evento"${g ? "" : " hidden"}>
        <label>Evento
          <select name="evento">${EVENTOS_ROTINA.map(e => `<option value="${escHtml(e.id)}"${g?.evento === e.id ? " selected" : ""}>${escHtml(e.rotulo)}</option>`).join("")}</select>
        </label>
        <label class="rot-so-app"${g && /^app\./.test(g.evento) ? "" : " hidden"}>Qual programa<small>Vazio = qualquer um.</small><input type="text" name="app" value="${escHtml(g?.app ?? "")}" placeholder="Ex.: chrome" autocomplete="off"></label>
        <label class="rot-so-ocioso"${g?.evento === "pc.ocioso" ? "" : " hidden"}>Minutos parado<input type="number" name="minutos" min="1" max="720" value="${g?.minutos ?? 30}" style="width:110px"></label>
        <label class="rot-so-limite"${g && /\.alta$/.test(g.evento) ? "" : " hidden"}>Acima de (%)<input type="number" name="limite" min="50" max="100" value="${g?.limite ?? 90}" style="width:110px"></label>
        <label>Intervalo mínimo entre disparos<small>0 = sem limite.</small><input type="number" name="cada" min="0" max="1440" value="${g?.cada ?? 60}" style="width:110px"> <small>minutos</small></label>
      </div>
      <label>Só se…<small>Uma condição em português; o cérebro olha o PC antes de rodar. Vazio = sempre.</small>
        <input type="text" name="condicao" value="${escHtml(base.condicao ?? "")}" placeholder="Ex.: se o Spotify estiver aberto" autocomplete="off"></label>
      <label>Entregar<div class="rot-opcoes">
        <label class="home-toggle"><input type="checkbox" name="pc"${entregar.includes("pc") ? " checked" : ""}> ${ico("monitor", "ico-sm")} No PC (notificação)</label>
        <label class="home-toggle"><input type="checkbox" name="celular"${entregar.includes("celular") ? " checked" : ""}> ${ico("smartphone", "ico-sm")} No celular</label>
        <label class="home-toggle"><input type="checkbox" name="falar"${base.falar ? " checked" : ""}> ${ico("mic", "ico-sm")} Falar no PC</label>
      </div></label>
      <div class="home-acoes">
        <button type="submit" class="principal">${ico("check", "ico-sm")}<span>${base.id ? "Salvar" : "Criar rotina"}</span></button>
        <button type="button" data-rot-cancelar="1">${ico("x", "ico-sm")}<span>Cancelar</span></button>
      </div>
    </form>`,
  });
}

document.getElementById("view-rotinas")?.addEventListener("click", async (e) => {
  const alvo = (sel) => e.target.closest(sel);
  if (alvo("#rot-nova")) { abrirFormRotina(); return; }
  const mod = alvo("[data-modelo]");
  if (mod) { abrirFormRotina(ROTINAS_MODELO[Number(mod.dataset.modelo)]); return; }
  const ex = alvo("[data-exemplo]");
  if (ex) { abrirFormRotina(ROTINAS_EXEMPLO[Number(ex.dataset.exemplo)]); return; }

  const rodar = alvo("[data-rot-rodar]");
  if (rodar) {
    rodar.disabled = true;
    showToast("Rodando…");
    try { const r = await window.nx.rpc("rotinas.run", { id: rodar.dataset.rotRodar }); showToast(r.result?.resultado ?? "Feito."); }
    catch (err) { showToast(err?.message || "Não deu certo.", true); }
    finally { rodar.disabled = false; carregarRotinas(); }
    return;
  }
  const editar = alvo("[data-rot-editar]");
  if (editar) { abrirFormRotina(rotinasCache.find(r => r.id === editar.dataset.rotEditar) ?? {}); return; }
  const apagar = alvo("[data-rot-apagar]");
  if (apagar) {
    try { await window.nx.rpc("rotinas.delete", { id: apagar.dataset.rotApagar }); showToast("Rotina apagada."); carregarRotinas(); }
    catch { showToast("Não consegui apagar.", true); }
    return;
  }
  // Lembretes da coluna da direita: mesmos botões do painel da aba PC.
  if (alvo("#rot-lembretes")) {
    await PAINEIS_PC.lembretes.clique(e);
    if (alvo("[data-cancelar]")) desenharLembretesRotinas();
  }
});

document.getElementById("view-rotinas")?.addEventListener("change", async (e) => {
  const t = e.target.closest("[data-rot-ativa]");
  if (!t) return;
  try { await window.nx.rpc("rotinas.toggle", { id: t.dataset.rotAtiva, ativa: t.checked }); carregarRotinas(); }
  catch { showToast("Não consegui alterar.", true); }
});

document.getElementById("view-rotinas")?.addEventListener("submit", async (e) => {
  if (e.target.id !== "gp-lembrete") return;
  await PAINEIS_PC.lembretes.submit(e);
  desenharLembretesRotinas();
});

// O formulário vive na gaveta: dias, exemplos, cancelar e gravar.
document.getElementById("gaveta-corpo")?.addEventListener("click", (e) => {
  const form = e.target.closest("#rot-form");
  if (!form) return;
  const dia = e.target.closest("[data-dia]");
  if (dia) { dia.classList.toggle("on"); return; }
  const quando = e.target.closest("[data-quando]");
  if (quando) {
    form.querySelectorAll("[data-quando]").forEach(b => b.classList.toggle("aceso", b === quando));
    form.querySelector(".rot-por-hora").hidden = quando.dataset.quando !== "hora";
    form.querySelector(".rot-por-evento").hidden = quando.dataset.quando !== "evento";
    return;
  }
  const ex = e.target.closest("[data-exemplo-texto]");
  if (ex) { form.texto.value = ROTINAS_EXEMPLO[Number(ex.dataset.exemploTexto)].texto; return; }
  if (e.target.closest("[data-rot-cancelar]")) fecharGaveta();
});

// O evento escolhido decide quais campos aparecem (programa, minutos, limite).
document.getElementById("gaveta-corpo")?.addEventListener("change", (e) => {
  const sel = e.target.closest("#rot-form select[name=evento]");
  if (!sel) return;
  const form = sel.closest("#rot-form");
  form.querySelector(".rot-so-app").hidden = !/^app\./.test(sel.value);
  form.querySelector(".rot-so-ocioso").hidden = sel.value !== "pc.ocioso";
  form.querySelector(".rot-so-limite").hidden = !/\.alta$/.test(sel.value);
});

document.getElementById("gaveta-corpo")?.addEventListener("submit", async (e) => {
  const form = e.target.closest("#rot-form");
  if (!form) return;
  e.preventDefault();
  const entregar = [form.pc.checked ? "pc" : null, form.celular.checked ? "celular" : null].filter(Boolean);
  const porEvento = form.querySelector("[data-quando='evento']")?.classList.contains("aceso");
  const dados = {
    id: form.dataset.id || undefined,
    nome: form.nome.value, texto: form.texto.value, hora: porEvento ? "00:00" : (form.hora.value || "08:00"),
    dias: porEvento ? [] : [...form.querySelectorAll("[data-dia].on")].map(b => Number(b.dataset.dia)),
    entregar: entregar.length ? entregar : ["pc"],
    falar: form.falar.checked,
    condicao: form.condicao.value.trim() || undefined,
    gatilho: porEvento ? {
      tipo: "evento", evento: form.evento.value,
      app: form.app.value.trim() || undefined,
      minutos: Number(form.minutos.value) || undefined,
      limite: Number(form.limite.value) || undefined,
      cada: form.cada.value === "" ? undefined : Number(form.cada.value),
    } : undefined,
  };
  try {
    await window.nx.rpc("rotinas.save", dados);
    fecharGaveta();
    showToast(dados.id ? "Rotina salva." : "Rotina criada.");
    carregarRotinas();
    if (dadosInicio.rotinas) atualizarInicio();
  } catch (err) { showToast(err?.message || "Não consegui salvar.", true); }
});

// Uma rotina que acabou de rodar (pelo tique do main) atualiza a lista se a aba estiver aberta.
window.nx.onRotinaExecutada?.(() => { if (layoutEl.getAttribute("data-view") === "rotinas") carregarRotinas(); });

const gavetaCorpoEl = document.getElementById("gaveta-corpo");
gavetaCorpoEl?.addEventListener("click", (e) => { if (painelPcAberto) PAINEIS_PC[painelPcAberto]?.clique?.(e); });
gavetaCorpoEl?.addEventListener("input", (e) => { if (painelPcAberto) PAINEIS_PC[painelPcAberto]?.input?.(e); });
gavetaCorpoEl?.addEventListener("submit", (e) => { if (painelPcAberto) PAINEIS_PC[painelPcAberto]?.submit?.(e); });
