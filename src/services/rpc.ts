/**
 * ELYSIUM RPC — superfície tipada que o Portal (celular) usa para controlar o PC
 * sem passar pelo cérebro Llama.
 *
 * Motivo: até aqui a única porta de comando do mobile era POST /api/command, que joga
 * o texto no LLM. Isso é ótimo pra voz e péssimo pra botão — "matar o processo 4821"
 * não deve depender de o modelo interpretar uma frase. Cada método abaixo é uma
 * chamada determinística, validada e whitelistada.
 *
 * Segurança: métodos marcados `destructive` exigem o header X-Elysium-Confirm, que o
 * app só manda depois de confirmar a identidade do dono por biometria. É uma trava
 * contra chamada acidental/automatizada, não contra um atacante que já tem o token —
 * contra esse, a defesa é o token não vazar e a porta não ser exposta à internet.
 */

import { apagarTarefa, concluirTarefa, criarTarefa, desvincularLembrete, editarTarefa, editarTarefaProxima, estaAtrasada, listarPorFiltro, listarTarefas, obterTarefa, reabrirTarefa } from "./tarefas";
import { createReminderAction, criarLembreteComTarefa, proximaDaRepeticao, reagendarTarefa, reavisarTarefa, rotuloDoPrazo } from "../actions/memoryActions";
import { adiarPara, ehCompromisso, interpretarQuando, interpretarTexto, planejarLembretes, type Adiamento } from "./planoDeLembrete";
import { app, clipboard } from "electron";
import { ACOES_VALIDAS } from "./brain";
import { estadoDoApp } from "./estadoApp";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { getAllLocalIPv4 } from "../main/network";
import { clientesConectados } from "./server";
import { getConfig, setOverride } from "../main/config";
import { aplicarConfigHermes, estadoHermes } from "./hermes/cerebro";

function hostnameOf(): string {
  try { return os.hostname(); } catch { return "PC"; }
}
import {
  getDashboardTelemetry, getTopProcesses, getDiskDetails, killProcess, getRunningApps,
} from "../actions/systemInfo";
import { openApp } from "../actions/openApp";
import { closeApp } from "../actions/closeApp";
import { powerControl, PowerOperation } from "../actions/powerControl";
import { mediaControl, MediaOperation } from "../actions/mediaControl";
import { lerVolume, volumeControl } from "../actions/volumeControl";
import { controlarJanela, listarJanelas } from "../actions/janelas";
import { montarDiagnostico } from "./diagnostico";
import { consertarSaude, verificarSaude } from "./saude";
import { mascarar } from "../main/logArquivo";
import { aceitarSugestao, listarSugestoesDeFato, recusarSugestao } from "./memoryStore";
import { agendaFalada, estadoAgenda, eventosDoDia } from "./agenda";
import { resumoDoDia } from "./resumoDoDia";
import { buscarNasConversas } from "./buscaConversas";
import { estiloValido, MAX_INSTRUCOES } from "./estiloResposta";
import { adicionarNaLista, alternarItem, apagarLista, limparFeitos, listarListas, removerItem, separarItens } from "./listas";
import { apagarHabito, apagarMeta, avancarMeta, listarHabitos, listarMetas, marcarHabito, pausarHabito, resumirHabito, salvarHabito, salvarMeta } from "./habitos";
import { fatosDoDia, montarPainelHoje } from "./hoje";
import { apagarCorrida, apagarTreino, importarTreinos, lerPerfil, marcarTreino, montarPainelCorpo, registrarCorrida, registrarPeso, salvarPerfil, salvarTreino, type PerfilCorpo } from "./corpo";
import { dicaDoCorpo, ideiaDoDia, marcarTeste } from "./ideiasDoDia";
import { revisaoDaSemana } from "./revisaoSemana";
import { cancelarTimer, criarTimer, listarTimers } from "./timers";
import { apagarComando, listarComandos, rodarComando, salvarComando } from "./comandosIa";
import { resumirLink } from "./leitorDeLink";
import { comContexto } from "./contextoComando";
import { comecarFoco, estadoFoco, pararFoco, salvarListaFoco } from "./foco";
import { abrirNoPc, AlvoAbrir, AlvoLimpeza, lerArmazenamento, limpar } from "../actions/armazenamento";
import { aguardarDownloads, estadoAtualizacao, instalarAtualizacaoDesktop, verificarAtualizacoes } from "./atualizacao";
import { captureScreen, listScreens } from "./screenCapture";
import { screenshot } from "../actions/screenshot";
import { inputHost, MouseButton } from "./inputHost";
import { addFact, listFacts, removeFactById, editFact } from "./memoryStore";
import { cancelReminder, createReminder, listAll, ReminderKind } from "./scheduler";
import {
  listarRotinas, salvarRotina, apagarRotina, alternarRotina, executarRotina, proximoDisparo, descreverGatilho,
  entregasPendentes, historicoEntregas, confirmarEntregas, Rotina,
} from "./rotinas";
import { ROTULO_EVENTO } from "./eventos";
import { getPushPrefs, registerToken, setPushPrefs, unregisterToken, PushCategory } from "./push";
import { askAboutImage, askAboutScreen } from "./vision";
import { searchWeb } from "./webSearch";
import { listarSugestoes } from "./sugestoes";
import { bolhasDoChat } from "./perguntas";
import { montarPlano } from "./planoEstudo";
import { comecarPomodoro, pararPomodoro, pomodoroParaCliente, pularFase } from "./pomodoro";
import { apagarCartao, cartoesVencidos, criarCartao, listarCartoes, responderCartao } from "./cartoes";
import { apagarModoMeu, definirModo, listarModos, modoAtivo, modoParaCliente, salvarModoMeu, type ErroModo } from "./modos";
import { climaAgora, motivoDaFalha } from "./clima";
import {
  getAllPresets, getPreset, findPresetKey, savePreset, deletePresetByKey,
} from "./presetsStore";
import { runPreset } from "../actions/runPreset";
import * as spotify from "./spotify";
import { apagarEpisodio, apagarTodosEpisodios, definirAnonimo, listarEpisodios, modoAnonimo } from "./episodios";
import { marcarAcompanhado, pendentesDeAcompanhamento } from "./acompanhamento";
import { adiarTarefaPor, concluirTarefaCompleta } from "./operacoes";
import { registrarFalaDaEly } from "./brain";
import { aplicarDespejo, dataValida, interpretarFala, validarItens } from "./despejo";
import {
  listSessions as listChatSessions, getSession as getChatSession,
  mergeSession as mergeChatSession, toggleFavorite as toggleChatFavorite,
  deleteSession as deleteChatSession, renameSession as renameChatSession,
  listDeletedIds as listDeletedChatIds, clearDeleted as clearDeletedChats,
  ChatSession,
} from "./chatSessionsStore";
import {
  clearDeletedMailboxSessions,
  createMailboxSession,
  deleteMailboxMessage,
  deleteMailboxSession,
  listDeletedMailboxSessionIds,
  listMailboxSessions,
  MailboxSession,
  mergeMailboxSession,
  renameMailboxSession,
  setActiveMailboxSession,
  toggleMailboxSessionFavorite,
} from "./mailboxStore";


/** Lista de ids para os `ackDeleted`: aceita só strings, e no máximo um lote razoável. */
function requireIdList(params: Record<string, unknown>, key: string): string[] {
  const raw = params[key];
  if (!Array.isArray(raw)) throw new RpcError(400, `param "${key}" deve ser uma lista de ids`);
  if (raw.length > 500) throw new RpcError(400, `param "${key}" tem itens demais (máx 500)`);
  const ids = raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  return ids;
}

/** Erro com status HTTP embutido, para o servidor traduzir direto na resposta. */
export class RpcError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "RpcError";
  }
}

export interface RpcContext {
  /** true quando o cliente mandou X-Elysium-Confirm (biometria já validada no celular). */
  confirmed: boolean;
}

type Handler = (params: Record<string, unknown>, ctx: RpcContext) => Promise<unknown>;

interface MethodDef {
  handler: Handler;
  /** Exige confirmação biométrica do lado do celular. */
  destructive?: boolean;
}

// ── presets e rotinas: o que não pode entrar sem confirmação ───────────────────

/**
 * 🔴 08/10. A trava de destrutivos (header X-Elysium-Confirm) era contornável: `presets.save`
 * aceitava qualquer ação — inclusive `power_control` — sem validar nada, e `presets.run`
 * executava sem confirmação. Agora cada ação precisa ser uma ação conhecida do cérebro, e um
 * preset com ação destrutiva só é gravado com a confirmação. Rodar depois não pede de novo:
 * quem confirmou ao criar sabia o que o preset faz.
 */
const ACOES_DESTRUTIVAS = new Set(["power_control", "delete_preset", "forget", "cancel_reminder", "close_app"]);
export const TEXTO_DESTRUTIVO = /\b(deslig|reinici|hibern|suspend|deslog|apag|exclu|format|esvazi|limp[ae] a lixeira)/i;

export function validarAcoesDePreset(acoes: unknown[], confirmado: boolean): void {
  if (acoes.length > 20) throw new RpcError(400, "preset com ações demais (máx 20)");
  for (const a of acoes) {
    const tipo = a && typeof a === "object" ? (a as { action?: unknown }).action : undefined;
    if (typeof tipo !== "string" || !ACOES_VALIDAS.has(tipo)) {
      throw new RpcError(400, `ação inválida no preset: ${String(tipo).slice(0, 40)}`);
    }
    if (ACOES_DESTRUTIVAS.has(tipo) && !confirmado) {
      throw new RpcError(403, `preset com "${tipo}" exige confirmação (header X-Elysium-Confirm)`);
    }
  }
}

// ── validadores de params ─────────────────────────────────────────────────────

function requireString(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new RpcError(400, `param "${key}" é obrigatório e deve ser uma string não vazia`);
  }
  return v.trim();
}

function requireInt(params: Record<string, unknown>, key: string): number {
  const v = params[key];
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw new RpcError(400, `param "${key}" é obrigatório e deve ser um inteiro`);
  }
  return v;
}

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new RpcError(400, `param "${key}" deve ser uma string`);
  return v;
}

function optionalInt(params: Record<string, unknown>, key: string): number | undefined {
  const v = params[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw new RpcError(400, `param "${key}" deve ser um inteiro`);
  }
  return v;
}

function requireNumber(params: Record<string, unknown>, key: string): number {
  const v = params[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new RpcError(400, `param "${key}" é obrigatório e deve ser um número`);
  }
  return v;
}

function requireButton(params: Record<string, unknown>): MouseButton {
  // `button` é opcional em toda a família input.*: esquerdo é o caso esmagadoramente
  // comum e exigi-lo só engordaria cada payload de toque.
  const v = params["button"];
  if (v === undefined || v === null) return "left";
  if (v !== "left" && v !== "right" && v !== "middle") {
    throw new RpcError(400, 'param "button" deve ser left, right ou middle');
  }
  return v;
}

function requireEnum<T extends string>(
  params: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const v = requireString(params, key);
  if (!(allowed as readonly string[]).includes(v)) {
    throw new RpcError(400, `param "${key}" deve ser um de: ${allowed.join(", ")}`);
  }
  return v as T;
}

// ── apps.json ─────────────────────────────────────────────────────────────────

interface AppEntry { key: string; command: string }

/**
 * Lê o mesmo dist/config/apps.json que openApp.ts resolve. Sem cache: o arquivo é
 * pequeno e o usuário pode editá-lo com o app rodando (documentado no README).
 */
function listApps(): AppEntry[] {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "../config/apps.json"), "utf-8");
    const map = JSON.parse(raw) as Record<string, string>;
    return Object.entries(map)
      .map(([key, command]) => ({ key, command }))
      .sort((a, b) => a.key.localeCompare(b.key, "pt-BR"));
  } catch {
    return [];
  }
}

// ── tabela de métodos ─────────────────────────────────────────────────────────

const ERROS_DO_MODO: Record<ErroModo, string> = {
  nome: "o nome precisa de pelo menos 2 letras",
  instrucao: "descreva o que o modo faz (pelo menos 10 caracteres)",
  reservado: "esse nome já é de outra coisa (foco, anônimo ou um preset)",
  existe: "já existe um modo com esse nome",
  cheio: "limite de 12 modos criados",
};

const METHODS: Record<string, MethodDef> = {
  // — sistema —
  "system.telemetry": {
    handler: async () => getDashboardTelemetry(),
  },
  "system.processes": {
    handler: async () => ({ processes: await getTopProcesses() }),
  },
  "system.disks": {
    handler: async () => ({ disks: await getDiskDetails() }),
  },
  "system.killProcess": {
    destructive: true,
    handler: async (params) => {
      const pid = requireInt(params, "pid");
      if (pid <= 0) throw new RpcError(400, "pid inválido");
      await killProcess(pid);
      return { ok: true };
    },
  },

  // — apps —
  "apps.list": {
    handler: async () => ({ apps: listApps() }),
  },
  // Processos COM JANELA — o que "aberto" quer dizer para quem olha a tela. Diferente de
  // `system.processes`, que é o top-15 por CPU e deixava o Chrome ocioso de fora.
  "apps.running": {
    handler: async () => ({ apps: await getRunningApps() }),
  },
  "apps.open": {
    handler: async (params) => {
      const name = requireString(params, "name");
      return { ok: true, message: await openApp(name) };
    },
  },
  "apps.close": {
    destructive: true,
    handler: async (params) => {
      const name = requireString(params, "name");
      return { ok: true, message: await closeApp(name) };
    },
  },

  // — área de transferência —
  "clipboard.get": {
    handler: async () => ({ text: clipboard.readText() }),
  },
  "clipboard.set": {
    handler: async (params) => {
      const text = optionalString(params, "text") ?? "";
      clipboard.writeText(text);
      return { ok: true, length: text.length };
    },
  },

  // — energia —
  // Todos destrutivos, inclusive `cancel`: a confirmação é o que impede um toque
  // acidental no celular de derrubar o PC com trabalho aberto.
  "power.control": {
    destructive: true,
    handler: async (params) => {
      const operation = requireEnum<PowerOperation>(
        params, "operation", ["shutdown", "restart", "sleep", "lock", "cancel"],
      );
      const delaySeconds = optionalInt(params, "delaySeconds");
      if (delaySeconds !== undefined && (delaySeconds < 0 || delaySeconds > 86400)) {
        throw new RpcError(400, "delaySeconds deve estar entre 0 e 86400");
      }
      return { ok: true, message: await powerControl(operation, delaySeconds) };
    },
  },

  // — mídia e volume —
  "media.control": {
    handler: async (params) => {
      const operation = requireEnum<MediaOperation>(
        params, "operation", ["play", "pause", "skip", "previous", "volume_up", "volume_down"],
      );
      return { ok: true, message: await mediaControl(operation) };
    },
  },
  // — espelhamento de tela —
  "screen.list": {
    handler: async () => ({ screens: await listScreens() }),
  },
  "screen.capture": {
    handler: async (params) => captureScreen({
      sourceId: optionalString(params, "sourceId"),
      maxWidth: optionalInt(params, "maxWidth"),
      quality:  optionalInt(params, "quality"),
    }),
  },
  // `screen.capture` devolve o quadro e não guarda nada — é o espelho. Este salva um PNG
  // na Área de Trabalho e abre, que é o que "tirar um print" significa para quem pede.
  // O botão da aba Programas chamava `screen.capture` e jogava a imagem fora.
  "screen.screenshot": {
    handler: async (params) => ({ ok: true, message: await screenshot(optionalString(params, "filename")) }),
  },

  // — entrada remota (mouse e teclado) —
  // Não marcados como destrutivos: exigir biometria a cada movimento de cursor
  // tornaria o trackpad inutilizável. A trava fica na entrada da tela, no app.
  // Chamado quando a tela de trackpad abre: sobe o host e paga o custo de compilar
  // o C# (~480 ms, uma vez) antes do primeiro toque, em vez de durante.
  "input.ping": {
    handler: async () => {
      await inputHost.ping();
      return { ok: true };
    },
  },
  "input.move": {
    handler: async (params) => {
      await inputHost.move(requireNumber(params, "dx"), requireNumber(params, "dy"));
      return { ok: true };
    },
  },
  "input.click": {
    handler: async (params) => {
      await inputHost.click(requireButton(params));
      return { ok: true };
    },
  },
  "input.doubleClick": {
    handler: async (params) => {
      await inputHost.doubleClick(requireButton(params));
      return { ok: true };
    },
  },
  "input.buttonDown": {
    handler: async (params) => {
      await inputHost.buttonDown(requireButton(params));
      return { ok: true };
    },
  },
  "input.buttonUp": {
    handler: async (params) => {
      await inputHost.buttonUp(requireButton(params));
      return { ok: true };
    },
  },
  "input.scroll": {
    handler: async (params) => {
      await inputHost.scroll(requireNumber(params, "notches"));
      return { ok: true };
    },
  },
  "input.type": {
    handler: async (params) => {
      const text = requireString(params, "text");
      if (text.length > 5000) throw new RpcError(400, "texto longo demais (máx 5000 caracteres)");
      await inputHost.type(text);
      return { ok: true };
    },
  },
  "input.key": {
    handler: async (params) => {
      const sequence = requireString(params, "sequence");
      if (sequence.length > 200) throw new RpcError(400, "sequência longa demais");
      await inputHost.key(sequence);
      return { ok: true };
    },
  },

  // — Spotify —
  "spotify.status": {
    handler: async () => ({ connected: spotify.isConnected() }),
  },
  "spotify.login": {
    // Abre o navegador NO PC. Pelo celular isso parece não fazer nada, então o app
    // precisa explicar que a autorização acontece na tela do computador.
    handler: async () => {
      spotify.beginLogin();
      return { ok: true, message: "Abri o login do Spotify no navegador do PC." };
    },
  },
  "spotify.logout": {
    handler: async () => {
      spotify.disconnect();
      return { ok: true };
    },
  },
  "spotify.nowPlaying": {
    handler: async () => ({ nowPlaying: await spotify.getNowPlaying() }),
  },
  "spotify.command": {
    handler: async (params) => {
      const op = requireEnum(params, "operation", ["play", "pause", "next", "previous"] as const);
      if (op === "play") await spotify.play();
      else if (op === "pause") await spotify.pause();
      else if (op === "next") await spotify.next();
      else await spotify.previous();
      return { ok: true };
    },
  },
  "spotify.volume": {
    handler: async (params) => {
      const percent = requireNumber(params, "percent");
      if (percent < 0 || percent > 100) throw new RpcError(400, "percent deve estar entre 0 e 100");
      await spotify.setVolume(percent);
      return { ok: true };
    },
  },
  "spotify.seek": {
    handler: async (params) => {
      await spotify.seek(requireNumber(params, "positionMs"));
      return { ok: true };
    },
  },
  "spotify.playSearch": {
    handler: async (params) => ({ playing: await spotify.playSearch(requireString(params, "query")) }),
  },
  "spotify.shuffle": {
    handler: async (params) => {
      const on = params["on"];
      if (typeof on !== "boolean") throw new RpcError(400, 'param "on" deve ser booleano');
      await spotify.setShuffle(on);
      return { ok: true };
    },
  },
  "spotify.repeat": {
    handler: async (params) => {
      await spotify.setRepeat(requireEnum(params, "state", ["off", "track", "context"] as const));
      return { ok: true };
    },
  },

  // — visão e busca —
  "vision.ask": {
    handler: async (params) => {
      const imageBase64 = requireString(params, "imageBase64");
      // ~8 MB de base64. Acima disso a chamada estoura o limite do modelo de qualquer
      // jeito, e o erro daqui é mais claro que o da API.
      if (imageBase64.length > 8_000_000) throw new RpcError(400, "imagem grande demais");
      const question = optionalString(params, "question") ?? "";
      return { answer: await askAboutImage(imageBase64, question) };
    },
  },
  "vision.screen": {
    handler: async (params) => ({
      answer: await askAboutScreen(optionalString(params, "question") ?? ""),
    }),
  },
  "web.search": {
    handler: async (params) => ({ answer: await searchWeb(requireString(params, "query")) }),
  },

  /**
   * Endereços atuais do PC.
   *
   * Existe porque o celular só aprendia os endereços no momento do pareamento. Instalar
   * o túnel depois disso não adiantava nada: o app nunca ficava sabendo do endereço
   * novo e continuava só funcionando em casa, obrigando a reparear. Agora ele reconsulta
   * sempre que está conectado e absorve endereços novos sozinho.
   */
  /**
   * Em que pé está o ELYSIUM no PC (08/10): janela na tela, minimizada ou na bandeja, tela
   * bloqueada, há quanto tempo o PC está ligado e como terminou a sessão anterior.
   */
  "pc.estado": {
    handler: async () => ({ estado: estadoDoApp() }),
  },
  "pairing.endpoints": {
    handler: async () => {
      const endpoints = getAllLocalIPv4();
      return {
        endpoints: endpoints.map(e => e.address),
        // `tunnel` diz ao app se existe caminho de fora; sem nenhum, ele explica por
        // que só funciona em casa em vez de só falhar.
        hasTunnel: endpoints.some(e => e.tunnel),
        hostname: hostnameOf(),
        port: getConfig().serverPort ?? 4200,
        // Quantos clientes estão com o WebSocket aberto agora. O dashboard usa isto para
        // o orbe de conexão; ter token gravado não prova que o celular está por perto.
        conectados: clientesConectados(),
        // O celular usa na saudação (fase 13): o nome mora na config do PC, não no código.
        nome: (getConfig().nomeDoUsuario || "").trim(),
        // Fase 16: como a Ely chama o dono — a saudação do celular usa antes do nome.
        tratamento: (getConfig().tratamento ?? "").trim(),
        // Bloco 128: a faixa do celular só fala em Tailscale se o Zak ligou o acesso remoto.
        acessoRemoto: Boolean(getConfig().acessoRemotoNaSaude),
      };
    },
  },

  // — conversas (sincronização com o celular) —
  // O PC é a autoridade: o app manda o que mudou e depois adota a lista devolvida
  // por `chat.list`. Sem um lado mandando, cada um devolveria ao outro o que ele
  // acabou de podar.
  // 🔴 `deleted` VAI JUNTO DA LISTA, e não numa chamada própria. O celular precisa das
  // duas metades no mesmo instante: o que existe e o que deixou de existir. Em duas
  // chamadas haveria uma janela em que ele adotaria a lista sem saber das exclusões.
  // Um app antigo simplesmente ignora o campo — o contrato continua compatível.
  "chat.list": {
    handler: async () => ({ sessions: listChatSessions(), deleted: listDeletedChatIds() }),
  },
  // O celular confirma que apagou a cópia dele. Só aqui a lápide do PC sai: limpar antes
  // deixaria a exclusão sem registro num aparelho que ainda tem a conversa, e o próximo
  // `chat.save` a ressuscitaria.
  "chat.ackDeleted": {
    handler: async (params) => ({ cleared: clearDeletedChats(requireIdList(params, "ids")) }),
  },
  "chat.rename": {
    handler: async (params) => ({
      session: renameChatSession(requireString(params, "id"), requireString(params, "title")),
    }),
  },
  "chat.get": {
    handler: async (params) => ({ session: getChatSession(requireString(params, "id")) }),
  },
  "chat.save": {
    handler: async (params) => {
      const raw = params["session"];
      if (!raw || typeof raw !== "object") {
        throw new RpcError(400, 'param "session" é obrigatório e deve ser um objeto');
      }
      const s = raw as Partial<ChatSession>;
      if (typeof s.id !== "string" || !s.id) throw new RpcError(400, "session.id é obrigatório");
      if (!Array.isArray(s.messages)) throw new RpcError(400, "session.messages deve ser uma lista");
      if (s.messages.length > 500) throw new RpcError(400, "conversa longa demais (máx 500 mensagens)");

      return {
        session: mergeChatSession({
          id: s.id,
          title: typeof s.title === "string" ? s.title : "",
          createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
          updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : Date.now(),
          favorite: !!s.favorite,
          messages: s.messages as ChatSession["messages"],
        }),
      };
    },
  },
  "chat.favorite": {
    handler: async (params) => ({ favorite: toggleChatFavorite(requireString(params, "id")) }),
  },
  // 08/10: apagar conversa, memória, tarefa e comando de IA também pede confirmação — no
  // celular a pergunta já existia na tela; no PC o diálogo do rpcBridge passa a valer.
  "chat.delete": {
    destructive: true,
    handler: async (params) => ({ deleted: deleteChatSession(requireString(params, "id")) }),
  },


  // — conversas do lado PC (a Caixa) —
  //
  // Mesmo desenho das conversas da IA logo acima: o celular empurra o que mudou, o PC
  // aplica a retencao e devolve a lista, o celular adota o resultado. O que muda e que
  // aqui as MENSAGENS ja moram no PC (elas chegam pelo POST /api/mailbox/messages);
  // o que sincroniza e so a metade de metadados das conversas.
  "mailbox.sessions.list": {
    handler: async () => ({
      sessions: listMailboxSessions(),
      deleted: listDeletedMailboxSessionIds(),
    }),
  },
  "mailbox.sessions.ackDeleted": {
    handler: async (params) => ({
      cleared: clearDeletedMailboxSessions(requireIdList(params, "ids")),
    }),
  },
  "mailbox.sessions.create": {
    handler: async (params) => ({ session: createMailboxSession(optionalString(params, "title")) }),
  },
  "mailbox.sessions.rename": {
    handler: async (params) => ({
      session: renameMailboxSession(requireString(params, "id"), requireString(params, "title")),
    }),
  },
  "mailbox.sessions.favorite": {
    handler: async (params) => ({ favorite: toggleMailboxSessionFavorite(requireString(params, "id")) }),
  },
  "mailbox.sessions.open": {
    handler: async (params) => ({ ok: setActiveMailboxSession(requireString(params, "id")) }),
  },
  "mailbox.sessions.save": {
    handler: async (params) => {
      const raw = params["session"];
      if (!raw || typeof raw !== "object") {
        throw new RpcError(400, 'param "session" e obrigatorio e deve ser um objeto');
      }
      const s = raw as Partial<MailboxSession>;
      if (typeof s.id !== "string" || !s.id) throw new RpcError(400, "session.id e obrigatorio");
      if (s.title !== undefined && typeof s.title !== "string") {
        throw new RpcError(400, "session.title deve ser uma string");
      }
      return {
        session: mergeMailboxSession({
          id: s.id,
          title: typeof s.title === "string" ? s.title.slice(0, 60) : "",
          createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
          updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : Date.now(),
          favorite: !!s.favorite,
        }),
      };
    },
  },
  // 🔴 DESTRUTIVOS. Apagar conversa leva junto os recados e os anexos em disco, e nao
  // tem desfazer — entra na mesma trava dos outros destrutivos (header X-Elysium-Confirm,
  // biometria validada no celular). O §16 registrava a falta deste DELETE como C15.
  "mailbox.sessions.delete": {
    destructive: true,
    handler: async (params) => ({ deleted: deleteMailboxSession(requireString(params, "id")) }),
  },
  "mailbox.messages.delete": {
    destructive: true,
    handler: async (params) => ({ deleted: deleteMailboxMessage(requireString(params, "id")) }),
  },
  // — memória de longo prazo —
  "memory.list": {
    handler: async () => ({ facts: listFacts() }),
  },
  "memory.add": {
    handler: async (params) => {
      const { fact, created } = addFact(requireString(params, "text"));
      return { fact, created };
    },
  },
  "memory.edit": {
    handler: async (params) => {
      const f = editFact(requireString(params, "id"), requireString(params, "text"));
      if (!f) throw new RpcError(404, "fato não encontrado");
      return { fact: f };
    },
  },
  "memory.remove": {
    destructive: true,
    handler: async (params) => ({ removed: removeFactById(requireString(params, "id")) }),
  },

  // — sugestões da tela Início —
  //
  // Um método só, e ele serve os dois lados: o dashboard e o celular recebem exatamente
  // as mesmas bolhas, sorteadas no mesmo lugar. Fosse cada lado montar as suas, seriam
  // duas heurísticas para manter em par.
  "suggestions.list": {
    handler: async () => ({ suggestions: await listarSugestoes() }),
  },

  // — perguntas de partida do chat —
  //
  // Sorteadas no mesmo lugar que as do desktop. Fosse cada lado montar as suas, seriam
  // duas heurísticas de frequência para manter em par — e só o desktop vê o que você
  // pergunta, porque é ele que fala com o cérebro.
  "chat.starters": {
    handler: async () => ({ starters: bolhasDoChat(4) }),
  },

  // — clima —
  "weather.now": {
    handler: async () => {
      const clima = await climaAgora();
      // O motivo vai junto para o card distinguir "você não definiu a cidade" de "a
      // consulta falhou" — duas situações com soluções bem diferentes.
      return clima ?? { erro: motivoDaFalha() ?? "sem-cidade" };
    },
  },

  // — presets —
  //
  // O `presetsStore` existia desde o início e nunca foi exposto aqui. Sem isto, a tela de
  // presets do celular só tinha um caminho: montar a frase "executa o preset X" e mandar
  // para o LLM em /api/command — lento e não-determinístico para um comando já conhecido.
  "presets.list": {
    handler: async () => ({
      presets: Object.entries(getAllPresets()).map(([name, p]) => ({
        name, description: p.description, icon: p.icon, actions: p.actions.length,
      })),
    }),
  },
  "presets.run": {
    handler: async (params) => {
      const nome = requireString(params, "name");
      const preset = getPreset(nome);
      if (!preset) throw new RpcError(404, `não encontrei o preset "${nome}"`);
      const reply = await runPreset(nome);
      return { ran: findPresetKey(nome), reply };
    },
  },
  "presets.save": {
    handler: async (params, ctx) => {
      const nome = requireString(params, "name");
      const acoes = params?.actions;
      if (!Array.isArray(acoes) || !acoes.length) {
        throw new RpcError(400, 'param "actions" deve ser uma lista não vazia');
      }
      validarAcoesDePreset(acoes, ctx.confirmed);
      savePreset(nome, {
        description: optionalString(params, "description") ?? nome,
        icon: optionalString(params, "icon"),
        actions: acoes as never,
      });
      return { saved: nome };
    },
  },
  "presets.delete": {
    destructive: true,
    handler: async (params) => {
      const chave = findPresetKey(requireString(params, "name"));
      if (!chave) throw new RpcError(404, "preset não encontrado");
      deletePresetByKey(chave);
      return { deleted: chave };
    },
  },

  // — lembretes —
  "reminders.list": {
    handler: async () => ({ reminders: listAll() }),
  },
  "reminders.create": {
    handler: async (params) => {
      const text = requireString(params, "text");
      const dueAt = requireNumber(params, "dueAt");
      const kind = (optionalString(params, "kind") ?? "once") as ReminderKind;
      if (kind !== "once" && kind !== "weekly") {
        throw new RpcError(400, 'param "kind" deve ser once ou weekly');
      }
      if (kind === "once" && dueAt <= Date.now()) {
        throw new RpcError(400, "dueAt já passou");
      }
      // De uma vez: o mesmo planejador da voz e do Hoje (véspera para compromisso, tarefa na
      // lista) — antes este caminho criava só o aviso cru (08/10).
      if (kind === "once") {
        const d = new Date(dueAt);
        const p = (n: number) => String(n).padStart(2, "0");
        const r = criarLembreteComTarefa(text, `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`, false, false, { usarPedido: false });
        if (!r.ok) throw new RpcError(400, r.mensagem);
        const ids = r.tarefa?.lembreteIds ?? [];
        const principal = listAll().find(x => x.id === ids[ids.length - 1]);
        return { reminder: principal ?? null, mensagem: r.mensagem };
      }
      const reminder = createReminder({
        text,
        dueAt,
        kind,
        weekday: kind === "weekly" ? new Date(dueAt).getDay() : undefined,
      });
      return { reminder };
    },
  },
  "reminders.cancel": {
    handler: async (params) => {
      const id = requireString(params, "id");
      const cancelled = cancelReminder(id);
      if (cancelled) desvincularLembrete(id);
      return { cancelled };
    },
  },

  // — rotinas (automações agendadas) e entregas para o celular — bloco 68 —
  "rotinas.list": {
    handler: async () => ({
      rotinas: listarRotinas().map(r => ({ ...r, proxima: proximoDisparo(r), quando: descreverGatilho(r) })),
      // Os gatilhos possíveis, com rótulo, para o formulário do celular não hardcodar.
      eventos: Object.entries(ROTULO_EVENTO).map(([id, rotulo]) => ({ id, rotulo })),
    }),
  },
  "rotinas.save": {
    handler: async (params, ctx) => {
      // Rotina que desliga/reinicia o PC roda sozinha depois, sem ninguém olhando: criar uma
      // pede a mesma confirmação de desligar agora (08/10).
      if (TEXTO_DESTRUTIVO.test(requireString(params, "texto")) && !ctx.confirmed) {
        throw new RpcError(403, "rotina que desliga, reinicia ou apaga exige confirmação (header X-Elysium-Confirm)");
      }
      const dias = Array.isArray(params.dias) ? (params.dias as unknown[]).map(Number) : [];
      const entregar = Array.isArray(params.entregar) ? (params.entregar as string[]) : ["pc", "celular"];
      const rotina = salvarRotina({
        id: optionalString(params, "id"),
        nome: requireString(params, "nome"),
        texto: requireString(params, "texto"),
        hora: requireString(params, "hora"),
        dias,
        entregar: entregar as Rotina["entregar"],
        falar: params.falar === true,
        ativa: typeof params.ativa === "boolean" ? params.ativa : undefined,
        gatilho: params.gatilho as Rotina["gatilho"],
        condicao: optionalString(params, "condicao"),
      });
      return { rotina: { ...rotina, proxima: proximoDisparo(rotina), quando: descreverGatilho(rotina) } };
    },
  },
  "rotinas.delete": {
    destructive: true,
    handler: async (params) => ({ deleted: apagarRotina(requireString(params, "id")) }),
  },
  "rotinas.toggle": {
    handler: async (params) => {
      const r = alternarRotina(requireString(params, "id"), typeof params.ativa === "boolean" ? params.ativa : undefined);
      if (!r) throw new RpcError(404, "rotina não encontrada");
      return { rotina: { ...r, proxima: proximoDisparo(r), quando: descreverGatilho(r) } };
    },
  },
  "rotinas.run": {
    // "Rodar agora" pula a condição: quem clica quer ver o resultado.
    handler: async (params) => ({ resultado: await executarRotina(requireString(params, "id"), { forcar: true }) }),
  },
  "notify.pending": {
    handler: async () => ({ entregas: entregasPendentes() }),
  },
  "notify.history": {
    handler: async () => ({ entregas: historicoEntregas().slice(0, 40) }),
  },
  "notify.ack": {
    handler: async (params) => {
      const ids = Array.isArray(params.ids) ? (params.ids as unknown[]).map(String) : [];
      return { acked: confirmarEntregas(ids) };
    },
  },

  // — notificações push —
  "push.register": {
    handler: async (params) => ({ added: registerToken(requireString(params, "token")) }),
  },
  "push.unregister": {
    handler: async (params) => ({ removed: unregisterToken(requireString(params, "token")) }),
  },
  "push.getPrefs": {
    handler: async () => {
      // Os tokens não voltam: são identificadores de aparelho e o app não precisa
      // deles de volta pra desenhar a tela de preferências.
      const { tokens, ...rest } = getPushPrefs();
      return { ...rest, deviceCount: tokens.length };
    },
  },
  "push.setPrefs": {
    handler: async (params) => {
      const muted = params["muted"];
      if (muted !== undefined) {
        const allowed: PushCategory[] = ["reminder", "anomaly", "mailbox", "pc"];
        if (!Array.isArray(muted) || muted.some(m => !allowed.includes(m as PushCategory))) {
          throw new RpcError(400, `param "muted" deve ser uma lista de: ${allowed.join(", ")}`);
        }
      }
      const next = setPushPrefs({
        muted: muted as PushCategory[] | undefined,
        quietFrom: optionalInt(params, "quietFrom"),
        quietTo: optionalInt(params, "quietTo"),
      });
      const { tokens, ...rest } = next;
      return { ...rest, deviceCount: tokens.length };
    },
  },

  // Janelas, uma por uma (bloco 87). `window.control` não é destrutivo: "fechar" é o X da
  // janela (WM_CLOSE) — o programa pergunta se quer salvar — e não matar o processo.
  "window.list": {
    handler: async () => ({ janelas: await listarJanelas() }),
  },
  "window.control": {
    handler: async (params) => {
      const hwnd = requireString(params, "hwnd");
      if (!/^\d{1,20}$/.test(hwnd)) throw new RpcError(400, "hwnd inválido");
      const operacao = requireEnum(params, "operacao", ["focar", "minimizar", "maximizar", "restaurar", "fechar", "so_esta"] as const);
      return { ok: true, message: await controlarJanela(hwnd, operacao) };
    },
  },
  // O que há de novo nas releases (bloco 95). O celular compara `celular.versao` com a
  // versão nativa dele e, se for mais nova, baixa por GET /api/update/apk. Sem caminhos de
  // arquivo: o celular não tem o que fazer com eles.
  "update.status": {
    handler: async (params) => {
      if (params["verificar"] === true) await verificarAtualizacoes();
      // `aguardar`: só para diagnóstico e teste — espera o download terminar antes de responder.
      if (params["aguardar"] === true) await aguardarDownloads();
      const e = estadoAtualizacao();
      const resumo = (x?: { versao: string; notas: string; publicadaEm: string; tamanho: number; pronto: boolean; progresso: number; versionCode?: number }) =>
        x ? { versao: x.versao, notas: x.notas, publicadaEm: x.publicadaEm, tamanho: x.tamanho, pronto: x.pronto, progresso: x.progresso, versionCode: x.versionCode } : null;
      // `semToken` vai junto (07/10): sem ele o celular dizia "versão mais nova" quando o PC
      // nem conseguia perguntar ao GitHub.
      return { pc: e.atual, verificadoEm: e.verificadoEm ?? null, erro: e.erro ?? null, semToken: !!e.semToken, desktop: resumo(e.desktop), celular: resumo(e.celular) };
    },
  },
  // Armazenamento (fase 12): o que ocupa o disco e o que dá para liberar sem risco.
  "storage.info": {
    handler: async (params) => lerArmazenamento(params["forcar"] === true),
  },
  // Esvaziar a Lixeira e limpar a pasta temporária não têm desfazer: destrutivo.
  "storage.clean": {
    destructive: true,
    handler: async (params) => {
      const alvo = requireEnum<AlvoLimpeza>(params, "alvo", ["lixeira", "temp"]);
      return limpar(alvo);
    },
  },
  "storage.open": {
    handler: async (params) => {
      const alvo = requireEnum<AlvoAbrir>(params, "alvo", ["downloads", "temp", "limpeza", "configuracoes", "arquivo"]);
      const nome = typeof params["nome"] === "string" ? params["nome"] : undefined;
      return abrirNoPc(alvo, nome);
    },
  },
  // Instalar no PC a versão já baixada, do celular (bloco 95). Destrutivo: fecha o app por
  // alguns segundos e derruba o que estiver em curso — passa pela biometria como desligar.
  "update.install": {
    destructive: true,
    handler: async () => instalarAtualizacaoDesktop(),
  },
  // Modo foco (fase 12). Começar não é destrutivo: com `fechar`, quem fecha é o foco, e a
  // escolha foi feita por quem começou.
  "foco.status": {
    handler: async () => estadoFoco(),
  },
  "foco.start": {
    handler: async (params) => {
      const minutos = params["minutos"];
      if (typeof minutos !== "number") throw new RpcError(400, "minutos (número) é obrigatório");
      const apps = Array.isArray(params["apps"]) ? (params["apps"] as unknown[]).filter((x): x is string => typeof x === "string") : undefined;
      try { return await comecarFoco({ minutos, apps, fechar: params["fechar"] === true }); }
      catch (e) { throw new RpcError(400, e instanceof Error ? e.message : String(e)); }
    },
  },
  "foco.stop": {
    handler: async () => pararFoco(),
  },
  "foco.lista": {
    handler: async (params) => {
      if (!Array.isArray(params["apps"])) throw new RpcError(400, "apps (lista de nomes) é obrigatório");
      return { apps: salvarListaFoco((params["apps"] as unknown[]).filter((x): x is string => typeof x === "string")) };
    },
  },
  // Google Agenda, só leitura (bloco 120). Conectar a conta é só no PC (abre o navegador lá).
  "agenda.status": {
    handler: async () => estadoAgenda(),
  },
  "agenda.dia": {
    handler: async (params) => {
      const quando = requireEnum<"hoje" | "amanha">(params, "quando", ["hoje", "amanha"]);
      try { return { eventos: await eventosDoDia(quando === "hoje" ? 0 : 1), frase: await agendaFalada(quando) }; }
      catch (e) { throw new RpcError(502, e instanceof Error ? e.message : String(e)); }
    },
  },
  // Listas compartilhadas (bloco 135).
  "listas.list": { handler: async () => ({ listas: listarListas() }) },
  "listas.add": {
    handler: async (params) => {
      const itens = Array.isArray(params["itens"]) ? (params["itens"] as unknown[]).filter((x): x is string => typeof x === "string") : separarItens(requireString(params, "texto"));
      if (!itens.length) throw new RpcError(400, "nada para pôr na lista");
      const r = adicionarNaLista(typeof params["lista"] === "string" ? params["lista"] : "compras", itens.slice(0, 30));
      return { lista: r.lista, adicionados: r.adicionados, repetidos: r.repetidos };
    },
  },
  "listas.toggle": {
    handler: async (params) => {
      const l = alternarItem(requireString(params, "listaId"), requireString(params, "itemId"), params["feito"] === true);
      if (!l) throw new RpcError(404, "lista ou item não existe");
      return { lista: l };
    },
  },
  "listas.remove": {
    handler: async (params) => {
      const l = removerItem(requireString(params, "listaId"), requireString(params, "itemId"));
      if (!l) throw new RpcError(404, "lista não existe");
      return { lista: l };
    },
  },
  "listas.clearDone": { handler: async (params) => ({ removidos: limparFeitos(requireString(params, "lista")) }) },
  "listas.delete": { destructive: true, handler: async (params) => ({ ok: apagarLista(requireString(params, "listaId")) }) },
  // Tarefas (fase 17): os lembretes viram lista de afazeres, com ressalva ao concluir.
  "tarefas.list": {
    handler: async (params) => {
      const f = params["filtro"];
      // Sem filtro: a lista do Hoje (pendentes + feitas hoje), como sempre.
      return { tarefas: f === "abertas" || f === "feitas" || f === "todas" ? listarPorFiltro(f) : listarTarefas() };
    },
  },
  "tarefas.criar": {
    handler: async (params) => {
      let texto = requireString(params, "texto");
      let quando = optionalString(params, "quando");
      let semHora = params["semHora"] === true;
      const prioridade = params["prioridade"] === "alta" ? "alta" as const : undefined;
      const repete = params["repete"] === "diaria" || params["repete"] === "semanal" ? params["repete"] : undefined;
      // Fase 18: sem data escolhida, a data pode estar no próprio texto ("prova sexta 14h").
      if (!quando && params["interpretar"] !== false) {
        const i = interpretarTexto(texto);
        if (i.quando) { texto = i.texto; quando = i.quando; semHora = i.semHora; }
      }
      // Com data: o mesmo caminho da voz (16h padrão, véspera para prova/consulta).
      if (quando) {
        const r = criarLembreteComTarefa(texto, quando, false, semHora, { prioridade, repete, usarPedido: false });
        // Horário que já passou é ERRO (08/10): o app deixa o texto no campo e mostra o motivo.
        if (!r.ok) throw new RpcError(400, r.mensagem);
        return { tarefas: listarTarefas(), mensagem: r.mensagem, tarefa: r.tarefa };
      }
      try {
        const tarefa = criarTarefa({ texto, prioridade });
        return { tarefas: listarTarefas(), mensagem: "Anotado.", tarefa };
      } catch (e) { throw new RpcError(400, (e as Error).message); }
    },
  },
  // Fase 18: a prévia do quick add — o que a Ely entendeu, antes de gravar. Não grava nada.
  "tarefas.interpretar": {
    handler: async (params) => {
      const i = interpretarTexto(requireString(params, "texto"));
      if (!i.quando) return { texto: i.texto, quando: null };
      const q = interpretarQuando(i.quando, i.semHora);
      if (!q) return { texto: i.texto, quando: null };
      const avisos = planejarLembretes(i.texto, q, Date.now());
      const principal = avisos.find(a => !a.vespera) ?? avisos[avisos.length - 1];
      return {
        texto: i.texto,
        quando: i.quando,
        semHora: i.semHora,
        passou: !avisos.length,
        vespera: avisos.some(a => a.vespera),
        rotulo: principal ? rotuloDoPrazo(principal.em, !q.temHora && ehCompromisso(i.texto)) : null,
      };
    },
  },
  "tarefas.editar": {
    handler: async (params) => {
      const id = requireString(params, "id");
      const t = obterTarefa(id);
      if (!t) throw new RpcError(404, "tarefa não encontrada");
      const texto = optionalString(params, "texto");
      // `quando`: string = data nova; null = sem data; ausente = a data fica.
      if (params["quando"] !== undefined) {
        const r = reagendarTarefa(id, params["quando"] === null ? null : String(params["quando"]), params["semHora"] === true, texto);
        if (!r.ok) throw new RpcError(400, r.mensagem);
      } else if (texto !== undefined) {
        try { editarTarefa(id, { texto }); } catch (e) { throw new RpcError(400, (e as Error).message); }
      }
      const extra: Parameters<typeof editarTarefa>[1] = {};
      if (params["prioridade"] !== undefined) extra.prioridade = params["prioridade"] === "alta" ? "alta" : null;
      if (params["repete"] !== undefined) extra.repete = params["repete"] === "diaria" || params["repete"] === "semanal" ? params["repete"] : null;
      if (params["ressalva"] !== undefined) extra.ressalva = typeof params["ressalva"] === "string" ? params["ressalva"] : null;
      if (Object.keys(extra).length) editarTarefa(id, extra);
      return { tarefa: obterTarefa(id), tarefas: listarTarefas() };
    },
  },
  "tarefas.adiar": {
    handler: async (params) => {
      const id = requireString(params, "id");
      const para = requireEnum(params, "para", ["1h", "hoje16", "amanha", "semana"] as const) as Adiamento;
      if (!obterTarefa(id)) throw new RpcError(404, "tarefa não encontrada");
      const r = adiarTarefaPor(id, para);
      if (!r.ok) throw new RpcError(400, r.mensagem);
      return { tarefa: r.tarefa, tarefas: listarTarefas(), mensagem: r.mensagem };
    },
  },
  // As atrasadas de uma vez (o "Reagendar" do Todoist).
  "tarefas.reagendarAtrasadas": {
    handler: async (params) => {
      const para = requireEnum(params, "para", ["hoje16", "amanha", "semana"] as const) as Adiamento;
      let n = 0;
      for (const t of listarPorFiltro("abertas").filter(x => estaAtrasada(x))) {
        const alvo = adiarPara(t.prazo, !!t.semHora, para);
        if (reagendarTarefa(t.id, alvo.quando, alvo.semHora).ok) n++;
      }
      return { reagendadas: n, tarefas: listarTarefas() };
    },
  },
  "tarefas.concluir": {
    handler: async (params) => {
      // Fase 20: a mesma regra da voz e do agente (`operacoes.ts`) — avisos cancelados e a
      // próxima repetição criada uma vez só.
      const r = concluirTarefaCompleta(requireString(params, "id"), optionalString(params, "ressalva"));
      if (!r) throw new RpcError(404, "tarefa não encontrada");
      return { tarefa: r.tarefa, tarefas: listarTarefas(), ...(r.proxima ? { proxima: r.proxima } : {}) };
    },
  },
  "tarefas.reabrir": {
    handler: async (params) => {
      const antes = obterTarefa(requireString(params, "id"));
      const t = reabrirTarefa(requireString(params, "id"));
      if (!t) throw new RpcError(404, "tarefa não encontrada");
      // Desfazer a conclusão de uma tarefa que repete apaga a "próxima" que ela tinha criado.
      if (antes?.proximaId) {
        const p = apagarTarefa(antes.proximaId);
        for (const id of p?.lembreteIds ?? []) cancelReminder(id);
      }
      // Concluir cancelou os avisos; reabrir com o prazo ainda à frente os traz de volta (08/10).
      reavisarTarefa(t.id);
      return { tarefa: obterTarefa(t.id) ?? t, tarefas: listarTarefas() };
    },
  },
  "tarefas.delete": {
    destructive: true,
    handler: async (params) => {
      const t = apagarTarefa(requireString(params, "id"));
      if (!t) throw new RpcError(404, "tarefa não encontrada");
      for (const id of t.lembreteIds ?? []) cancelReminder(id);
      return { ok: true, tarefas: listarTarefas() };
    },
  },
  // Hábitos e metas (fase 16). A lista já vem com as contas (sequência, recorde, taxa, mapa).
  "habitos.list": { handler: async () => ({ habitos: listarHabitos().map(h => resumirHabito(h)), metas: listarMetas() }) },
  "habitos.save": {
    handler: async (params) => {
      const dias = Array.isArray(params["dias"]) ? (params["dias"] as unknown[]).map(Number) : undefined;
      try {
        return { habito: resumirHabito(salvarHabito({ id: typeof params["id"] === "string" ? params["id"] : undefined, nome: requireString(params, "nome"), icone: typeof params["icone"] === "string" ? params["icone"] : undefined, dias, horaLembrete: typeof params["horaLembrete"] === "string" ? params["horaLembrete"] : undefined, folgasPorSemana: typeof params["folgasPorSemana"] === "number" ? params["folgasPorSemana"] : undefined })) };
      } catch (e) { throw new RpcError(400, (e as Error).message); }
    },
  },
  "habitos.marcar": {
    handler: async (params) => {
      const h = marcarHabito(requireString(params, "id"), params["feito"] !== false, typeof params["dia"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params["dia"]) ? params["dia"] : undefined);
      if (!h) throw new RpcError(404, "hábito não encontrado");
      return { habito: resumirHabito(h) };
    },
  },
  // Fase 18: "congelar hoje" (viagem, doença) — o dia não conta como falta.
  "habitos.pausar": {
    handler: async (params) => {
      const dia = typeof params["dia"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params["dia"]) ? params["dia"] : undefined;
      const h = pausarHabito(requireString(params, "id"), params["pausar"] !== false, dia);
      if (!h) throw new RpcError(404, "hábito não encontrado");
      return { habito: resumirHabito(h) };
    },
  },
  "habitos.delete": { destructive: true, handler: async (params) => ({ ok: apagarHabito(requireString(params, "id")) }) },
  "metas.save": {
    handler: async (params) => {
      try {
        return { meta: salvarMeta({ id: typeof params["id"] === "string" ? params["id"] : undefined, titulo: requireString(params, "titulo"), alvo: Number(params["alvo"]), unidade: typeof params["unidade"] === "string" ? params["unidade"] : undefined, progresso: typeof params["progresso"] === "number" ? params["progresso"] : undefined, prazo: typeof params["prazo"] === "string" ? params["prazo"] : undefined }) };
      } catch (e) { throw new RpcError(400, (e as Error).message); }
    },
  },
  "metas.progresso": {
    handler: async (params) => {
      const m = avancarMeta(requireString(params, "id"), Number(params["delta"]));
      if (!m) throw new RpcError(404, "meta não encontrada (ou delta inválido)");
      return { meta: m };
    },
  },
  "metas.delete": { destructive: true, handler: async (params) => ({ ok: apagarMeta(requireString(params, "id")) }) },
  // Central "Hoje" (fase 16): o briefing inteiro numa chamada.
  "hoje.painel": { handler: async () => montarPainelHoje() },
  // Bloco 191: "A Ely quer saber". Abrir = a pergunta entra na conversa como fala dela (a
  // resposta dele chega com contexto); dispensar = não pergunta mais.
  "acompanhamento.abrir": {
    handler: async (params) => {
      const id = requireString(params, "id");
      const a = pendentesDeAcompanhamento().find(x => x.id === id);
      if (!a) throw new RpcError(404, "essa pergunta não vale mais");
      marcarAcompanhado(id);
      registrarFalaDaEly(a.pergunta);
      return { pergunta: a.pergunta };
    },
  },
  // Bloco 194: despejo — a prévia (não grava) e a gravação do que ele marcou.
  "despejo.interpretar": {
    handler: async (params) => {
      const texto = requireString(params, "texto");
      if (texto.length > 4000) throw new RpcError(400, "texto longo demais (máx 4000)");
      return { itens: await interpretarFala(texto) };
    },
  },
  "despejo.aplicar": {
    handler: async (params) => {
      const itens = validarItens(params.itens);
      if (!itens.length) throw new RpcError(400, "nenhum item válido para anotar");
      return aplicarDespejo(itens);
    },
  },
  "acompanhamento.dispensar": {
    handler: async (params) => { marcarAcompanhado(requireString(params, "id")); return { ok: true }; },
  },
  // Fase 18: "outra ideia" e o checklist "Para testar" do card ELYSIUM.
  "hoje.ideia": {
    handler: async () => {
      const p = await montarPainelHoje();
      return { ideia: await ideiaDoDia(fatosDoDia(p), true) };
    },
  },
  // Fase 18: esconder (ou mostrar de novo) uma seção do Hoje — "não quero ver manchetes".
  "hoje.ocultar": {
    handler: async (params) => {
      const secao = requireString(params, "secao").slice(0, 30);
      const atuais = new Set(getConfig().hojeOcultos ?? []);
      if (params["ocultar"] === false) atuais.delete(secao); else atuais.add(secao);
      setOverride({ hojeOcultos: [...atuais].slice(0, 30) });
      return { ocultos: [...atuais] };
    },
  },
  // Fase 18: a revisão da semana (feitas, atrasadas, hábitos, metas, treino).
  "hoje.revisao": { handler: async () => revisaoDaSemana() },
  "hoje.testar": {
    handler: async (params) => {
      const item = requireString(params, "item").slice(0, 300);
      return { feitos: marcarTeste(app.getVersion(), item, params["feito"] !== false) };
    },
  },
  // Treino, nutrição e corrida (fase 18). Dados pessoais: só no corpo.json do userData.
  "corpo.painel": { handler: async () => montarPainelCorpo() },
  "corpo.dica": { handler: async (params) => ({ dica: await dicaDoCorpo(params["nova"] === true) }) },
  "corpo.perfil": {
    handler: async (params) => ({ perfil: Object.keys(params).length ? salvarPerfil(params as Partial<PerfilCorpo>) : lerPerfil() }),
  },
  "corpo.peso": {
    handler: async (params) => {
      try { return { perfil: registrarPeso(requireNumber(params, "kg")) }; } catch (e) { throw new RpcError(400, (e as Error).message); }
    },
  },
  "treinos.save": {
    handler: async (params) => {
      if (!Array.isArray(params["exercicios"])) throw new RpcError(400, 'param "exercicios" deve ser uma lista');
      try {
        return { treino: salvarTreino({ id: optionalString(params, "id"), nome: requireString(params, "nome"), exercicios: params["exercicios"] as unknown[], ordem: optionalInt(params, "ordem") }) };
      } catch (e) { throw new RpcError(400, (e as Error).message); }
    },
  },
  "treinos.importar": {
    destructive: true,
    handler: async (params) => {
      try { return { treinos: importarTreinos(params["treinos"] as { nome: string; exercicios: unknown[] }[]) }; } catch (e) { throw new RpcError(400, (e as Error).message); }
    },
  },
  "treinos.delete": { destructive: true, handler: async (params) => ({ ok: apagarTreino(requireString(params, "id")) }) },
  "treinos.marcar": {
    handler: async (params) => {
      const t = marcarTreino(params["feito"] !== false, optionalString(params, "id"));
      if (!t) throw new RpcError(404, "nenhum treino cadastrado");
      return { treino: t, painel: montarPainelCorpo() };
    },
  },
  "corrida.marcar": {
    handler: async (params) => {
      const km = typeof params["km"] === "number" ? params["km"] : undefined;
      try {
        return { corrida: registrarCorrida(requireNumber(params, "minutos"), km, params["doPlano"] !== false), painel: montarPainelCorpo() };
      } catch (e) { throw new RpcError(400, (e as Error).message); }
    },
  },
  "corrida.delete": { destructive: true, handler: async (params) => ({ ok: apagarCorrida(requireString(params, "id")), painel: montarPainelCorpo() }) },
  // Timers com nome (bloco 136).
  "timers.list": { handler: async () => ({ timers: listarTimers(), agora: Date.now() }) },
  "timers.start": {
    handler: async (params) => {
      const minutos = Number(params["minutos"]);
      if (!Number.isFinite(minutos) || minutos <= 0 || minutos > 24 * 60) throw new RpcError(400, "minutos inválido");
      return { timer: criarTimer(Math.round(minutos * 60_000), typeof params["nome"] === "string" ? params["nome"].slice(0, 40) : "") };
    },
  },
  "timers.cancel": {
    handler: async (params) => {
      const t = cancelarTimer(requireString(params, "id"));
      if (!t) throw new RpcError(404, "timer não existe");
      return { timer: t };
    },
  },
  // Comandos de IA sobre texto (bloco 137) e "resume este link" (bloco 138).
  "comandos.list": { handler: async () => ({ comandos: listarComandos() }) },
  "comandos.run": {
    handler: async (params) => {
      try { return await rodarComando(requireString(params, "comando"), requireString(params, "texto")); }
      catch (e) { throw new RpcError(400, e instanceof Error ? e.message : String(e)); }
    },
  },
  "comandos.save": {
    handler: async (params) => {
      try { return { comando: salvarComando({ id: optionalString(params, "id"), nome: requireString(params, "nome"), instrucao: requireString(params, "instrucao") }) }; }
      catch (e) { throw new RpcError(400, e instanceof Error ? e.message : String(e)); }
    },
  },
  "comandos.delete": { destructive: true, handler: async (params) => ({ ok: apagarComando(requireString(params, "id")) }) },
  "link.resumir": {
    handler: async (params) => {
      try { return { resumo: await comContexto("texto", () => resumirLink(requireString(params, "url"))) }; }
      catch (e) { throw new RpcError(502, e instanceof Error ? e.message : String(e)); }
    },
  },
  // Jeito de responder (bloco 134): o celular lê e muda o que o PC usa nos prompts.
  "perfil.get": {
    handler: async () => {
      const c = getConfig();
      return { estiloResposta: estiloValido(c.estiloResposta), instrucoesPessoais: c.instrucoesPessoais ?? "", tratamento: c.tratamento ?? "chefe" };
    },
  },
  "perfil.set": {
    handler: async (params) => {
      const patch: { estiloResposta?: string; instrucoesPessoais?: string; tratamento?: string } = {};
      if (typeof params["tratamento"] === "string") patch.tratamento = params["tratamento"].trim().slice(0, 30);
      if (params["estiloResposta"] !== undefined) patch.estiloResposta = estiloValido(params["estiloResposta"]);
      if (typeof params["instrucoesPessoais"] === "string") patch.instrucoesPessoais = params["instrucoesPessoais"].trim().slice(0, MAX_INSTRUCOES);
      setOverride(patch);
      const c = getConfig();
      return { estiloResposta: estiloValido(c.estiloResposta), instrucoesPessoais: c.instrucoesPessoais ?? "", tratamento: c.tratamento ?? "chefe" };
    },
  },
  // Fase 21: o cérebro Hermes — estado (chip de Ajustes no PC e no celular) e a escolha.
  "hermes.status": { handler: async () => estadoHermes() },
  "hermes.set": {
    handler: async (params) => {
      const patch: { cerebro?: "hermes" | "elysium"; hermesContextoPessoal?: boolean } = {};
      if (params["cerebro"] === "hermes" || params["cerebro"] === "elysium") patch.cerebro = params["cerebro"];
      if (typeof params["contextoPessoal"] === "boolean") patch.hermesContextoPessoal = params["contextoPessoal"];
      setOverride(patch);
      aplicarConfigHermes();
      return estadoHermes();
    },
  },
  // Busca dentro das conversas salvas (bloco 133): paleta do PC e, no futuro, o celular.
  "chat.search": {
    handler: async (params) => ({ achados: buscarNasConversas(listChatSessions(), requireString(params, "q")) }),
  },
  // Card "Hoje" (bloco 126): o mesmo texto do "bom dia", montado sem modelo — PC e celular.
  "resumo.dia": {
    handler: async () => ({ texto: await resumoDoDia() }),
  },
  // Memória que aprende (bloco 118): o que o cérebro sugeriu guardar, e a decisão do Zak.
  "memory.sugestoes": {
    handler: async () => ({ sugestoes: listarSugestoesDeFato() }),
  },
  "memory.aceitar": {
    handler: async (params) => {
      const f = aceitarSugestao(requireString(params, "id"));
      if (!f) throw new RpcError(404, "sugestão não encontrada");
      return { fact: f };
    },
  },
  "memory.recusar": {
    handler: async (params) => ({ recusada: recusarSugestao(requireString(params, "id")) }),
  },
  // Conversas que a Ely lembra (bloco 190): ver, apagar uma, apagar todas, e o modo anônimo.
  "episodios.list": {
    handler: async () => ({ episodios: listarEpisodios() }),
  },
  "episodios.delete": {
    destructive: true,
    handler: async (params) => ({ removed: apagarEpisodio(requireString(params, "id")) }),
  },
  "episodios.clear": {
    destructive: true,
    handler: async () => ({ removidos: apagarTodosEpisodios() }),
  },
  // Plano de estudo (fase 20): só a PRÉVIA; gravar é o `despejo.aplicar` com os escolhidos.
  "estudo.planejar": {
    handler: async (params) => {
      const dia = optionalString(params, "dia");
      const hora = optionalString(params, "hora");
      if (dia && !dataValida(dia)) throw new RpcError(400, "dia no formato AAAA-MM-DD");
      if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new RpcError(400, "hora no formato HH:MM");
      const assuntos = Array.isArray(params["assuntos"]) ? (params["assuntos"] as unknown[]).filter((x): x is string => typeof x === "string").map(s => s.trim().slice(0, 60)).filter(Boolean).slice(0, 14) : [];
      return montarPlano({ materia: requireString(params, "materia").slice(0, 60), assuntos, dia, hora });
    },
  },
  // Pomodoro (fase 20). O card mostra a fase e o tempo; `fimEm` + `agora` acertam o relógio.
  "pomodoro.get": { handler: async () => pomodoroParaCliente() },
  "pomodoro.start": {
    handler: async (params) => {
      const n = (k: string) => (typeof params[k] === "number" ? params[k] as number : undefined);
      await comecarPomodoro({ foco: n("foco"), pausa: n("pausa"), longa: n("longa"), ciclos: n("ciclos") });
      return pomodoroParaCliente();
    },
  },
  "pomodoro.stop": { handler: async () => { pararPomodoro(); return pomodoroParaCliente(); } },
  "pomodoro.skip": { handler: async () => { await pularFase(); return pomodoroParaCliente(); } },
  // Cartões de revisão (fase 20): a tela vira o cartão e marca "acertei"/"errei".
  "cartoes.list": {
    handler: async () => ({ cartoes: listarCartoes(), vencidos: cartoesVencidos().map(c => c.id) }),
  },
  "cartoes.responder": {
    handler: async (params) => {
      if (typeof params["acertou"] !== "boolean") throw new RpcError(400, "\"acertou\" precisa ser true ou false");
      const c = responderCartao(requireString(params, "id"), params["acertou"]);
      if (!c) throw new RpcError(404, "cartão não encontrado");
      return { cartao: c, restantes: cartoesVencidos().length };
    },
  },
  "cartoes.criar": {
    handler: async (params) => {
      const c = criarCartao(requireString(params, "frente"), requireString(params, "verso"), "manual");
      if (!c) throw new RpcError(400, "frente e verso são obrigatórios");
      return { cartao: c };
    },
  },
  "cartoes.delete": { destructive: true, handler: async (params) => ({ ok: apagarCartao(requireString(params, "id")) }) },
  // Modos da Ely (fase 20). `modos.set` com id null sai do modo.
  "modos.list": {
    handler: async () => ({ modos: listarModos().map(m => ({ id: m.id, nome: m.nome, icone: m.icone, resumo: m.resumo, meu: !!m.meu, ...(m.meu ? { instrucao: m.instrucao } : {}) })), ativo: modoParaCliente(modoAtivo()) }),
  },
  "modos.get": { handler: async () => ({ ativo: modoParaCliente(modoAtivo()) }) },
  "modos.set": {
    handler: async (params) => {
      const id = params["id"];
      if (id !== null && typeof id !== "string") throw new RpcError(400, "\"id\" precisa ser o id do modo ou null");
      if (typeof id === "string" && !listarModos().some(m => m.id === id)) throw new RpcError(404, "modo não encontrado");
      return { ativo: modoParaCliente(definirModo(id)) };
    },
  },
  "modos.save": {
    handler: async (params) => {
      const r = salvarModoMeu({ id: optionalString(params, "id"), nome: requireString(params, "nome"), instrucao: requireString(params, "instrucao"), icone: optionalString(params, "icone") });
      if (typeof r === "string") throw new RpcError(400, ERROS_DO_MODO[r]);
      return { modo: { id: r.id, nome: r.nome, icone: r.icone, resumo: r.resumo, meu: true, instrucao: r.instrucao } };
    },
  },
  "modos.delete": { destructive: true, handler: async (params) => ({ ok: apagarModoMeu(requireString(params, "id")) }) },
  "memoria.anonimo.get": {
    handler: async () => ({ anonimo: modoAnonimo() }),
  },
  "memoria.anonimo.set": {
    handler: async (params) => {
      if (typeof params.ligar !== "boolean") throw new RpcError(400, "\"ligar\" precisa ser true ou false");
      return { anonimo: definirAnonimo(params.ligar) };
    },
  },
  // O celular conta como algo se comportou (bloco 116: o pedido por voz, para calibrar os
  // limiares). Cai no log do PC — o único log que existe; o celular não tem onde guardar.
  // Teto de 20 linhas × 300 caracteres e passa pelo `mascarar`: um cliente com o token não
  // pode encher o disco nem gravar segredo no log.
  "diag.registrar": {
    handler: async (params) => {
      const origem = typeof params["origem"] === "string" ? params["origem"].replace(/[^\w.-]/g, "").slice(0, 30) : "";
      const linhas = Array.isArray(params["linhas"]) ? (params["linhas"] as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 20) : [];
      if (!origem || !linhas.length) throw new RpcError(400, "origem e linhas são obrigatórios");
      for (const l of linhas) console.log(`[celular] ${origem}: ${mascarar(l.replace(/\s+/g, " ").slice(0, 300))}`);
      return { registradas: linhas.length };
    },
  },
  // "Saúde do ELYSIUM" (fase 12): o que está quebrado, com o conserto de um clique.
  "system.saude": {
    handler: async () => ({ itens: await verificarSaude() }),
  },
  "system.saude.consertar": {
    handler: async (params) => ({ message: await consertarSaude(requireEnum(params, "item", ["ollama", "inicio", "tailscale"] as const)) }),
  },
  // O mesmo "copiar diagnóstico" dos Ajustes do PC, para o Sobre do celular (bloco 97).
  "system.diagnostico": {
    handler: async () => ({ texto: await montarDiagnostico() }),
  },
  // Leitura real do volume (bloco 86) — o que torna possível um slider honesto.
  "volume.get": {
    handler: async () => lerVolume(),
  },
  "volume.set": {
    handler: async (params) => {
      const raw = params["level"];
      if (typeof raw === "number") {
        if (!Number.isInteger(raw) || raw < 0 || raw > 100) {
          throw new RpcError(400, "level numérico deve ser um inteiro entre 0 e 100");
        }
        return { ok: true, message: await volumeControl(raw) };
      }
      const named = requireEnum(params, "level", ["up", "down", "mute", "unmute"] as const);
      return { ok: true, message: await volumeControl(named) };
    },
  },
};

/** Nomes disponíveis, para a rota de descoberta e para mensagens de erro. */
export function listRpcMethods(): { method: string; destructive: boolean }[] {
  return Object.entries(METHODS)
    .map(([method, def]) => ({ method, destructive: def.destructive === true }))
    .sort((a, b) => a.method.localeCompare(b.method));
}

export async function handleRpc(
  method: unknown,
  params: unknown,
  ctx: RpcContext,
): Promise<unknown> {
  if (typeof method !== "string" || !method) {
    throw new RpcError(400, "campo \"method\" é obrigatório");
  }

  // `hasOwn`: "toString" ou "constructor" não são métodos — antes viravam um 500 confuso.
  const def = Object.prototype.hasOwnProperty.call(METHODS, method) ? METHODS[method] : undefined;
  if (!def) throw new RpcError(404, `método desconhecido: ${method}`);

  if (def.destructive && !ctx.confirmed) {
    throw new RpcError(403, `método "${method}" exige confirmação (header X-Elysium-Confirm)`);
  }

  const safeParams: Record<string, unknown> =
    params && typeof params === "object" && !Array.isArray(params)
      ? (params as Record<string, unknown>)
      : {};

  try {
    return await def.handler(safeParams, ctx);
  } catch (e) {
    if (e instanceof RpcError) throw e;
    // Erros dos executores (ex: appNotFoundError) viram 500 com a mensagem preservada.
    throw new RpcError(500, e instanceof Error ? e.message : String(e));
  }
}
