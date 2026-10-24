import { beforeEach, describe, expect, it } from "vitest";
import { abrirPedido, enviarUi, retomar, soltarDestino, terminar, zerarPedidos } from "../src/services/retomada";
import { atalhoDeTela, cancelarTelaDoCelular, depoisDaResposta, gerarParaCelular, zerarTelasDoCelular, type FrameUi } from "../src/services/telasDoCelular";
import { OFERTA, type Gerador } from "../src/services/telaInteligente";

const BOM = 'root = Card([Title("Parcela", "md"), Text("R$ 100")])';
const gerador = (resposta: string | null): Gerador => async () => ({
  enviar: async () => (resposta === null ? null : { texto: resposta, provedor: "teste", modelo: "m1" }),
  fechar: () => {},
});

describe("telas no celular: quando sai (22/10)", () => {
  beforeEach(() => zerarTelasDoCelular());

  it("perguntar: a oferta vai no fim do texto e o 'sim' monta a tela da resposta anterior", () => {
    const d = depoisDaResposta("planeja meu sábado em São Paulo", "Manhã na Pinacoteca…", true, "perguntar", true);
    expect(d.reply.endsWith(OFERTA)).toBe(true);
    expect(d.gerar).toBe(false);
    expect(atalhoDeTela("sim", false, "perguntar", true)).toEqual({ pergunta: "planeja meu sábado em São Paulo", resposta: "Manhã na Pinacoteca…", daOferta: true });
    // A oferta é de uma vez só.
    expect(atalhoDeTela("sim", false, "perguntar", true)).toBeNull();
  });

  it("outra mensagem descarta a oferta; oferta velha (15 min) não vale", () => {
    depoisDaResposta("planeja meu sábado", "Manhã…", true, "perguntar", true, 0);
    expect(atalhoDeTela("e no domingo?", false, "perguntar", true, 1000)).toBeNull();
    expect(atalhoDeTela("sim", false, "perguntar", true, 2000)).toBeNull();
    depoisDaResposta("planeja meu sábado", "Manhã…", true, "perguntar", true, 0);
    expect(atalhoDeTela("sim", false, "perguntar", true, 16 * 60_000)).toBeNull();
  });

  it("pedido explícito vai direto; 'disso' usa a última resposta; nunca/sem gerador, nada", () => {
    depoisDaResposta("quanto fica 30 mil em 36x?", "Parcela de R$ 1.084", true, "pedir", true);
    expect(atalhoDeTela("monta uma tela disso", false, "pedir", true)?.resposta).toBe("Parcela de R$ 1.084");
    expect(atalhoDeTela("faz uma calculadora de juros", false, "pedir", true)?.resposta).toBe("");
    expect(atalhoDeTela("faz uma calculadora de juros", false, "nunca", true)).toBeNull();
    expect(atalhoDeTela("faz uma calculadora de juros", false, "pedir", false)).toBeNull();
    expect(atalhoDeTela("faz uma calculadora de juros", true, "pedir", true)).toBeNull();
  });

  it("priorizar gera; ação no PC ou resposta que pergunta, não oferece", () => {
    expect(depoisDaResposta("planeja meu sábado", "Manhã…", true, "priorizar", true)).toEqual({ reply: "Manhã…", gerar: true });
    expect(depoisDaResposta("planeja meu sábado", "Manhã…", false, "perguntar", true).reply).toBe("Manhã…");
    expect(depoisDaResposta("planeja meu sábado", "Prefere museu ou parque?", true, "perguntar", true).reply).toBe("Prefere museu ou parque?");
  });
});

describe("telas no celular: frames ui (22/10)", () => {
  beforeEach(() => zerarPedidos());

  it("gerando → programa, com o texto novo da bolha", async () => {
    const frames: FrameUi[] = [];
    expect(await gerarParaCelular("mostra isso numa tela", "", gerador(BOM), (f) => frames.push(f), { pronto: "Pronto." })).toBe(true);
    expect(frames).toEqual([{ estado: "gerando" }, { programa: BOM, texto: "Pronto." }]);
  });

  it("sem gerador ou programa ruim: falhou", async () => {
    const a: FrameUi[] = [], b: FrameUi[] = [];
    expect(await gerarParaCelular("x", "", null, (f) => a.push(f), { falhou: "Não deu." })).toBe(false);
    // Pergunta e resposta vão junto: o "Tentar de novo" do celular pede de novo com elas.
    expect(a).toEqual([{ falhou: true, pergunta: "x", resposta: "", texto: "Não deu." }]);
    await gerarParaCelular("x", "", gerador("oi, tudo bem?"), (f) => b.push(f));
    expect(b.at(-1)).toEqual({ falhou: true, pergunta: "x", resposta: "" });
  });

  it("Cancelar (ui.cancelar) aborta pelo id: falhou + cancelada, sem 'tentar de novo'", async () => {
    let soltar: (v: null) => void = () => {};
    const lento: Gerador = async () => ({ enviar: () => new Promise((r) => { soltar = r; }), fechar: () => {} });
    const frames: FrameUi[] = [];
    const indo = gerarParaCelular("faz um quiz", "", lento, (f) => frames.push(f), { pronto: "Pronto." }, "pedido-cancela-1");
    await new Promise((r) => setTimeout(r, 10));
    expect(cancelarTelaDoCelular("pedido-cancela-1")).toBe(true);
    expect(await indo).toBe(false);
    soltar(null);
    expect(frames.at(-1)).toEqual({ falhou: true, cancelada: true, texto: "Tela cancelada." });
    expect(cancelarTelaDoCelular("pedido-cancela-1")).toBe(false);
  });

  it("a conexão cai enquanto gera: retomar entrega reply, a tela guardada e as próximas", () => {
    const a: string[] = [];
    const p = abrirPedido("pedido-ui-01", "faz uma calculadora", (t) => a.push(t))!;
    terminar(p, { type: "reply", reply: "Montando a tela…" });
    enviarUi(p, { estado: "gerando" });
    soltarDestino(p.destino!);
    enviarUi(p, { programa: BOM });
    const b: string[] = [];
    expect(retomar("pedido-ui-01", (t) => b.push(t))).toBe(true);
    const tipos = b.map((t) => JSON.parse(t));
    expect(tipos.map((x) => x.type)).toEqual(["retomada", "reply", "ui"]);
    expect(tipos[2]).toEqual({ type: "ui", id: "pedido-ui-01", programa: BOM });
    // Ainda gerando quando reconectou: o frame seguinte vai para a conexão nova.
    const p2 = abrirPedido("pedido-ui-02", "x", () => {})!;
    terminar(p2, { type: "reply", reply: "Montando a tela…" });
    enviarUi(p2, { estado: "gerando" });
    const c: string[] = [];
    retomar("pedido-ui-02", (t) => c.push(t));
    enviarUi(p2, { programa: BOM });
    expect(JSON.parse(c.at(-1)!).programa).toBe(BOM);
  });
});
