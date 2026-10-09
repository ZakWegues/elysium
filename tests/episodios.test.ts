import { beforeEach, describe, expect, it, vi } from "vitest";

const respostaDoModelo = vi.hoisted(() => ({ texto: "" }));
vi.mock("../src/services/llm", () => ({
  callChat: vi.fn(async () => respostaDoModelo.texto),
}));

import {
  apagarEpisodio, apagarTodosEpisodios, blocoDeEpisodios, definirAnonimo, Episodio, escolherEpisodios,
  importarEpisodios, interpretarEpisodio, listarEpisodios, podarEpisodios, quandoFoi, registrarEpisodio,
} from "../src/services/episodios";
import { fastRoute } from "../src/services/fastRoute";

const DIA = 86_400_000;
const agora = new Date(2026, 9, 8, 15, 0).getTime();
const ep = (resumo: string, diasAtras: number, extra: Partial<Episodio> = {}): Episodio =>
  ({ id: `e${diasAtras}-${resumo.length}`, em: agora - diasAtras * DIA, resumo, assuntos: [], pendencias: [], ...extra });

beforeEach(() => { apagarTodosEpisodios(); definirAnonimo(false); });

describe("memória de conversas (bloco 190)", () => {
  it("interpreta o JSON do modelo e descarta conversa sem assunto", () => {
    expect(interpretarEpisodio('{"resumo":"Conversaram sobre a prova de matemática de sexta.","assuntos":["prova de matemática",3],"pendencias":["estudar trigonometria"]}'))
      .toEqual({ resumo: "Conversaram sobre a prova de matemática de sexta.", assuntos: ["prova de matemática"], pendencias: ["estudar trigonometria"] });
    expect(interpretarEpisodio('{"resumo": ""}')).toBeNull();
    expect(interpretarEpisodio("não é json")).toBeNull();
  });

  it("poda o que passou de 90 dias e fica com os mais recentes", () => {
    const l = [ep("velho demais para lembrar", 100), ep("recente o bastante aqui", 3)];
    expect(podarEpisodios(l, agora).map(e => e.resumo)).toEqual(["recente o bastante aqui"]);
  });

  it("quando foi, em palavras", () => {
    expect(quandoFoi(agora - 1000, agora)).toBe("hoje");
    expect(quandoFoi(agora - DIA, agora)).toBe("ontem");
    expect(quandoFoi(agora - 3 * DIA, agora)).toBe("há 3 dias");
    expect(quandoFoi(agora - 20 * DIA, agora)).toBe("há 2 semanas");
    expect(quandoFoi(agora - 70 * DIA, agora)).toBe("há 2 meses");
  });

  it("escolhe pelo assunto, ignora o de hoje e exige palavras em comum", () => {
    const l = [
      ep("Conversaram sobre a prova de matemática e trigonometria.", 2, { pendencias: ["estudar trigonometria"] }),
      ep("Ele perguntou sobre placas de vídeo para jogos.", 5),
      ep("Hoje falaram da prova de matemática também.", 0),
    ];
    const escolhidos = escolherEpisodios(l, "como estudar para a prova de matemática?", agora);
    expect(escolhidos.map(e => e.resumo)).toEqual(["Conversaram sobre a prova de matemática e trigonometria."]);
    expect(escolherEpisodios(l, "abre o chrome", agora)).toEqual([]);
    const bloco = blocoDeEpisodios(escolhidos, agora);
    expect(bloco).toMatch(/CONVERSAS ANTERIORES/);
    expect(bloco).toMatch(/há 2 dias: .*\(ele ficou de: estudar trigonometria\)/);
    expect(blocoDeEpisodios([], agora)).toBe("");
  });

  it("grava o episódio da conversa, apaga e importa sem duplicar", async () => {
    respostaDoModelo.texto = '{"resumo":"Ele contou que tem prova de física na sexta.","assuntos":["prova de física"],"pendencias":["revisar ótica"]}';
    const turnos = [
      { role: "user" as const, content: "tenho prova de física na sexta e tô perdido em ótica" },
      { role: "assistant" as const, content: "Quer que eu monte um plano de revisão?" },
    ];
    const novo = await registrarEpisodio(turnos, "", agora);
    expect(novo?.pendencias).toEqual(["revisar ótica"]);
    expect(listarEpisodios()).toHaveLength(1);
    expect(importarEpisodios([novo, { ...novo, id: "outro" }, null, { resumo: 3 }])).toBe(0);
    expect(apagarEpisodio(novo!.id)).toBe(true);
    expect(listarEpisodios()).toHaveLength(0);
    expect(importarEpisodios([novo])).toBe(1);
  });

  it("conversa curta e modo anônimo não gravam nada", async () => {
    respostaDoModelo.texto = '{"resumo":"Qualquer coisa que o modelo inventar aqui."}';
    expect(await registrarEpisodio([{ role: "user", content: "pausa" }], "", agora)).toBeNull();
    definirAnonimo(true);
    expect(await registrarEpisodio([{ role: "user", content: "uma conversa longa o bastante sobre um assunto pessoal qualquer" }], "", agora)).toBeNull();
    expect(listarEpisodios()).toHaveLength(0);
  });

  it("'modo anônimo' por voz liga e desliga", () => {
    expect(fastRoute("modo anônimo")).toEqual([{ action: "anon_mode", ligar: true }]);
    expect(fastRoute("Ely, ativa o modo anônimo")).toEqual([{ action: "anon_mode", ligar: true }]);
    expect(fastRoute("sai do modo anônimo")).toEqual([{ action: "anon_mode", ligar: false }]);
    expect(fastRoute("o que é modo anônimo do chrome?")).toBeNull();
  });
});
