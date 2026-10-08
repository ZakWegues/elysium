// dashboard/js/abas.js — switchView, polegar, Ctrl+1..5.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// NAVEGAÇÃO POR ABAS
// ─────────────────────────────────────────────────
//
// Os mesmos destinos do celular. O trabalho pesado é CSS: com `data-view` no #layout, as
// gavetas deixam de ser painéis deslizantes e viram conteúdo de largura cheia. Nenhum
// markup foi movido — o que já funcionava continua exatamente onde estava.

const layoutEl = document.getElementById("layout");
const vtabs = document.querySelectorAll(".vtab");

/** Última aba usada, para o app reabrir onde você estava. */
const VIEW_KEY = "elysium_view";

/**
 * Posiciona o traço sob a aba ativa. Lê a geometria real do botão em vez de
 * calcular por índice, porque as abas não têm largura igual (e abaixo de 880px
 * os rótulos somem e todas encolhem).
 */
function moverPolegar() {
  const ativa = document.querySelector(".vtab.active");
  const thumb = document.getElementById("vtab-thumb");
  if (!ativa || !thumb) return;
  thumb.style.transform = `translateX(${ativa.offsetLeft}px) scaleX(${ativa.offsetWidth})`;
  thumb.style.width = "1px";
  // Largura real da aba, so para o ::after desfazer a distorcao do scaleX no raio da
  // pilula. Nao entra na transicao: quem anima continua sendo o transform acima.
  thumb.style.setProperty("--w", ativa.offsetWidth);
}
// A largura do rótulo muda quando a fonte termina de carregar, e a barra pode mudar de
// tamanho sem a janela mudar (o rótulo some abaixo de 880px). Um `resize` de janela não
// cobre nenhum dos dois casos.
document.fonts?.ready.then(moverPolegar);
new ResizeObserver(moverPolegar).observe(document.getElementById("viewtabs"));

/**
 * A animação de troca é toda CSS (`@starting-style` + `allow-discrete`). Aqui só se muda
 * o atributo — e é justamente por não haver snapshot cobrindo a página que a barrinha
 * volta a ser vista deslizando.
 */
function switchView(view) {
  // Trocar de aba com a gaveta aberta devolve o que estava nela (o QR ao popover, etc.).
  if (typeof fecharGaveta === "function") fecharGaveta();
  layoutEl.setAttribute("data-view", view);
  vtabs.forEach(b => {
    const ativa = b.dataset.view === view;
    b.classList.toggle("active", ativa);
    b.setAttribute("aria-selected", ativa ? "true" : "false");
    // Tab só para na aba ativa; entre as abas, as setas (08/10).
    b.tabIndex = ativa ? 0 : -1;
    if (ativa) b.classList.remove("has-news");
  });
  moverPolegar();
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* modo privado, ignora */ }

  // Chat e Caixa são a mesma tela em modos diferentes: reaproveita o switchChatMode que já
  // existe em vez de duplicar a lógica dos dois timelines.
  // A Caixa deixou de ser aba: virou o lado direito do switch, dentro do Chat.

  if (view === "chat") { requestAnimationFrame(moverPolegar); carregarBolhasChat(); }
  if (view === "pc") carregarPc();
  if (view === "rotinas") carregarRotinas();
  if (view === "hoje") carregarHoje();
  if (view === "inicio") atualizarInicio().then(ligarArrasto);
  // Os canvas nascem dentro de um painel oculto, e elemento em `display:none` mede zero.
  // Só ao entrar na aba dá para saber a largura real.
}

vtabs.forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));

// Acessibilidade das abas (fase 18): cada aba aponta para o seu painel (aria-controls ↔
// tabpanel), tem nome mesmo quando a janela estreita esconde o rótulo, e as setas ← → (e
// Home/End) andam entre elas, como manda o padrão de abas do WAI-ARIA.
const PAINEL_DA_ABA = { inicio: "view-inicio", chat: "center", hoje: "view-hoje", pc: "view-pc", rotinas: "view-rotinas", ajustes: "drawer-right" };
vtabs.forEach(b => {
  const nome = b.querySelector(".vtab-label")?.textContent?.trim() || b.dataset.view;
  const painel = document.getElementById(PAINEL_DA_ABA[b.dataset.view] ?? "");
  b.id = b.id || `aba-${b.dataset.view}`;
  b.setAttribute("aria-label", nome);
  b.title = b.title || nome;
  b.tabIndex = b.classList.contains("active") ? 0 : -1;
  if (painel) {
    b.setAttribute("aria-controls", painel.id);
    painel.setAttribute("role", "tabpanel");
    painel.setAttribute("aria-labelledby", b.id);
  }
});
document.getElementById("viewtabs")?.addEventListener("keydown", (e) => {
  const lista = [...vtabs];
  const i = lista.indexOf(document.activeElement);
  if (i < 0) return;
  let j = null;
  if (e.key === "ArrowRight") j = (i + 1) % lista.length;
  else if (e.key === "ArrowLeft") j = (i - 1 + lista.length) % lista.length;
  else if (e.key === "Home") j = 0;
  else if (e.key === "End") j = lista.length - 1;
  if (j === null) return;
  e.preventDefault();
  lista[j].focus();
  switchView(lista[j].dataset.view);
});

// Ctrl+1..6 percorre os destinos, como no navegador. Fica fora do input de comando para
// não roubar a digitação.
document.addEventListener("keydown", (e) => {
  if (!e.ctrlKey || e.altKey || e.shiftKey) return;
  const n = Number(e.key);
  if (!Number.isInteger(n) || n < 1 || n > vtabs.length) return;
  e.preventDefault();
  switchView(vtabs[n - 1].dataset.view);
});
