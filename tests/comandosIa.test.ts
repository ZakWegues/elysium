import { describe, expect, it, vi } from "vitest";

vi.mock("electron-store", () => ({ default: class { get(_k: string, d: unknown) { return d; } set() { /* */ } } }));
vi.mock("../src/main/config", () => ({ getApiKey: () => "", getConfig: () => ({}) }));

describe("comandos de IA (bloco 137)", async () => {
  const { DE_FABRICA, acharComando, limparResultado, mensagensDoComando } = await import("../src/services/comandosIa");

  it("acha o comando pelo id, pelo nome e pelo jeito falado", () => {
    expect(acharComando(DE_FABRICA, "corrigir")?.id).toBe("corrigir");
    expect(acharComando(DE_FABRICA, "Resumir")?.id).toBe("resumir");
    expect(acharComando(DE_FABRICA, "traduz pro inglês")?.id).toBe("ingles");
    expect(acharComando(DE_FABRICA, "traduz")?.id).toBe("portugues");
    expect(acharComando(DE_FABRICA, "corrige o português")?.id).toBe("corrigir");
    expect(acharComando([...DE_FABRICA, { id: "c-1", nome: "Virar tweet", instrucao: "x" }], "tweet")?.id).toBe("c-1");
    expect(acharComando(DE_FABRICA, "")).toBeUndefined();
  });

  it("a instrução vai no sistema e o texto na mensagem do usuário", () => {
    const m = mensagensDoComando({ instrucao: "Corrija." }, "texto errado");
    expect(m[0].content).toMatch(/INSTRUÇÃO: Corrija\.[\s\S]*SOMENTE com o resultado/);
    expect(m[1]).toEqual({ role: "user", content: "texto errado" });
  });

  it("tira introdução e aspas que o modelo põe em volta", () => {
    expect(limparResultado("Aqui está o texto corrigido:\nOlá, tudo bem?")).toBe("Olá, tudo bem?");
    expect(limparResultado("\"Hello, how are you?\"")).toBe("Hello, how are you?");
    expect(limparResultado("Ele disse \"oi\" e foi.")).toBe("Ele disse \"oi\" e foi.");
  });
});
