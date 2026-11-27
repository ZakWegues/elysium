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
const { callChat, callChatComFerramentas } = await import("../src/services/llm");

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

describe("ferramentas no Gemini: thought_signature (27/11)", () => {
  beforeEach(() => { chave = "chave-de-teste"; vi.unstubAllGlobals(); });

  it("a assinatura que veio na chamada volta igual na rodada seguinte", async () => {
    const corpos: { messages: { tool_calls?: { extra_content?: unknown }[] }[] }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      corpos.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: "", tool_calls: [
        { id: "c1", type: "function", function: { name: "tocar_musica", arguments: "{\"busca\":\"foco\"}" }, extra_content: { google: { thought_signature: "ASSINA" } } },
      ] } }] }), { status: 200 });
    });
    const base = { provider: "ollama" as const, model: "x", tools: [], temperature: 0, maxTokens: 10 };
    const r1 = await callChatComFerramentas({ ...base, messages: [{ role: "user", content: "toca" }] });
    expect(r1.toolCalls[0]).toMatchObject({ name: "tocar_musica", args: { busca: "foco" }, extra: { google: { thought_signature: "ASSINA" } } });
    await callChatComFerramentas({ ...base, messages: [
      { role: "user", content: "toca" },
      { role: "assistant", content: "", tool_calls: r1.toolCalls },
      { role: "tool", tool_call_id: "c1", name: "tocar_musica", content: "Tocando." },
    ] });
    expect(corpos[1].messages[1].tool_calls?.[0].extra_content).toEqual({ google: { thought_signature: "ASSINA" } });
  });
});
