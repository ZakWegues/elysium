import { describe, expect, it, vi } from "vitest";

vi.mock("electron-store", () => ({ default: class { get() { return { vivoEm: 0, encerramento: null }; } set() {} } }));

import { sessaoAnterior } from "../src/services/estadoApp";

describe("como terminou a sessão anterior do app", () => {
  const T = 1_760_000_000_000;
  it("encerramento avisado vale", () => {
    expect(sessaoAnterior({ vivoEm: T, encerramento: { motivo: "fechado", em: T + 1000 } })).toEqual({ motivo: "fechado", em: T + 1000 });
  });
  it("batimento bem depois do último aviso: caiu sem avisar", () => {
    expect(sessaoAnterior({ vivoEm: T + 10 * 60_000, encerramento: { motivo: "suspenso", em: T } })).toEqual({ motivo: "interrompido", em: T + 10 * 60_000 });
  });
  it("sem aviso nenhum, só o batimento: interrompido no último batimento", () => {
    expect(sessaoAnterior({ vivoEm: T, encerramento: null })).toEqual({ motivo: "interrompido", em: T });
  });
  it("primeira vez: nada a contar", () => {
    expect(sessaoAnterior({ vivoEm: 0, encerramento: null })).toBeNull();
  });
});
