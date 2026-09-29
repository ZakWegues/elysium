import { describe, expect, it, vi } from "vitest";

/**
 * O que dá para testar sem Windows: a validação do hwnd (é o que impede um cliente de
 * injetar PowerShell pelo parâmetro) e a leitura da saída do EnumWindows.
 */
const saidas: string[] = [];
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const ouvintes: Record<string, ((x?: unknown) => void)[]> = {};
    const stream = (nome: string) => ({ on: (ev: string, fn: (d: Buffer) => void) => { if (ev === "data") ouvintes[nome] = [fn as (x?: unknown) => void]; } });
    const proc = {
      stdout: stream("out"), stderr: stream("err"),
      on: (ev: string, fn: (x?: unknown) => void) => {
        if (ev === "close") setTimeout(() => { ouvintes.out?.[0]?.(Buffer.from(saidas.shift() ?? "")); fn(0); }, 0);
      },
    };
    return proc;
  }),
}));

const { controlarJanela, listarJanelas } = await import("../src/actions/janelas");

describe("janelas", () => {
  it("recusa hwnd que não é número — nada de PowerShell montado com texto do cliente", async () => {
    await expect(controlarJanela("1; Remove-Item C:\\", "focar")).rejects.toThrow(/hwnd inválido/);
    await expect(controlarJanela("", "fechar")).rejects.toThrow(/hwnd inválido/);
  });

  it("lê a saída do EnumWindows: flags, processo, e filtra o que é do Windows", async () => {
    saidas.push([
      "123\t10\t011\tDocumento - Word\tWINWORD",
      "456\t20\t100\tDownloads\texplorer",
      "789\t30\t000\tDigitação\tTextInputHost",
      "999\t40\t000\tProgram Manager\texplorer",
    ].join("\r\n"));
    const l = await listarJanelas();
    expect(l).toEqual([
      { hwnd: "123", pid: 10, processo: "WINWORD", titulo: "Documento - Word", minimizada: false, maximizada: true, emFoco: true },
      { hwnd: "456", pid: 20, processo: "explorer", titulo: "Downloads", minimizada: true, maximizada: false, emFoco: false },
    ]);
  });
});
