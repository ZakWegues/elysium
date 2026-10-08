import { describe, expect, it } from "vitest";
import { adiarPara, ajustarPeloTexto, diaDoTexto, horaDoTexto, interpretarTexto, limparDataDoTexto, resolverAmbigua } from "../src/services/planoDeLembrete";
import { estaAtrasada, fimDoPrazo, ordenarTarefas, proximaOcorrencia, type Tarefa } from "../src/services/tarefas";

// 08/10/2026 é uma quinta-feira, 10h.
const AGORA = new Date(2026, 9, 8, 10, 0);
const ymd = (d: Date | null) => d && `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

describe("parser de data (fase 18)", () => {
  it("dia da semana só com contexto: 'segunda prova' não é segunda-feira", () => {
    expect(diaDoTexto("segunda prova de física", AGORA)).toBeNull();
    expect(diaDoTexto("quinta série", AGORA)).toBeNull();
    expect(ymd(diaDoTexto("prova de física sexta", AGORA))).toBe("2026-10-9");
    expect(ymd(diaDoTexto("na segunda tenho dentista", AGORA))).toBe("2026-10-12");
    expect(ymd(diaDoTexto("sexta-feira", AGORA))).toBe("2026-10-9");
    expect(ymd(diaDoTexto("reunião terça às 15h", AGORA))).toBe("2026-10-13");
  });
  it("dia 31 que não existe no mês vai para o próximo mês que tem", () => {
    // Outubro tem 31: dia 31 é este mês. Em novembro (30 dias) dia 31 pula para dezembro.
    expect(ymd(diaDoTexto("dia 31", AGORA))).toBe("2026-10-31");
    expect(ymd(diaDoTexto("dia 31", new Date(2026, 10, 5)))).toBe("2026-12-31");
  });
  it("hora: '12 da noite' é meia-noite; 'às 3' é ambígua; 'às 3h' não", () => {
    expect(horaDoTexto("às 12 da noite")).toEqual({ h: 0, m: 0 });
    expect(horaDoTexto("às 3")).toEqual({ h: 3, m: 0, ambigua: true });
    expect(horaDoTexto("às 3h")).toEqual({ h: 3, m: 0 });
    expect(horaDoTexto("às 15")).toEqual({ h: 15, m: 0 });
    expect(horaDoTexto("às 9:30")).toEqual({ h: 9, m: 30 });
  });
  it("hora ambígua: modelo decide se escolheu uma das duas; senão 1–6 é tarde", () => {
    expect(resolverAmbigua(3, 0, AGORA, null, AGORA)).toBe(15);
    expect(resolverAmbigua(9, 0, new Date(2026, 9, 9), 21, AGORA)).toBe(21);
    expect(resolverAmbigua(9, 0, AGORA, null, AGORA)).toBe(21); // 9h de hoje já passou
    expect(resolverAmbigua(9, 0, new Date(2026, 9, 9), null, AGORA)).toBe(9);
    expect(ajustarPeloTexto("me lembra de ligar às 3", "2026-10-08T03:00", AGORA)?.quando).toBe("2026-10-08T15:00");
  });
});

describe("quick add (fase 18)", () => {
  it("tira a data do texto e devolve o quando", () => {
    expect(interpretarTexto("prova de física sexta às 14h", AGORA)).toEqual({ texto: "Prova de física", quando: "2026-10-09T14:00", semHora: false });
    expect(interpretarTexto("dentista amanhã", AGORA)).toEqual({ texto: "Dentista", quando: "2026-10-09", semHora: true });
    expect(interpretarTexto("comprar pão", AGORA)).toEqual({ texto: "comprar pão", quando: null, semHora: false });
    expect(interpretarTexto("segunda prova de cálculo", AGORA).quando).toBeNull();
  });
  it("só hora que já passou hoje vira amanhã", () => {
    expect(interpretarTexto("ligar pro banco às 9h", AGORA).quando).toBe("2026-10-09T09:00");
  });
  it("limpar data não mexe em texto sem data", () => {
    expect(limparDataDoTexto("Ler o capítulo 3")).toBe("Ler o capítulo 3");
    expect(limparDataDoTexto("tenho prova de química dia 20")).toBe("Prova de química");
  });
});

describe("tarefas: prazo, atraso, repetição e adiar (fase 18)", () => {
  const base: Tarefa = { id: "t", texto: "x", feita: false, criadaEm: 0, origem: "manual" };
  it("sem hora só atrasa depois que o dia acaba", () => {
    const prazo = new Date(2026, 9, 8, 8, 0).getTime();
    expect(estaAtrasada({ ...base, prazo, semHora: true }, AGORA.getTime())).toBe(false);
    expect(estaAtrasada({ ...base, prazo }, AGORA.getTime())).toBe(true);
    expect(new Date(fimDoPrazo({ prazo, semHora: true })!).getHours()).toBe(23);
  });
  it("estrela vai para o topo", () => {
    const ts = [{ ...base, id: "a", prazo: 1 }, { ...base, id: "b", prazo: 2, prioridade: "alta" as const }];
    expect(ordenarTarefas(ts, AGORA.getTime()).map(t => t.id)).toEqual(["b", "a"]);
  });
  it("próxima ocorrência pula as que já passaram", () => {
    const prazo = new Date(2026, 8, 30, 9, 0).getTime(); // 30/09
    expect(new Date(proximaOcorrencia(prazo, "semanal", AGORA.getTime())).getDate()).toBe(14);
    expect(new Date(proximaOcorrencia(prazo, "diaria", AGORA.getTime())).getDate()).toBe(9);
  });
  it("adiar", () => {
    expect(adiarPara(undefined, false, "hoje16", AGORA)).toEqual({ quando: "2026-10-08T16:00", semHora: false });
    expect(adiarPara(undefined, false, "1h", AGORA)).toEqual({ quando: "2026-10-08T11:00", semHora: false });
    expect(adiarPara(new Date(2026, 9, 7, 14, 30).getTime(), false, "amanha", AGORA)).toEqual({ quando: "2026-10-09T14:30", semHora: false });
    expect(adiarPara(new Date(2026, 9, 7, 8).getTime(), true, "semana", AGORA)).toEqual({ quando: "2026-10-15", semHora: true });
  });
});

describe("hora não é lida onde não é hora (revisão 08/10)", () => {
  it("artigo e duração", () => {
    expect(horaDoTexto("comprar as 2 camisas")).toBeNull();
    expect(horaDoTexto("estudar 2h de física")).toBeNull();
    expect(horaDoTexto("correr por 1h")).toBeNull();
    expect(horaDoTexto("prova sexta 14h")).toEqual({ h: 14, m: 0 });
    expect(horaDoTexto("ligar às 3 amanhã")).toEqual({ h: 3, m: 0, ambigua: true });
    expect(horaDoTexto("reunião às 15")).toEqual({ h: 15, m: 0 });
    expect(interpretarTexto("Comprar as 2 camisas", AGORA).quando).toBeNull();
  });
});
