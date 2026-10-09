// dashboard/js/estudo.js — painel "Estudo" da aba Hoje (fase 20, blocos 208–210).
//
// Pomodoro (fase, tempo, ciclo; começar, pular, parar), os cartões de revisão do dia (a
// gaveta vira o cartão: frente → resposta → "acertei"/"errei") e o plano de estudo para a
// prova. Tudo mora no PC; aqui é só desenho e RPC. O relógio do pomodoro usa o mesmo tique
// de 1 s da aba Hoje (`[data-fim]`).

let estadoPomodoroTela = null;
let cartoesHoje = { cartoes: [], vencidos: [] };

const NOME_FASE = { foco: "Foco", pausa: "Pausa", longa: "Pausa longa" };

function desenharEstudo() {
  const alvo = hojeEl()?.querySelector("#hoje-estudo");
  if (!alvo) return;
  const p = estadoPomodoroTela;
  const venc = cartoesHoje.vencidos?.length ?? 0;
  const total = cartoesHoje.cartoes?.length ?? 0;
  const pomodoro = p?.ativo
    ? `<div class="est-pomo est-${p.fase}">
        <div class="est-pomo-fase">${NOME_FASE[p.fase] ?? p.fase} · ciclo ${p.ciclo} de ${p.de}</div>
        <b class="est-pomo-tempo" data-fim="${p.fimEm}">${hojeRestante(p.fimEm)}</b>
        <div class="home-acoes">
          <button data-pomo="skip" title="Termina a fase agora e vai para a próxima">${ico("skip-forward", "ico-sm")}<span>${p.fase === "foco" ? "Pular para a pausa" : "Pular a pausa"}</span></button>
          <button data-pomo="stop">${ico("x", "ico-sm")}<span>Parar</span></button>
        </div>
      </div>`
    : `<div class="hoje-vazio">Pomodoro: blocos de foco com pausa; o modo foco liga sozinho.
        <span class="home-acoes">
          <button data-pomo="start" data-foco="25" data-pausa="5">${ico("clock", "ico-sm")}<span>25 + 5</span></button>
          <button data-pomo="start" data-foco="50" data-pausa="10">${ico("clock", "ico-sm")}<span>50 + 10</span></button>
        </span></div>`;
  alvo.innerHTML = `
    ${pomodoro}
    <div class="est-linha">
      <span>${ico("layers", "ico-sm")} ${venc ? `<b>${venc}</b> ${venc === 1 ? "cartão" : "cartões"} para revisar hoje` : total ? "Nenhum cartão para hoje" : "Sem cartões de revisão ainda"}</span>
      <span class="home-acoes">
        ${venc ? `<button class="principal" data-est-revisar="1">${ico("play", "ico-sm")}<span>Revisar</span></button>` : ""}
        <button data-est-cartao="1" title="Pergunta e resposta para revisar com repetição espaçada">${ico("plus", "ico-sm")}<span>Cartão</span></button>
        <button data-est-plano="1" title="Divide os assuntos da prova em sessões até a véspera">${ico("calendar", "ico-sm")}<span>Plano de estudo</span></button>
      </span>
    </div>`;
}

async function carregarEstudo() {
  try { estadoPomodoroTela = (await window.nx.rpc("pomodoro.get")).result ?? null; } catch { /* PC antigo */ }
  try { cartoesHoje = (await window.nx.rpc("cartoes.list")).result ?? cartoesHoje; } catch { /* PC antigo */ }
  desenharEstudo();
}

window.nx.onPomodoro?.((p) => { estadoPomodoroTela = p; desenharEstudo(); });

document.getElementById("hoje-estudo")?.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-pomo]");
  if (b) {
    const op = b.dataset.pomo;
    const params = op === "start" ? { foco: Number(b.dataset.foco), pausa: Number(b.dataset.pausa) } : {};
    b.disabled = true;
    const r = await window.nx.rpc(`pomodoro.${op}`, params);
    b.disabled = false;
    if (r.error) { showToast(r.error, true); return; }
    estadoPomodoroTela = r.result;
    desenharEstudo();
    if (op === "start") showToast("Pomodoro começou. Modo foco ligado.");
    return;
  }
  if (e.target.closest("[data-est-revisar]")) { abrirRevisao(); return; }
  if (e.target.closest("[data-est-cartao]")) { formCartao(); return; }
  if (e.target.closest("[data-est-plano]")) { formPlanoDeEstudo(); }
});

// ── revisão (cartões) ────────────────────────────────────────────────────────────

function abrirRevisao() {
  const fila = (cartoesHoje.cartoes ?? []).filter(c => (cartoesHoje.vencidos ?? []).includes(c.id));
  if (!fila.length) { showToast("Nada para revisar hoje."); return; }
  let i = 0, certos = 0, virado = false;
  const desenhar = (corpo) => {
    const c = fila[i];
    if (!c) {
      corpo.innerHTML = `<div class="est-cartao est-fim"><b>${certos} de ${fila.length}</b><p>Revisão feita. Os cartões voltam no dia certo.</p>
        <div class="home-acoes"><button class="principal" data-rev-fechar="1">${ico("check", "ico-sm")}<span>Fechar</span></button></div></div>`;
      return;
    }
    corpo.innerHTML = `
      <div class="est-progresso">Cartão ${i + 1} de ${fila.length} · caixa ${c.caixa}</div>
      <div class="est-cartao">
        <p class="est-frente">${escHtml(c.frente)}</p>
        ${virado ? `<p class="est-verso">${escHtml(c.verso)}</p>` : ""}
      </div>
      <div class="home-acoes est-botoes">${virado
        ? `<button class="principal" data-rev="1">${ico("check", "ico-sm")}<span>Acertei</span></button>
           <button data-rev="0">${ico("x", "ico-sm")}<span>Errei</span></button>`
        : `<button class="principal" data-rev-virar="1">${ico("eye", "ico-sm")}<span>Mostrar a resposta</span></button>`}
        <button data-rev-apagar="1" title="Apagar este cartão">${ico("trash", "ico-sm")}</button>
      </div>
      <p class="gp-nota">Espaço vira o cartão; 1 = acertei, 2 = errei.</p>`;
  };
  abrirGaveta({
    titulo: "Revisão", icone: "layers", classe: "gaveta-pc",
    aoAbrir: (corpo, signal) => {
      desenhar(corpo);
      const responder = async (acertou) => {
        const c = fila[i];
        const r = await window.nx.rpc("cartoes.responder", { id: c.id, acertou });
        if (r.error) { showToast(r.error, true); return; }
        if (acertou) certos++;
        i++; virado = false;
        desenhar(corpo);
      };
      corpo.addEventListener("click", async (e) => {
        if (e.target.closest("[data-rev-virar]")) { virado = true; desenhar(corpo); return; }
        const rev = e.target.closest("[data-rev]");
        if (rev) { await responder(rev.dataset.rev === "1"); return; }
        if (e.target.closest("[data-rev-apagar]")) {
          const r = await window.nx.rpc("cartoes.delete", { id: fila[i].id });
          if (r.cancelado || r.error) return;
          fila.splice(i, 1); virado = false; desenhar(corpo); return;
        }
        if (e.target.closest("[data-rev-fechar]")) fecharGaveta();
      }, { signal });
      document.addEventListener("keydown", (e) => {
        if (!fila[i] || e.target.closest?.("input, textarea")) return;
        if (e.key === " " && !virado) { e.preventDefault(); virado = true; desenhar(corpo); }
        else if (virado && (e.key === "1" || e.key === "2")) { e.preventDefault(); void responder(e.key === "1"); }
      }, { signal });
    },
    aoFechar: () => carregarEstudo(),
  });
}

function formCartao() {
  abrirGaveta({
    titulo: "Novo cartão", icone: "plus", classe: "gaveta-pc",
    html: `<form class="rot-form" id="est-form-cartao">
      <label>Pergunta (frente)<input type="text" name="frente" maxlength="300" required autocomplete="off" placeholder="Ex.: O que a mitocôndria faz?"></label>
      <label>Resposta (verso)<input type="text" name="verso" maxlength="300" required autocomplete="off" placeholder="Ex.: Produz a energia da célula (ATP)"></label>
      <p class="gp-nota">Volta amanhã; acertando, em 3, 7, 14 e 30 dias. Pela voz: “guarda pra revisar: mitocôndria é a organela que produz energia”.</p>
      <div class="home-acoes"><button type="submit" class="principal">${ico("check", "ico-sm")}<span>Guardar</span></button></div>
    </form>`,
    aoAbrir: (corpo, signal) => {
      const f = corpo.querySelector("form");
      f.frente.focus();
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const r = await window.nx.rpc("cartoes.criar", { frente: f.frente.value, verso: f.verso.value });
        if (r.error) { showToast(r.error, true); return; }
        showToast("Cartão guardado. Volta amanhã.");
        f.reset(); f.frente.focus();
        carregarEstudo();
      }, { signal });
    },
  });
}

// ── plano de estudo ─────────────────────────────────────────────────────────────

/**
 * A prova (matéria, e a data se ainda não estiver nas tarefas) → a Ely monta as sessões até
 * a véspera → ele desmarca o que não quer → grava pelo despejo (cada sessão vira tarefa com
 * aviso). Nada é gravado antes do "Salvar".
 */
function formPlanoDeEstudo(materia = "") {
  let itens = [];
  abrirGaveta({
    titulo: "Plano de estudo", icone: "calendar", classe: "gaveta-pc",
    html: `<form class="rot-form" id="est-form-plano">
      <label>Matéria da prova<input type="text" name="materia" maxlength="60" required autocomplete="off" placeholder="Ex.: física" value="${escHtml(materia)}"></label>
      <label>Dia da prova<small>Vazio = a Ely procura a prova nas suas tarefas.</small><input type="date" name="dia"></label>
      <label>Horário das sessões<input type="time" name="hora" value="19:00"></label>
      <label>Assuntos<small>Separados por vírgula. Vazio = a Ely sugere.</small><input type="text" name="assuntos" maxlength="400" autocomplete="off" placeholder="Ex.: cinemática, dinâmica, energia"></label>
      <div class="home-acoes"><button type="submit" class="principal">${ico("sparkles", "ico-sm")}<span>Montar</span></button></div>
    </form>
    <div id="est-plano-previa"></div>`,
    aoAbrir: (corpo, signal) => {
      const f = corpo.querySelector("form");
      const previa = corpo.querySelector("#est-plano-previa");
      f.materia.focus();
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const botao = f.querySelector("button[type=submit]");
        botao.disabled = true;
        const assuntos = f.assuntos.value.split(",").map(s => s.trim()).filter(Boolean);
        const r = await window.nx.rpc("estudo.planejar", { materia: f.materia.value.trim(), ...(f.dia.value ? { dia: f.dia.value } : {}), ...(f.hora.value ? { hora: f.hora.value } : {}), assuntos });
        botao.disabled = false;
        if (r.error) { showToast(r.error, true); return; }
        itens = r.result.itens ?? [];
        previa.innerHTML = `<p class="gp-nota">${escHtml(r.result.resumo)}</p>` + (itens.length
          ? itens.map(it => `<label class="hoje-linha despejo-item"><input type="checkbox" data-plano-id="${escHtml(it.id)}" checked>
              <span>${escHtml(it.texto)}</span><b>${escHtml(it.rotulo ?? "")}</b></label>`).join("")
            + `<div class="home-acoes"><button class="principal" data-plano-salvar="1">${ico("check", "ico-sm")}<span>Salvar as sessões marcadas</span></button></div>`
          : "");
      }, { signal });
      previa.addEventListener("click", async (e) => {
        if (!e.target.closest("[data-plano-salvar]")) return;
        const marcados = new Set([...previa.querySelectorAll("[data-plano-id]:checked")].map(c => c.dataset.planoId));
        const escolhidos = itens.filter(it => marcados.has(it.id));
        if (!escolhidos.length) { showToast("Nada marcado."); return; }
        const r = await window.nx.rpc("despejo.aplicar", { itens: escolhidos });
        if (r.error) { showToast(r.error, true); return; }
        showToast(r.result.mensagem);
        fecharGaveta();
        carregarHoje();
      }, { signal });
    },
  });
}
