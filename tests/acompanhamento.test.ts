import { describe, expect, it } from "vitest";
import { acompanhamentos, comArtigo } from "../src/services/acompanhamento";
import type { Tarefa } from "../src/services/tarefas";
import type { Episodio } from "../src/services/episodios";

const H = 3_600_000;
const agora = new Date(2026, 9, 10, 10, 0).getTime();
const tarefa = (texto: string, prazo: number, extra: Partial<Tarefa> = {}): Tarefa =>
  ({ id: texto.length + "-" + prazo, texto, prazo, feita: false, criadaEm: 0, origem: "lembrete", ...extra });
const ep = (pendencias: string[], horasAtras: number, extra: Partial<Episodio> = {}): Episodio =>
  ({ id: `e${horasAtras}`, em: agora - horasAtras * H, resumo: "Conversaram sobre a semana.", assuntos: [], pendencias, ...extra });

describe("'como foi?' (bloco 191)", () => {
  it("compromisso que passou vira pergunta; o que não é compromisso não", () => {
    const l = acompanhamentos([
      tarefa("Prova de matemática sexta 14h", agora - 20 * H),
      tarefa("Comprar pão", agora - 2 * H),
      tarefa("Ligar pro dentista", agora - 5 * H),
      tarefa("Consulta no dentista", agora + 5 * H),
    ], [], new Set(), agora);
    expect(l.map(a => a.pergunta)).toEqual(["E aí, como foi a prova de matemática?"]);
  });

  it("passou de 3 dias ou já perguntado: não pergunta", () => {
    const velha = tarefa("Entrevista de estágio", agora - 4 * 24 * H);
    const recente = tarefa("Entrevista de emprego", agora - 3 * H);
    expect(acompanhamentos([velha, recente], [], new Set([`t:${recente.id}`]), agora)).toEqual([]);
  });

  it("compromisso sem hora só conta depois que o dia acaba", () => {
    const hojeCedo = new Date(2026, 9, 10, 8, 0).getTime();
    expect(acompanhamentos([tarefa("Prova de física", hojeCedo, { semHora: true })], [], new Set(), agora)).toEqual([]);
  });

  it("pendência de conversa de 1 a 7 dias atrás", () => {
    const l = acompanhamentos([], [ep(["Estudar ótica para a prova"], 30), ep(["algo de hoje"], 2), ep(["algo velho"], 9 * 24), ep(["já perguntado"], 40, { perguntado: true })], new Set(), agora);
    expect(l.map(a => a.pergunta)).toEqual(["Da última vez você ficou de estudar ótica para a prova. Conseguiu?"]);
  });

  it("artigo certo", () => {
    expect(comArtigo("Prova de cálculo")).toBe("a prova de cálculo");
    expect(comArtigo("exame de sangue")).toBe("o exame de sangue");
    expect(comArtigo("minha apresentação")).toBe("minha apresentação");
    expect(comArtigo("Coisa estranha")).toBe("“Coisa estranha”");
  });
});
