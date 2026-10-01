import { describe, expect, it } from "vitest";
import { fusoDe, horaEm, pedidoDeHora } from "../src/services/horaMundo";

describe("hora em outra cidade (fase 14)", () => {
  it("acha o fuso pelo nome falado", () => {
    expect(fusoDe("Tóquio")?.fuso).toBe("Asia/Tokyo");
    expect(fusoDe("nova iorque")?.fuso).toBe("America/New_York");
    expect(fusoDe("Pasárgada")).toBeNull();
  });

  it("monta a frase com a hora local da cidade", () => {
    const agora = new Date("2026-10-01T22:30:00Z");
    expect(horaEm("Londres", agora)).toBe("Em Londres são 23:30.");
    expect(horaEm("Tóquio", agora)).toMatch(/^Em Tóquio são 07:30 de (quinta|sexta)-feira\.$/);
  });

  it("reconhece o pedido; cidade desconhecida não é pedido", () => {
    expect(pedidoDeHora("que horas são em tóquio agora?")).toBe("tóquio");
    expect(pedidoDeHora("qual a hora em Paris")).toBe("Paris");
    expect(pedidoDeHora("que horas são em Pasárgada")).toBeNull();
    expect(pedidoDeHora("que horas são")).toBeNull();
  });
});
