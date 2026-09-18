import { describe, expect, it, vi } from "vitest";

// O brain importa llm, config, memória, histórico… nada disso roda aqui: só o parse.
vi.mock("../src/services/llm", () => ({ chat: vi.fn(), ollamaDisponivel: vi.fn() }));
vi.mock("../src/main/config", () => ({ getConfig: () => ({ chatHistoryTurns: 6, chatIdleResetMs: 60000 }) }));

const { interpretarAcoes } = await import("../src/services/brain");

/**
 * `null` = "este provedor não entregou nada utilizável, tenta o outro";
 * `unknown` = resposta legítima do modelo. A diferença é o que decide o fallback (§6).
 */
describe("interpretarAcoes — o JSON do roteador", () => {
  it("aceita {actions:[…]} e o formato antigo de uma ação só", () => {
    expect(interpretarAcoes('{"actions":[{"action":"open_app","app_name":"chrome"}]}')).toEqual([{ action: "open_app", app_name: "chrome" }]);
    expect(interpretarAcoes('{"action":"weather"}')).toEqual([{ action: "weather" }]);
  });

  it("JSON quebrado ou sem ação é null (vale o fallback)", () => {
    expect(interpretarAcoes("não sei")).toBeNull();
    expect(interpretarAcoes("{}")).toBeNull();
    expect(interpretarAcoes('{"actions":[]}')).toBeNull();
  });

  it("ação inventada pelo modelo é descartada; se não sobrar nada, null", () => {
    expect(interpretarAcoes('{"actions":[{"action":"hack_nasa"},{"action":"unknown"}]}')).toEqual([{ action: "unknown" }]);
    expect(interpretarAcoes('{"actions":[{"action":"hack_nasa"}]}')).toBeNull();
  });
});
