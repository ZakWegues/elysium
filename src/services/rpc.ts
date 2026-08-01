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
import {
  getDashboardTelemetry, getTopProcesses, getDiskDetails, killProcess,
} from "../actions/systemInfo";
import { openApp } from "../actions/openApp";
import { closeApp } from "../actions/closeApp";
import { powerControl, PowerOperation } from "../actions/powerControl";
import { mediaControl, MediaOperation } from "../actions/mediaControl";
import { volumeControl } from "../actions/volumeControl";

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
