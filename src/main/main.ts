// PRECISA ser o primeiro import do arquivo. Os `electron-store` são construídos em escopo
// de módulo, ou seja, no momento do require — se a migração do perfil NEUROAXIS → ELYSIUM
// rodasse depois, o primeiro store já teria criado o arquivo novo vazio e a cópia seria
// descartada pela própria guarda dela. Ver src/main/migrateUserData.ts.
// Fase 23.2: antes de qualquer ipcMain.handle — todo canal confere a origem (ver ipcSeguro.ts).
import { dentroDoApp } from "./ipcSeguro";
import "./migrateUserData";
import { migrarLembretesParaTarefas } from "../actions/memoryActions";
import { app, BrowserWindow, globalShortcut, ipcMain, clipboard, nativeImage, dialog, shell, powerMonitor } from "electron";
import { paraFala } from "../services/estiloResposta";
import { ouvirTimers, retomarTimers } from "../services/timers";
import { deveSugerir, sugerirContinuacoes } from "../services/continuacoes";
import * as path from "node:path";
import * as fs from "node:fs";

// Rede de segurança (08/10): um erro solto em qualquer canto do processo principal — um
// callback de socket, uma promessa sem catch — derrubava o app inteiro em silêncio (o bug
// do token do servidor fazia exatamente isso). Agora vai para o log e o ELYSIUM segue de pé.
process.on("uncaughtException", (e) => { console.error("[main] erro não tratado:", e); });
process.on("unhandledRejection", (motivo) => { console.error("[main] promessa rejeitada sem tratamento:", motivo); });
import * as os from "node:os";
import { sincronizarInicioAutomatico, removerEntradaLegada } from "./autoLaunch";
import { iniciarLogEmArquivo, pastaDeLogs } from "./logArquivo";
import { aplicarBackup, lerBackup, montarBackup } from "../services/backup";
import { montarDiagnostico } from "../services/diagnostico";
import { esquecerAparelhos, listarAparelhos } from "../services/aparelhos";
import * as QRCode from "qrcode";
import { getConfig, getApiKey, setApiKey, hasApiKey, setOverride, patchDeConfigSeguro, getOrCreateServerToken, getOrCreateMcpToken, regenerateServerToken, AppConfig, getGithubToken, setGithubToken, setGoogleCliente } from "./config";
import { limparCacheClima } from "../services/clima";
import { getLocalIPv4, getAllLocalIPv4 } from "./network";
import { inputHost } from "../services/inputHost";
import { aoAtalhoDeSelecao, registrarIpcSelecao } from "./selecao";
import { startScheduler, stopScheduler } from "../services/scheduler";
import { sendPush, type PushCategory } from "../services/push";
import { lerSaidaDeSom, problemaDeSom } from "../services/saidaDeSom";
import { aoMudarEstadoApp, definirSom, iniciarEstadoApp, janelaMudou, registrarEncerramento, telaBloqueada, voltouDaSuspensao, type Janela, type MotivoEncerramento } from "../services/estadoApp";
import {
  listSessions as listChatSessions, getSession as getChatSession,
  upsertMessages as upsertChatMessages, toggleFavorite as toggleChatFavorite,
  deleteSession as deleteChatSession, renameSession as renameChatSession, StoredMessage,
} from "../services/chatSessionsStore";
import {
  isConnected as isSpotifyConnected, beginLogin as beginSpotifyLogin,
  disconnect as spotifyDisconnect, getNowPlaying as getSpotifyNowPlaying,
  play as spotifyPlay, pause as spotifyPause, next as spotifyNext,
  previous as spotifyPrevious, setVolume as spotifySetVolume, seek as spotifySeek,
  setShuffle as spotifySetShuffle, setRepeat as spotifySetRepeat,
} from "../services/spotify";
import { state } from "./state";
import { aCada, esperarOcioso, pararIntervalos } from "./proativo";
import { notify } from "./notify";
import { createTray, refreshTray, updateLastCommand, buildIcon as iconePadrao, aoInterromperFala, marcarFalaNaBandeja } from "./tray";
import { transcribe } from "../services/stt";
import { clearHistory, desfazerUltimoTurno, registrarFalaDaEly } from "../services/brain";
import { modelosDaGroq } from "../services/catalogoGroq";
import { Confianca, desligarPalavraDeAtivacao, ligarPalavraDeAtivacao, podeInterromper } from "../services/palavraAtivacao";

// O log em arquivo entra antes de tudo que escreve no console (bloco 97).
iniciarLogEmArquivo();
import { getTopHistory } from "../services/history";
import { registrarPergunta, bolhasDoChat } from "../services/perguntas";
import { aoTocarAudio, ehNoite } from "../services/tts";
import { aoTerminarInstalacao } from "../actions/instalarApp";
import { ehAlucinacaoDoWhisper, ehEntradaDoLive, ehSaidaDoLive, SILENCIO_LIVE_MS } from "../services/live";
import { envelopeDasPalavras } from "../services/bolota";
import { aoMudarFala, estaFalando, falaAtual, falar as speak, interromperTudo as interruptAll, novoTurno, turnoAtual } from "./fala";
import { habitosParaLembrar } from "../services/habitos";
import { podeAvisarAlto } from "../services/avisos";
import { ElysiumError } from "../services/errors";
import { processCommand, processCommandStream, executarComando } from "../services/command";
import { startServer, setActiveToken, broadcastMailboxEvent, broadcastNotify, broadcastEstadoPc, broadcastModo, broadcastPomodoro, ligarMcp } from "../services/server";
import { iniciarPomodoro, pararRelogioPomodoro, pomodoroParaCliente } from "../services/pomodoro";
import { aoMudarModo, modoParaCliente } from "../services/modos";
import { iniciarRotinas, pararRotinas, enfileirarEntrega, type Entrega } from "../services/rotinas";
import { avaliarCondicao, executarComPolitica } from "../services/agente";
import { definicoesDeFerramentas } from "../services/ferramentas";
import { definirUrlDoMcp, iniciarHermes, interromperHermes, pararHermes, pedidoDoHermes, aplicarConfigHermes } from "../services/hermes/cerebro";
import { buscarNovidades } from "../services/novidades";
import { emitirEvento, MARCOS_OCIOSO } from "../services/eventos";
import { getRunningApps } from "../actions/systemInfo";
import { baseDoOllama, ollamaDisponivel } from "../services/llm";
import { garantirOllama } from "../services/ollamaVivo";
import { registerRpcBridge } from "./rpcBridge";
import { vigiarDisco } from "../actions/armazenamento";
import { comecarFoco, estadoFoco, iniciarFoco, pararFoco } from "../services/foco";
import { resumoDoDia } from "../services/resumoDoDia";
import { conectarAgenda, desconectarAgenda, estadoAgenda, vigiarAgenda } from "../services/agenda";
import Store from "electron-store";
import { closeApp } from "../actions/closeApp";
import {
  aoMudarAtualizacao, estadoAtualizacao, iniciarAtualizacoes, instalarAtualizacaoDesktop, verificarAtualizacoes,
  marcarNovidadesVistas, novidadesPendentes,
} from "../services/atualizacao";
import { startMonitor, getDashboardTelemetry, killProcess } from "../actions/systemInfo";
import type { BrainAction } from "../services/brain";
import { mediaControl } from "../actions/mediaControl";
import { logAnomaly, getAnomalyHistory, getInsights } from "../services/telemetryLog";
import { getAllPresets } from "../services/presetsStore";
import { fraseDeArranque, fraseDeEspera, fraseDeHabito, fraseDeLembrete, fraseDeTimer } from "../services/falasVivas";
import { criarFatiador, restoParaFalar } from "../services/fatiadorDeFrases";
import { anexoAbreDireto } from "../services/anexos";
import { marcarAcompanhado, pendentesDeAcompanhamento } from "../services/acompanhamento";
import { lerHumor, type Humor } from "../services/humor";
import {
  checkAndMarkUnseenFromMobile, addMessage, listMessagesForDesktop, inferKind, mailboxEvents,
  isKnownAttachmentPath, listMailboxSessions, createMailboxSession, renameMailboxSession,
  toggleMailboxSessionFavorite, deleteMailboxSession, deleteMailboxMessage,
  getActiveMailboxSessionId, setActiveMailboxSession,
} from "../services/mailboxStore";

// ── windows ───────────────────────────────────────────────────────────────────

let recorderWin: BrowserWindow | null = null;
let configWin:   BrowserWindow | null = null;
let dashWin:     BrowserWindow | null = null;

/**
 * Manda um evento ao dashboard sem quebrar se a janela já foi destruída (fase 20). O
 * `dashWin?.webContents.send` lançava "Object has been destroyed" no fechamento, e ~40 lugares
 * chamavam direto — inclusive dentro da fila de fala.
 */
/**
 * O caminho de um aviso até o celular, que estava copiado em oito lugares (fase 20): fila de
 * entregas + WS (chega sem push pela nuvem, bloco 68) e, quando pedido, o push. Best-effort.
 */
function mandarAoCelular(
  tipo: Entrega["tipo"], titulo: string, corpo: string,
  opcoes: { push?: PushCategory; ref?: string; dados?: Record<string, unknown> } = {},
): void {
  try { broadcastNotify(enfileirarEntrega({ tipo, titulo, corpo, ...(opcoes.ref ? { ref: opcoes.ref } : {}) })); }
  catch (e) { console.warn("[celular] aviso não entrou na fila:", e); }
  if (opcoes.push) void sendPush(opcoes.push, titulo, corpo, opcoes.dados ?? {}).catch(() => { /* best-effort */ });
}

function enviarAoDash(canal: string, ...args: unknown[]): void {
  const w = dashWin;
  if (!w || w.isDestroyed()) return;
  try { w.webContents.send(canal, ...args); } catch { /* fechando */ }
}

function createRecorderWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "../renderer/preload-recorder.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  win.loadFile(path.join(__dirname, "../renderer/recorder.html"));
  win.on("closed", () => { recorderWin = null; });
  win.webContents.on("render-process-gone", () => {
    recorderWin = null;
    recorderWin = createRecorderWindow();
  });
  return win;
}

function openDashboard(): void {
  if (dashWin && !dashWin.isDestroyed()) {
    if (dashWin.isMinimized()) dashWin.restore();
    dashWin.show(); dashWin.focus(); return;
  }
  dashWin = new BrowserWindow({
    width:     1024,
    height:    720,
    // 640 (08/10): com 800 as regras de layout estreito do CSS (760, 720, 620 px) nunca valiam.
    minWidth:  640,
    minHeight: 560,
    resizable: true,
    show:      false,
    title:     "ELYSIUM",
    icon:      iconePadrao(),
    frame:     false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "../renderer/preload-dashboard.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  dashWin.setMenu(null);
  // Mostrar só quando houver o que mostrar. Sem isto, a janela aparece branca por um
  // instante antes do primeiro quadro — é o detalhe que separa "app nativo" de "página".
  dashWin.once("ready-to-show", () => dashWin?.show());
  dashWin.loadFile(path.join(__dirname, "../renderer/dashboard.html"));

  // Push telemetry immediately when renderer finishes loading (no 3 s wait)
  dashWin.webContents.once("did-finish-load", async () => {
    try {
      const t = await getDashboardTelemetry();
      enviarAoDash("dash:telemetry", t);
    } catch { /* best-effort */ }
  });

  // Hide to tray instead of destroying
  dashWin.on("close", (e) => {
    if (!appQuitting) { e.preventDefault(); dashWin?.hide(); }
  });
  dashWin.on("closed", () => { dashWin = null; janelaMudou(); });
  // O celular mostra se o ELYSIUM está na tela, minimizado ou só na bandeja (08/10).
  for (const ev of ["show", "hide", "minimize", "restore", "focus", "blur"] as const) {
    dashWin.on(ev as "show", () => janelaMudou());
  }
}

/** Em que pé está a janela do dashboard, para o celular. */
function janelaAtual(): Janela {
  if (!dashWin || dashWin.isDestroyed() || !dashWin.isVisible()) return "bandeja";
  if (dashWin.isMinimized()) return "minimizada";
  return dashWin.isFocused() ? "foco" : "aberta";
}

const TEXTO_ENCERRAMENTO: Record<MotivoEncerramento, [string, string]> = {
  fechado: ["ELYSIUM fechado no PC", "O app foi fechado pela bandeja. Para voltar, abra o ELYSIUM no PC."],
  atualizando: ["ELYSIUM atualizando", "O PC está instalando a versão nova e volta em instantes."],
  desligando: ["PC desligando", "O Windows está desligando ou reiniciando."],
  suspenso: ["PC em suspensão", "O PC entrou em suspensão; o ELYSIUM volta quando ele acordar."],
  interrompido: ["ELYSIUM parou", "O app parou sem avisar."],
};

/**
 * Conta ao celular que o app vai parar de responder — pelo WebSocket aberto e por push (que
 * chega com o app do celular fechado). Devolve quando o push saiu ou desistiu (teto de 2,5 s,
 * para não segurar o Sair nem o desligamento do Windows).
 */
function avisarEncerramento(motivo: MotivoEncerramento): Promise<void> {
  registrarEncerramento(motivo);
  const em = Date.now();
  try { broadcastEstadoPc({ encerrando: { motivo, em } }); } catch { /* sem servidor */ }
  // Atualização volta sozinha em um minuto: não vale uma notificação.
  if (motivo === "atualizando") return Promise.resolve();
  const [titulo, corpo] = TEXTO_ENCERRAMENTO[motivo];
  return Promise.race([
    sendPush("pc", titulo, corpo, { estadoPc: motivo, em }).catch(() => {}),
    new Promise<void>(r => setTimeout(r, 2500)),
  ]);
}

function openConfigWindow(): void {
  if (configWin && !configWin.isDestroyed()) {
    if (configWin.isMinimized()) configWin.restore();
    configWin.show(); configWin.focus(); return;
  }
  configWin = new BrowserWindow({
    width: 480, height: 580, resizable: false,
    title: "Configurar ELYSIUM", skipTaskbar: false,
    icon: iconePadrao(),
    webPreferences: {
      preload: path.join(__dirname, "../renderer/preload-config.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });
  configWin.setMenu(null);
  configWin.loadFile(path.join(__dirname, "../renderer/config.html"));
  configWin.on("closed", () => { configWin = null; });
}

let appQuitting = false;

// ── fala (fase 20: a fila mora em main/fala.ts) ──────────────────────────────

/**
 * Avisa dashboard e bandeja se há fala saindo (02/10). O botão "Interromper voz" só aparecia
 * no estado "speaking", que é o da resposta à voz — lembrete, timer, rotina e resumo do dia
 * falavam sem botão nenhum para parar.
 */
aoMudarFala((f) => {
  marcarFalaNaBandeja(f);
  enviarAoDash("tts:falando", f);
});
// Fase 21: o áudio começou de verdade — a esfera do chat pulsa palavra por palavra.
aoTocarAudio((a) => enviarAoDash("ely:fala", { envelope: envelopeDasPalavras(a.palavras, a.durMs, 33), passoMs: 33 }));

// ── action label helper ───────────────────────────────────────────────────────

function getActionLabel(action: BrainAction): string {
  switch (action.action) {
    case "open_app":       return `Abrindo ${action.app_name}…`;
    case "close_app":      return `Fechando ${action.app_name}…`;
    case "open_url":       return "Abrindo site…";
    case "play_music":     return `Tocando ${action.query}…`;
    case "volume_control": return "Ajustando volume…";
    case "screenshot":     return "Capturando tela…";
    case "system_info":    return "Consultando sistema…";
    case "clipboard_read": return "Processando clipboard…";
    case "run_preset":     return `Ativando ${action.preset_name}…`;
    case "write_text":     return `Escrevendo ${action.description}…`;
    case "create_file":    return "Criando arquivo…";
    case "list_presets":   return "Listando presets…";
    case "delete_preset":  return `Removendo ${action.preset_name}…`;
    case "create_preset":  return `Criando preset ${action.preset_name}…`;
    case "media_control":  return `Mídia: ${action.operation}…`;
    case "window_management": return `Janela ${action.target_app}: ${action.operation}…`;
    default:               return "Processando…";
  }
}

function getActionsLabel(actions: BrainAction[]): string {
  if (actions.length === 1) return getActionLabel(actions[0]);
  return actions.map(a => getActionLabel(a).replace("…", "")).join(" + ") + "…";
}

// ── telemetry loop (every 3s) ─────────────────────────────────────────────────

let _cpuHighCount  = 0;
let _prevCpuPct    = 0;
let _cpuAltaTiques = 0;
let _ramAltaTiques = 0;
let _ramAlertedAt  = 0;
const ANOM_COOLDOWN = 5 * 60_000; // 5 min between same-type RAM alerts

function startTelemetryLoop(): void {
  const tick = async () => {
    try {
      const t = await getDashboardTelemetry();
      const now = Date.now();

      // ── CPU sustained (≥95% for 2 consecutive ticks = ~6s) ──────────────
      if (t.cpu_pct >= 95) {
        _cpuHighCount++;
        if (_cpuHighCount === 2) { // exactly 2 → log once, reset
          logAnomaly({
            type: "cpu_sustained",
            value: t.cpu_pct,
            topProcess: t.processes[0]?.name,
            details: `CPU ${t.cpu_pct}% por ~6 s`,
          });
          _cpuHighCount = 0;
        }
      } else {
        _cpuHighCount = 0;
      }

      // ── Spike: sudden jump >40 pp from a calm baseline ───────────────────
      if (_prevCpuPct < 55 && t.cpu_pct - _prevCpuPct > 40) {
        logAnomaly({
          type: "spike",
          value: t.cpu_pct,
          topProcess: t.processes[0]?.name,
          details: `Pico CPU: ${_prevCpuPct}% → ${t.cpu_pct}%`,
        });
      }
      _prevCpuPct = t.cpu_pct;

      // ── RAM high ─────────────────────────────────────────────────────────
      if (t.ram_pct > 92 && now - _ramAlertedAt > ANOM_COOLDOWN) {
        _ramAlertedAt = now;
        logAnomaly({
          type: "ram_high",
          value: t.ram_pct,
          topProcess: t.processes[0]?.name,
          details: `RAM ${t.ram_pct}%`,
        });
        // Só a RAM alta vira push: ela é sustentada e costuma exigir ação. Pico de CPU
        // é passageiro demais e viraria spam no celular.
        void sendPush(
          "anomaly",
          "PC sob pressão",
          `RAM em ${t.ram_pct}%${t.processes[0]?.name ? ` — maior consumo: ${t.processes[0].name}` : ""}`,
        );
      }

      // Gatilhos de rotina (bloco 79): CPU e RAM acima de 85% por 2 minutos seguidos (40
      // tiques). O limite fino é da rotina (`gatilho.limite`); aqui só se garante que é
      // sustentado, não um pico. Dispara uma vez por episódio: zera ao cair.
      _cpuAltaTiques = t.cpu_pct >= 85 ? _cpuAltaTiques + 1 : 0;
      _ramAltaTiques = t.ram_pct >= 85 ? _ramAltaTiques + 1 : 0;
      if (_cpuAltaTiques === 40) emitirEvento("cpu.alta", { valor: Math.round(t.cpu_pct), maior: t.processes[0]?.name?.replace(/#\d+$/, "") });
      if (_ramAltaTiques === 40) emitirEvento("ram.alta", { valor: Math.round(t.ram_pct), maior: t.processes[0]?.name?.replace(/#\d+$/, "") });

      if (!dashWin || dashWin.isDestroyed() || !dashWin.isVisible()) return;
      dashWin.webContents.send("dash:telemetry", t);
    } catch { /* best-effort */ }
  };
  aCada(3_000, "telemetria", () => tick());

  // Janelas que abrem e fecham (bloco 79): a cada 15 s compara a lista de programas com
  // janela. Só nomes de processo; o título vai junto para o filtro ("o Chrome") casar
  // também com apps da loja hospedados no ApplicationFrameHost.
  let _janelas: Map<string, string> | null = null;
  aCada(15_000, "janelas", async () => {
    try {
      const agora = new Map<string, string>();
      for (const a of await getRunningApps()) {
        const nome = a.name.replace(/#\d+$/, "");
        if (!agora.has(nome)) agora.set(nome, a.title ?? "");
      }
      if (_janelas) {
        for (const [nome, titulo] of agora) if (!_janelas.has(nome)) emitirEvento("app.abriu", { app: nome, titulo });
        for (const nome of _janelas.keys()) if (!agora.has(nome)) emitirEvento("app.fechou", { app: nome });
      }
      _janelas = agora;
    } catch { /* best-effort */ }
  });

  // Ociosidade (bloco 79): sem mouse/teclado. Dispara nos marcos de 5, 15, 30, 60 e 120
  // minutos, uma vez cada; a rotina escolhe o seu (`gatilho.minutos`). Volta a zero com
  // atividade.
  let _marcoOcioso = 0;
  aCada(60_000, "ociosidade", () => {
    try {
      const min = Math.floor(powerMonitor.getSystemIdleTime() / 60);
      // Voltou depois de 1 h ou mais parado: de manhã, é a deixa do resumo do dia (bloco 117).
      if (min < 1) { if (_marcoOcioso >= 60) { void resumoDaManha(); void perguntarComoFoi(); } _marcoOcioso = 0; return; }
      for (const m of MARCOS_OCIOSO) if (min >= m && _marcoOcioso < m) { _marcoOcioso = m; emitirEvento("pc.ocioso", { minutos: m }); }
    } catch { /* powerMonitor indisponível */ }
  });
  powerMonitor.on("resume", () => { voltouDaSuspensao(); emitirEvento("pc.voltou", { de: "suspensão" }); void resumoDaManha(); void perguntarComoFoi(); });
  powerMonitor.on("unlock-screen", () => { telaBloqueada(false); emitirEvento("pc.voltou", { de: "tela bloqueada" }); void resumoDaManha(); void perguntarComoFoi(); });
  powerMonitor.on("lock-screen", () => telaBloqueada(true));
  powerMonitor.on("suspend", () => { void avisarEncerramento("suspenso"); });
}

// ── resumo do dia (fase 13, bloco 117) ──────────────────────────────────────────
// Uma vez por dia, na primeira volta ao PC entre 6 e 11 h, se ligado em Ajustes → Voz.
// O dia já resumido fica em disco: reiniciar o app de manhã não repete o resumo.
const resumoStore = new Store<{ ultimoDia: string }>({ name: "resumo-do-dia", defaults: { ultimoDia: "" } });
async function resumoDaManha(): Promise<void> {
  try {
    if (!getConfig().resumoAutomatico) return;
    const agora = new Date();
    if (agora.getHours() < 6 || agora.getHours() >= 11) return;
    const dia = agora.toDateString();
    if (resumoStore.get("ultimoDia") === dia) return;
    resumoStore.set("ultimoDia", dia);
    // Espera a tela destravar direito e o app ficar livre (até 1 min).
    await new Promise(r => setTimeout(r, 4000));
    await esperarOcioso();
    // Fase 19: ocupado depois de 1 min (ouvindo, pensando) — falar agora entraria no microfone.
    if (!state.is("idle")) return;
    const texto = await resumoDoDia();
    notify("Resumo do dia", texto);
    speak(texto).catch(() => { /* best-effort */ });
    mandarAoCelular("aviso", "Resumo do dia", texto);
  } catch (e) { console.warn("[resumo] falhou:", e); }
}

// ── "como foi a prova?" (fase 19, bloco 191) ─────────────────────────────────────
// Na volta ao PC, uma vez por dia, entre 9 e 22 h: a pergunta mais recente que valer
// (compromisso que passou, pendência de conversa). Passa pelo orçamento de avisos — no foco
// ou com o orçamento gasto, fica só o card do Hoje. A pergunta entra no histórico como fala
// da Ely: "foi bem, tirei 8" logo depois tem contexto.
const comoFoiStore = new Store<{ ultimoDia: string }>({ name: "como-foi", defaults: { ultimoDia: "" } });
async function perguntarComoFoi(): Promise<void> {
  try {
    const agora = new Date();
    if (agora.getHours() < 9 || agora.getHours() >= 22) return;
    const dia = agora.toDateString();
    if (comoFoiStore.get("ultimoDia") === dia) return;
    const [primeira] = pendentesDeAcompanhamento(agora.getTime());
    if (!primeira) return;
    // Depois do resumo da manhã, se houver, e com o app livre (até 1 min).
    await new Promise(r => setTimeout(r, 15_000));
    await esperarOcioso();
    // Ainda ocupado (ouvindo, pensando, falando): falar agora entraria no microfone ou no
    // meio do turno dele. Fica para a próxima volta — o dia só é marcado quando pergunta.
    if (!state.is("idle")) return;
    if (comoFoiStore.get("ultimoDia") === dia) return;
    comoFoiStore.set("ultimoDia", dia);
    if (!podeAvisarAlto()) return;
    marcarAcompanhado(primeira.id);
    registrarFalaDaEly(primeira.pergunta);
    notify("ELYSIUM", primeira.pergunta);
    speak(primeira.pergunta).catch(() => { /* best-effort */ });
  } catch (e) { console.warn("[como-foi] falhou:", e); }
}

// ── recording flow ────────────────────────────────────────────────────────────

async function startListening(opcoes: { esperarFalaMs?: number; segurar?: boolean } = {}): Promise<void> {
  if (!recorderWin || recorderWin.isDestroyed()) {
    recorderWin = createRecorderWindow();
    await new Promise<void>((res) => recorderWin!.webContents.once("did-finish-load", res));
  }
  state.set("listening");
  const cfg = getConfig();
  recorderWin.webContents.send("start-recording", {
    // Segurando o Espaço, quem decide o fim é ele: o silêncio não corta (o teto continua).
    silenceMs:    opcoes.segurar ? Math.max(cfg.maxRecordMs, 30000) : cfg.silenceMs,
    maxRecordMs:  opcoes.segurar ? Math.max(cfg.maxRecordMs, 30000) : cfg.maxRecordMs,
    esperarFalaMs: opcoes.esperarFalaMs ?? 0,
  });
}

// ── modo live (fase 21, bloco 217) ──────────────────────────────────────────────
// Turnos encadeados: ela responde e volta a ouvir sozinha. Só em memória — reiniciar o app
// desliga. Sai por "tchau", o botão do live ou 60 s sem ouvir nada (ver services/live.ts).
let liveLigado = false;
let liveTimer: NodeJS.Timeout | null = null;

function ligarLive(): void {
  if (liveLigado) return;
  liveLigado = true;
  console.log("[live] ligado");
  enviarAoDash("live:mudou", true);
  notify("ELYSIUM — modo live", "Pode falar. Diga “tchau” (ou use o botão do live) para sair.");
  const t = (getConfig().tratamento ?? "").trim();
  void speak(`Modo live ligado${t ? `, ${t}` : ""}. Pode falar.`).catch(() => {}).finally(() => ouvirNoLive(400));
}

function desligarLive(fala?: string): void {
  if (!liveLigado) return;
  liveLigado = false;
  if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
  console.log("[live] desligado");
  enviarAoDash("live:mudou", false);
  if (fala) void speak(fala).catch(() => {});
}

/** Volta a ouvir, se o live continua e o app está livre (a fala já acabou). */
function ouvirNoLive(depoisDe = 350): void {
  if (!liveLigado) return;
  if (liveTimer) clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    liveTimer = null;
    if (!liveLigado || !state.is("idle") || estaFalando()) return;
    startListening({ esperarFalaMs: SILENCIO_LIVE_MS }).catch((e) => { console.error("[live] não consegui ouvir:", e); desligarLive(); });
  }, depoisDe);
}

/** Para a gravação em andamento sem mandar o áudio (sair do live no meio da escuta). */
function cancelarGravacao(): void {
  if (recorderWin && !recorderWin.isDestroyed()) recorderWin.webContents.send("cancel-recording");
}

ipcMain.on("live:alternar", () => {
  if (liveLigado) { desligarLive(); cancelarGravacao(); state.set("idle"); }
  else if (hasApiKey()) ligarLive();
});

ipcMain.on("recorder-nada", () => {
  state.set("idle");
  if (liveLigado) desligarLive("Fiquei um minuto sem ouvir nada. Saí do modo live.");
});

ipcMain.on("audio-data", async (_event, buffer: Buffer) => {
  const meuToken = novoTurno();
  state.set("processing");
  try {
    const audio = new Uint8Array(buffer);
    const text  = await transcribe(audio);
    if (turnoAtual() !== meuToken) return;

    // Calibragem da palavra de ativação (bloco 116): acordou pela voz e ninguém pediu nada
    // é um disparo falso. Uma linha no log por caso; somando dá para ajustar a confiança
    // com número, não com chute.
    if (Date.now() - acordadoPorVozEm < 30_000) {
      console.log(text ? `[palavra] acordou e veio pedido (${text.length} caracteres)` : "[palavra] falso: acordou e ninguém pediu nada");
      acordadoPorVozEm = 0;
    }

    if (!text || (liveLigado && ehAlucinacaoDoWhisper(text))) {
      // No live, áudio sem pedido só volta a ouvir — sem balão a cada vez.
      if (!liveLigado) notify("ELYSIUM", "Não entendi o áudio. Tente novamente.");
      state.set("idle");
      return;
    }

    enviarAoDash("voice:transcript", text);

    // Fase 21: entrar e sair do modo live são do PC (microfone), não do cérebro.
    if (liveLigado && ehSaidaDoLive(text)) {
      const t = (getConfig().tratamento ?? "").trim();
      desligarLive(`Até mais${t ? `, ${t}` : ""}.`);
      state.set("idle");
      return;
    }
    if (!liveLigado && ehEntradaDoLive(text)) {
      state.set("idle");
      ligarLive();
      return;
    }

    // Frase de espera (fase 18, 08/10): pedido que passa de 2,5 s (busca na web, o agente
    // olhando várias coisas) ganha um "Um instante." — silêncio longo na voz parece que caiu.
    // Sem modelo, e nunca diz que terminou: a resposta de verdade vem logo atrás na fila.
    // Fase 19: a frase diz o que ela está fazendo ("Vou pesquisar.") e não repete a última.
    // Fase 19, bloco 189: a voz começa na primeira frase pronta em vez de esperar a resposta
    // inteira (§19, bloco 21, esperava). Cada frase que fecha no streaming vai para a fila de
    // fala; no fim, só o que faltou. O tom de quem pediu ajusta a prosódia (humor.ts).
    const humor = lerHumor(text);
    const antecipar = getConfig().falaAntecipada !== false;
    const fatiador = criarFatiador();
    let jaFalado = "";
    // As promessas das frases já enfileiradas: o turno só termina (estado ocioso) quando a
    // ÚLTIMA delas acabar de tocar — senão o ícone voltava a "ocioso" com ela ainda falando.
    const falas: Promise<void>[] = [];
    const espera = setTimeout(() => { if (turnoAtual() === meuToken && !falas.length) void speak(fraseDeEspera(text)).catch(() => {}); }, 2500);
    const falarFrase = (frase: string) => {
      if (turnoAtual() !== meuToken || !frase) return;
      clearTimeout(espera);
      jaFalado += ` ${frase}`;
      // O estado continua "processing" até o pedido terminar: "speaking" é interrompível pelo
      // chat e pela palavra, que começariam um pedido novo com este ainda rodando (ações do
      // agente, histórico fora de ordem). A tela sabe da fala pelo `tts:falando`.
      falas.push(speak(frase, humor).catch(() => {}));
    };
    const { reply: combined } = await executarComando(text, {
      onActions: (actions) => {
        const label = getActionsLabel(actions);
        enviarAoDash("voice:action-label", label);
        enviarAoDash("dash:action-log", { icon: "settings", text: label, ok: true });
      },
      onToken: (token) => {
        if (turnoAtual() !== meuToken) return;
        enviarAoDash("chat:chunk", token);
        if (antecipar) for (const frase of fatiador.push(token)) falarFrase(frase);
      },
    }).finally(() => clearTimeout(espera));
    if (turnoAtual() !== meuToken) return;
    updateLastCommand(text);
    notify("ELYSIUM", combined);

    enviarAoDash("voice:reply", combined);
    state.set("speaking");
    // O que ainda não foi dito: o fim da resposta (ou ela inteira, sem fala antecipada).
    // O `speak` entra na mesma fila, depois das frases já enfileiradas.
    fatiador.fim();
    falas.push(speak(restoParaFalar(combined, jaFalado), humor));
    await Promise.all(falas);
  } catch (err) {
    if (turnoAtual() !== meuToken) return;
    const msg = err instanceof ElysiumError ? err.spoken : "Tive um problema, mas já voltei ao normal.";
    if (err instanceof ElysiumError) notify("ELYSIUM — Erro", err.message);
    enviarAoDash("voice:error", msg);
    state.set("speaking");
    try { await speak(msg); } catch { /* ignore */ }
  } finally {
    if (turnoAtual() === meuToken) state.set("idle");
    // Modo live: terminou o turno (ou não tinha pedido) — volta a ouvir.
    if (liveLigado) ouvirNoLive();
  }
});

ipcMain.on("recorder-error", (_event, msg: string) => {
  notify("ELYSIUM — Microfone", msg);
  enviarAoDash("voice:error", "Microfone indisponível. Verifique se está conectado.");
  state.set("speaking");
  speak("Não consegui acessar o microfone.")
    .catch(() => {})
    .finally(() => state.set("idle"));
});

ipcMain.on("audio-level", (_event, level: number) => {
  enviarAoDash("voice:audio-level", level);
});

// ── voice IPC ─────────────────────────────────────────────────────────────────

ipcMain.on("voice:start", (_event, opcoes?: { segurar?: unknown }) => {
  if (!state.is("idle")) interruptAll();
  startListening({ segurar: opcoes?.segurar === true }).catch((e) => console.error("[voz] não consegui começar a ouvir:", e));
});
ipcMain.on("voice:finish", () => {
  if (recorderWin && !recorderWin.isDestroyed()) recorderWin.webContents.send("finish-recording");
});

// ── chat IPC ──────────────────────────────────────────────────────────────────

// Função com nome (fase 20): a bandeja chamava com `ipcMain.emit("chat:send", null, …)`, um
// evento falso sem remetente — e o IPC é o lugar onde o texto chega de fora sem tipo garantido.
ipcMain.on("chat:send", (_event, text: unknown, opcoes?: { refazer?: boolean }) => {
  if (typeof text !== "string" || !text.trim()) return;
  void enviarTexto(text.slice(0, 50_000), { refazer: opcoes?.refazer === true });
});

async function enviarTexto(text: string, opcoes?: { refazer?: boolean }): Promise<void> {
  // Escrever por cima da fala interrompe a fala: quem já leu a resposta na tela não quer
  // esperar o TTS terminar um parágrafo para mandar a pergunta seguinte. Só gravação e
  // processamento continuam bloqueando — aí há um pedido em andamento de verdade.
  if (state.is("speaking")) interruptAll();
  else if (!state.is("idle")) { enviarAoDash("chat:busy"); return; }
  if (!hasApiKey()) {
    enviarAoDash("chat:error", "API key não configurada.");
    openConfigWindow();
    return;
  }
  // O token é o que impede o handler interrompido de devolver o estado a "ocioso" no
  // meio do pedido novo: `interruptAll` avança o contador, e só o dono do valor atual
  // encerra o ciclo.
  // Fase 21: "modo live" digitado no chat também liga (o microfone é deste PC).
  if (ehEntradaDoLive(text)) {
    enviarAoDash("chat:reply", "Modo live ligado. Pode falar; diga “tchau” ou use o botão ao lado do microfone para sair.");
    ligarLive();
    return;
  }
  const meuToken = novoTurno();
  state.set("processing");
  try {
    // "Refazer" e "editar a última pergunta" (bloco 84): o turno anterior sai do histórico
    // e não conta de novo nas perguntas frequentes.
    if (opcoes?.refazer) desfazerUltimoTurno();
    else registrarPergunta(text);
    const { reply: combined, fontes, actions, local } = await executarComando(text, {
      canal: "texto",
      onActions: (actions) => {
        const label = getActionsLabel(actions);
        enviarAoDash("voice:action-label", label);
        enviarAoDash("dash:action-log", { icon: "settings", text: label, ok: true });
      },
      // A voz espera a resposta fechar (§19, bloco 21); só a tela recebe os pedaços.
      onToken: (token) => { if (turnoAtual() === meuToken) enviarAoDash("chat:chunk", token); },
    });
    if (turnoAtual() !== meuToken) return;
    updateLastCommand(text);
    // Notificação nativa só quando a janela não está à vista: quem digitou no dashboard e
    // está olhando para ele não precisa de um balão do Windows repetindo a resposta.
    if (!dashWin?.isVisible() || !dashWin.isFocused()) notify("ELYSIUM", combined);
    enviarAoDash("chat:reply", combined);
    // Blocos 131 e 132: fontes da busca já; sugestões de continuação quando chegarem.
    if (fontes.length) enviarAoDash("chat:extras", { fontes });
    // Fase 18: a nuvem falhou e o local respondeu — o selo "modo local" na bolha.
    if (local) enviarAoDash("chat:extras", { local: true });
    if (deveSugerir(actions, "texto")) {
      sugerirContinuacoes(text, combined).then((sugestoes) => {
        if (sugestoes.length && turnoAtual() === meuToken) enviarAoDash("chat:extras", { sugestoes });
      }).catch(() => { /* sem chips */ });
    }
    state.set("speaking");
    // Bloco 130: a resposta escrita pode ser longa; a caixa de som fala só o começo.
    await speak(paraFala(combined), lerHumor(text));
  } catch (err) {
    if (turnoAtual() !== meuToken) return;
    const msg = err instanceof ElysiumError ? err.spoken : "Tive um problema, mas já voltei ao normal.";
    if (err instanceof ElysiumError) notify("ELYSIUM — Erro", err.message);
    enviarAoDash("chat:error", msg);
  } finally {
    if (turnoAtual() === meuToken) state.set("idle");
  }
}

ipcMain.on("chat:clear", () => {
  clearHistory();
  notify("ELYSIUM", "Histórico apagado.");
});

/** Bolhas de partida do chat — ver `perguntas.ts`. */
ipcMain.handle("chat:starters", () => bolhasDoChat(4));

ipcMain.handle("history:get", () => getTopHistory(8));

// ── system IPC ────────────────────────────────────────────────────────────────

aoInterromperFala(() => { interruptAll(); state.set("idle"); });

// Fase 23.2: "Ouvir" no menu da bolha — lê de novo uma resposta na voz da Ely.
ipcMain.on("tts:falar", (_e, texto: unknown) => {
  if (typeof texto !== "string" || !texto.trim()) return;
  interruptAll();
  void speak(texto.slice(0, 4000)).catch(() => {});
});

ipcMain.on("tts:stop", () => {
  interruptAll();
  state.set("idle");
});

ipcMain.on("media:direct", async (_event, op: string) => {
  try {
    const reply = await mediaControl(op as Parameters<typeof mediaControl>[0]);
    enviarAoDash("dash:action-log", { icon: "music", text: reply, ok: true });
  } catch { /* ignore */ }
});

// ── config IPC ────────────────────────────────────────────────────────────────

ipcMain.handle("config:get-api-key", () => getApiKey());
ipcMain.handle("config:set-api-key", (_e, key: string) => {
  setApiKey(key);
  notify("ELYSIUM", "API key configurada! Pronto para usar.");
});
ipcMain.on("config:close", () => configWin?.close());
ipcMain.on("config:open-window", () => openConfigWindow());

/**
 * Minimizar tem que minimizar.
 *
 * O botão do dashboard chamava `window.close()`, que o handler de `close` intercepta e
 * transforma em `hide()` — ou seja, minimizar fazia a janela SUMIR para a bandeja em vez de
 * ir para a barra de tarefas. Fechar continua indo para a bandeja de propósito: o atalho
 * global, o servidor do celular e os lembretes agendados vivem no processo principal.
 */
ipcMain.on("window:minimize", () => {
  const janela = BrowserWindow.getFocusedWindow() ?? dashWin;
  janela?.minimize();
});

ipcMain.handle("config:get-all", () => getConfig());
// A seção "Sobre" de Ajustes mostra a versão instalada — é a pergunta número um quando algo
// não bate com o handoff.
ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("brain:ollama-status", async (_e, modelo?: string) => {
  const cfg = getConfig();
  return ollamaDisponivel(modelo || cfg.ollamaRouterModel);
});
ipcMain.handle("config:set-all", async (_e, patchBruto: Partial<AppConfig>) => {
  const prev = getConfig();
  const patch = patchDeConfigSeguro(patchBruto);
  setOverride(patch);

  // Trocar a cidade tem que valer AGORA. O cache do clima guarda até uma hora, e guarda
  // inclusive o `null` de quando ainda não havia cidade — sem invalidar aqui, o card
  // continua pedindo para você definir uma cidade que você acabou de definir.
  if (patch.climaCidade !== undefined || patch.climaLat !== undefined || patch.climaLon !== undefined) {
    limparCacheClima();
  }

  if (patch.shortcut && patch.shortcut !== prev.shortcut) {
    // Fase 23.2: só o atalho que mudou — o unregisterAll derrubava também o de seleção.
    try { globalShortcut.unregister(prev.shortcut); } catch { /* não estava registrado */ }
    const ok = globalShortcut.register(patch.shortcut, handleShortcut);
    if (!ok) notify("ELYSIUM — Aviso", `Atalho "${patch.shortcut}" não pôde ser registrado.`);
  }

  // Fase 23.2: o atalho de seleção (Ctrl+Shift+E) também é configurável.
  if (patch.atalhoSelecao !== undefined && patch.atalhoSelecao !== prev.atalhoSelecao) {
    try { if (prev.atalhoSelecao) globalShortcut.unregister(prev.atalhoSelecao); } catch { /* não estava registrado */ }
    if (patch.atalhoSelecao && !globalShortcut.register(patch.atalhoSelecao, () => { void aoAtalhoDeSelecao(); })) {
      notify("ELYSIUM — Aviso", `Atalho "${patch.atalhoSelecao}" não pôde ser registrado.`);
    }
  }

  if (patch.palavraDeAtivacao !== undefined && patch.palavraDeAtivacao !== prev.palavraDeAtivacao) {
    if (patch.palavraDeAtivacao) ligarPalavraDeAtivacao(acordarPorVoz); else desligarPalavraDeAtivacao();
  }

  if (patch.autoLaunch !== undefined && patch.autoLaunch !== prev.autoLaunch) {
    await sincronizarInicioAutomatico(patch.autoLaunch);
  }

  // Fase 21: trocar o cérebro em Ajustes sobe ou derruba o Hermes na hora.
  if (patch.cerebro !== undefined && patch.cerebro !== prev.cerebro) aplicarConfigHermes();

  // Sem notificação do Windows aqui. Este handler é chamado ao arrastar um card da tela
  // Início, ao trocar de tema e a cada campo de Ajustes — uma notificação por gravação
  // vira ruído constante. Quem grava explicitamente já mostra um toast na própria tela.
});

ipcMain.handle("config:reset-defaults", () => {
  setOverride({
    shortcut: "Control+Shift+J",
    autoLaunch: true,
    silenceMs: 2500,
    maxRecordMs: 120000,
    sttModel: "whisper-large-v3",
    brainModel: "llama-3.3-70b-versatile",
    routerModel: "llama-3.3-70b-versatile",
    chatHistoryTurns: 6,
    chatIdleResetMs: 300000,
  });
  notify("ELYSIUM", "Configurações restauradas para os padrões.");
});

// ── Spotify (mini-player do dashboard) ────────────────────────────────────────
// Os handlers devolvem { ok, ... } em vez de lançar: o player fica consultando em
// laço, e uma exceção não tratada por tick encheria o console de ruído por algo tão
// banal quanto o Spotify estar fechado.
ipcMain.handle("spotify:status", () => ({ connected: isSpotifyConnected() }));
ipcMain.handle("spotify:login", () => { beginSpotifyLogin(); return { ok: true }; });
ipcMain.handle("spotify:logout", () => { spotifyDisconnect(); return { ok: true }; });

ipcMain.handle("spotify:now-playing", async () => {
  try {
    return { ok: true, nowPlaying: await getSpotifyNowPlaying() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle("spotify:command", async (_e, op: string, value?: number | boolean | string) => {
  try {
    switch (op) {
      case "play":     await spotifyPlay(); break;
      case "pause":    await spotifyPause(); break;
      case "next":     await spotifyNext(); break;
      case "previous": await spotifyPrevious(); break;
      case "volume":   await spotifySetVolume(Number(value)); break;
      case "seek":     await spotifySeek(Number(value)); break;
      case "shuffle":  await spotifySetShuffle(Boolean(value)); break;
      case "repeat":   await spotifySetRepeat(value as "off" | "track" | "context"); break;
      default: return { ok: false, error: `operação desconhecida: ${op}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

// ── Conversas salvas ──────────────────────────────────────────────────────────
ipcMain.handle("chat-sessions:list",     () => listChatSessions());
ipcMain.handle("chat-sessions:get",      (_e, id: string) => getChatSession(id));
ipcMain.handle("chat-sessions:save",     (_e, sessionId: string | null, messages: StoredMessage[]) =>
  upsertChatMessages(sessionId, messages));
ipcMain.handle("chat-sessions:favorite", (_e, id: string) => toggleChatFavorite(id));
// Renomear existe nos dois lados do switch: o lado da Caixa já tinha, o da IA não.
ipcMain.handle("chat-sessions:rename",   (_e, id: string, title: string) => renameChatSession(id, title));

ipcMain.handle("presets:get", () => getAllPresets());

// ── mailbox self-chat (PC ↔ celular) ────────────────────────────────────────

// Sem `sessionId` devolve a thread inteira — e o que os chamadores antigos esperam.
ipcMain.handle("mailbox:get-thread", (_e, sessionId?: string | null) => listMessagesForDesktop(sessionId ?? null));

// Arquivo arrastado para o lado "Celular" do chat (bloco 84). Mesmo caminho do anexo que
// vem do celular, com o teto de 5 MB do mailboxStore.
ipcMain.handle("mailbox:send-file", (_e, texto: string, anexo: { name: string; mimeType: string; base64: string }, sessionId?: string | null) => {
  if (!anexo?.base64 || !anexo.name) throw new Error("anexo inválido");
  const { id } = addMessage("pc", { kind: "file", text: (texto ?? "").trim() || null, attachment: anexo, sessionId: sessionId ?? null });
  broadcastMailboxEvent("toMobile", id);
  return { id };
});

// Link clicado numa resposta do chat (bloco 84). Só http(s): o markdown vem do modelo, e um
// "file:" ou protocolo de app numa resposta não pode virar execução com um clique.
// ── Dados e diagnóstico (blocos 96 e 97) ─────────────────────────────────────
ipcMain.handle("backup:exportar", async () => {
  const hoje = new Date().toISOString().slice(0, 10);
  const alvo = BrowserWindow.getFocusedWindow() ?? dashWin ?? undefined;
  const escolha = await dialog.showSaveDialog(alvo as BrowserWindow, {
    title: "Exportar tudo do ELYSIUM",
    defaultPath: path.join(app.getPath("documents"), `elysium-backup-${hoje}.json`),
    filters: [{ name: "Backup do ELYSIUM", extensions: ["json"] }],
  });
  if (escolha.canceled || !escolha.filePath) return { cancelado: true };
  const b = montarBackup();
  fs.writeFileSync(escolha.filePath, JSON.stringify(b, null, 2), "utf8");
  return { arquivo: escolha.filePath, memoria: b.memoria.length, lembretes: b.lembretes.length, presets: Object.keys(b.presets).length, rotinas: b.rotinas.length, conversas: b.conversas.length };
});
ipcMain.handle("backup:importar", async () => {
  const alvo = BrowserWindow.getFocusedWindow() ?? dashWin ?? undefined;
  const escolha = await dialog.showOpenDialog(alvo as BrowserWindow, {
    title: "Importar um backup do ELYSIUM",
    defaultPath: app.getPath("documents"),
    filters: [{ name: "Backup do ELYSIUM", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (escolha.canceled || !escolha.filePaths[0]) return { cancelado: true };
  const b = lerBackup(JSON.parse(fs.readFileSync(escolha.filePaths[0], "utf8")));
  // Confirmação no main, como os destrutivos do rpcBridge: importar muda ajustes e soma
  // rotinas — quem decide é o diálogo do sistema, não um clique perdido na tela.
  const { response } = await dialog.showMessageBox(alvo as BrowserWindow, {
    type: "question", buttons: ["Importar", "Cancelar"], defaultId: 0, cancelId: 1,
    title: "Importar backup",
    message: `Backup de ${new Date(b.criadoEm).toLocaleString("pt-BR")} (ELYSIUM ${b.app})`,
    detail: `${b.memoria.length} fatos de memória, ${b.lembretes.length} lembretes, ${Object.keys(b.presets).length} presets, ${b.rotinas.length} rotinas, ${b.conversas.length} conversas e os ajustes.\n\nSoma ao que já existe; nada é apagado. O que já existe com o mesmo nome fica como está.`,
  });
  if (response !== 0) return { cancelado: true };
  return aplicarBackup(b);
});
ipcMain.handle("diagnostico:texto", () => montarDiagnostico());
ipcMain.handle("diagnostico:abrir-logs", async () => { const p = pastaDeLogs(); if (p) await shell.openPath(p); return p; });

// Atualização automática (bloco 95). O estado vai para a tela SEM os caminhos de arquivo —
// o renderer não tem o que fazer com eles — e o token só entra: a tela sabe se existe um
// guardado, nunca qual é.
function estadoParaTela() {
  const e = estadoAtualizacao();
  const semArquivo = <T extends { arquivo: string }>(p?: T) => p ? { ...p, arquivo: undefined } : undefined;
  return { ...e, desktop: semArquivo(e.desktop), celular: semArquivo(e.celular), tokenProprio: Boolean(getGithubToken()) };
}
ipcMain.handle("atualizacao:estado", () => estadoParaTela());
ipcMain.handle("atualizacao:verificar", async () => { await verificarAtualizacoes(); return estadoParaTela(); });
ipcMain.handle("atualizacao:instalar", () => instalarAtualizacaoDesktop());
ipcMain.handle("novidades:pendentes", () => novidadesPendentes());
// Google Agenda (bloco 120). O segredo só entra; a tela sabe se existe, nunca qual é.
ipcMain.handle("agenda:estado", () => estadoAgenda());
ipcMain.handle("agenda:cliente", (_e, id: unknown, segredo: unknown) => { setGoogleCliente(String(id ?? ""), String(segredo ?? "")); return estadoAgenda(); });
ipcMain.handle("agenda:conectar", () => conectarAgenda());
ipcMain.handle("agenda:desconectar", () => { desconectarAgenda(); return estadoAgenda(); });
ipcMain.handle("novidades:vistas", () => marcarNovidadesVistas());
ipcMain.handle("atualizacao:token", async (_e, token: unknown) => {
  setGithubToken(typeof token === "string" ? token : "");
  await verificarAtualizacoes();
  return estadoParaTela();
});
let versaoAvisada = "";
aoMudarAtualizacao((e) => {
  enviarAoDash("atualizacao:mudou", estadoParaTela());
  // Um balão por versão, quando o instalador termina de baixar — não a cada verificação.
  if (e.desktop?.pronto && e.desktop.versao !== versaoAvisada) {
    versaoAvisada = e.desktop.versao;
    notify("ELYSIUM", `A versão ${e.desktop.versao} está pronta. Ajustes → Sobre → Instalar.`);
  }
});

// Catálogo da Groq para Ajustes e para diagnóstico: só os ids, a chave fica no main.
ipcMain.handle("groq:modelos", (_e, forcar?: boolean) => modelosDaGroq(Boolean(forcar)));

ipcMain.on("link:abrir", (_e, url: string) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
});

ipcMain.on("mailbox:send", (_event, text: string, sessionId?: string | null) => {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return;
  const { id } = addMessage("pc", { kind: inferKind(trimmed), text: trimmed, attachment: null, sessionId: sessionId ?? null });
  broadcastMailboxEvent("toMobile", id);
});

// ── conversas da Caixa ──────────────────────────────────────────────────────
// Mesmo conjunto de acoes das conversas da IA logo acima. Apagar aqui e destrutivo de
// verdade: leva as mensagens e os anexos em disco junto.
ipcMain.handle("mailbox:sessions-list",     ()                            => listMailboxSessions());
ipcMain.handle("mailbox:sessions-create",   (_e, title?: string)          => createMailboxSession(title));
ipcMain.handle("mailbox:sessions-rename",   (_e, id: string, t: string)   => renameMailboxSession(id, t));
ipcMain.handle("mailbox:sessions-favorite", (_e, id: string)              => toggleMailboxSessionFavorite(id));
ipcMain.handle("mailbox:sessions-open",     (_e, id: string)              => setActiveMailboxSession(id));
ipcMain.handle("mailbox:sessions-active",   ()                            => getActiveMailboxSessionId());

ipcMain.handle("mailbox:copy-image", async (_event, attachmentPath: string) => {
  if (!isKnownAttachmentPath(attachmentPath)) throw new Error("Caminho de anexo inválido.");
  const image = nativeImage.createFromPath(attachmentPath);
  if (image.isEmpty()) throw new Error("Não foi possível ler a imagem.");
  clipboard.writeImage(image);
});

ipcMain.handle("mailbox:save-as", async (_event, attachmentPath: string, suggestedName: string) => {
  if (!isKnownAttachmentPath(attachmentPath)) throw new Error("Caminho de anexo inválido.");
  const result = dashWin
    ? await dialog.showSaveDialog(dashWin, { defaultPath: suggestedName })
    : await dialog.showSaveDialog({ defaultPath: suggestedName });
  if (result.canceled || !result.filePath) return { saved: false };
  fs.copyFileSync(attachmentPath, result.filePath);
  return { saved: true };
});

ipcMain.handle("mailbox:open-attachment", async (_event, attachmentPath: string) => {
  if (!isKnownAttachmentPath(attachmentPath)) throw new Error("Caminho de anexo inválido.");
  // Bloco 199: só abre direto o que não executa (imagem, PDF, texto, áudio, vídeo). Um ".exe",
  // ".bat" ou ".lnk" que chegou pela Caixa só aparece selecionado na pasta — abrir é decisão
  // de quem vê o arquivo, não de um clique num balão.
  if (anexoAbreDireto(attachmentPath)) { await shell.openPath(attachmentPath); return { aberto: true }; }
  shell.showItemInFolder(attachmentPath);
  return { aberto: false };
});

ipcMain.handle("telemetry:get-history",  () => getAnomalyHistory());
ipcMain.handle("telemetry:get-insights", () => getInsights());

// ── pairing (ELYSIUM-M mobile) ───────────────────────────────────────────

async function getPairingPayload() {
  const endpoints = getAllLocalIPv4();
  const cfg       = getConfig();
  const port      = cfg.serverPort ?? 4200;
  const token     = getOrCreateServerToken();
  const ip        = getLocalIPv4();

  // v2 do payload: lista de endereços em vez de um só, para o celular correr todos
  // e sobreviver a troca de IP por DHCP e a sair da rede de casa pelo túnel.
  // `ip` continua presente para não quebrar um Portal antigo ainda não atualizado.
  const qrDataUrl = await QRCode.toDataURL(JSON.stringify({
    v: 2,
    ip,
    port,
    token,
    hostname:  os.hostname(),
    endpoints: endpoints.map(e => e.address),
  }));

  return { ip, port, token, qrDataUrl, endpoints };
}

ipcMain.handle("pairing:get-info", () => getPairingPayload());

// Quem usou o token (bloco 98) — aparece no pareamento.
ipcMain.handle("aparelhos:lista", () => listarAparelhos());

ipcMain.handle("pairing:regenerate-token", async () => {
  const token = regenerateServerToken();
  setActiveToken(token);
  // O token velho deixou de valer agora: a lista de quem o usava vira história.
  esquecerAparelhos();
  notify("ELYSIUM", "Token regenerado. Pareamentos antigos do ELYSIUM-M precisam escanear o QR de novo.");
  return getPairingPayload();
});

// ── shortcut handler ──────────────────────────────────────────────────────────

// ── palavra de ativação (bloco 88) ─────────────────────────────────────────────
// Só acorda com o assistente ocioso e passado um respiro da última fala: a caixa de som
// dizendo "Elysium" numa resposta não pode acordar o próprio ELYSIUM. Não rouba o foco
// (ao contrário do atalho): quem fala de longe pode estar num jogo em tela cheia; a
// bandeja e o som de gravação já dizem que ele está ouvindo.
let ultimoOcioso = Date.now();
state.on("change", (s) => { if (s === "idle") ultimoOcioso = Date.now(); });
/** Quando a palavra de ativação abriu o microfone pela última vez (bloco 116). */
let acordadoPorVozEm = 0;

function acordarPorVoz(confianca: Confianca): void {
  if (!hasApiKey()) return;
  acordadoPorVozEm = Date.now();
  // Barge-in (fase 12): "Elysium" no meio da fala corta a fala e já começa a ouvir.
  if (state.is("speaking")) {
    if (!podeInterromper(confianca, falaAtual())) return;
    console.log("[palavra] interrompendo a fala.");
    interruptAll();
    state.set("idle");
    startListening().catch((e) => console.error("[palavra] não consegui começar a ouvir:", e));
    return;
  }
  if (!state.is("idle")) return;
  if (Date.now() - ultimoOcioso < 2500) return;
  startListening().catch((e) => console.error("[palavra] não consegui começar a ouvir:", e));
}

function handleShortcut(): void {
  if (!hasApiKey()) { openConfigWindow(); return; }
  if (!state.is("idle")) {
    interruptAll();
    interromperHermes();
    state.set("idle");
  }
  openDashboard();
  if (!dashWin!.isVisible()) dashWin!.show();
  dashWin!.focus();
  const trigger = () => { startListening().catch((e) => console.error("[atalho] não consegui começar a ouvir:", e)); };
  if (dashWin!.webContents.isLoading()) {
    dashWin!.webContents.once("did-finish-load", trigger);
  } else {
    trigger();
  }
}

// ── app lifecycle ─────────────────────────────────────────────────────────────

// Fase 21: a segunda instância (abrir o atalho de novo, o atualizador) chegava a rodar o
// `ready` antes de sair — tentava a porta 4200 e subia outro Hermes. Medido em 09/10.
const souPrincipal = app.requestSingleInstanceLock();
if (!souPrincipal) {
  app.quit();
} else {
  app.on("second-instance", () => {
    openDashboard();
  });
}

// Fase 20 (bloco 200): nenhuma janela do app navega para fora nem abre janela nova. Link
// clicado (inclusive com o botão do meio, que antes abria uma janela do Electron com a página
// remota) vai para o navegador padrão — e só http(s).
app.on("web-contents-created", (_e, wc) => {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  wc.on("will-navigate", (ev, url) => {
    // Fase 23.2: só as telas do próprio app — antes qualquer file:// do disco carregava aqui
    // (e herdava o preload).
    if (!dentroDoApp(url)) {
      ev.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url).catch(() => {});
    }
  });
  wc.on("will-attach-webview", (ev) => ev.preventDefault());
  // Fase 23.2: permissões do navegador negadas por padrão; só o microfone/câmera (o gravador e
  // a foto do chat) passam.
  wc.session.setPermissionRequestHandler((_wc, permissao, ok) => ok(permissao === "media" || permissao === "clipboard-sanitized-write"));
});

app.on("ready", async () => {
  if (!souPrincipal) return;
  if (process.platform === "win32") app.setAppUserModelId("com.zak.elysium");

  const quit = (motivo: MotivoEncerramento = "fechado") => {
    if (appQuitting) return;
    appQuitting = true;
    const aviso = avisarEncerramento(motivo);
    globalShortcut.unregisterAll();
    // O host de entrada é um PowerShell persistente; sem isso ele sobrevive ao app
    // e fica pendurado segurando o stdin.
    inputHost.stop();
    stopScheduler();
    pararIntervalos();
    pararRelogioPomodoro();
    pararRotinas();
    pararHermes();
    void aviso.finally(() => app.exit(0));
  };

  // Estado do app para o celular (08/10). O Windows avisa o fim da sessão (desligar,
  // reiniciar, sair da conta) pela janela; qualquer janela serve, então todas escutam.
  iniciarEstadoApp({ versao: app.getVersion(), janela: janelaAtual, ociosoMin: () => Math.floor(powerMonitor.getSystemIdleTime() / 60) });
  aoMudarEstadoApp(e => broadcastEstadoPc(e));
  // Saída de som (08/10): a voz saía para o alto-falante virtual do Steam e ninguém ouvia.
  // Confere na partida e a cada 3 min; avisa no PC (notificação) quando o problema aparece.
  let avisoDeSom: string | null = null;
  const conferirSom = async () => {
    const s = await lerSaidaDeSom();
    if (!s) return;
    definirSom({ nome: s.nome, volume: s.volume, mudo: s.mudo, virtual: s.virtual });
    const p = problemaDeSom(s);
    if (p && p !== avisoDeSom) { console.warn("[som] " + p); notify("ELYSIUM — som", p); }
    avisoDeSom = p;
  };
  setTimeout(() => { void conferirSom(); }, 8_000);
  aCada(180_000, "som", () => conferirSom());
  app.on("browser-window-created", (_e, w) => {
    w.on("session-end", () => { if (!appQuitting) { appQuitting = true; void avisarEncerramento("desligando"); } });
  });

  // Ponte dos 52 métodos RPC para o dashboard. Antes do createTray porque o menu da
  // bandeja já pode disparar telas que usam a ponte.
  registerRpcBridge();

  createTray(
    quit,
    openConfigWindow,
    openDashboard,
    () => { openDashboard(); startListening().catch((e) => console.error("[bandeja] não consegui começar a ouvir:", e)); },
    (text) => { openDashboard(); void enviarTexto(text); },
  );

  state.on("change", (s) => {
    refreshTray(s);
    enviarAoDash("voice:state", s);
  });

  recorderWin = createRecorderWindow();

  const serverToken = getOrCreateServerToken();
  const cfg = getConfig();
  startServer(serverToken, processCommand, cfg.serverPort ?? 4200, processCommandStream);
  // Fase 21: o Hermes como cérebro. As ferramentas do ELYSIUM vão para ele por MCP (só a lista
  // permitida, sempre pela política de conteúdo de fora); o servidor dele sobe em segundo plano.
  const mcpToken = getOrCreateMcpToken();
  ligarMcp(mcpToken, {
    definicoes: definicoesDeFerramentas,
    executar: (nome, args) => executarComPolitica(nome, args, true, pedidoDoHermes()),
  });
  definirUrlDoMcp(`http://127.0.0.1:${cfg.serverPort ?? 4200}/mcp/${mcpToken}`);
  void iniciarHermes();
  // Fase 23: as novidades do dia (IA, cinema, em alta) — depois que o Hermes subiu; vira às 6h.
  setTimeout(() => { void buscarNovidades().catch(() => {}); }, 90_000).unref?.();
  setInterval(() => { void buscarNovidades().catch(() => {}); }, 3600_000).unref?.();
  iniciarAtualizacoes({ sair: () => quit("atualizando"), ocupado: () => state.get() !== "idle" });
  // Cérebro local: se o Ollama estiver parado, sobe já — antes do primeiro pedido pagar a espera.
  // "auto" (fase 16) também usa o local para a conversa curta.
  if (cfg.routerProvider === "ollama" || cfg.chatProvider !== "groq") void garantirOllama(baseDoOllama());
  // Modo foco (fase 12): distração vira balão no PC; o resumo do fim vai também ao celular.
  iniciarFoco({
    avisar: (titulo, corpo) => {
      notify(titulo, corpo);
      if (/^Foco /.test(titulo)) mandarAoCelular("aviso", titulo, corpo);
      enviarAoDash("foco:mudou");
    },
    fecharApp: (nome) => closeApp(nome),
    abertosAgora: () => getRunningApps(),
  });
  // Google Agenda (bloco 120): 10 min antes de cada compromisso, no PC e no celular.
  vigiarAgenda((titulo, corpo) => {
    notify(titulo, corpo);
    mandarAoCelular("lembrete", titulo, corpo, { push: "reminder" });
  });
  // Fase 21: instalação e atualização pelo winget rodam em segundo plano e avisam no fim.
  aoTerminarInstalacao((titulo, texto) => {
    notify(`ELYSIUM — ${titulo}`, texto);
    if (!ehNoite()) speak(texto).catch(() => { /* best-effort */ });
    mandarAoCelular("aviso", titulo, texto);
  });
  // Disco quase cheio (fase 12): no máximo um aviso por dia, no PC e no celular.
  vigiarDisco((titulo, corpo) => {
    notify(titulo, corpo);
    mandarAoCelular("aviso", titulo, corpo, { push: "anomaly" });
  });

  const unseenFromMobile = checkAndMarkUnseenFromMobile();
  if (unseenFromMobile.length > 0) {
    const preview = unseenFromMobile.length === 1
      ? (unseenFromMobile[0].text?.slice(0, 80) || unseenFromMobile[0].attachment?.name || "item")
      : `${unseenFromMobile.length} itens`;
    notify("ELYSIUM — Mailbox", `Recebido do celular: ${preview}`);
  }

  // Pomodoro (fase 20): a troca de fase fala (pedida por ele: não gasta o orçamento de avisos),
  // vira balão e vai ao celular; o foco liga em silêncio — o fim de cada bloco é anunciado aqui.
  iniciarPomodoro({
    avisar: (titulo, fala) => {
      notify(`ELYSIUM — ${titulo}`, fala);
      speak(fala).catch(() => { /* best-effort */ });
      mandarAoCelular("aviso", titulo, fala, { push: "reminder" });
    },
    focoLigar: (minutos) => comecarFoco({ minutos, doPomodoro: true }),
    focoParar: () => { if (estadoFoco().doPomodoro) pararFoco(); },
    mudou: () => {
      const p = pomodoroParaCliente();
      enviarAoDash("pomodoro:mudou", p);
      enviarAoDash("foco:mudou");
      try { broadcastPomodoro(p); } catch { /* sem servidor */ }
    },
  });

  // Modos (fase 20): o chip do dashboard e o do celular mudam juntos, venha a troca de onde vier.
  aoMudarModo((m) => {
    const modo = modoParaCliente(m);
    enviarAoDash("modo:mudou", modo);
    try { broadcastModo(modo); } catch { /* sem servidor */ }
  });

  mailboxEvents.on("new-message", (msg) => {
    enviarAoDash("mailbox:new-message", msg);
  });

  startMonitor(notify);
  startTelemetryLoop();

  // O agendador entra depois do servidor e do TTS porque dispara na hora o que venceu
  // com o PC desligado — precisa de tudo de pé para falar e notificar.
  startScheduler((reminder) => {
    notify("ELYSIUM — Lembrete", reminder.text);
    speak(fraseDeLembrete(reminder.text)).catch(() => { /* best-effort */ });
    mandarAoCelular("lembrete", "Lembrete", reminder.text, { push: "reminder", ref: reminder.id, dados: { reminderId: reminder.id } });
    enviarAoDash("reminder:fired", reminder);
  });

  // Timers com nome (bloco 136): avisam no PC (notificação + fala) e no celular.
  ouvirTimers((t) => {
    const frase = fraseDeTimer(t.nome);
    notify("ELYSIUM — Timer", frase);
    speak(frase).catch(() => { /* best-effort */ });
    mandarAoCelular("aviso", "Timer", frase, { push: "reminder" });
    enviarAoDash("timer:acabou", t);
  });
  retomarTimers();
  // Fase 17: os lembretes que já existiam viram tarefas (uma vez só).
  try { const n = migrarLembretesParaTarefas(); if (n) console.log(`[tarefas] ${n} lembrete(s) antigos entraram na lista.`); } catch (e) { console.warn("[tarefas] migração falhou:", e); }

  // Hábitos (fase 16): no horário, SÓ se ainda não foi feito hoje — avisar de algo já
  // feito ensina a ignorar o aviso. Confere a cada 30 s; a marca de "lembrado" impede repetir.
  aCada(30_000, "habitos", () => {
    for (const h of habitosParaLembrar()) {
      const frase = fraseDeHabito(h.nome);
      notify("ELYSIUM — Hábito", frase);
      // Fase 18: falar e mandar para o celular gastam o orçamento de avisos do dia (e o modo
      // foco segura); fora dele fica só a notificação discreta acima. Ver avisos.ts.
      if (!podeAvisarAlto()) continue;
      if (!ehNoite()) speak(frase).catch(() => { /* best-effort */ });
      mandarAoCelular("lembrete", "Hábito", frase, { push: "reminder", ref: h.id });
    }
  });

  // Rotinas: o texto passa pelo mesmo pipeline do chat e da voz. O comando não pode
  // atropelar uma gravação em andamento, então espera o app ficar ocioso (até 60 s).
  iniciarRotinas(
    async (rotina) => {
      await esperarOcioso();
      const { reply } = await executarComando(rotina.texto);
      return reply;
    },
    (rotina, resultado) => {
      if (rotina.entregar.includes("pc")) {
        notify(`ELYSIUM — ${rotina.nome}`, resultado);
        if (rotina.falar) speak(resultado).catch(() => { /* best-effort */ });
      }
      if (rotina.entregar.includes("celular")) {
        mandarAoCelular("rotina", rotina.nome, resultado, { push: "reminder", ref: rotina.id, dados: { rotinaId: rotina.id } });
      }
      enviarAoDash("rotina:executada", { id: rotina.id, nome: rotina.nome, resultado });
    },
    // A condição em português ("se o Spotify estiver aberto") é o cérebro com ferramentas
    // de leitura respondendo SIM ou NÃO (bloco 79).
    avaliarCondicao,
  );

  // Atalho e palavra ANTES das esperas do Registro (fase 20): cada `reg.exe` pode levar
  // segundos num PC carregado logo depois do login, e o atalho não respondia nesse meio-tempo.
  const ok = globalShortcut.register(cfg.shortcut, handleShortcut);
  // Fase 23: Ctrl+Shift+E — texto selecionado → comandos de IA numa janelinha.
  registrarIpcSelecao();
  if (cfg.atalhoSelecao && !globalShortcut.register(cfg.atalhoSelecao, () => { void aoAtalhoDeSelecao(); })) {
    console.warn(`[selecao] atalho ${cfg.atalhoSelecao} ocupado por outro programa`);
  }
  if (cfg.palavraDeAtivacao) ligarPalavraDeAtivacao(acordarPorVoz);
  // O PowerShell da escuta é filho do app; sem isto ele ficaria órfão escutando depois
  // de "Sair" na bandeja.
  app.on("before-quit", () => desligarPalavraDeAtivacao());

  // Antes de registrar o nome novo: senão sobram duas entradas em HKCU\...\Run, e a
  // antiga aponta para o caminho da instalação NEUROAXIS.
  await removerEntradaLegada().catch((e) => console.warn("[inicio] entrada antiga:", e));
  await sincronizarInicioAutomatico(cfg.autoLaunch).catch((e) => console.warn("[inicio] início automático:", e));

  if (!hasApiKey()) openConfigWindow();
  if (!ok) notify("ELYSIUM — Aviso", `Atalho ${cfg.shortcut} não pôde ser registrado. Tente via bandeja.`);

  notify("ELYSIUM", "Sistemas no ar. Ctrl+Shift+J para falar.");
  // Fase 16, a persona FRIDAY: a fala de arranque é um status curto, com o tratamento.
  const tratamento = (getConfig().tratamento ?? "").trim();
  // Em desenvolvimento o app reinicia toda hora: falar a cada arranque só incomoda.
  if (app.isPackaged) speak(fraseDeArranque(tratamento, new Date().getHours())).catch(() => { /* best-effort */ });
});

app.on("window-all-closed", () => { /* intentional no-op */ });
