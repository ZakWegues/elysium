import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/main/config", () => ({ getGeminiKey: () => "chave-de-teste" }));
const { escolherModelos, gerarGemini, modelosGemini, zerarListaGemini } = await import("../src/services/gemini");

type Chamada = { url: string; init?: RequestInit };
function buscaFalsa(respostas: ((url: string) => { status: number; corpo: unknown })) {
  const chamadas: Chamada[] = [];
  const busca = async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    const r = respostas(url);
    return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { "Content-Type": "application/json" } });
  };
  return { busca, chamadas };
}
const LISTA = { models: [
  { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
  { name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
  { name: "models/gemini-3-flash", supportedGenerationMethods: ["generateContent"] },
  { name: "models/gemini-3-flash-preview-09", supportedGenerationMethods: ["generateContent"] },
  { name: "models/gemini-2.5-flash-image", supportedGenerationMethods: ["generateContent"] },
  { name: "models/gemini-3-pro", supportedGenerationMethods: ["generateContent"] },
  { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
] };
const ok = (texto: string) => ({ status: 200, corpo: { candidates: [{ content: { parts: [{ text: texto }] }, finishReason: "STOP" }] } });

describe("Gemini (24/10)", () => {
  beforeEach(() => zerarListaGemini());

  it("fica o Flash estável mais novo; o Lite é a reserva; preview/imagem/pro não entram", () => {
    expect(escolherModelos(LISTA.models.map((m) => m.name))).toEqual({ flash: ["gemini-3-flash", "gemini-2.5-flash"], lite: ["gemini-2.5-flash-lite"] });
    expect(escolherModelos([])).toEqual({ flash: ["gemini-2.5-flash"], lite: ["gemini-2.5-flash-lite"] });
  });

  it("a chave vai no cabeçalho, nunca na URL; a lista fica em cache", async () => {
    const { busca, chamadas } = buscaFalsa((u) => (u.includes(":generateContent") ? ok("oi") : { status: 200, corpo: LISTA }));
    await modelosGemini("chave-de-teste", busca);
    await modelosGemini("chave-de-teste", busca);
    expect(chamadas.length).toBe(1);
    expect(chamadas[0].url).not.toContain("chave-de-teste");
    expect((chamadas[0].init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("chave-de-teste");
  });

  it("429 no 1º modelo → o próximo; JSON com esquema; 2.5 sem pensar", async () => {
    const { busca, chamadas } = buscaFalsa((u) => {
      if (!u.includes(":generateContent")) return { status: 200, corpo: LISTA };
      if (u.includes("gemini-3-flash:")) return { status: 429, corpo: { error: { message: "quota" } } };
      return ok('{"a": 1}');
    });
    const r = await gerarGemini({ mensagens: [{ papel: "user", texto: "dados" }], sistema: "só JSON", esquema: { type: "object" } }, busca, "chave-de-teste");
    expect(r).toEqual({ texto: '{"a": 1}', modelo: "gemini-2.5-flash" });
    const corpo = JSON.parse(String(chamadas.at(-1)?.init?.body));
    expect(corpo.generationConfig.responseMimeType).toBe("application/json");
    expect(corpo.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(corpo.systemInstruction.parts[0].text).toBe("só JSON");
  });

  it("leve começa pelo Lite; sem chave ou todos falhando → null", async () => {
    const { busca, chamadas } = buscaFalsa((u) => (u.includes(":generateContent") ? ok("x") : { status: 200, corpo: LISTA }));
    await gerarGemini({ mensagens: [{ papel: "user", texto: "x" }], leve: true }, busca, "chave-de-teste");
    expect(chamadas.at(-1)?.url).toContain("gemini-2.5-flash-lite:generateContent");
    expect(await gerarGemini({ mensagens: [{ papel: "user", texto: "x" }] }, busca, "")).toBeNull();
    const ruim = buscaFalsa((u) => (u.includes(":generateContent") ? { status: 500, corpo: {} } : { status: 200, corpo: LISTA }));
    expect(await gerarGemini({ mensagens: [{ papel: "user", texto: "x" }] }, ruim.busca, "chave-de-teste")).toBeNull();
  });
});
