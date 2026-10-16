import { describe, expect, it, vi } from "vitest";
import { ipPrivado, urlPermitida } from "../src/services/leitorDeLink";
import { tamanhoAnunciado } from "../src/services/server";
import { handleRpc, validarAcoesDePreset, TEXTO_DESTRUTIVO } from "../src/services/rpc";

vi.mock("../src/services/presetsStore", async () => {
  const presets: Record<string, unknown> = { "modo foco": {}, "modo jogo": {}, cinema: {} };
  return {
    getAllPresets: () => presets,
    findPresetKey: (n: string) => {
      const name = n.toLowerCase().trim();
      const chaves = Object.keys(presets);
      if (chaves.includes(name)) return name;
      const p = chaves.filter(k => k.includes(name) || (k.length >= 3 && name.includes(k)));
      return p.length === 1 ? p[0] : undefined;
    },
    getPreset: () => undefined, savePreset: () => {}, deletePresetByKey: () => {},
  };
});

describe("segurança (08/10)", () => {
  it("IP privado, inclusive IPv4 dentro de IPv6", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.20.0.1", "169.254.1.1", "100.64.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:c0a8:101"]) {
      expect(ipPrivado(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "142.250.79.46", "2606:4700::1111", "::ffff:808:808"]) expect(ipPrivado(ip), ip).toBe(false);
  });
  it("URL: esquema, localhost e IP mapeado barrados", () => {
    expect(urlPermitida("https://exemplo.com/a")).toBe(true);
    expect(urlPermitida("file:///c:/x")).toBe(false);
    expect(urlPermitida("http://[::ffff:7f00:1]/")).toBe(false);
    expect(urlPermitida("http://app.localhost/")).toBe(false);
  });
  it("tamanho anunciado do frame WS (7, 16 e 64 bits)", () => {
    expect(tamanhoAnunciado(Buffer.from([0x81, 0x85]))).toBe(5);
    expect(tamanhoAnunciado(Buffer.from([0x82, 0xfe, 0x01, 0x00]))).toBe(256);
    const b = Buffer.alloc(10); b[1] = 127; b.writeBigUInt64BE(2n ** 31n, 2);
    expect(tamanhoAnunciado(b)).toBe(2 ** 31);
    expect(tamanhoAnunciado(Buffer.from([0x82]))).toBe(0);
  });
  it("preset: só ações conhecidas; destrutiva só confirmada", () => {
    expect(() => validarAcoesDePreset([{ action: "open_app", app_name: "chrome" }], false)).not.toThrow();
    expect(() => validarAcoesDePreset([{ action: "rm_rf" }], true)).toThrow(/inválida/);
    expect(() => validarAcoesDePreset([{ action: "power_control" }], false)).toThrow(/confirmação/);
    expect(() => validarAcoesDePreset([{ action: "power_control" }], true)).not.toThrow();
  });
  it("rotina destrutiva pelo texto", () => {
    expect(TEXTO_DESTRUTIVO.test("desliga o pc às 2h")).toBe(true);
    expect(TEXTO_DESTRUTIVO.test("me lembra de beber água")).toBe(false);
  });
  it("RPC: 'toString' não é método; apagar tarefa exige confirmação", async () => {
    await expect(handleRpc("toString", {}, { confirmed: false })).rejects.toMatchObject({ status: 404 });
    await expect(handleRpc("tarefas.delete", { id: "x" }, { confirmed: false })).rejects.toMatchObject({ status: 403 });
  });
});

describe("fase 20, bloco 200", async () => {
  const { origemDoApp } = await import("../src/main/rpcBridge");
  const { proximaRecusa } = await import("../src/services/server");
  const { mascarar } = await import("../src/main/logArquivo");
  it("só as telas do app chamam o RPC pelo IPC", () => {
    expect(origemDoApp("file:///C:/Users/usuario/AppData/Local/Programs/ELYSIUM/resources/app.asar/dist/renderer/dashboard.html")).toBe(true);
    expect(origemDoApp("file:///C:/x/dist/renderer/config.html#a")).toBe(true);
    expect(origemDoApp("https://evil.com/renderer/dashboard.html")).toBe(false);
    expect(origemDoApp("file:///C:/Users/usuario/Downloads/x.html")).toBe(false);
    expect(origemDoApp(undefined)).toBe(false);
  });
  it("20 recusas em 10 min bloqueiam por 10 min", () => {
    let r: ReturnType<typeof proximaRecusa> | undefined;
    for (let i = 0; i < 19; i++) r = proximaRecusa(r, 1000 + i);
    expect(r!.bloqueadoAte).toBe(0);
    r = proximaRecusa(r, 2000);
    expect(r.bloqueadoAte).toBeGreaterThan(2000);
    expect(proximaRecusa(r, 2000 + 11 * 60_000).n).toBe(1);
  });
  it("segredo do Google não vai para o log", () => {
    expect(mascarar("client GOCSPX-abcdefghijklmnop123")).toBe("client GOCSPX-[oculto]");
  });
});
