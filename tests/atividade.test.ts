import { beforeEach, describe, expect, it } from "vitest";
import { atividadeDeHoje, contaComoAtividade, registrarAtividade, zerarAtividade } from "../src/services/atividade";

beforeEach(() => zerarAtividade());

describe("o que a Ely fez hoje (31/10)", () => {
  it("só ações que mudam algo entram; consulta e conversa não", () => {
    expect(contaComoAtividade({ action: "volume_control", level: 30 })).toBe(true);
    expect(contaComoAtividade({ action: "create_reminder", text: "x", due_at: "2026-11-01T10:00:00" })).toBe(true);
    expect(contaComoAtividade({ action: "chat" })).toBe(false);
    expect(contaComoAtividade({ action: "weather" } as never)).toBe(false);
    expect(contaComoAtividade({ action: "web_search", query: "x" })).toBe(false);
  });

  it("só as de hoje, da mais nova para a mais velha", () => {
    const hoje = new Date(2026, 9, 31, 15, 0);
    const ontem = new Date(2026, 9, 30, 23, 50).getTime();
    registrarAtividade("Abri o app: Chrome", ontem);
    registrarAtividade("Volume: 30%", new Date(2026, 9, 31, 9, 0).getTime());
    registrarAtividade("  Lembrete criado:   remédio  ", new Date(2026, 9, 31, 14, 0).getTime());
    expect(atividadeDeHoje(hoje).map(i => i.texto)).toEqual(["Lembrete criado: remédio", "Volume: 30%"]);
  });
});
