import { describe, expect, it } from "vitest";
import { lerEstado, nomeDoApp, SCRIPT } from "../src/services/midiaAgora";
import { ATALHOS_PADRAO, atalhoValido, capaVazia, lerAtalhos, salvarAtalhos } from "../src/services/mesa";

describe("Modo Mesa — o que toca no PC (25/11)", () => {
  it("lê o estado do PowerShell e corta o que vier estranho", () => {
    const e = lerEstado({
      som: { volume: 140, mudo: true, micMudo: false },
      midia: { app: "Chrome", titulo: "Vídeo", artista: "Canal", album: "", tocando: true, pos: 12.5, posEm: 1000, dur: 300, podeVoltar: false, podeAvancar: true, capa: "abc", cor: "red" },
    });
    expect(e?.som).toEqual({ volume: 100, mudo: true, micMudo: false });
    expect(e?.midia).toMatchObject({ titulo: "Vídeo", tocando: true, pos: 12.5, podeVoltar: false, capa: "abc", cor: "" });
    expect(lerEstado({ som: { volume: 30 }, midia: { titulo: "" } })?.midia).toBeNull();
    expect(lerEstado({ midia: null })).toBeNull();
    expect(lerEstado(null)).toBeNull();
  });

  it("o nome do app é legível", () => {
    expect(nomeDoApp("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify")).toBe("Spotify");
    expect(nomeDoApp("chrome.exe")).toBe("Chrome");
    expect(nomeDoApp("MSEdge")).toBe("Edge");
    expect(nomeDoApp("foobar2000.exe")).toBe("foobar2000");
  });

  it("o PowerShell não lê a entrada de jeito que trava o laço", () => {
    expect(SCRIPT).not.toContain("[Console]::In.ReadLineAsync");
    expect(SCRIPT).toContain("OpenStandardInput");
    // Duas classes COM com o mesmo CLSID no mesmo processo não convertem uma na outra.
    expect(SCRIPT.match(/class \w+ ?\{\}/g)?.filter((c) => c.includes("MDE") || c.includes("MesaEnum")).length).toBe(1);
  });
});

describe("Modo Mesa — capa", () => {
  it("o quadrado preto do Spotify conta como sem capa", () => {
    expect(capaVazia({ capa: "a".repeat(1884), cor: "#000000" })).toBe(true);
    expect(capaVazia({ capa: "", cor: "" })).toBe(true);
    expect(capaVazia({ capa: "a".repeat(20000), cor: "#000000" })).toBe(false);
    expect(capaVazia({ capa: "a".repeat(1884), cor: "#ff6a3d" })).toBe(false);
  });
});

describe("Modo Mesa — atalhos", () => {
  it("aceita os bons e recusa ação inventada, link que não é http e tecla desconhecida", () => {
    expect(atalhoValido({ id: "x", tipo: "acao", rotulo: "Bloquear", icone: "lock", valor: "bloquear" })).not.toBeNull();
    expect(atalhoValido({ id: "x", tipo: "acao", rotulo: "Apagar tudo", icone: "x", valor: "formatar" })).toBeNull();
    expect(atalhoValido({ id: "x", tipo: "link", rotulo: "Mau", icone: "x", valor: "file:///c:/windows" })).toBeNull();
    expect(atalhoValido({ id: "x", tipo: "teclas", rotulo: "Copiar", icone: "copy", valor: "ctrl+c" })).not.toBeNull();
    expect(atalhoValido({ id: "x", tipo: "teclas", rotulo: "?", icone: "x", valor: "ctrl+banana" })).toBeNull();
    expect(atalhoValido({ id: "x", tipo: "app", rotulo: "", icone: "x", valor: "chrome" })).toBeNull();
    expect(atalhoValido({ id: "x", tipo: "app", rotulo: "Chrome", icone: "<script>", valor: "chrome" })?.icone).toBe("zap");
  });

  it("guarda sem repetidos, no máximo 24, e o padrão vale até salvar", () => {
    expect(lerAtalhos()).toEqual(ATALHOS_PADRAO);
    const muitos = Array.from({ length: 30 }, (_, i) => ({ id: `a${i % 20}`, tipo: "link", rotulo: `L${i}`, icone: "link", valor: "https://exemplo.com" }));
    const salvos = salvarAtalhos(muitos);
    expect(salvos.length).toBe(20);
    expect(lerAtalhos()).toEqual(salvos);
    expect(() => salvarAtalhos("nada")).toThrow();
  });
});
