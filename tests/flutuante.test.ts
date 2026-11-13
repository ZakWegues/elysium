import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp", isPackaged: false }, BrowserWindow: class {}, ipcMain: { on: () => {} }, screen: {} }));
import { ALTURA, LARGURA, lugarDaJanela } from "../src/main/flutuante";

describe("Ely flutuante: onde a janela abre (12/11)", () => {
  const area = { x: 0, y: 0, width: 1280, height: 680 };
  const dentro = (l: { x: number; y: number }) =>
    l.x >= area.x && l.y >= area.y && l.x + LARGURA <= area.x + area.width && l.y + ALTURA <= area.y + area.height;

  it("cursor no alto à esquerda: abre para a direita e para baixo, encostada no cursor", () => {
    const l = lugarDaJanela({ x: 100, y: 40 }, area);
    expect(l).toMatchObject({ horiz: "dir", vert: "baixo", x: 92, y: 32 });
    expect(dentro(l)).toBe(true);
  });

  it("cursor no canto de baixo à direita: abre para a esquerda e para cima", () => {
    const l = lugarDaJanela({ x: 1250, y: 660 }, area);
    expect(l.horiz).toBe("esq");
    expect(l.vert).toBe("cima");
    expect(dentro(l)).toBe(true);
  });

  it("nunca sai da área de trabalho, mesmo em tela pequena e cursor no meio", () => {
    for (const x of [0, 400, 640, 900, 1279]) for (const y of [0, 200, 340, 500, 679]) expect(dentro(lugarDaJanela({ x, y }, area))).toBe(true);
  });

  it("respeita o deslocamento do segundo monitor", () => {
    const segundo = { x: 1920, y: 0, width: 1920, height: 1040 };
    const l = lugarDaJanela({ x: 2000, y: 100 }, segundo);
    expect(l.x).toBe(1992);
    expect(l.x).toBeGreaterThanOrEqual(1920);
  });
});
