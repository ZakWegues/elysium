import { describe, expect, it } from "vitest";
import {
  descreverSeries, exercicioDe, faltaNoPerfil, gastoDaCorrida, metaDoDia, pedidoDeCorrida, pedidoDePeso, pedidoDeTreino,
  sessaoDoPlano, sugestaoDoPeso, taxaBasal, tipoDoExercicio, treinoDaVez, type PerfilCorpo, type Treino,
} from "../src/services/corpo";
import { secoesDasNotas } from "../src/services/atualizacao";
import { montarResumo } from "../src/services/resumoDoDia";

const treino = (id: string, ordem: number): Treino => ({ id, nome: `Treino ${id}`, ordem, exercicios: [] });

describe("corpo: exercícios (fase 18)", () => {
  it("composto x isolador pelo nome, com o padrão de séries de cada um", () => {
    expect(tipoDoExercicio("Supino Reto (Barra)")).toBe("composto");
    expect(tipoDoExercicio("Leg Press 45° (Máquina)")).toBe("composto");
    expect(tipoDoExercicio("Rosca Martelo (Halter)")).toBe("isolador");
    expect(descreverSeries(exercicioDe("Supino Reto (Barra)"))).toBe("2 aquec. + 3×4–6");
    expect(descreverSeries(exercicioDe("Tríceps Pulley"))).toBe("3×10–12");
  });
  it("o que foi informado vence o padrão", () => {
    const e = exercicioDe("Rosca Direta", { series: 4, reps: "8–10", carga: "12 kg" });
    expect(e).toMatchObject({ tipo: "isolador", series: 4, reps: "8–10", carga: "12 kg", aquecimento: 0 });
  });
});

describe("corpo: rotação A→B→C", () => {
  const ts = [treino("A", 0), treino("B", 1), treino("C", 2)];
  it("sem histórico começa no primeiro; depois vai para o seguinte ao último", () => {
    expect(treinoDaVez(ts, [], "2026-10-08")?.treino.id).toBe("A");
    expect(treinoDaVez(ts, [{ data: "2026-10-06", treinoId: "A" }], "2026-10-08")?.treino.id).toBe("B");
    expect(treinoDaVez(ts, [{ data: "2026-10-07", treinoId: "C" }], "2026-10-08")?.treino.id).toBe("A");
  });
  it("feito hoje continua sendo o de hoje, marcado", () => {
    expect(treinoDaVez(ts, [{ data: "2026-10-08", treinoId: "B" }], "2026-10-08")).toMatchObject({ treino: { id: "B" }, feitoHoje: true });
  });
});

describe("corpo: energia", () => {
  const base: PerfilCorpo = { sexo: "masculino", idade: 20, alturaCm: 176, pesoKg: 57, atividade: "ativo", objetivo: "ganhar", ajusteKcal: 0 };
  it("sem idade ou sexo não há meta — nada de chute", () => {
    const p = { ...base, idade: undefined, sexo: undefined };
    expect(faltaNoPerfil(p)).toEqual(["sexo", "idade"]);
    expect(metaDoDia(p)).toBeNull();
  });
  it("Mifflin-St Jeor × atividade + 15% para ganhar; proteína 2 g/kg", () => {
    expect(taxaBasal(base as Required<PerfilCorpo>)).toBeCloseTo(10 * 57 + 6.25 * 176 - 5 * 20 + 5);
    const m = metaDoDia(base)!;
    expect(m.kcal).toBe(Math.round((1575 * 1.55 * 1.15) / 10) * 10);
    expect(m.proteinaG).toBe(114);
    expect(m.gorduraG).toBe(51);
    expect(m.kcal).toBeCloseTo(m.proteinaG * 4 + m.gorduraG * 9 + m.carboG * 4, -1);
  });
  it("a corrida soma na meta do dia", () => {
    const gasto = gastoDaCorrida(30, 57);
    expect(gasto).toBe(170);
    expect(metaDoDia(base, gasto)!.kcal - metaDoDia(base)!.kcal).toBe(170);
  });
  it("duas semanas sem ganho sugere +150 kcal", () => {
    const hoje = new Date(2026, 9, 30);
    expect(sugestaoDoPeso([{ data: "2026-10-10", kg: 57 }, { data: "2026-10-30", kg: 57.1 }], "ganhar", hoje)).toMatch(/150 kcal/);
    expect(sugestaoDoPeso([{ data: "2026-10-10", kg: 57 }, { data: "2026-10-30", kg: 58 }], "ganhar", hoje)).toBeNull();
    expect(sugestaoDoPeso([{ data: "2026-10-10", kg: 57 }, { data: "2026-10-30", kg: 57 }], "manter", hoje)).toBeNull();
  });
});

describe("corpo: plano de corrida", () => {
  it("avança por sessão marcada, três por semana", () => {
    expect(sessaoDoPlano(0)).toMatchObject({ semana: 1, sessao: 1, concluido: false });
    expect(sessaoDoPlano(4)).toMatchObject({ semana: 2, sessao: 2 });
    expect(sessaoDoPlano(0).texto).toMatch(/8× \(corre 1 min \+ anda 1,5 min\)/);
    expect(sessaoDoPlano(26).texto).toMatch(/corre 30 min sem parar/);
    expect(sessaoDoPlano(99)).toMatchObject({ semana: 9, concluido: true });
  });
});

describe("corpo: pedidos falados", () => {
  it("treino", () => {
    expect(pedidoDeTreino("treinei hoje")).toEqual({});
    expect(pedidoDeTreino("fiz o treino B")).toEqual({ nome: "treino b" });
    expect(pedidoDeTreino("treinei o cachorro")).toBeNull();
  });
  it("corrida", () => {
    expect(pedidoDeCorrida("corri 20 minutos")).toEqual({ minutos: 20 });
    expect(pedidoDeCorrida("corri 3,5 km em 25 min")).toEqual({ minutos: 25, km: 3.5 });
    expect(pedidoDeCorrida("corri atrás do ônibus")).toBeNull();
  });
  it("peso", () => {
    expect(pedidoDePeso("pesei 58 quilos")).toBe(58);
    expect(pedidoDePeso("estou com 58,5 kg")).toBe(58.5);
    expect(pedidoDePeso("estou com 60")).toBeNull();
    expect(pedidoDePeso("pesei 5 quilos de arroz")).toBeNull();
  });
});

describe("notas da release → card ELYSIUM", () => {
  it("lê as seções Novidades e Para testar", () => {
    const s = secoesDasNotas("Versão 2.2\n\n## Novidades\n- Abas vivas\n- Treinos\n\n## Para testar\n- [ ] Trocar de aba falando\n- Minimizar\n\nversionCode 21");
    expect(s.novidades).toEqual(["Abas vivas", "Treinos"]);
    expect(s.paraTestar).toEqual(["Trocar de aba falando", "Minimizar"]);
  });
  it("nota antiga sem seções vira só novidades", () => {
    expect(secoesDasNotas("- A\n- B")).toEqual({ novidades: ["A", "B"], paraTestar: [] });
  });
});

describe("resumo falado sem o corpo", () => {
  it("treino e calorias ficam de fora (só quando perguntam); novidade e ideia entram", () => {
    const t = montarResumo({
      agora: new Date(2026, 9, 8, 9), nome: "", clima: null, lembretes: [], rotinas: [], recadosNovos: 0, alertas: [], versaoNova: null,
      elysium: { versao: "2.2.0", novidade: "Abas vivas", paraTestar: 3 }, ideia: "Caminhe 20 minutos",
    });
    expect(t).not.toMatch(/treino|calorias/i);
    expect(t).toContain("No ELYSIUM 2.2.0: Abas vivas. Tem 3 itens para testar no Hoje.");
    expect(t.trim().endsWith("Uma ideia para hoje: Caminhe 20 minutos.")).toBe(true);
  });
});
