import { describe, expect, it } from "vitest";
import { discoCritico, formatarBytes } from "../src/actions/armazenamento";

describe("armazenamento (fase 12)", () => {
  it("avisa com 95% usado ou menos de 10 GB livres", () => {
    expect(discoCritico([{ name: "C:", freeGB: 26, totalGB: 931, usedPct: 97 }])?.name).toBe("C:");
    expect(discoCritico([{ name: "D:", freeGB: 8, totalGB: 64, usedPct: 88 }])?.name).toBe("D:");
    expect(discoCritico([{ name: "C:", freeGB: 200, totalGB: 931, usedPct: 78 }])).toBeNull();
  });

  it("escreve tamanho do jeito que se fala", () => {
    expect(formatarBytes(26_400_000_000)).toBe("26,4 GB");
    expect(formatarBytes(340_000_000)).toBe("340 MB");
    expect(formatarBytes(900)).toBe("1 kB");
  });
});
