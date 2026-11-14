// PRECISA ser o primeiro import do arquivo. Os `electron-store` são construídos em escopo
// de módulo, ou seja, no momento do require — se a migração do perfil NEUROAXIS → ELYSIUM
// rodasse depois, o primeiro store já teria criado o arquivo novo vazio e a cópia seria
// descartada pela própria guarda dela. Ver src/main/migrateUserData.ts.
// Fase 23.2: antes de qualquer ipcMain.handle — todo canal confere a origem (ver ipcSeguro.ts).
import { dentroDoApp } from "./ipcSeguro";
import "./migrateUserData";
import { migrarLembretesParaTarefas } from "../actions/memoryActions";
import { app, BrowserWindow, globalShortcut, ipcMain, clipboard, nativeImage, dialog, shell, powerMonitor, screen } from "electron";
import { paraFala } from "../services/estiloResposta";
import { ouvirTimers, retomarTimers } from "../services/timers";
import { deveSugerir, sugerirContinuacoes } from "../services/continuacoes";
import { rapidasPara } from "../services/respostasRapidas";
import { aoPedirConfirmacao, ehSim, responderConfirmacao } from "../services/confirmacao";
import { decidirTela, estadoEmTexto, gerarTela, OFERTA, pediuTela, quandoMostrarTela, textoDaTela } from "../services/telaInteligente";
import { geradorDeTelas, provedorDeTelas } from "../services/geradorDeTelas";
import { proxyDoApp } from "../services/uiProxy";
import * as path from "node:path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";

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
import { getConfig, getApiKey, setApiKey, hasApiKey, setOverride, patchDeConfigSeguro, getOrCreateServerToken, getOrCreateMcpToken, regenerateServerToken, AppConfig, getGithubToken, setGithubToken, setGoogleCliente, getGeminiKey, setGeminiKey, DEFAULTS } from "./config";
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
import { clearHistory, desfazerUltimoTurno, registrarEstadoDaTela, registrarFalaDaEly, registrarTelaMostrada, telaMostrada } from "../services/brain";
import { modelosDaGroq } from "../services/catalogoGroq";
import { desligarPalavraDeAtivacao, escutarDuranteFala, ligarPalavraDeAtivacao, Ouvido, podeInterromper } from "../services/palavraAtivacao";

// O log em arquivo entra antes de tudo que escreve no console (bloco 97).
iniciarLogEmArquivo();
import { getTopHistory } from "../services/history";
import { registrarPergunta, bolhasDoChat } from "../services/perguntas";
import { aoTocarAudio, ehNoite } from "../services/tts";
import { ligarAvisoDeCota, resumoDaCota } from "../services/cotaGemini";
import { aoTerminarInstalacao } from "../actions/instalarApp";
import { ehAlucinacaoDoWhisper, ehEntradaDoLive, ehSaidaDoLive, JANELA_RESPOSTA_MS, pedeResposta, SILENCIO_LIVE_MS } from "../services/live";
import { envelopeDasPalavras } from "../services/bolota";
import { aoMudarFala, estaFalando, falaAtual, falar as speak, interromperTudo as interruptAll, novoTurno, turnoAtual } from "./fala";
import { habitosParaLembrar } from "../services/habitos";
import { podeAvisarAlto } from "../services/avisos";
import { ElysiumError } from "../services/errors";
import { processCommand, processCommandStream, executarComando } from "../services/command";
import { startServer, setActiveToken, broadcastMailboxEvent, broadcastNotify, broadcastEstadoPc, broadcastModo, broadcastPomodoro, ligarMcp } from "../services/server";
import { iniciarPomodoro, pararRelogioPomodoro, pomodoroParaCliente } from "../services/pomodoro";
import { aoMudarModo, modoParaCliente } from "../services/modos";
import { iniciarRotinas, pararRotinas, enfileirarEntrega, listarRotinas, type Entrega } from "../services/rotinas";
import { avaliarCondicao, executarComPolitica } from "../services/agente";
import { definicoesDeFerramentas } from "../services/ferramentas";
import { definirUrlDoMcp, iniciarHermes, interromperHermes, pararHermes, pedidoDoHermes, aplicarConfigHermes, reiniciarHermesPorModelo } from "../services/hermes/cerebro";
import { buscarNovidades } from "../services/novidades";
import { emitirEvento, MARCOS_OCIOSO } from "../services/eventos";
import { getRunningApps } from "../actions/systemInfo";
import { baseDoOllama, ollamaDisponivel } from "../services/llm";
import { garantirOllama } from "../services/ollamaVivo";
import { registerRpcBridge } from "./rpcBridge";
import { vigiarDisco } from "../actions/armazenamento";
import { comecarFoco, estadoFoco, iniciarFoco, pararFoco } from "../services/foco";
import { janelaDoResumo, resumoDoDia } from "../services/resumoDoDia";
import { conectarAgenda, desconectarAgenda, estadoAgenda, vigiarAgenda } from "../services/agenda";
import Store from "electron-store";
import { closeApp } from "../actions/closeApp";
import {
  aoMudarAtualizacao, estadoAtualizacao, iniciarAtualizacoes, instalarAtualizacaoDesktop, verificarAtualizacoes,
  marcarNovidadesVistas, novidadesPendentes,
} from "../services/atualizacao";
import { startMonitor, getDashboardTelemetry, killProcess, cpuERam, type DashboardTelemetry } from "../actions/systemInfo";
import type { BrainAction } from "../services/brain";
import { mediaControl } from "../actions/mediaControl";
import { logAnomaly, getAnomalyHistory, getInsights } from "../services/telemetryLog";
import { getAllPresets } from "../services/presetsStore";
import { fraseDeArranque, fraseDeEspera, fraseDeHabito, fraseDeLembrete, fraseDeTimer } from "../services/falasVivas";
import { criarFatiador, restoParaFalar } from "../services/fatiadorDeFrases";
import { dosarTratamento, tratamentoSorteado, vocativoPermitido } from "../services/vocativo";
import { anexoAbreDireto } from "../services/anexos";
import { marcarAcompanhado, pendentesDeAcompanhamento } from "../services/acompanhamento";
import { lerHumor, type Humor } from "../services/humor";
import { prepararBeats, registrarTocador, somRecente, tocarBeat, tocou } from "../services/vozStudioStream";
import { abrirFlutuante, areaDaCamada, criarFlutuante, enviarAoFlutuante, fecharFlutuante, flutuanteAberto, registrarIpcFlutuante } from "./flutuante";
import { desenharRapido, pediuDesenho } from "../services/desenhoRapido";
import { listarJanelas } from "../actions/janelas";
import { janelaDaFrente } from "../services/isso";
import { contextoRecente, recordAssistantReply, registrarJanelaDaFrente, registrarTurnoUsuario } from "../services/brain";
import { definirAplicadorDeConfig } from "../services/rpc";
import { comecarEscuta, garantirModelo, receberPcm, textoFinal } from "../services/parakeet";
import { aoMudarEstadoAoVivo, avisarEstadoAoVivo } from "../services/estadoAoVivo";
import { atalhoDeTela, pediuNaTela, pedirGuia, vksDe, type Acao } from "../services/guiaDeTela";
import { insistiu, janelaAlvo, pediuParaEscrever } from "../services/escreverNoApp";
import { agirNaJanela, escreverNoCursor, literalParaAqui, pediuAcaoNaTela } from "../services/agenteDeTela";
import { acharAlvos, falaDaMarca, imagemConfere, pedidoDeMarca, type PedidoDeMarca } from "../services/marcarNaTela";
import { acharCaixaNaTela } from "../services/olhos";
import { registrarForaDoHermes } from "../services/hermes/cerebro";
import { semAcento } from "../services/texto";
import type { Janela as JanelaDoPc } from "../actions/janelas";
import { uiaHost, type LeituraUia } from "../services/uiaHost";
import {
  checkAndMarkUnseenFromMobile, addMessage, addFileMessage, listMessagesForDesktop, inferKind, mailboxEvents,
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

/** 12/11: o que a Ely flutuante também recebe (o resto é só do dashboard). */
const ESPELHO_FLUTUANTE = new Set(["voice:action-label", "voice:state", "voice:transcript", "voice:reply", "voice:error", "voice:audio-level", "chat:chunk", "chat:reply", "chat:error", "chat:busy", "chat:tela", "tts:falando"]);

function enviarAoDash(canal: string, ...args: unknown[]): void {
  if (ESPELHO_FLUTUANTE.has(canal)) enviarAoFlutuante(canal, ...args);
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
      // 12/11: a voz do VoiceStudio toca aqui (Web Audio): sem gesto do usuário e sem freio de janela escondida.
      autoplayPolicy: "no-user-gesture-required",
      backgroundThrottling: false,
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

// 12/11: o tocador da voz do VoiceStudio é a janela do gravador (vozStudioStream.ts).
registrarTocador({
  pcm: (id, pcm, taxa, ganho) => { if (recorderWin && !recorderWin.isDestroyed()) recorderWin.webContents.send("studio:pcm", id, pcm, taxa, ganho); else tocou(id); },
  fim: (id) => { if (recorderWin && !recorderWin.isDestroyed()) recorderWin.webContents.send("studio:fim", id); else tocou(id); },
  parar: () => { if (recorderWin && !recorderWin.isDestroyed()) recorderWin.webContents.send("studio:parar"); },
});
ipcMain.on("studio:tocou", (_e, id: unknown) => { if (typeof id === "string") tocou(id); });

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
    enviarAoDash("dash:foco", !!dashWin && !dashWin.isDestroyed() && dashWin.isFocused());
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
    dashWin.on(ev as "show", () => { janelaMudou(); enviarAoDash("dash:foco", !!dashWin && !dashWin.isDestroyed() && dashWin.isFocused()); });
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
  // 19/10: o reconhecedor offline escuta enquanto ela fala, para dar para cortar pela voz.
  escutarDuranteFala(f && getConfig().interromperFalando !== false, acordarPorVoz);
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

let _completo: { t: DashboardTelemetry; em: number } | null = null;
let _cpuHighCount  = 0;
let _prevCpuPct    = 0;
let _cpuAltaTiques = 0;
let _ramAltaTiques = 0;
let _ramAlertedAt  = 0;
const ANOM_COOLDOWN = 5 * 60_000; // 5 min between same-type RAM alerts

function startTelemetryLoop(): void {
  const tick = async () => {
    try {
      // 24/10: o script completo (processos, discos, temperatura) é um PowerShell pesado; com o
      // dashboard escondido só CPU/RAM pelo Node, e o completo só quando algo passa de 85%.
      // 25/10: com o dashboard aberto, o completo a cada 15 s (eram 20 PowerShells por minuto); nos
      // tiques do meio, CPU/RAM frescos pelo Node sobre o último completo.
      const visivel = !!dashWin && !dashWin.isDestroyed() && dashWin.isVisible();
      const leve = cpuERam();
      const alta = leve.cpu_pct >= 85 || leve.ram_pct >= 85;
      let t: DashboardTelemetry | (typeof leve & { processes: { name: string }[] });
      if (!visivel && !alta) t = { ...leve, processes: [] };
      else if (_completo && Date.now() - _completo.em < 15_000) t = { ..._completo.t, ...leve, timestamp: Date.now() };
      else { const c = await getDashboardTelemetry(); _completo = { t: c, em: Date.now() }; t = c; }
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

      if (!visivel || !dashWin) return;
      dashWin.webContents.send("dash:telemetry", t);
    } catch { /* best-effort */ }
  };
  aCada(3_000, "telemetria", () => tick());

  // Janelas que abrem e fecham (bloco 79): a cada 15 s compara a lista de programas com
  // janela. Só nomes de processo; o título vai junto para o filtro ("o Chrome") casar
  // também com apps da loja hospedados no ApplicationFrameHost.
  let _janelas: Map<string, string> | null = null;
  aCada(15_000, "janelas", async () => {
    // 24/10: listar as janelas é um PowerShell; só vale com o modo foco ligado ou uma rotina
    // ativa que espera programa abrir/fechar. Fora disso a lista velha some (sem "abriu" falso depois).
    const precisa = estadoFoco().ativo || listarRotinas().some((r) => r.ativa && r.gatilho?.tipo === "evento" && /^app\./.test(r.gatilho.evento));
    if (!precisa) { _janelas = null; return; }
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
    const [de, ate] = janelaDoResumo(getConfig().resumoHoras);
    if (agora.getHours() < de || agora.getHours() >= ate) return;
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
  // 13/11: a transcrição local (Parakeet) começa a escuta junto — as palavras ao vivo vão à bolota.
  comecarEscuta((t) => enviarAoFlutuante("voice:parcial", t));
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
  const t = tratamentoSorteado(getConfig().tratamento ?? "");
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

// ── Ely flutuante (12/11) ───────────────────────────────────────────────────────────────

/** Explicação pedida pela flutuante: os cartões (desenhoRapido.ts) saem em paralelo com a fala. */
function desenharNoFlutuante(pedido: string): void {
  if (!flutuanteAberto() || !pediuDesenho(pedido) || pediuTela(pedido)) return;
  enviarAoFlutuante("flutuante:desenhando");
  const t0 = Date.now();
  void desenharRapido(pedido).then((r) => {
    if (r) console.log(`[flutuante] desenho em ${Date.now() - t0} ms pela ${r.por} (${r.cartoes.map((c) => c.tipo).join(", ")})`);
    enviarAoFlutuante("flutuante:cartoes", r ? { cartoes: r.cartoes } : {});
  }).catch(() => enviarAoFlutuante("flutuante:cartoes", {}));
}

/** O programa da frente vai no contexto do pedido (só o nome e o título; nada de conteúdo). */
async function lembrarJanelaDaFrente(): Promise<void> {
  try {
    const j = janelaDaFrente(await listarJanelas());
    if (j) { registrarJanelaDaFrente(j.processo, j.titulo); hwndAlvo = j.hwnd; }
  } catch { /* sem lista, sem contexto */ }
}

// ── guia de tela (13/11): marcar e agir na janela da frente, como o Roamies ──────────────
/** A janela que estava na frente quando a bolota abriu (o alvo do "aqui"). */
let hwndAlvo = "";
const confirmacoes = new Map<string, (sim: boolean) => void>();

/** O retângulo de um elemento (pixels físicos da UIA) na coordenada da camada (DIP). */
function naCamada(e: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const r = screen.screenToDipRect(null, { x: e.x, y: e.y, width: e.w, height: e.h });
  const a = areaDaCamada() ?? { x: 0, y: 0 };
  return { x: Math.round(r.x - a.x), y: Math.round(r.y - a.y), w: Math.round(r.width), h: Math.round(r.height) };
}

/** Executa a ação do guia (clicar, escrever, teclas) na janela-alvo. */
async function agirNaTela(acao: Acao, l: LeituraUia | null): Promise<void> {
  const nome = (i: number) => l?.elementos.find((e) => e.i === i)?.n?.slice(0, 30) ?? "";
  if (acao.tipo === "clicar") { avisarEstadoAoVivo(nome(acao.i) ? `Clicando em ${nome(acao.i)}…` : "Clicando…"); await uiaHost.clicar(acao.i); }
  else if (acao.tipo === "escrever") { avisarEstadoAoVivo("Escrevendo…"); await uiaHost.valor(acao.i, acao.texto); }
  else {
    const vks = vksDe(acao.teclas);
    if (!vks) return;
    avisarEstadoAoVivo(acao.descricao);
    // Teclas só com a janela certa na frente (senão iriam para outro programa).
    if (!(await uiaHost.frente(hwndAlvo).catch(() => false))) return;
    await new Promise((r) => setTimeout(r, 120));
    await inputHost.keys(vks);
  }
}

/**
 * Pedido "da tela" feito pela bolota: lê a janela-alvo, marca os elementos e (se ele pediu para
 * fazer) age. `true` = tratado aqui; `false` = segue pelo cérebro de sempre.
 */
async function guiarNaTela(pedido: string, meuToken: number): Promise<boolean> {
  if (!flutuanteAberto() || !hwndAlvo || !pediuNaTela(pedido)) return false;
  const atalho = atalhoDeTela(pedido);
  try {
    if (atalho) {
      await agirNaTela(atalho, null);
      enviarAoDash("voice:reply", "Pronto.");
      return true;
    }
    avisarEstadoAoVivo("Olhando a janela…");
    const l = await uiaHost.ler(hwndAlvo);
    if (turnoAtual() !== meuToken) return true;
    const g = await pedirGuia(pedido, l);
    if (!g || turnoAtual() !== meuToken) return !!g;
    const porI = new Map(l.elementos.map((e) => [e.i, e]));
    enviarAoFlutuante("flutuante:marcas", {
      passos: g.passos.map((p) => ({ dizer: p.dizer, marcas: p.marcas.map((m) => ({ tipo: m.tipo, texto: m.texto, n: m.n, ...naCamada(porI.get(m.i)!) })) })),
    });
    registrarTurnoUsuario(pedido);
    recordAssistantReply(g.fala);
    registrarForaDoHermes(pedido, g.fala);
    if (g.recusa || !g.acao) pendente = { pedido, em: Date.now() };
    enviarAoDash("voice:reply", g.fala);
    state.set("speaking");
    const fala = speak(g.fala).catch(() => {});
    if (g.acao) {
      if (g.destrutiva) {
        const id = `c${Date.now().toString(36)}`;
        const alvo = g.acao.tipo === "teclas" ? g.acao.descricao : porI.get(g.acao.i)?.n ?? "isso";
        enviarAoFlutuante("flutuante:confirmar", { id, texto: `Fazer “${String(alvo).slice(0, 60)}”? Isso não tem volta.` });
        const sim = await new Promise<boolean>((ok) => { confirmacoes.set(id, ok); setTimeout(() => { if (confirmacoes.delete(id)) ok(false); }, 30_000); });
        if (sim && turnoAtual() === meuToken) await agirNaTela(g.acao, l);
      } else {
        await new Promise((r) => setTimeout(r, 500)); // a marca aparece antes do clique
        await agirNaTela(g.acao, l);
      }
    }
    await fala;
    return true;
  } catch (e) {
    console.warn("[guia] não deu:", e instanceof Error ? e.message : e);
    return false;
  }
}

// ── Ctrl+Espaço da bolota (14/11, o jeito que o dono pediu) ─────────────────────────────
//   segurar        → ouve enquanto segura e manda ao soltar;
//   toque, fechada → abre em voz contínua (depois de responder, volta a ouvir);
//   toque ouvindo  → manda o que ele falou;
//   toque parada   → some.
/** A bolota volta a ouvir sozinha depois de cada resposta (até fechar). */
let bolotaContinua = false;
/** Um toque/segurada sendo tratado: as repetições do Windows enquanto ele segura não contam. */
let atalhoEmCurso = false;
const VK_ESPACO = 0x20;
const SEGURAR_MS = 280;

function terminarFala(): void {
  if (recorderWin && !recorderWin.isDestroyed()) recorderWin.webContents.send("finish-recording");
}

/** Abre a bolota ao lado do cursor (sem ouvir ainda). */
function abrirBolota(): boolean {
  if (!hasApiKey()) { openConfigWindow(); return false; }
  if (!state.is("idle")) { interruptAll(); interromperHermes(); state.set("idle"); }
  abrirFlutuante(getConfig().theme, getConfig().movimento ?? "");
  uiaHost.aquecer();
  void lembrarJanelaDaFrente();
  return true;
}

/** Ouve de novo na bolota (voz contínua): espera ele falar por um tempo; ninguém falou → ela some sozinha. */
function ouvirNaBolota(): void {
  setTimeout(() => {
    if (!bolotaContinua || !flutuanteAberto() || !state.is("idle") || estaFalando()) return;
    startListening({ esperarFalaMs: SILENCIO_LIVE_MS }).catch((e) => console.error("[flutuante] não consegui ouvir de novo:", e));
  }, 350);
}

/** O Espaço ainda está apertado daqui a `ms`? (pela leitura do teclado no host de janelas) */
async function aindaSegurando(ms: number): Promise<boolean> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (!(await uiaHost.teclaApertada(VK_ESPACO).catch(() => false))) return false;
    await new Promise((r) => setTimeout(r, 35));
  }
  return true;
}
async function esperarSoltar(): Promise<void> {
  for (let i = 0; i < 1200; i++) { // até 60 s
    if (!(await uiaHost.teclaApertada(VK_ESPACO).catch(() => false))) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function alternarFlutuante(): Promise<void> {
  if (atalhoEmCurso) return;
  atalhoEmCurso = true;
  try {
    const aberta = flutuanteAberto();
    const ouvindo = state.is("listening");
    // Fechada: aparece já, enquanto decide se é toque ou segurada.
    if (!aberta && !abrirBolota()) return;
    if (await aindaSegurando(SEGURAR_MS)) {
      // Segurando: falar enquanto segura (o silêncio não corta) e mandar ao soltar.
      bolotaContinua = false;
      if (ouvindo) { cancelarGravacao(); state.set("idle"); }
      else if (!state.is("idle")) { interruptAll(); interromperHermes(); state.set("idle"); }
      await startListening({ segurar: true }).catch((e) => console.error("[flutuante] não consegui ouvir:", e));
      await esperarSoltar();
      terminarFala();
      return;
    }
    if (!aberta) { bolotaContinua = true; await startListening().catch((e) => console.error("[flutuante] não consegui ouvir:", e)); return; }
    if (ouvindo) { terminarFala(); return; }
    pararFlutuante();
    fecharFlutuante();
  } finally {
    await esperarSoltar();
    atalhoEmCurso = false;
  }
}

/** Pedido digitado na bolota: o guia de tela, senão o caminho de sempre (com o desenho). */
async function digitadoNaBolota(texto: string): Promise<void> {
  if (pedidoDeMarca(texto) || pediuNaTela(texto) || pediuParaEscrever(texto) || pediuAcaoNaTela(texto) || literalParaAqui(texto) || (pendente && insistiu(texto))) {
    if (!state.is("idle")) { interruptAll(); state.set("idle"); }
    const meu = novoTurno();
    state.set("processing");
    try { if (await agirDireto(texto, meu)) return; }
    finally { if (turnoAtual() === meu) state.set("idle"); }
  }
  desenharNoFlutuante(texto);
  void enviarTexto(texto);
}

// ── agir nos programas (13/11, como o Roamies: ler → fazer → conferir) ────────────────────
/** O último pedido de ação que não foi feito — "faz de qualquer jeito" refaz ele. */
let pendente: { pedido: string; em: number } | null = null;

/** Fecha o turno de uma ação: memória, resposta e fala. */
async function responderAcao(pedido: string, fala: string, memoria: string): Promise<void> {
  registrarTurnoUsuario(pedido);
  recordAssistantReply(fala);
  registrarForaDoHermes(pedido, memoria);
  enviarAoDash("voice:reply", fala);
  state.set("speaking");
  await speak(fala).catch(() => {});
}

/** "Escreve bom dia aqui": cola no campo com o cursor, sem modelo (< 1 s). `false` = não havia campo. */
async function escreverAqui(pedido: string, texto: string, meuToken: number): Promise<boolean> {
  const t0 = Date.now();
  const hwnd = hwndAlvo || janelaDaFrente(await listarJanelas().catch(() => []))?.hwnd || "";
  if (!hwnd) return false;
  avisarEstadoAoVivo("Escrevendo…");
  const f = await escreverNoCursor(hwnd, texto);
  if (!f || turnoAtual() !== meuToken) return !!f;
  console.log(`[escrever] aqui (${f.t} "${f.n.slice(0, 30)}") em ${Date.now() - t0} ms`);
  pendente = null;
  await responderAcao(pedido, "Pronto.", `Escreveu "${texto.slice(0, 200)}" no campo com o cursor.`);
  return true;
}

/** Pedido de FAZER algo num programa: o agente em passos (agenteDeTela.ts). */
async function agirComAgente(pedido: string, meuToken: number): Promise<boolean> {
  const janelas = await listarJanelas().catch(() => [] as JanelaDoPc[]);
  const daFrente = (hwndAlvo && janelas.find((j) => j.hwnd === hwndAlvo)) || janelaDaFrente(janelas);
  // O programa citado não está aberto: o agente começa na da frente (e pode abrir o programa).
  const alvo = janelaAlvo(pedido, "", janelas, daFrente) ?? daFrente;
  if (!alvo) return false;
  pendente = { pedido, em: Date.now() };
  const r = await agirNaJanela(pedido, {
    hwnd: alvo.hwnd,
    conversa: contextoRecente(),
    avisar: avisarEstadoAoVivo,
    vale: () => turnoAtual() === meuToken,
    confirmar: (texto) => {
      const id = `c${Date.now().toString(36)}`;
      enviarAoFlutuante("flutuante:confirmar", { id, texto });
      return new Promise<boolean>((ok) => { confirmacoes.set(id, ok); setTimeout(() => { if (confirmacoes.delete(id)) ok(false); }, 30_000); });
    },
    marcar: (itens) => enviarAoFlutuante("flutuante:marcas", { passos: [{ dizer: "", marcas: itens.flatMap(({ e, texto }) => [{ tipo: "anel", ...naCamada(e) }, ...(texto ? [{ tipo: "rotulo", texto, ...naCamada(e) }] : [])]) }] }),
  });
  if (turnoAtual() !== meuToken) return true;
  console.log(`[agente-tela] ${r.fez ? "fez" : "não fez"} em ${r.voltas} volta(s), ${r.ms} ms`);
  if (r.fez) pendente = null;
  await responderAcao(pedido, r.fala, `${r.fala}${r.fez ? " (feito na tela)" : " (não deu certo na tela)"}`);
  return true;
}

/**
 * Antes do cérebro: escrever no programa, guia de tela, ou "faz de qualquer jeito" refazendo o
 * pedido que ficou sem fazer. `true` = tratado aqui.
 */
/** A última leitura de cada janela vale 3 s: marcar e agir em seguida não relê a janela inteira. */
const leituras = new Map<string, { l: LeituraUia; em: number }>();
async function lerJanela(hwnd: string): Promise<LeituraUia> {
  const c = leituras.get(hwnd);
  if (c && Date.now() - c.em < 3_000) return c.l;
  let l = await uiaHost.ler(hwnd);
  // Navegador/Electron liga a acessibilidade só quando alguém pergunta: as primeiras leituras vêm
  // pela metade (só a moldura). Relê enquanto a árvore ainda está crescendo (até ~1,2 s).
  for (let k = 0; k < 3 && l.elementos.length < 25; k++) {
    await new Promise((r) => setTimeout(r, 400));
    const de = await uiaHost.ler(hwnd);
    if (de.elementos.length <= l.elementos.length) { l = de; break; }
    l = de;
  }
  leituras.set(hwnd, { l, em: Date.now() });
  return l;
}

/**
 * "Circula o símbolo do YouTube" (14/11, o `draw` do Roamies): acha o alvo na janela da frente pela
 * acessibilidade; se não achar, pela imagem; e desenha a marca na camada. `false` = não era isso
 * (uma pergunta "onde fica…" sem nada parecido na tela segue para o guia/cérebro).
 */
async function marcarNaTela(pedido: string, p: PedidoDeMarca, meuToken: number): Promise<boolean> {
  const t0 = Date.now();
  const janelas = await listarJanelas().catch(() => [] as JanelaDoPc[]);
  const alvoJanela = (hwndAlvo && janelas.find((j) => j.hwnd === hwndAlvo)) || janelaDaFrente(janelas);
  if (!alvoJanela) return false;
  if (!flutuanteAberto()) abrirFlutuante(getConfig().theme, getConfig().movimento ?? "");
  avisarEstadoAoVivo(`Achando ${p.alvo}…`);
  let caixas: { x: number; y: number; w: number; h: number }[] = [];
  const foraDaTela: { x: number; y: number; w: number; h: number }[] = [];
  let pelaImagem = false;
  try {
    const l = await lerJanela(alvoJanela.hwnd);
    // Fora do monitor (a janela passa da borda, a página rolada): rola até ele aparecer e marca lá.
    const area = areaDaCamada();
    const fora = (c: { x: number; y: number; w: number; h: number }) => !!area && (c.x + c.w / 2 < 0 || c.y + c.h / 2 < 0 || c.x + c.w / 2 > area.width || c.y + c.h / 2 > area.height);
    const achados = acharAlvos(l, p.alvo, p.todos);
    for (const e of achados) {
      let c = naCamada(e);
      if (fora(c)) {
        const r = await uiaHost.mostrar(e.i).catch(() => null);
        if (r && r.w > 2) { c = naCamada(r); leituras.delete(alvoJanela.hwnd); }
      }
      if (!fora(c)) caixas.push(c);
      else foraDaTela.push(c);
    }
    if (!achados.length && l.w && l.h) {
      // Pela imagem (só quando a acessibilidade não acha nada): a janela tem de aparecer (a foto é do
      // que está na tela), e a caixa tem de cair DENTRO dela — senão o modelo chutou.
      avisarEstadoAoVivo("Olhando a tela…");
      await uiaHost.frente(alvoJanela.hwnd).catch(() => false);
      const jan = { x: l.x ?? 0, y: l.y ?? 0, w: l.w, h: l.h };
      const c = await acharCaixaNaTela(jan, p.alvo).catch(() => null);
      const dentro = c && c.x >= jan.x - 4 && c.y >= jan.y - 4 && c.x + c.w <= jan.x + jan.w + 4 && c.y + c.h <= jan.y + jan.h + 4;
      // E o que está no meio da caixa tem de combinar (o logo do Google não é o YouTube).
      const confere = c && dentro ? imagemConfere(await uiaHost.quem(c.x + c.w / 2, c.y + c.h / 2).catch(() => null), p.alvo) && imagemConfere({ t: "Text", n: c.visto }, p.alvo) : false;
      if (c && dentro && confere) { const cc = naCamada(c); if (!fora(cc)) { caixas = [cc]; pelaImagem = true; } }
      else if (c) console.log(`[marcar] a imagem chutou "${p.alvo}" num lugar que não confere`);
    }
  } catch (e) { console.warn("[marcar] não deu:", e instanceof Error ? e.message : e); }
  if (turnoAtual() !== meuToken) return true;
  // Pergunta "onde fica X" sem nada parecido: não é marca — o guia ou o cérebro respondem.
  if (!caixas.length && /^(ely,? )?(onde|cade)/i.test(semAcento(pedido).trim())) return false;
  if (caixas.length) enviarAoFlutuante("flutuante:marcas", { passos: [{ dizer: "", marcas: caixas.map((c) => ({ tipo: p.tipo, ...c })) }] });
  // Existe, mas a janela passa da borda do monitor e ele ficou para fora: uma seta na borda, apontando.
  const area = areaDaCamada();
  if (!caixas.length && foraDaTela.length && area) {
    const c = foraDaTela[0];
    const x = Math.max(30, Math.min(area.width - 70, c.x + c.w / 2 - 20)), y = Math.max(30, Math.min(area.height - 70, c.y + c.h / 2 - 20));
    enviarAoFlutuante("flutuante:marcas", { passos: [{ dizer: "", marcas: [{ tipo: "seta", x, y, w: 40, h: 40 }] }] });
  }
  const ff = foraDaTela[0];
  const lado = ff && area ? (ff.y + ff.h / 2 > area.height ? "embaixo" : ff.y + ff.h / 2 < 0 ? "em cima" : ff.x + ff.w / 2 < 0 ? "à esquerda" : "à direita") : "";
  const fala = !caixas.length && foraDaTela.length ? `Está aqui ${lado}, fora da tela — a janela passa da borda.` : falaDaMarca(p, caixas.length, pelaImagem);
  console.log(`[marcar] "${p.alvo}" → ${caixas.length} marca(s)${pelaImagem ? " pela imagem" : ""} em ${Date.now() - t0} ms`);
  await responderAcao(pedido, fala, `${fala} (marcou "${p.alvo}" na tela)`);
  return true;
}

async function agirDireto(texto: string, meuToken: number): Promise<boolean> {
  let pedido = texto;
  if (pendente && Date.now() - pendente.em < 3 * 60_000 && insistiu(texto)) { pedido = `${pendente.pedido} (ele insistiu: faça)`; pendente = null; }
  // 14/11: circular / apontar / sublinhar / "onde está X" — marca na tela, sem modelo e sem licença.
  const marca = pedidoDeMarca(pedido);
  if (marca && await marcarNaTela(pedido, marca, meuToken)) return true;
  const literal = literalParaAqui(pedido);
  if (literal && (flutuanteAberto() || /\b(aqui|onde (eu )?(estou|to))\b/i.test(pedido)) && await escreverAqui(pedido, literal, meuToken)) return true;
  // "Onde fica…" / "me mostra" e os atalhos (fechar guia, voltar) seguem no guia de tela.
  const pergunta = /\b(onde (fica|esta|eu clico|clico|tem|acho)|me mostra|mostra onde|aponta|como (eu )?(faco|uso|mudo|ativo|desativo|acho|configuro))\b/i.test(semAcento(pedido));
  if (!pergunta && !atalhoDeTela(pedido) && (literal || pediuParaEscrever(pedido) || pediuAcaoNaTela(pedido))) {
    if (await agirComAgente(pedido, meuToken)) return true;
  }
  if (flutuanteAberto() && pediuNaTela(pedido) && await guiarNaTela(pedido, meuToken)) return true;
  return false;
}

/** O Sim / Não da pílula para a pergunta de licença do cérebro: o resultado vira a resposta falada. */
async function responderPelaPilula(sim: boolean): Promise<void> {
  const fala = await responderConfirmacao(sim ? "sim" : "não").catch(() => null);
  if (!fala) return;
  recordAssistantReply(fala);
  enviarAoDash("voice:reply", fala);
  state.set("speaking");
  await speak(fala).catch(() => {});
  if (state.is("speaking")) state.set("idle");
}
// 14/11: toda pergunta de licença (só as sérias chegam) aparece como pílula Sim / Não na bolota.
aoPedirConfirmacao((descricao) => { if (flutuanteAberto()) enviarAoFlutuante("flutuante:confirmar", { id: "geral", texto: descricao }); });

/** Fechou a flutuante: a gravação sem mandar, a fala calada. */
function pararFlutuante(): void {
  bolotaContinua = false;
  if (state.is("listening")) { cancelarGravacao(); state.set("idle"); }
  else if (!state.is("idle")) { interruptAll(); interromperHermes(); state.set("idle"); }
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
  abriuSozinho = false;
  state.set("idle");
  if (liveLigado) desligarLive("Fiquei um minuto sem ouvir nada. Saí do modo live.");
});

/** O microfone desta escuta abriu sozinho (janela de resposta), não por pedido dele. */
let abriuSozinho = false;

ipcMain.on("audio-data", async (_event, buffer: Buffer) => {
  const meuToken = novoTurno();
  state.set("processing");
  let perguntou = false;
  try {
    const audio = new Uint8Array(buffer);
    // 13/11: o texto final pelo Parakeet (local, ~0,3 s); sem o modelo ou vazio, a Groq.
    const local = await textoFinal().catch(() => "");
    const text  = local || await transcribe(audio);
    if (turnoAtual() !== meuToken) return;

    // Calibragem da palavra de ativação (bloco 116): acordou pela voz e ninguém pediu nada
    // é um disparo falso. Uma linha no log por caso; somando dá para ajustar a confiança
    // com número, não com chute.
    if (Date.now() - acordadoPorVozEm < 30_000) {
      console.log(text ? `[palavra] acordou e veio pedido (${text.length} caracteres)` : "[palavra] falso: acordou e ninguém pediu nada");
      acordadoPorVozEm = 0;
    }

    // Janela de resposta (19/10): o microfone abriu sozinho, então ruído também é descartado
    // em silêncio, como no live.
    const semPedirAntes = liveLigado || abriuSozinho;
    abriuSozinho = false;
    if (!text || (semPedirAntes && ehAlucinacaoDoWhisper(text))) {
      // No live, áudio sem pedido só volta a ouvir — sem balão a cada vez.
      if (!semPedirAntes) notify("ELYSIUM", "Não entendi o áudio. Tente novamente.");
      state.set("idle");
      return;
    }

    enviarAoDash("voice:transcript", text);
    // 13/11: pedido sobre a tela que ele está vendo ("onde fica…", "clica em…") → o guia de tela.
    if (await agirDireto(text, meuToken)) return;
    // 12/11: pedido feito pela Ely flutuante que pede explicação → o desenho já vai saindo junto.
    desenharNoFlutuante(text);

    // Fase 21: entrar e sair do modo live são do PC (microfone), não do cérebro.
    if (liveLigado && ehSaidaDoLive(text)) {
      const t = tratamentoSorteado(getConfig().tratamento ?? "");
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
    // 12/11 (o truque do Roamies): com o VoiceStudio, um "Certo." já gravado sai em 600 ms se a
    // voz dela ainda não saiu — tapa a partida do motor (a frase entra na fila do tocador depois dele). Tocou o beat, a frase de espera sai.
    let beatTocou = false;
    const beat = setTimeout(() => { if (turnoAtual() === meuToken && !somRecente()) beatTocou = tocarBeat(ehNoite() ? 0.7 : 1); }, 600);
    const espera = setTimeout(() => { if (turnoAtual() === meuToken && !falas.length && !beatTocou) void speak(fraseDeEspera(text)).catch(() => {}); }, 2500);
    const falarFrase = (bruta: string) => {
      if (turnoAtual() !== meuToken || !bruta) return;
      // A mesma régua do texto final (command.ts): vocativo só na primeira frase, se sorteado.
      const frase = dosarTratamento(bruta, getConfig().tratamento ?? "", vocativoPermitido(), !jaFalado);
      if (!frase) return;
      clearTimeout(espera);
      clearTimeout(beat);
      jaFalado += ` ${frase}`;
      // O estado continua "processing" até o pedido terminar: "speaking" é interrompível pelo
      // chat e pela palavra, que começariam um pedido novo com este ainda rodando (ações do
      // agente, histórico fora de ordem). A tela sabe da fala pelo `tts:falando`.
      falas.push(speak(frase, humor).catch(() => {}));
    };
    const { reply: combined, desfazer, memoria } = await executarComando(text, {
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
    }).finally(() => { clearTimeout(espera); clearTimeout(beat); });
    if (turnoAtual() !== meuToken) return;
    updateLastCommand(text);
    // 12/11: com a Ely flutuante aberta, a resposta já está ali — sem balão do Windows por cima.
    if (!flutuanteAberto()) notify("ELYSIUM", combined);

    enviarAoDash("voice:reply", combined);
    // 31/10: pedido explícito de tela pela voz ("me mostra num gráfico…") também monta a tela,
    // embaixo da resposta falada. Oferta e "priorizar" continuam só no texto.
    if (pediuTela(text) && getConfig().respostasInterativas !== "nunca" && provedorDeTelas() !== null) void telaNoChat(text, combined);
    // 22/10: os botões de resposta também valem depois da voz (o microfone segue aberto).
    const rapidasVoz = rapidasPara(combined, getConfig());
    if (rapidasVoz) enviarAoDash("chat:extras", { rapidas: rapidasVoz });
    if (desfazer) enviarAoDash("chat:extras", { desfazer });
    if (memoria) enviarAoDash("chat:extras", { memoria });
    state.set("speaking");
    // O que ainda não foi dito: o fim da resposta (ou ela inteira, sem fala antecipada).
    // O `speak` entra na mesma fila, depois das frases já enfileiradas.
    fatiador.fim();
    falas.push(speak(restoParaFalar(combined, jaFalado), humor));
    await Promise.all(falas);
    perguntou = pedeResposta(combined);
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
    // 14/11: a bolota em voz contínua volta a ouvir depois de responder.
    else if (bolotaContinua && flutuanteAberto()) ouvirNaBolota();
    // 19/10: ela perguntou algo — o microfone abre uns segundos para a resposta, sem "Ely".
    else if (perguntou && turnoAtual() === meuToken && getConfig().continuarConversa !== false) ouvirResposta();
  }
});

/** Janela curta de escuta depois de uma pergunta da Ely (19/10). Ninguém falou → fecha calado. */
function ouvirResposta(): void {
  setTimeout(() => {
    if (liveLigado || !state.is("idle") || estaFalando()) return;
    abriuSozinho = true;
    startListening({ esperarFalaMs: JANELA_RESPOSTA_MS }).catch((e) => { abriuSozinho = false; console.error("[voz] não consegui abrir a resposta:", e); });
  }, 350);
}

ipcMain.on("recorder-error", (_event, msg: string) => {
  notify("ELYSIUM — Microfone", msg);
  enviarAoDash("voice:error", "Microfone indisponível. Verifique se está conectado.");
  state.set("speaking");
  speak("Não consegui acessar o microfone.")
    .catch(() => {})
    .finally(() => state.set("idle"));
});

// 13/11: o áudio cru da escuta, para a transcrição ao vivo (parakeet.ts).
ipcMain.on("audio-pcm", (_event, pcm: unknown) => {
  if (pcm instanceof Float32Array && pcm.length <= 16_000) receberPcm(pcm);
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
  // 22/10: resposta à oferta de tela. "Sim" monta a tela da resposta anterior (sem passar pelo
  // cérebro); qualquer outra coisa descarta a oferta e segue como pedido normal.
  const oferta = ofertaDeTela && Date.now() - ofertaDeTela.em < 15 * 60_000 ? ofertaDeTela : null;
  ofertaDeTela = null;
  // Pedido explícito de tela ("monta uma tela…", "faz uma calculadora") NÃO passa pelo agente do
  // chat: medido em 22/10, o agente entendeu "tela" como programar uma aba nova no próprio ELYSIUM.
  // Vai direto para o gerador (sessão sem ferramentas); "disso/isso" usa a última resposta.
  const explicito = !opcoes?.refazer && pediuTela(text) && getConfig().respostasInterativas !== "nunca" && provedorDeTelas() !== null;
  if ((oferta && ehSim(text) && !opcoes?.refazer) || explicito) {
    const doContexto = /\b(disso|isso|dessa|desse|essa|esse|acima|anterior)\b/i.test(text) && ultimaResposta ? ultimaResposta.resposta : "";
    // 23/10: a tela é gerada em segundo plano (esqueleto com Cancelar no chat). Antes o app ficava
    // em "processando" os 20–60 s da geração e o chat recusava mensagens ("Aguarde…").
    if (oferta && ehSim(text)) void telaNoChat(oferta.pergunta, oferta.resposta, true, "oferta");
    else void telaNoChat(text, doContexto, true, "pedido");
    return;
  }
  const meuToken = novoTurno();
  state.set("processing");
  try {
    // "Refazer" e "editar a última pergunta" (bloco 84): o turno anterior sai do histórico
    // e não conta de novo nas perguntas frequentes.
    if (opcoes?.refazer) desfazerUltimoTurno();
    else registrarPergunta(text);
    const { reply: combined, fontes, actions, local, desfazer, memoria, semCensura } = await executarComando(text, {
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
    if ((!dashWin?.isVisible() || !dashWin.isFocused()) && !flutuanteAberto()) notify("ELYSIUM", combined);
    // 22/10 (telas inteligentes): o ajuste "Respostas interativas" decide se a tela sai sozinha,
    // se a Ely oferece ("Quer que eu monte isso como tela?") ou nada. Só em conversa (sem ação no
    // PC) e só se a resposta já não termina perguntando outra coisa.
    // "Priorizar" monta mesmo se a resposta terminou perguntando (a tela substitui a pergunta).
    // 31/10: pergunta sobre a tela que já está aí ("qual a resposta da 3ª?") não ganha oferta de outra tela.
    const sobreATela = telaMostrada() !== null && !pediuTela(text);
    // 12/11: pela Ely flutuante, explicação já ganha o desenho rápido — sem tela/oferta repetindo.
    const desenhada = flutuanteAberto() && pediuDesenho(text) && !pediuTela(text);
    const decisao = deveSugerir(actions, "texto") && !sobreATela && !desenhada && (getConfig().respostasInterativas === "priorizar" || !pedeResposta(combined))
      ? decidirTela(getConfig().respostasInterativas, text, "texto", provedorDeTelas() !== null)
      : "nada";
    const textoFinal = decisao === "oferecer" ? `${combined}\n\n${OFERTA}` : combined;
    ofertaDeTela = decisao === "oferecer" ? { pergunta: text, resposta: combined, em: Date.now() } : null;
    ultimaResposta = { pergunta: text, resposta: combined };
    enviarAoDash("chat:reply", textoFinal);
    if (decisao === "gerar") void telaNoChat(text, combined);
    // Blocos 131 e 132: fontes da busca já; sugestões de continuação quando chegarem.
    if (fontes.length) enviarAoDash("chat:extras", { fontes });
    // Fase 18: a nuvem falhou e o local respondeu — o selo "modo local" na bolha.
    if (local) enviarAoDash("chat:extras", { local: true });
    // 05/11: respondida pelo modelo local no modo sem censura — o selo "sem censura".
    if (semCensura) enviarAoDash("chat:extras", { semCensura: true });
    // 31/10: fez algo reversível — o botão "Desfazer" no rodapé da bolha.
    if (desfazer) enviarAoDash("chat:extras", { desfazer });
    if (memoria) enviarAoDash("chat:extras", { memoria });
    // 22/10: respostas rápidas. Se ela perguntou algo, a linha é de resposta — sem as
    // sugestões de continuação (uma linha só embaixo da bolha).
    const rapidas = rapidasPara(textoFinal, getConfig());
    if (rapidas) enviarAoDash("chat:extras", { rapidas });
    if (deveSugerir(actions, "texto") && !rapidas?.pergunta) {
      sugerirContinuacoes(text, combined).then((sugestoes) => {
        if (sugestoes.length && turnoAtual() === meuToken) enviarAoDash("chat:extras", { sugestoes });
      }).catch(() => { /* sem chips */ });
    }
    state.set("speaking");
    // Bloco 130: a resposta escrita pode ser longa; a caixa de som fala só o começo.
    await speak(paraFala(textoFinal), lerHumor(text));
  } catch (err) {
    if (turnoAtual() !== meuToken) return;
    const msg = err instanceof ElysiumError ? err.spoken : "Tive um problema, mas já voltei ao normal.";
    if (err instanceof ElysiumError) notify("ELYSIUM — Erro", err.message);
    enviarAoDash("chat:error", msg);
  } finally {
    if (turnoAtual() === meuToken) state.set("idle");
  }
}

/** A oferta "Quer que eu monte isso como tela?" que espera o "sim" (15 min). */
let ofertaDeTela: { pergunta: string; resposta: string; em: number } | null = null;
/** A última resposta do chat de texto: o "monta uma tela disso" usa como contexto. */
let ultimaResposta: { pergunta: string; resposta: string } | null = null;

/**
 * Telas inteligentes (Fase 3, 22/10): gera a tela e manda ao dashboard. `comResposta` = veio do
 * "sim" à oferta: a tela vai numa bolha nova ("Aqui está como tela."); senão ela entra embaixo da
 * última resposta. O dashboard mostra o esqueleto ao receber `gerando`.
 */
async function telaNoChat(pergunta: string, resposta: string, comResposta = false, origem: "oferta" | "pedido" | "auto" = "auto"): Promise<string | null> {
  const gerador = geradorDeTelas();
  if (!gerador) {
    if (comResposta) enviarAoDash("chat:reply", "As telas precisam do Hermes ligado. Quer que eu responda em texto?");
    return null;
  }
  const id = `tela-${Date.now().toString(36)}`;
  const controle = new AbortController();
  telasEmCurso.set(id, controle);
  if (comResposta) enviarAoDash("chat:reply", "Montando a tela…");
  enviarAoDash("chat:tela", { id, estado: "gerando" });
  try {
    const tela = await gerarTela(pergunta, resposta, gerador, undefined, controle.signal);
    if (tela) {
      console.log(`[UI] tela em ${tela.ms} ms (${tela.tentativas}ª, ${tela.modelo ?? tela.provedor})`);
      enviarAoDash("chat:tela", { id, programa: tela.programa, ...(comResposta ? { texto: origem === "oferta" ? "Pronto, aqui está como tela." : "Pronto, aqui está a tela." } : {}) });
      return tela.programa;
    }
    const cancelada = controle.signal.aborted;
    const texto = !comResposta ? undefined
      : cancelada ? "Tela cancelada."
      : origem === "oferta" ? "Não consegui montar a tela agora. A resposta em texto continua aí em cima."
      : "Não consegui montar a tela agora. Quer que eu responda em texto?";
    // Falhou (não cancelada): pergunta e resposta vão junto, para o "Tentar de novo" do chat.
    enviarAoDash("chat:tela", { id, falhou: true, ...(cancelada ? { cancelada: true } : { pergunta, resposta }), ...(texto ? { texto } : {}) });
    return null;
  } finally {
    telasEmCurso.delete(id);
  }
}

// Toda tela pronta (chat, "Ver como tela" e celular): o texto dela fica no contexto da Ely.
quandoMostrarTela((programa) => registrarTelaMostrada(textoDaTela(programa)));

/** Telas sendo geradas agora (chat e "Ver como tela"): o Cancelar do esqueleto aborta pelo id. */
const telasEmCurso = new Map<string, AbortController>();
// 31/10: o que foi feito numa tela do chat (checklist marcado, respostas do quiz) — contexto da Ely.
ipcMain.on("ui:estado", (_e, programa: unknown, vars: unknown) => {
  if (typeof programa !== "string" || programa.length > 60_000 || !vars || typeof vars !== "object") return;
  registrarEstadoDaTela(estadoEmTexto(programa, vars as Record<string, unknown>), textoDaTela(programa));
});
ipcMain.on("ui:cancelar", (_e, id: unknown) => {
  if (typeof id === "string") telasEmCurso.get(id)?.abort();
});

// "Ver como tela" (rodapé da resposta): gera e devolve; o dashboard põe embaixo daquela bolha.
ipcMain.handle("ui:ver-como-tela", async (_e, pergunta: unknown, resposta: unknown, id: unknown) => {
  if (typeof resposta !== "string" || !resposta.trim()) return null;
  if (getConfig().respostasInterativas === "nunca") return null;
  const gerador = geradorDeTelas();
  if (!gerador) return { erro: "As telas precisam do Hermes ligado." };
  const controle = new AbortController();
  const chave = typeof id === "string" && id.length <= 40 ? id : null;
  if (chave) telasEmCurso.set(chave, controle);
  try {
    const tela = await gerarTela(typeof pergunta === "string" ? pergunta.slice(0, 2000) : "", resposta.slice(0, 6000), gerador, undefined, controle.signal);
    if (tela) return { programa: tela.programa };
    return controle.signal.aborted ? { cancelada: true } : { erro: "Não consegui montar a tela agora." };
  } finally {
    if (chave) telasEmCurso.delete(chave);
  }
});

// Fotos e rotas pedidas pela tela (ela não sai para a internet). Mesmo proxy do servidor.
ipcMain.handle("ui:pedido", async (_e, rota: unknown, params: unknown) => {
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  if (getConfig().telasComInternet === false) return { erro: "desligado nos Ajustes" };
  try {
    if (rota === "fotos") return { dados: { fotos: await proxyDoApp().fotos(String(p.q ?? "")) } };
    if (rota === "rota") return { dados: { points: await proxyDoApp().rota(String(p.coords ?? "")) } };
    return { erro: "rota desconhecida" };
  } catch (e) {
    return { erro: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
});

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
// 24/10: a chave do Gemini (Google AI Studio). Nunca volta para a tela: só o status e o modelo.
ipcMain.handle("config:set-gemini-key", (_e, chave: unknown) => {
  if (typeof chave !== "string" || chave.length > 200) return { ok: false };
  setGeminiKey(chave.trim());
  reiniciarHermesPorModelo();
  return { ok: true };
});
ipcMain.handle("config:gemini-status", () => ({ temChave: !!getGeminiKey(), modelo: getConfig().geminiModelo || null }));
// 26/10: Ajustes → Voz — a amostra toca a voz escolhida agora (já gravada pelo change do campo) e
// a cota do dia (uso por modelo, do app e do Hermes; limites aprendidos dos 429).
ipcMain.handle("voz:amostra", () => { interruptAll(); void speak("Oi! Eu sou a Ely. Assim fica a minha voz — gostou?"); return true; });
ipcMain.handle("gemini:cota", () => resumoDaCota());

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
/**
 * 30/10: imagem de fundo do dashboard. O dono escolhe no seletor do Windows; a cópia vai para
 * a pasta do app (`fundo/fundo-<hora>.<ext>`) e as anteriores são apagadas. Devolve o
 * endereço `file:` da cópia, que o `patchDeConfigSeguro` aceita.
 */
ipcMain.handle("fundo:escolher", async () => {
  const r = await dialog.showOpenDialog({
    title: "Imagem de fundo",
    properties: ["openFile"],
    filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
  });
  const origem = r.filePaths[0];
  if (r.canceled || !origem) return null;
  const ext = path.extname(origem).toLowerCase().replace(".jpeg", ".jpg");
  if (![".png", ".jpg", ".webp", ".gif", ".bmp"].includes(ext)) return null;
  const pasta = path.join(app.getPath("userData"), "fundo");
  fs.mkdirSync(pasta, { recursive: true });
  for (const velho of fs.readdirSync(pasta)) {
    try { fs.unlinkSync(path.join(pasta, velho)); } catch { /* em uso: fica para a próxima */ }
  }
  const destino = path.join(pasta, `fundo-${Date.now()}${ext}`);
  fs.copyFileSync(origem, destino);
  return pathToFileURL(destino).href;
});

ipcMain.handle("config:set-all", async (_e, patchBruto: Partial<AppConfig>) => aplicarConfig(patchBruto));
// 12/11: os Ajustes do PC mudados pelo celular passam por aqui também (rpc.ts, `pc.ajustes.set`).
definirAplicadorDeConfig(aplicarConfig);
// 13/11: o que ela está fazendo agora ("Pesquisando…", "Abrindo o Chrome…"), na bolota.
aoMudarEstadoAoVivo((t) => enviarAoFlutuante("flutuante:status", t));

/** Grava um patch de config e aplica os efeitos (atalhos, Hermes, palavra, início com o Windows). */
async function aplicarConfig(patchBruto: Partial<AppConfig>): Promise<void> {
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

  // 12/11: o atalho da Ely flutuante (Ctrl+Espaço) e o tema dela.
  if (patch.atalhoFlutuante !== undefined && patch.atalhoFlutuante !== prev.atalhoFlutuante) {
    try { if (prev.atalhoFlutuante) globalShortcut.unregister(prev.atalhoFlutuante); } catch { /* não estava registrado */ }
    if (patch.atalhoFlutuante && !globalShortcut.register(patch.atalhoFlutuante, alternarFlutuante)) {
      notify("ELYSIUM — Aviso", `Atalho "${patch.atalhoFlutuante}" não pôde ser registrado.`);
    }
  }
  if (patch.theme !== undefined) enviarAoFlutuante("flutuante:tema", patch.theme);
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
}

ipcMain.handle("config:reset-defaults", () => {
  setOverride({
    shortcut: "Control+Shift+J",
    autoLaunch: true,
    silenceMs: 2500,
    maxRecordMs: 120000,
    sttModel: "whisper-large-v3",
    // 31/10: os padrões de verdade (o llama-3.3-70b foi aposentado pela Groq).
    brainModel: DEFAULTS.brainModel,
    routerModel: DEFAULTS.routerModel,
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

// 21/10: arquivo arrastado/escolhido no dashboard vai pelo CAMINHO (cópia em disco, até 500 MB),
// não por base64 — vídeo e PDF grande cabem. Só arquivo comum; pasta e o resto, recusa.
ipcMain.handle("mailbox:send-path", async (_e, texto: unknown, caminho: unknown, sessionId?: unknown) => {
  if (typeof caminho !== "string" || !path.isAbsolute(caminho)) throw new Error("caminho inválido");
  const r = await addFileMessage("pc", caminho, { text: typeof texto === "string" ? texto.trim() || null : null, sessionId: typeof sessionId === "string" ? sessionId : null });
  broadcastMailboxEvent("toMobile", r.id);
  void sendPush("mailbox", "Chegou um arquivo do PC", r.nome, { tipo: "caixa", id: r.id }).catch(() => { /* best-effort */ });
  return { id: r.id };
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
  let bruto: unknown;
  try { bruto = JSON.parse(fs.readFileSync(escolha.filePaths[0], "utf8")); }
  catch { throw new Error("Esse arquivo não é um backup do ELYSIUM (JSON inválido)."); }
  const b = lerBackup(bruto);
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

function acordarPorVoz(o: Ouvido): void {
  if (!hasApiKey()) return;
  // Barge-in (fase 12; 19/10): no meio da fala, "Ely"/"Elysium" corta e já começa a ouvir;
  // "para", "chega", "espera" só cortam; e, com a opção de fone, qualquer fala corta e ouve.
  // `estaFalando()` e não o estado "speaking": com a fala antecipada ela fala ainda em
  // "processing", e antes disso a interrupção simplesmente não acontecia.
  if (estaFalando()) {
    if (o.tipo === "voz") {
      if (!getConfig().interromperComQualquerFala) return;
    } else if (!podeInterromper(o.confianca, falaAtual(), o.texto)) return;
    console.log(`[palavra] interrompendo a fala (${o.tipo}).`);
    interruptAll();
    interromperHermes();
    state.set("idle");
    if (o.tipo !== "parar") startListening().catch((e) => console.error("[palavra] não consegui começar a ouvir:", e));
    return;
  }
  if (o.tipo !== "acordar" || !getConfig().palavraDeAtivacao) return;
  acordadoPorVozEm = Date.now();
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
  // 13/11: o modelo da transcrição local (Parakeet, ~490 MB) baixa sozinho uma vez, sem pressa.
  setTimeout(() => { void garantirModelo(); }, 60_000);
  // 12/11: os "beats" do VoiceStudio (frases curtas já gravadas) — também esquenta o motor na GPU.
  setTimeout(() => { void prepararBeats(path.join(app.getPath("userData"), "beats")).catch(() => {}); }, 8000);

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
  if ((cfg.routerProvider === "ollama" || cfg.chatProvider !== "groq") && (!getGeminiKey() || cfg.ollamaReserva)) void garantirOllama(baseDoOllama());
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
  ligarAvisoDeCota(notify);
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
  // 12/11: Ctrl+Espaço — a Ely flutuante ao lado do cursor (janela já criada, escondida).
  registrarIpcFlutuante({
    digitar: (texto) => { void digitadoNaBolota(texto); },
    confirmar: (id, sim) => {
      // A pergunta de licença do cérebro (Hermes, ferramentas): a pílula responde como se ele falasse.
      if (id === "geral") { void responderPelaPilula(sim); return; }
      const f = confirmacoes.get(id); confirmacoes.delete(id); f?.(sim);
    },
    parar: pararFlutuante,
  });
  criarFlutuante();
  // 14/11: o atalho da bolota lê o teclado (segurar × tocar) pelo host de janelas; sobe ele já,
  // senão o primeiro Ctrl+Espaço esperaria ~1,4 s pela partida do PowerShell.
  setTimeout(() => uiaHost.aquecer(), 5_000);
  if (cfg.atalhoFlutuante && !globalShortcut.register(cfg.atalhoFlutuante, alternarFlutuante)) {
    console.warn(`[flutuante] atalho ${cfg.atalhoFlutuante} ocupado por outro programa`);
    notify("ELYSIUM — Aviso", `O atalho ${cfg.atalhoFlutuante} da Ely flutuante está ocupado. Troque em Configurações.`);
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
  const tratamento = tratamentoSorteado(getConfig().tratamento ?? "");
  // Em desenvolvimento o app reinicia toda hora: falar a cada arranque só incomoda.
  if (app.isPackaged) speak(fraseDeArranque(tratamento, new Date().getHours())).catch(() => { /* best-effort */ });
});

app.on("window-all-closed", () => { /* intentional no-op */ });
