import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp" }, safeStorage: {} }));
import { kbpsDoMp3, perfilValido, resolverPerfil, velocidadeDoStudio } from "../src/services/voiceStudio";

describe("voz pelo VoiceStudio (17/10)", () => {
  it("acha o perfil pelo nome, sem maiúscula nem acento, ou pelo ID", () => {
    const vozes = [{ id: "a1b2", nome: "Ely Irlandesa" }, { id: "c3d4", nome: "Narradora" }];
    expect(resolverPerfil("", vozes)).toBe("default");
    expect(resolverPerfil("ely irlandesa", vozes)).toBe("a1b2");
    expect(resolverPerfil("c3d4", vozes)).toBe("c3d4");
    expect(resolverPerfil("Nárradora", vozes)).toBe("c3d4");
    expect(resolverPerfil("outra", vozes)).toBe("outra");
  });

  it("converte a velocidade em % para o speed da API, com teto", () => {
    expect(velocidadeDoStudio("+0%")).toBe(1);
    expect(velocidadeDoStudio("-6%")).toBe(0.94);
    expect(velocidadeDoStudio("+10%")).toBe(1.1);
    expect(velocidadeDoStudio("lixo")).toBe(1);
    expect(velocidadeDoStudio("+500%")).toBe(2);
  });

  it("lê o bitrate do primeiro quadro, pulando o ID3", () => {
    // MPEG1 Layer III, índice 9 = 128 kbps.
    const quadro = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
    expect(kbpsDoMp3(Buffer.concat([quadro, Buffer.alloc(100)]))).toBe(128);
    const id3 = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 20]);
    expect(kbpsDoMp3(Buffer.concat([id3, Buffer.alloc(20, 0xff), quadro, Buffer.alloc(100)]))).toBe(128);
    expect(kbpsDoMp3(Buffer.alloc(50))).toBeNull();
  });

  it("os Ajustes só gravam motor e perfil válidos", async () => {
    expect(perfilValido("Ely Irlandesa 2")).toBe(true);
    expect(perfilValido("<img onerror=x>")).toBe(false);
    const { patchDeConfigSeguro } = await import("../src/main/config");
    expect(patchDeConfigSeguro({ motorVoz: "voicestudio", voiceStudioVoz: "Ely" } as never)).toEqual({ motorVoz: "voicestudio", voiceStudioVoz: "Ely" });
    expect(patchDeConfigSeguro({ motorVoz: "http://mal", voiceStudioVoz: "../x/y" } as never)).toEqual({});
  });
});
