import { describe, expect, it } from "vitest";
import { limparProntas, opcoesDaResposta } from "../src/services/respostasRapidas";

const r = (t: string) => opcoesDaResposta(t);

/** Resposta com conteúdo (mais de 120 caracteres), sem pergunta no fim. */
const LONGA = "A fotossíntese transforma luz em energia química: a planta usa água e gás carbônico e libera oxigênio. Acontece nos cloroplastos, com a clorofila.";

describe("respostas rápidas (22/10)", () => {
  it("pergunta de sim/não → Sim e Não", () => {
    for (const t of [
      "Quer que eu abra o arquivo?",
      "Posso apagar os temporários?",
      "Achei o PDF. Mando para o celular?",
      "Vou desligar o PC em 30 segundos. Confirma? Diga sim.",
      "Quer que eu monte isso como tela?",
      "Devo continuar?\"",
      "Ficou claro ou quer que eu explique de novo?",
    ]) {
      const x = r(t);
      expect(x.pergunta, t).toBe(true);
      if (t.includes(" ou ")) continue;
      expect([x.sim, x.nao], t).toEqual([true, true]);
      expect(x.opcoes, t).toEqual([]);
    }
  });

  it("\"A ou B?\" → as alternativas, sem Sim/Não", () => {
    expect(r("Prefere café ou chá?").opcoes).toEqual(["Café", "Chá"]);
    expect(r("Hoje ou amanhã?").opcoes).toEqual(["Hoje", "Amanhã"]);
    expect(r("Você prefere ir de carro, de ônibus ou de bicicleta?").opcoes).toEqual(["De carro", "De ônibus", "De bicicleta"]);
    expect(r("Qual você prefere, praia ou montanha?").opcoes).toEqual(["Praia", "Montanha"]);
    expect(r("Tenho duas ideias: Spotify ou YouTube?").opcoes).toEqual(["Spotify", "YouTube"]);
    const x = r("Prefere café ou chá?");
    expect([x.sim, x.nao]).toEqual([false, false]);
  });

  it("\"ou não?\" / \"ou outra coisa?\" não viram opção", () => {
    const x = r("Quer que eu salve ou não?");
    expect(x.opcoes).toEqual([]);
    expect(x.sim).toBe(true);
    expect(r("Quer ver o clima ou outra coisa?").opcoes).toEqual([]);
  });

  it("lista antes da pergunta de escolha → os itens (máx. 4, curtos)", () => {
    const t = "Achei três roteiros:\n1. **Praia** — sol e mar\n2. **Serra**: frio e vinho\n3. Cidade histórica\n\nQual prefere?";
    expect(r(t).opcoes).toEqual(["Praia", "Serra", "Cidade histórica"]);
    const longa = "Opções:\n- A\n- B\n- C\n- D\n- E\nQual delas?";
    expect(r(longa).opcoes).toEqual(["A", "B", "C", "D"]);
  });

  it("lista sem pergunta de escolha não vira opção", () => {
    expect(r("Fiz assim:\n1. Abri\n2. Salvei\nQuer que eu feche?").opcoes).toEqual([]);
  });

  it("pergunta aberta → sem Sim/Não, só a linha", () => {
    for (const t of ["Achei duas pastas. Qual delas?", "Para onde você vai?", "Como você quer chamar o arquivo?", "Quanto quer gastar?"]) {
      const x = r(t);
      expect(x.pergunta, t).toBe(true);
      expect([x.sim, x.nao], t).toEqual([false, false]);
    }
  });

  it("sem pergunta no fim → nada (retórica no meio não conta)", () => {
    for (const t of ["Pronto.", "Sabe o que é engraçado? Ninguém percebeu.", "Achei o arquivo 'por que?' na pasta.", ""]) {
      const x = r(t);
      expect(x.pergunta, t).toBe(false);
      expect(x.opcoes.length + Number(x.sim) + Number(x.nao), t).toBe(0);
    }
  });

  it("opção longa demais derruba a extração", () => {
    expect(r("Quer que eu procure o arquivo inteiro na pasta de documentos antigos ou deixa?").opcoes).toEqual([]);
  });

  it("prontas: saneadas, sem repetir, no máx. 6; sem pergunta, só em resposta com conteúdo (31/10)", () => {
    expect(limparProntas(["  pode   fazer ", "Pode fazer", 3, "", "a", "b", "c", "d", "e", "f"])).toEqual(["pode fazer", "a", "b", "c", "d", "e"]);
    expect(limparProntas("x")).toEqual([]);
    expect(opcoesDaResposta("Pronto.", ["agora não"]).prontas).toEqual([]);
    expect(opcoesDaResposta(LONGA, ["agora não"]).prontas).toEqual(["agora não"]);
  });
});

describe("respostas rápidas no frame reply (22/10)", async () => {
  const { rapidasPara } = await import("../src/services/respostasRapidas");
  const { abrirPedido, retomar, terminar, zerarPedidos } = await import("../src/services/retomada");

  it("segue o ajuste: desligado não manda nada; sem pergunta só as prontas (e só com conteúdo)", () => {
    expect(rapidasPara("Quer que eu abra?", { respostasRapidas: false })).toBeNull();
    expect(rapidasPara("Pronto.", { respostasProntas: [] })).toBeNull();
    expect(rapidasPara("Pronto.", {})).toBeNull();
    expect(rapidasPara(LONGA, {})?.prontas).toEqual(["pode fazer", "agora não", "explica melhor", "manda no celular"]);
    expect(rapidasPara("Quer que eu abra?", { respostasProntas: ["x"] })).toMatchObject({ pergunta: true, sim: true, nao: true, prontas: ["x"] });
  });

  it("o campo rapidas atravessa a retomada junto com o reply", () => {
    zerarPedidos();
    const a: string[] = [];
    const p = abrirPedido("pedido-rap-01", "abre?", (t) => a.push(t))!;
    const rapidas = rapidasPara("Abro o arquivo?", {})!;
    terminar(p, { type: "reply", reply: "Abro o arquivo?", rapidas });
    const b: string[] = [];
    retomar("pedido-rap-01", (t) => b.push(t));
    const final = [...a, ...b].map(x => JSON.parse(x)).filter(x => x.type === "reply");
    expect(final.length).toBeGreaterThan(0);
    for (const f of final) expect(f.rapidas).toMatchObject({ pergunta: true, sim: true });
  });
});
