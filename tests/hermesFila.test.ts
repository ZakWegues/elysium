import { describe, expect, it, vi } from "vitest";

vi.mock("../src/main/config", () => ({ getGeminiKey: () => "chave-de-teste" }));
const { escolherDoHermes, filaDoHermes } = await import("../src/services/gemini");
const { filaDoYaml } = await import("../src/services/hermes/processo");
const { usoNoLogDoHermes } = await import("../src/services/cotaGemini");

const modelos = { flash: ["gemini-3.8-flash", "gemini-3.5-flash"], lite: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"] };

describe("Hermes sem reiniciar por cota (27/11)", () => {
  it("a escolha pula o modelo que ficou sem cota depois de medido", () => {
    const ms = new Map<string, number | null>([["gemini-3.1-flash-lite", 300], ["gemini-3.5-flash-lite", 500], ["gemini-3.8-flash", 900]]);
    expect(escolherDoHermes(modelos, ms, () => false)).toBe("gemini-3.1-flash-lite");
    expect(escolherDoHermes(modelos, ms, (m) => m === "gemini-3.1-flash-lite")).toBe("gemini-3.5-flash-lite");
    // Os Lite todos sem cota: o Flash que respondeu.
    expect(escolherDoHermes(modelos, ms, (m) => m.endsWith("lite"))).toBe("gemini-3.8-flash");
    // Todos sem cota: o mais rápido mesmo assim (melhor tentar que ficar sem nada).
    expect(escolherDoHermes(modelos, ms, () => true)).toBe("gemini-3.1-flash-lite");
  });

  it("a fila põe os outros Gemini com cota na frente e mantém o resto na ordem", () => {
    const existente = [
      { provider: "gemini", model: "gemini-velho" },
      { provider: "custom", model: "qwen3.5-heretic:4b", base_url: "http://127.0.0.1:11434/v1" },
      { provider: "openrouter", model: "openrouter/free" },
    ];
    const fila = filaDoHermes("gemini-3.1-flash-lite", modelos, (m) => m === "gemini-3.8-flash", existente);
    expect(fila.map((f) => f.model)).toEqual(["gemini-3.5-flash-lite", "gemini-3.5-flash", "qwen3.5-heretic:4b", "openrouter/free"]);
    expect(fila[2].base_url).toBe("http://127.0.0.1:11434/v1");
    // O principal nunca aparece na própria fila; refazer dá o mesmo resultado (não regrava à toa).
    expect(filaDoHermes("gemini-3.1-flash-lite", modelos, (m) => m === "gemini-3.8-flash", fila)).toEqual(fila);
  });

  it("lê a fila do YAML que o `config get` imprime", () => {
    const yaml = [
      "  - provider: custom",
      "    model: qwen3.5-heretic:4b",
      "    base_url: http://127.0.0.1:11434/v1",
      "  - provider: openrouter",
      "    model: 'openrouter/free'",
      "  - provider: anthropic",
    ].join("\r\n");
    expect(filaDoYaml(yaml)).toEqual([
      { provider: "custom", model: "qwen3.5-heretic:4b", base_url: "http://127.0.0.1:11434/v1" },
      { provider: "openrouter", model: "openrouter/free" },
    ]);
    expect(filaDoYaml("[]")).toEqual([]);
  });

  it("um 429 seguido de chamada que deu certo não deixa o modelo esgotado o dia todo", () => {
    const log = [
      "2026-11-27 08:00:00,000 WARNING x: API call failed provider=gemini model=gemini-3.5-flash-lite summary=Gemini HTTP 429 (RESOURCE_EXHAUSTED)",
      "2026-11-27 08:00:05,000 INFO x: API call #1: model=gemini-3.5-flash-lite provider=gemini in=1",
      "2026-11-27 09:00:00,000 WARNING x: API call failed provider=gemini model=gemini-3.8-flash summary=Gemini HTTP 429 (RESOURCE_EXHAUSTED)",
    ].join("\n");
    expect(usoNoLogDoHermes(log, new Date("2026-11-27T05:00:00")).esgotados).toEqual(["gemini-3.8-flash"]);
  });
});
