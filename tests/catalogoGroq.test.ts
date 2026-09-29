import { describe, expect, it, vi } from "vitest";

vi.mock("../src/main/config", () => ({ getApiKey: () => "" }));
const { candidatosDeVisao } = await import("../src/services/catalogoGroq");

/** O catálogo real da conta em 28/09/2026 (via `groq:modelos`). */
const CATALOGO_28_09 = [
  "allam-2-7b", "canopylabs/orpheus-arabic-saudi", "canopylabs/orpheus-v1-english",
  "meta-llama/llama-prompt-guard-2-22m", "meta-llama/llama-prompt-guard-2-86m",
  "openai/gpt-oss-120b", "openai/gpt-oss-20b", "openai/gpt-oss-safeguard-20b",
  "qwen/qwen3.8-27b", "whisper-large-v3", "whisper-large-v3-turbo",
];

describe("catálogo da Groq — quem enxerga", () => {
  it("no catálogo de 28/09 só o qwen3.8 serve para imagem", () => {
    expect(candidatosDeVisao(CATALOGO_28_09)).toEqual(["qwen/qwen3.8-27b"]);
  });

  it("famílias de visão conhecidas vêm antes, e texto puro nunca entra", () => {
    const ids = ["openai/gpt-oss-120b", "qwen/qwen3.9-27b", "meta-llama/llama-4-scout-17b-16e-instruct", "algo-vision-preview"];
    expect(candidatosDeVisao(ids)).toEqual(["meta-llama/llama-4-scout-17b-16e-instruct", "qwen/qwen3.9-27b", "algo-vision-preview"]);
    expect(candidatosDeVisao(["openai/gpt-oss-120b", "whisper-large-v3"])).toEqual([]);
  });
});
