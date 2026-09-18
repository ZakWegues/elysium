import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A Open-Meteo é substituída por um `fetch` falso com a resposta que a API real deu em
 * 18/09/2026 para São Paulo (recortada). O que se testa é o PARSE e a frase falada — a
 * parte que quebra em silêncio quando a API muda um campo.
 */
const config = { climaCidade: "São Paulo", climaLat: -23.55, climaLon: -46.63 };
vi.mock("../src/main/config", () => ({ getConfig: () => config }));

const resposta = {
  current: { temperature_2m: 21.6, weather_code: 3, apparent_temperature: 23.1, relative_humidity_2m: 67, wind_speed_10m: 5.2 },
  hourly: {
    time: ["2026-09-18T13:00", "2026-09-18T14:00", "2026-09-18T15:00", "2026-09-18T16:00", "2026-09-18T17:00", "2026-09-18T18:00", "2026-09-18T19:00", "2026-09-18T20:00"],
    temperature_2m: [21, 22, 22, 20, 19, 17, 17, 16],
    weather_code: [3, 3, 3, 61, 3, 3, 3, 3],
  },
  daily: { temperature_2m_max: [22.4, 26.1], temperature_2m_min: [14.2, 15.0], weather_code: [3, 0] },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 18, 13, 20, 0));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => resposta })));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function carregar() {
  vi.resetModules();
  return await import("../src/services/clima");
}

describe("clima — parse", () => {
  it("lê o agora, as próximas 6 horas a partir da hora cheia atual e o amanhã", async () => {
    const c = await (await carregar()).climaAgora();
    expect(c).not.toBeNull();
    expect(Math.round(c!.temperatura)).toBe(22);
    expect(c!.descricao).toBe("nublado");
    expect(c!.icone).toBe("cloud");
    expect(c!.sensacao).toBe(23.1);
    expect(c!.umidade).toBe(67);
    // 13:00 é a hora atual; as próximas seis começam em 14h.
    expect(c!.horas!.map(h => h.hora)).toEqual([14, 15, 16, 17, 18, 19]);
    expect(c!.horas![2]).toMatchObject({ hora: 16, icone: "droplet", chuva: true });
    expect(c!.amanha).toEqual({ max: 26.1, min: 15.0, icone: "sun" });
  });

  it("sem cidade não consulta nada", async () => {
    config.climaCidade = "";
    const m = await carregar();
    expect(await m.climaAgora()).toBeNull();
    expect(m.motivoDaFalha()).toBe("sem-cidade");
    expect(fetch).not.toHaveBeenCalled();
    config.climaCidade = "São Paulo";
  });

  it("usa o cache por uma hora", async () => {
    const m = await carregar();
    await m.climaAgora();
    await m.climaAgora();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("clima — a frase falada (ação weather)", () => {
  it("diz cidade, temperatura, máx/mín, a chuva mais próxima e o amanhã", async () => {
    const frase = await (await carregar()).climaFalado();
    expect(frase).toBe("Em São Paulo, 22 graus e nublado. Máxima de 22, mínima de 14. Chuva por volta das 16 horas. Amanhã, 26 de máxima e 15 de mínima.");
  });

  it("explica quando falta cidade e quando falta rede", async () => {
    config.climaCidade = "";
    expect(await (await carregar()).climaFalado()).toMatch(/defina em Ajustes/);
    config.climaCidade = "São Paulo";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await (await carregar()).climaFalado()).toMatch(/sem internet/);
  });
});
