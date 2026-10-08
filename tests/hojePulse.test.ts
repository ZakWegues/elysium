import { describe, expect, it } from "vitest";
import { montarRevisao } from "../src/services/revisaoSemana";
import { meuAmanha } from "../src/services/hoje";
import { decidirAviso } from "../src/services/avisos";
import { diaDe } from "../src/services/habitos";

const AGORA = new Date(2026, 9, 11, 19, 0); // domingo, 19h
const t = (id: string, extra = {}) => ({ id, texto: id, feita: false, criadaEm: 0, origem: "manual" as const, ...extra });

describe("Hoje estilo Pulse (fase 18)", () => {
  it("revisão: feitas, atrasadas e hábitos (treino fica de fora do texto)", () => {
    const r = montarRevisao({
      tarefas: [t("Prova", { feita: true, feitaEm: AGORA.getTime() - 86_400_000 }), t("Relatório", { prazo: AGORA.getTime() - 3 * 86_400_000 })],
      habitos: [{ id: "h", nome: "Leitura", icone: "", dias: [], marcados: [0, 1, 2, 3, 4, 5, 6].map(i => diaDe(new Date(2026, 9, 11 - i))), criadoEm: 0 }],
      metas: [], treinos: 3, corridas: 2,
    }, AGORA);
    expect(r.concluidas).toEqual(["Prova"]);
    expect(r.atrasadas).toEqual(["Relatório"]);
    expect(r.habitos[0]).toMatchObject({ nome: "Leitura", feitos: 7, dias: 7 });
    expect(r.texto).toContain("Leitura foi perfeito");
    expect(r.texto).not.toContain("treino");
  });
  it("meu amanhã só depois das 18h, com as tarefas de amanhã", () => {
    const amanha = new Date(2026, 9, 12, 10).getTime();
    expect(meuAmanha([t("x", { prazo: amanha })], null, new Date(2026, 9, 11, 10))).toBeNull();
    expect(meuAmanha([t("x", { prazo: amanha }), t("y", { prazo: amanha + 3 * 86_400_000 })], null, AGORA)?.tarefas.map(x => x.id)).toEqual(["x"]);
  });
  it("orçamento de avisos: foco segura; acima do limite fica discreto", () => {
    expect(decidirAviso({ focoAtivo: true, usadosHoje: 0, limite: 6 })).toBe("discreto");
    expect(decidirAviso({ focoAtivo: false, usadosHoje: 5, limite: 6 })).toBe("alto");
    expect(decidirAviso({ focoAtivo: false, usadosHoje: 6, limite: 6 })).toBe("discreto");
  });
});
