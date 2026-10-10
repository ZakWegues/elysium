import { describe, expect, it } from "vitest";
import { bolotaVisivel, duracaoDoMp3, envelopeDasPalavras, estadoDaBolota, palavrasDoMetadado, palavrasPeloTexto, prenderNaArea } from "../src/services/bolota";
import { ehTelaCheia, lerLinhaDoVigia } from "../src/main/telaCheia";

describe("estado da bolota (bloco 214)", () => {
  it("segue o app: ouvindo, pensando, falando e de volta a dormir", () => {
    let s = estadoDaBolota("dormindo", { tipo: "app", estado: "listening" });
    expect(s).toBe("ouvindo");
    s = estadoDaBolota(s, { tipo: "app", estado: "processing" });
    expect(s).toBe("pensando");
    s = estadoDaBolota(s, { tipo: "fala", falando: true });
    expect(s).toBe("falando");
    // O app volta a ocioso antes de a fila de fala acabar: continua falando.
    s = estadoDaBolota(s, { tipo: "app", estado: "idle" });
    expect(s).toBe("falando");
    s = estadoDaBolota(s, { tipo: "fala", falando: false });
    expect(s).toBe("dormindo");
  });
  it("erro aparece e some sozinho", () => {
    let s = estadoDaBolota("pensando", { tipo: "erro" });
    expect(s).toBe("erro");
    s = estadoDaBolota(s, { tipo: "app", estado: "idle" });
    expect(s).toBe("erro");
    expect(estadoDaBolota(s, { tipo: "fimDoErro" })).toBe("dormindo");
  });
  it("lembrete falando com o app ocioso também pulsa", () => {
    expect(estadoDaBolota("dormindo", { tipo: "fala", falando: true })).toBe("falando");
  });
});

describe("pulso da fala", () => {
  it("lê o metadado de palavras do Edge (100 ns → ms), mesmo com JSONs colados", () => {
    const m = (o: number, d: number, t: string) => JSON.stringify({ Metadata: [{ Type: "WordBoundary", Data: { Offset: o, Duration: d, text: { Text: t, Length: t.length } } }] });
    const p = palavrasDoMetadado([m(1020830, 4557500, "Pronto"), m(7270830, 4947910, "chefe") + m(14974160, 4557500, "Volume")]);
    expect(p).toEqual([{ inicio: 102, dur: 456, tam: 6 }, { inicio: 727, dur: 495, tam: 5 }, { inicio: 1497, dur: 456, tam: 6 }]);
  });
  it("duração do MP3 de 48 kbps", () => {
    expect(duracaoDoMp3(21312)).toBe(3552);
  });
  it("o envelope sobe em cada palavra e cai entre elas", () => {
    const env = envelopeDasPalavras([{ inicio: 0, dur: 300, tam: 5 }, { inicio: 600, dur: 300, tam: 5 }], 1000, 50);
    expect(Math.max(...env.slice(0, 6))).toBeGreaterThan(0.5);
    expect(env[10]).toBeLessThan(0.1); // 500 ms: entre as palavras
    expect(Math.max(...env.slice(12, 18))).toBeGreaterThan(0.5);
    expect(env.every(v => v >= 0 && v <= 1)).toBe(true);
  });
  it("sem metadado, as palavras se espalham pela duração", () => {
    const p = palavrasPeloTexto("Pronto, chefe. Volume em quarenta.", 3000);
    expect(p).toHaveLength(5);
    expect(p[0].inicio).toBe(0);
    expect(p[4].inicio).toBeLessThan(3000);
    expect(p[4].inicio).toBeGreaterThan(p[3].inicio);
  });
});

describe("onde e quando aparece", () => {
  it("modo e tela cheia", () => {
    expect(bolotaVisivel("sempre", "dormindo", false)).toBe(true);
    expect(bolotaVisivel("sempre", "falando", true)).toBe(false);
    expect(bolotaVisivel("falando", "dormindo", false)).toBe(false);
    expect(bolotaVisivel("falando", "ouvindo", false)).toBe(true);
    expect(bolotaVisivel("desligada", "falando", false)).toBe(false);
  });
  it("posição presa à área útil", () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 };
    expect(prenderNaArea({ x: 5000, y: -50 }, { largura: 300, altura: 180 }, area)).toEqual({ x: 1620, y: 0 });
  });
  it("estado do Windows: 2, 3 e 4 são tela cheia — menos a área de trabalho", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(s => ehTelaCheia(s, "Chrome_WidgetWin_1"))).toEqual([false, true, true, true, false, false, false]);
    expect(ehTelaCheia(2, "Progman")).toBe(false);
    expect(ehTelaCheia(2, "WorkerW")).toBe(false);
    expect(ehTelaCheia(3, "WorkerW")).toBe(true);
    expect(lerLinhaDoVigia("Q2 CProgman")).toEqual({ estado: 2, classe: "Progman" });
  });
});
