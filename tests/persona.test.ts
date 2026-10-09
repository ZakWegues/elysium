import { describe, expect, it } from "vitest";
import { ausenciaEmPalavras, contextoDoMomento, periodoDoDia } from "../src/services/persona";
import { lerHumor, linhaDoHumor } from "../src/services/humor";

describe("momento da conversa (bloco 186)", () => {
  it("diz data, hora e período", () => {
    const t = contextoDoMomento(new Date(2026, 9, 8, 14, 5));
    expect(t).toMatch(/\[MOMENTO\] Agora é quinta-feira, 8 de outubro de 2026, 14:05 \(tarde\)\./);
    expect(t).not.toMatch(/madrugada|fim de semana|foco|conversavam/);
  });

  it("madrugada, fim de semana, foco e ausência longa entram só quando valem", () => {
    const sab = contextoDoMomento(new Date(2026, 9, 10, 2, 30), { ausenciaMs: 30 * 3_600_000, focoAtivo: true });
    expect(sab).toMatch(/madrugada/);
    expect(sab).toMatch(/fim de semana/);
    expect(sab).toMatch(/não conversavam havia 1 dia/);
    expect(sab).toMatch(/modo foco/);
    // 5 h não é ausência: conversa do mesmo dia.
    expect(contextoDoMomento(new Date(2026, 9, 8, 10, 0), { ausenciaMs: 5 * 3_600_000 })).not.toMatch(/conversavam/);
  });

  it("período e ausência em palavras", () => {
    expect(periodoDoDia(4)).toBe("madrugada");
    expect(periodoDoDia(5)).toBe("manhã");
    expect(periodoDoDia(12)).toBe("tarde");
    expect(periodoDoDia(18)).toBe("noite");
    expect(ausenciaEmPalavras(3_600_000)).toBe("1 hora");
    expect(ausenciaEmPalavras(7 * 3_600_000)).toBe("7 horas");
    expect(ausenciaEmPalavras(50 * 3_600_000)).toBe("2 dias");
  });
});

describe("humor de quem pede (bloco 187)", () => {
  it("reconhece os casos claros", () => {
    expect(lerHumor("aff, não funciona de jeito nenhum")).toBe("frustrado");
    expect(lerHumor("POR QUE ISSO NÃO ABRE")).toBe("frustrado");
    expect(lerHumor("que droga!")).toBe("frustrado");
    expect(lerHumor("hoje tô triste")).toBe("triste");
    expect(lerHumor("tô morto de sono, me lembra de estudar amanhã")).toBe("cansado");
    expect(lerHumor("rápido, abre o chrome")).toBe("apressado");
    expect(lerHumor("passei na prova!")).toBe("animado");
    expect(lerHumor("fui aprovado")).toBe("animado");
  });

  it("não dispara em frase comum", () => {
    expect(lerHumor("toca de novo")).toBe("neutro");
    expect(lerHumor("boa noite")).toBe("neutro");
    expect(lerHumor("passei mal ontem, o que é bom para enjoo?")).toBe("neutro");
    expect(lerHumor("põe saco de lixo na lista do mercado")).toBe("neutro");
    expect(lerHumor("quantas horas de sono eu devo dormir?")).toBe("neutro");
    expect(lerHumor("abre o VS Code")).toBe("neutro");
    expect(lerHumor("ok")).toBe("neutro");
    expect(lerHumor("")).toBe("neutro");
  });

  it("'cansei de esperar' é irritação, não cansaço", () => {
    expect(lerHumor("cansei de esperar")).not.toBe("cansado");
  });

  it("a linha do prompt só existe fora do neutro", () => {
    expect(linhaDoHumor("neutro")).toBe("");
    expect(linhaDoHumor("frustrado")).toMatch(/sem piada/);
    expect(linhaDoHumor("triste")).toMatch(/gentil/);
  });
});

describe("humor: casos da revisão", () => {
  it("frases comuns não viram humor", () => {
    expect(lerHumor("não consegui instalar o driver, o que eu faço?")).not.toBe("animado");
    expect(lerHumor("o PC desligou sozinho ontem")).toBe("neutro");
    expect(lerHumor("qual o carro mais rápido do mundo?")).toBe("neutro");
    expect(lerHumor("fui correndo pro trabalho")).toBe("neutro");
    expect(lerHumor("não acredito que o Brasil ganhou!")).not.toBe("frustrado");
  });
  it("e os de verdade continuam", () => {
    expect(lerHumor("responde rápido, tô atrasado")).toBe("apressado");
    expect(lerHumor("tô me sentindo sozinho hoje")).toBe("triste");
    expect(lerHumor("consegui o estágio!")).toBe("animado");
  });
});
