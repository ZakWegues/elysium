import { describe, expect, it } from "vitest";
import { interpretarEventos } from "../src/services/agenda";

describe("Google Agenda (bloco 120)", () => {
  it("converte eventos com hora, do dia todo e ignora cancelados", () => {
    const ev = interpretarEventos([
      { id: "a", summary: "Dentista", start: { dateTime: "2026-10-01T15:00:00-03:00" }, end: { dateTime: "2026-10-01T16:00:00-03:00" }, location: "Centro" },
      { id: "b", summary: "Feriado", start: { date: "2026-10-12" }, end: { date: "2026-10-13" } },
      { id: "c", summary: "Cancelado", status: "cancelled", start: { dateTime: "2026-10-01T10:00:00-03:00" } },
      { summary: "sem id", start: { dateTime: "2026-10-01T10:00:00-03:00" } },
    ]);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ id: "a", titulo: "Dentista", diaInteiro: false, local: "Centro" });
    expect(new Date(ev[0].inicio).toISOString()).toBe("2026-10-01T18:00:00.000Z");
    expect(ev[1].diaInteiro).toBe(true);
    // Dia inteiro é meia-noite LOCAL.
    expect(new Date(ev[1].inicio).getHours()).toBe(0);
  });

  it("evento sem título vira (sem título)", () => {
    expect(interpretarEventos([{ id: "x", start: { dateTime: "2026-10-01T10:00:00Z" } }])[0].titulo).toBe("(sem título)");
  });
});
