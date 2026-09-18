/**
 * Dublês dos módulos nativos do Electron, para os testes rodarem em Node puro.
 *
 * `electron-store` vira um mapa em memória com a mesma API (`get`/`set`/`delete`); o
 * `electron` só precisa existir para os imports não explodirem — nenhum teste aqui toca
 * janela, clipboard ou notificação. Tudo o que é lógica pura (rotas, agendamento, parse)
 * roda igual ao app.
 */
import { vi } from "vitest";

vi.mock("electron-store", () => {
  class StoreFalso<T extends Record<string, unknown>> {
    private dados: Record<string, unknown>;
    constructor(opts?: { defaults?: T }) {
      this.dados = { ...(opts?.defaults ?? {}) };
    }
    get(chave: string, padrao?: unknown) { return chave in this.dados ? this.dados[chave] : padrao; }
    set(chave: string, valor: unknown) { this.dados[chave] = valor; }
    delete(chave: string) { delete this.dados[chave]; }
    get store() { return this.dados; }
  }
  return { default: StoreFalso };
});

vi.mock("electron", () => ({
  app: { getPath: () => process.cwd(), getVersion: () => "0.0.0-teste", isPackaged: false },
  clipboard: { readText: () => "", writeText: () => {} },
  Notification: class { show() {} },
  shell: { openExternal: async () => {} },
  BrowserWindow: class {},
  ipcMain: { handle() {}, on() {} },
}));
