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

import { clipboard } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { getAllLocalIPv4 } from "../main/network";
import { clientesConectados } from "./server";
import { getConfig } from "../main/config";

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
import { comecarFoco, estadoFoco, pararFoco, salvarListaFoco } from "./foco";
import { abrirNoPc, AlvoAbrir, AlvoLimpeza, lerArmazenamento, limpar } from "../actions/armazenamento";
import { aguardarDownloads, estadoAtualizacao, instalarAtualizacaoDesktop, verificarAtualizacoes } from "./atualizacao";
import { captureScreen, listScreens } from "./screenCapture";
import { screenshot } from "../actions/screenshot";
import { inputHost, MouseButton } from "./inputHost";
import { addFact, listFacts, removeFactById } from "./memoryStore";
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
import { climaAgora, motivoDaFalha } from "./clima";
import {
  getAllPresets, getPreset, findPresetKey, savePreset, deletePresetByKey,
} from "./presetsStore";
import { runPreset } from "../actions/runPreset";
import * as spotify from "./spotify";
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
  "chat.delete": {
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
  "memory.remove": {
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
    handler: async (params) => {
      const nome = requireString(params, "name");
      const acoes = params?.actions;
      if (!Array.isArray(acoes) || !acoes.length) {
        throw new RpcError(400, 'param "actions" deve ser uma lista não vazia');
      }
      savePreset(nome, {
        description: optionalString(params, "description") ?? nome,
        icon: optionalString(params, "icon"),
        actions: acoes as never,
      });
      return { saved: nome };
    },
  },
  "presets.delete": {
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
      return {
        reminder: createReminder({
          text,
          dueAt,
          kind,
          weekday: kind === "weekly" ? new Date(dueAt).getDay() : undefined,
        }),
      };
    },
  },
  "reminders.cancel": {
    handler: async (params) => ({ cancelled: cancelReminder(requireString(params, "id")) }),
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
    handler: async (params) => {
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
        const allowed: PushCategory[] = ["reminder", "anomaly", "mailbox"];
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
      const resumo = (x?: { versao: string; notas: string; publicadaEm: string; tamanho: number; pronto: boolean; progresso: number }) =>
        x ? { versao: x.versao, notas: x.notas, publicadaEm: x.publicadaEm, tamanho: x.tamanho, pronto: x.pronto, progresso: x.progresso } : null;
      return { pc: e.atual, verificadoEm: e.verificadoEm ?? null, erro: e.erro ?? null, desktop: resumo(e.desktop), celular: resumo(e.celular) };
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
  // O celular conta como algo se comportou (bloco 116: a mão livre, para calibrar os
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
    handler: async (params) => ({ message: await consertarSaude(requireEnum(params, "item", ["ollama", "inicio"] as const)) }),
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

  const def = METHODS[method];
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
