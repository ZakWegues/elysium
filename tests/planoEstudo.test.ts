import { describe, expect, it } from "vitest";
import { acharProva, distribuirSessoes, pedidoDePlano, resumoDoPlano, sessoesComoItens } from "../src/services/planoEstudo";
import { fastRoute } from "../src/services/fastRoute";
import { validarItens } from "../src/services/despejo";
import type { Tarefa } from "../src/services/tarefas";

describe("plano de estudo (bloco 210)", () => {
  it("espalha os assuntos e deixa a véspera para revisão", () => {
    // Hoje sexta 09/10, prova sexta 16/10: livres sáb 10 a qui 15 (6 dias), véspera = 15.
    const s = distribuirSessoes("física", ["cinemática", "dinâmica", "energia"], "2026-10-09", "2026-10-16");
    expect(s.map(x => x.dia)).toEqual(["2026-10-10", "2026-10-11", "2026-10-13", "2026-10-15"]);
    expect(s[0].texto).toBe("Estudar física: cinemática");
    expect(s.at(-1)!.texto).toMatch(/Revisão geral de física/);
    expect(s.every(x => x.hora === "19:00")).toBe(true);
  });

  it("mais assuntos que dias: alguns dias pegam dois", () => {
    const s = distribuirSessoes("química", ["a", "b", "c", "d", "e"], "2026-10-09", "2026-10-13", "20:00");
    // Livres 10, 11, 12; véspera 12 → estudo em 10 e 11.
    expect(s.map(x => x.texto)).toEqual(["Estudar química: a e b e c", "Estudar química: d e e", "Revisão geral de química (véspera da prova)"]);
  });

  it("prova amanhã = revisão hoje; prova hoje = nada; sem assuntos = sessões da matéria", () => {
    expect(distribuirSessoes("história", [], "2026-10-09", "2026-10-10")).toEqual([{ dia: "2026-10-09", hora: "19:00", texto: "Revisão de história" }]);
    expect(distribuirSessoes("história", [], "2026-10-09", "2026-10-09")).toEqual([]);
    expect(distribuirSessoes("história", [], "2026-10-09", "2026-10-12").map(x => x.texto)).toEqual(["Estudar história", "Revisão geral de história (véspera da prova)"]);
  });

  it("as sessões passam pela validação do despejo (o caminho que grava)", () => {
    const itens = sessoesComoItens(distribuirSessoes("física", ["ondas"], "2026-10-09", "2026-10-16"));
    expect(itens[0]).toMatchObject({ tipo: "tarefa", quando: "2026-10-10T19:00", rotulo: "sáb 10/10 às 19h" });
    expect(validarItens(itens)).toHaveLength(itens.length);
    expect(resumoDoPlano("física", itens, "2026-10-16")).toBe("2 sessões de física para a prova de 16/10: de sáb 10/10 a qui 15/10 às 19h, com revisão geral na véspera.");
  });

  it("acha a prova da matéria nas tarefas abertas", () => {
    const agora = new Date(2026, 9, 9, 10).getTime();
    const t = (texto: string, dias: number, feita = false): Tarefa => ({ id: texto, texto, prazo: agora + dias * 86_400_000, feita, criadaEm: 0, origem: "manual" });
    const tarefas = [t("Prova de física", 9), t("prova de Física 2", 5), t("comprar livro de física", 2), t("prova de química", 3), t("prova de física antiga", 2, true)];
    expect(acharProva("física", tarefas, agora)?.texto).toBe("prova de Física 2");
    expect(acharProva("biologia", tarefas, agora)).toBeNull();
  });

  it("entende o pedido falado", () => {
    const hoje = new Date(2026, 9, 9);
    expect(pedidoDePlano("monta um plano de estudo pra prova de física", hoje)).toEqual({ materia: "física", assuntos: [] });
    expect(pedidoDePlano("Ely, faz um plano de estudos para a prova de química dia 20 às 20h", hoje)).toEqual({ materia: "química", assuntos: [], dia: "2026-10-20", hora: "20:00" });
    expect(pedidoDePlano("cronograma de estudo pra prova de história dia 3, assuntos: era vargas, ditadura e redemocratização", hoje))
      .toEqual({ materia: "história", assuntos: ["era vargas", "ditadura", "redemocratização"], dia: "2026-11-03" });
    expect(pedidoDePlano("plano de estudo pra prova de matemática 25/10", hoje)?.dia).toBe("2026-10-25");
    expect(pedidoDePlano("o que é um plano de estudo?", hoje)).toBeNull();
    expect(fastRoute("monta um plano de estudo pra prova de física")?.[0]).toMatchObject({ action: "study_plan", materia: "física" });
  });
});
