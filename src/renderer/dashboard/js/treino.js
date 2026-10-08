// dashboard/js/treino.js — treino, nutrição e corrida na aba Hoje (fase 18, 08/10).
//
// O treino da vez na rotação (A→B→C), a meta de calorias do dia com macros e uma dica que
// se renova (toque = outra), e o plano de corrida para iniciante. Os dados são pessoais e
// moram no PC (corpo.json no userData); aqui só se desenha e se edita.
// Scripts clássicos: escopo global com os outros arquivos — nomes com prefixo treino/corpo.

let corpoHoje = null;

const OBJETIVOS_CORPO = { ganhar: "Ganhar peso/massa", manter: "Manter", perder: "Perder gordura" };
const ATIVIDADES_CORPO = { sedentario: "Sedentário", leve: "1–2 dias de treino", moderado: "3 dias", ativo: "4–5 dias", muito: "6+ dias" };

function treinoSeries(e) {
  return `${e.aquecimento ? `${e.aquecimento} aquec. + ` : ""}${e.series}×${e.reps}`;
}

/** Chamado por desenharHoje (hoje.js). `corpo` null = nada cadastrado: as seções somem. */
function desenharCorpoHoje(corpo, dica) {
  corpoHoje = corpo;
  const secTreino = document.getElementById("hoje-sec-treino");
  const secNutri = document.getElementById("hoje-sec-nutricao");
  const secCorrida = document.getElementById("hoje-sec-corrida");
  if (!secTreino) return;
  if (!corpo) {
    // Sem nada ainda: só o card de treino, convidando a cadastrar.
    secTreino.hidden = false; secNutri.hidden = true; secCorrida.hidden = true;
    document.getElementById("hoje-treino").innerHTML = `<div class="hoje-vazio">Cadastre seus treinos e o perfil para a Ely acompanhar a academia, a meta de calorias e a corrida.<button class="hoje-acao" data-treino-todos="1">${ico("plus", "ico-sm")}<span>Cadastrar treinos</span></button></div>`;
    return;
  }
  secTreino.hidden = false; secNutri.hidden = false; secCorrida.hidden = false;

  // Treino da vez
  const th = corpo.treinoHoje;
  document.getElementById("hoje-treino").innerHTML = th
    ? `<div class="treino-topo${th.feitoHoje ? " feito" : ""}">
        <div><div class="treino-nome">${escHtml(th.treino.nome)}</div>
          <small>${th.feitoHoje ? "Feito hoje" : "O da vez na rotação"}${th.proximo ? ` · depois: ${escHtml(th.proximo)}` : ""} · ${corpo.treinosNoMes} no mês</small></div>
        <button class="hoje-acao${th.feitoHoje ? "" : " principal"}" data-treino-marcar="${th.feitoHoje ? "" : "1"}">${ico(th.feitoHoje ? "rotate" : "check", "ico-sm")}<span>${th.feitoHoje ? "Desmarcar" : "Concluir treino"}</span></button>
      </div>
      <ol class="treino-lista">${th.treino.exercicios.map(e => `<li><span>${escHtml(e.nome)}</span><small>${escHtml(treinoSeries(e))}${e.carga ? ` · ${escHtml(e.carga)}` : ""}</small></li>`).join("")}</ol>`
    : `<div class="hoje-vazio">Nenhum treino cadastrado.<button class="hoje-acao" data-treino-todos="1">${ico("plus", "ico-sm")}<span>Cadastrar</span></button></div>`;

  // Nutrição
  const m = corpo.meta;
  document.getElementById("hoje-nutricao").innerHTML = `${m
    ? `<div class="nutri-kcal"><b>${m.kcal}</b><span>kcal hoje</span></div>
       <div class="nutri-macros"><span><b>${m.proteinaG} g</b> proteína</span><span><b>${m.carboG} g</b> carbo</span><span><b>${m.gorduraG} g</b> gordura</span></div>
       ${m.corrida ? `<small class="nutri-nota">Inclui ${m.corrida} kcal da corrida.</small>` : ""}`
    : `<div class="hoje-vazio">Para a meta faltam: ${escHtml(corpo.faltaPerfil.join(", "))}.<button class="hoje-acao" data-corpo-perfil="1">${ico("user", "ico-sm")}<span>Completar perfil</span></button></div>`}
    ${corpo.sugestao ? `<div class="hoje-alerta aviso">${ico("info", "ico-sm")}<span>${escHtml(corpo.sugestao)}</span></div>` : ""}
    ${dica ? `<button class="nutri-dica" data-corpo-dica="1" title="Outra dica">${ico("bulb", "ico-sm")}<span>${escHtml(dica.texto)}</span></button>` : ""}
    <small class="nutri-nota">Orientação geral — não substitui nutricionista.</small>`;

  // Corrida
  const c = corpo.corrida;
  document.getElementById("hoje-corrida").innerHTML = `
    <div class="corrida-semana">${c.concluido ? "Plano concluído — agora é manter e aumentar a distância." : `Semana ${c.semana} · sessão ${c.sessao}/3`}</div>
    <p class="corrida-texto">${escHtml(c.texto)}</p>
    <small>~${c.minutos} min no total${c.feitaHoje ? " · já correu hoje" : ""}</small>
    <div class="home-acoes"><button class="hoje-acao${c.feitaHoje ? "" : " principal"}" data-corrida-marcar="1">${ico("check", "ico-sm")}<span>${c.feitaHoje ? "Anotar outra" : "Anotar corrida"}</span></button></div>
    ${c.ultimas.length ? `<div class="corrida-ultimas">${c.ultimas.map(x => `<span title="${x.doPlano ? "do plano" : "livre"}">${new Date(x.data + "T12:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} · ${x.minutos} min${x.km ? ` · ${String(x.km).replace(".", ",")} km` : ""}</span>`).join("")}</div>` : ""}`;
}

// ── formulários ──────────────────────────────────────────────────────────────

function linhaExercicio(e = {}, i) {
  return `<div class="treino-ex"${i === undefined ? "" : ` data-ex-i="${i}"`}>
    <input type="text" name="nome" value="${escHtml(e.nome ?? "")}" placeholder="Exercício" maxlength="80" aria-label="Exercício">
    <input type="number" name="aquecimento" value="${e.aquecimento ?? ""}" min="0" max="5" placeholder="aq." title="Séries de aquecimento" aria-label="Aquecimento">
    <input type="number" name="series" value="${e.series ?? ""}" min="1" max="10" placeholder="séries" title="Séries válidas" aria-label="Séries">
    <input type="text" name="reps" value="${escHtml(e.reps ?? "")}" placeholder="reps" maxlength="12" title="Repetições (ex.: 4–6)" aria-label="Repetições">
    <input type="text" name="carga" value="${escHtml(e.carga ?? "")}" placeholder="carga" maxlength="20" aria-label="Carga">
    <button type="button" data-ex-tirar="1" title="Tirar exercício" aria-label="Tirar exercício">${ico("x", "ico-sm")}</button>
  </div>`;
}

function formTreino(base = {}) {
  abrirGaveta({
    titulo: base.id ? `Editar ${base.nome}` : "Novo treino", icone: "activity", classe: "gaveta-pc",
    html: `<form class="rot-form" id="treino-form">
      <label>Nome<input type="text" name="nomeTreino" value="${escHtml(base.nome ?? "")}" placeholder="Ex.: Treino A" required maxlength="40" autocomplete="off"></label>
      <label>Exercícios<small>Séries e reps em branco: compostos ficam com 2 aquecimentos + 3×4–6; isoladores com 3×10–12.</small></label>
      <div id="treino-exs">${(base.exercicios?.length ? base.exercicios : [{}]).map(linhaExercicio).join("")}</div>
      <button type="button" class="hoje-acao" data-ex-mais="1">${ico("plus", "ico-sm")}<span>Exercício</span></button>
      <div class="home-acoes">
        <button type="submit" class="principal">${ico("check", "ico-sm")}<span>Salvar</span></button>
        ${base.id ? `<button type="button" data-apagar="1">${ico("trash", "ico-sm")}<span>Apagar</span></button>` : ""}
        <button type="button" data-cancelar="1">${ico("x", "ico-sm")}<span>Cancelar</span></button>
      </div>
    </form>`,
    aoAbrir: (corpo) => {
      const f = corpo.querySelector("form");
      const caixa = f.querySelector("#treino-exs");
      f.addEventListener("click", (e) => {
        if (e.target.closest("[data-ex-mais]")) { caixa.insertAdjacentHTML("beforeend", linhaExercicio()); caixa.lastElementChild.querySelector("input").focus(); }
        const tirar = e.target.closest("[data-ex-tirar]");
        if (tirar) tirar.closest(".treino-ex").remove();
      });
      f.querySelector("[data-cancelar]").addEventListener("click", () => fecharGaveta());
      f.querySelector("[data-apagar]")?.addEventListener("click", async () => {
        const r = await window.nx.rpc("treinos.delete", { id: base.id });
        if (r.cancelado) return;
        fecharGaveta(); showToast("Treino apagado."); carregarHoje();
      });
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const exercicios = [...caixa.querySelectorAll(".treino-ex")].map(l => {
          const v = (n) => l.querySelector(`[name="${n}"]`).value.trim();
          const n = (k) => (v(k) === "" ? undefined : Number(v(k)));
          // Parte do original: o que o formulário não mostra (obs, tipo, descanso) não se perde.
          const orig = l.dataset.exI !== undefined ? base.exercicios?.[Number(l.dataset.exI)] : undefined;
          return { ...(orig ?? {}), nome: v("nome"), aquecimento: n("aquecimento"), series: n("series"), reps: v("reps") || undefined, carga: v("carga") || undefined };
        }).filter(x => x.nome);
        if (!exercicios.length) { showToast("Ponha pelo menos um exercício.", true); return; }
        const r = await window.nx.rpc("treinos.save", { id: base.id, nome: f.nomeTreino.value, exercicios, ordem: base.ordem });
        if (r.error) { showToast(r.error, true); return; }
        fecharGaveta(); showToast("Treino salvo."); carregarHoje();
      });
    },
  });
}

async function treinosTodos() {
  const r = await window.nx.rpc("corpo.painel");
  const ts = r.result?.treinos ?? [];
  abrirGaveta({
    titulo: "Treinos", icone: "activity", classe: "gaveta-pc",
    html: `<div class="hoje-gerenciar">
      <p class="hoje-vazio">Rotação: depois de marcar um, o próximo da lista vira o da vez.</p>
      ${ts.map(t => `<button data-treino-editar="${escHtml(t.id)}">${ico("activity", "ico-sm")}<span>${escHtml(t.nome)}</span><small>${t.exercicios.length} exercícios</small></button>`).join("")}
      <button data-treino-novo="1">${ico("plus", "ico-sm")}<span>Novo treino</span><small></small></button>
    </div>`,
    aoAbrir: (corpo) => corpo.addEventListener("click", (e) => {
      const ed = e.target.closest("[data-treino-editar]");
      if (ed) { formTreino(ts.find(t => t.id === ed.dataset.treinoEditar) ?? {}); return; }
      if (e.target.closest("[data-treino-novo]")) formTreino({ ordem: ts.length });
    }),
  });
}

function formPerfilCorpo() {
  const p = corpoHoje?.perfil ?? {};
  const opcoes = (mapa, atual) => Object.entries(mapa).map(([k, v]) => `<option value="${k}"${k === atual ? " selected" : ""}>${v}</option>`).join("");
  abrirGaveta({
    titulo: "Perfil do corpo", icone: "user", classe: "gaveta-pc",
    html: `<form class="rot-form" id="corpo-form">
      <p class="hoje-vazio">Base da meta de calorias (Mifflin-St Jeor). Fica só neste PC.</p>
      <label>Sexo<select name="sexo"><option value="">—</option>${opcoes({ masculino: "Masculino", feminino: "Feminino" }, p.sexo)}</select></label>
      <label>Idade<input type="number" name="idade" min="10" max="100" value="${p.idade ?? ""}" style="width:120px"></label>
      <label>Altura (cm)<input type="number" name="alturaCm" min="100" max="230" value="${p.alturaCm ?? ""}" style="width:120px"></label>
      <label>Peso (kg)<input type="number" name="pesoKg" min="30" max="250" step="0.1" value="${p.pesoKg ?? ""}" style="width:120px"></label>
      <label>Treino por semana<select name="atividade">${opcoes(ATIVIDADES_CORPO, p.atividade)}</select></label>
      <label>Objetivo<select name="objetivo">${opcoes(OBJETIVOS_CORPO, p.objetivo)}</select></label>
      <label>Foco<small>Opcional — entra nas dicas (ex.: braços).</small><input type="text" name="foco" value="${escHtml(p.foco ?? "")}" maxlength="60"></label>
      <label>Ajuste manual (kcal)<small>Ex.: +150 se o peso parar de subir.</small><input type="number" name="ajusteKcal" min="-1000" max="1000" step="10" value="${p.ajusteKcal ?? 0}" style="width:120px"></label>
      <div class="home-acoes">
        <button type="submit" class="principal">${ico("check", "ico-sm")}<span>Salvar</span></button>
        <button type="button" data-cancelar="1">${ico("x", "ico-sm")}<span>Cancelar</span></button>
      </div>
    </form>`,
    aoAbrir: (corpo) => {
      const f = corpo.querySelector("form");
      f.querySelector("[data-cancelar]").addEventListener("click", () => fecharGaveta());
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const n = (k) => (f[k].value === "" ? undefined : Number(f[k].value));
        const r = await window.nx.rpc("corpo.perfil", {
          sexo: f.sexo.value || undefined, idade: n("idade"), alturaCm: n("alturaCm"), pesoKg: n("pesoKg"),
          atividade: f.atividade.value, objetivo: f.objetivo.value, foco: f.foco.value, ajusteKcal: n("ajusteKcal") ?? 0,
        });
        if (r.error) { showToast(r.error, true); return; }
        fecharGaveta(); showToast("Perfil salvo."); carregarHoje();
      });
    },
  });
}

function formNumeroCorpo({ titulo, icone, campos, aoSalvar }) {
  abrirGaveta({
    titulo, icone, classe: "gaveta-pc",
    html: `<form class="rot-form">${campos.map(c => `<label>${c.rotulo}${c.dica ? `<small>${c.dica}</small>` : ""}<input type="number" name="${c.nome}" min="${c.min}" max="${c.max}" step="${c.passo ?? 1}" value="${c.valor ?? ""}" style="width:140px"${c.obrigatorio ? " required" : ""}></label>`).join("")}
      <div class="home-acoes"><button type="submit" class="principal">${ico("check", "ico-sm")}<span>Salvar</span></button><button type="button" data-cancelar="1">${ico("x", "ico-sm")}<span>Cancelar</span></button></div></form>`,
    aoAbrir: (corpo) => {
      const f = corpo.querySelector("form");
      f.querySelector("[data-cancelar]").addEventListener("click", () => fecharGaveta());
      // O primeiro campo numérico recebe o foco (o abrirGaveta só foca texto/select/botão).
      f.querySelector("input")?.focus();
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const v = Object.fromEntries(campos.map(c => [c.nome, f[c.nome].value === "" ? undefined : Number(f[c.nome].value)]));
        const r = await aoSalvar(v);
        if (r.error) { showToast(r.error, true); return; }
        fecharGaveta(); carregarHoje();
      });
    },
  });
}

hojeEl()?.addEventListener("click", async (e) => {
  const alvo = (sel) => e.target.closest(sel);
  const marcar = alvo("[data-treino-marcar]");
  if (marcar) {
    marcar.disabled = true;
    const r = await window.nx.rpc("treinos.marcar", { feito: !!marcar.dataset.treinoMarcar });
    if (r.error) showToast(r.error, true); else if (marcar.dataset.treinoMarcar) showToast(`${r.result.treino.nome} concluído. 💪`);
    carregarHoje();
    return;
  }
  if (alvo("[data-treino-todos]")) { treinosTodos(); return; }
  if (alvo("[data-corpo-perfil]")) { formPerfilCorpo(); return; }
  if (alvo("[data-corpo-peso]")) {
    formNumeroCorpo({
      titulo: "Peso de hoje", icone: "activity",
      campos: [{ nome: "kg", rotulo: "Peso (kg)", min: 30, max: 250, passo: 0.1, valor: corpoHoje?.perfil.pesoKg, obrigatorio: true }],
      aoSalvar: async (v) => { const r = await window.nx.rpc("corpo.peso", { kg: v.kg }); if (!r.error) showToast("Peso anotado."); return r; },
    });
    return;
  }
  if (alvo("[data-corrida-marcar]")) {
    formNumeroCorpo({
      titulo: "Anotar corrida", icone: "activity",
      campos: [
        { nome: "minutos", rotulo: "Minutos", min: 1, max: 300, valor: corpoHoje?.corrida.minutos, obrigatorio: true },
        { nome: "km", rotulo: "Distância (km)", dica: "Opcional — com ela a conta do gasto fica melhor.", min: 0.1, max: 99, passo: 0.01 },
      ],
      aoSalvar: async (v) => { const r = await window.nx.rpc("corrida.marcar", { minutos: v.minutos, km: v.km }); if (!r.error) showToast("Corrida anotada."); return r; },
    });
    return;
  }
  const dica = alvo("[data-corpo-dica]");
  if (dica) {
    dica.disabled = true;
    dica.classList.add("trocando");
    const r = await window.nx.rpc("corpo.dica", { nova: true });
    dica.disabled = false;
    dica.classList.remove("trocando");
    if (r.error) { showToast(r.error, true); return; }
    dica.querySelector("span").textContent = r.result.dica.texto;
    if (painelHoje) painelHoje.dica = r.result.dica;
  }
});
