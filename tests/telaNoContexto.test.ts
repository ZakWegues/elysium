import { beforeEach, describe, expect, it, vi } from "vitest";

// A Ely lembra da tela no pedido seguinte (31/10). O brain importa llm/config; aqui só o contexto.
vi.mock("../src/services/llm", () => ({ callChat: vi.fn(), ollamaDisponivel: vi.fn() }));
vi.mock("../src/main/config", () => ({
  getConfig: () => ({ chatHistoryTurns: 5, chatIdleResetMs: 60_000, chatProvider: "ollama", ollamaChatModel: "x", brainModel: "y" }),
  getApiKey: () => "",
}));

const brain = await import("../src/services/brain");
const { textoDaTela, gerarTela, quandoMostrarTela } = await import("../src/services/telaInteligente");
const { contextoDoTurno } = await import("../src/services/hermes/persona");

beforeEach(() => brain.clearHistory());

describe("texto da tela", () => {
  it("tira os textos do programa, sem ícone nem estilo, com o número junto", () => {
    const programa = `root = Col([hero, Chart($tipo, dados, "nome", ["valor"], "number")])
$tipo = "donut"
dados = [{nome: "Mercado", valor: 800}, {nome: "Aluguel", valor: 1500.5}]
hero = Hero("Gastos de outubro", "2 categorias", "chart-pie", "chart3")
q0 = QuizCard($r0, "1. Qual a capital da França?", ["Paris", "Roma"], 0, "Paris é a capital desde 987.")
x = Text("Mercado", "sm", "muted")`;
    expect(textoDaTela(programa)).toBe(
      "Mercado (800) · Aluguel (1500.5) · Gastos de outubro · 2 categorias · 1. Qual a capital da França? · Paris · Roma · Paris é a capital desde 987.",
    );
  });

  it("corta no máximo", () => {
    const t = textoDaTela(`root = Text("${"a ".repeat(200)}")`, 50);
    expect(t).toHaveLength(50);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("tela no contexto da Ely", () => {
  it("entra no contexto, vale por 3 pedidos e some com a conversa zerada", () => {
    brain.registrarTurnoUsuario("faz um quiz de capitais");
    brain.recordAssistantReply("Montei o quiz.");
    brain.registrarTelaMostrada("1. Qual a capital da França? · Paris · Roma");
    for (let i = 1; i <= 3; i++) {
      brain.registrarTurnoUsuario(`pergunta ${i}`);
      expect(brain.contextoRecente()).toContain("1. Qual a capital da França?");
      brain.recordAssistantReply(`resposta ${i}`);
    }
    brain.registrarTurnoUsuario("pergunta 4");
    expect(brain.contextoRecente()).not.toContain("capital da França");

    brain.registrarTelaMostrada("Mercado (800)");
    brain.clearHistory();
    expect(brain.telaMostrada()).toBeNull();
  });

  it("toda tela pronta avisa quem pediu (é assim que o main registra)", async () => {
    const vistas: string[] = [];
    quandoMostrarTela((p) => vistas.push(p));
    const programa = 'root = Card([Title("Parcela", "md"), Text("R$ 100")])';
    const tela = await gerarTela("monta uma tela da parcela", "A parcela é R$ 100.", async () => ({
      enviar: async () => ({ texto: programa, provedor: "teste", modelo: "m1" }),
      fechar: () => {},
    }));
    quandoMostrarTela(null);
    expect(tela?.programa).toBeTruthy();
    expect(vistas).toHaveLength(1);
    expect(textoDaTela(vistas[0])).toContain("Parcela");
  });

  it("o Hermes também recebe a tela no contexto do turno", () => {
    const c = contextoDoTurno("e a segunda?", "texto", { nome: "", tratamento: "", estilo: "", instrucoes: "", modo: null, tela: "1. Qual a capital? · Paris" }, false);
    expect(c).toContain("Tela que você mostrou na conversa");
    expect(c).toContain("Paris");
  });
});
