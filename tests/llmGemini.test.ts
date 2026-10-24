import { beforeEach, describe, expect, it, vi } from "vitest";

const cfg = { ollamaReserva: false, ollamaBaseUrl: "http://127.0.0.1:11434" };
let chave = "chave-de-teste";
vi.mock("../src/main/config", () => ({
  getConfig: () => cfg,
  getApiKey: () => "",
  getGeminiKey: () => chave,
  marcarModeloMorto: () => {},
}));
vi.mock("../src/services/ollamaVivo", () => ({ falhaDeConexao: () => false, garantirOllama: async () => false }));
vi.mock("../src/services/gemini", () => ({ modelosGemini: async () => ({ flash: ["gemini-2.5-flash"], lite: ["gemini-2.5-flash-lite"] }) }));
const { callChat } = await import("../src/services/llm");

const pedido = { provider: "ollama" as const, model: "qwen2.5:7b", messages: [{ role: "user" as const, content: "oi" }], temperature: 0, maxTokens: 10 };

describe("rotinas do Ollama no Gemini (24/10)", () => {
  beforeEach(() => { chave = "chave-de-teste"; cfg.ollamaReserva = false; vi.unstubAllGlobals(); });

  it("com chave, o pedido \"ollama\" vai ao Flash-Lite pelo endpoint OpenAI do Gemini", async () => {
    const chamadas: { url: string; corpo: { model: string } }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      chamadas.push({ url, corpo: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ choices: [{ message: { content: "olá" } }] }), { status: 200 });
    });
    expect(await callChat(pedido)).toBe("olá");
    expect(chamadas[0].url).toContain("generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(chamadas[0].url).not.toContain("chave-de-teste");
    expect(chamadas[0].corpo.model).toBe("gemini-2.5-flash-lite");
  });

  it("Gemini falhou: sem reserva, o erro sobe; com reserva, cai no Ollama", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return url.includes("11434")
        ? new Response(JSON.stringify({ message: { content: "local" } }), { status: 200 })
        : new Response("{}", { status: 503 });
    });
    await expect(callChat(pedido)).rejects.toThrow(/503/);
    cfg.ollamaReserva = true;
    expect(await callChat(pedido)).toBe("local");
    expect(urls.at(-1)).toContain("127.0.0.1:11434/api/chat");
  });

  it("sem chave, tudo como antes: direto no Ollama", async () => {
    chave = "";
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => { urls.push(url); return new Response(JSON.stringify({ message: { content: "local" } }), { status: 200 }); });
    expect(await callChat(pedido)).toBe("local");
    expect(urls).toEqual(["http://127.0.0.1:11434/api/chat"]);
  });
});
