import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp" }, clipboard: { writeText: () => {} }, shell: { openPath: () => {} } }));
import { semSobrescrever } from "../src/actions/writeText";
import { deriveProcessNames } from "../src/actions/closeApp";
import { mascarar } from "../src/main/logArquivo";

describe("blindagem (fase 23.2)", () => {
  it("arquivo existente ganha sufixo em vez de ser apagado", () => {
    const existentes = new Set(["C:/d/lista.txt", "C:/d/lista (2).txt"]);
    expect(semSobrescrever("C:/d/lista.txt", p => existentes.has(p))).toBe("C:/d/lista (3).txt");
    expect(semSobrescrever("C:/d/nova.txt", p => existentes.has(p))).toBe("C:/d/nova.txt");
  });
  it("fechar por nome não mata processo do sistema nem casa nome curto demais", () => {
    expect(deriveProcessNames("explorer")).toEqual([]);
    expect(deriveProcessNames("svchost.exe")).toEqual([]);
    expect(deriveProcessNames("explorador de arquivos")).toEqual([]);
    expect(deriveProcessNames("o")).toEqual(["o", "o"]);
    expect(deriveProcessNames("calculadora")).toContain("CalculatorApp");
  });
  it("log mascara o token do MCP", () => {
    expect(mascarar("url http://127.0.0.1:4200/mcp/abc123 falhou")).toBe("url http://127.0.0.1:4200/mcp/[oculto] falhou");
    expect(mascarar("t=" + "a1".repeat(24))).toBe("t=[token oculto]");
  });
});

describe("IPC e config (fase 23.2)", () => {
  it("só telas dentro da pasta renderer do app", async () => {
    vi.doMock("electron", () => ({ ipcMain: { handle: () => {}, on: () => {}, once: () => {} } }));
    const { dentroDoApp } = await import("../src/main/ipcSeguro");
    const raiz = "C:/app/dist/renderer";
    expect(dentroDoApp("file:///C:/app/dist/renderer/dashboard.html", raiz)).toBe(true);
    expect(dentroDoApp("file:///C:/app/dist/renderer/dashboard.html?x=1#y", raiz)).toBe(true);
    expect(dentroDoApp("file:///C:/Users/x/Downloads/renderer/dashboard.html", raiz)).toBe(false);
    expect(dentroDoApp("file:///C:/app/dist/renderer/../../evil.html", raiz)).toBe(false);
    expect(dentroDoApp("https://mal.example/dashboard.html", raiz)).toBe(false);
    expect(dentroDoApp(undefined, raiz)).toBe(false);
  });
  it("Ollama só local/rede privada e porta válida", async () => {
    vi.doMock("electron-store", () => ({ default: class { get() { return undefined; } set() {} } }));
    const { patchDeConfigSeguro } = await import("../src/main/config");
    expect(patchDeConfigSeguro({ ollamaBaseUrl: "http://mal.example:11434" } as never)).toEqual({});
    expect(patchDeConfigSeguro({ ollamaBaseUrl: "http://192.168.0.5:11434" } as never)).toEqual({ ollamaBaseUrl: "http://192.168.0.5:11434" });
    expect(patchDeConfigSeguro({ ollamaBaseUrl: "javascript:alert(1)" } as never)).toEqual({});
    expect(patchDeConfigSeguro({ serverPort: 80 } as never)).toEqual({});
    expect(patchDeConfigSeguro({ serverPort: 4200, voice: "x" } as never)).toEqual({ serverPort: 4200, voice: "x" });
  });
});
