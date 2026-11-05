import { describe, expect, it, vi } from "vitest";

vi.mock("../src/main/config", () => ({ getConfig: () => ({}), setOverride: () => {} }));
vi.mock("../src/services/brain", () => ({ composeChatReply: async () => null, decideBrain: async () => [] }));
vi.mock("../src/services/webSearch", () => ({ searchWeb: async () => "" }));

const { pedidoDeModoCensura } = await import("../src/services/semCensura");

describe("modo sem censura (05/11)", () => {
  it("liga e desliga pela fala, com e sem verbo", () => {
    expect(pedidoDeModoCensura("modo sem censura")).toBe(true);
    expect(pedidoDeModoCensura("Liga o modo sem censura!")).toBe(true);
    expect(pedidoDeModoCensura("ativa modo sem censura")).toBe(true);
    expect(pedidoDeModoCensura("desliga o modo sem censura")).toBe(false);
    expect(pedidoDeModoCensura("modo com censura")).toBe(false);
    expect(pedidoDeModoCensura("volta pro modo com censura")).toBe(false);
  });
  it("frase que só menciona o modo não troca nada", () => {
    expect(pedidoDeModoCensura("o que é o modo sem censura?")).toBeNull();
    expect(pedidoDeModoCensura("me conta uma piada")).toBeNull();
  });
});
