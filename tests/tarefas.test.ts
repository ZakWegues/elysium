import { describe, expect, it } from "vitest";
import { ehCompromisso, interpretarQuando, planejarLembretes } from "../src/services/planoDeLembrete";
import { acharTarefa, ordenarTarefas, type Tarefa } from "../src/services/tarefas";
import { fatosDoDia } from "../src/services/hoje";

// Quarta, 07/10/2026, 10h.
const AGORA = new Date(2026, 9, 7, 10, 0).getTime();
const em = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

describe("lembretes inteligentes (fase 17)", () => {
  it("sem hora dita: 16h no horário local (não meia-noite UTC)", () => {
    expect(interpretarQuando("2026-10-09")).toEqual({ ms: em(9, 16), temHora: false });
    expect(interpretarQuando("2026-10-09T09:30")).toEqual({ ms: em(9, 9, 30), temHora: true });
    expect(interpretarQuando("2026-10-09T00:00", true)).toEqual({ ms: em(9, 16), temHora: false });
    expect(interpretarQuando("depois")).toBeNull();
  });
  it("compromisso ganha véspera às 16h; sem hora, o aviso do dia é às 8h", () => {
    expect(ehCompromisso("prova de cálculo")).toBe(true);
    expect(ehCompromisso("ligar pra mãe")).toBe(false);
    expect(ehCompromisso("ligar pro dentista")).toBe(false);
    expect(ehCompromisso("consulta no dentista")).toBe(true);
    const p = planejarLembretes("prova de cálculo", { ms: em(9, 16), temHora: false }, AGORA);
    expect(p).toEqual([
      { texto: "Amanhã: prova de cálculo", em: em(8, 16), vespera: true },
      { texto: "prova de cálculo", em: em(9, 8) },
    ]);
    const comHora = planejarLembretes("consulta no dentista", { ms: em(9, 14, 30), temHora: true }, AGORA);
    expect(comHora.map(a => a.em)).toEqual([em(8, 16), em(9, 14, 30)]);
  });
  it("coisa comum: um aviso só; véspera que já passou não entra", () => {
    expect(planejarLembretes("ligar pra mãe", { ms: em(8, 16), temHora: false }, AGORA)).toEqual([{ texto: "ligar pra mãe", em: em(8, 16) }]);
    expect(planejarLembretes("prova", { ms: em(7, 18), temHora: true }, AGORA)).toEqual([{ texto: "prova", em: em(7, 18) }]);
  });
});

describe("lista de tarefas (fase 17)", () => {
  const t = (id: string, extra: Partial<Tarefa>): Tarefa => ({ id, texto: id, feita: false, criadaEm: 1, origem: "manual", ...extra });
  it("pendentes por prazo (sem prazo no fim), depois as feitas de hoje; feitas de ontem somem", () => {
    const lista = ordenarTarefas([
      t("sem-prazo", {}),
      t("depois", { prazo: em(9, 8) }),
      t("antes", { prazo: em(8, 16) }),
      t("feita-hoje", { feita: true, feitaEm: em(7, 9) }),
      t("feita-ontem", { feita: true, feitaEm: em(6, 9) }),
    ], AGORA);
    expect(lista.map(x => x.id)).toEqual(["antes", "depois", "sem-prazo", "feita-hoje"]);
  });
  it("acha pela parte do texto, sem acento, só entre as pendentes", () => {
    const ts = [t("a", { texto: "Prova de cálculo" }), t("b", { texto: "Pagar a luz", feita: true })];
    expect(acharTarefa(ts, "a prova")?.id).toBe("a");
    expect(acharTarefa(ts, "calculo")?.id).toBe("a");
    expect(acharTarefa(ts, "pagar a luz")).toBeUndefined();
  });
  it("os fatos do resumo humano: atrasadas, hoje, amanhã, ressalvas, hábito em jogo", () => {
    const fatos = fatosDoDia({
      saudacao: "", data: "", clima: null, lembretes: [], timers: [], listas: [], metas: [], proximaRotina: null, alertas: [],
      tarefas: [t("x", { texto: "relatório", prazo: em(7, 8) }), t("y", { texto: "prova", prazo: em(8, 8) }), t("z", { texto: "academia", feita: true, feitaEm: em(7, 9), ressalva: "só cardio" })],
      habitos: [{ id: "h", nome: "Leitura", icone: "", dias: [], marcados: [], criadoEm: 0, feitoHoje: false, valeHoje: true, sequencia: 5, recorde: 5, taxa: 1, mapa: [] }],
    }, new Date(AGORA));
    expect(fatos).toEqual([
      "Atrasadas: relatório",
      "Amanhã: prova",
      "Já concluídas hoje: academia (ressalva: só cardio)",
      "Hábitos que faltam hoje: Leitura (sequência de 5 dias em jogo)",
    ]);
  });
});

describe("dia e hora da fala (fase 17)", async () => {
  const { diaDoTexto, horaDoTexto, ajustarPeloTexto } = await import("../src/services/planoDeLembrete");
  // Quinta, 08/10/2026.
  const QUI = new Date(2026, 9, 8, 21, 0);
  const dia = (d: Date | null) => d && `${d.getDate()}/${d.getMonth() + 1}`;
  it("dias: amanhã, sexta, dia 12, 12/10, hoje", () => {
    expect(dia(diaDoTexto("tenho prova de física sexta", QUI))).toBe("9/10");
    expect(dia(diaDoTexto("me lembra amanhã de pagar a luz", QUI))).toBe("9/10");
    expect(dia(diaDoTexto("consulta quinta", QUI))).toBe("15/10");
    expect(dia(diaDoTexto("entrega dia 12", QUI))).toBe("12/10");
    expect(dia(diaDoTexto("entrega dia 3", QUI))).toBe("3/11");
    expect(dia(diaDoTexto("show 25/12", QUI))).toBe("25/12");
    expect(dia(diaDoTexto("depois de amanhã tem jogo", QUI))).toBe("10/10");
    expect(diaDoTexto("me lembra de beber água", QUI)).toBeNull();
  });
  it("horas: às 15h, 15:30, 3 da tarde, meio-dia, de manhã", () => {
    expect(horaDoTexto("às 15h")).toEqual({ h: 15, m: 0 });
    expect(horaDoTexto("prova 15:30")).toEqual({ h: 15, m: 30 });
    expect(horaDoTexto("às 3 da tarde")).toEqual({ h: 15, m: 0 });
    expect(horaDoTexto("14h45")).toEqual({ h: 14, m: 45 });
    expect(horaDoTexto("meio-dia")).toEqual({ h: 12, m: 0 });
    expect(horaDoTexto("amanhã de manhã")).toEqual({ h: 9, m: 0 });
    expect(horaDoTexto("prova sexta")).toBeNull();
  });
  it("ajuste: o dia da fala vence a conta do modelo; sem hora, 16h; daqui a N fica com o modelo", () => {
    expect(ajustarPeloTexto("tenho prova de física sexta", "2026-10-13", QUI)).toEqual({ quando: "2026-10-09", semHora: true });
    expect(ajustarPeloTexto("me lembra amanhã de pagar a luz", "2026-10-09T00:00", QUI)).toEqual({ quando: "2026-10-09", semHora: true });
    expect(ajustarPeloTexto("consulta sexta às 14h", "2026-10-13T09:00", QUI)).toEqual({ quando: "2026-10-09T14:00", semHora: false });
    expect(ajustarPeloTexto("me lembra daqui a 20 minutos", "2026-10-08T21:20", QUI)).toBeNull();
    expect(ajustarPeloTexto("amanhã a luz e sexta a prova", "2026-10-09", QUI)).toBeNull();
    expect(ajustarPeloTexto("depois de amanhã tem jogo", "2026-10-11", QUI)).toEqual({ quando: "2026-10-10", semHora: true });
  });
});
