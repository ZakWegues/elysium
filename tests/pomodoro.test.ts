import { afterEach, describe, expect, it, vi } from "vitest";
import {
  avancar, cicloDa, comecarPomodoro, configValida, estadoPomodoro, falaDaFase, falaDoEstado, iniciarPomodoro,
  montarFases, novoEstado, pararPomodoro, pedidoDePomodoro, pular, pularFase, PADRAO,
} from "../src/services/pomodoro";
import { fastRoute } from "../src/services/fastRoute";

const MIN = 60_000;

describe("pomodoro (bloco 208)", () => {
  afterEach(() => { pararPomodoro(); });

  it("monta F P F P F P F L, e sem longa abaixo de 4 ciclos", () => {
    expect(montarFases(PADRAO).map(f => f.tipo).join(" ")).toBe("foco pausa foco pausa foco pausa foco longa");
    expect(montarFases({ ...PADRAO, ciclos: 2 }).map(f => f.tipo).join(" ")).toBe("foco pausa foco");
    expect(configValida({ foco: 500, pausa: 0, ciclos: 3 })).toEqual({ foco: 25, pausa: 5, longa: 15, ciclos: 3 });
  });

  it("avança encostado no fim da fase anterior, mesmo depois de horas", () => {
    const e = novoEstado(PADRAO, 0);
    expect(avancar(e, 24 * MIN).entrou).toEqual([]);
    const r = avancar(e, 25 * MIN);
    expect(r.entrou).toEqual([1]);
    expect(r.estado.fimEm).toBe(30 * MIN);
    // Desligado no meio: 62 min depois está no 3º foco (25+5+25+5 = 60), e o fim é aos 85.
    const longe = avancar(e, 62 * MIN);
    expect(longe.estado.indice).toBe(4);
    expect(longe.estado.fimEm).toBe(85 * MIN);
    expect(cicloDa(longe.estado)).toEqual({ ciclo: 3, de: 4 });
    expect(avancar(e, 10 * 60 * MIN).terminou).toBe(true);
  });

  it("pular encerra a fase atual agora", () => {
    const e = novoEstado(PADRAO, 0);
    const r = avancar(pular(e, 3 * MIN), 3 * MIN);
    expect(r.estado.indice).toBe(1);
    expect(r.estado.fimEm).toBe(8 * MIN);
  });

  it("as falas", () => {
    const e = novoEstado(PADRAO, 0);
    expect(falaDaFase(e, 0)).toBe("Foco: 25 minutos. Ciclo 1 de 4.");
    expect(falaDaFase(e, 1)).toBe("Pausa de 5 minutos. 1 de 4 ciclos feitos.");
    expect(falaDaFase(e, 7)).toMatch(/Pausa longa de 15/);
    expect(falaDoEstado(e, 10 * MIN)).toBe("Pomodoro: foco, faltam 15 minutos. Ciclo 1 de 4.");
  });

  it("entende o que se fala", () => {
    expect(pedidoDePomodoro("Ely, pomodoro")).toEqual({ tipo: "start", config: {} });
    expect(pedidoDePomodoro("começa um pomodoro de 50")).toEqual({ tipo: "start", config: { foco: 50 } });
    expect(pedidoDePomodoro("pomodoro de 50 e 10")).toEqual({ tipo: "start", config: { foco: 50, pausa: 10 } });
    expect(pedidoDePomodoro("pomodoro de 40 minutos, 3 ciclos")).toEqual({ tipo: "start", config: { foco: 40, ciclos: 3 } });
    expect(pedidoDePomodoro("para o pomodoro")).toEqual({ tipo: "stop" });
    expect(pedidoDePomodoro("quanto falta do pomodoro?")).toEqual({ tipo: "status" });
    expect(pedidoDePomodoro("pula a pausa")).toEqual({ tipo: "skip" });
    expect(pedidoDePomodoro("pomodoro amanhã às 9")).toBeNull();
    expect(pedidoDePomodoro("o que é a técnica pomodoro?")).toBeNull();
    expect(pedidoDePomodoro("pula")).toBeNull();
    expect(fastRoute("pomodoro de 50")?.[0]).toMatchObject({ action: "pomodoro", operacao: "start", foco: 50 });
    expect(fastRoute("pula")?.[0]).toMatchObject({ action: "media_control" });
  });

  it("começa, liga o foco, troca de fase pelo relógio, e para", async () => {
    vi.useFakeTimers();
    try {
      const focos: number[] = [];
      let parou = 0;
      const avisos: string[] = [];
      iniciarPomodoro({ avisar: (_t, f) => avisos.push(f), focoLigar: async (m) => { focos.push(m); }, focoParar: () => { parou++; } });
      await comecarPomodoro({ foco: 25, pausa: 5, ciclos: 2 });
      expect(focos).toEqual([25]);
      await vi.advanceTimersByTimeAsync(25 * MIN + 10);
      expect(avisos).toEqual(["Pausa de 5 minutos. 1 de 2 ciclos feitos."]);
      expect(parou).toBe(1);
      await pularFase();
      expect(avisos[1]).toBe("Foco: 25 minutos. Ciclo 2 de 2.");
      expect(estadoPomodoro().indice).toBe(2);
      await vi.advanceTimersByTimeAsync(25 * MIN + 10);
      expect(avisos.at(-1)).toMatch(/concluído/);
      expect(estadoPomodoro().ativo).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
