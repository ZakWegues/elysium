import { describe, expect, it } from "vitest";
import { duracaoDoMp3, envelopeDasPalavras, palavrasDoMetadado, palavrasPeloTexto } from "../src/services/bolota";

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
