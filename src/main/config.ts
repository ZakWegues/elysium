import { app } from "electron";
import Store from "electron-store";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Configuração do app.
 *
 * - Defaults vêm de config.json (empacotado em dist/config.json).
 * - A API key e overrides do usuário ficam no electron-store (userData),
 *   nunca hardcoded e nunca versionados.
 */

export interface UiLayout {
  order: string[];
  hidden: string[];
}

export interface AppConfig {
  shortcut: string;
  autoLaunch: boolean;
  silenceMs: number;
  maxRecordMs: number;
  voice: string;
  sttModel: string;
  brainModel: string;
  chatHistoryTurns: number;
  chatIdleResetMs: number;
  serverPort: number;
  theme: string;
  layout: UiLayout;
}

const DEFAULTS: AppConfig = {
  shortcut: "Control+Shift+J",
  autoLaunch: true,
  silenceMs: 2500,
  maxRecordMs: 120000,
  voice: "pt-BR-FranciscaNeural",
  sttModel: "whisper-large-v3",
  brainModel: "llama-3.3-70b-versatile",
  chatHistoryTurns: 6,
  chatIdleResetMs: 300000,
  serverPort: 4200,
  theme: "default",
  layout: { order: ["perf", "storage", "taskmgr"], hidden: [] },
};

function loadDefaults(): AppConfig {
  // dist/config.json fica um nível acima de dist/main/
  const candidate = path.join(__dirname, "..", "config.json");
  try {
    if (fs.existsSync(candidate)) {
      const raw = JSON.parse(fs.readFileSync(candidate, "utf-8"));
      return { ...DEFAULTS, ...raw };
    }
  } catch {
    // se o arquivo estiver corrompido, usa os defaults embutidos
  }
  return DEFAULTS;
}

// Store seguro no userData. A API key vive aqui.
const store = new Store<{ apiKey: string; overrides: Partial<AppConfig>; serverToken: string }>({
  name: "neuroaxis-config",
  defaults: { apiKey: "", overrides: {}, serverToken: "" },
});

const fileDefaults = loadDefaults();

export function getConfig(): AppConfig {
  const overrides = store.get("overrides", {} as Partial<AppConfig>);
  return { ...fileDefaults, ...overrides };
}

export function setOverride(patch: Partial<AppConfig>): void {
  const current = store.get("overrides", {} as Partial<AppConfig>);
  store.set("overrides", { ...current, ...patch });
}

export function getApiKey(): string {
  // electron-store tem prioridade; .env só como fallback de desenvolvimento
  const stored = store.get("apiKey", "");
  if (stored && stored.trim()) return stored.trim();
  const env = process.env.GROQ_API_KEY;
  return env && env.trim() ? env.trim() : "";
}

export function setApiKey(key: string): void {
  store.set("apiKey", (key || "").trim());
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

export function userDataPath(): string {
  return app.getPath("userData");
}

export function getOrCreateServerToken(): string {
  const existing = store.get("serverToken", "");
  if (existing && existing.length === 64) return existing;
  const token = crypto.randomBytes(32).toString("hex");
  store.set("serverToken", token);
  return token;
}
