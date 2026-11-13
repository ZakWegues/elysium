import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp", isPackaged: false }, BrowserWindow: class {}, ipcMain: { on: () => {} }, screen: {} }));
import { mesmaArea, relativoNaArea } from "../src/main/flutuante";

describe("Ely flutuante: a camada sobre o monitor do cursor (13/11)", () => {
  const area = { x: 1920, y: 0, width: 1920, height: 1040 };
  it("o cursor vira coordenada da camada (segundo monitor à direita)", () => {
    expect(relativoNaArea({ x: 2000, y: 100 }, area)).toEqual({ x: 80, y: 100 });
    expect(relativoNaArea({ x: -100, y: 50 }, { x: -1280, y: 0, width: 1280, height: 720 })).toEqual({ x: 1180, y: 50 });
  });
  it("só troca de monitor quando a área muda", () => {
    expect(mesmaArea(null, area)).toBe(false);
    expect(mesmaArea({ ...area }, area)).toBe(true);
    expect(mesmaArea({ ...area, width: 1280 }, area)).toBe(false);
  });
});
