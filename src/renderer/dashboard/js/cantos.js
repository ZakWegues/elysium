// dashboard/js/cantos.js — painéis retráteis nos cantos do Chat (fase 23).
//
// Pedido do Zak: "um painel com os negócios, informações do PC nos cantos do chat… eles
// devem ser retráteis". À esquerda, os vitais do PC (CPU e RAM com faísca, disco, temperatura);
// à direita, o que está tocando e o volume. Fechado, cada um vira uma alça fina na borda.
// O estado aberto/fechado fica salvo; com a janela estreita os dois somem (CSS).
//
// Os números vêm do que a aba PC já guarda (pcTelemetria, pcHistorico, pcVolume, pcSpotify):
// nada de laço novo de telemetria — o mesmo evento de 3 s alimenta os dois.

const CANTOS_KEY = "elysium_cantos_chat";
let cantosEstado = { esq: false, dir: false };
try { Object.assign(cantosEstado, JSON.parse(localStorage.getItem(CANTOS_KEY) || "{}")); } catch { /* segue */ }

function montarCantos() {
  const centro = document.getElementById("center");
  if (!centro || document.getElementById("canto-esq")) return;
  centro.insertAdjacentHTML("beforeend", `
    <aside class="canto canto-esq${cantosEstado.esq ? " aberto" : ""}" id="canto-esq" aria-label="Este PC">
      <button class="canto-alca" data-canto="esq" title="Este PC" aria-expanded="${cantosEstado.esq}">${ico("cpu", "ico-sm")}</button>
      <div class="canto-corpo" id="canto-esq-corpo"></div>
    </aside>
    <aside class="canto canto-dir${cantosEstado.dir ? " aberto" : ""}" id="canto-dir" aria-label="Tocando agora">
      <button class="canto-alca" data-canto="dir" title="Tocando agora e volume" aria-expanded="${cantosEstado.dir}">${ico("music", "ico-sm")}</button>
      <div class="canto-corpo" id="canto-dir-corpo"></div>
    </aside>`);
  desenharCantoEsq(); desenharCantoDir();
}

function desenharCantoEsq() {
  const alvo = document.getElementById("canto-esq-corpo");
  if (!alvo || !cantosEstado.esq) return;
  const t = pcTelemetria;
  if (!t) { alvo.innerHTML = `<div class="canto-titulo">Este PC</div><div class="canto-vazio">Lendo…</div>`; return; }
  const disco = (t.disks ?? []).find(d => /^c/i.test(d.name)) ?? (t.disks ?? [])[0];
  const livre = disco?.freeGB ?? null;
  alvo.innerHTML = `
    <div class="canto-titulo">Este PC</div>
    <div class="canto-vital"><span>CPU</span><b>${Math.round(t.cpu_pct ?? 0)}%</b></div>${faisca(pcHistorico.cpu)}
    <div class="canto-vital"><span>RAM</span><b>${Math.round(t.ram_pct ?? 0)}%</b></div>${faisca(pcHistorico.ram)}
    ${livre != null ? `<div class="canto-vital"><span>Disco ${escHtml(String(disco.name ?? "").replace(/[:\\]+$/, ""))}</span><b>${Math.round(livre)} GB livres</b></div>` : ""}
    ${typeof t.cpu_temp === "number" ? `<div class="canto-vital"><span>Temperatura</span><b>${Math.round(t.cpu_temp)}°</b></div>` : ""}
    ${t.uptime_sec ? `<div class="canto-vital"><span>Ligado há</span><b>${escHtml(tempoLigado(t.uptime_sec))}</b></div>` : ""}`;
}

function desenharCantoDir() {
  const alvo = document.getElementById("canto-dir-corpo");
  if (!alvo || !cantosEstado.dir) return;
  const n = pcSpotify;
  alvo.innerHTML = `
    <div class="canto-titulo">Tocando agora</div>
    ${n ? `<div class="canto-faixa">${n.albumArt ? `<img src="${escHtml(n.albumArt)}" alt="">` : ""}<div><b>${escHtml(n.track ?? "")}</b><span>${escHtml(n.artist ?? "")}</span></div></div>`
        : `<div class="canto-vazio">Nada tocando no Spotify.</div>`}
    <div class="mus-ctrl canto-ctrl">
      <button data-media="previous" title="Anterior">${ico("skip-back", "ico-sm")}</button>
      <button data-media="play" class="principal" title="Play/Pause">${ico(n?.isPlaying ? "pause" : "play", "ico-sm")}</button>
      <button data-media="skip" title="Próxima">${ico("skip-forward", "ico-sm")}</button>
    </div>
    <div class="pc-vol canto-vol${pcVolume?.mudo ? " mudo" : ""}">
      <button data-volume="${pcVolume?.mudo ? "unmute" : "mute"}" title="${pcVolume?.mudo ? "Tirar do mudo" : "Mudo"}">${ico(pcVolume?.mudo ? "volume-x" : "volume", "ico-sm")}</button>
      <input type="range" id="canto-vol-range" min="0" max="100" step="1" value="${pcVolume?.nivel ?? 50}" aria-label="Volume do PC"${pcVolume ? "" : " disabled"}>
      <span id="canto-vol-num">${pcVolume ? `${pcVolume.nivel}%` : "…"}</span>
    </div>`;
}

let cantoMusicaTimer = 0;
async function lerMusicaCanto() {
  try { const r = await window.nx.spotifyNowPlaying(); const np = r?.nowPlaying ?? r; pcSpotify = np && np.track ? np : null; } catch { /* mantém */ }
  await lerVolumePc().catch(() => {});
  desenharCantoDir();
}
/** A música só é lida com o canto direito aberto e o Chat na tela — a cada 10 s. */
function ritmoCantos() {
  clearInterval(cantoMusicaTimer);
  if (!cantosEstado.dir || layoutEl.getAttribute("data-view") !== "chat") return;
  lerMusicaCanto();
  // 31/10: também para com a janela sem foco (a guarda era só a janela escondida).
  cantoMusicaTimer = setInterval(() => { if (!document.hidden && (typeof focoJanela === "undefined" || focoJanela)) lerMusicaCanto(); }, 10_000);
}

document.getElementById("center")?.addEventListener("click", async (e) => {
  const alca = e.target.closest(".canto-alca");
  if (alca) {
    const lado = alca.dataset.canto;
    cantosEstado[lado] = !cantosEstado[lado];
    try { localStorage.setItem(CANTOS_KEY, JSON.stringify(cantosEstado)); } catch { /* segue */ }
    const el = document.getElementById(`canto-${lado}`);
    el.classList.toggle("aberto", cantosEstado[lado]);
    alca.setAttribute("aria-expanded", String(cantosEstado[lado]));
    if (lado === "esq") desenharCantoEsq(); else ritmoCantos();
    return;
  }
  if (!e.target.closest(".canto")) return;
  const media = e.target.closest("button[data-media]");
  if (media) { window.nx.mediaControl(media.dataset.media); setTimeout(lerMusicaCanto, 600); return; }
  const vol = e.target.closest("button[data-volume]");
  if (vol) {
    try { await window.nx.rpc("volume.set", { level: vol.dataset.volume }); } catch { showToast("Não consegui mexer no volume.", true); }
    lerMusicaCanto();
  }
});
document.getElementById("center")?.addEventListener("input", (e) => {
  if (e.target.id !== "canto-vol-range") return;
  const num = document.getElementById("canto-vol-num");
  if (num) num.textContent = `${e.target.value}%`;
});
document.getElementById("center")?.addEventListener("change", async (e) => {
  if (e.target.id !== "canto-vol-range") return;
  try { await window.nx.rpc("volume.set", { level: Number(e.target.value) }); } catch { showToast("Não consegui mexer no volume.", true); }
  lerVolumePc().catch(() => {});
});

window.nx.onTelemetry?.(() => { if (cantosEstado.esq && layoutEl.getAttribute("data-view") === "chat") desenharCantoEsq(); });
// Troca de aba: liga/desliga a leitura da música. O atributo é o que o switchView muda.
new MutationObserver(() => { ritmoCantos(); if (layoutEl.getAttribute("data-view") === "chat") desenharCantoEsq(); })
  .observe(layoutEl, { attributes: true, attributeFilter: ["data-view"] });

montarCantos();
// A faísca nasce do histórico: uma leitura agora, para não abrir vazio.
window.nx.rpc("system.telemetry").then(r => { if (r?.result) { registrarTelemetria(r.result); desenharCantoEsq(); } }).catch(() => {});
ritmoCantos();
