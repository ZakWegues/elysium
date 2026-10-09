// dashboard/js/ajustes.js — esquema AJUSTES, hub, gaveta genérica (abrirGaveta/fecharGaveta), cidade do clima, popover de conversas.
//
// Era um trecho do <script> único do dashboard.html (bloco 76). Scripts clássicos, não
// módulos: o escopo global é um só, e a ORDEM dos <script> no HTML é a ordem em que o
// código estava. Função declarada aqui pode ser chamada de qualquer arquivo em tempo de
// execução; chamada SÍNCRONA no nível do arquivo só pode apontar para arquivo anterior.

// Estado da atualização (bloco 95). Declarado no topo porque o resumo do azulejo "Sobre"
// o lê, e o hub pode ser desenhado antes de o trecho de atualização rodar.
let atualizacaoAtual = null;
/** Estado da Google Agenda (bloco 120), pelo mesmo motivo: o resumo do azulejo o lê. */
let agendaAtual = null;

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
        ["auto", "Híbrido — conhecimento na nuvem, o resto local"], ["ollama", "Local — Ollama nesta máquina"], ["groq", "Nuvem — Groq"]],
        dica: "Híbrido: perguntas de conhecimento e o chat escrito vão para a Groq (acerta mais fato); ações e conversa curta ficam no local." },
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
        ["pt-BR-FranciscaNeural", "Francisca — feminina (padrão)"],
        ["pt-BR-ThalitaMultilingualNeural", "Thalita — feminina, mais jovem"],
        ["pt-BR-AntonioNeural", "Antonio — masculina"]],
        dica: "As três vozes brasileiras do Edge. (A Macerio só existe no Azure pago: quem tinha escolhido ouve o Antonio.)" },
      { chave: "velocidadeFala", rotulo: "Velocidade da fala", tipo: "faixa", min: -10, max: 10, passo: 1, unidade: "%",
        dica: "0 é o normal de cada voz. Por cima disso ela já fala um pouco mais devagar à noite e quando você parece cansado, e mais rápido quando você está com pressa." },
      { chave: "falaAntecipada", rotulo: "Começar a falar antes de terminar", tipo: "bool",
        dica: "Na conversa por voz, ela fala a primeira frase assim que fica pronta, sem esperar a resposta inteira. Se a fala picotar, desligue." },
      { chave: "somDeEscuta", rotulo: "Bipe ao ouvir", tipo: "bool",
        dica: "Um som curto quando ela começa e quando para de ouvir. Vale ao reabrir o dashboard." },
      { chave: "vozBaixaDeNoite", rotulo: "Falar mais baixo à noite", tipo: "bool",
        dica: "Das 22 h às 7 h a Ely fala 30% mais baixo." },
      { chave: "resumoAutomatico", rotulo: "Resumo do dia pela manhã", tipo: "bool",
        dica: "Na primeira volta ao PC entre 6 e 11 h (depois de 1 h parado ou ao destravar a tela), ele fala clima, lembretes, rotinas e o que pede atenção. Uma vez por dia. A qualquer hora: diga “bom dia” ou “resumo do dia”." },
      { chave: "palavraDeAtivacao", rotulo: "Acordar ao ouvir “Ely”", tipo: "bool",
        dica: "Diga “Ely” (ou “ei Ely”; “Elysium” também vale) e ela começa a ouvir, sem o atalho. Reconhecimento do próprio Windows, offline: nenhum áudio sai do PC. Deixa o microfone aberto o tempo todo (~0,3% de CPU)." },
      { chave: "silenceMs", rotulo: "Silêncio para parar", tipo: "faixa", min: 500, max: 5000, passo: 100, unidade: "ms" },
      { chave: "maxRecordMs", rotulo: "Gravação máxima", tipo: "faixa", min: 10000, max: 300000, passo: 5000, unidade: "ms" },
    ],
  },
  {
    grupo: "Conversa",
    campos: [
      { chave: "nomeDoUsuario", rotulo: "Seu nome", tipo: "texto", dica: "A Ely usa nos prompts; fica só neste PC." },
      { chave: "tratamento", rotulo: "Como a Ely te chama", tipo: "texto", dica: "Ex.: chefe, senhor, o seu nome. Vazio = sem tratamento. Aparece na saudação e de vez em quando nas respostas." },
      // Bloco 134: o jeito de responder. Fica só na config deste PC (dado pessoal).
      { chave: "estiloResposta", rotulo: "Tamanho das respostas", tipo: "select", opcoes: [
        ["direto", "Direto — o mínimo que resolve"], ["equilibrado", "Equilibrado — conforme a pergunta"], ["detalhado", "Detalhado — com o porquê e exemplos"]],
        dica: "Vale para o chat escrito e, mais curto, para a voz." },
      { chave: "instrucoesPessoais", rotulo: "Como a Ely responde", tipo: "area",
        dica: "Em texto livre: como você quer ser tratado, o que evitar, o que sempre incluir. Ex.: “sem emoji; quando eu perguntar preço, dê em reais; me corrija se eu estiver errado”." },
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
        ["openai/gpt-oss-120b", "GPT-OSS 120B"], ["openai/gpt-oss-20b", "GPT-OSS 20B"], ["qwen/qwen3.8-27b", "Qwen3.8 27B"]],
        dica: "A família Llama foi aposentada pela Groq. Medido: só o 120B devolve o nome da ação no formato certo." },
      { chave: "brainModel", rotulo: "Escreve a resposta", tipo: "select", opcoes: [
        ["openai/gpt-oss-120b", "GPT-OSS 120B"], ["openai/gpt-oss-20b", "GPT-OSS 20B"], ["qwen/qwen3.8-27b", "Qwen3.8 27B"]] },
    ],
  },
  {
    grupo: "Sistema",
    campos: [
      { chave: "autoLaunch", rotulo: "Iniciar com o Windows", tipo: "bool" },
      { chave: "atualizarDeMadrugada", rotulo: "Atualizar sozinho de madrugada", tipo: "bool",
        dica: "Versão nova já baixada instala entre 3 e 5 h, só com o PC parado há 15 minutos e o ELYSIUM ocioso. Desligado, ela espera o botão em Ajustes → Sobre." },
      { chave: "acessoRemotoNaSaude", rotulo: "Acompanhar o acesso de fora (Tailscale)", tipo: "bool",
        dica: "Mostra no card Saúde, no resumo do dia e no celular se o Tailscale está ligado no PC e no celular. Desligado, ninguém fala dele." },
    ],
  },
];

/** Formata um valor de faixa para leitura humana. */
function valorLegivel(campo, v) {
  if (campo.unidade === "%") return `${v > 0 ? "+" : ""}${v}%`;
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
    resumo: (c) => (c.routerProvider === "groq" ? "Nuvem" : "Local") + " · " + (c.chatProvider === "groq" ? "responde na nuvem" : c.chatProvider === "auto" ? "híbrido" : "responde local") },
  { id: "voz", titulo: "Voz", icone: "mic", nos: ["[data-secao='voz']"],
    resumo: (c) => (String(c.voice || "").match(/pt-BR-([A-Za-z]+?)(Multilingual)?Neural/)?.[1]) || "Francisca" },
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
  { id: "dados", titulo: "Dados e diagnóstico", icone: "download", nos: ["#sec-dados"],
    resumo: () => "Backup, importar, log" },
  { id: "comandos", titulo: "Comandos de IA", icone: "sparkles", nos: ["#sec-comandos"],
    resumo: () => "Corrigir, traduzir, resumir… e os seus",
    aoAbrir: () => desenharComandos() },
  { id: "sobre", titulo: "Sobre", icone: "info", nos: ["#sec-sobre"],
    resumo: () => atualizacaoAtual?.desktop?.pronto ? `Versão ${atualizacaoAtual.desktop.versao} pronta para instalar` : "Versão, atualizações e pastas",
    aoAbrir: () => { desenharSobre(); desenharAtualizacao(); } },
  { id: "agenda", titulo: "Google Agenda", icone: "calendar", nos: ["#sec-agenda"],
    resumo: () => agendaAtual?.conectado ? "Conectada (só leitura)" : agendaAtual?.configurado ? "Falta conectar a conta" : "Desligada",
    aoAbrir: () => desenharAgenda() },
];

let cfgAtual = {};
let secaoAberta = null;      // { def, movidos: [{ no, pai, proximo }] }

// ── A gaveta genérica ─────────────────────────────
//
// Um painel só, reaproveitado por Ajustes (que MOVE seções para dentro) e pela aba PC
// (que desenha HTML). `nos` são movidos e devolvidos ao fechar; `html` é descartado.
// `aoFechar` existe para quem precisa desligar um temporizador de atualização.
let gavetaAtual = null;      // { movidos, aoFechar }

/** Quem tinha o foco antes da gaveta abrir — volta para ele ao fechar (08/10). */
let focoAntesDaGaveta = null;

function abrirGaveta({ titulo, icone = "grid", nos = [], html = "", aoAbrir, aoFechar, classe = "" }) {
  if (!gavetaAtual) focoAntesDaGaveta = document.activeElement;
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
  // Fase 19: o corpo da gaveta é o MESMO elemento a cada abertura, e o `aoAbrir` que pendura
  // um ouvinte nele acumulava um a cada vez — o Despejar salvava tudo duas vezes na 2ª
  // abertura. Quem pendura usa `{ signal }`: fechar a gaveta solta os ouvintes.
  const controle = new AbortController();
  gavetaAtual = { movidos, aoFechar, controle };
  document.getElementById("gaveta-titulo").textContent = titulo;
  document.getElementById("gaveta-ico").innerHTML = ico(icone, "ico-sm");
  document.getElementById("gaveta-veu").classList.add("aberto");
  corpo.scrollTop = 0;
  aoAbrir?.(corpo, controle.signal);
  // Quem abriu já pôs o foco num campo (a ressalva do "Concluir"): respeita. Antes o foco ia
  // para o primeiro campo/botão de qualquer jeito, e Enter concluía sem a ressalva (08/10).
  if (!corpo.contains(document.activeElement)) {
    corpo.querySelector("input[type='text'], input[type='search'], select, button")?.focus?.({ preventScroll: true });
  }
}

/** Devolve cada nó movido exatamente de onde saiu (mesmo pai, mesma posição). */
function fecharGaveta(silencioso = false) {
  if (!gavetaAtual) return;
  const g = gavetaAtual;
  gavetaAtual = null;
  for (const m of g.movidos) m.pai.insertBefore(m.no, m.proximo);
  g.controle?.abort();
  g.aoFechar?.();
  if (!silencioso) {
    document.getElementById("gaveta-veu").classList.remove("aberto");
    // O foco volta para quem abriu: sem isto quem usa teclado caía no começo da página.
    const voltar = focoAntesDaGaveta;
    focoAntesDaGaveta = null;
    if (voltar && document.contains(voltar)) voltar.focus?.({ preventScroll: true });
    // O HTML desenhado some só depois da saída animada, senão a gaveta fecha vazia.
    setTimeout(() => { if (!gavetaAtual) document.getElementById("gaveta-corpo").innerHTML = ""; }, 260);
  }
}

document.getElementById("gaveta-fechar")?.addEventListener("click", () => fecharGaveta());
document.getElementById("gaveta-veu")?.addEventListener("click", (e) => { if (e.target.id === "gaveta-veu") fecharGaveta(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && gavetaAtual) { e.stopPropagation(); fecharGaveta(); }
  // Tab não sai da gaveta aberta (fase 18): ela é modal; o foco dá a volta dentro dela.
  if (e.key === "Tab" && gavetaAtual) {
    const veu = document.getElementById("gaveta-veu");
    const focaveis = [...veu.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(x => !x.disabled && x.offsetParent !== null);
    if (!focaveis.length) return;
    const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    else if (!veu.contains(document.activeElement)) { e.preventDefault(); primeiro.focus(); }
  }
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

// ── Atualização automática (bloco 95) ─────────────────────────────────────────
// O main confere as releases do GitHub a cada 6 h e baixa sozinho; aqui só se mostra o
// estado e se decide QUANDO instalar (instalar fecha o app por alguns segundos).

function mb(bytes) { return `${Math.round((bytes || 0) / 1e6)} MB`; }

function desenharAtualizacao() {
  const e = atualizacaoAtual;
  const pill = document.getElementById("nav-atualizar");
  if (pill) pill.hidden = !e?.desktop?.pronto;
  const alvo = document.getElementById("sobre-atualizacao");
  if (!alvo || !e) return;

  const quando = e.verificadoEm ? new Date(e.verificadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "ainda não";
  let situacao, acao = "";
  if (e.verificando) situacao = "Procurando versão nova…";
  else if (e.semToken) situacao = "Sem acesso às releases: cole um token do GitHub abaixo, ou entre com o gh neste PC.";
  else if (e.erro) situacao = `Não consegui verificar: ${e.erro}`;
  else if (!e.desktop) situacao = `Você está na versão mais nova (${e.atual}).`;
  else if (!e.desktop.pronto) situacao = `Baixando a versão ${e.desktop.versao}… ${Math.round(e.desktop.progresso * 100)}%`;
  else {
    situacao = `A versão ${e.desktop.versao} está pronta (${mb(e.desktop.tamanho)}).`;
    acao = `<button type="button" data-atu="instalar" class="primario">Instalar e reabrir</button>`;
  }
  const notas = e.desktop?.notas ? `<pre class="atu-notas">${escHtml(e.desktop.notas)}</pre>` : "";
  const cel = e.celular
    ? `ELYSIUM-M ${escHtml(e.celular.versao)} ${e.celular.pronto ? "guardado aqui — o celular oferece a instalação sozinho" : `baixando ${Math.round(e.celular.progresso * 100)}%`}`
    : "nenhum APK publicado ainda";

  alvo.innerHTML = `
    <div class="atu-caixa${e.desktop?.pronto ? " pronta" : ""}">
      <div class="atu-linha"><svg class="ico" aria-hidden="true"><use href="#i-rotate"/></svg><strong>${escHtml(situacao)}</strong></div>
      ${notas}
      <div class="atu-meta">Última verificação: ${escHtml(quando)} · Celular: ${cel}</div>
      <div class="home-acoes" style="margin-top:10px">
        ${acao}
        <button type="button" data-atu="verificar"${e.verificando ? " disabled" : ""}>Verificar agora</button>
      </div>
      <details class="atu-token">
        <summary>Token do GitHub ${e.tokenProprio ? "(guardado)" : "(opcional)"}</summary>
        <p class="cfg-nota">Os repositórios são privados. Sem token, o ELYSIUM usa o login do <code>gh</code> deste PC. Para outro PC: um token "fine-grained" só com leitura de Contents nos dois repositórios. Ele fica ao lado da chave da Groq e não vai no backup.</p>
        <form data-atu-form class="atu-form">
          <input type="password" name="token" placeholder="github_pat_…" autocomplete="off" spellcheck="false">
          <button type="submit">Guardar</button>
          ${e.tokenProprio ? `<button type="button" data-atu="apagar-token">Apagar</button>` : ""}
        </form>
      </details>
    </div>`;
}

async function carregarAtualizacao() {
  try { atualizacaoAtual = await window.nx.atualizacaoEstado(); desenharAtualizacao(); } catch { /* preload antigo */ }
}

// Os ouvintes vão no próprio contêiner: a seção é movida para a gaveta e o nó viaja junto.
document.getElementById("sobre-atualizacao")?.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-atu]");
  if (!b) return;
  if (b.dataset.atu === "verificar") {
    atualizacaoAtual = { ...(atualizacaoAtual ?? {}), verificando: true };
    desenharAtualizacao();
    atualizacaoAtual = await window.nx.atualizacaoVerificar();
    desenharAtualizacao();
  } else if (b.dataset.atu === "instalar") {
    const r = await window.nx.atualizacaoInstalar();
    showToast(r?.mensagem ?? "…", !r?.ok);
  } else if (b.dataset.atu === "apagar-token") {
    atualizacaoAtual = await window.nx.atualizacaoToken("");
    desenharAtualizacao();
    showToast("Token apagado.");
  }
});
document.getElementById("sobre-atualizacao")?.addEventListener("submit", async (ev) => {
  const f = ev.target.closest("[data-atu-form]");
  if (!f) return;
  ev.preventDefault();
  const valor = f.elements.token.value.trim();
  if (!valor) return;
  f.elements.token.value = "";
  atualizacaoAtual = await window.nx.atualizacaoToken(valor);
  desenharAtualizacao();
  showToast(atualizacaoAtual?.erro ? `Token guardado, mas: ${atualizacaoAtual.erro}` : "Token guardado.");
});
document.getElementById("nav-atualizar")?.addEventListener("click", () => {
  switchView("ajustes");
  // Mesmo atraso do painel de rede: a troca de aba fecha a gaveta antes de abrir outra.
  setTimeout(() => abrirSecao("sobre"), 80);
});
window.nx.onAtualizacao?.((e) => {
  atualizacaoAtual = e;
  desenharAtualizacao();
  if (typeof desenharHub === "function") desenharHub();
});
carregarAtualizacao();

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
          // `Number(v) || min` transformava o 0 legítimo (velocidade normal) no mínimo da faixa.
          const num = v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? c.min : Number(v);
          controle = `<div class="cfg-faixa">
            <input type="range" data-cfg="${c.chave}" min="${c.min}" max="${c.max}" step="${c.passo}" value="${num}">
            <span class="cfg-faixa-val" data-val-de="${c.chave}">${escHtml(valorLegivel(c, num))}</span>
          </div>`;
        } else if (c.tipo === "area") {
          controle = `<textarea data-cfg="${c.chave}" rows="4" maxlength="1500" placeholder="Como você quer que ele responda…">${escHtml(String(v ?? ""))}</textarea>`;
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

// ── Dados e diagnóstico (blocos 96 e 97) ────────────────────────────────────
// Os ouvintes vão direto nos botões: a seção é MOVIDA para a gaveta (os nós são os mesmos),
// então o ouvinte viaja junto.
document.getElementById("dados-exportar")?.addEventListener("click", async () => {
  try {
    const r = await window.nx.backupExportar();
    if (r?.cancelado) return;
    showToast(`Exportado: ${r.memoria} fatos, ${r.lembretes} lembretes, ${r.presets} presets, ${r.rotinas} rotinas, ${r.conversas} conversas.`);
  } catch (e) { showToast(`Não consegui exportar: ${e?.message ?? e}`, true); }
});
document.getElementById("dados-importar")?.addEventListener("click", async () => {
  try {
    const r = await window.nx.backupImportar();
    if (r?.cancelado) return;
    showToast(`Importado: +${r.memoria} fatos, +${r.lembretes} lembretes, +${r.presets} presets, +${r.rotinas} rotinas, ${r.conversas} conversas, ${r.ajustes} ajustes.`);
    loadConfig?.();
  } catch (e) { showToast(`Não consegui importar: ${String(e?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")}`, true); }
});
document.getElementById("dados-diagnostico")?.addEventListener("click", async (ev) => {
  const b = ev.currentTarget;
  b.disabled = true;
  try {
    const texto = await window.nx.diagnostico();
    try { await navigator.clipboard.writeText(texto); } catch { await window.nx.rpc("clipboard.set", { text: texto }); }
    const saida = document.getElementById("dados-saida");
    if (saida) { saida.hidden = false; saida.textContent = texto; }
    showToast("Diagnóstico copiado.");
  } catch (e) { showToast(`Não consegui montar o diagnóstico: ${e?.message ?? e}`, true); }
  finally { b.disabled = false; }
});
document.getElementById("dados-logs")?.addEventListener("click", () => window.nx.abrirLogs());

// ── Google Agenda (fase 13, bloco 120) ───────────────────────────────────────
// O cliente OAuth é do Zak (Google Cloud dele); o ELYSIUM só lê a agenda. O segredo só
// entra — a tela sabe se existe, nunca qual é.
// ── Comandos de IA (bloco 137) ─────────────────────
async function desenharComandos() {
  const alvo = document.getElementById("comandos-corpo");
  if (!alvo) return;
  let lista = [];
  try { lista = (await window.nx.rpc("comandos.list")).result?.comandos ?? []; } catch { /* vazio */ }
  alvo.innerHTML = `
    <p class="cfg-nota" style="margin-top:0">Copie um texto, abra a paleta (Ctrl+K) e escolha o comando: o resultado volta para a área de transferência. No celular, compartilhe um texto com o ELYSIUM ou comece a mensagem com “/”.</p>
    <div class="home-list">${lista.map(c => `
      <div class="home-item">${ico(c.fabrica ? "sparkles" : "edit", "ico-sm")}
        <div class="home-item-txt"><span>${escHtml(c.nome)}</span><em>${escHtml(c.instrucao)}</em></div>
        ${c.fabrica ? "" : `<button type="button" data-cmd-apagar="${escHtml(c.id)}" title="Apagar">${ico("trash", "ico-sm")}</button>`}
      </div>`).join("")}</div>
    <form data-cmd-form class="atu-form" style="flex-wrap:wrap;margin-top:10px">
      <input name="nome" placeholder="Nome (ex.: Virar tweet)" maxlength="40" autocomplete="off">
      <input name="instrucao" placeholder="O que fazer com o texto (ex.: reescreva como um tweet de até 280 caracteres)" maxlength="600" autocomplete="off" style="flex:2;min-width:260px">
      <button type="submit">Criar</button>
    </form>`;
}
document.getElementById("comandos-corpo")?.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-cmd-apagar]");
  if (!b) return;
  try { const r = await window.nx.rpc("comandos.delete", { id: b.dataset.cmdApagar }); if (r.cancelado) return; if (r.error) { showToast(r.error, true); return; } showToast("Comando apagado."); } catch { showToast("Não deu certo.", true); }
  await desenharComandos();
});
document.getElementById("comandos-corpo")?.addEventListener("submit", async (ev) => {
  const f = ev.target.closest("[data-cmd-form]");
  if (!f) return;
  ev.preventDefault();
  const nome = f.elements.nome.value.trim(), instrucao = f.elements.instrucao.value.trim();
  if (!nome || !instrucao) { showToast("Preencha o nome e o que fazer.", true); return; }
  const r = await window.nx.rpc("comandos.save", { nome, instrucao });
  if (r.error) { showToast(r.error, true); return; }
  showToast(`Comando “${nome}” criado.`);
  await desenharComandos();
});

async function desenharAgenda() {
  const alvo = document.getElementById("agenda-corpo");
  if (!alvo) return;
  try { agendaAtual = await window.nx.agendaEstado(); } catch { agendaAtual = null; }
  const a = agendaAtual ?? {};
  const situacao = a.conectado
    ? `Conectada${a.conta ? ` como ${escHtml(a.conta)}` : ""}. O ELYSIUM lê seus compromissos (nunca cria nem apaga), avisa 10 min antes e fala a agenda no resumo do dia.`
    : a.configurado ? "Cliente configurado. Falta conectar a conta do Google." : "Desligada. Precisa de um cliente OAuth seu no Google Cloud (passo a passo abaixo).";
  alvo.innerHTML = `
    <p class="cfg-nota" style="margin-top:0">${situacao}</p>
    <div class="home-acoes" style="margin-top:0">
      ${a.configurado && !a.conectado ? `<button type="button" data-ag="conectar">Conectar a conta do Google</button>` : ""}
      ${a.conectado ? `<button type="button" data-ag="desconectar">Desconectar</button>` : ""}
    </div>
    <details class="atu-token" ${a.configurado ? "" : "open"}>
      <summary>Cliente OAuth ${a.configurado ? "(guardado)" : ""}</summary>
      <ol class="cfg-nota">
        <li>console.cloud.google.com → criar um projeto (ex.: ELYSIUM).</li>
        <li>APIs e serviços → Biblioteca → ativar a <b>Google Calendar API</b>.</li>
        <li>Tela de consentimento OAuth → Externo → seu e-mail como usuário de teste.</li>
        <li>Credenciais → Criar credenciais → ID do cliente OAuth → tipo <b>App para computador</b>.</li>
        <li>Colar aqui o ID e a chave secreta do cliente, e clicar em Conectar.</li>
      </ol>
      <form data-ag-form class="atu-form" style="flex-wrap:wrap">
        <input name="id" placeholder="ID do cliente (…apps.googleusercontent.com)" autocomplete="off" spellcheck="false">
        <input name="segredo" type="password" placeholder="Chave secreta do cliente" autocomplete="off" spellcheck="false">
        <button type="submit">Guardar</button>
      </form>
    </details>`;
}

document.getElementById("agenda-corpo")?.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-ag]");
  if (!b) return;
  b.disabled = true;
  try {
    if (b.dataset.ag === "conectar") {
      showToast("Abrindo o Google no navegador… autorize e volte aqui.");
      const r = await window.nx.agendaConectar();
      showToast(r?.mensagem ?? "…", !r?.ok);
    } else {
      await window.nx.agendaDesconectar();
      showToast("Agenda desconectada.");
    }
  } catch (e) { showToast(e?.message || "Não deu certo.", true); }
  await desenharAgenda();
  if (typeof desenharHub === "function") desenharHub();
});
document.getElementById("agenda-corpo")?.addEventListener("submit", async (ev) => {
  const f = ev.target.closest("[data-ag-form]");
  if (!f) return;
  ev.preventDefault();
  const id = f.elements.id.value.trim(), segredo = f.elements.segredo.value.trim();
  if (!id || !segredo) { showToast("Preencha o ID e a chave secreta.", true); return; }
  f.elements.segredo.value = "";
  await window.nx.agendaCliente(id, segredo);
  showToast("Cliente guardado. Agora é só conectar.");
  await desenharAgenda();
  if (typeof desenharHub === "function") desenharHub();
});
window.nx.agendaEstado?.().then((e) => { agendaAtual = e; }).catch(() => {});
