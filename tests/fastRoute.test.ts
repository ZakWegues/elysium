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
    // Cidade sem fuso conhecido continua indo ao cérebro (Tóquio agora é atalho — fase 14).
    expect(acoes("que horas são em pasárgada")).toBeNull();
  });

  it("'memória' sozinha é ambígua (RAM ou o que ele lembra)", () => {
    expect(acoes("memória")).toBeNull();
  });

  it("vazio e pontuação", () => {
    expect(acoes("")).toBeNull();
    expect(acoes("...")).toBeNull();
  });
});

describe("modo foco no atalho (fase 12)", () => {
  it("'para' é o verbo: para, desliga, sai do foco param", () => {
    for (const f of ["para o modo foco", "Para o foco.", "desliga o foco", "sai do modo foco", "encerra o foco"]) {
      expect(fastRoute(f), f).toEqual([{ action: "focus", operation: "stop" }]);
    }
  });
  it("começar, com ou sem minutos", () => {
    expect(fastRoute("modo foco")).toEqual([{ action: "focus", operation: "start", minutes: undefined }]);
    expect(fastRoute("entra em modo foco por 40 minutos")).toEqual([{ action: "focus", operation: "start", minutes: 40 }]);
    expect(fastRoute("liga o foco")).toEqual([{ action: "focus", operation: "start", minutes: undefined }]);
  });
  it("quanto falta", () => {
    expect(fastRoute("quanto falta do foco?")).toEqual([{ action: "focus", operation: "status" }]);
  });
  it("não sequestra frase maior", () => {
    expect(fastRoute("para o foco da câmera no rosto")).toBeNull();
  });
});

describe("resumo do dia no atalho (fase 13)", () => {
  it("bom dia e variações", () => {
    for (const f of ["Bom dia!", "bom dia elysium", "resumo do dia", "como está meu dia?", "o que tenho pra hoje"]) {
      expect(fastRoute(f), f).toEqual([{ action: "daily_summary" }]);
    }
  });
});

describe("fastRoute — listas, timers e conta (fase 14)", () => {
  it("lista, timer e conta saem sem modelo, com o texto original", () => {
    expect(fastRoute("põe leite e café na lista do mercado")).toEqual([{ action: "list_add", items: ["leite", "café"], list: "Compras" }]);
    expect(fastRoute("timer de 10 minutos do miojo")).toEqual([{ action: "timer_start", ms: 600_000, name: "miojo" }]);
    expect(fastRoute("quanto é 15% de 230?")).toEqual([{ action: "calculate", expression: "quanto é 15% de 230?" }]);
    expect(acoes("12 * 7")).toEqual(["calculate"]);
    expect(acoes("o que tem na lista do mercado")).toEqual(["list_show"]);
    expect(acoes("cancela o timer do miojo")).toEqual(["timer_cancel"]);
    expect(fastRoute("que horas são em tóquio agora?")).toEqual([{ action: "world_time", city: "tóquio" }]);
    expect(acoes("que horas são")).toEqual(["system_info"]);
  });

  it("não confunde: pergunta sem conta, 'quanto é' sem número, música", () => {
    expect(fastRoute("quanto é a gasolina hoje")).toBeNull();
    expect(fastRoute("põe uma música na lista de reprodução do spotify")).toBeNull();
    expect(acoes("calcula a rota pro trabalho")).toBeNull();
  });
});
