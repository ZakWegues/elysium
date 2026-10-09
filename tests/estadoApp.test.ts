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

describe("histórico de sessões (fase 19, bloco 195)", async () => {
  const { juntarSessao } = await import("../src/services/estadoApp");
  const H = 3_600_000;
  const agora = Date.UTC(2026, 9, 9, 12);
  it("a sessão que acabou entra no topo; as de mais de 7 dias saem", () => {
    const velha = { inicio: agora - 9 * 24 * H, fim: agora - 8 * 24 * H, motivo: "fechado" as const };
    const ontem = { inicio: agora - 26 * H, fim: agora - 20 * H, motivo: "desligando" as const };
    const l = juntarSessao([ontem, velha], { vivoEm: agora - 2 * H, encerramento: { motivo: "fechado", em: agora - 2 * H }, iniciadoEm: agora - 5 * H }, agora);
    expect(l).toEqual([{ inicio: agora - 5 * H, fim: agora - 2 * H, motivo: "fechado" }, ontem]);
  });
  it("gravação antiga, sem começo, não inventa sessão", () => {
    expect(juntarSessao(undefined, { vivoEm: agora - H, encerramento: null }, agora)).toEqual([]);
  });
  it("caiu sem avisar = interrompido, até o último batimento", () => {
    expect(juntarSessao([], { vivoEm: agora - H, encerramento: null, iniciadoEm: agora - 3 * H }, agora))
      .toEqual([{ inicio: agora - 3 * H, fim: agora - H, motivo: "interrompido" }]);
  });
});
