import { describe, expect, it } from "vitest";
import { ceuDe, correcaoEm, distanciaKm, lerEstacoes, medir, umidadeDe } from "../src/services/estacoes";

const hora = (h: number, m = 0) => new Date(2026, 10, 23, h, m).getTime();
const linha = (id: string, lat: number, lon: number, em: number, temp: number, extra = {}) => ({ icaoId: id, lat, lon, obsTime: em / 1000, temp, dewp: 21, wspd: 10, wxString: "", cover: "BKN", ...extra });

describe("o tempo medido (23/11)", () => {
  const linhas = [
    linha("PERTO", -10.1, -40.0, hora(17), 22, { wxString: "+TSRA BR" }),
    linha("PERTO", -10.1, -40.0, hora(14), 31),
    linha("PERTO", -10.1, -40.0, hora(5), 21),
    linha("PERTO", -10.1, -40.0, hora(17) - 24 * 3_600_000 + 60_000, 35),
    linha("MEDIA", -10.3, -40.0, hora(17), 25),
    linha("LONGE", -11.5, -40.0, hora(17), 10),
  ];
  const est = lerEstacoes(linhas, -10, -40);

  it("só as estações em volta, da mais perto à mais longe", () => {
    expect(est.map((e) => e.id)).toEqual(["PERTO", "MEDIA"]);
    expect(distanciaKm(-10, -40, -10.1, -40)).toBeCloseTo(11.1, 0);
  });

  it("perto, vale a estação sozinha; a máxima e a mínima são as de hoje", () => {
    const m = medir(est, hora(0), hora(17, 20))!;
    expect(m).toMatchObject({ temp: 22, max: 31, min: 21, ventoKmh: 19 });
    expect(m.ceu?.descricao).toBe("tempestade");
    expect(m.umidade).toBe(94);
  });

  it("sem estação a menos de 20 km mistura as de em volta; leitura velha não vale", () => {
    const longe = lerEstacoes([linha("A", -10.25, -40, hora(17), 20), linha("B", -9.75, -40, hora(17), 24)], -10, -40);
    expect(medir(longe, hora(0), hora(17, 10))!.temp).toBeCloseTo(22, 1);
    expect(medir(est, hora(0), hora(19))).toBe(null);
    expect(medir([], hora(0), hora(17))).toBe(null);
  });

  it("o céu, a umidade e a correção que some", () => {
    expect(ceuDe("-RA BR", "OVC")?.descricao).toBe("chuva fraca");
    expect(ceuDe("DZ", "")?.descricao).toBe("garoa");
    expect(ceuDe("", "CAVOK")?.descricao).toBe("céu limpo");
    expect(ceuDe("", "")).toBe(undefined);
    expect(umidadeDe(20, 20)).toBe(100);
    expect(correcaoEm(-2, 0)).toBe(-2);
    expect(correcaoEm(-2, 3)).toBe(-1);
  });
});
