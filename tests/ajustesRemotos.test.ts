import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
vi.mock("electron", () => ({ app: { getPath: () => "C:/tmp" }, safeStorage: {} }));
import { AJUSTES_REMOTOS, ajustesComValores, campoRemoto, valorRemotoValido } from "../src/services/ajustesRemotos";

describe("Ajustes do PC no celular (12/11)", () => {
  const dash = fs.readFileSync(path.join(__dirname, "..", "src", "renderer", "dashboard", "js", "ajustes.js"), "utf8");

  it("toda chave mandada ao celular existe nos Ajustes do PC", () => {
    for (const g of AJUSTES_REMOTOS) for (const c of g.campos) expect(dash.includes(`chave: "${c.chave}"`), c.chave).toBe(true);
  });

  it("nada de segredo, porta, endereço ou atalho vai ao celular", () => {
    const chaves = AJUSTES_REMOTOS.flatMap((g) => g.campos.map((c) => String(c.chave)));
    for (const proibida of ["apiKey", "geminiKey", "serverToken", "serverPort", "ollamaBaseUrl", "shortcut", "atalhoSelecao", "atalhoFlutuante", "nomeDoUsuario"]) expect(chaves).not.toContain(proibida);
    expect(campoRemoto("serverPort")).toBeNull();
    expect(campoRemoto(42)).toBeNull();
  });

  it("valida o valor pelo tipo do campo", () => {
    const sc = campoRemoto("semCensura")!;
    expect(valorRemotoValido(sc, true)).toBe(true);
    expect(valorRemotoValido(sc, "sim")).toBeUndefined();
    const cer = campoRemoto("cerebro")!;
    expect(valorRemotoValido(cer, "hermes")).toBe("hermes");
    expect(valorRemotoValido(cer, "outro")).toBeUndefined();
    const vel = campoRemoto("velocidadeFala")!;
    expect(valorRemotoValido(vel, 4.4)).toBe(4);
    expect(valorRemotoValido(vel, 40)).toBeUndefined();
    const vs = campoRemoto("voiceStudioVoz")!;
    expect(valorRemotoValido(vs, "  Narradora ")).toBe("Narradora");
    expect(valorRemotoValido(vs, "x".repeat(200))).toBeUndefined();
  });

  it("manda o valor de agora (ou o padrão) em cada campo", () => {
    const g = ajustesComValores({ semCensura: true, cerebro: "hermes" } as never);
    const campos = g.flatMap((x) => x.campos);
    expect(campos.find((c) => c.chave === "semCensura")?.valor).toBe(true);
    expect(campos.find((c) => c.chave === "viaRapida")?.valor).toBe(true);
    expect(campos.find((c) => c.chave === "vozProvedor")?.valor).toBe("gemini");
  });
});
