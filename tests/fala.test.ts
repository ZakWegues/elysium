import { beforeEach, describe, expect, it, vi } from "vitest";

// A fila de fala sem áudio: `synthesize` vira uma promessa que o teste solta à mão.
const tocadas: string[] = [];
const pendentes: Array<() => void> = [];
vi.mock("../src/services/tts", () => ({
  synthesize: vi.fn((t: string) => { tocadas.push(t); return new Promise<void>(r => pendentes.push(r)); }),
  cancelSpeak: vi.fn(),
  preSintetizar: vi.fn(),
  dividirEmFrases: (t: string) => t.split("|").filter(Boolean),
}));

const fala = await import("../src/main/fala");
const solta = async () => { pendentes.shift()?.(); await new Promise(r => setTimeout(r, 0)); };

describe("fila de fala (bloco 203)", () => {
  beforeEach(() => { fala.interromperTudo(); tocadas.length = 0; pendentes.length = 0; });

  it("toca os pedaços em ordem e resolve no último", async () => {
    let fim = false;
    const p = fala.falar("um|dois").then(() => { fim = true; });
    await new Promise(r => setTimeout(r, 0));
    expect(tocadas).toEqual(["um"]);
    expect(fala.estaFalando()).toBe(true);
    expect(fala.falaAtual()).toBe("um|dois");
    await solta();
    expect(tocadas).toEqual(["um", "dois"]);
    expect(fim).toBe(false);
    await solta();
    await p;
    expect(fim).toBe(true);
    expect(fala.estaFalando()).toBe(false);
  });

  it("interromper resolve quem esperava e avança o turno", async () => {
    const t0 = fala.turnoAtual();
    const p = fala.falar("a|b|c");
    await new Promise(r => setTimeout(r, 0));
    fala.interromperTudo();
    await p; // não fica pendurado
    expect(fala.turnoAtual()).toBe(t0 + 1);
    expect(fala.estaFalando()).toBe(false);
  });

  it("depois de interromper, a fala nova não ganha um segundo laço", async () => {
    void fala.falar("velha1|velha2");
    await new Promise(r => setTimeout(r, 0));
    fala.interromperTudo();
    void fala.falar("nova1|nova2");
    await new Promise(r => setTimeout(r, 0));
    expect(tocadas).toEqual(["velha1", "nova1"]);
    // O synthesize da fala velha termina agora: o laço velho não pode puxar "nova2".
    pendentes.shift()?.();
    await new Promise(r => setTimeout(r, 0));
    expect(tocadas).toEqual(["velha1", "nova1"]);
    await solta();
    expect(tocadas).toEqual(["velha1", "nova1", "nova2"]);
  });

  it("um ouvinte que lança não trava a fila", async () => {
    fala.aoMudarFala(() => { throw new Error("janela destruída"); });
    const p = fala.falar("x");
    await new Promise(r => setTimeout(r, 0));
    await solta();
    await p;
    expect(fala.estaFalando()).toBe(false);
    fala.aoMudarFala(() => {});
  });
});
