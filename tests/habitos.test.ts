import { describe, expect, it } from "vitest";
import { acharHabito, diaDe, mapa30, pedidoDeHabito, recorde, sequenciaAtual, somarProgresso, taxa30 } from "../src/services/habitos";
import { fraseDeAbertura, saudacaoStark } from "../src/services/hoje";

// 07/10/2026 é uma quarta-feira (3).
const HOJE = new Date(2026, 9, 7, 15, 0);
const dias = (...n: number[]) => n.map(i => diaDe(new Date(2026, 9, 7 - i)));

describe("hábitos (fase 16)", () => {
  it("sequência: hoje ainda não feito não quebra; um dia válido sem marcar quebra", () => {
    expect(sequenciaAtual({ dias: [], marcados: dias(1, 2, 3) }, HOJE)).toBe(3);
    expect(sequenciaAtual({ dias: [], marcados: dias(0, 1, 2, 3) }, HOJE)).toBe(4);
    expect(sequenciaAtual({ dias: [], marcados: dias(0, 2, 3) }, HOJE)).toBe(1);
  });
  it("dias da semana: seg/qua/sex não quebram na terça", () => {
    // seg (5/10) e qua (hoje) feitos; terça não vale.
    const h = { dias: [1, 3, 5], marcados: dias(0, 2, 5) };
    expect(sequenciaAtual(h, HOJE)).toBe(3);
    expect(mapa30(h, HOJE)[28]).toBeNull(); // ontem (terça) não vale
    expect(mapa30(h, HOJE)[29]).toBe(true);
  });
  it("recorde e taxa", () => {
    const h = { dias: [], marcados: dias(10, 9, 8, 7, 1) };
    expect(recorde(h, HOJE)).toBe(4);
    expect(taxa30(h, HOJE)).toBeCloseTo(5 / 29, 5);
  });
  it("acha o hábito pelo nome falado e entende 'marquei academia'", () => {
    const hs = [{ nome: "Academia 💪" }, { nome: "Leitura" }];
    expect(acharHabito(hs, "a academia")?.nome).toBe("Academia 💪");
    expect(acharHabito(hs, "leitura")?.nome).toBe("Leitura");
    expect(acharHabito(hs, "natação")).toBeUndefined();
    expect(pedidoDeHabito("marquei academia")).toBe("academia");
    expect(pedidoDeHabito("fiz o hábito de leitura hoje")).toBe("leitura");
    expect(pedidoDeHabito("abre o spotify")).toBeNull();
  });
  it("meta: soma sem passar do alvo e marca concluída", () => {
    const m = { id: "m", titulo: "Ler", alvo: 12, unidade: "livros", progresso: 11, criadaEm: 0 };
    expect(somarProgresso(m, 5, 99)).toMatchObject({ progresso: 12, concluidaEm: 99 });
    expect(somarProgresso(m, -20).progresso).toBe(0);
  });
});

describe("Hoje (fase 16)", () => {
  it("saudação no tom da Ely, com ou sem tratamento", () => {
    expect(saudacaoStark(8, "chefe")).toBe("Bom dia, chefe.");
    expect(saudacaoStark(20, "")).toBe("Boa noite.");
    expect(saudacaoStark(3, "senhor")).toBe("Boa madrugada, senhor.");
  });
  it("frase de abertura junta o que pede atenção", () => {
    expect(fraseDeAbertura({ lembretesHoje: 0, habitosFaltando: 0, chuva: false, alertas: 0, timers: 0 })).toBe("Sistemas no ar. Nada pendente por enquanto.");
    expect(fraseDeAbertura({ lembretesHoje: 2, habitosFaltando: 1, chuva: true, alertas: 0, timers: 0 }))
      .toBe("Sistemas no ar. Dois lembretes para hoje, falta um hábito e chuva no radar.");
  });
});

describe("metas pela fala (fase 16)", async () => {
  const { pedidoDeMeta } = await import("../src/services/habitos");
  it("soma, avança e tira", () => {
    expect(pedidoDeMeta("soma 2 na meta teste livros")).toEqual({ meta: "teste livros", delta: 2 });
    expect(pedidoDeMeta("mais um livro na meta leitura")).toEqual({ meta: "leitura", delta: 1 });
    expect(pedidoDeMeta("avança a meta viagem em 200")).toEqual({ meta: "viagem", delta: 200 });
    expect(pedidoDeMeta("tira 1 da meta leitura")).toEqual({ meta: "leitura", delta: -1 });
    expect(pedidoDeMeta("qual a minha meta")).toBeNull();
  });
});
