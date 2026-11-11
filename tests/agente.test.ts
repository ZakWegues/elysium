import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O laço do agente com o modelo dublado: cada teste diz o que o "modelo" responde a cada
 * rodada e o que as ferramentas devolvem. O que se prova é a POLÍTICA do laço — quando
 * parar, o que vira fala, quando cutucar — não o modelo.
 */
const respostas: { content: string; toolCalls: { id: string; name: string; args: Record<string, unknown> }[] }[] = [];
const chamadasAoModelo: unknown[] = [];
vi.mock("../src/services/llm", () => ({
  callChatComFerramentas: vi.fn(async (p: unknown) => { chamadasAoModelo.push(p); return respostas.shift() ?? { content: "", toolCalls: [] }; }),
}));

const executadas: string[] = [];
vi.mock("../src/services/ferramentas", () => ({
  definicoesDeFerramentas: () => [],
  ferramenta: (nome: string) => (nome === "fechar_programa" ? { acao: (a: Record<string, unknown>) => ({ action: "close_app", app_name: a.nome }) } : undefined),
  executarFerramenta: vi.fn(async (nome: string, args: Record<string, unknown>) => {
    executadas.push(nome);
    if (nome === "programas_abertos") return "Abertos: chrome; CalculatorApp (Calculadora).";
    if (nome === "fechar_programa") return `${args.nome} fechado.`;
    if (nome === "clima") return "Em Recife, 22 graus e nublado.";
    return "Feito.";
  }),
}));
vi.mock("../src/services/brain", () => ({
  provedorDoRoteador: async () => ({ provider: "ollama" }),
  contextoRecente: () => "",
}));
vi.mock("../src/services/memoryStore", () => ({ buildMemoryBlock: () => "" }));
vi.mock("../src/main/config", () => ({
  getConfig: () => ({ ollamaRouterModel: "llama3.1:8b", routerModel: "x", fallbackToGroq: false }),
  getApiKey: () => "",
  nomeDoUsuario: () => "usuário",
}));

const { agir } = await import("../src/services/agente");

beforeEach(() => { respostas.length = 0; executadas.length = 0; chamadasAoModelo.length = 0; });

describe("agente — política do laço", () => {
  it("CHAT sem ferramentas vira modo chat", async () => {
    respostas.push({ content: "CHAT", toolCalls: [] });
    const r = await agir("qual a capital da Austrália?");
    expect(r?.modo).toBe("chat");
    expect(executadas).toEqual([]);
  });

  it("CHAT depois de uma leitura irrelevante também é chat", async () => {
    respostas.push({ content: "", toolCalls: [{ id: "1", name: "clima", args: {} }] });
    respostas.push({ content: "CHAT", toolCalls: [] });
    const r = await agir("que horas são em tóquio?");
    expect(r?.modo).toBe("chat");
  });

  it("rodada com ação: a fala é o que o executor disse, sem voltar ao modelo", async () => {
    respostas.push({ content: "", toolCalls: [{ id: "1", name: "fechar_programa", args: { nome: "calculadora" } }] });
    const r = await agir("fecha a calculadora");
    expect(r).toMatchObject({ modo: "ferramentas", reply: "calculadora fechado." });
    expect(r?.acoes).toEqual([{ action: "close_app", app_name: "calculadora" }]);
    expect(chamadasAoModelo).toHaveLength(1);
  });

  it("olhar e depois agir: a leitura não entra na fala", async () => {
    respostas.push({ content: "", toolCalls: [{ id: "1", name: "programas_abertos", args: {} }] });
    respostas.push({ content: "", toolCalls: [{ id: "2", name: "fechar_programa", args: { nome: "calculadora" } }] });
    const r = await agir("se a calculadora estiver aberta, fecha");
    expect(r?.reply).toBe("calculadora fechado.");
    expect(executadas).toEqual(["programas_abertos", "fechar_programa"]);
  });

  it("olhar e responder em texto: a fala é o que foi lido (o modelo não pode contradizer)", async () => {
    respostas.push({ content: "", toolCalls: [{ id: "1", name: "clima", args: {} }] });
    respostas.push({ content: "Não achei nada.", toolCalls: [] });
    const r = await agir("como está o tempo?");
    expect(r?.reply).toBe("Em Recife, 22 graus e nublado.");
  });

  it("olhar e responder em texto coerente: a fala é a do modelo (bloco 80)", async () => {
    respostas.push({ content: "", toolCalls: [{ id: "1", name: "clima", args: {} }] });
    respostas.push({ content: "Está nublado em Recife, 22 graus — leva um casaco.", toolCalls: [] });
    const r = await agir("preciso de casaco hoje?");
    expect(r?.reply).toBe("Está nublado em Recife, 22 graus — leva um casaco.");
    // JSON solto e menção a "ferramenta" não valem como resposta: volta o que foi lido.
    respostas.push({ content: "", toolCalls: [{ id: "1", name: "clima", args: {} }] });
    respostas.push({ content: '{"name": "clima", "parameters": {}}', toolCalls: [] });
    expect((await agir("e o tempo?"))?.reply).toBe("Em Recife, 22 graus e nublado.");
    // `{"name": "CHAT"}` embrulhado é conversa.
    respostas.push({ content: '{"name": "CHAT", "parameters": {}}', toolCalls: [] });
    expect((await agir("me diz uma cor"))?.modo).toBe("chat");
  });

  it("alegar ação sem ter agido leva uma cutucada, e a ação acontece", async () => {
    respostas.push({ content: "", toolCalls: [{ id: "1", name: "programas_abertos", args: {} }] });
    respostas.push({ content: "Fechei a calculadora.", toolCalls: [] });
    respostas.push({ content: "", toolCalls: [{ id: "2", name: "fechar_programa", args: { nome: "calculadora" } }] });
    const r = await agir("fecha a calculadora se estiver aberta");
    expect(r?.reply).toBe("calculadora fechado.");
    expect(chamadasAoModelo).toHaveLength(3);
    const ultima = chamadasAoModelo[2] as { messages: { role: string; content: string }[] };
    expect(ultima.messages.some(m => m.role === "user" && /não chamou nenhuma ferramenta/.test(m.content))).toBe(true);
  });

  it("pedido composto: uma volta a mais depois da ação, e as duas falas saem", async () => {
    respostas.push({ content: "", toolCalls: [{ id: "1", name: "abrir_programa", args: { nome: "bloco de notas" } }] });
    respostas.push({ content: "", toolCalls: [{ id: "2", name: "clima", args: {} }] });
    const r = await agir("abre o bloco de notas e me diz o tempo");
    expect(r?.reply).toBe("Feito. Em Recife, 22 graus e nublado.");
  });

  it("provedor caiu e sem Groq: null (o roteador clássico assume)", async () => {
    const { callChatComFerramentas } = await import("../src/services/llm");
    (callChatComFerramentas as unknown as { mockImplementationOnce: (f: () => Promise<never>) => void }).mockImplementationOnce(async () => { throw new Error("fora do ar"); });
    expect(await agir("abre o chrome")).toBeNull();
  });
});

describe("modo tarefa (bloco 119)", async () => {
  const { contarPassos, falasDaTarefa } = await import("../src/services/agente");
  it("conta as partes do pedido", () => {
    expect(contarPassos("fecha o Chrome, abre o VS Code e toca lo-fi")).toBe(3);
    expect(contarPassos("abre o bloco de notas e me diz o tempo")).toBe(2);
    expect(contarPassos("cria um lembrete, depois cancela ele e me diz o clima")).toBe(3);
    expect(contarPassos("que horas são")).toBe(1);
  });
  it("tarefa vira lista; pedido simples continua frase corrida", () => {
    const ch = [{ nome: "a", args: {}, resultado: "Fechando o Chrome." }, { nome: "b", args: {}, resultado: "Abrindo o VS Code." }];
    expect(falasDaTarefa(ch, true)).toBe("Feito:\n- Fechando o Chrome.\n- Abrindo o VS Code.");
    expect(falasDaTarefa(ch, false)).toBe("Fechando o Chrome. Abrindo o VS Code.");
  });
});

describe("modo tarefa no laço (bloco 119)", () => {
  it("três partes: uma volta por parte, com a lembrança do pedido, e a resposta em lista", async () => {
    respostas.push({ content: "", toolCalls: [{ id: "1", name: "fechar_programa", args: { nome: "chrome" } }] });
    respostas.push({ content: "", toolCalls: [{ id: "2", name: "abrir_programa", args: { nome: "vs code" } }] });
    respostas.push({ content: "", toolCalls: [{ id: "3", name: "clima", args: {} }] });
    const r = await agir("fecha o chrome, abre o vs code e me diz o clima");
    expect(executadas).toEqual(["fechar_programa", "abrir_programa", "clima"]);
    expect(r?.reply).toBe("Feito:\n- chrome fechado.\n- Feito.\n- Em Recife, 22 graus e nublado.");
    // Da 2ª rodada em diante o modelo recebe o pedido inteiro de novo.
    const ultima = chamadasAoModelo[chamadasAoModelo.length - 1] as { messages: { role: string; content: string }[] };
    expect(ultima.messages.some(m => m.role === "user" && m.content.startsWith("Continue o MESMO pedido"))).toBe(true);
  });

  it("o modelo diz 'pronto' antes de acabar as partes: para e mostra o que fez", async () => {
    respostas.push({ content: "", toolCalls: [{ id: "1", name: "fechar_programa", args: { nome: "chrome" } }] });
    respostas.push({ content: "", toolCalls: [{ id: "2", name: "abrir_programa", args: { nome: "vs code" } }] });
    respostas.push({ content: "pronto", toolCalls: [] });
    const r = await agir("fecha o chrome, abre o vs code e toca lo-fi");
    expect(executadas).toEqual(["fechar_programa", "abrir_programa"]);
    expect(r?.reply).toBe("Feito:\n- chrome fechado.\n- Feito.");
  });
});

describe("chamadas escritas em texto (fase 14)", async () => {
  const { chamadasEmTexto } = await import("../src/services/agente");
  const nomes = new Map<string, Record<string, unknown>>([
    ["midia", { properties: { operacao: { type: "string" } }, required: ["operacao"] }],
    ["volume", { properties: { nivel: { type: "string" } }, required: ["nivel"] }],
    ["abrir_programa", { properties: { nome: { type: "string" } }, required: ["nome"] }],
    ["clima", { properties: {} }],
    ["energia", { properties: { operacao: { type: "string" }, segundos: { type: "integer" } }, required: ["operacao"] }],
  ]);
  it("texto só com chamadas válidas vira chamada", () => {
    expect(chamadasEmTexto('midia({"operacao": "pause"})\nvolume({"nivel": "down"})', nomes)).toEqual([
      { id: "texto-0", name: "midia", args: { operacao: "pause" } },
      { id: "texto-1", name: "volume", args: { nivel: "down" } },
    ]);
    expect(chamadasEmTexto('```\nabrir_programa({"nome": "chrome"})\n```', nomes)).toHaveLength(1);
  });
  it("formato abreviado: 'volume 40' / 'tocar_musica Radiohead'", () => {
    expect(chamadasEmTexto("volume 40\nabrir_programa Spotify", nomes)).toEqual([
      { id: "texto-0", name: "volume", args: { nivel: "40" } },
      { id: "texto-1", name: "abrir_programa", args: { nome: "Spotify" } },
    ]);
    expect(chamadasEmTexto("clima", nomes)).toEqual([{ id: "texto-0", name: "clima", args: {} }]);
    expect(chamadasEmTexto("clima de hoje: 20 graus", nomes)).toEqual([]);
    expect(chamadasEmTexto("volume está alto demais.", nomes)).toEqual([]);
  });

  it("frase normal, nome inventado ou JSON quebrado não vira ação", () => {
    expect(chamadasEmTexto("Pausei a música para você.", nomes)).toEqual([]);
    expect(chamadasEmTexto('apagar_tudo({"x": 1})', nomes)).toEqual([]);
    expect(chamadasEmTexto('midia({operacao: pause})', nomes)).toEqual([]);
    expect(chamadasEmTexto('midia({"operacao": "pause"})\nE pronto!', nomes)).toEqual([]);
  });
});
