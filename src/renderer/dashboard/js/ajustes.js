// dashboard/js/ajustes.js — esquema AJUSTES, hub, gaveta genérica (abrirGaveta/fecharGaveta), cidade do clima, popover de conversas.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// ─────────────────────────────────────────────────
// AJUSTES — tudo numa tela só
// ─────────────────────────────────────────────────
//
// As configurações completas moravam numa janela à parte (`config.html`), atrás de um
// botão "Abrir configurações completas". Agora estão aqui.
//
// O formulário é GERADO A PARTIR DE UM ESQUEMA, não copiado do `config.html`. Duplicar
// aquelas ~400 linhas de markup criaria duas telas para manter em par, e a primeira vez
// que um campo mudasse de nome elas divergiriam em silêncio. Aqui cada campo é uma
// entrada na lista abaixo, e a persistência usa o `nx.getConfig`/`nx.setConfig` que o
// preload do dashboard já expunha.
//
// `config.html` continua existindo como janela avulsa da bandeja.

const AJUSTES = [
  {
    grupo: "Cérebro",
    nota: "O local é o padrão porque o prompt de roteamento tem ~3,4 mil tokens e o plano " +
          "gratuito da Groq devolve 429 já na segunda chamada seguida. Medido em 20/09/2026 na " +
          "bancada do agente (20 pedidos compostos e condicionais × 3): qwen2.5:7b acertou 80% em " +
          "1,0 s, llama3.1:8b 73% em 2,1 s, llama3.2:3b 60% e age em conversa.",
    campos: [
      { chave: "routerProvider", rotulo: "Quem decide a ação", tipo: "select", opcoes: [
        ["ollama", "Local — Ollama nesta máquina"], ["groq", "Nuvem — Groq"]] },
      { chave: "chatProvider", rotulo: "Quem escreve a resposta", tipo: "select", opcoes: [
        ["ollama", "Local — Ollama nesta máquina"], ["groq", "Nuvem — Groq"]] },
      { chave: "ollamaRouterModel", rotulo: "Modelo local", tipo: "texto", dica: "ollama pull qwen2.5:7b" },
      { chave: "cerebroFerramentas", rotulo: "Agir em etapas (ferramentas)", tipo: "bool",
        dica: "O modelo olha o PC (o que está aberto, clima, estado) antes de agir e encadeia ações. Desligado, volta ao roteador de uma lista só." },
      { chave: "fallbackToGroq", rotulo: "Cair na Groq se o local falhar", tipo: "bool",
        dica: "Cobre JSON quebrado e Ollama fora do ar. Não cobre pedido composto pela metade — aquilo é JSON válido." },
      { chave: "evitarGpuOcupada", rotulo: "Usar a nuvem com jogo aberto", tipo: "bool",
        dica: "Um modelo de 7-8B ocupa ~4,7 GB de VRAM enquanto carregado, e leva até 18 s para carregar a frio." },
    ],
  },
  {
    grupo: "Aparência",
    nota: "O Windows deste PC controla animação para o sistema inteiro. Se você desligou " +
          "\"Efeitos de animação\" lá por causa de jogo ou desempenho, use \"Sempre\" para " +
          "manter o ELYSIUM animado mesmo assim.",
    campos: [
      { chave: "movimento", rotulo: "Animações", tipo: "select", opcoes: [
        ["auto", "Seguir o Windows"], ["sempre", "Sempre animar"], ["nunca", "Nunca animar"]] },
    ],
  },
  {
    grupo: "Voz",
    nota: "Vozes neurais do Edge, pela internet. Sem rede o ELYSIUM cai na voz do Windows.",
    campos: [
      { chave: "voice", rotulo: "Voz", tipo: "select", opcoes: [
        ["pt-BR-AntonioNeural", "Antonio — masculina"],
        ["pt-BR-FranciscaNeural", "Francisca — feminina"],
        ["pt-BR-ThalitaNeural", "Thalita — feminina, mais jovem"],
        ["pt-BR-MacerioMultilingualNeural", "Macerio — masculina, multilíngue"]] },
      { chave: "palavraDeAtivacao", rotulo: "Acordar ao ouvir “Elysium”", tipo: "bool",
        dica: "Diga “Elysium” (ou “ei Elysium”) e ele começa a ouvir, sem o atalho. Reconhecimento do próprio Windows, offline: nenhum áudio sai do PC. Deixa o microfone aberto o tempo todo (~0,3% de CPU)." },
      { chave: "silenceMs", rotulo: "Silêncio para parar", tipo: "faixa", min: 500, max: 5000, passo: 100, unidade: "ms" },
      { chave: "maxRecordMs", rotulo: "Gravação máxima", tipo: "faixa", min: 10000, max: 300000, passo: 5000, unidade: "ms" },
    ],
  },
  {
    grupo: "Conversa",
    campos: [
      { chave: "chatHistoryTurns", rotulo: "Turnos na memória", tipo: "faixa", min: 2, max: 20, passo: 1, unidade: "" },
      { chave: "chatIdleResetMs", rotulo: "Reset por inatividade", tipo: "faixa", min: 60000, max: 3600000, passo: 60000, unidade: "ms" },
    ],
  },
  {
    grupo: "Modelos da Groq",
    nota: "Só entram quando o provedor acima for Nuvem, ou quando o local falhar.",
    campos: [
      { chave: "sttModel", rotulo: "Transcrição", tipo: "select", opcoes: [
        ["whisper-large-v3", "Whisper Large v3"], ["whisper-large-v3-turbo", "Whisper Large v3 Turbo"]] },
      { chave: "routerModel", rotulo: "Decide a ação", tipo: "select", opcoes: [
        ["openai/gpt-oss-120b", "GPT-OSS 120B"], ["openai/gpt-oss-20b", "GPT-OSS 20B"], ["qwen/qwen3.6-27b", "Qwen3.6 27B"]],
        dica: "A família Llama foi aposentada pela Groq. Medido: só o 120B devolve o nome da ação no formato certo." },
      { chave: "brainModel", rotulo: "Escreve a resposta", tipo: "select", opcoes: [
        ["openai/gpt-oss-120b", "GPT-OSS 120B"], ["openai/gpt-oss-20b", "GPT-OSS 20B"], ["qwen/qwen3.6-27b", "Qwen3.6 27B"]] },
    ],
  },
  {
    grupo: "Sistema",
    campos: [
      { chave: "autoLaunch", rotulo: "Iniciar com o Windows", tipo: "bool" },
    ],
  },
];

/** Formata um valor de faixa para leitura humana. */
function valorLegivel(campo, v) {
  if (campo.unidade !== "ms") return String(v);
  if (v < 1000) return `${v} ms`;
  if (v < 60000) return `${(v / 1000).toFixed(v % 1000 ? 1 : 0).replace(".", ",")} s`;
  return `${Math.round(v / 60000)} min`;
}

/**
 * Os azulejos do hub. `nos` são os seletores das seções que a gaveta mostra para aquele
 * assunto — mais de um quando o assunto vive em dois lugares (Aparência = tema estático +
 * "movimento" do esquema). `resumo` lê a config para dizer, no azulejo, o que está valendo.
 */
const SECOES_AJUSTES = [
  { id: "aparencia", titulo: "Aparência", icone: "droplet", nos: ["#sec-aparencia", "[data-secao='aparencia']"],
    resumo: (c) => THEMES[c.theme]?.name ?? "Tema" },
  { id: "atalho", titulo: "Atalho e conta", icone: "key", nos: ["#sec-atalho"],
    resumo: (c) => c.shortcut || "Ctrl+Shift+J" },
  { id: "cerebro", titulo: "Cérebro", icone: "cpu", nos: ["[data-secao='cerebro']", "[data-secao='modelos-da-groq']"],
    resumo: (c) => (c.routerProvider === "groq" ? "Nuvem" : "Local") + " · " + (c.chatProvider === "groq" ? "responde na nuvem" : "responde local") },
  { id: "voz", titulo: "Voz", icone: "mic", nos: ["[data-secao='voz']"],
    resumo: (c) => (String(c.voice || "").match(/pt-BR-([A-Za-z]+?)(Multilingual)?Neural/)?.[1]) || "Antonio" },
  { id: "clima", titulo: "Clima", icone: "cloud", nos: ["#sec-clima"],
    resumo: (c) => c.climaCidade || "Cidade não definida" },
  { id: "conversa", titulo: "Conversa", icone: "message-circle", nos: ["[data-secao='conversa']"],
    resumo: (c) => `${c.chatHistoryTurns ?? 8} turnos na memória` },
  { id: "celular", titulo: "Celular", icone: "smartphone", nos: ["#orbe-pop > .pop-corpo"],
    resumo: () => "QR, token e acesso de fora", aoAbrir: () => loadPairing() },
  { id: "sistema", titulo: "Sistema", icone: "power", nos: ["[data-secao='sistema']"],
    resumo: (c) => c.autoLaunch ? "Inicia com o Windows" : "Não inicia com o Windows" },
  { id: "recentes", titulo: "Comandos recentes", icone: "clock", nos: ["#sec-recentes"],
    resumo: () => "O que você mais pede" },
  { id: "sobre", titulo: "Sobre", icone: "info", nos: ["#sec-sobre"],
    resumo: () => "Versão, porta e pastas", aoAbrir: () => desenharSobre() },
];

let cfgAtual = {};
let secaoAberta = null;      // { def, movidos: [{ no, pai, proximo }] }

// ── A gaveta genérica ─────────────────────────────
//
// Um painel só, reaproveitado por Ajustes (que MOVE seções para dentro) e pela aba PC
// (que desenha HTML). `nos` são movidos e devolvidos ao fechar; `html` é descartado.
// `aoFechar` existe para quem precisa desligar um temporizador de atualização.
let gavetaAtual = null;      // { movidos, aoFechar }

function abrirGaveta({ titulo, icone = "grid", nos = [], html = "", aoAbrir, aoFechar, classe = "" }) {
  if (gavetaAtual) fecharGaveta(true);
  const corpo = document.getElementById("gaveta-corpo");
  corpo.innerHTML = html;
  corpo.className = classe;
  const movidos = [];
  for (const sel of nos) {
    document.querySelectorAll(sel).forEach(no => {
      movidos.push({ no, pai: no.parentNode, proximo: no.nextSibling });
      corpo.appendChild(no);
    });
  }
  gavetaAtual = { movidos, aoFechar };
  document.getElementById("gaveta-titulo").textContent = titulo;
  document.getElementById("gaveta-ico").innerHTML = ico(icone, "ico-sm");
  document.getElementById("gaveta-veu").classList.add("aberto");
  corpo.scrollTop = 0;
  aoAbrir?.(corpo);
  corpo.querySelector("input[type='text'], input[type='search'], select, button")?.focus?.({ preventScroll: true });
}

/** Devolve cada nó movido exatamente de onde saiu (mesmo pai, mesma posição). */
function fecharGaveta(silencioso = false) {
  if (!gavetaAtual) return;
  const g = gavetaAtual;
  gavetaAtual = null;
  for (const m of g.movidos) m.pai.insertBefore(m.no, m.proximo);
  g.aoFechar?.();
  if (!silencioso) {
    document.getElementById("gaveta-veu").classList.remove("aberto");
    // O HTML desenhado some só depois da saída animada, senão a gaveta fecha vazia.
    setTimeout(() => { if (!gavetaAtual) document.getElementById("gaveta-corpo").innerHTML = ""; }, 260);
  }
}

document.getElementById("gaveta-fechar")?.addEventListener("click", () => fecharGaveta());
document.getElementById("gaveta-veu")?.addEventListener("click", (e) => { if (e.target.id === "gaveta-veu") fecharGaveta(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && gavetaAtual) { e.stopPropagation(); fecharGaveta(); }
}, true);

function desenharHub() {
  const hub = document.getElementById("aj-hub");
  if (!hub) return;
  hub.innerHTML = SECOES_AJUSTES.map(s => `
    <button class="aj-azulejo" data-secao-id="${s.id}">
      <span class="aj-azulejo-ico">${ico(s.icone)}</span>
      <span class="aj-azulejo-txt">
        <span class="aj-azulejo-nome">${escHtml(s.titulo)}</span>
        <span class="aj-azulejo-resumo">${escHtml(String(s.resumo(cfgAtual) ?? ""))}</span>
      </span>
      ${ico("chevron-right", "ico-sm")}
    </button>`).join("");
}

/** Move as seções do assunto para dentro da gaveta e abre. */
function abrirSecao(id) {
  const def = SECOES_AJUSTES.find(s => s.id === id);
  if (!def) return;
  secaoAberta = def;
  abrirGaveta({
    titulo: def.titulo, icone: def.icone, nos: def.nos, classe: "gaveta-ajustes",
    aoAbrir: () => def.aoAbrir?.(),
    // O resumo do azulejo muda com o que foi mexido lá dentro.
    aoFechar: () => { secaoAberta = null; desenharHub(); },
  });
}

function fecharSecao() { if (secaoAberta) fecharGaveta(); }

document.getElementById("aj-hub")?.addEventListener("click", (e) => {
  const az = e.target.closest("[data-secao-id]");
  if (az) abrirSecao(az.dataset.secaoId);
});

/** A seção "Sobre": o que se pergunta quando algo dá errado, num lugar só. */
async function desenharSobre() {
  const alvo = document.getElementById("sobre-corpo");
  if (!alvo) return;
  let info = {}, versao = "—";
  try { info = (await window.nx.getPairingInfo()) ?? {}; } catch { /* sem rede */ }
  try { versao = await window.nx.versao(); } catch { /* preload antigo */ }
  const linhas = [
    ["Versão", versao],
    ["Porta", String(info.port ?? 4200)],
    ["Endereços", (info.endpoints ?? []).map(e => e.address).join(" · ") || info.ip || "—"],
    ["Configuração", "%APPDATA%\\elysium\\elysium-config.json"],
    ["Atalho global", cfgAtual.shortcut || "Ctrl+Shift+J"],
    ["Paleta", "Ctrl+K · Ctrl+1…5 troca de aba"],
  ];
  alvo.innerHTML = linhas.map(([k, v]) => `<div class="cfg-row"><label>${escHtml(k)}</label><div class="cfg-controle"><span class="cfg-atual" style="white-space:normal">${escHtml(String(v))}</span></div></div>`).join("");
}

function slugSecao(nome) {
  // Sem depender do `dobrar` da paleta, declarado bem mais abaixo neste arquivo.
  return String(nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function desenharAjustes(cfg) {
  cfgAtual = cfg ?? {};
  desenharHub();
  const alvo = document.getElementById("cfg-form");
  if (!alvo) return;

  alvo.innerHTML = AJUSTES.map(g => `
    <section class="cfg-grupo" data-secao="${slugSecao(g.grupo)}">
      <h3>${escHtml(g.grupo)}</h3>
      ${g.nota ? `<p class="cfg-nota">${escHtml(g.nota)}</p>` : ""}
      ${g.campos.map(c => {
        const v = cfg[c.chave];
        let controle;
        if (c.tipo === "select") {
          controle = `<select data-cfg="${c.chave}">` + c.opcoes.map(([val, txt]) =>
            `<option value="${escHtml(val)}"${val === v ? " selected" : ""}>${escHtml(txt)}</option>`).join("") + `</select>`;
        } else if (c.tipo === "bool") {
          controle = `<label class="cfg-switch"><input type="checkbox" data-cfg="${c.chave}"${v ? " checked" : ""}><span></span></label>`;
        } else if (c.tipo === "faixa") {
          controle = `<div class="cfg-faixa">
            <input type="range" data-cfg="${c.chave}" min="${c.min}" max="${c.max}" step="${c.passo}" value="${Number(v) || c.min}">
            <span class="cfg-faixa-val" data-val-de="${c.chave}">${escHtml(valorLegivel(c, Number(v) || c.min))}</span>
          </div>`;
        } else {
          controle = `<input type="text" data-cfg="${c.chave}" value="${escHtml(String(v ?? ""))}" spellcheck="false">`;
        }
        return `<div class="cfg-row">
          <label>${escHtml(c.rotulo)}${c.dica ? `<small>${escHtml(c.dica)}</small>` : ""}</label>
          <div class="cfg-controle">${controle}</div>
        </div>`;
      }).join("")}
    </section>`).join("");
}

/**
 * Grava campo a campo, no `change`. Não há botão "Salvar" de propósito: com botão, sair da
 * tela perde o que foi mexido — e esta tela agora é uma aba, de onde se sai o tempo todo.
 */
document.addEventListener("change", async (e) => {
  const el = e.target.closest("[data-cfg]");
  if (!el) return;
  const chave = el.dataset.cfg;
  const valor = el.type === "checkbox" ? el.checked
              : el.type === "range" ? Number(el.value)
              : el.value;
  // Aplica na hora o que é visual; esperar reiniciar para ver o efeito de um seletor de
  // aparência é o tipo de coisa que faz parecer que não funcionou.
  if (chave === "movimento") document.documentElement.dataset.movimento = String(valor);
  try { await window.nx.setConfig({ [chave]: valor }); cfgAtual[chave] = valor; showToast("Salvo."); }
  catch { showToast("Não consegui salvar."); }
});

// O número ao lado do controle acompanha o arrasto; a gravação só acontece no `change`,
// que dispara ao soltar — senão seriam dezenas de escritas em disco por arrasto.
document.addEventListener("input", (e) => {
  const el = e.target.closest('input[type="range"][data-cfg]');
  if (!el) return;
  const campo = AJUSTES.flatMap(g => g.campos).find(c => c.chave === el.dataset.cfg);
  const saida = document.querySelector(`[data-val-de="${el.dataset.cfg}"]`);
  if (campo && saida) saida.textContent = valorLegivel(campo, Number(el.value));
});

// ── Cidade do clima ──────────────────────────────
//
// A busca usa a API de geocodificação da própria Open-Meteo — mesma casa do clima, também
// sem chave. O que fica gravado é o nome escolhido mais latitude e longitude; não há
// geolocalização do sistema nem descoberta por IP em lugar nenhum.

let buscaClimaTimer = 0;

document.getElementById("clima-busca")?.addEventListener("input", (e) => {
  const termo = e.target.value.trim();
  const lista = document.getElementById("clima-resultados");
  clearTimeout(buscaClimaTimer);
  if (termo.length < 3) { lista.innerHTML = ""; return; }
  // Debounce: sem ele seria uma requisição por tecla digitada.
  buscaClimaTimer = setTimeout(async () => {
    try {
      const r = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(termo)}&count=5&language=pt`);
      const j = await r.json();
      const achados = j.results ?? [];
      lista.innerHTML = achados.length
        ? achados.map(c =>
            `<button class="clima-op" data-lat="${c.latitude}" data-lon="${c.longitude}" data-nome="${escHtml(c.name)}">
              ${escHtml(c.name)}<span>${escHtml([c.admin1, c.country].filter(Boolean).join(", "))}</span>
            </button>`).join("")
        : `<div class="home-empty">Nada encontrado.</div>`;
    } catch { lista.innerHTML = `<div class="home-empty">Sem conexão para buscar.</div>`; }
  }, 350);
});

document.getElementById("clima-resultados")?.addEventListener("click", async (e) => {
  const op = e.target.closest(".clima-op");
  if (!op) return;
  try {
    await window.nx.setConfig({
      climaCidade: op.dataset.nome,
      climaLat: Number(op.dataset.lat),
      climaLon: Number(op.dataset.lon),
    });
    document.getElementById("clima-atual").textContent = op.dataset.nome;
    cfgAtual.climaCidade = op.dataset.nome;
    document.getElementById("clima-busca").value = "";
    document.getElementById("clima-resultados").innerHTML = "";
    showToast(`Clima de ${op.dataset.nome}.`);
  } catch { showToast("Não consegui salvar a cidade."); }
});

// ── Conversas salvas, num popover ────────────────
//
// Saíram da gaveta de Ajustes: conversa salva não é configuração. Viraram um botão de
// relógio no topo do chat, que é exatamente onde o ELYSIUM-M já as coloca.

const convPop = document.getElementById("conv-pop");
const convBtn = document.getElementById("conv-btn");

function abrirConversas(abrir) {
  if (!convPop) return;
  const estaAberto = convPop.classList.contains("aberto");
  const alvo = abrir ?? !estaAberto;
  if (alvo === estaAberto) return;

  if (alvo) {
    const r = convBtn.getBoundingClientRect();
    convPop.style.top = `${r.bottom + 10}px`;
    convPop.style.left = `${r.left}px`;
    convPop.classList.add("aberto");
    loadConversations();
    convBtn?.setAttribute("aria-expanded", "true");
  } else {
    convPop.classList.remove("aberto");
    convBtn?.setAttribute("aria-expanded", "false");
  }
}

convBtn?.addEventListener("click", (e) => { e.stopPropagation(); abrirConversas(); });
convPop?.addEventListener("click", (e) => e.stopPropagation());
document.addEventListener("click", () => abrirConversas(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && convPop?.classList.contains("aberto")) { e.stopPropagation(); abrirConversas(false); }
}, true);
