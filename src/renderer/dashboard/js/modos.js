// dashboard/js/modos.js — modos da Ely na tela (fase 20, bloco 207).
//
// O chip acima do campo diz em que modo a Ely está ("∑ Matemática ✕"); o botão ao lado do
// clipe abre a lista. A fonte da verdade é o PC (`modos.ts`): trocar aqui, pela voz ou pelo
// celular dispara o mesmo `modo:mudou`, e o chip acompanha. Criar e apagar os modos dele
// fica em Ajustes → Modos.

const modoFaixa = document.getElementById("modo-faixa");
const modoBtn   = document.getElementById("modo-btn");
const modoPop   = document.getElementById("modo-pop");
let modoAtual = null;

function desenharChipModo(m) {
  modoAtual = m ?? null;
  modoBtn?.classList.toggle("ligado", !!modoAtual);
  if (!modoFaixa) return;
  if (!modoAtual) { modoFaixa.hidden = true; modoFaixa.innerHTML = ""; return; }
  modoFaixa.hidden = false;
  modoFaixa.innerHTML = `<span class="modo-chip" title="${escHtml(modoAtual.resumo || "")}">
    <b>${escHtml(modoAtual.icone || "✦")}</b> Modo ${escHtml(modoAtual.nome)}
    <button type="button" data-modo-sair title="Sair do modo" aria-label="Sair do modo">${ico("x", "ico-sm")}</button>
  </span>`;
}

async function trocarModo(id) {
  try {
    const r = await window.nx.rpc("modos.set", { id });
    if (r.error) { showToast(r.error, true); return; }
    desenharChipModo(r.result?.ativo ?? null);
    showToast(r.result?.ativo ? `Modo ${r.result.ativo.nome} ligado.` : "Saí do modo.");
    carregarBolhasChat();
  } catch { showToast("Não consegui trocar o modo.", true); }
}

async function abrirListaModos() {
  if (!modoPop) return;
  let lista = [];
  try { lista = (await window.nx.rpc("modos.list")).result?.modos ?? []; } catch { /* vazio */ }
  modoPop.innerHTML = `
    <div class="modo-pop-titulo">Modos da Ely</div>
    ${lista.map(m => `
      <button type="button" class="modo-op${modoAtual?.id === m.id ? " ativo" : ""}" data-modo-id="${escHtml(m.id)}">
        <b>${escHtml(m.icone || "✦")}</b>
        <span><strong>${escHtml(m.nome)}</strong><em>${escHtml(m.resumo || "")}</em></span>
      </button>`).join("")}
    ${modoAtual ? `<button type="button" class="modo-op modo-op-sair" data-modo-sair>${ico("x", "ico-sm")}<span><strong>Sair do modo</strong></span></button>` : ""}
    <button type="button" class="modo-pop-rodape" data-modo-ajustes>Criar os seus em Ajustes → Modos</button>`;
  modoPop.hidden = false;
}

function fecharListaModos() { if (modoPop) modoPop.hidden = true; }

modoBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (modoPop && !modoPop.hidden) fecharListaModos(); else abrirListaModos();
});
modoPop?.addEventListener("click", (e) => {
  e.stopPropagation();
  const op = e.target.closest("[data-modo-id]");
  if (op) { fecharListaModos(); trocarModo(op.dataset.modoId); return; }
  if (e.target.closest("[data-modo-sair]")) { fecharListaModos(); trocarModo(null); return; }
  if (e.target.closest("[data-modo-ajustes]")) { fecharListaModos(); abrirAjustesModos(); }
});
modoFaixa?.addEventListener("click", (e) => { if (e.target.closest("[data-modo-sair]")) trocarModo(null); });
document.addEventListener("click", () => fecharListaModos());
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharListaModos(); });

window.nx.onModo?.((m) => { desenharChipModo(m); carregarBolhasChat(); });
window.nx.rpc("modos.get").then(r => desenharChipModo(r.result?.ativo ?? null)).catch(() => { /* PC antigo */ });

// ── Ajustes → Modos ───────────────────────────────────────────────────────────────

function abrirAjustesModos() {
  switchView("ajustes");
  setTimeout(() => document.querySelector("[data-secao-id='modos']")?.click(), 60);
}

async function desenharModosAjustes() {
  const alvo = document.getElementById("modos-corpo");
  if (!alvo) return;
  let lista = [];
  try { lista = (await window.nx.rpc("modos.list")).result?.modos ?? []; } catch { /* vazio */ }
  const meus = lista.filter(m => m.meu);
  alvo.innerHTML = `
    <p class="cfg-nota" style="margin-top:0">Diga “modo matemática”, “modo inglês”… e a Ely muda o jeito de responder até você dizer “sai do modo” (ou ficar 6 horas sem usar). Também dá para trocar pelo botão ao lado do clipe, no chat.</p>
    <div class="home-list">${lista.filter(m => !m.meu).map(m => `
      <div class="home-item"><b class="modo-ico">${escHtml(m.icone)}</b>
        <div class="home-item-txt"><span>${escHtml(m.nome)}</span><em>${escHtml(m.resumo)}</em></div>
      </div>`).join("")}</div>
    <p class="cfg-nota" style="font-weight:600;margin:14px 0 6px">Os seus${meus.length ? ` (${meus.length} de 12)` : ""}</p>
    <div class="home-list">${meus.length ? meus.map(m => `
      <div class="home-item"><b class="modo-ico">${escHtml(m.icone)}</b>
        <div class="home-item-txt"><span>${escHtml(m.nome)}</span><em>${escHtml(m.instrucao || m.resumo)}</em></div>
        <button type="button" data-modo-apagar="${escHtml(m.id)}" title="Apagar">${ico("trash", "ico-sm")}</button>
      </div>`).join("") : `<p class="cfg-nota">Nenhum ainda. Pela voz: “cria um modo entrevistador que me faz perguntas de entrevista de emprego”.</p>`}</div>
    <form data-modo-form class="atu-form" style="flex-wrap:wrap;margin-top:10px">
      <input name="icone" placeholder="✦" maxlength="2" autocomplete="off" style="max-width:52px;text-align:center">
      <input name="nome" placeholder="Nome (ex.: Entrevistador)" maxlength="30" autocomplete="off">
      <textarea name="instrucao" placeholder="Como a Ely responde neste modo (ex.: faça uma pergunta de entrevista por vez e avalie minha resposta)" maxlength="1500" rows="3"></textarea>
      <button type="submit">Criar modo</button>
    </form>`;
}

document.getElementById("modos-corpo")?.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-modo-apagar]");
  if (!b) return;
  try {
    const r = await window.nx.rpc("modos.delete", { id: b.dataset.modoApagar });
    if (r.cancelado) return;
    if (r.error) { showToast(r.error, true); return; }
    showToast("Modo apagado.");
  } catch { showToast("Não deu certo.", true); }
  await desenharModosAjustes();
});
document.getElementById("modos-corpo")?.addEventListener("submit", async (ev) => {
  const f = ev.target.closest("[data-modo-form]");
  if (!f) return;
  ev.preventDefault();
  const nome = f.elements.nome.value.trim(), instrucao = f.elements.instrucao.value.trim(), icone = f.elements.icone.value.trim();
  if (!nome || !instrucao) { showToast("Preencha o nome e como a Ely responde.", true); return; }
  const r = await window.nx.rpc("modos.save", { nome, instrucao, ...(icone ? { icone } : {}) });
  if (r.error) { showToast(r.error, true); return; }
  showToast(`Modo “${nome}” criado. Diga “modo ${nome}” para ligar.`);
  await desenharModosAjustes();
});
