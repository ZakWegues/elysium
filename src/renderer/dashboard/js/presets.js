// dashboard/js/presets.js — bolinha e popover de presets.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// PRESETS — bolinha e popover
// ─────────────────────────────────────────────────
//
// Os presets saíram da gaveta de Ajustes e da barra de abas. Viraram um botão redondo no
// canto superior direito do conteúdo, que abre um popover estilo iOS: escala a partir do
// canto de origem, com careta apontando para o botão.
//
// O importante não é o formato, é o CANAL. A tela antiga do celular montava a frase
// "executa o preset X" e mandava para o LLM em /api/command — lento, e capaz de errar num
// comando que já se sabe qual é. Agora tudo passa pelos métodos `presets.*` do RPC, que
// não existiam até este bloco apesar de o `presetsStore` estar lá desde o começo.

const presetPop = document.getElementById("preset-pop");
const presetBtn = document.getElementById("preset-btn");
let presetsCache = [];
let modoCriar = false;

function posicionarPopover() {
  if (!presetBtn || !presetPop) return;
  const r = presetBtn.getBoundingClientRect();
  // Ancorado pela direita, alinhado à borda direita do botão: assim a careta cai sobre
  // ele em qualquer largura de janela, sem cálculo de colisão.
  presetPop.style.top = `${r.bottom + 10}px`;
  presetPop.style.right = `${window.innerWidth - r.right}px`;
}

function abrirPresets(abrir) {
  if (!presetPop) return;
  const estaAberto = presetPop.classList.contains("aberto");
  const alvo = abrir ?? !estaAberto;
  if (alvo === estaAberto) return;

  // Abrir e fechar é uma classe só. A entrada, a saída e o `display` são CSS
  // (`@starting-style` + `allow-discrete`) — sem requestAnimationFrame e sem
  // setTimeout tentando adivinhar quando a saída acabou.
  if (alvo) {
    modoCriar = false;
    posicionarPopover();
    presetPop.classList.add("aberto");
    carregarPresetsPop();
    presetBtn?.setAttribute("aria-expanded", "true");
  } else {
    presetPop.classList.remove("aberto");
    presetBtn?.setAttribute("aria-expanded", "false");
  }
}

async function carregarPresetsPop() {
  const corpo = document.getElementById("preset-pop-corpo");
  if (!corpo) return;
  try {
    const r = await window.nx.rpc("presets.list");
    presetsCache = r.result?.presets ?? [];
  } catch { presetsCache = []; }
  desenharPresetsPop();
}

function desenharPresetsPop() {
  const corpo = document.getElementById("preset-pop-corpo");
  if (!corpo) return;

  if (modoCriar) { desenharCriarPreset(corpo); return; }

  corpo.innerHTML = presetsCache.length
    ? `<div class="pop-lista mov-lista">` + presetsCache.map(p =>
        `<div class="pop-item">
          <button class="pop-rodar" data-rodar="${escHtml(p.name)}">
            ${ico(p.icon || "sliders", "ico-sm")}
            <span class="pop-nome">${escHtml(p.description || p.name)}</span>
            <span class="pop-qtd">${p.actions} ${p.actions === 1 ? "ação" : "ações"}</span>
          </button>
          <button class="pop-apagar" data-apagar="${escHtml(p.name)}" title="Apagar preset">${ico("x", "ico-sm")}</button>
        </div>`).join("") + `</div>`
    : `<div class="home-empty">Nenhum preset ainda.</div>`;

  corpo.innerHTML += `<button class="pop-novo" data-pop="criar">${ico("check", "ico-sm")}<span>Criar com o que está aberto</span></button>`;
}

/**
 * Criar preset a partir dos programas abertos agora.
 *
 * `apps.list` é o catálogo dos ~75 programas conhecidos, não o que está rodando — e
 * `system.processes` é o que está rodando, mas com nome de executável. O cruzamento dos
 * dois é o que dá uma lista que faz sentido oferecer: só programa que o ELYSIUM sabe
 * abrir depois, senão o preset nasceria com uma ação que falha.
 */
async function desenharCriarPreset(corpo) {
  corpo.innerHTML = `<div class="home-empty">Vendo o que está aberto…</div>`;
  let abertos = [];
  try {
    const [ra, rp] = await Promise.all([
      window.nx.rpc("apps.list"),
      window.nx.rpc("system.processes"),
    ]);
    const catalogo = ra.result?.apps ?? [];
    const rodando = (rp.result?.processes ?? []).filter(p => !p.isSystem);
    const normalizar = (x) => String(x).toLowerCase().replace(/\.exe$/, "").replace(/[^a-z0-9]/g, "");
    const rodandoNorm = new Set(rodando.map(p => normalizar(p.name)));
    abertos = catalogo.filter(nome => rodandoNorm.has(normalizar(nome)));
  } catch { abertos = []; }

  corpo.innerHTML = abertos.length
    ? `<div class="pop-form">
        <input type="text" id="preset-nome" placeholder="Nome do preset" autocomplete="off">
        <div class="pop-check-lista">` +
        abertos.map(nome =>
          `<label class="pop-check"><input type="checkbox" value="${escHtml(nome)}" checked><span>${escHtml(nome)}</span></label>`).join("") +
        `</div>
        <div class="pop-form-acoes">
          <button data-pop="cancelar">Cancelar</button>
          <button data-pop="salvar" class="primario">Salvar</button>
        </div>
      </div>`
    : `<div class="home-empty">Não reconheci nenhum programa aberto.</div>
       <button class="pop-novo" data-pop="cancelar">${ico("chevron-up", "ico-sm")}<span>Voltar</span></button>`;
}

presetBtn?.addEventListener("click", (e) => { e.stopPropagation(); abrirPresets(); });

presetPop?.addEventListener("click", async (e) => {
  e.stopPropagation();
  const alvo = (sel) => e.target.closest(sel);

  const rodar = alvo("button[data-rodar]");
  if (rodar) {
    const nome = rodar.dataset.rodar;
    rodar.disabled = true;
    try {
      const r = await window.nx.rpc("presets.run", { name: nome });
      showToast(r.result?.reply ?? `${nome} ativado.`);
      abrirPresets(false);
    } catch { showToast("Não consegui rodar o preset."); }
    finally { rodar.disabled = false; }
    return;
  }

  const apagar = alvo("button[data-apagar]");
  if (apagar) {
    const nome = apagar.dataset.apagar;
    try { await window.nx.rpc("presets.delete", { name: nome }); showToast(`Preset ${nome} apagado.`); await carregarPresetsPop(); }
    catch { showToast("Não consegui apagar."); }
    return;
  }

  const acao = alvo("button[data-pop]")?.dataset.pop;
  if (acao === "criar")    { modoCriar = true;  desenharPresetsPop(); return; }
  if (acao === "cancelar") { modoCriar = false; desenharPresetsPop(); return; }
  if (acao === "salvar") {
    const nome = document.getElementById("preset-nome")?.value.trim();
    const marcados = [...presetPop.querySelectorAll(".pop-check input:checked")].map(i => i.value);
    if (!nome)          { showToast("Dê um nome ao preset."); return; }
    if (!marcados.length) { showToast("Escolha ao menos um programa."); return; }
    try {
      await window.nx.rpc("presets.save", {
        name: nome,
        description: nome,
        icon: "sliders",
        actions: marcados.map(app => ({ action: "open_app", app_name: app })),
      });
      showToast(`Preset “${nome}” criado.`);
      modoCriar = false;
      await carregarPresetsPop();
    } catch { showToast("Não consegui salvar o preset."); }
  }
});

// Clicar fora e Esc fecham. O clique no próprio popover para de propagar acima, então
// este ouvinte no documento só vê o que é realmente "fora".
document.addEventListener("click", () => abrirPresets(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && presetPop?.classList.contains("aberto")) {
    e.stopPropagation();
    abrirPresets(false);
  }
}, true);
window.addEventListener("resize", () => { if (presetPop?.classList.contains("aberto")) posicionarPopover(); });
