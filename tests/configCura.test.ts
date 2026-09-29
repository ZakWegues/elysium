import { describe, expect, it } from "vitest";
import { getConfig, getOverrides, setOverride } from "../src/main/config";

describe("modelo aposentado escolhido pelo usuário (fase 12)", () => {
  it("é trocado no disco, não só em memória", () => {
    setOverride({ routerModel: "llama-3.1-8b-instant" } as never);
    const cfg = getConfig();
    expect(cfg.routerModel).not.toBe("llama-3.1-8b-instant");
    expect(getOverrides().routerModel).toBe(cfg.routerModel);
  });
});
