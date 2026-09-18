// dashboard/js/boot.js — arranque: carrega config/histórico/cards, restaura a aba, ouvintes de foco.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────
(async () => {
  await Promise.all([loadHistory(), loadConfig(), loadApiKey(), carregarCards()]);
  carregarBolhasChat();
  // Non-blocking telemetry history + insights
  // Refresh every 30 s
  mostrarChatVazio();
})();

// Recado novo acende o ponto no lado "Celular" do switch — e também na aba Chat, para
// quem estiver em outra tela. Antes isso marcava a aba Caixa, que não existe mais.
window.nx.onMailboxMessage(() => {
  if (chatMode !== "self") document.getElementById("chat-tab-self")?.classList.add("tem-novidade");
  if (layoutEl.getAttribute("data-view") !== "chat") {
    document.querySelector('.vtab[data-view="chat"]')?.classList.add("has-news");
  }
});

// Restaura a última aba. `body.tabs` esconde os botões de gaveta, que não fazem mais
// sentido — as gavetas não deslizam mais.
document.body.classList.add("tabs");
try {
  let salva = localStorage.getItem(VIEW_KEY);   // `let`: a linha de baixo reatribui (era const e lançava)
  if (salva === "programas") salva = "pc";   // nome antigo da aba, gravado antes do bloco 66
  if (salva && document.querySelector(`.vtab[data-view="${salva}"]`)) switchView(salva);
  else switchView("inicio");
} catch { switchView("inicio"); }

// As bolhas trocam a cada volta para a janela — é o que faz a tela ter algo novo a dizer
// sem ficar redesenhando sozinha o tempo todo. O debounce existe porque `focus` e
// `visibilitychange` disparam juntos ao restaurar, e sem ele seriam dois sorteios.
let reSorteio = 0;
function reabriu() {
  const view = layoutEl.getAttribute("data-view");
  clearTimeout(reSorteio);
  if (view === "chat") { carregarBolhasChat(); return; }
  if (view !== "inicio") return;
  reSorteio = setTimeout(() => atualizarInicio().then(ligarArrasto), 120);
}
window.addEventListener("focus", reabriu);
document.addEventListener("visibilitychange", () => { if (!document.hidden) reabriu(); });

// A configuração dos cards chega depois do boot; redesenha assim que ela existir.
carregarCards().then(() => {
  if (layoutEl.getAttribute("data-view") === "inicio") atualizarInicio().then(ligarArrasto);
});
