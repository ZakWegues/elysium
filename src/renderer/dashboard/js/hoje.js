// dashboard/js/hoje.js — aba Hoje (fase 16, 07/10).
//
// O briefing do dia no estilo HUD: saudação no tom da Ely, a linha de status ("Sistemas no
// ar. Dois lembretes para hoje…"), hábitos com sequência e mapa de 30 dias, metas, a agenda
// do dia (lembretes, timers, próxima rotina), listas pendentes, alertas do PC e manchetes
// sob demanda. Tudo vem de UMA chamada (`hoje.painel`); hábitos e metas têm RPC próprio para
// marcar/criar. Scripts clássicos: escopo global com os outros arquivos (ver temas.js).

let painelHoje = null;
let tiqueHoje = null;

const hojeEl = () => document.getElementById("view-hoje");

function horaCurta(ms) {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function restante(ms) {
  const s = Math.max(0, Math.round((ms - Date.now()) / 1000));
  const m = Math.floor(s / 60), ss = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
}

/** Anel de progresso em SVG — o "reator" do dia: fração de hábitos feitos. */
function anelHoje(feitos, total) {
  const r = 34, c = 2 * Math.PI * r;
  const f = total ? feitos / total : 0;
  return `<svg class="hoje-anel" viewBox="0 0 84 84" aria-hidden="true">
    <circle cx="42" cy="42" r="${r}" class="hoje-anel-fundo"/>
    <circle cx="42" cy="42" r="${r}" class="hoje-anel-luz" style="stroke-dasharray:${c};stroke-dashoffset:${c * (1 - f)}"/>
  </svg><div class="hoje-anel-num"><b>${feitos}</b><span>/${total}</span></div>`;
}

function desenharHabitos(habitos) {
  if (!habitos.length) {
    return `<div class="hoje-vazio">Nenhum hábito para hoje.<button class="hoje-acao" data-hoje-novo-habito="1">${ico("plus", "ico-sm")}<span>Criar o primeiro</span></button></div>`;
  }
  return habitos.map(h => `
    <div class="hoje-habito${h.feitoHoje ? " feito" : ""}">
      <button class="hoje-check" data-hoje-marcar="${escHtml(h.id)}" data-feito="${h.feitoHoje ? "1" : ""}" title="${h.feitoHoje ? "Desmarcar" : "Marcar como feito"}" aria-pressed="${h.feitoHoje}">${ico("check", "ico-sm")}</button>
      <div class="hoje-habito-meio">
        <div class="hoje-habito-nome" data-hoje-editar-habito="${escHtml(h.id)}">${escHtml(h.nome)}</div>
        <div class="hoje-mapa">${h.mapa.map(d => `<i class="${d === null ? "nao" : d ? "sim" : ""}"></i>`).join("")}</div>
      </div>
      <div class="hoje-seq" title="Sequência atual · recorde ${h.recorde}"><b>${h.sequencia}</b><span>dias</span></div>
    </div>`).join("");
}

function desenharMetas(metas) {
  if (!metas.length) return `<div class="hoje-vazio">Sem metas em andamento.</div>`;
  return metas.map(m => {
    const f = m.alvo ? Math.min(1, m.progresso / m.alvo) : 0;
    return `<div class="hoje-meta">
      <div class="hoje-meta-topo"><span data-hoje-editar-meta="${escHtml(m.id)}">${escHtml(m.titulo)}</span><b>${m.progresso}/${m.alvo}${m.unidade ? ` ${escHtml(m.unidade)}` : ""}</b></div>
      <div class="hoje-barra"><i style="width:${Math.round(f * 100)}%"></i></div>
      <div class="hoje-meta-acoes">
        <button data-hoje-meta="${escHtml(m.id)}" data-delta="-1" title="Tirar 1">−1</button>
        <button data-hoje-meta="${escHtml(m.id)}" data-delta="1" title="Somar 1">+1</button>
        ${m.prazo ? `<small>até ${new Date(m.prazo + "T12:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}</small>` : ""}
      </div>
    </div>`;
  }).join("");
}

function desenharAgenda(p) {
  const itens = [
    ...p.lembretes.map(l => ({ em: l.em, html: `<span class="hoje-hora">${horaCurta(l.em)}</span>${ico("bell", "ico-sm")}<span>${escHtml(l.texto)}</span>` })),
    ...(p.proximaRotina ? [{ em: p.proximaRotina.em, html: `<span class="hoje-hora">${horaCurta(p.proximaRotina.em)}</span>${ico("zap", "ico-sm")}<span>Rotina ${escHtml(p.proximaRotina.nome)}</span>` }] : []),
  ].sort((a, b) => a.em - b.em);
  const timers = p.timers.map(t => `<div class="hoje-linha hoje-timer">${ico("clock", "ico-sm")}<span>${escHtml(t.nome || "Timer")}</span><b data-fim="${t.fimEm}">${restante(t.fimEm)}</b></div>`).join("");
  if (!itens.length && !timers) return `<div class="hoje-vazio">Agenda livre hoje.</div>`;
  return timers + itens.map(i => `<div class="hoje-linha">${i.html}</div>`).join("");
}

function desenharHoje() {
  const el = hojeEl();
  if (!el || !painelHoje) return;
  const p = painelHoje;
  const feitos = p.habitos.filter(h => h.feitoHoje).length;
  el.querySelector("#hoje-saudacao").textContent = p.saudacao;
  el.querySelector("#hoje-data").textContent = p.data;
  el.querySelector("#hoje-frase").textContent = p.frase;
  el.querySelector("#hoje-reator").innerHTML = anelHoje(feitos, p.habitos.length);
  el.querySelector("#hoje-habitos").innerHTML = desenharHabitos(p.habitos);
  el.querySelector("#hoje-metas").innerHTML = desenharMetas(p.metas);
  el.querySelector("#hoje-agenda").innerHTML = desenharAgenda(p);
  el.querySelector("#hoje-clima").innerHTML = p.clima
    ? `<div class="hoje-clima-temp">${Math.round(p.clima.temperatura)}°</div><div><div>${escHtml(p.clima.descricao)}</div><small>${escHtml(p.clima.cidade)} · ${Math.round(p.clima.min)}°–${Math.round(p.clima.max)}°${p.clima.chuvaHoje ? " · chuva hoje" : ""}</small></div>`
    : `<div class="hoje-vazio">Clima indisponível.</div>`;
  el.querySelector("#hoje-listas").innerHTML = p.listas.length
    ? p.listas.map(l => `<div class="hoje-lista"><b>${escHtml(l.nome)}</b> <span class="hoje-cont">${l.pendentes}</span><div>${l.itens.map(escHtml).join(" · ")}</div></div>`).join("")
    : `<div class="hoje-vazio">Nada pendente nas listas.</div>`;
  const alertas = el.querySelector("#hoje-alertas");
  alertas.innerHTML = p.alertas.map(a => `<div class="hoje-alerta ${a.nivel}">${ico("alert", "ico-sm")}<span><b>${escHtml(a.titulo)}</b> — ${escHtml(a.detalhe)}</span></div>`).join("");
  alertas.hidden = !p.alertas.length;
}

async function carregarHoje() {
  try {
    const r = await window.nx.rpc("hoje.painel");
    if (r.result) painelHoje = r.result;
  } catch { /* fica o último */ }
  desenharHoje();
  // Os timers contam ao vivo enquanto a aba está aberta; fora dela, o tique para.
  clearInterval(tiqueHoje);
  tiqueHoje = setInterval(() => {
    if (document.getElementById("layout")?.dataset.view !== "hoje") { clearInterval(tiqueHoje); return; }
    hojeEl()?.querySelectorAll("[data-fim]").forEach(b => { b.textContent = restante(Number(b.dataset.fim)); });
  }, 1000);
}

function formHabito(base = {}) {
  const dias = Array.isArray(base.dias) ? base.dias : [];
  abrirGaveta({
    titulo: base.id ? "Editar hábito" : "Novo hábito", icone: "check", classe: "gaveta-pc",
    html: `<form class="rot-form" id="hoje-form-habito">
      <label>Nome<input type="text" name="nome" value="${escHtml(base.nome ?? "")}" placeholder="Ex.: Academia, Leitura, Água" required autocomplete="off" maxlength="40"></label>
      <label>Dias<small>Nenhum marcado = todo dia. Dia fora da lista não quebra a sequência.</small>
        <div class="rot-dias">${DIAS_CURTOS.map((d, i) => `<button type="button" data-dia="${i}" class="${dias.includes(i) ? "on" : ""}" title="${DIAS_LONGOS[i]}">${d}</button>`).join("")}</div></label>
      <label>Lembrar às<small>Só avisa se ainda não estiver marcado naquele dia. Vazio = sem lembrete.</small>
        <input type="time" name="hora" value="${escHtml(base.horaLembrete ?? "")}"></label>
      <div class="home-acoes">
        <button type="submit" class="principal">${ico("check", "ico-sm")}<span>${base.id ? "Salvar" : "Criar hábito"}</span></button>
        ${base.id ? `<button type="button" data-apagar="1">${ico("trash", "ico-sm")}<span>Apagar</span></button>` : ""}
        <button type="button" data-cancelar="1">${ico("x", "ico-sm")}<span>Cancelar</span></button>
      </div>
    </form>`,
    aoAbrir: (corpo) => {
      const f = corpo.querySelector("form");
      f.querySelectorAll("[data-dia]").forEach(b => b.addEventListener("click", () => b.classList.toggle("on")));
      f.querySelector("[data-cancelar]").addEventListener("click", () => fecharGaveta());
      f.querySelector("[data-apagar]")?.addEventListener("click", async () => {
        const r = await window.nx.rpc("habitos.delete", { id: base.id });
        if (r.cancelado) return;
        fecharGaveta(); showToast("Hábito apagado."); carregarHoje();
      });
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const d = [...f.querySelectorAll("[data-dia].on")].map(b => Number(b.dataset.dia));
        const r = await window.nx.rpc("habitos.save", { id: base.id, nome: f.nome.value, dias: d, horaLembrete: f.hora.value || undefined });
        if (r.error) { showToast(r.error, true); return; }
        fecharGaveta(); showToast(base.id ? "Hábito salvo." : "Hábito criado."); carregarHoje();
      });
    },
  });
}

function formMeta(base = {}) {
  abrirGaveta({
    titulo: base.id ? "Editar meta" : "Nova meta", icone: "star", classe: "gaveta-pc",
    html: `<form class="rot-form" id="hoje-form-meta">
      <label>Meta<input type="text" name="titulo" value="${escHtml(base.titulo ?? "")}" placeholder="Ex.: Ler livros, Guardar para a viagem" required autocomplete="off" maxlength="60"></label>
      <label>Alvo<input type="number" name="alvo" min="1" step="any" value="${base.alvo ?? 10}" style="width:140px" required></label>
      <label>Unidade<small>Opcional: livros, km, reais…</small><input type="text" name="unidade" value="${escHtml(base.unidade ?? "")}" maxlength="16" autocomplete="off"></label>
      <label>Prazo<small>Opcional.</small><input type="date" name="prazo" value="${escHtml(base.prazo ?? "")}"></label>
      <div class="home-acoes">
        <button type="submit" class="principal">${ico("check", "ico-sm")}<span>${base.id ? "Salvar" : "Criar meta"}</span></button>
        ${base.id ? `<button type="button" data-apagar="1">${ico("trash", "ico-sm")}<span>Apagar</span></button>` : ""}
        <button type="button" data-cancelar="1">${ico("x", "ico-sm")}<span>Cancelar</span></button>
      </div>
    </form>`,
    aoAbrir: (corpo) => {
      const f = corpo.querySelector("form");
      f.querySelector("[data-cancelar]").addEventListener("click", () => fecharGaveta());
      f.querySelector("[data-apagar]")?.addEventListener("click", async () => {
        const r = await window.nx.rpc("metas.delete", { id: base.id });
        if (r.cancelado) return;
        fecharGaveta(); showToast("Meta apagada."); carregarHoje();
      });
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const r = await window.nx.rpc("metas.save", { id: base.id, titulo: f.titulo.value, alvo: Number(f.alvo.value), unidade: f.unidade.value, prazo: f.prazo.value || undefined });
        if (r.error) { showToast(r.error, true); return; }
        fecharGaveta(); showToast(base.id ? "Meta salva." : "Meta criada."); carregarHoje();
      });
    },
  });
}

async function buscarManchetes(botao) {
  const caixa = document.getElementById("hoje-manchetes");
  botao.disabled = true;
  caixa.innerHTML = `<div class="hoje-vazio">Varrendo as notícias…</div>`;
  const r = await window.nx.rpc("web.search", { query: "principais notícias do Brasil e do mundo hoje, em tópicos curtos" });
  botao.disabled = false;
  caixa.innerHTML = r.result?.answer ? `<div class="hoje-manchetes-texto">${renderMarkdown(r.result.answer)}</div>` : `<div class="hoje-vazio">${escHtml(r.error ?? "Não consegui buscar agora.")}</div>`;
}

hojeEl()?.addEventListener("click", async (e) => {
  const alvo = (sel) => e.target.closest(sel);
  const marcar = alvo("[data-hoje-marcar]");
  if (marcar) {
    marcar.disabled = true;
    const r = await window.nx.rpc("habitos.marcar", { id: marcar.dataset.hojeMarcar, feito: !marcar.dataset.feito });
    if (r.error) showToast(r.error, true);
    else if (!marcar.dataset.feito) showToast(`${r.result.habito.nome}: ${r.result.habito.sequencia} 🔥`);
    carregarHoje();
    return;
  }
  const meta = alvo("[data-hoje-meta]");
  if (meta) {
    const r = await window.nx.rpc("metas.progresso", { id: meta.dataset.hojeMeta, delta: Number(meta.dataset.delta) });
    if (r.error) showToast(r.error, true);
    else if (r.result.meta.concluidaEm && Number(meta.dataset.delta) > 0) showToast(`Meta concluída: ${r.result.meta.titulo}.`);
    carregarHoje();
    return;
  }
  if (alvo("[data-hoje-novo-habito]")) { formHabito(); return; }
  if (alvo("[data-hoje-nova-meta]")) { formMeta(); return; }
  const eh = alvo("[data-hoje-editar-habito]");
  if (eh) { formHabito(painelHoje?.habitos.find(h => h.id === eh.dataset.hojeEditarHabito) ?? {}); return; }
  const em = alvo("[data-hoje-editar-meta]");
  if (em) { formMeta(painelHoje?.metas.find(m => m.id === em.dataset.hojeEditarMeta) ?? {}); return; }
  if (alvo("#hoje-ler")) { window.nx.chatSend("me dá o resumo do dia"); showToast("Lendo o briefing…"); return; }
  if (alvo("#hoje-recarregar")) { carregarHoje(); return; }
  const mc = alvo("#hoje-btn-manchetes");
  if (mc) { buscarManchetes(mc); return; }
});
