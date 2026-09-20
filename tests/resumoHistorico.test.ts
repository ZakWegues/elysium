import { beforeEach, describe, expect, it, vi } from "vitest";

// O brain e o resumo importam llm/config; aqui só a poda e o resumo interessam.
vi.mock("../src/services/llm", () => ({ callChat: vi.fn(), ollamaDisponivel: vi.fn() }));
vi.mock("../src/main/config", () => ({
  getConfig: () => ({ chatHistoryTurns: 3, chatIdleResetMs: 60_000, chatProvider: "ollama", ollamaChatModel: "x", brainModel: "y" }),
  getApiKey: () => "",
}));

const brain = await import("../src/services/brain");
const resumo = await import("../src/services/resumoHistorico");

beforeEach(() => {
  brain.clearHistory();
  resumo.usarCompactador(null);
});

describe("resumo do histórico (bloco 80)", () => {
  it("o que cai do histórico vai para o resumo, e o contexto recente o cita", async () => {
    const chamadas: { antes: string; turnos: string[] }[] = [];
    resumo.usarCompactador(async (antes, turnos) => {
      chamadas.push({ antes, turnos: turnos.map(t => t.content) });
      return `Resumo(${chamadas.length}): ${turnos.map(t => t.content).join(",")}`;
    });
    // 3 turnos cabem (6 mensagens); o 4º empurra o 1º para fora.
    for (let i = 1; i <= 4; i++) {
      brain.registrarTurnoUsuario(`pergunta ${i}`);
      brain.recordAssistantReply(`resposta ${i}`);
    }
    await resumo.aguardarCompactacao();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].turnos).toEqual(["pergunta 1", "resposta 1"]);
    expect(resumo.estadoDoResumo()).toEqual({ resumo: "Resumo(1): pergunta 1,resposta 1", pendentes: 0 });

    brain.registrarTurnoUsuario("pergunta 5");
    // A poda só acontece no fim do turno: com a pergunta 5 ainda sem resposta, o histórico
    // fica um acima do teto e nada cai — "pergunta 2" continua no contexto recente.
    expect(brain.contextoRecente()).toMatch(/^\(antes disso: Resumo\(1\): pergunta 1,resposta 1\)\nUsuário: pergunta 2\nELYSIUM: resposta 2/);
    // O pedido atual (último turno) fica fora do contexto recente, como antes.
    expect(brain.contextoRecente()).not.toContain("pergunta 5");
    brain.recordAssistantReply("resposta 5");
    await resumo.aguardarCompactacao();
    expect(chamadas[1].turnos).toEqual(["pergunta 2", "resposta 2"]);
  });

  it("enquanto a compactação não termina, os turnos podados vão crus no prompt", async () => {
    let soltar!: (s: string) => void;
    resumo.usarCompactador(() => new Promise(res => { soltar = res; }));
    for (let i = 1; i <= 4; i++) {
      brain.registrarTurnoUsuario(`p${i}`);
      brain.recordAssistantReply(`r${i}`);
    }
    expect(resumo.blocoDoResumo()).toBe("Usuário: p1\nELYSIUM: r1");
    expect(resumo.estadoDoResumo().pendentes).toBe(2);
    // Passou a espera de 100 ms: o lote está em voo e continua no bloco.
    await new Promise(r => setTimeout(r, 150));
    expect(resumo.blocoDoResumo()).toBe("Usuário: p1\nELYSIUM: r1");
    soltar("feito");
    await resumo.aguardarCompactacao();
    expect(resumo.blocoDoResumo()).toBe("feito");
  });

  it("compactador que estoura não perde os turnos; limpar o histórico limpa o resumo", async () => {
    resumo.usarCompactador(async () => { throw new Error("modelo fora"); });
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 1; i <= 4; i++) {
      brain.registrarTurnoUsuario(`p${i}`);
      brain.recordAssistantReply(`r${i}`);
    }
    await resumo.aguardarCompactacao();
    expect(resumo.blocoDoResumo()).toBe("Usuário: p1\nELYSIUM: r1");
    aviso.mockRestore();
    brain.clearHistory();
    expect(resumo.blocoDoResumo()).toBe("");
    expect(brain.contextoRecente()).toBe("");
  });

  it("o resumo cresce em cima do anterior, em lotes", async () => {
    resumo.usarCompactador(async (antes, turnos) => `${antes ? antes + " + " : ""}${turnos.map(t => t.content).join(",")}`);
    for (let i = 1; i <= 6; i++) {
      brain.registrarTurnoUsuario(`p${i}`);
      brain.recordAssistantReply(`r${i}`);
      await resumo.aguardarCompactacao();
    }
    expect(resumo.estadoDoResumo().resumo).toBe("p1,r1 + p2,r2 + p3,r3");
  });
});
