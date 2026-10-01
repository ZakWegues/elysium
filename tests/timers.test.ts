import { describe, expect, it, vi } from "vitest";

vi.mock("electron-store", () => ({ default: class { get(_k: string, d: unknown) { return d; } set() { /* */ } } }));

describe("timers com nome (bloco 136)", async () => {
  const { interpretarTimer, duracao, duracaoFalada } = await import("../src/services/timers");

  it("entende o pedido com e sem nome", () => {
    expect(interpretarTimer("timer de 10 minutos do miojo")).toEqual({ ms: 600_000, nome: "miojo" });
    expect(interpretarTimer("põe um timer de 30 segundos pro pão de queijo")).toEqual({ ms: 30_000, nome: "pão de queijo" });
    expect(interpretarTimer("temporizador de 1 hora e meia")).toEqual({ ms: 5_400_000, nome: "" });
    expect(interpretarTimer("cronômetro de meia hora para a lasanha")).toEqual({ ms: 1_800_000, nome: "lasanha" });
    expect(interpretarTimer("timer de cinco minutos")).toEqual({ ms: 300_000, nome: "" });
  });

  it("recusa o que não é timer ou não tem duração", () => {
    expect(interpretarTimer("me lembra em 10 minutos")).toBeNull();
    expect(interpretarTimer("timer do miojo")).toBeNull();
    expect(duracao("3 dias")).toBeNull();
  });

  it("duração falada", () => {
    expect(duracaoFalada(610_000)).toBe("10 minutos e 10 segundos");
    expect(duracaoFalada(3_660_000)).toBe("1 hora e 1 minuto");
    expect(duracaoFalada(1000)).toBe("1 segundo");
  });
});
