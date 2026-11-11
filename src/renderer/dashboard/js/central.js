// dashboard/js/central.js — Central de controle e gaveta das Rotinas (fase 23).
//
// A aba PC e a aba Rotinas saíram da barra. O dono pediu "um centrozinho de controle" com os
// apps favoritos em destaque, e as rotinas numa gaveta com botão próprio no topo (não no
// Hoje). As duas são gavetas da mesma `abrirGaveta` de Ajustes: #view-pc e #view-rotinas
// inteiras são emprestadas à gaveta enquanto ela está aberta (com os ouvintes delas) — por
// isso carregarPc() e carregarRotinas() servem sem mudar nada.
//
// Um painel aberto de dentro da Central (Programas, Processos…) ou um formulário de rotina
// fecha a gaveta-mãe; ao fechar o filho, ela volta. `voltarPara` guarda quem reabrir.

let voltarPara = null;   // "central" | "rotinas" | null

/** Reabre a gaveta-mãe quando o filho fecha — mas não se outra gaveta já tomou o lugar. */
function agendarVolta() {
  const alvo = voltarPara;
  if (!alvo) return;
  setTimeout(() => {
    if (gavetaAtual || voltarPara !== alvo) return;
    if (alvo === "central") abrirCentral(); else abrirRotinas();
  }, 0);
}

// ── Favoritos ─────────────────────────────────────
// Lista do próprio PC (localStorage): é preferência de tela, não dado que o celular precise.
const FAV_KEY = "elysium_apps_favoritos";
function lerFavoritos() {
  try { const v = JSON.parse(localStorage.getItem(FAV_KEY) || "null"); return Array.isArray(v) ? v : null; } catch { return null; }
}
function gravarFavoritos(lista) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(lista.slice(0, 12))); } catch { /* modo privado */ }
}
/** Sem lista salva: sugere o que está aberto agora e completa com o catálogo. */
function favoritosOuSugestao() {
  const salvos = lerFavoritos();
  if (salvos) return salvos;
  const nomes = progCatalogo.map(p => p.nome);
  return [...new Set([...(progAbertos ?? []), ...nomes])].slice(0, 8);
}

let editandoFavoritos = false;

function htmlFavoritos() {
  const favs = favoritosOuSugestao();
  if (editandoFavoritos) {
    const todos = progCatalogo.map(p => p.nome);
    return `<div class="cc-favs-edit">${todos.map(n =>
      `<button class="pilula${favs.includes(n) ? " aceso" : ""}" data-fav-alternar="${escHtml(n)}">${escHtml(n)}</button>`).join("")}</div>`;
  }
  if (!favs.length) return progCatalogo.length ? `<div class="home-empty">Nenhum favorito. Toque em Editar.</div>` : `<div class="home-empty">Carregando os programas…</div>`;
  return `<div class="cc-favs">${favs.map(n => {
    const aberto = (progAbertos ?? []).includes(n);
    return `<button class="cc-app${aberto ? " aberto" : ""}" data-cc-abrir="${escHtml(n)}" title="Abrir ${escHtml(n)}">
      <span class="cc-app-letra">${escHtml(n.charAt(0).toUpperCase())}</span><span class="cc-app-nome">${escHtml(n)}</span></button>`;
  }).join("")}</div>`;
}

function desenharFavoritos() {
  const alvo = document.getElementById("cc-favs");
  if (alvo) alvo.innerHTML = htmlFavoritos();
  const b = document.querySelector("[data-cc='editar-favs'] span");
  if (b) b.textContent = editandoFavoritos ? "Pronto" : "Editar";
}

// ── Azulejos rápidos ──────────────────────────────
const AZULEJOS_CC = [
  { id: "mudo", icone: "volume-x", nome: "Mudo" },
  { id: "foco", icone: "moon", nome: "Foco 25 min" },
  { id: "clip", icone: "clipboard", nome: "Copiado → celular" },
  { id: "print", icone: "camera", nome: "Print → celular" },
  { id: "lock", icone: "lock", nome: "Bloquear" },
  { id: "sleep", icone: "power", nome: "Suspender" },
];

async function acaoCentral(id, botao) {
  botao.disabled = true;
  try {
    if (id === "mudo") {
      await window.nx.rpc("volume.set", { level: pcVolume?.mudo ? "unmute" : "mute" });
      await lerVolumePc();
      botao.classList.toggle("aceso", !!pcVolume?.mudo);
    } else if (id === "foco") {
      const st = (await window.nx.rpc("foco.status")).result;
      if (st?.ativo) { await window.nx.rpc("foco.stop"); showToast("Modo foco desligado."); botao.classList.remove("aceso"); }
      else { await window.nx.rpc("foco.start", { minutos: 25 }); showToast("Foco por 25 minutos."); botao.classList.add("aceso"); }
    } else if (id === "clip") {
      const t = (await window.nx.rpc("clipboard.get")).result?.text ?? "";
      if (!t.trim()) { showToast("A área de transferência está vazia.", true); return; }
      await window.nx.mailboxSend(t); showToast("Mandado para o celular.");
    } else if (id === "print") {
      fecharGaveta();
      await new Promise(r => setTimeout(r, 350));   // a gaveta sai da frente antes da foto
      const r = (await window.nx.rpc("screen.capture", { maxWidth: 1920, quality: 85 })).result;
      if (!r?.base64) throw new Error("Não consegui tirar o print.");
      const nome = `print-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`;
      await window.nx.mailboxSendFile("", { name: nome, mimeType: "image/jpeg", base64: r.base64 });
      showToast("Print mandado para o celular.");
    } else {
      await acaoRapida(Object.assign(botao, { dataset: Object.assign(botao.dataset, { quick: id }) }));
    }
  } catch (err) { showToast(err?.message || "Não deu certo.", true); }
  finally { botao.disabled = false; }
}

function abrirCentral() {
  voltarPara = null;
  abrirGaveta({
    titulo: "Central de controle", icone: "sliders", classe: "gaveta-pc gaveta-central",
    html: `
      <section class="cc-secao">
        <div class="cc-cab"><h4>Apps favoritos</h4><button class="cc-mini" data-cc="editar-favs">${ico("edit", "ico-sm")}<span>Editar</span></button></div>
        <div id="cc-favs">${htmlFavoritos()}</div>
      </section>
      <section class="cc-secao"><div class="cc-azulejos">${AZULEJOS_CC.map(a =>
        `<button class="cc-azulejo${a.id === "mudo" && pcVolume?.mudo ? " aceso" : ""}" data-cc-acao="${a.id}">${ico(a.icone)}<span>${escHtml(a.nome)}</span></button>`).join("")}</div></section>
`,
    // Vitais, mídia e os azulejos dos painéis (Programas, Processos…) são a #view-pc.
    nos: ["#view-pc"],
    aoAbrir: (corpo, signal) => {
      corpo.addEventListener("click", (e) => {
        if (e.target.closest("[data-painel-pc]")) voltarPara = "central";
      }, { capture: true, signal });
      corpo.addEventListener("click", async (e) => {
        const ab = e.target.closest("[data-cc-abrir]");
        if (ab) {
          try { await window.nx.rpc("apps.open", { name: ab.dataset.ccAbrir }); showToast(`Abrindo ${ab.dataset.ccAbrir}…`); }
          catch { showToast("Não consegui abrir.", true); }
          return;
        }
        const alt = e.target.closest("[data-fav-alternar]");
        if (alt) {
          const favs = favoritosOuSugestao();
          const n = alt.dataset.favAlternar;
          gravarFavoritos(favs.includes(n) ? favs.filter(x => x !== n) : [...favs, n]);
          desenharFavoritos();
          return;
        }
        if (e.target.closest("[data-cc='editar-favs']")) {
          editandoFavoritos = !editandoFavoritos;
          if (editandoFavoritos && !lerFavoritos()) gravarFavoritos(favoritosOuSugestao());
          desenharFavoritos();
          return;
        }
        const ac = e.target.closest("[data-cc-acao]");
        if (ac) acaoCentral(ac.dataset.ccAcao, ac);
      }, { signal });
      // O catálogo pode chegar depois (carregarPc já em andamento volta na hora): redesenha quando ele vier.
      carregarPc().then(desenharFavoritos);
      garantirCatalogo().then(() => lerAbertos()).then(desenharFavoritos).catch(() => {});
    },
    aoFechar: () => { editandoFavoritos = false; },
  });
}

function abrirRotinas() {
  voltarPara = null;
  abrirGaveta({
    titulo: "Rotinas", icone: "calendar", classe: "gaveta-rotinas",
    nos: ["#view-rotinas"],
    aoAbrir: (corpo, signal) => {
      // O formulário (nova/editar) abre na própria gaveta; ao fechar, as rotinas voltam.
      corpo.addEventListener("click", (e) => {
        if (e.target.closest("#rot-nova, [data-rot-editar], [data-modelo], [data-exemplo]")) voltarPara = "rotinas";
      }, { capture: true, signal });
      carregarRotinas();
    },
  });
}

document.getElementById("nav-central")?.addEventListener("click", abrirCentral);
document.getElementById("nav-rotinas")?.addEventListener("click", abrirRotinas);
