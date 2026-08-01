/**
 * NEUROAXIS RPC — superfície tipada que o Portal (celular) usa para controlar o PC
 * sem passar pelo cérebro Llama.
 *
 * Motivo: até aqui a única porta de comando do mobile era POST /api/command, que joga
 * o texto no LLM. Isso é ótimo pra voz e péssimo pra botão — "matar o processo 4821"
 * não deve depender de o modelo interpretar uma frase. Cada método abaixo é uma
 * chamada determinística, validada e whitelistada.
 *
 * Segurança: métodos marcados `destructive` exigem o header X-Neuroaxis-Confirm, que o
 * app só manda depois de confirmar a identidade do dono por biometria. É uma trava
 * contra chamada acidental/automatizada, não contra um atacante que já tem o token —
 * contra esse, a defesa é o token não vazar e a porta não ser exposta à internet.
 */

import { clipboard } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { getAllLocalIPv4 } from "../main/network";
import { getConfig } from "../main/config";

function hostnameOf(): string {
  try { return os.hostname(); } catch { return "PC"; }
}
import {
  getDashboardTelemetry, getTopProcesses, getDiskDetails, killProcess,
} from "../actions/systemInfo";
import { openApp } from "../actions/openApp";
import { closeApp } from "../actions/closeApp";
import { powerControl, PowerOperation } from "../actions/powerControl";
import { mediaControl, MediaOperation } from "../actions/mediaControl";
import { volumeControl } from "../actions/volumeControl";
import { captureScreen, listScreens } from "./screenCapture";
import { inputHost, MouseButton } from "./inputHost";
import { addFact, listFacts, removeFactById } from "./memoryStore";
import { cancelReminder, createReminder, listAll, ReminderKind } from "./scheduler";
import { getPushPrefs, registerToken, setPushPrefs, unregisterToken, PushCategory } from "./push";
import { askAboutImage, askAboutScreen } from "./vision";
import { searchWeb } from "./webSearch";
import * as spotify from "./spotify";
import {
  listSessions as listChatSessions, getSession as getChatSession,
  mergeSession as mergeChatSession, toggleFavorite as toggleChatFavorite,
  deleteSession as deleteChatSession, ChatSession,
} from "./chatSessionsStore";

/** Erro com status HTTP embutido, para o servidor traduzir direto na resposta. */
export class RpcError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "RpcError";
  }
}

export interface RpcContext {
  /** true quando o cliente mandou X-Neuroaxis-Confirm (biometria já validada no celular). */
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
      };
    },
  },

  // — conversas (sincronização com o celular) —
  // O PC é a autoridade: o app manda o que mudou e depois adota a lista devolvida
  // por `chat.list`. Sem um lado mandando, cada um devolveria ao outro o que ele
  // acabou de podar.
  "chat.list": {
    handler: async () => ({ sessions: listChatSessions() }),
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
    throw new RpcError(403, `método "${method}" exige confirmação (header X-Neuroaxis-Confirm)`);
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
