// dashboard/js/inicio.js — tela Início: catálogo de cards, dados, desenho, arrasto, redimensionar, timer, notas, ações.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// TELA INÍCIO
// ─────────────────────────────────────────────────
//
// A Início virou um catálogo de cards: cada card se declara num registro, sabe o que
// precisa buscar e como se desenhar. Ligar, desligar e arrastar mexem só na ordem — nenhum
// card conhece os outros, e adicionar um novo é acrescentar uma entrada aqui.
//
// Tudo é lido pela ponte RPC, os mesmos métodos que o celular chama. Nenhum canal IPC novo
// foi criado para esta tela, e é isso que garante que as duas mostrem a mesma coisa sem
// serem mantidas em par.

function saudacao() {
  const h = new Date().getHours();
  if (h < 5)  return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** `dueAt` em epoch ms → "hoje 14:30", "amanhã 09:00" ou "12/09 09:00". */
function quandoTexto(epochMs) {
  const d = new Date(epochMs);
  const hoje = new Date();
  const dia = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const amanha = new Date(hoje.getTime() + 86400000);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (dia(d) === dia(hoje))   return `hoje ${hora}`;
  if (dia(d) === dia(amanha)) return `amanhã ${hora}`;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${hora}`;
}

/**
 * Anima um número inteiro do valor atual até o novo. Trocar "38%" por "61%" de um quadro
 * para o outro some com a informação de que subiu — a contagem mostra a direção sem
 * precisar de seta nem de cor.
 */
function animarNumero(el, alvo, sufixo = "%") {
  const de = parseFloat(el.dataset.num ?? "0");
  if (de === alvo || !movimentoLigado()) {
    el.dataset.num = String(alvo);
    el.textContent = Math.round(alvo) + sufixo;
    return;
  }
  el.dataset.num = String(alvo);
  const t0 = performance.now();
  cancelAnimationFrame(Number(el.dataset.raf ?? 0));
  const passo = (t) => {
    const p = Math.min(1, (t - t0) / 400);
    const e = 1 - Math.pow(1 - p, 3);   // desacelera no fim: é a parte que se lê
    el.textContent = Math.round(de + (alvo - de) * e) + sufixo;
    if (p < 1) el.dataset.raf = String(requestAnimationFrame(passo));
  };
  el.dataset.raf = String(requestAnimationFrame(passo));
}

/** Barra de métrica. `scaleX` em vez de `width`: escala é composta na GPU e não reflui. */
function barra(pct) {
  return `<div class="home-bar"><i style="transform:scaleX(${Math.max(0, Math.min(100, pct)) / 100})"></i></div>`;
}

function linhaMetrica(rotulo, valor, pct, id) {
  return `<div class="home-metric">
    <div class="home-metric-row"><span class="home-metric-label">${escHtml(rotulo)}</span>` +
    `<span class="home-metric-val"${id ? ` id="${id}"` : ""}>${escHtml(valor)}</span></div>
    ${barra(pct)}
  </div>`;
}

function vazio(texto) { return `<div class="home-empty">${escHtml(texto)}</div>`; }

/** ms → "3:07". */
function msParaTempo(ms) {
  if (!ms || ms < 0) return "0:00";
  const seg = Math.floor(ms / 1000);
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
}

/**
 * A consulta ao Spotify acontece a cada atualização da Início, o que é longe demais para
 * uma barra de progresso. Entre elas, o tempo anda localmente de segundo em segundo — o
 * mesmo truque que o mini-player removido usava.
 */
let musTick = 0;
function ligarTickMusica() {
  clearInterval(musTick);
  musTick = setInterval(() => {
    const n = dadosInicio.spotify;
    if (!n?.isPlaying || !n.durationMs) return;
    if (layoutEl.getAttribute("data-view") !== "inicio") return;
    n.progressMs = Math.min(n.durationMs, (n.progressMs ?? 0) + 1000);
    const fill = document.getElementById("mus-seek-fill");
    const dec = document.getElementById("mus-decorrido");
    if (fill) fill.style.transform = `scaleX(${(n.progressMs / n.durationMs).toFixed(4)})`;
    if (dec) dec.textContent = msParaTempo(n.progressMs);
  }, 1000);
}

// ─────────────────────────────────────────────────
// O CATÁLOGO
// ─────────────────────────────────────────────────
//
// `precisa` lista as chaves de dado que o card consome. Só o que os cards VISÍVEIS pedem é
// buscado — desligar o card de programas para de chamar `apps.list` de verdade, em vez de
// buscar e jogar fora.
//
// `span` quebra a grade de propósito. Uma fileira de cards do mesmo tamanho é um dos
// sinais mais reconhecíveis de interface gerada por IA; larguras diferentes vêm do que
// cada card tem para mostrar.

const CARDS = {
  sugestoes: {
    titulo: "Para agora", icone: "zap", span: 2, precisa: ["sugestoes"],
    render: (d) => {
      const lista = d.sugestoes ?? [];
      if (!lista.length) return vazio("Nada de urgente por aqui.");
      return `<div class="bolhas mov-lista">` + lista.map((s, i) =>
        `<button class="bolha" data-sug="${i}" title="${escHtml(s.detalhe ?? "")}">` +
        `${ico(s.icone ?? "zap", "ico-sm")}<span>${escHtml(s.texto)}</span></button>`).join("") + `</div>`;
    },
  },

  computador: {
    titulo: "Este computador", icone: "activity", span: 1, precisa: ["telemetria"],
    render: (d) => {
      const t = d.telemetria;
      if (!t) return vazio("Não consegui ler o estado do PC.");
      const disco = (t.disks ?? [])[0];
      let html = linhaMetrica("Processador", `${Math.round(t.cpu_pct ?? 0)}%`, t.cpu_pct ?? 0, "home-cpu")
               + linhaMetrica("Memória", t.ram_total_gb ? `${Math.round(t.ram_pct ?? 0)}% · ${t.ram_used_gb} de ${t.ram_total_gb} GB` : `${Math.round(t.ram_pct ?? 0)}%`, t.ram_pct ?? 0, "home-ram");
      if (disco) html += linhaMetrica(`Disco ${escHtml(disco.name ?? "principal")}`, `${disco.freeGB} GB livres`, disco.usedPct ?? 0);
      // A faísca da aba PC, quando já há histórico — os dois compartilham o pulso.
      if (pcHistorico.cpu.length > 2) html += `<div class="home-metric">${faisca(pcHistorico.cpu)}</div>`;
      const extras = [];
      if (t.uptime_sec) extras.push(`ligado há ${tempoLigado(t.uptime_sec)}`);
      if (typeof t.cpu_temp === "number") extras.push(`${t.cpu_temp}°C`);
      if (typeof t.battery_pct === "number") extras.push(`bateria ${t.battery_pct}%${t.battery_charging ? ", carregando" : ""}`);
      if (extras.length) html += `<div class="home-rodape">${escHtml(extras.join(" · "))}</div>`;
      return html;
    },
  },

  musica: {
    titulo: "Tocando", icone: "music", span: 2, precisa: ["spotify"],
    render: (d) => {
      const n = d.spotify;
      if (!n) {
        // Sem Spotify, as teclas de mídia do sistema ainda controlam o que estiver tocando
        // em qualquer player — o card continua servindo para alguma coisa.
        return `<div class="home-empty">Nada tocando no Spotify.</div>
        <div class="mus-ctrl">
          <button data-media="previous" title="Anterior">${ico("skip-back", "ico-sm")}</button>
          <button data-media="play" class="principal" title="Play/Pause">${ico("play")}</button>
          <button data-media="skip" title="Próxima">${ico("skip-forward", "ico-sm")}</button>
        </div>
        <div class="home-acoes"><button data-spotify="login">${ico("music", "ico-sm")}<span>Conectar o Spotify</span></button></div>`;
      }

      const capa = n.albumArt
        ? `<img class="mus-capa" src="${escHtml(n.albumArt)}" alt="">`
        : `<div class="mus-capa vazia">${ico("music", "ico-lg")}</div>`;
      const vol = typeof n.volumePercent === "number" ? n.volumePercent : null;
      const icoVol = vol === null ? "volume" : vol === 0 ? "volume-x" : vol < 50 ? "volume-1" : "volume";
      const repetindo = n.repeat && n.repeat !== "off";

      return `<div class="mus-topo">
        ${capa}
        <div class="mus-txt">
          <div class="mus-faixa" title="${escHtml(n.track ?? "")}">${escHtml(n.track ?? "—")}</div>
          <div class="mus-artista" title="${escHtml(n.artist ?? "")}">${escHtml(n.artist ?? "")}</div>
          ${n.album ? `<div class="mus-album">${escHtml(n.album)}</div>` : ""}
          ${n.device ? `<div class="mus-device">${ico("monitor", "ico-sm")}<span>${escHtml(n.device)}</span></div>` : ""}
        </div>
      </div>

      <!-- Clicar na trilha pula para a posicao: o IPC ja aceitava seek, o card e que
           descartava progressMs e durationMs. -->
      <div class="mus-seek" id="mus-seek" title="Clique para pular">
        <div class="mus-seek-trilha"><i id="mus-seek-fill" style="transform:scaleX(${(n.durationMs ? n.progressMs / n.durationMs : 0).toFixed(4)})"></i></div>
      </div>
      <div class="mus-tempos">
        <span id="mus-decorrido">${msParaTempo(n.progressMs)}</span>
        <span>${msParaTempo(n.durationMs)}</span>
      </div>

      <div class="mus-ctrl">
        <button data-mus="shuffle" class="secundario ${n.shuffle ? "aceso" : ""}" title="Aleatório">${ico("shuffle", "ico-sm")}</button>
        <button data-mus="previous" title="Anterior">${ico("skip-back", "ico-sm")}</button>
        <button data-mus="playpause" class="principal" title="Play/Pause">${ico(n.isPlaying ? "pause" : "play")}</button>
        <button data-mus="next" title="Próxima">${ico("skip-forward", "ico-sm")}</button>
        <button data-mus="repeat" class="secundario ${repetindo ? "aceso" : ""}" title="Repetir">${ico(n.repeat === "track" ? "repeat-1" : "repeat", "ico-sm")}</button>
      </div>

      ${vol === null ? "" : `<div class="mus-vol">
        ${ico(icoVol, "ico-sm")}
        <input type="range" id="mus-vol" min="0" max="100" value="${vol}" title="Volume">
        <span id="mus-vol-val">${vol}</span>
      </div>`}`;
    },
  },

  clima: {
    titulo: "Lá fora", icone: "cloud", span: 2, precisa: ["clima"],
    render: (d) => {
      const c = d.clima;
      if (!c) return vazio("Defina a cidade em Ajustes → Clima para ver o tempo.");
      const chips = [
        `<span>máx <b>${Math.round(c.max)}°</b> · mín <b>${Math.round(c.min)}°</b></span>`,
        typeof c.umidade === "number" ? `<span>${ico("droplet", "ico-sm")} <b>${Math.round(c.umidade)}%</b></span>` : "",
        typeof c.ventoKmh === "number" ? `<span>vento <b>${Math.round(c.ventoKmh)} km/h</b></span>` : "",
        c.chuvaHoje ? `<span>${ico("droplet", "ico-sm")} chuva hoje</span>` : "",
        c.amanha ? `<span>amanhã ${ico(c.amanha.icone, "ico-sm")} <b>${Math.round(c.amanha.max)}°</b> / ${Math.round(c.amanha.min)}°</span>` : "",
      ].filter(Boolean).join("");
      const horas = (c.horas ?? []).length
        ? `<div class="clima-horas">` + c.horas.map(h =>
            `<div class="clima-hora${h.chuva ? " chuva" : ""}"><span>${String(h.hora).padStart(2, "0")}h</span>${ico(h.icone, "ico-sm")}<b>${Math.round(h.temp)}°</b></div>`).join("") + `</div>`
        : "";
      return `<div class="clima-grande">
        ${ico(c.icone ?? "cloud", "ico-xl")}
        <span class="clima-temp">${Math.round(c.temperatura)}°</span>
        <div class="clima-detalhes">
          <span class="clima-desc">${escHtml(c.descricao)}</span>
          <span class="clima-sub">${escHtml(c.cidade)}${typeof c.sensacao === "number" ? ` · sensação de ${Math.round(c.sensacao)}°` : ""}</span>
        </div>
      </div>
      <div class="clima-chips">${chips}</div>${horas}`;
    },
  },

  discos: {
    titulo: "Discos", icone: "hard-drive", span: 1, precisa: ["telemetria"],
    render: (d) => {
      const discos = d.telemetria?.disks ?? [];
      if (!discos.length) return vazio("Sem leitura de discos.");
      return discos.map(x => linhaMetrica(`Disco ${x.name}`, `${x.freeGB} GB livres de ${x.totalGB}`, x.usedPct ?? 0)).join("");
    },
  },

  conversas: {
    titulo: "Conversas recentes", icone: "message-circle", span: 1, precisa: ["conversas"],
    render: (d) => {
      const l = (d.conversas ?? []).slice(0, 5);
      if (!l.length) return vazio("Nenhuma conversa ainda. Pergunte algo no Chat.") + `<button class="home-ver-tudo" data-ir="chat">Abrir o chat →</button>`;
      return `<div class="home-list mov-lista">` + l.map(s =>
        `<div class="home-item clicavel" data-conversa="${escHtml(s.id)}">${ico(s.favorite ? "star" : "message-circle", "ico-sm")}
          <div class="home-item-txt"><span>${escHtml(s.title || "Conversa")}</span><em>${s.messages?.length ?? 0} mensagens · ${escHtml(quandoTexto(s.updatedAt ?? s.createdAt))}</em></div></div>`).join("") + `</div>`;
    },
  },

  caixa: {
    titulo: "Recados do celular", icone: "smartphone", span: 1, precisa: ["caixa"],
    render: (d) => {
      const l = (d.caixa ?? []).slice(0, 4);
      if (!l.length) return vazio("Nada na caixa. Compartilhe algo do celular para cair aqui.") + `<button class="home-ver-tudo" data-ir="caixa">Abrir a caixa →</button>`;
      return `<div class="home-list mov-lista">` + l.map(m =>
        `<div class="home-item clicavel" data-ir="caixa">${ico(m.attachment ? "paperclip" : "inbox", "ico-sm")}
          <div class="home-item-txt"><span class="${m.from === "mobile" ? "de-celular" : ""}">${escHtml(m.text || m.attachment?.name || "(anexo)")}</span><em>${m.from === "mobile" ? "do celular" : "do PC"} · ${escHtml(quandoTexto(m.createdAt))}${m.readAt ? "" : " · novo"}</em></div></div>`).join("") + `</div>`;
    },
  },

  memoria: {
    titulo: "O que ele lembra", icone: "bookmark", span: 1, precisa: ["memoria"],
    render: (d) => {
      const l = (d.memoria ?? []).slice(0, 6);
      if (!l.length) return vazio("Nada guardado. Diga \"lembre que…\" no chat.");
      return `<div class="home-chips">` + l.map(x => `<span title="${escHtml(x.text)}">${escHtml(x.text)}</span>`).join("") + `</div>` +
        `<button class="home-ver-tudo" data-painel="memoria">Ver e editar tudo →</button>`;
    },
  },

  notas: {
    titulo: "Notas rápidas", icone: "edit", span: 1, precisa: ["notas"],
    render: (d) => `<textarea class="notas-caixa" id="notas-caixa" placeholder="Rabisque aqui. Grava sozinho e fica neste PC." spellcheck="false">${escHtml(d.notas ?? "")}</textarea>
      <div class="notas-rodape"><span id="notas-estado">${d.notas ? "Guardado" : "Vazio"}</span><span><button data-notas="copiar">Copiar</button><button data-notas="celular">Mandar pro celular</button></span></div>`,
  },

  timer: {
    titulo: "Timer", icone: "clock", span: 1, precisa: [],
    render: () => {
      const t = timerEstado;
      const resta = t.fim ? Math.max(0, t.fim - Date.now()) : t.restaMs;
      return `<div class="timer-visor${t.fim ? " rodando" : ""}" id="timer-visor">${msParaTempo(resta)}</div>
      <div class="timer-anel"><i id="timer-anel" style="transform:scaleX(${t.totalMs ? (resta / t.totalMs).toFixed(3) : 1})"></i></div>
      <div class="timer-presets">${[5, 15, 25, 50].map(m => `<button data-timer-min="${m}" class="${t.totalMs === m * 60000 ? "aceso" : ""}">${m} min</button>`).join("")}</div>
      <div class="home-quick" style="justify-content:center">
        <button data-timer="${t.fim ? "pausar" : "iniciar"}">${ico(t.fim ? "pause" : "play", "ico-sm")}<span>${t.fim ? "Pausar" : "Iniciar"}</span></button>
        <button data-timer="zerar">${ico("rotate", "ico-sm")}<span>Zerar</span></button>
      </div>`;
    },
  },

  rotinas: {
    titulo: "Próximas rotinas", icone: "calendar", span: 1, precisa: ["rotinas"],
    render: (d) => {
      const l = (d.rotinas ?? []).filter(r => r.ativa && r.proxima).sort((a, b) => a.proxima - b.proxima).slice(0, 4);
      if (!l.length) return vazio("Nenhuma rotina ativa.") + `<button class="home-ver-tudo" data-ir="rotinas">Criar uma rotina →</button>`;
      return `<div class="home-list mov-lista">` + l.map(r =>
        `<div class="home-item clicavel" data-ir="rotinas">${ico("calendar", "ico-sm")}<div class="home-item-txt"><span>${escHtml(r.nome)}</span><em>${escHtml(quandoTexto(r.proxima))} · ${escHtml(diasTexto(r.dias))}</em></div></div>`).join("") + `</div>`;
    },
  },

  rede: {
    titulo: "Rede e celular", icone: "wifi", span: 1, precisa: ["rede"],
    render: (d) => {
      const r = d.rede;
      if (!r) return vazio("Sem leitura de rede.");
      const locais = (r.endpoints ?? []).filter(e => !e.tunnel);
      const tuneis = (r.endpoints ?? []).filter(e => e.tunnel);
      return `<div class="rede-linhas">
        <div><span>Celular</span><span class="${r.celular ? "rede-ok" : "rede-off"}">${r.celular ? "conectado" : "fora de alcance"}</span></div>
        ${locais.slice(0, 2).map(e => `<div><span>${escHtml(e.iface)}</span><code>${escHtml(e.address)}</code></div>`).join("")}
        ${tuneis.slice(0, 1).map(e => `<div><span>túnel</span><code>${escHtml(e.address)}</code></div>`).join("")}
        <div><span>Porta</span><code>${escHtml(String(r.port ?? 4200))}</code></div>
      </div>`;
    },
  },

  lembretes: {
    titulo: "Próximos lembretes", icone: "clock", span: 1, precisa: ["lembretes"],
    render: (d) => {
      const l = (d.lembretes ?? []).slice(0, 4);
      const lista = l.length
        ? `<div class="home-list mov-lista">` + l.map(r =>
            `<div class="home-item">${ico("clock", "ico-sm")}<span>${escHtml(r.text)}</span>` +
            `<span class="when">${escHtml(quandoTexto(r.dueAt))}</span></div>`).join("") + `</div>`
        : vazio("Nada agendado.");
      // `reminders.create` já existia no RPC e não era chamado por ninguém — o lembrete só
      // podia ser criado por voz ou pelo celular. Agora dá para digitar.
      return lista + `<form class="lembrete-novo">
        <input type="text" name="texto" placeholder="Lembrar de…" autocomplete="off">
        <input type="time" name="hora" required>
        <button type="submit" title="Criar lembrete">${ico("check", "ico-sm")}</button>
      </form>`;
    },
  },

  insights: {
    titulo: "O que reparei no sistema", icone: "bulb", span: 2, precisa: ["insights"],
    render: (d) => {
      const l = d.insights ?? [];
      if (!l.length) return vazio("Nada fora do comum até agora.");
      return `<div class="home-list mov-lista">` + l.slice(0, 4).map(t =>
        `<div class="home-item">${ico("bulb", "ico-sm")}<span>${escHtml(t)}</span></div>`).join("") + `</div>`;
    },
  },

  processos: {
    titulo: "Consumindo mais", icone: "cpu", span: 1, precisa: ["processos"],
    render: (d) => {
      const p = (d.processos ?? []).slice(0, 4);
      if (!p.length) return vazio("Sem leitura de processos.");
      return `<div class="home-list mov-lista">` + p.map(x =>
        `<div class="home-item">${ico("cpu", "ico-sm")}<span>${escHtml(semSufixo(x.name))}</span>` +
        `<span class="when">${Math.min(100, Math.round(x.cpu ?? 0))}% CPU</span></div>`).join("") + `</div>`;
    },
  },

  programas: {
    titulo: "Abrir um programa", icone: "monitor", span: 1, precisa: ["programas"],
    render: (d) => {
      const p = (d.programas ?? []).slice(0, 10);
      if (!p.length) return vazio("Nenhum programa catalogado.");
      return `<div class="pilulas">` + p.map(nome =>
        `<button class="pilula" data-abrir="${escHtml(nome)}">${escHtml(nome)}</button>`).join("") + `</div>` +
        `<button class="home-ver-tudo" data-painel="programas">Todos os programas →</button>`;
    },
  },

  transferencia: {
    titulo: "Área de transferência", icone: "clipboard", span: 1, precisa: ["clipboard"],
    render: (d) => {
      const txt = d.clipboard;
      return `<div class="clip-caixa">${txt ? escHtml(txt.slice(0, 220)) : "<i>Vazia.</i>"}</div>
      <div class="home-acoes">
        <button data-clip="atualizar">${ico("refresh", "ico-sm")}<span>Reler</span></button>
        <button data-clip="celular"${txt ? "" : " disabled"}>${ico("smartphone", "ico-sm")}<span>Mandar pro celular</span></button>
      </div>`;
    },
  },

  atalhos: {
    titulo: "Atalhos", icone: "zap", span: 1, precisa: [],
    render: () => `<div class="home-quick seis">
      <button data-quick="print">${ico("camera", "ico-sm")}<span>Print</span></button>
      <button data-quick="lock">${ico("lock", "ico-sm")}<span>Bloquear</span></button>
      <button data-quick="sleep">${ico("moon", "ico-sm")}<span>Suspender</span></button>
      <button data-quick="mute">${ico("volume-x", "ico-sm")}<span>Mudo</span></button>
      <button data-ir="nova-conversa">${ico("edit", "ico-sm")}<span>Nova conversa</span></button>
      <button data-ir="paleta">${ico("search", "ico-sm")}<span>Buscar</span></button>
    </div>`,
  },
};

/** Ordem de fábrica. Cards fora desta lista existem mas nascem desligados. */
const CARDS_PADRAO = ["sugestoes", "clima", "computador", "musica", "lembretes", "rotinas", "atalhos", "conversas", "timer", "notas", "caixa", "memoria", "discos"];

/**
 * `fixos` são desenhados antes de todos os outros e não saem do lugar quando você arrasta
 * o resto. Serve para o que você quer sempre no mesmo canto — clima, no caso.
 */
let estadoCards = { ordem: CARDS_PADRAO.slice(), ocultos: [], fixos: ["clima"], tamanhos: {} };
let dadosInicio = {};

function cardsVisiveis() {
  const vis = estadoCards.ordem.filter(id => CARDS[id] && !estadoCards.ocultos.includes(id));
  // Fixos primeiro, na ordem em que foram fixados; o resto mantém a ordem arrastada.
  const fixos = (estadoCards.fixos ?? []).filter(id => vis.includes(id));
  return [...fixos, ...vis.filter(id => !fixos.includes(id))];
}

function ehFixo(id) { return (estadoCards.fixos ?? []).includes(id); }

// ─────────────────────────────────────────────────
// BUSCA DE DADOS
// ─────────────────────────────────────────────────

/**
 * Busca só o que os cards visíveis pedem, em paralelo. Cada fonte falha por conta própria:
 * o Spotify fora do ar ou o clima sem rede não podem derrubar a tela inteira — é por isso
 * que cada uma vai num `catch` separado em vez de um `Promise.all` cru.
 */
async function carregarDadosInicio() {
  const precisa = new Set(cardsVisiveis().flatMap(id => CARDS[id].precisa));
  const d = {};
  const jobs = [];

  const rpc = async (chave, metodo, params, extrai) => {
    try {
      const r = await window.nx.rpc(metodo, params);
      d[chave] = extrai(r.result);
    } catch { d[chave] = undefined; }
  };

  if (precisa.has("telemetria")) jobs.push(rpc("telemetria", "system.telemetry", undefined, r => r));
  if (precisa.has("lembretes")) jobs.push(rpc("lembretes", "reminders.list", undefined, r =>
    (r?.reminders ?? []).filter(x => !x.firedAt && x.dueAt > Date.now()).sort((a, b) => a.dueAt - b.dueAt)));
  if (precisa.has("processos")) jobs.push(rpc("processos", "system.processes", undefined, r =>
    (r?.processes ?? []).slice().sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))));
  // `apps.list` devolve { key, command }, não strings — o card só quer o nome.
  if (precisa.has("programas")) jobs.push(rpc("programas", "apps.list", undefined,
    r => agruparCatalogo(r?.apps ?? []).map(p => p.nome)));
  if (precisa.has("memoria")) jobs.push(rpc("memoria", "memory.list", undefined, r => r?.facts ?? []));
  if (precisa.has("rotinas")) jobs.push(rpc("rotinas", "rotinas.list", undefined, r => r?.rotinas ?? []));
  if (precisa.has("conversas")) jobs.push((async () => {
    try { d.conversas = (await window.nx.chatSessionsList()).slice().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)); } catch { d.conversas = []; }
  })());
  if (precisa.has("caixa")) jobs.push((async () => {
    try { d.caixa = (await window.nx.getMailboxThread()).slice().sort((a, b) => b.createdAt - a.createdAt); } catch { d.caixa = []; }
  })());
  if (precisa.has("notas")) jobs.push((async () => {
    try { d.notas = String((await window.nx.getConfig())?.homeNotas ?? ""); } catch { d.notas = ""; }
  })());
  if (precisa.has("rede")) jobs.push((async () => {
    try {
      const [info, ends] = await Promise.all([window.nx.getPairingInfo(), window.nx.rpc("pairing.endpoints").catch(() => null)]);
      d.rede = { ...info, celular: (ends?.result?.conectados ?? 0) > 0 };
    } catch { d.rede = null; }
  })());
  if (precisa.has("clipboard")) jobs.push(rpc("clipboard", "clipboard.get", undefined, r => r?.text ?? ""));
  if (precisa.has("sugestoes")) jobs.push(rpc("sugestoes", "suggestions.list", undefined, r => r?.suggestions ?? []));
  if (precisa.has("clima")) jobs.push(rpc("clima", "weather.now", undefined, r => r ?? null));

  if (precisa.has("insights")) {
    jobs.push((async () => {
      try { d.insights = await window.nx.getInsights(); } catch { d.insights = []; }
    })());
  }
  if (precisa.has("spotify")) {
    jobs.push((async () => {
      try {
        const n = await window.nx.spotifyNowPlaying();
        // O RPC devolve { nowPlaying }, o IPC devolve o objeto direto — aceita os dois.
        const np = n?.nowPlaying ?? n;
        d.spotify = np && np.track ? np : null;
      } catch { d.spotify = null; }
    })());
  }

  await Promise.all(jobs);
  return d;
}

// ─────────────────────────────────────────────────
// DESENHO
// ─────────────────────────────────────────────────

const gradeInicio = () => document.getElementById("home-grid");

/**
 * Verdadeiro enquanto um dedo está na quina de um card.
 *
 * 🔴 A Início se redesenha sozinha por vários caminhos com temporizador — o tique do
 * Spotify (400 ms), o re-sorteio das bolhas (120 ms) e a volta do foco da janela. Se um
 * deles disparasse no meio de um redimensionamento, o `innerHTML` da grade seria trocado,
 * o puxador sairia do DOM levando junto a captura do ponteiro, e o `pointerup` nunca
 * chegaria: o gesto morreria no meio e o card voltaria ao tamanho antigo sozinho.
 */
let redimensionandoAgora = false;

function desenharInicio() {
  const grade = gradeInicio();
  if (!grade) return;
  // Redesenhar agora arrancaria do DOM o elemento que está recebendo o gesto. Quem
  // chamou volta a desenhar no próximo ciclo; nenhum dos chamadores é a única chance de
  // atualizar a tela.
  if (redimensionandoAgora) return;
  // Digitando nas notas: o redesenho periódico (tique do Spotify, volta do foco) trocaria a
  // textarea por outra e a frase pararia no meio. Quem chamou redesenha no próximo ciclo.
  if (document.activeElement?.id === "notas-caixa" && grade.children.length) return;
  const visiveis = cardsVisiveis();

  grade.innerHTML = visiveis.map(id => {
    const c = CARDS[id];
    const fixo = ehFixo(id);
    // Tamanho escolhido pelo usuário vence o do catálogo; sem escolha, vale o do catálogo.
    const t = (estadoCards.tamanhos ?? {})[id] ?? {};
    const span = t.span ?? c.span;
    const estilo = t.alt ? ` style="--alt:${t.alt}px"` : "";
    return `<section class="home-card${fixo ? " fixo" : ""}" data-card="${id}" data-span="${span}" draggable="${!fixo}"${estilo}>
      <header class="home-card-head">
        <span class="home-card-title">${ico(c.icone, "ico-sm")}<span>${escHtml(c.titulo)}</span></span>
        <button class="home-card-pin" data-fixar="${id}" title="${fixo ? "Soltar" : "Fixar no topo"}">${ico("pin", "ico-sm")}</button>
        ${fixo ? "" : `<span class="home-card-grip" title="Arraste para reordenar">${ico("grip", "ico-sm")}</span>`}
      </header>
      <div class="home-card-corpo">${c.render(dadosInicio)}</div>
      <span class="home-card-resize" data-resize="${id}" title="Arraste para redimensionar. Duplo clique volta ao tamanho automático."></span>
    </section>`;
  }).join("");

  if (!visiveis.length) {
    grade.innerHTML = `<div class="home-empty">Todos os cards estão desligados. Use “Personalizar”.</div>`;
  }
}

/** "quinta-feira, 18 de setembro" — a data por extenso vai na linha de baixo da saudação. */
function dataPorExtenso() {
  const s = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function atualizarRelogio() {
  const el = document.getElementById("home-relogio");
  if (el) el.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
setInterval(() => { if (layoutEl.getAttribute("data-view") === "inicio") atualizarRelogio(); }, 20_000);

function atualizarChipClima() {
  const chip = document.getElementById("home-clima-chip");
  if (!chip) return;
  const c = dadosInicio.clima;
  if (!c) { chip.hidden = true; return; }
  chip.hidden = false;
  chip.innerHTML = `${ico(c.icone ?? "cloud", "ico-sm")}<b>${Math.round(c.temperatura)}°</b><span>${escHtml(c.descricao)}</span>`;
}

// ── Timer ──
//
// Conta no renderer, mas o AVISO é um lembrete de verdade: assim o PC fala e notifica na
// hora certa mesmo com o dashboard escondido na bandeja. Pausar cancela o lembrete e
// guarda o que resta; iniciar de novo cria outro.
let timerEstado = { totalMs: 25 * 60000, restaMs: 25 * 60000, fim: null, lembreteId: null };
let timerTick = 0;

function desenharTimerNoLugar() {
  const card = document.querySelector('[data-card="timer"] .home-card-corpo');
  if (card) card.innerHTML = CARDS.timer.render();
}

async function timerIniciar() {
  const t = timerEstado;
  if (t.fim) return;
  const resta = t.restaMs > 0 ? t.restaMs : t.totalMs;
  t.fim = Date.now() + resta;
  t.restaMs = resta;
  try {
    const r = await window.nx.rpc("reminders.create", { text: `Timer de ${Math.round(t.totalMs / 60000)} minutos terminou`, dueAt: t.fim + 500 });
    t.lembreteId = r.result?.reminder?.id ?? null;
  } catch { t.lembreteId = null; }
  clearInterval(timerTick);
  timerTick = setInterval(() => {
    const v = document.getElementById("timer-visor");
    const anel = document.getElementById("timer-anel");
    const resta = Math.max(0, t.fim - Date.now());
    if (v) v.textContent = msParaTempo(resta);
    if (anel) anel.style.transform = `scaleX(${(resta / t.totalMs).toFixed(3)})`;
    if (resta <= 0) {
      clearInterval(timerTick);
      t.fim = null; t.restaMs = t.totalMs; t.lembreteId = null;
      showToast("Tempo esgotado.");
      desenharTimerNoLugar();
    }
  }, 1000);
  desenharTimerNoLugar();
}

async function timerPausar() {
  const t = timerEstado;
  if (!t.fim) return;
  t.restaMs = Math.max(0, t.fim - Date.now());
  t.fim = null;
  clearInterval(timerTick);
  if (t.lembreteId) { try { await window.nx.rpc("reminders.cancel", { id: t.lembreteId }); } catch { /* já disparou */ } t.lembreteId = null; }
  desenharTimerNoLugar();
}

async function timerZerar(minutos) {
  await timerPausar();
  if (minutos) timerEstado.totalMs = minutos * 60000;
  timerEstado.restaMs = timerEstado.totalMs;
  desenharTimerNoLugar();
}

// ── Notas: grava 800 ms depois da última tecla ──
let notasTimer = 0;

async function atualizarInicio() {
  const saud = document.getElementById("home-greet");
  if (saud) saud.textContent = `${saudacao()}, Zak`;
  const sub = document.getElementById("home-sub");
  if (sub) sub.textContent = dataPorExtenso();
  atualizarRelogio();
  // Desenha antes de buscar: as chamadas RPC levam algumas centenas de ms, e sem isto a
  // tela ficava totalmente em branco nesse intervalo — inclusive na abertura do app.
  if (!gradeInicio()?.children.length) desenharInicio();
  dadosInicio = await carregarDadosInicio();
  desenharInicio();
  atualizarChipClima();
  ligarTickMusica();
  atualizarOrbe();
}

// ─────────────────────────────────────────────────
// ARRASTAR PARA REORDENAR
// ─────────────────────────────────────────────────
//
// `draggable` nativo do HTML5 — o dashboard não carrega uma única biblioteca externa e
// isso não muda por causa disto. O que o navegador não dá é o movimento dos vizinhos: sem
// ajuda, os cards ao redor pulam para a posição nova de um quadro para o outro.
//
// FLIP resolve: mede onde cada card estava (First), reordena o DOM (Last), aplica o
// deslocamento inverso como transform (Invert) e deixa a transição levar de volta a zero
// (Play). O card se move de onde estava até onde foi, em vez de aparecer lá.

let cardArrastado = null;

function medirCards() {
  const m = new Map();
  gradeInicio()?.querySelectorAll(".home-card").forEach(el => m.set(el.dataset.card, el.getBoundingClientRect()));
  return m;
}

function animarDeslocamento(antes) {
  gradeInicio()?.querySelectorAll(".home-card").forEach(el => {
    const a = antes.get(el.dataset.card);
    if (!a) return;
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (!dx && !dy || !movimentoLigado()) return;
    el.style.transition = "none";
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      el.style.transition = "transform var(--mov-base) var(--mov-suave)";
      el.style.transform = "";
    });
  });
}

function ligarArrasto() {
  const grade = gradeInicio();
  if (!grade || grade.dataset.arrasto) return;
  grade.dataset.arrasto = "1";

  // Aqui dentro de propósito: `ligarArrasto` é chamado dos cinco lugares que redesenham a
  // Início e já tem a trava de "só uma vez". Ligar o canto num sexto ponto seria mais um
  // lugar para alguém esquecer de atualizar.
  ligarRedimensionamento();

  grade.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".home-card");
    if (!card || card.classList.contains("fixo")) return;
    cardArrastado = card.dataset.card;
    card.classList.add("arrastando");
    e.dataTransfer.effectAllowed = "move";
    // Firefox exige que algo seja escrito no dataTransfer para o arrasto começar.
    e.dataTransfer.setData("text/plain", cardArrastado);
  });

  grade.addEventListener("dragend", (e) => {
    e.target.closest(".home-card")?.classList.remove("arrastando");
    cardArrastado = null;
    salvarCards();
  });

  grade.addEventListener("dragover", (e) => {
    e.preventDefault();
    const alvo = e.target.closest(".home-card");
    if (!alvo || !cardArrastado || alvo.dataset.card === cardArrastado) return;
    // Soltar em cima de um fixo não faz nada: ele é fixo justamente para não sair de lá.
    if (alvo.classList.contains("fixo")) return;

    const de = estadoCards.ordem.indexOf(cardArrastado);
    const para = estadoCards.ordem.indexOf(alvo.dataset.card);
    if (de < 0 || para < 0) return;

    const antes = medirCards();
    estadoCards.ordem.splice(para, 0, ...estadoCards.ordem.splice(de, 1));
    const el = grade.querySelector(`[data-card="${cardArrastado}"]`);
    if (de < para) alvo.after(el); else alvo.before(el);
    animarDeslocamento(antes);
  });
}

async function salvarCards() {
  // O objeto inteiro, porque `setOverride` faz merge raso: gravar só `ordem` apagaria
  // `ocultos` e `fixos`.
  try { await window.nx.setConfig({ homeCards: estadoCards }); } catch { /* segue com o que está na tela */ }
}

// ─────────────────────────────────────────────────
// REDIMENSIONAR CARD PELO CANTO
// ─────────────────────────────────────────────────

/**
 * Arrastar a quina muda largura e altura do card, como numa janela do Windows.
 *
 * A largura anda em COLUNAS, não em pixels, porque a Início é uma grade `auto-fill`: um
 * card com largura livre não teria como se alinhar com o vizinho, e a grade abriria
 * buracos irregulares a cada ajuste. A altura é livre, porque nada depende dela.
 *
 * Usa Pointer Events com `setPointerCapture` em vez de escutar o `mousemove` do
 * documento: com a captura, o gesto continua chegando ao puxador mesmo quando o ponteiro
 * sai do card — que é o caso normal ao aumentar — e não é preciso montar e desmontar
 * ouvintes globais que vazam se o `pointerup` se perder.
 */
function ligarRedimensionamento() {
  const grade = gradeInicio();
  if (!grade) return;

  grade.addEventListener("pointerdown", e => {
    const puxador = e.target.closest("[data-resize]");
    if (!puxador) return;
    e.preventDefault();
    e.stopPropagation();

    const id = puxador.dataset.resize;
    const card = puxador.closest(".home-card");
    if (!card) return;

    const x0 = e.clientX, y0 = e.clientY;
    const alturaInicial = card.getBoundingClientRect().height;
    const spanInicial = Number(card.dataset.span) || 1;

    // Largura de uma coluna, medida da grade viva: `auto-fill` decide quantas colunas
    // cabem, então este número muda com o tamanho da janela e não pode ser constante.
    //
    // ⚠️ Só entram as partes que são REALMENTE um comprimento. Num grid já renderizado o
    // Chromium devolve o valor usado ("284.5px 284.5px …"), que é o que se quer; mas em
    // elemento não renderizado ele devolve o valor declarado
    // ("repeat(auto-fill, minmax(280px, 1fr))"), e aí contar as partes daria 3 colunas
    // inventadas e `parseFloat("repeat(auto-fill,")` daria NaN. Filtrar resolve os dois:
    // sobra a lista de larguras quando existe, e nada quando não existe — caso em que o
    // fallback assume.
    const estilo = getComputedStyle(grade);
    const colunas = estilo.gridTemplateColumns.split(" ")
      .map(parseFloat)
      .filter(Number.isFinite);
    const larguraColuna = colunas[0] || 280;
    const gap = parseFloat(estilo.gap) || 14;
    // Sem lista utilizável, o teto vem da largura real da grade em vez de um chute.
    const maxSpan = Math.max(1, colunas.length || Math.floor(grade.getBoundingClientRect().width / (larguraColuna + gap)));

    puxador.setPointerCapture(e.pointerId);
    document.body.classList.add("redimensionando");
    // Trava o redesenho enquanto o dedo está na quina — ver `desenharInicio`.
    redimensionandoAgora = true;

    let spanFinal = spanInicial, altFinal = Math.round(alturaInicial);

    function aoMover(ev) {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;

      // Meia coluna de folga antes de trocar: sem isto, tremer o pulso perto do limiar
      // faz o card piscar entre duas larguras.
      const passos = Math.round(dx / (larguraColuna + gap));
      spanFinal = Math.min(maxSpan, Math.max(1, spanInicial + passos));
      // Mínimo de 90 px: abaixo disso o cabeçalho já não cabe e o card vira uma tarja.
      altFinal = Math.max(90, Math.round((alturaInicial + dy) / 4) * 4);

      card.dataset.span = String(spanFinal);
      card.style.setProperty("--alt", `${altFinal}px`);
    }

    function aoSoltar(ev) {
      try { puxador.releasePointerCapture?.(ev?.pointerId ?? e.pointerId); } catch { /* já solto */ }
      puxador.removeEventListener("pointermove", aoMover);
      puxador.removeEventListener("pointerup", aoSoltar);
      puxador.removeEventListener("pointercancel", aoSoltar);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("blur", aoSoltar);
      document.body.classList.remove("redimensionando");
      redimensionandoAgora = false;

      estadoCards.tamanhos = estadoCards.tamanhos ?? {};
      estadoCards.tamanhos[id] = { span: spanFinal, alt: altFinal };
      salvarCards();
    }

    puxador.addEventListener("pointermove", aoMover);
    puxador.addEventListener("pointerup", aoSoltar);
    puxador.addEventListener("pointercancel", aoSoltar);
    // Rede de segurança: se o puxador sumir do DOM no meio do gesto, ou a janela perder o
    // foco, o `pointerup` dele nunca chega — e sem isto o `body.redimensionando` ficaria
    // para sempre, deixando o dashboard inteiro com cursor de redimensionar e texto
    // inselecionável, sem nada na tela explicando o porquê.
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("blur", aoSoltar);
  });

  // Duplo clique no canto devolve o tamanho automático. Sem esta saída, um card esticado
  // sem querer só voltaria pelo "restaurar padrão", que zera a tela inteira.
  grade.addEventListener("dblclick", e => {
    const puxador = e.target.closest("[data-resize]");
    if (!puxador) return;
    const id = puxador.dataset.resize;
    if (estadoCards.tamanhos) delete estadoCards.tamanhos[id];
    salvarCards();
    desenharInicio();
  });
}

async function carregarCards() {
  try {
    const cfg = await window.nx.getConfig();
    const salvo = cfg?.homeCards;
    if (salvo && Array.isArray(salvo.ordem)) {
      // Um card removido numa versão futura não pode sobrar na ordem gravada, e um card
      // novo tem que aparecer para quem já tinha configuração salva — senão ele nasce
      // invisível e ninguém descobre que existe.
      const conhecidos = salvo.ordem.filter(id => CARDS[id]);
      const faltando = Object.keys(CARDS).filter(id => !conhecidos.includes(id));
      estadoCards = {
        ordem: [...conhecidos, ...faltando],
        ocultos: (salvo.ocultos ?? []).filter(id => CARDS[id])
          .concat(faltando.filter(id => !CARDS_PADRAO.includes(id))),
        // Configuração gravada antes desta versão não tem `fixos` — nasce sem nenhum,
        // em vez de reimpor o padrão de fábrica por cima de uma escolha já feita.
        fixos: (salvo.fixos ?? []).filter(id => CARDS[id]),
        // Mesma regra para `tamanhos`, que chegou depois: card sem entrada usa o tamanho
        // declarado no catálogo e cresce com o conteúdo, como sempre foi.
        tamanhos: Object.fromEntries(
          Object.entries(salvo.tamanhos ?? {}).filter(([id]) => CARDS[id])
        ),
      };
    } else {
      estadoCards = {
        ordem: [...CARDS_PADRAO, ...Object.keys(CARDS).filter(id => !CARDS_PADRAO.includes(id))],
        ocultos: Object.keys(CARDS).filter(id => !CARDS_PADRAO.includes(id)),
        fixos: ["clima"],
        tamanhos: {},
      };
    }
  } catch { /* fica com o padrão */ }
}

// ─────────────────────────────────────────────────
// PERSONALIZAR: ligar e desligar card
// ─────────────────────────────────────────────────

function abrirPersonalizar() {
  const cx = document.getElementById("home-personalizar");
  if (!cx) return;
  const aberto = cx.classList.toggle("aberto");
  if (!aberto) return;
  // Uma linha por card, com tudo à mão: ligar, fixar e mover. O arrasto continua
  // valendo, mas botão funciona sem mira — e sem mira é o caso de quem tem pressa.
  cx.innerHTML = `<div class="pers-lista">` + cardsVisiveis().concat(
    Object.keys(CARDS).filter(id => estadoCards.ocultos.includes(id))
  ).map((id) => {
    const c = CARDS[id];
    const ligado = !estadoCards.ocultos.includes(id);
    const fixo = ehFixo(id);
    const i = cardsVisiveis().indexOf(id);
    return `<div class="pers-linha${ligado ? "" : " off"}">
      <label class="pers-nome">
        <input type="checkbox" data-card-toggle="${id}" ${ligado ? "checked" : ""}>
        ${ico(c.icone, "ico-sm")}<span>${escHtml(c.titulo)}</span>
      </label>
      <button data-fixar="${id}" class="${fixo ? "aceso" : ""}" title="${fixo ? "Soltar" : "Fixar no topo"}">${ico("pin", "ico-sm")}</button>
      <button data-mover="${id}" data-dir="-1" ${!ligado || i <= 0 ? "disabled" : ""} title="Subir">${ico("chevron-up", "ico-sm")}</button>
      <button data-mover="${id}" data-dir="1" ${!ligado || i < 0 || i >= cardsVisiveis().length - 1 ? "disabled" : ""} title="Descer">${ico("chevron-down", "ico-sm")}</button>
    </div>`;
  }).join("") + `</div>
  <button class="pers-padrao" data-padrao="1">${ico("refresh", "ico-sm")}<span>Voltar ao padrão</span></button>`;
}

// ─────────────────────────────────────────────────
// AÇÕES DA TELA
// ─────────────────────────────────────────────────
//
// Um ouvinte só, delegado na tela inteira: os cards são redesenhados a cada atualização, e
// ouvinte preso em elemento redesenhado morre junto com ele.

document.getElementById("view-inicio")?.addEventListener("click", async (e) => {
  const alvo = (sel) => e.target.closest(sel);

  const btnPers = alvo("#home-btn-personalizar");
  if (btnPers) { abrirPersonalizar(); return; }

  const fixar = alvo("button[data-fixar]");
  if (fixar) {
    const id = fixar.dataset.fixar;
    const fixos = estadoCards.fixos ?? [];
    estadoCards.fixos = fixos.includes(id) ? fixos.filter(x => x !== id) : [...fixos, id];
    await salvarCards();
    await atualizarInicio();
    ligarArrasto();
    if (document.getElementById("home-personalizar")?.classList.contains("aberto")) {
      abrirPersonalizar(); abrirPersonalizar();   // redesenha a lista sem fechá-la
    }
    return;
  }

  const mover = alvo("button[data-mover]");
  if (mover) {
    const id = mover.dataset.mover;
    const dir = Number(mover.dataset.dir);
    const vis = cardsVisiveis();
    const de = vis.indexOf(id), para = de + dir;
    if (de < 0 || para < 0 || para >= vis.length) return;
    // Reordena a lista visível e reescreve a ordem completa preservando a posição dos
    // ocultos — mesma regra do arrasto.
    const nova = vis.slice();
    nova.splice(para, 0, ...nova.splice(de, 1));
    let k = 0;
    estadoCards.ordem = estadoCards.ordem.map(x => (vis.includes(x) ? nova[k++] : x));
    await salvarCards();
    await atualizarInicio();
    ligarArrasto();
    abrirPersonalizar(); abrirPersonalizar();
    return;
  }

  const padrao = alvo("button[data-padrao]");
  if (padrao) {
    estadoCards = {
      ordem: [...CARDS_PADRAO, ...Object.keys(CARDS).filter(id => !CARDS_PADRAO.includes(id))],
      ocultos: Object.keys(CARDS).filter(id => !CARDS_PADRAO.includes(id)),
      fixos: ["clima"],
      // Voltar ao padrão tem que desfazer os tamanhos tambem, senao um card esticado
      // continuaria esticado depois de "restaurar" e o botao pareceria meio quebrado.
      tamanhos: {},
    };
    await salvarCards();
    await atualizarInicio();
    ligarArrasto();
    abrirPersonalizar(); abrirPersonalizar();
    showToast("Cards de volta ao padrão.");
    return;
  }

  const quick = alvo("button[data-quick]");
  if (quick) {
    if (quick.dataset.quick === "mute") {
      try { await window.nx.rpc("volume.set", { level: "mute" }); showToast("Mudo."); } catch { showToast("Não deu certo.", true); }
      return;
    }
    await acaoRapida(quick);
    return;
  }

  const ir = alvo("[data-ir]");
  if (ir) {
    const onde = ir.dataset.ir;
    if (onde === "chat") { switchView("chat"); switchChatMode("ai"); }
    else if (onde === "rotinas") switchView("rotinas");
    else if (onde === "caixa") { switchView("chat"); switchChatMode("self"); }
    else if (onde === "nova-conversa") { switchView("chat"); switchChatMode("ai"); startNewConversation(); }
    else if (onde === "paleta") abrirPaleta();
    return;
  }

  const painel = alvo("[data-painel]");
  if (painel) { switchView("pc"); setTimeout(() => abrirPainelPc(painel.dataset.painel), 60); return; }

  const conv = alvo("[data-conversa]");
  if (conv) { switchView("chat"); switchChatMode("ai"); openConversation(conv.dataset.conversa); return; }

  const tm = alvo("[data-timer-min]");
  if (tm) { await timerZerar(Number(tm.dataset.timerMin)); return; }
  const tb = alvo("[data-timer]");
  if (tb) {
    if (tb.dataset.timer === "iniciar") await timerIniciar();
    else if (tb.dataset.timer === "pausar") await timerPausar();
    else await timerZerar();
    return;
  }

  const notas = alvo("[data-notas]");
  if (notas) {
    const texto = document.getElementById("notas-caixa")?.value ?? "";
    if (!texto.trim()) return;
    try {
      if (notas.dataset.notas === "copiar") { await window.nx.rpc("clipboard.set", { text: texto }); showToast("Copiado."); }
      else { await window.nx.mailboxSend(texto); showToast("Mandado para o celular."); }
    } catch { showToast("Não deu certo.", true); }
    return;
  }

  const chip = alvo("#home-clima-chip");
  if (chip) { document.querySelector('[data-card="clima"]')?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }

  const login = alvo("button[data-spotify]");
  if (login) {
    try { await window.nx.spotifyLogin(); showToast("Terminando no navegador…"); }
    catch { showToast("Não consegui abrir o login do Spotify."); }
    return;
  }

  const mus = alvo("button[data-mus]");
  if (mus) {
    const op = mus.dataset.mus;
    const n = dadosInicio.spotify;
    try {
      if (op === "playpause") await window.nx.spotifyCommand(n?.isPlaying ? "pause" : "play");
      else if (op === "shuffle") await window.nx.spotifyCommand("shuffle", !n?.shuffle);
      // off → context → track → off. Um botão só para os três estados, como no Spotify.
      else if (op === "repeat") {
        const ordem = ["off", "context", "track"];
        await window.nx.spotifyCommand("repeat", ordem[(ordem.indexOf(n?.repeat ?? "off") + 1) % 3]);
      }
      else await window.nx.spotifyCommand(op);
      setTimeout(atualizarInicio, 400);   // a API do Spotify leva um instante para refletir
    } catch { showToast("Não consegui falar com o Spotify."); }
    return;
  }

  // Pular para uma posição da faixa.
  const seek = alvo("#mus-seek");
  if (seek) {
    const n = dadosInicio.spotify;
    if (!n?.durationMs) return;
    const r = seek.getBoundingClientRect();
    const destino = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * n.durationMs);
    // Move a barra na hora: esperar a resposta do Spotify faz o clique parecer ignorado.
    n.progressMs = destino;
    const fill = document.getElementById("mus-seek-fill");
    if (fill) { fill.style.transition = "none"; fill.style.transform = `scaleX(${destino / n.durationMs})`; }
    try { await window.nx.spotifyCommand("seek", destino); } catch { showToast("Não consegui pular."); }
    return;
  }

  const abrir = alvo("button[data-abrir]");
  if (abrir) {
    try { await window.nx.rpc("apps.open", { name: abrir.dataset.abrir }); showToast(`Abrindo ${abrir.dataset.abrir}…`); }
    catch { showToast("Não consegui abrir."); }
    return;
  }

  const clip = alvo("button[data-clip]");
  if (clip) {
    if (clip.dataset.clip === "atualizar") { await atualizarInicio(); }
    else if (dadosInicio.clipboard) {
      try { await window.nx.mailboxSend(dadosInicio.clipboard); showToast("Mandado para o celular."); }
      catch { showToast("Não consegui mandar."); }
    }
    return;
  }

  const bolha = alvo("button[data-sug]");
  if (bolha) {
    const s = (dadosInicio.sugestoes ?? [])[Number(bolha.dataset.sug)];
    if (!s) return;
    // A bolha executa direto pelo RPC. Montar uma frase em português e mandar para o
    // modelo seria mais lento e não-determinístico, para um comando que já é sabido.
    if (s.acao?.metodo) {
      bolha.disabled = true;
      try {
        // A caixa de recados vive no IPC, não na superfície do RPC — o serviço de
        // sugestões marca esse caso com um método sentinela em vez de inventar um
        // método RPC só para ele.
        if (s.acao.metodo === "__mailbox") await window.nx.mailboxSend(String(s.acao.params?.texto ?? ""));
        else await window.nx.rpc(s.acao.metodo, s.acao.params);
        showToast(s.acao.aviso ?? "Feito."); await atualizarInicio();
      }
      catch { showToast("Não consegui executar."); }
      finally { bolha.disabled = false; }
    } else if (s.acao?.aba) {
      switchView(s.acao.aba);
      // Mesmo atraso do painel de rede: a troca de aba fecha a gaveta antes de abrir outra.
      if (s.acao.painel) setTimeout(() => abrirPainelPc(s.acao.painel), 80);
    }
    return;
  }
});

// Um comando por pixel arrastado estouraria a cota da API — o valor aparece no `input`
// e só é enviado no `change`, que dispara ao soltar.
document.getElementById("view-inicio")?.addEventListener("input", (e) => {
  const notas = e.target.closest("#notas-caixa");
  if (notas) {
    const estado = document.getElementById("notas-estado");
    if (estado) estado.textContent = "Escrevendo…";
    clearTimeout(notasTimer);
    notasTimer = setTimeout(async () => {
      dadosInicio.notas = notas.value;
      try { await window.nx.setConfig({ homeNotas: notas.value }); if (estado) estado.textContent = "Guardado"; }
      catch { if (estado) estado.textContent = "Não consegui guardar"; }
    }, 800);
    return;
  }
  const v = e.target.closest("#mus-vol");
  if (!v) return;
  const saida = document.getElementById("mus-vol-val");
  if (saida) saida.textContent = v.value;
});

document.getElementById("view-inicio")?.addEventListener("change", async (e) => {
  const vol = e.target.closest("#mus-vol");
  if (vol) {
    try { await window.nx.spotifyCommand("volume", Number(vol.value)); }
    catch { showToast("Não consegui mudar o volume."); }
    if (dadosInicio.spotify) dadosInicio.spotify.volumePercent = Number(vol.value);
    return;
  }
  const t = e.target.closest("input[data-card-toggle]");
  if (!t) return;
  const id = t.dataset.cardToggle;
  estadoCards.ocultos = t.checked
    ? estadoCards.ocultos.filter(x => x !== id)
    : [...estadoCards.ocultos, id];
  await salvarCards();
  await atualizarInicio();
  ligarArrasto();
});

document.getElementById("view-inicio")?.addEventListener("submit", async (e) => {
  const form = e.target.closest(".lembrete-novo");
  if (!form) return;
  e.preventDefault();
  const texto = form.texto.value.trim();
  const hora = form.hora.value;
  if (!texto || !hora) { showToast("Falta o texto ou a hora."); return; }

  // A hora digitada é sempre a próxima ocorrência: 08:00 às 14h vira amanhã, não hoje de
  // manhã — senão o lembrete nasceria já vencido e dispararia na hora.
  const [h, m] = hora.split(":").map(Number);
  const quando = new Date();
  quando.setHours(h, m, 0, 0);
  if (quando.getTime() <= Date.now()) quando.setDate(quando.getDate() + 1);

  try {
    await window.nx.rpc("reminders.create", { text: texto, dueAt: quando.getTime() });
    showToast(`Lembrete criado para ${quandoTexto(quando.getTime())}.`);
    form.reset();
    await atualizarInicio();
  } catch { showToast("Não consegui criar o lembrete."); }
});

// A telemetria já chega de 5 em 5 segundos por IPC; aproveitar o mesmo evento evita um
// segundo laço de polling só para esta tela.
// Só o card de telemetria precisa desse pulso; redesenhar a tela inteira a cada 5 s
// mataria a digitação no formulário de lembrete e o arrasto em andamento.
window.nx.onTelemetry?.((t) => {
  pulsarVitais(t);   // a aba PC guarda o histórico mesmo fora dela — a faísca nasce cheia
  if (layoutEl.getAttribute("data-view") !== "inicio" || cardArrastado) return;
  if (estadoCards.ocultos.includes("computador")) return;
  const cpu = document.getElementById("home-cpu");
  const ram = document.getElementById("home-ram");
  if (cpu) animarNumero(cpu, Math.round(t.cpu_pct ?? 0));
  if (ram) animarNumero(ram, Math.round(t.ram_pct ?? 0));
  const barras = document.querySelectorAll('[data-card="computador"] .home-bar > i');
  if (barras[0]) barras[0].style.transform = `scaleX(${(t.cpu_pct ?? 0) / 100})`;
  if (barras[1]) barras[1].style.transform = `scaleX(${(t.ram_pct ?? 0) / 100})`;
  if (dadosInicio.telemetria) dadosInicio.telemetria = t;
});

// ── Novidades (fase 12) ───────────────────────────────────────────────────────
// Na primeira abertura depois de uma atualização, o que mudou aparece no topo da Início,
// uma vez. "Entendi" marca como visto; a próxima versão volta a mostrar.
async function mostrarNovidades() {
  const alvo = document.getElementById("home-novidades");
  if (!alvo || !window.nx.novidades) return;
  let n = null;
  try { n = await window.nx.novidades(); } catch { return; }
  if (!n?.notas) return;
  alvo.innerHTML = `
    <div class="novidades-topo">${ico("sparkles")}<strong>Novidades da ${escHtml(n.versao)}</strong>
      <button type="button" id="novidades-ok">Entendi</button></div>
    <div class="novidades-texto">${escHtml(n.notas)}</div>`;
  alvo.hidden = false;
  document.getElementById("novidades-ok")?.addEventListener("click", async () => {
    alvo.hidden = true;
    try { await window.nx.novidadesVistas(); } catch { /* mostra de novo na próxima abertura */ }
  });
}
mostrarNovidades();
