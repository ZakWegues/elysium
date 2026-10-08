import { describe, expect, it } from "vitest";
import { paraOuvido } from "../src/services/falaParaOuvido";

describe("fala para o ouvido (fase 18)", () => {
  it("horas", () => {
    expect(paraOuvido("às 16h")).toBe("às 16 horas");
    expect(paraOuvido("às 16h30")).toBe("às 16 e 30");
    expect(paraOuvido("às 9:05")).toBe("às 9 e 5");
    expect(paraOuvido("às 0:00 e às 12h")).toBe("às meia-noite e às meio-dia");
    expect(paraOuvido("1h")).toBe("1 hora");
  });
  it("datas e dinheiro", () => {
    expect(paraOuvido("prova em 15/10")).toBe("prova em 15 de outubro");
    expect(paraOuvido("até 01/12/2026")).toBe("até 1 de dezembro de 2026");
    expect(paraOuvido("R$ 12,50")).toBe("12 reais e 50 centavos");
    expect(paraOuvido("R$ 1.200,00")).toBe("1200 reais");
    expect(paraOuvido("nota 10/40")).toBe("nota 10/40");
  });
  it("treino e unidades", () => {
    expect(paraOuvido("Supino (2 aquec. + 3×4–6)")).toBe("Supino (2 de aquecimento mais 3 séries de 4 a 6)");
    expect(paraOuvido("Rosca 3×10–12")).toBe("Rosca 3 séries de 10 a 12");
    expect(paraOuvido("2830 kcal, 114 g de proteína, 57 kg, 3 km em 25 min, 28°")).toBe("2830 calorias, 114 gramas de proteína, 57 quilos, 3 quilômetros em 25 minutos, 28 graus");
    expect(paraOuvido("Treino A · Supino")).toBe("Treino A, Supino");
  });
});
