import { describe, expect, it } from "vitest";
import { fastRoute } from "../src/services/fastRoute";

/**
 * A regra do fastRoute é "só padrão sem ambiguidade": um falso positivo executa a ação
 * errada sem chance de correção. Por isso metade destes testes é do que NÃO pode casar.
 */
const acoes = (texto: string) => fastRoute(texto)?.map(a => a.action) ?? null;

describe("fastRoute — o que casa", () => {
  it("mídia e volume", () => {
    expect(acoes("pausa")).toEqual(["media_control"]);
    expect(acoes("Próxima música")).toEqual(["media_control"]);
    expect(acoes("volume 40")).toEqual(["volume_control"]);
    expect(acoes("muta")).toEqual(["volume_control"]);
  });

  it("volume numérico é grampeado em 0–100", () => {
    const r = fastRoute("volume 250") as { level: number }[];
    expect(r[0].level).toBe(100);
  });

  it("informação do sistema, com e sem acento", () => {
    expect(acoes("que horas são")).toEqual(["system_info"]);
    expect(acoes("Que horas sao?")).toEqual(["system_info"]);
    expect(acoes("temperatura da cpu")).toEqual(["system_info"]);
  });

  it("clima (bloco 68): as formas de perguntar", () => {
    for (const t of ["como está o tempo", "como tá o tempo hoje?", "clima", "vai chover", "previsão do tempo", "tá frio lá fora"]) {
      expect(acoes(t), t).toEqual(["weather"]);
    }
  });

  it("lembretes de hoje (bloco 68)", () => {
    expect(acoes("quais são os meus lembretes de hoje?")).toEqual(["list_reminders"]);
    expect(acoes("meus lembretes")).toEqual(["list_reminders"]);
  });

  it("energia", () => {
    expect(acoes("bloqueia o pc")).toEqual(["power_control"]);
    expect(acoes("cancela o desligamento")).toEqual(["power_control"]);
  });
});

describe("fastRoute — o que tem que ir para o cérebro", () => {
  it("frases compostas ou com contexto", () => {
    expect(acoes("pausa a música e abre o chrome")).toBeNull();
    expect(acoes("volume 40 e toca lo-fi")).toBeNull();
    expect(acoes("que horas são em tóquio")).toBeNull();
  });

  it("'memória' sozinha é ambígua (RAM ou o que ele lembra)", () => {
    expect(acoes("memória")).toBeNull();
  });

  it("vazio e pontuação", () => {
    expect(acoes("")).toBeNull();
    expect(acoes("...")).toBeNull();
  });
});
