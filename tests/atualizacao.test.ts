import { describe, expect, it } from "vitest";
import { compararVersoes, partesDaVersao } from "../src/services/atualizacao";
import { mascarar } from "../src/main/logArquivo";

describe("atualização automática (bloco 95)", () => {
  it("lê a tag da release com ou sem o v", () => {
    expect(partesDaVersao("v1.5.0")).toEqual([1, 5, 0]);
    expect(partesDaVersao("1.10.2-beta.1")).toEqual([1, 10, 2]);
  });

  it("compara número a número, não como texto", () => {
    expect(compararVersoes("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compararVersoes("v1.5.0", "1.5.0")).toBe(0);
    expect(compararVersoes("1.4.0", "1.5.0")).toBeLessThan(0);
    expect(compararVersoes("1.5", "1.5.0")).toBe(0);
  });

  it("o log esconde token do GitHub", () => {
    const t = mascarar("token ghp_ABCDEFGHIJKLMNOPQRSTUV e github_pat_11AAAAAAAAAAAAAAAAAAAAAA_bbbbbbbbbb");
    expect(t).not.toMatch(/ABCDEFGHIJKLMNOP/);
    expect(t).not.toMatch(/11AAAAAAAAAAAAAAAA/);
    expect(t).toContain("ghp_[oculto]");
  });
});

describe("instalar sozinho de madrugada", async () => {
  const { horaDeInstalarSozinho } = await import("../src/services/atualizacao");
  const as = (h: number) => new Date(2026, 8, 30, h, 20);
  it("só entre 3 e 5 h, com o PC parado e o app ocioso", () => {
    expect(horaDeInstalarSozinho(as(3), 20 * 60, false)).toBe(true);
    expect(horaDeInstalarSozinho(as(4), 20 * 60, false)).toBe(true);
    expect(horaDeInstalarSozinho(as(5), 20 * 60, false)).toBe(false);
    expect(horaDeInstalarSozinho(as(2), 20 * 60, false)).toBe(false);
    expect(horaDeInstalarSozinho(as(3), 5 * 60, false)).toBe(false);   // alguém mexeu no PC
    expect(horaDeInstalarSozinho(as(3), 20 * 60, true)).toBe(false);   // ELYSIUM falando
  });
});

describe("novidades de versões puladas", async () => {
  const { juntarNotas } = await import("../src/services/atualizacao");
  const rels = [
    { tag_name: "v1.5.4", body: "card saúde" },
    { tag_name: "v1.5.3", body: "download em segundo plano" },
    { tag_name: "v1.5.2", body: "ollama sobe sozinho" },
    { tag_name: "v1.5.1", body: "armazenamento" },
  ];
  it("junta as notas desde a última vista, da mais nova para a mais velha", () => {
    const t = juntarNotas(rels, "1.5.2", "1.5.4");
    expect(t.indexOf("1.5.4: card saúde")).toBe(0);
    expect(t).toContain("1.5.3: download em segundo plano");
    expect(t).not.toContain("ollama");
  });
  it("uma versão só vem sem cabeçalho", () => {
    expect(juntarNotas(rels, "1.5.3", "1.5.4")).toBe("card saúde");
  });
});

describe("assinatura do instalador (bloco 115)", async () => {
  const { assinaturaConfere, ASSINATURAS_ACEITAS } = await import("../src/services/atualizacao");
  const nossa = ASSINATURAS_ACEITAS[0];
  it("autoassinado deste PC passa (o Windows diz UnknownError: raiz não confiada)", () => {
    expect(assinaturaConfere("UnknownError", nossa)).toBe(true);
    expect(assinaturaConfere("Valid", nossa.toLowerCase())).toBe(true);
  });
  it("adulterado, sem assinatura ou de outro certificado não passa", () => {
    expect(assinaturaConfere("HashMismatch", nossa)).toBe(false);
    expect(assinaturaConfere("NotSigned", "")).toBe(false);
    expect(assinaturaConfere("Valid", "0000000000000000000000000000000000000000")).toBe(false);
  });
});

describe("atualizador mais firme (07/10)", async () => {
  const { maiorRelease, versionCodeDasNotas } = await import("../src/services/atualizacao");
  it("escolhe a MAIOR versão, sem rascunho nem pré-lançamento", () => {
    const rel = (tag: string, extra: object = {}) => ({ tag_name: tag, published_at: "", draft: false, prerelease: false, assets: [], ...extra });
    expect(maiorRelease([rel("v1.9.0"), rel("v1.10.0"), rel("v2.0.0", { draft: true }), rel("v1.11.0", { prerelease: true })])?.tag_name).toBe("v1.10.0");
    expect(maiorRelease([])).toBeNull();
  });
  it("lê o versionCode das notas", () => {
    expect(versionCodeDasNotas("Novidades\n\nversionCode 20")).toBe(20);
    expect(versionCodeDasNotas("sem")).toBeUndefined();
  });
});
