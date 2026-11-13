import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp" }, safeStorage: {} }));
import { escolherPerfilStudio, perfilValido, resolverPerfil } from "../src/services/voiceStudio";
import { juntarPcm, proximoBeat } from "../src/services/vozStudioStream";

describe("voz pelo VoiceStudio (17/10, de volta em 12/11)", () => {
  const vozes = [{ id: "a1b2", nome: "Ely Irlandesa" }, { id: "c3d4", nome: "Narradora" }, { id: "e5f6", nome: "Portuguese Narrator" }];

  it("acha o perfil pelo nome, sem maiúscula nem acento, ou pelo ID", () => {
    expect(resolverPerfil("", vozes)).toBe("default");
    expect(resolverPerfil("ely irlandesa", vozes)).toBe("a1b2");
    expect(resolverPerfil("c3d4", vozes)).toBe("c3d4");
    expect(resolverPerfil("Nárradora", vozes)).toBe("c3d4");
    expect(resolverPerfil("outra", vozes)).toBe("outra");
  });

  it("sem escolha, usa o perfil em português; sem nenhum, a voz padrão do motor", () => {
    expect(escolherPerfilStudio("", vozes)).toBe("e5f6");
    expect(escolherPerfilStudio("narradora", vozes)).toBe("c3d4");
    expect(escolherPerfilStudio("", [{ id: "x", nome: "Demo" }])).toBeNull();
  });

  it("os Ajustes só gravam provedor e perfil válidos", async () => {
    expect(perfilValido("Ely Irlandesa 2")).toBe(true);
    expect(perfilValido("<img onerror=x>")).toBe(false);
    const { patchDeConfigSeguro } = await import("../src/main/config");
    expect(patchDeConfigSeguro({ vozProvedor: "voicestudio", voiceStudioVoz: "Ely" } as never)).toEqual({ vozProvedor: "voicestudio", voiceStudioVoz: "Ely" });
    expect(patchDeConfigSeguro({ vozProvedor: "http://mal", voiceStudioVoz: "../x/y" } as never)).toEqual({});
  });

  it("a troca única para o VoiceStudio roda uma vez só", async () => {
    const { migrarVozStudio } = await import("../src/main/config");
    expect(migrarVozStudio({})).toEqual({ vozStudioAplicado: true, vozProvedor: "voicestudio" });
    expect(migrarVozStudio({ vozStudioAplicado: true, vozProvedor: "edge" })).toBeNull();
  });
});

describe("streaming do VoiceStudio (12/11)", () => {
  it("o byte ímpar do PCM16 passa para o pedaço seguinte", () => {
    const a = juntarPcm(null, new Uint8Array([1, 2, 3]));
    expect([...a.pcm]).toEqual([1, 2]);
    expect(a.sobra).toBe(3);
    const b = juntarPcm(a.sobra, new Uint8Array([4, 5, 6]));
    expect([...b.pcm]).toEqual([3, 4, 5, 6]);
    expect(b.sobra).toBeNull();
    expect(juntarPcm(null, new Uint8Array([9])).pcm.length).toBe(0);
  });

  it("o beat sorteado nunca repete o anterior", () => {
    for (let ultimo = 0; ultimo < 5; ultimo++) {
      for (const s of [0, 0.2, 0.5, 0.99]) {
        const i = proximoBeat(ultimo, 5, s);
        expect(i).not.toBe(ultimo);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(5);
      }
    }
    expect(proximoBeat(-1, 5, 0)).toBe(0);
    expect(proximoBeat(0, 1, 0.5)).toBe(0);
  });
});
