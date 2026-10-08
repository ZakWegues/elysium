// dashboard/js/pc.js — aba PC: catálogo, vitais, mídia, painéis.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// ABA PC
// ─────────────────────────────────────────────────
//
// Terceira encarnação desta aba. Nasceu "PC" com gráficos que não levavam a lugar nenhum,
// virou "Programas" (só o que se faz com o PC) e agora volta a ser "PC" com o que o Zak
// pediu no bloco 66: "coloque tudo o que tem no mobile no desktop". São os painéis da aba
// PC do celular (bloco 56) — Programas, Processos, Energia, Transferência, Lembretes,
// Memória, Monitor — menos espelho e trackpad, que não fazem sentido no próprio PC, e mais
// Presets e Rede. Sinais vitais e mídia ficam sempre à vista; o resto abre na gaveta
// genérica, a mesma de Ajustes.

const pcEl = () => document.getElementById("view-pc");

/**
 * Catálogo agrupado por COMANDO, não por nome falado.
 *
 * O `apps.json` tem ~75 chaves para ~40 programas: "calc", "calculadora" e "calculator"
 * apontam para o mesmo `calc.exe`, porque o Whisper varia (§5). Isso é ótimo para a voz e
 * péssimo para uma grade de botões. Cada entrada aqui é um programa: `nome` é o apelido
 * mais descritivo (o mais longo; empate vai pro que tem acento), `apelidos` são todos.
 */
let progCatalogo = [];      // [{ nome, apelidos: string[], chaves: string[] }]
let progAbertos = null;     // null = ainda não perguntou; [] = perguntou, nada aberto

// O `#2` é o sufixo de instância dos contadores de desempenho ("chrome#2"): sem tirar,
// "chrome" nunca casava com o Chrome aberto.
const normalizarApp = (x) => String(x).toLowerCase().replace(/#\d+$/, "").replace(/\.exe$/, "").replace(/[^a-z0-9]/g, "");
const semSufixo = (x) => String(x).replace(/#\d+$/, "");

function agruparCatalogo(apps) {
  const porComando = new Map();
  for (const a of apps) {
    const key = typeof a === "string" ? a : a?.key;
    if (!key) continue;
    const cmd = (typeof a === "string" ? a : a.command) || key;
    if (!porComando.has(cmd)) porComando.set(cmd, []);
    porComando.get(cmd).push(key);
  }
  const temAcento = (s) => /[à-ú]/i.test(s);
  return [...porComando.entries()].map(([comando, apelidos]) => {
    const nome = apelidos.slice().sort((a, b) =>
      (b.length - a.length) || (Number(temAcento(b)) - Number(temAcento(a))) || a.localeCompare(b))[0];
    const exe = String(comando).split(/[\\/]/).pop().split(/\s+/)[0].replace(/\.exe$/i, "");
    return { nome, apelidos, chaves: [...apelidos, exe].map(normalizarApp) };
  }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function garantirCatalogo() {
  if (progCatalogo.length) return progCatalogo;
  try { progCatalogo = agruparCatalogo((await window.nx.rpc("apps.list")).result?.apps ?? []); }
  catch { progCatalogo = []; }
  return progCatalogo;
}

/** `apps.running` = processos com janela, cruzados com o catálogo. */
async function lerAbertos() {
  await garantirCatalogo();
  try {
    const rp = await window.nx.rpc("apps.running");
    const rodando = new Set((rp.result?.apps ?? []).map(p => normalizarApp(p.name)));
    progAbertos = progCatalogo.filter(p => p.chaves.some(k => rodando.has(k))).map(p => p.nome);
  } catch { progAbertos = []; }
  return progAbertos;
}

// ── Sinais vitais ─────────────────────────────────
//
// A telemetria chega a cada 3 s pelo IPC enquanto a janela está visível (main.ts). Aqui
// ela vira histórico curto para a faísca — 40 amostras, dois minutos.
let pcTelemetria = null;
const pcHistorico = { cpu: [], ram: [] };
const PC_HIST_MAX = 40;

function registrarTelemetria(t) {
  pcTelemetria = t;
  pcHistorico.cpu.push(Number(t.cpu_pct) || 0);
  pcHistorico.ram.push(Number(t.ram_pct) || 0);
  if (pcHistorico.cpu.length > PC_HIST_MAX) pcHistorico.cpu.shift();
  if (pcHistorico.ram.length > PC_HIST_MAX) pcHistorico.ram.shift();
}

/** Faísca: área + linha, 100 pontos de largura, 0–100 de altura. */
function faisca(valores) {
  if (valores.length < 2) return "";
  const n = valores.length;
  const pts = valores.map((v, i) => [(i / (n - 1)) * 100, 40 - (Math.max(0, Math.min(100, v)) / 100) * 36]);
  const linha = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return `<svg class="vital-faisca" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
    <path class="area" d="${linha} L100 40 L0 40 Z"/><path class="linha" d="${linha}"/></svg>`;
}

function tempoLigado(seg) {
  if (!seg) return "";
  const d = Math.floor(seg / 86400), h = Math.floor((seg % 86400) / 3600), m = Math.floor((seg % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}

function desenharVitais() {
  const alvo = document.getElementById("pc-vitais");
  if (!alvo) return;
  const t = pcTelemetria;
  if (!t) { alvo.innerHTML = `<div class="home-empty prog-procurando">${ico("refresh", "ico-sm")}<span>Lendo o estado do PC…</span></div>`; return; }
  const disco = (t.disks ?? []).find(d => /^c/i.test(d.name)) ?? (t.disks ?? [])[0];
  const cpu = Math.round(t.cpu_pct ?? 0), ram = Math.round(t.ram_pct ?? 0);
  const extras = [];
  if (typeof t.cpu_temp === "number") extras.push(`${t.cpu_temp}°C`);
  if (typeof t.battery_pct === "number") extras.push(`bateria ${t.battery_pct}%${t.battery_charging ? " ⚡" : ""}`);
  alvo.innerHTML = `
    <div class="vital${cpu >= 90 ? " quente" : ""}">
      <div class="vital-rotulo">${ico("cpu", "ico-sm")}<span>Processador</span></div>
      <div class="vital-valor" id="vital-cpu">${cpu}<small>%</small></div>
      <div class="vital-sub">${escHtml(extras[0] ?? (t.processes?.[0] ? `maior: ${semSufixo(t.processes[0].name)}` : "—"))}</div>
      ${faisca(pcHistorico.cpu)}
    </div>
    <div class="vital${ram >= 90 ? " quente" : ""}">
      <div class="vital-rotulo">${ico("layers", "ico-sm")}<span>Memória</span></div>
      <div class="vital-valor" id="vital-ram">${ram}<small>%</small></div>
      <div class="vital-sub">${t.ram_total_gb ? `${t.ram_used_gb} de ${t.ram_total_gb} GB` : "—"}</div>
      ${faisca(pcHistorico.ram)}
    </div>
    <div class="vital">
      <div class="vital-rotulo">${ico("hard-drive", "ico-sm")}<span>Disco ${escHtml(disco?.name ?? "")}</span></div>
      <div class="vital-valor">${disco ? `${disco.freeGB}<small>GB livres</small>` : "—"}</div>
      <div class="vital-sub">${disco ? `${Math.round(disco.usedPct)}% usado de ${disco.totalGB} GB` : "sem leitura"}</div>
      ${disco ? barra(disco.usedPct) : ""}
    </div>
    <div class="vital">
      <div class="vital-rotulo">${ico("clock", "ico-sm")}<span>Ligado há</span></div>
      <div class="vital-valor" style="font-size:20px">${escHtml(tempoLigado(t.uptime_sec) || "—")}</div>
      <div class="vital-sub">${escHtml(extras[1] ?? (t.disks?.length > 1 ? `${t.disks.length} discos` : "sem bateria"))}</div>
    </div>`;
}

/** Só os números, sem redesenhar (a faísca é redesenhada, é barata). */
function pulsarVitais(t) {
  registrarTelemetria(t);
  if (layoutEl.getAttribute("data-view") !== "pc") return;
  desenharVitais();
}

// ── Mídia e volume ────────────────────────────────
let pcSpotify = null;
/** { nivel, mudo } do `volume.get` (bloco 86), ou null antes da primeira leitura. */
let pcVolume = null;

async function lerVolumePc() {
  try { const r = await window.nx.rpc("volume.get"); pcVolume = r?.result ?? null; } catch { pcVolume = null; }
  desenharMidia();
}

function desenharMidia() {
  const alvo = document.getElementById("pc-midia");
  if (!alvo) return;
  const n = pcSpotify;
  const agora = n
    ? `${n.albumArt ? `<img src="${escHtml(n.albumArt)}" alt="">` : ""}<div style="min-width:0"><div class="faixa">${escHtml(n.track ?? "")}</div><div class="artista">${escHtml(n.artist ?? "")}</div></div>`
    : `<span class="vazio">Teclas de mídia do sistema — valem para qualquer player.</span>`;
  alvo.innerHTML = `
    <div class="pc-midia-agora">${agora}</div>
    <div class="mus-ctrl">
      <button data-media="previous" title="Anterior">${ico("skip-back", "ico-sm")}</button>
      <button data-media="play" class="principal" title="Play/Pause">${ico(n?.isPlaying ? "pause" : "play")}</button>
      <button data-media="skip" title="Próxima">${ico("skip-forward", "ico-sm")}</button>
    </div>
    <div class="pc-vol${pcVolume?.mudo ? " mudo" : ""}">
      <button data-volume="${pcVolume?.mudo ? "unmute" : "mute"}" title="${pcVolume?.mudo ? "Tirar do mudo" : "Mudo"}">${ico(pcVolume?.mudo ? "volume-x" : (pcVolume?.nivel ?? 50) < 50 ? "volume-1" : "volume", "ico-sm")}</button>
      <input type="range" id="pc-vol-range" min="0" max="100" step="1" value="${pcVolume?.nivel ?? 50}" aria-label="Volume do PC"${pcVolume ? "" : " disabled"}>
      <span id="pc-vol-num">${pcVolume ? `${pcVolume.nivel}%` : "…"}</span>
    </div>`;
}

// ── Os painéis ────────────────────────────────────
//
// Cada painel: `render()` devolve o HTML da gaveta; `clique(e, corpo)` trata os botões
// dele (delegado por #gaveta-corpo); `resumo()` é a linha do azulejo.
const PAINEIS_PC = {
  programas: {
    titulo: "Programas", icone: "grid", resumo: () => progAbertos === null ? "Abrir e fechar" : `${progAbertos.length} abertos agora`,
    async render(filtro = "") {
      await garantirCatalogo();
      const q = filtro.trim().toLowerCase();
      const lista = q ? progCatalogo.filter(p => p.apelidos.some(k => k.toLowerCase().includes(q))) : progCatalogo;
      const abertos = progAbertos === null
        ? `<div class="home-empty prog-procurando">${ico("refresh", "ico-sm")}<span>Procurando o que está aberto…</span></div>`
        : progAbertos.length === 0 ? `<div class="home-empty">Nenhum programa conhecido aberto.</div>`
        : `<div class="gp-lista">` + progAbertos.map(k =>
            `<div class="gp-linha"><span class="pontinho"></span><span class="gp-nome">${escHtml(k)}</span>
             <button data-fechar="${escHtml(k)}" title="Fechar ${escHtml(k)}">${ico("x", "ico-sm")}</button></div>`).join("") + `</div>`;
      return `
        <div class="gp-secao"><h4>Abertos agora</h4>${abertos}</div>
        <div class="gp-secao"><h4>Abrir</h4>
          <input type="text" class="gp-busca" id="gp-busca-prog" placeholder="Buscar programa… (vale apelido: calc, notas, chrome)" autocomplete="off" value="${escHtml(filtro)}">
          <div class="pilulas">${lista.slice(0, 60).map(p =>
            `<button class="pilula" data-abrir="${escHtml(p.nome)}" title="${escHtml(p.apelidos.join(" · "))}">${escHtml(p.nome)}</button>`).join("") || `<div class="home-empty">Nada com esse nome.</div>`}</div>
        </div>`;
    },
    async clique(e) {
      const fechar = e.target.closest("[data-fechar]");
      if (fechar) {
        fechar.disabled = true;
        try {
          const r = await window.nx.rpc("apps.close", { name: fechar.dataset.fechar });
          if (r.result?.cancelado) return;
          showToast(r.result?.message ?? "Fechado.");
          await lerAbertos(); redesenharPainel();
        } catch { showToast("Não consegui fechar.", true); }
        return;
      }
      const abrir = e.target.closest("[data-abrir]");
      if (abrir) {
        try { await window.nx.rpc("apps.open", { name: abrir.dataset.abrir }); showToast(`Abrindo ${abrir.dataset.abrir}…`); }
        catch { showToast("Não consegui abrir.", true); }
        setTimeout(async () => { await lerAbertos(); redesenharPainel(); desenharGradePc(); }, 1800);
      }
    },
    input(e) {
      if (e.target.id !== "gp-busca-prog") return;
      redesenharPainel(e.target.value, "#gp-busca-prog");
    },
  },

  processos: {
    titulo: "Processos", icone: "cpu-chip", resumo: () => pcTelemetria?.processes?.[0] ? `maior: ${semSufixo(pcTelemetria.processes[0].name)}` : "Encerrar à força",
    ordem: "cpu",
    async render(filtro = "") {
      let procs = [];
      try { procs = (await window.nx.rpc("system.processes")).result?.processes ?? []; }
      catch { procs = pcTelemetria?.processes ?? []; }
      const q = filtro.trim().toLowerCase();
      procs = procs.filter(p => !q || semSufixo(p.name).toLowerCase().includes(q));
      procs.sort((a, b) => this.ordem === "ram" ? (b.ramMB ?? 0) - (a.ramMB ?? 0) : (b.cpu ?? 0) - (a.cpu ?? 0));
      return `
        <input type="text" class="gp-busca" id="gp-busca-proc" placeholder="Filtrar por nome…" autocomplete="off" value="${escHtml(filtro)}">
        <div class="gp-chips">
          <button data-ordem="cpu" class="${this.ordem === "cpu" ? "aceso" : ""}">Por CPU</button>
          <button data-ordem="ram" class="${this.ordem === "ram" ? "aceso" : ""}">Por memória</button>
          <button data-ordem="reler">${ico("refresh", "ico-sm")} Reler</button>
        </div>
        <div class="gp-lista">${procs.map(p => `
          <div class="gp-linha">${ico("cpu", "ico-sm")}
            <span class="gp-nome" title="PID ${p.pid}">${escHtml(semSufixo(p.name))}</span>
            <span class="gp-meta">${Math.round(p.ramMB ?? 0)} MB</span>
            <span class="gp-num">${Math.min(100, Math.round(p.cpu ?? 0))}% CPU</span>
            <button data-matar="${p.pid}" data-nome="${escHtml(semSufixo(p.name))}" title="Encerrar à força">${ico("x", "ico-sm")}</button>
          </div>`).join("") || `<div class="home-empty">Sem leitura de processos.</div>`}</div>
        <p class="gp-nota">Top 15 por uso. Encerrar à força passa pela confirmação do PC.</p>`;
    },
    async clique(e) {
      const ord = e.target.closest("[data-ordem]");
      if (ord) {
        if (ord.dataset.ordem !== "reler") this.ordem = ord.dataset.ordem;
        redesenharPainel(document.getElementById("gp-busca-proc")?.value ?? "", "#gp-busca-proc");
        return;
      }
      const matar = e.target.closest("[data-matar]");
      if (matar) {
        matar.disabled = true;
        try {
          const r = await window.nx.rpc("system.killProcess", { pid: Number(matar.dataset.matar) });
          if (r.result?.cancelado) return;
          showToast(`${matar.dataset.nome} encerrado.`);
          setTimeout(() => redesenharPainel(document.getElementById("gp-busca-proc")?.value ?? "", "#gp-busca-proc"), 900);
        } catch (err) { showToast(err?.message || "Não consegui encerrar.", true); }
      }
    },
    input(e) { if (e.target.id === "gp-busca-proc") redesenharPainel(e.target.value, "#gp-busca-proc"); },
  },

  energia: {
    titulo: "Energia", icone: "power", resumo: () => "Bloquear, suspender, desligar",
    minutos: 0,
    async render() {
      return `
        <div class="gp-grade-botoes">
          <button data-quick="lock">${ico("lock")}<span>Bloquear a tela<small>Win+L</small></span></button>
          <button data-quick="sleep">${ico("moon")}<span>Suspender<small>volta com o teclado</small></span></button>
          <button data-quick="print">${ico("camera")}<span>Tirar print<small>PNG na Área de Trabalho</small></span></button>
          <button data-quick="cancel">${ico("check")}<span>Cancelar desligamento<small>se houver um agendado</small></span></button>
          <button data-quick="restart" class="danger">${ico("rotate")}<span>Reiniciar<small>pede confirmação</small></span></button>
          <button data-quick="shutdown" class="danger">${ico("power")}<span>Desligar<small>pede confirmação</small></span></button>
        </div>
        <div class="gp-secao" style="margin-top:18px"><h4>Desligar daqui a</h4>
          <div class="gp-chips">${[15, 30, 60, 120].map(m => `<button data-agendar="${m}">${m >= 60 ? `${m / 60} h` : `${m} min`}</button>`).join("")}</div>
          <p class="gp-nota">O Windows agenda pelo <code>shutdown /t</code>; "Cancelar desligamento" desfaz. O celular faz o mesmo pelo painel Energia.</p>
        </div>`;
    },
    async clique(e) {
      const ag = e.target.closest("[data-agendar]");
      if (ag) {
        try {
          const r = await window.nx.rpc("power.control", { operation: "shutdown", delaySeconds: Number(ag.dataset.agendar) * 60 });
          if (r.result?.cancelado) return;
          showToast(r.result?.message ?? "Agendado.");
        } catch (err) { showToast(err?.message || "Não deu certo.", true); }
        return;
      }
      const quick = e.target.closest("[data-quick]");
      if (quick) await acaoRapida(quick);
    },
  },

  transferencia: {
    titulo: "Área de transferência", icone: "clipboard", resumo: () => "Ler, escrever, mandar pro celular",
    async render() {
      let recorte = "";
      try { recorte = (await window.nx.rpc("clipboard.get")).result?.text ?? ""; } catch { /* segue */ }
      return `
        <div class="gp-secao"><h4>Agora no PC</h4>
          <div class="clip-caixa" style="max-height:160px">${recorte ? escHtml(recorte.slice(0, 1200)) : "<i>Vazia (ou não é texto).</i>"}</div>
          <div class="home-acoes">
            <button data-clip="atualizar">${ico("refresh", "ico-sm")}<span>Reler</span></button>
            <button data-clip="celular"${recorte ? "" : " disabled"}>${ico("smartphone", "ico-sm")}<span>Mandar pro celular</span></button>
            <button data-clip="limpar"${recorte ? "" : " disabled"}>${ico("trash", "ico-sm")}<span>Limpar</span></button>
          </div>
        </div>
        <div class="gp-secao"><h4>Escrever na área de transferência</h4>
          <textarea class="gp-texto" id="gp-clip-texto" placeholder="Cole ou digite aqui e copie para o PC…"></textarea>
          <div class="home-acoes" style="margin-top:0"><button data-clip="escrever">${ico("copy", "ico-sm")}<span>Copiar para o PC</span></button></div>
        </div>`;
    },
    async clique(e) {
      const b = e.target.closest("[data-clip]");
      if (!b) return;
      try {
        if (b.dataset.clip === "atualizar") { redesenharPainel(); return; }
        if (b.dataset.clip === "celular") {
          const t = (await window.nx.rpc("clipboard.get")).result?.text ?? "";
          if (!t) return;
          await window.nx.mailboxSend(t); showToast("Mandado para o celular."); return;
        }
        if (b.dataset.clip === "limpar") { await window.nx.rpc("clipboard.set", { text: "" }); redesenharPainel(); return; }
        if (b.dataset.clip === "escrever") {
          const t = document.getElementById("gp-clip-texto")?.value ?? "";
          if (!t.trim()) return;
          await window.nx.rpc("clipboard.set", { text: t }); showToast("Copiado."); redesenharPainel();
        }
      } catch { showToast("Não deu certo.", true); }
    },
  },

  lembretes: {
    titulo: "Lembretes", icone: "bell", resumo: () => "Ver, criar e cancelar",
    async render() {
      let lista = [];
      try { lista = ((await window.nx.rpc("reminders.list")).result?.reminders ?? []).filter(x => !x.firedAt).sort((a, b) => a.dueAt - b.dueAt); } catch { /* segue */ }
      const hoje = new Date(); const pad = (n) => String(n).padStart(2, "0");
      const dataHoje = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
      return `
        <div class="gp-secao"><h4>Agendados</h4>
          <div class="gp-lista">${lista.map(r => `
            <div class="gp-linha">${ico(r.kind === "weekly" ? "repeat" : "bell", "ico-sm")}
              <span class="gp-nome">${escHtml(r.text)}</span>
              <span class="gp-meta">${escHtml(quandoTexto(r.dueAt))}${r.kind === "weekly" ? " · semanal" : ""}</span>
              <button data-cancelar="${escHtml(r.id)}" title="Cancelar">${ico("x", "ico-sm")}</button>
            </div>`).join("") || `<div class="home-empty">Nada agendado.</div>`}</div>
        </div>
        <div class="gp-secao"><h4>Novo lembrete</h4>
          <form class="gp-form" id="gp-lembrete">
            <input type="text" name="texto" placeholder="Lembrar de…" autocomplete="off" required>
            <input type="date" name="data" value="${dataHoje}" required>
            <input type="time" name="hora" required>
            <select name="kind"><option value="once">uma vez</option><option value="weekly">toda semana</option></select>
            <button type="submit">${ico("check", "ico-sm")}Criar</button>
          </form>
          <p class="gp-nota">O PC avisa por voz e notificação na hora; o celular também recebe.</p>
        </div>`;
    },
    async clique(e) {
      const c = e.target.closest("[data-cancelar]");
      if (!c) return;
      try { await window.nx.rpc("reminders.cancel", { id: c.dataset.cancelar }); showToast("Cancelado."); redesenharPainel(); }
      catch { showToast("Não consegui cancelar.", true); }
    },
    async submit(e) {
      if (e.target.id !== "gp-lembrete") return;
      e.preventDefault();
      const fd = new FormData(e.target);
      const [h, m] = String(fd.get("hora") || "").split(":").map(Number);
      const [Y, M, D] = String(fd.get("data") || "").split("-").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(Y)) return;
      const quando = new Date(Y, M - 1, D, h, m || 0, 0, 0);
      try {
        await window.nx.rpc("reminders.create", { text: String(fd.get("texto") || "").trim(), dueAt: quando.getTime(), kind: String(fd.get("kind") || "once") });
        showToast(`Lembrete para ${quandoTexto(quando.getTime())}.`);
        redesenharPainel();
      } catch (err) { showToast(err?.message || "Não consegui criar.", true); }
    },
  },

  memoria: {
    titulo: "Memória", icone: "bookmark", resumo: () => "O que a Ely lembra de você",
    async render() {
      let fatos = [];
      try { fatos = (await window.nx.rpc("memory.list")).result?.facts ?? []; } catch { /* segue */ }
      return `
        <div class="gp-secao"><h4>Fatos guardados</h4>
          <div class="gp-lista">${fatos.map(f => `
            <div class="gp-linha">${ico("bulb", "ico-sm")}<span class="gp-nome" style="white-space:normal" title="${escHtml(f.text)}">${escHtml(f.text)}</span>
              <button data-esquecer="${escHtml(f.id)}" title="Esquecer">${ico("x", "ico-sm")}</button></div>`).join("") || `<div class="home-empty">Nada guardado. Diga "lembre que…" ou escreva abaixo.</div>`}</div>
        </div>
        <div class="gp-secao"><h4>Guardar um fato</h4>
          <form class="gp-form" id="gp-memoria">
            <input type="text" name="texto" placeholder="Ex.: meu carro é um Civic prata" autocomplete="off" required>
            <button type="submit">${ico("plus", "ico-sm")}Guardar</button>
          </form>
          <p class="gp-nota">Entra no prompt de toda conversa. É a mesma lista que o celular mostra.</p>
        </div>`;
    },
    async clique(e) {
      const b = e.target.closest("[data-esquecer]");
      if (!b) return;
      try { const r = await window.nx.rpc("memory.remove", { id: b.dataset.esquecer }); if (r.cancelado) return; showToast("Esquecido."); redesenharPainel(); }
      catch { showToast("Não consegui esquecer.", true); }
    },
    async submit(e) {
      if (e.target.id !== "gp-memoria") return;
      e.preventDefault();
      const texto = String(new FormData(e.target).get("texto") || "").trim();
      if (!texto) return;
      try { await window.nx.rpc("memory.add", { text: texto }); showToast("Guardado."); redesenharPainel(); }
      catch { showToast("Não consegui guardar.", true); }
    },
  },

  presets: {
    titulo: "Presets", icone: "sliders", resumo: () => "Rotinas de um clique",
    async render() {
      let lista = [];
      try { lista = (await window.nx.rpc("presets.list")).result?.presets ?? []; } catch { /* segue */ }
      return `
        <div class="gp-lista">${lista.map(p => `
          <div class="gp-linha">${ico(p.icon, "ico-sm")}
            <span class="gp-nome">${escHtml(p.name)}<div class="gp-meta" style="white-space:normal">${escHtml(p.description || "")}</div></span>
            <span class="gp-meta">${p.actions} ${p.actions === 1 ? "ação" : "ações"}</span>
            <button class="ok" data-rodar="${escHtml(p.name)}" title="Rodar">${ico("play", "ico-sm")}</button>
            <button data-apagar="${escHtml(p.name)}" title="Apagar">${ico("trash", "ico-sm")}</button>
          </div>`).join("") || `<div class="home-empty">Nenhum preset. Diga "cria um preset chamado…" no chat.</div>`}</div>
        <p class="gp-nota">Criar preset continua sendo pelo chat ("cria um preset modo trabalho que abre o VS Code e o Spotify"): é o cérebro que traduz a frase em ações.</p>`;
    },
    async clique(e) {
      const r = e.target.closest("[data-rodar]");
      if (r) {
        try { const x = await window.nx.rpc("presets.run", { name: r.dataset.rodar }); showToast(x.result?.reply ?? `Rodando ${r.dataset.rodar}…`); }
        catch { showToast("Não consegui rodar.", true); }
        return;
      }
      const a = e.target.closest("[data-apagar]");
      if (a) {
        try { const x = await window.nx.rpc("presets.delete", { name: a.dataset.apagar }); if (x.cancelado) return; showToast("Apagado."); redesenharPainel(); }
        catch { showToast("Não consegui apagar.", true); }
      }
    },
  },

  // Bloco 87: janela por janela (EnumWindows), não programa por programa — o Chrome com
  // três janelas são três linhas, e cada botão age no hwnd daquela.
  janelas: {
    titulo: "Janelas", icone: "layers", resumo: () => pcJanelas ? `${pcJanelas.length} abertas` : "Focar, minimizar, só esta",
    async render() {
      try { pcJanelas = (await window.nx.rpc("window.list")).result?.janelas ?? []; } catch { pcJanelas = []; }
      if (!pcJanelas.length) return `<div class="home-empty">Nenhuma janela aberta — ou não consegui ler.</div>`;
      return `
        <div class="gp-lista gp-janelas">${pcJanelas.map(j => `
          <div class="gp-linha${j.emFoco ? " em-foco" : ""}${j.minimizada ? " minimizada" : ""}">
            ${ico(j.minimizada ? "minus" : "monitor", "ico-sm")}
            <span class="gp-nome" title="${escHtml(j.titulo)}">${escHtml(j.titulo)}<small>${escHtml(j.processo)}${j.minimizada ? " · minimizada" : j.maximizada ? " · maximizada" : ""}</small></span>
            <button data-janela="focar" data-hwnd="${j.hwnd}" title="Trazer para a frente">${ico("eye", "ico-sm")}</button>
            <button data-janela="so_esta" data-hwnd="${j.hwnd}" title="Só esta (minimiza as outras)">${ico("sparkles", "ico-sm")}</button>
            <button data-janela="${j.minimizada ? "restaurar" : "minimizar"}" data-hwnd="${j.hwnd}" title="${j.minimizada ? "Restaurar" : "Minimizar"}">${ico(j.minimizada ? "chevron-up" : "minus", "ico-sm")}</button>
            <button data-janela="fechar" data-hwnd="${j.hwnd}" title="Fechar (o programa pergunta se quer salvar)">${ico("x", "ico-sm")}</button>
          </div>`).join("")}</div>
        <p class="gp-nota">"Só esta" minimiza todas as outras de uma vez. Fechar é o X da janela, não força.</p>`;
    },
    async clique(e) {
      const b = e.target.closest("[data-janela]");
      if (!b) return;
      b.disabled = true;
      try {
        const r = await window.nx.rpc("window.control", { hwnd: b.dataset.hwnd, operacao: b.dataset.janela });
        showToast(r.result?.message ?? "Feito.");
      } catch (err) { showToast(err?.message || "Não consegui.", true); }
      setTimeout(() => { redesenharPainel(); desenharGradePc(); }, 500);
    },
  },

  // Fase 12: o que ocupa o disco e o que dá para liberar sem risco. Nada em Downloads é
  // apagado daqui — só se abre a pasta e se mostra o arquivo.
  armazenamento: {
    titulo: "Armazenamento", icone: "hard-drive",
    resumo: () => {
      const c = (pcTelemetria?.disks ?? [])[0];
      return c ? `${c.freeGB} GB livres no ${c.name}${c.usedPct >= 95 ? " — quase cheio" : ""}` : "O que ocupa o disco";
    },
    async render() {
      let a;
      try { a = (await window.nx.rpc("storage.info", pcArmazenamentoForcar ? { forcar: true } : {})).result; }
      catch (err) { return `<div class="home-empty">Não consegui medir: ${escHtml(err?.message ?? "erro")}</div>`; }
      finally { pcArmazenamentoForcar = false; }
      const tam = (b) => b >= 1e9 ? `${(b / 1e9).toFixed(1).replace(".", ",")} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.round(b / 1e3)} kB`;
      const discos = (a.discos ?? []).map(d => `
        <div class="arm-disco${d.usedPct >= 95 ? " critico" : d.usedPct >= 88 ? " alto" : ""}">
          <div class="arm-disco-topo"><strong>Disco ${escHtml(d.name)}</strong><span>${String(d.freeGB).replace(".", ",")} GB livres de ${String(d.totalGB).replace(".", ",")} GB</span></div>
          <div class="arm-barra"><span style="transform:scaleX(${Math.min(1, (d.usedPct ?? 0) / 100)})"></span></div>
        </div>`).join("");
      const linha = (icone, nome, bytes, nota, botao) => `
        <div class="gp-linha">${ico(icone, "ico-sm")}<span class="gp-nome">${escHtml(nome)}<small>${escHtml(nota)}</small></span><strong class="arm-tam">${tam(bytes)}</strong>${botao}</div>`;
      // Nome primeiro, pasta embaixo: o que distingue um arquivo do outro é o fim do caminho.
      const grandes = (a.grandes ?? []).map(g => {
        const partes = String(g.nome).split(/[\\/]/);
        const base = partes.pop();
        const pasta = ["Downloads", ...partes].join("\\");
        return `
        <div class="gp-linha">${ico("file-text", "ico-sm")}<span class="gp-nome" title="${escHtml(g.nome)}">${escHtml(base)}<small>${escHtml(pasta)} · ${new Date(g.em).toLocaleDateString("pt-BR")}</small></span><strong class="arm-tam">${tam(g.bytes)}</strong><button data-arm="abrir" data-alvo="arquivo" data-nome="${escHtml(g.nome)}" title="Mostrar na pasta" class="ok">${ico("external", "ico-sm")}</button></div>`;
      }).join("");
      return `
        <div class="gp-secao"><h4>Discos</h4>${discos || `<div class="home-empty">Nenhum disco lido.</div>`}</div>
        <div class="gp-secao"><h4>O que dá para liberar</h4>
          <div class="gp-lista gp-arm">
            ${linha("trash", "Lixeira", a.lixeira, "Some de vez ao esvaziar", `<button class="texto" data-arm="limpar" data-alvo="lixeira"${a.lixeira ? "" : " disabled"}>Esvaziar</button>`)}
            ${linha("rotate", "Arquivos temporários", a.temp, "Apaga só o que tem mais de 2 dias", `<button class="texto" data-arm="limpar" data-alvo="temp"${a.temp ? "" : " disabled"}>Limpar</button>`)}
            ${linha("download", "Downloads", a.downloads, "Você decide o que sai", `<button class="texto ok" data-arm="abrir" data-alvo="downloads">Abrir</button>`)}
          </div>
        </div>
        ${grandes ? `<div class="gp-secao"><h4>Maiores em Downloads</h4><div class="gp-lista gp-arm">${grandes}</div></div>` : ""}
        <div class="home-acoes" style="margin-top:0">
          <button data-arm="abrir" data-alvo="limpeza">${ico("sparkles", "ico-sm")}<span>Limpeza de Disco do Windows</span></button>
          <button data-arm="abrir" data-alvo="configuracoes">${ico("settings", "ico-sm")}<span>Armazenamento do Windows</span></button>
          <button data-arm="medir">${ico("refresh", "ico-sm")}<span>Medir de novo</span></button>
        </div>
        <p class="gp-nota">Medido ${new Date(a.medidoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. A Limpeza de Disco do Windows alcança o que o app não mexe (cache de atualizações, pontos antigos).</p>`;
    },
    async clique(e) {
      const b = e.target.closest("[data-arm]");
      if (!b) return;
      if (b.dataset.arm === "medir") { pcArmazenamentoForcar = true; await redesenharPainel(); return; }
      b.disabled = true;
      try {
        if (b.dataset.arm === "limpar") {
          const r = await window.nx.rpc("storage.clean", { alvo: b.dataset.alvo });
          if (r?.result?.cancelado) return;
          showToast(r?.result?.message ?? "Feito.");
          await redesenharPainel();
        } else {
          const r = await window.nx.rpc("storage.open", { alvo: b.dataset.alvo, nome: b.dataset.nome });
          showToast(r?.result?.message ?? "Aberto.", r?.result?.ok === false);
        }
      } catch (err) { showToast(err?.message || "Não deu certo.", true); }
      finally { b.disabled = false; }
    },
  },

  rede: {
    titulo: "Rede e celular", icone: "wifi", resumo: () => "IPs, porta e pareamento",
    async render() {
      let info = {};
      try { info = (await window.nx.getPairingInfo()) ?? {}; } catch { /* sem rede */ }
      const ends = (info.endpoints ?? []).map(e => `<div><span>${escHtml(e.iface || "rede")}${e.tunnel ? " · túnel" : ""}</span><code>${escHtml(e.address)}</code></div>`).join("");
      return `
        <div class="gp-secao"><h4>Este PC na rede</h4>
          <div class="gp-info">${ends || `<div><span>IP</span><code>${escHtml(info.ip ?? "—")}</code></div>`}
            <div><span>Porta do ELYSIUM</span><code>${escHtml(String(info.port ?? 4200))}</code></div>
          </div>
        </div>
        <div class="gp-secao"><h4>Celular</h4>
          <div class="home-acoes" style="margin-top:0">
            <button data-rede="parear">${ico("smartphone", "ico-sm")}<span>Abrir o QR de pareamento</span></button>
            <button data-rede="ping">${ico("phone-call", "ico-sm")}<span>Mandar "oi" pro celular</span></button>
          </div>
          <p class="gp-nota">O QR está também no orbe da Início e em Ajustes → Celular. Fora de casa, o acesso vai pelo túnel (Ajustes → Celular).</p>
        </div>`;
    },
    async clique(e) {
      const b = e.target.closest("[data-rede]");
      if (!b) return;
      if (b.dataset.rede === "parear") { switchView("ajustes"); setTimeout(() => abrirSecao("celular"), 80); return; }
      try { await window.nx.mailboxSend("oi — teste do PC"); showToast("Recado mandado."); } catch { showToast("Não consegui mandar.", true); }
    },
  },
};

const ORDEM_PAINEIS_PC = ["programas", "janelas", "processos", "armazenamento", "energia", "transferencia", "lembretes", "memoria", "presets", "rede"];
/** "Medir de novo" pede ao PC ignorar o cache de 5 min na próxima leitura. */
let pcArmazenamentoForcar = false;
/** A última leitura do `window.list` — só para o resumo do azulejo. */
let pcJanelas = null;
let painelPcAberto = null;   // id do painel que está na gaveta

/** Ações rápidas de energia/print, compartilhadas pela gaveta e pelos cards da Início. */
async function acaoRapida(botao) {
  const acoes = {
    print:    () => window.nx.rpc("screen.screenshot"),
    lock:     () => window.nx.rpc("power.control", { operation: "lock" }),
    sleep:    () => window.nx.rpc("power.control", { operation: "sleep" }),
    restart:  () => window.nx.rpc("power.control", { operation: "restart" }),
    shutdown: () => window.nx.rpc("power.control", { operation: "shutdown" }),
    cancel:   () => window.nx.rpc("power.control", { operation: "cancel" }),
  };
  botao.disabled = true;
  try {
    const r = await acoes[botao.dataset.quick]?.();
    if (r?.result?.cancelado) return;
    if (r?.result?.message) showToast(r.result.message);
  } catch (err) { showToast(err?.message || "Não deu certo.", true); }
  finally { botao.disabled = false; }
}

function desenharGradePc() {
  const alvo = document.getElementById("pc-grade");
  if (!alvo) return;
  alvo.innerHTML = ORDEM_PAINEIS_PC.map(id => {
    const p = PAINEIS_PC[id];
    return `<button class="aj-azulejo" data-painel-pc="${id}">
      <span class="aj-azulejo-ico">${ico(p.icone)}</span>
      <span class="aj-azulejo-txt"><span class="aj-azulejo-nome">${escHtml(p.titulo)}</span><span class="aj-azulejo-resumo">${escHtml(String(p.resumo() ?? ""))}</span></span>
      ${ico("chevron-right", "ico-sm")}</button>`;
  }).join("");
}

async function abrirPainelPc(id) {
  const p = PAINEIS_PC[id];
  if (!p) return;
  abrirGaveta({
    titulo: p.titulo, icone: p.icone, classe: "gaveta-pc",
    html: `<div class="home-empty prog-procurando">${ico("refresh", "ico-sm")}<span>Carregando…</span></div>`,
    // Abrir um painel com outro aberto fecha o anterior primeiro (e o aoFechar dele roda):
    // por isso o id só é gravado DEPOIS, e o aoFechar só zera se ainda for o dono.
    aoFechar: () => { if (painelPcAberto === id) painelPcAberto = null; desenharGradePc(); },
  });
  painelPcAberto = id;
  await redesenharPainel();
}

/**
 * Redesenha o painel aberto. `foco` é o seletor do campo que estava sendo digitado: o
 * innerHTML destrói o campo, então o foco e o cursor voltam para o novo.
 */
async function redesenharPainel(filtro = "", foco = null) {
  const id = painelPcAberto;
  const p = PAINEIS_PC[id];
  if (!p) return;
  const html = await p.render(filtro);
  if (painelPcAberto !== id) return;   // fechou (ou trocou) enquanto carregava
  const corpo = document.getElementById("gaveta-corpo");
  corpo.innerHTML = html;
  if (foco) {
    const el = corpo.querySelector(foco);
    if (el) { el.focus(); el.setSelectionRange?.(el.value.length, el.value.length); }
  }
}

/** Tudo da aba, do zero. */
let pcCarregando = false;
async function carregarPc() {
  if (pcCarregando) return;
  pcCarregando = true;
  document.getElementById("pc-reler")?.classList.add("girando");
  try {
    desenharVitais(); desenharMidia(); desenharGradePc();
    const jobs = [
      (async () => { try { registrarTelemetria((await window.nx.rpc("system.telemetry")).result ?? {}); } catch { /* segue */ } desenharVitais(); })(),
      (async () => {
        try { const n = await window.nx.spotifyNowPlaying(); const np = n?.nowPlaying ?? n; pcSpotify = np && np.track ? np : null; } catch { pcSpotify = null; }
        desenharMidia();
      })(),
      (async () => {
        try {
          const info = await window.nx.getPairingInfo();
          const ip = info?.ip || info?.endpoints?.[0]?.address;
          const sub = document.getElementById("pc-sub");
          if (sub) sub.textContent = [ip ? `${ip}:${info.port ?? 4200}` : null, pcTelemetria?.uptime_sec ? `ligado há ${tempoLigado(pcTelemetria.uptime_sec)}` : null].filter(Boolean).join(" · ") || "Os mesmos painéis do celular.";
        } catch { /* segue */ }
      })(),
      (async () => { await lerAbertos(); desenharGradePc(); })(),
      lerVolumePc(),
    ];
    await Promise.all(jobs);
  } finally {
    pcCarregando = false;
    document.getElementById("pc-reler")?.classList.remove("girando");
  }
}

// Um ouvinte só, delegado: a aba e a gaveta são redesenhadas inteiras.
pcEl()?.addEventListener("click", async (e) => {
  const az = e.target.closest("[data-painel-pc]");
  if (az) { abrirPainelPc(az.dataset.painelPc); return; }
  if (e.target.closest("#pc-reler")) { progAbertos = null; carregarPc(); return; }
  const media = e.target.closest("button[data-media]");
  if (media) { window.nx.mediaControl(media.dataset.media); return; }
  const volume = e.target.closest("button[data-volume]");
  if (volume) {
    const v = volume.dataset.volume;
    try { await window.nx.rpc("volume.set", { level: /^\d+$/.test(v) ? Number(v) : v }); }
    catch { showToast("Não consegui mexer no volume.", true); }
    lerVolumePc();
  }
});

// O slider mostra o número enquanto arrasta e só manda ao soltar: um volume.set por
// quadro seria um PowerShell por quadro.
pcEl()?.addEventListener("input", (e) => {
  if (e.target.id !== "pc-vol-range") return;
  const num = document.getElementById("pc-vol-num");
  if (num) num.textContent = `${e.target.value}%`;
});
pcEl()?.addEventListener("change", async (e) => {
  if (e.target.id !== "pc-vol-range") return;
  try { await window.nx.rpc("volume.set", { level: Number(e.target.value) }); }
  catch { showToast("Não consegui mexer no volume.", true); }
  lerVolumePc();
});
