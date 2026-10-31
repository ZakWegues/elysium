import { beforeEach, describe, expect, it, vi } from "vitest";

// 31/10 (Onda 2): telas salvas e o que foi feito na tela no contexto da Ely.
vi.mock("../src/services/llm", () => ({ callChat: vi.fn(), ollamaDisponivel: vi.fn() }));
vi.mock("../src/main/config", () => ({
  getConfig: () => ({ chatHistoryTurns: 5, chatIdleResetMs: 60_000, chatProvider: "ollama", ollamaChatModel: "x", brainModel: "y" }),
  getApiKey: () => "",
}));

const { apagarTelaSalva, atualizarEstadoSalvo, listarTelasSalvas, obterTelaSalva, salvarTela, tituloDaTela } = await import("../src/services/telasSalvas");
const { estadoEmTexto, textoDaTela } = await import("../src/services/telaInteligente");
const brain = await import("../src/services/brain");

const QUIZ = `root = Col([hero, q0, q1])
hero = Hero("Capitais da Europa", "2 perguntas", "graduation-cap", "chart2")
q0 = QuizCard($r0, "1. Capital da França?", ["Paris", "Roma"], 0)
$r0 = ""
q1 = QuizCard($r1, "2. Capital da Itália?", ["Paris", "Roma"], 1)
$r1 = ""
g0 = Card([Checkbox($c0, "Passaporte", true), Checkbox($c1, "Carregador", true)])`;

beforeEach(() => {
  for (const t of listarTelasSalvas()) apagarTelaSalva(t.id);
  brain.clearHistory();
});

describe("telas salvas", () => {
  it("título do Hero; salvar de novo a mesma tela só atualiza", () => {
    expect(tituloDaTela(QUIZ)).toBe("Capitais da Europa");
    expect(tituloDaTela('root = Card([Title("Parcela", "md")])')).toBe("Parcela");
    const a = salvarTela(QUIZ, undefined, undefined, 1);
    const b = salvarTela(QUIZ, { $r0: "Paris" }, undefined, 2);
    expect(b.id).toBe(a.id);
    expect(listarTelasSalvas()).toEqual([{ id: a.id, titulo: "Capitais da Europa", em: 2 }]);
    expect(obterTelaSalva(a.id)?.estado).toEqual({ $r0: "Paris" });
    expect(atualizarEstadoSalvo(a.id, { $r0: "Roma" })).toBe(true);
    expect(obterTelaSalva(a.id)?.estado).toEqual({ $r0: "Roma" });
    expect(apagarTelaSalva(a.id)).toBe(true);
    expect(listarTelasSalvas()).toEqual([]);
  });
});

describe("o que foi feito na tela", () => {
  it("cada variável vira o rótulo dela; sem resposta fica de fora", () => {
    expect(estadoEmTexto(QUIZ, { $r0: "Paris", $r1: "", $c0: true, $c1: false, $x: 1 })).toBe(
      "1. Capital da França?: Paris · Passaporte: marcado · Carregador: desmarcado",
    );
  });

  it("entra no contexto da Ely junto com o conteúdo, e recomeça os 3 pedidos", () => {
    brain.registrarTelaMostrada(textoDaTela(QUIZ));
    brain.registrarEstadoDaTela(estadoEmTexto(QUIZ, { $c0: true }), textoDaTela(QUIZ));
    const t = brain.telaMostrada();
    expect(t).toContain("Capitais da Europa");
    expect(t).toContain("O que o usuário fez nela: Passaporte: marcado");
  });
});
