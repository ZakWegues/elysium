import { beforeEach, describe, expect, it } from "vitest";
import { registrarAtividade, todaAtividade, zerarAtividade } from "../src/services/atividade";
import { aceitarPadrao, acharPadroes, contarOferta, padroesParaOferecer, textoDaOferta, zerarPadroes } from "../src/services/padroes";
import { apagarRotina, listarRotinas } from "../src/services/rotinas";
import { deOntem, janelaDoResumo, montarResumo } from "../src/services/resumoDoDia";
import { fatosUsados, type MemoryFact } from "../src/services/memoryStore";

// 31/10 (Onda 2): rotinas aprendidas, o "ontem" do resumo da manhã e a memória usada.

const em = (dia: number, h: number, m: number) => new Date(2026, 9, dia, h, m).getTime();

beforeEach(() => {
  zerarAtividade();
  zerarPadroes();
  for (const r of listarRotinas()) apagarRotina(r.id);
});

describe("rotinas aprendidas", () => {
  it("o mesmo pedido em 3 dias perto da mesma hora vira padrão, com a hora média", () => {
    registrarAtividade("Abri o app: Spotify", em(27, 21, 50), "abre o Spotify");
    registrarAtividade("Abri o app: Spotify", em(28, 22, 10), "Abre o Spotify!");
    registrarAtividade("Abri o app: Spotify", em(29, 22, 0), "abre o spotify");
    // Mesmo dia de novo não conta como outro dia; sem pedido não entra.
    registrarAtividade("Abri o app: Spotify", em(29, 23, 0), "abre o spotify");
    registrarAtividade("Volume: 30%", em(29, 22, 0));
    const [p] = acharPadroes(todaAtividade());
    expect(p).toMatchObject({ chave: "abre o spotify", hora: "22:00", dias: 3 });
    expect(textoDaOferta(p)).toBe("Você costuma pedir “abre o Spotify” por volta das 22h. Criar rotina?");
  });

  it("horas espalhadas ou só 2 dias não são padrão", () => {
    registrarAtividade("x", em(27, 8, 0), "abre o chrome");
    registrarAtividade("x", em(28, 14, 0), "abre o chrome");
    registrarAtividade("x", em(29, 21, 0), "abre o chrome");
    registrarAtividade("x", em(27, 9, 0), "modo foco");
    registrarAtividade("x", em(28, 9, 0), "modo foco");
    expect(acharPadroes(todaAtividade())).toEqual([]);
  });

  it("aceitar cria a rotina diária e o padrão some; 5 ofertas ignoradas silenciam", () => {
    for (const d of [27, 28, 29]) registrarAtividade("x", em(d, 7, 30), "toca lofi");
    for (const d of [27, 28, 29]) registrarAtividade("x", em(d, 12, 0), "abre o whatsapp");
    expect(padroesParaOferecer().map(p => p.chave).sort()).toEqual(["abre o whatsapp", "toca lofi"]);
    const r = aceitarPadrao("toca lofi");
    expect(r).toMatchObject({ texto: "toca lofi", hora: "07:30", dias: [] });
    for (let i = 0; i < 5; i++) contarOferta("abre o whatsapp");
    expect(padroesParaOferecer()).toEqual([]);
  });
});

describe("resumo da manhã: ontem e janela", () => {
  it("conta o que a Ely fez ontem, sem o 'Desfez' e sem repetir exemplo", () => {
    registrarAtividade("Abri o app: Spotify", em(30, 9, 0));
    registrarAtividade("Abri o app: Spotify", em(30, 10, 0));
    registrarAtividade("Volume: 30%", em(30, 11, 0));
    registrarAtividade("Desfez: Volume em 30%", em(30, 11, 1));
    registrarAtividade("Lembrete criado: regar", em(31, 8, 0));
    const o = deOntem(new Date(2026, 9, 31, 9, 0));
    expect(o).toEqual({ total: 3, exemplos: ["Abri o app: Spotify", "Volume: 30%"] });
    const t = montarResumo({ agora: new Date(2026, 9, 31, 9, 0), nome: "", clima: null, lembretes: [], rotinas: [], recadosNovos: 0, alertas: [], versaoNova: null, ontem: o });
    expect(t).toContain("Ontem eu fiz 3 coisas por você — Abri o app: Spotify; Volume: 30%; e mais.");
  });

  it("janela configurável, com volta ao padrão quando o valor é estranho", () => {
    expect(janelaDoResumo("7-12")).toEqual([7, 12]);
    expect(janelaDoResumo(undefined)).toEqual([6, 11]);
    expect(janelaDoResumo("11-6")).toEqual([6, 11]);
    expect(janelaDoResumo("lixo")).toEqual([6, 11]);
  });
});

describe("memória usada na resposta", () => {
  const fato = (id: string, text: string): MemoryFact => ({ id, text, createdAt: 0 } as MemoryFact);
  const fatos = [fato("1", "O cachorro do usuário se chama Bolota"), fato("2", "O usuário prefere café sem açúcar"), fato("3", "Mora em Curitiba")];

  it("só o fato que a resposta de fato usou", () => {
    const usados = fatosUsados("que nome eu dei pro meu cachorro?", "O seu cachorro se chama Bolota.", fatos);
    expect(usados.map(f => f.id)).toEqual(["1"]);
  });

  it("resposta que não toca na memória: nada", () => {
    expect(fatosUsados("abre o chrome", "Abri o Chrome.", fatos)).toEqual([]);
  });
});
