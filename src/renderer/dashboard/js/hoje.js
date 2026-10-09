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

function hojeHoraCurta(ms) {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function hojeRestante(ms) {
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
        <button type="button" class="hoje-habito-nome" data-hoje-editar-habito="${escHtml(h.id)}" title="Editar o hábito">${escHtml(h.nome)}</button>
        <div class="hoje-mapa">${h.mapa.map(d => `<i class="${d === null ? "nao" : d ? "sim" : ""}"></i>`).join("")}</div>
      </div>
      <div class="hoje-seq" title="Sequência atual · recorde ${h.recorde} · força ${h.forca ?? 0}% (cai devagar com faltas)"><b>${h.sequencia}</b><span>dias</span>${h.forca !== undefined ? `<small class="hoje-forca">força ${h.forca}%</small>` : ""}${h.pausadoHoje ? `<small class="hoje-forca">❄ hoje</small>` : ""}</div>
    </div>`).join("");
}

function desenharMetas(metas) {
  if (!metas.length) return `<div class="hoje-vazio">Sem metas em andamento.</div>`;
  return metas.map(m => {
    const f = m.alvo ? Math.min(1, m.progresso / m.alvo) : 0;
    return `<div class="hoje-meta">
      <div class="hoje-meta-topo"><button type="button" class="hoje-meta-nome" data-hoje-editar-meta="${escHtml(m.id)}" title="Editar a meta">${escHtml(m.titulo)}</button><b>${m.progresso}/${m.alvo}${m.unidade ? ` ${escHtml(m.unidade)}` : ""}</b></div>
      <div class="hoje-barra"><i style="width:${Math.round(f * 100)}%"></i></div>
      <div class="hoje-meta-acoes">
        <button data-hoje-meta="${escHtml(m.id)}" data-delta="-1" title="Tirar 1">−1</button>
        <button data-hoje-meta="${escHtml(m.id)}" data-delta="1" title="Somar 1">+1</button>
        ${m.prazo ? `<small>até ${new Date(m.prazo + "T12:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}</small>` : ""}
      </div>
    </div>`;
  }).join("");
}

/**
 * Lembretes e tarefas (fase 17): a lista de afazeres. Pendentes com o prazo ("atrasada" em
 * vermelho), concluídas de hoje riscadas com a ressalva embaixo. Clicar no círculo abre a
 * conclusão com ressalva opcional.
 */
function quandoTarefa(ms) {
  if (!ms) return "";
  const d = new Date(ms), hoje = new Date();
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoje.toDateString()) return `hoje ${hora}`;
  if (d.toDateString() === amanha.toDateString()) return `amanhã ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })} ${hora}`;
}

function desenharTarefasHoje(tarefas) {
  if (!tarefas?.length) return `<div class="hoje-vazio">Nada na lista. Escreva acima, ou diga à Ely "tenho prova sexta" — ela anota e avisa na véspera.</div>`;
  const agora = Date.now();
  return tarefas.map(t => `
    <div class="hoje-tarefa${t.feita ? " feita" : ""}${!t.feita && t.prazo && t.prazo < agora ? " atrasada" : ""}">
      <button class="hoje-check" data-tarefa-check="${escHtml(t.id)}" data-feita="${t.feita ? "1" : ""}" title="${t.feita ? "Reabrir" : "Concluir"}" aria-pressed="${t.feita}">${ico("check", "ico-sm")}</button>
      <div class="hoje-tarefa-meio">
        <div class="hoje-tarefa-texto">${escHtml(t.texto)}</div>
        ${t.ressalva ? `<div class="hoje-ressalva">${ico("edit", "ico-sm")}<span>${escHtml(t.ressalva)}</span></div>` : ""}
      </div>
      <span class="hoje-tarefa-quando">${t.feita ? "feita" : t.prazo ? (t.prazo < agora ? "atrasada · " : "") + quandoTarefa(t.prazo) : ""}</span>
      <button class="hoje-tarefa-x" data-tarefa-apagar="${escHtml(t.id)}" title="Apagar (e cancelar os avisos)">${ico("x", "ico-sm")}</button>
    </div>`).join("");
}

function concluirTarefaComRessalva(t, depois) {
  abrirGaveta({
    titulo: "Concluir", icone: "check", classe: "gaveta-pc",
    html: `<form class="rot-form">
      <div class="hoje-concluir-nome">${escHtml(t.texto)}</div>
      <label>Ressalva<small>Opcional — o que ficou de fora, uma observação. Fica anotado na tarefa.</small>
        <textarea name="ressalva" maxlength="300" placeholder="Ex.: fiz, mas faltou revisar o capítulo 3"></textarea></label>
      <div class="home-acoes">
        <button type="submit" class="principal">${ico("check", "ico-sm")}<span>Concluir</span></button>
        <button type="button" data-cancelar="1">${ico("x", "ico-sm")}<span>Cancelar</span></button>
      </div>
    </form>`,
    aoAbrir: (corpo) => {
      const f = corpo.querySelector("form");
      f.querySelector("textarea").focus();
      f.querySelector("[data-cancelar]").addEventListener("click", () => fecharGaveta());
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const r = await window.nx.rpc("tarefas.concluir", { id: t.id, ressalva: f.ressalva.value.trim() || undefined });
        if (r.error) { showToast(r.error, true); return; }
        fecharGaveta(); showToast("Concluída."); (depois ?? carregarHoje)();
      });
    },
  });
}

function desenharAgendaHoje(p) {
  const itens = [
    ...p.lembretes.map(l => ({ em: l.em, html: `<span class="hoje-hora">${hojeHoraCurta(l.em)}</span>${ico("bell", "ico-sm")}<span>${escHtml(l.texto)}</span>` })),
    ...(p.proximaRotina ? [{ em: p.proximaRotina.em, html: `<span class="hoje-hora">${hojeHoraCurta(p.proximaRotina.em)}</span>${ico("zap", "ico-sm")}<span>Rotina ${escHtml(p.proximaRotina.nome)}</span>` }] : []),
  ].sort((a, b) => a.em - b.em);
  const timers = p.timers.map(t => `<div class="hoje-linha hoje-timer">${ico("clock", "ico-sm")}<span>${escHtml(t.nome || "Timer")}</span><b data-fim="${t.fimEm}">${hojeRestante(t.fimEm)}</b></div>`).join("");
  if (!itens.length && !timers) return "";
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
  el.querySelector("#hoje-tarefas").innerHTML = desenharTarefasHoje(p.tarefas);
  el.querySelector("#hoje-agenda").innerHTML = desenharAgendaHoje(p);
  el.querySelector("#hoje-clima").innerHTML = p.clima
    ? `<div class="hoje-clima-temp">${Math.round(p.clima.temperatura)}°</div><div><div>${escHtml(p.clima.descricao)}</div><small>${escHtml(p.clima.cidade)} · ${Math.round(p.clima.min)}°–${Math.round(p.clima.max)}°${p.clima.chuvaHoje ? " · chuva hoje" : ""}</small></div>`
    : `<div class="hoje-vazio">Clima indisponível.</div>`;
  el.querySelector("#hoje-listas").innerHTML = p.listas.length
    ? p.listas.map(l => `<div class="hoje-lista"><b>${escHtml(l.nome)}</b> <span class="hoje-cont">${l.pendentes}</span><div>${l.itens.map(escHtml).join(" · ")}</div></div>`).join("")
    : `<div class="hoje-vazio">Nada pendente nas listas.</div>`;
  // Fase 18: rotinas do dia, ideia e card ELYSIUM. Treino só quando se pergunta à Ely.
  el.querySelector("#hoje-rotinas").innerHTML = desenharRotinasHoje(p.rotinasHoje ?? [], p.rotinasRodaram ?? []);
  el.querySelector("#hoje-ideia").innerHTML = p.ideia ? `<p>${escHtml(p.ideia)}</p>` : `<div class="hoje-vazio">Sem ideia agora — toque em Outra.</div>`;
  desenharElysiumHoje(p.elysium);
  desenharAmanhaHoje(p.amanha ?? null);
  aplicarSecoesOcultas(p.ocultos ?? []);
  const alertas = el.querySelector("#hoje-alertas");
  alertas.innerHTML = p.alertas.map(a => `<div class="hoje-alerta ${a.nivel}">${ico("alert", "ico-sm")}<span><b>${escHtml(a.titulo)}</b> — ${escHtml(a.detalhe)}</span></div>`).join("");
  alertas.hidden = !p.alertas.length;
  desenharComoFoi(p.acompanhamentos ?? []);
}

/** Bloco 191: "A Ely quer saber" — responder abre o chat com a pergunta; dispensar some. */
function desenharComoFoi(lista) {
  const box = hojeEl()?.querySelector("#hoje-comofoi");
  if (!box) return;
  box.innerHTML = lista.map(a => `<div class="hoje-alerta comofoi">${ico("message-circle", "ico-sm")}<span><b>A Ely quer saber</b> — ${escHtml(a.pergunta)}</span>
    <button class="hoje-acao" data-comofoi-abrir="${escHtml(a.id)}">Responder</button>
    <button class="hoje-acao" data-comofoi-dispensar="${escHtml(a.id)}" title="Não perguntar mais" aria-label="Dispensar a pergunta">${ico("x", "ico-sm")}</button></div>`).join("");
  box.hidden = !lista.length;
}

// ── Fase 18: seções ocultáveis, "Meu amanhã" e revisão da semana ──────────────

const chaveDaSecao = (titulo) => titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Cada painel ganha a chave (pelo título) e o botão de ocultar; os ocultos somem. */
function aplicarSecoesOcultas(ocultos) {
  const el = hojeEl();
  if (!el) return;
  let escondidos = 0;
  el.querySelectorAll(".hoje-grade > .hoje-painel").forEach(sec => {
    const titulo = sec.querySelector("h3")?.textContent?.trim() ?? "";
    const chave = sec.dataset.secao || chaveDaSecao(titulo);
    sec.dataset.secao = chave;
    if (!sec.querySelector("[data-hoje-ocultar]")) {
      sec.querySelector(".hoje-painel-topo")?.insertAdjacentHTML("beforeend", `<button class="hoje-ocultar" data-hoje-ocultar="${chave}" title="Ocultar esta seção (dá para mostrar de novo no fim da página)" aria-label="Ocultar ${escHtml(titulo)}">${ico("x", "ico-sm")}</button>`);
    }
    const oculta = ocultos.includes(chave);
    sec.classList.toggle("oculta", oculta);
    if (oculta) escondidos++;
  });
  let rodape = el.querySelector("#hoje-ocultos");
  if (!rodape) {
    rodape = document.createElement("div");
    rodape.id = "hoje-ocultos";
    rodape.className = "hoje-ocultos";
    el.querySelector(".hoje-grade")?.after(rodape);
  }
  rodape.innerHTML = escondidos ? `<button class="hoje-acao" data-hoje-mostrar-ocultos="1">${ico("eye", "ico-sm")}<span>Mostrar ${escondidos} seç${escondidos === 1 ? "ão oculta" : "ões ocultas"}</span></button>` : "";
}

/** "Meu amanhã": depois das 18h, um painel com o que vem amanhã e o clima. */
function desenharAmanhaHoje(a) {
  const grade = hojeEl()?.querySelector(".hoje-grade");
  if (!grade) return;
  let sec = grade.querySelector("#hoje-sec-amanha");
  if (!a) { sec?.remove(); return; }
  if (!sec) {
    sec = document.createElement("section");
    sec.className = "hoje-painel hoje-largo";
    sec.id = "hoje-sec-amanha";
    sec.dataset.secao = "amanha";
    sec.innerHTML = `<div class="hoje-painel-topo"><h3>Meu amanhã</h3></div><div id="hoje-amanha"></div>`;
    grade.prepend(sec);
  }
  const clima = a.clima ? `<div class="hoje-linha">${ico(a.clima.icone || "sun", "ico-sm")}<span>${Math.round(a.clima.min)}°–${Math.round(a.clima.max)}°</span></div>` : "";
  const tarefas = a.tarefas.length
    ? a.tarefas.map(t => `<div class="hoje-linha">${ico("check", "ico-sm")}<span>${escHtml(t.texto)}</span><b>${t.semHora ? "dia todo" : hojeHoraCurta(t.prazo)}</b></div>`).join("")
    : `<div class="hoje-vazio">Nada marcado para amanhã. Bom momento para escolher a prioridade do dia.</div>`;
  sec.querySelector("#hoje-amanha").innerHTML = clima + tarefas;
}

/**
 * Despejo (bloco 194): várias coisas de uma vez → a Ely separa → ele marca o que fica → salva.
 * Nada é gravado antes do "Salvar". Ditado do Windows (Win+H) funciona no campo.
 */
function abrirDespejo() {
  let itens = [];
  const tipoRotulo = { tarefa: "Tarefa", lista: "Lista", nota: "Nota" };
  const desenharPrevia = (corpo) => {
    const box = corpo.querySelector("#despejo-previa");
    box.innerHTML = itens.length
      ? itens.map(it => `<label class="hoje-linha despejo-item"><input type="checkbox" data-despejo-id="${escHtml(it.id)}" checked>
          <span><small class="hoje-cont">${tipoRotulo[it.tipo] ?? it.tipo}${it.tipo === "lista" ? ` · ${escHtml(it.lista)}` : ""}</small> ${escHtml(it.texto)}</span>
          ${it.rotulo ? `<b>${escHtml(it.rotulo)}</b>` : ""}</label>`).join("")
        + `<div class="home-acoes"><button class="principal" data-despejo-salvar="1">${ico("check", "ico-sm")}<span>Salvar marcados</span></button></div>`
      : "";
  };
  abrirGaveta({
    titulo: "Despejar", icone: "layers", classe: "gaveta-pc",
    html: `<div class="hoje-despejo">
      <p class="gp-nota">Escreva (ou dite com Win+H) tudo de uma vez — "comprar pão e leite, estudar física sexta às 14h, ligar pra vó". A Ely separa; você confere.</p>
      <textarea id="despejo-texto" rows="6" maxlength="4000" placeholder="O que está na sua cabeça…"></textarea>
      <div class="home-acoes"><button class="principal" data-despejo-organizar="1">${ico("sparkles", "ico-sm")}<span>Organizar</span></button></div>
      <div id="despejo-previa"></div>
    </div>`,
    aoAbrir: (corpo) => {
      corpo.querySelector("#despejo-texto")?.focus();
      corpo.addEventListener("click", async (e) => {
        const org = e.target.closest("[data-despejo-organizar]");
        if (org) {
          const texto = corpo.querySelector("#despejo-texto").value.trim();
          if (texto.length < 10) { showToast("Escreva um pouco mais."); return; }
          org.disabled = true;
          const r = await window.nx.rpc("despejo.interpretar", { texto });
          org.disabled = false;
          if (r.error) { showToast(r.error, true); return; }
          itens = r.result.itens ?? [];
          if (!itens.length) showToast("Não consegui separar nada — tente uma coisa por frase.");
          desenharPrevia(corpo);
          return;
        }
        if (e.target.closest("[data-despejo-salvar]")) {
          const marcados = new Set([...corpo.querySelectorAll("[data-despejo-id]:checked")].map(c => c.dataset.despejoId));
          const escolhidos = itens.filter(it => marcados.has(it.id));
          if (!escolhidos.length) { showToast("Nada marcado."); return; }
          const r = await window.nx.rpc("despejo.aplicar", { itens: escolhidos });
          if (r.error) { showToast(r.error, true); return; }
          showToast(r.result.mensagem);
          fecharGaveta();
          carregarHoje();
        }
      });
    },
  });
}

async function abrirRevisaoSemana() {
  const r = await window.nx.rpc("hoje.revisao");
  if (r.error) { showToast(r.error, true); return; }
  const v = r.result;
  abrirGaveta({
    titulo: "Revisão da semana", icone: "calendar", classe: "gaveta-pc",
    html: `<div class="hoje-revisao">
      <p>${escHtml(v.texto)}</p>
      ${v.habitos.length ? `<h4 class="hoje-sub">Hábitos</h4>${v.habitos.map(h => `<div class="hoje-linha"><span>${escHtml(h.nome)}</span><b>${h.feitos}/${h.dias} · força ${h.forca}%</b></div>`).join("")}` : ""}
      ${v.atrasadas.length ? `<h4 class="hoje-sub">Atrasadas</h4>${v.atrasadas.map(x => `<div class="hoje-linha"><span>${escHtml(x)}</span></div>`).join("")}` : ""}
      <div class="home-acoes"><button class="principal" data-revisao-ouvir="1">${ico("volume", "ico-sm")}<span>Ouvir</span></button>${v.atrasadas.length ? `<button data-revisao-tarefas="1">${ico("layers", "ico-sm")}<span>Ver as tarefas</span></button>` : ""}</div>
    </div>`,
    aoAbrir: (corpo) => corpo.addEventListener("click", (e) => {
      if (e.target.closest("[data-revisao-ouvir]")) { window.nx.chatSend("faz a revisão da semana"); showToast("Lendo a revisão…"); }
      if (e.target.closest("[data-revisao-tarefas]")) { fecharGaveta(); abrirTarefasCheia(); }
    }),
  });
}

/** Rotinas que ainda rodam hoje e as que já rodaram, com ✓/✗ (fase 18). */
function desenharRotinasHoje(proximas, rodaram) {
  if (!proximas.length && !rodaram.length) return `<div class="hoje-vazio">Nenhuma rotina hoje.</div>`;
  const linhas = proximas.map(x => `<div class="hoje-linha">${ico("clock", "ico-sm")}<span>${escHtml(x.nome)}</span><b>${hojeHoraCurta(x.em)}</b></div>`);
  for (const x of rodaram) {
    linhas.push(`<div class="hoje-linha hoje-rodou ${x.ok ? "ok" : "falhou"}" title="${escHtml(x.resultado)}">${ico(x.ok ? "check" : "alert", "ico-sm")}<span>${escHtml(x.nome)}</span><b>${hojeHoraCurta(x.em)}</b></div>`);
  }
  return linhas.join("");
}

/** Card ELYSIUM: o que veio na versão e o checklist "Para testar" (marcável, por versão). */
function desenharElysiumHoje(e) {
  const caixa = document.getElementById("hoje-elysium");
  if (!caixa || !e) return;
  document.getElementById("hoje-versao").textContent = `v${e.versao}`;
  const pronta = e.atualizacaoPronta ? `<div class="hoje-alerta aviso">${ico("download", "ico-sm")}<span>A versão <b>${escHtml(e.atualizacaoPronta)}</b> está pronta para instalar.</span></div>` : "";
  const novidades = e.novidades.length
    ? `<h4 class="hoje-sub">O que veio nesta versão</h4><ul class="hoje-novidades">${e.novidades.slice(0, 6).map(n => `<li>${escHtml(n)}</li>`).join("")}</ul>`
    : `<div class="hoje-vazio">Sem notas desta versão.</div>`;
  const testar = e.paraTestar.length
    ? `<h4 class="hoje-sub">Para testar ${e.paraTestar.filter(t => t.feito).length}/${e.paraTestar.length}</h4>${e.paraTestar.map(t => `<label class="hoje-testar${t.feito ? " feito" : ""}"><input type="checkbox" data-hoje-testar="${escHtml(t.item)}"${t.feito ? " checked" : ""}><span>${escHtml(t.item)}</span></label>`).join("")}`
    : "";
  caixa.innerHTML = pronta + novidades + testar;
}

async function carregarHoje() {
  // Volta à aba (08/10): o último painel aparece na hora e o novo chega por trás — a mesma
  // regra das abas vivas do celular. Sem isto os timers ficavam parados até o RPC voltar.
  if (painelHoje) desenharHoje();
  try {
    const r = await window.nx.rpc("hoje.painel");
    if (r.result) painelHoje = r.result;
  } catch { /* fica o último */ }
  desenharHoje();
  // Os timers contam ao vivo enquanto a aba está aberta; fora dela, o tique para.
  clearInterval(tiqueHoje);
  tiqueHoje = setInterval(() => {
    if (document.getElementById("layout")?.dataset.view !== "hoje") { clearInterval(tiqueHoje); return; }
    hojeEl()?.querySelectorAll("[data-fim]").forEach(b => { b.textContent = hojeRestante(Number(b.dataset.fim)); });
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
      <label>Folgas por semana<small>Faltas que não quebram a sequência (a força cai um pouco, mas nada zera).</small>
        <select name="folgas">${[0, 1, 2].map(n => `<option value="${n}"${(base.folgasPorSemana ?? 1) === n ? " selected" : ""}>${n === 0 ? "Nenhuma" : n === 1 ? "1 por semana" : "2 por semana"}</option>`).join("")}</select></label>
      <div class="home-acoes">
        <button type="submit" class="principal">${ico("check", "ico-sm")}<span>${base.id ? "Salvar" : "Criar hábito"}</span></button>
        ${base.id ? `<button type="button" data-congelar="1" title="Viagem, doença: hoje não conta como falta">${ico("moon", "ico-sm")}<span>${base.pausadoHoje ? "Descongelar hoje" : "Congelar hoje"}</span></button>` : ""}
        ${base.id ? `<button type="button" data-apagar="1">${ico("trash", "ico-sm")}<span>Apagar</span></button>` : ""}
        <button type="button" data-cancelar="1">${ico("x", "ico-sm")}<span>Cancelar</span></button>
      </div>
    </form>`,
    aoAbrir: (corpo) => {
      const f = corpo.querySelector("form");
      f.querySelector("[data-congelar]")?.addEventListener("click", async () => {
        const r = await window.nx.rpc("habitos.pausar", { id: base.id, pausar: !base.pausadoHoje });
        if (r.error) { showToast(r.error, true); return; }
        fecharGaveta(); showToast(base.pausadoHoje ? "Hoje volta a contar." : "Hoje congelado — não conta como falta."); carregarHoje();
      });
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
        const r = await window.nx.rpc("habitos.save", { id: base.id, nome: f.nome.value, dias: d, horaLembrete: f.hora.value || undefined, folgasPorSemana: Number(f.folgas.value) });
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

/**
 * Todos os hábitos e metas (revisão de 07/10): a aba só mostra os que valem HOJE e as metas
 * em andamento — sem isto, um hábito de seg/qua/sex não dava para editar na terça, e meta
 * concluída não dava para apagar.
 */
async function gerenciarHabitos() {
  const r = await window.nx.rpc("habitos.list");
  const hs = r.result?.habitos ?? [], ms = r.result?.metas ?? [];
  hojeTodosHabitos = hs; hojeTodasMetas = ms;
  abrirGaveta({
    titulo: "Hábitos e metas", icone: "list", classe: "gaveta-pc",
    html: `<div class="hoje-gerenciar">
      <h4>Hábitos</h4>${hs.length ? hs.map(h => `<button data-g-habito="${escHtml(h.id)}">${ico("check", "ico-sm")}<span>${escHtml(h.nome)}</span><small>${h.dias.length ? h.dias.map(d => DIAS_LONGOS[d]).join(", ") : "todo dia"} · 🔥${h.sequencia}</small></button>`).join("") : '<p class="hoje-vazio">Nenhum hábito.</p>'}
      <h4>Metas</h4>${ms.length ? ms.map(m => `<button data-g-meta="${escHtml(m.id)}">${ico("star", "ico-sm")}<span>${escHtml(m.titulo)}</span><small>${m.progresso}/${m.alvo}${m.concluidaEm ? " · concluída" : ""}</small></button>`).join("") : '<p class="hoje-vazio">Nenhuma meta.</p>'}
    </div>`,
    aoAbrir: (corpo) => corpo.addEventListener("click", (e) => {
      const bh = e.target.closest("[data-g-habito]");
      if (bh) { formHabito(hojeTodosHabitos.find(x => x.id === bh.dataset.gHabito) ?? {}); return; }
      const bm = e.target.closest("[data-g-meta]");
      if (bm) formMeta(hojeTodasMetas.find(x => x.id === bm.dataset.gMeta) ?? {});
    }),
  });
}
let hojeTodosHabitos = [], hojeTodasMetas = [];

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
  const tc = alvo("[data-tarefa-check]");
  if (tc) {
    const t = painelHoje?.tarefas.find(x => x.id === tc.dataset.tarefaCheck);
    if (!t) return;
    if (t.feita) { await window.nx.rpc("tarefas.reabrir", { id: t.id }); carregarHoje(); }
    else concluirTarefaComRessalva(t);
    return;
  }
  const tx = alvo("[data-tarefa-apagar]");
  if (tx) {
    const r = await window.nx.rpc("tarefas.delete", { id: tx.dataset.tarefaApagar });
    if (r.cancelado) return;
    if (r.error) showToast(r.error, true); else { showToast("Tarefa apagada."); carregarHoje(); }
    return;
  }
  if (alvo("[data-hoje-gerenciar]")) { gerenciarHabitos(); return; }
  if (alvo("[data-hoje-novo-habito]")) { formHabito(); return; }
  if (alvo("[data-hoje-nova-meta]")) { formMeta(); return; }
  const eh = alvo("[data-hoje-editar-habito]");
  if (eh) { formHabito(painelHoje?.habitos.find(h => h.id === eh.dataset.hojeEditarHabito) ?? {}); return; }
  const em = alvo("[data-hoje-editar-meta]");
  if (em) { formMeta(painelHoje?.metas.find(m => m.id === em.dataset.hojeEditarMeta) ?? {}); return; }
  if (alvo("#hoje-ler")) { window.nx.chatSend("me dá o resumo do dia"); showToast("Lendo o briefing…"); return; }
  if (alvo("#hoje-recarregar")) { carregarHoje(); return; }
  const cfAbrir = alvo("[data-comofoi-abrir]");
  const cfDisp = alvo("[data-comofoi-dispensar]");
  if (cfAbrir || cfDisp) {
    const id = (cfAbrir ?? cfDisp).dataset[cfAbrir ? "comofoiAbrir" : "comofoiDispensar"];
    const r = await window.nx.rpc(cfAbrir ? "acompanhamento.abrir" : "acompanhamento.dispensar", { id });
    if (painelHoje) painelHoje.acompanhamentos = (painelHoje.acompanhamentos ?? []).filter(a => a.id !== id);
    desenharComoFoi(painelHoje?.acompanhamentos ?? []);
    if (r.error) { showToast(r.error, true); return; }
    if (cfAbrir) {
      // A pergunta vira a fala da Ely no chat; a resposta dele vai com esse contexto.
      switchView("chat"); switchChatMode("ai");
      addBubble("reply", r.result.pergunta);
      document.getElementById("cmd-input")?.focus();
    }
    return;
  }
  if (alvo("#hoje-revisao")) { abrirRevisaoSemana(); return; }
  if (alvo("#hoje-despejo")) { abrirDespejo(); return; }
  const oc = alvo("[data-hoje-ocultar]");
  if (oc) {
    const r = await window.nx.rpc("hoje.ocultar", { secao: oc.dataset.hojeOcultar, ocultar: true });
    if (r.error) { showToast(r.error, true); return; }
    if (painelHoje) painelHoje.ocultos = r.result.ocultos;
    aplicarSecoesOcultas(r.result.ocultos);
    return;
  }
  if (alvo("[data-hoje-mostrar-ocultos]")) {
    for (const s of painelHoje?.ocultos ?? []) await window.nx.rpc("hoje.ocultar", { secao: s, ocultar: false });
    if (painelHoje) painelHoje.ocultos = [];
    aplicarSecoesOcultas([]);
    return;
  }
  const ideia = alvo("[data-hoje-ideia]");
  if (ideia) {
    ideia.disabled = true;
    document.getElementById("hoje-ideia").classList.add("trocando");
    const r = await window.nx.rpc("hoje.ideia");
    ideia.disabled = false;
    document.getElementById("hoje-ideia").classList.remove("trocando");
    if (r.error) { showToast(r.error, true); return; }
    if (painelHoje) painelHoje.ideia = r.result.ideia;
    document.getElementById("hoje-ideia").innerHTML = `<p>${escHtml(r.result.ideia)}</p>`;
    return;
  }
  const mc = alvo("#hoje-btn-manchetes");
  if (mc) { buscarManchetes(mc); return; }
});

// Nova tarefa: com dia, vira lembrete (16h sem hora; véspera para prova e consulta).
document.getElementById("hoje-nova-tarefa")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const texto = f.texto.value.trim();
  if (!texto) return;
  const hora = f.hora.value;
  // Hora sem dia: hoje.
  const dia = f.dia.value || (hora ? new Date().toLocaleDateString("sv-SE") : "");
  const r = await window.nx.rpc("tarefas.criar", { texto, quando: dia ? (hora ? `${dia}T${hora}` : dia) : undefined });
  if (r.error) { showToast(r.error, true); return; }
  f.reset();
  showToast(r.result?.mensagem ?? "Anotado.");
  carregarHoje();
});

// "Para testar": marcar é um checkbox — o estado fica no PC, por versão.
hojeEl()?.addEventListener("change", async (e) => {
  const c = e.target.closest?.("[data-hoje-testar]");
  if (!c) return;
  const r = await window.nx.rpc("hoje.testar", { item: c.dataset.hojeTestar, feito: c.checked });
  if (r.error) { showToast(r.error, true); c.checked = !c.checked; return; }
  c.closest(".hoje-testar")?.classList.toggle("feito", c.checked);
  if (painelHoje?.elysium) {
    painelHoje.elysium.paraTestar = painelHoje.elysium.paraTestar.map(t => ({ ...t, feito: r.result.feitos.includes(t.item) }));
    desenharElysiumHoje(painelHoje.elysium);
  }
});
