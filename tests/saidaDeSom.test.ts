import { describe, expect, it } from "vitest";
import { ehVirtual, problemaDeSom } from "../src/services/saidaDeSom";

describe("saída de som do PC", () => {
  it("reconhece alto-falante virtual", () => {
    expect(ehVirtual("Alto-falantes (Steam Streaming Speakers)")).toBe(true);
    expect(ehVirtual("CABLE Input (VB-Audio Virtual Cable)")).toBe(true);
    expect(ehVirtual("SAMSUNG (NVIDIA High Definition Audio)")).toBe(false);
    expect(ehVirtual("Alto-falantes (Realtek(R) Audio)")).toBe(false);
  });
  it("avisa virtual, mudo e volume quase zero; calado quando está tudo certo", () => {
    const base = { nome: "SAMSUNG (NVIDIA High Definition Audio)", volume: 60, mudo: false, virtual: false, em: 0 };
    expect(problemaDeSom(base)).toBeNull();
    expect(problemaDeSom({ ...base, nome: "Steam Streaming Speakers", virtual: true })).toContain("alto-falante virtual");
    expect(problemaDeSom({ ...base, mudo: true })).toContain("mudo");
    expect(problemaDeSom({ ...base, volume: 2 })).toContain("2%");
    expect(problemaDeSom(null)).toBeNull();
  });
});
