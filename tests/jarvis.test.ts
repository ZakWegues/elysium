import { describe, expect, it, vi } from "vitest";
vi.mock("../src/services/webSearch", () => ({ searchWeb: async () => "" }));
import { candidatas, escolher, GOSTO_MINIMO, novoGosto, opiniaoSobreIniciativa, type EstadoDaIniciativa, type Fatos } from "../src/services/iniciativa";
import { pedeSegundoPlano, perguntaDoFundo } from "../src/services/segundoPlano";
import { comandoDeVigia, lerVeredito, pedeVigia } from "../src/services/vigias";
import { pendenciaConcreta } from "../src/services/acompanhamento";
import { janelaCombina } from "../src/services/ferramentas";

const as = (h: number, m = 0) => new Date(2026, 10, 25, h, m);
const fatos = (agora: Date, x: Partial<Fatos> = {}): Fatos => ({ agora, eventos: [], tarefas: [], acompanhamentos: [], mensagens: [], novidades: [], chuvaEm: null, ultimaConversa: agora.getTime(), ...x });
const vazio = (): EstadoDaIniciativa => ({ ditas: [], gosto: {} });
const livre = (agora: Date, porDia = 4) => ({ agora, porDia, ocupado: false });

describe("a Ely puxa conversa (25/11)", () => {
  it("compromisso perto vem primeiro, e não espera o intervalo", () => {
    const agora = as(14);
    const f = fatos(agora, { eventos: [{ titulo: "Dentista.", inicio: as(14, 40).getTime() }, { titulo: "Longe", inicio: as(18).getTime() }], novidades: [{ tema: "IA", topicos: ["Saiu algo"] }] });
    const e = vazio(); e.ditas.push({ id: "x", tipo: "clima", em: as(13, 50).getTime() });
    const i = escolher(candidatas(f), e, livre(agora))!;
    expect(i.tipo).toBe("compromisso");
    expect(i.texto).toContain("40 minutos você tem Dentista");
    expect(i.passo?.pedido).toBe("me lembra de Dentista em 30 minutos");
  });
  it("cala em jogo, foco, de noite, sem espaço no dia e dentro do intervalo", () => {
    const n = { novidades: [{ tema: "IA", topicos: ["Saiu algo"] }] };
    expect(escolher(candidatas(fatos(as(14), n)), vazio(), livre(as(14)))?.tipo).toBe("novidade");
    expect(escolher(candidatas(fatos(as(14), n)), vazio(), { ...livre(as(14)), ocupado: true })).toBe(null);
    expect(escolher(candidatas(fatos(as(23), n)), vazio(), livre(as(23)))).toBe(null);
    expect(escolher(candidatas(fatos(as(7), n)), vazio(), livre(as(7)))).toBe(null);
    expect(escolher(candidatas(fatos(as(14), n)), vazio(), livre(as(14), 0))).toBe(null);
    const cheio = vazio(); for (let k = 0; k < 4; k++) cheio.ditas.push({ id: `d${k}`, tipo: "clima", em: as(8 + k).getTime() });
    expect(escolher(candidatas(fatos(as(16), n)), cheio, livre(as(16)))).toBe(null);
    const ha = vazio(); ha.ditas.push({ id: "a", tipo: "clima", em: as(13).getTime() });
    expect(escolher(candidatas(fatos(as(14), n)), ha, livre(as(14)))).toBe(null);
  });
  it("nunca repete, e o tipo que ele dispensa some", () => {
    const f = fatos(as(14), { novidades: [{ tema: "IA", topicos: ["Saiu algo"] }] });
    const i = escolher(candidatas(f), vazio(), livre(as(14)))!;
    const e = vazio(); e.ditas.push({ id: i.id, tipo: i.tipo, em: as(9).getTime() - 86_400_000 });
    expect(escolher(candidatas(f), e, livre(as(14)))).toBe(null);
    let g = 1; g = novoGosto(g, false); g = novoGosto(g, false);
    expect(g).toBeLessThan(GOSTO_MINIMO);
    expect(escolher(candidatas(f), { ditas: [], gosto: { novidade: g } }, livre(as(14)))).toBe(null);
    expect(novoGosto(undefined, true)).toBeCloseTo(1.15);
  });
  it("num dia cheio de assunto fala poucas vezes", () => {
    const e = vazio(); let falas = 0;
    for (let m = 0; m < 24 * 60; m += 10) {
      const agora = new Date(2026, 10, 25, 0, m);
      const f = fatos(agora, { ultimaConversa: as(0).getTime(), acompanhamentos: [{ id: "e:1", pergunta: "E aí?" }], tarefas: [{ id: "1", texto: "X", prazo: as(22).getTime(), feita: false }], mensagens: [{ quem: "Ana", app: "WhatsApp", em: as(10).getTime() }], novidades: [{ tema: "IA", topicos: ["A"] }, { tema: "Jogos", topicos: ["B"] }], chuvaEm: { hora: 16, texto: "chuva" } });
      const i = escolher(candidatas(f), e, livre(agora));
      if (i) { falas++; e.ditas.push({ id: i.id, tipo: i.tipo, em: agora.getTime() }); expect(agora.getHours()).toBeGreaterThanOrEqual(8); }
    }
    expect(falas).toBe(4);
  });
  it("só pergunta de pendência de verdade", () => {
    expect(pendenciaConcreta("pedir ajuda caso surjam dúvidas")).toBe(false);
    expect(pendenciaConcreta("estudar ótica")).toBe(true);
  });
  it("a opinião dele", () => {
    expect(opiniaoSobreIniciativa("Não quero esse aviso")).toBe("nao");
    expect(opiniaoSobreIniciativa("para de me avisar disso")).toBe("nao");
    expect(opiniaoSobreIniciativa("gostei de você ter avisado")).toBe("gostou");
    expect(opiniaoSobreIniciativa("não quero sair hoje")).toBe(null);
  });
});

describe("vigias e segundo plano (25/11)", () => {
  it("lê o pedido de vigia, e só o que é do mundo", () => {
    expect(pedeVigia("me avisa quando sair o trailer 3 do GTA 6")).toEqual({ tipo: "web", alvo: "sair o trailer 3 do GTA 6" });
    expect(pedeVigia("me avisa quando o CI do elysium passar")).toEqual({ tipo: "ci", alvo: "elysium" });
    for (const t of ["me avisa quando o download acabar", "me avisa quando a CPU passar de 90", "me avisa quando eu chegar", "me avisa às 8"]) expect(pedeVigia(t), t).toBe(null);
    expect(lerVeredito("SIM — a Rockstar publicou o trailer em 20 de novembro.")).toContain("Rockstar");
    expect(lerVeredito("NÃO, ainda não saiu.")).toBe(null);
    expect(lerVeredito("Sim, mas ainda não há confirmação oficial.")).toBe(null);
    expect(comandoDeVigia("o que você está vigiando?")).toBe("Não estou vigiando nada.");
    expect(comandoDeVigia("toca uma música")).toBe(null);
  });
  it("segundo plano", () => {
    expect(pedeSegundoPlano("pesquisa os melhores teclados até 300 reais em segundo plano")).toBe("pesquisa os melhores teclados até 300 reais");
    expect(pedeSegundoPlano("organiza minha lista de tarefas e me avisa quando terminar")).toBe("organiza minha lista de tarefas");
    expect(pedeSegundoPlano("toca música")).toBe(null);
    expect(perguntaDoFundo("o que você está fazendo em segundo plano?")).toBe(true);
  });
  it("confere se a janela abriu", () => {
    expect(janelaCombina("bloco de notas", [{ name: "notepad", title: "Sem título - Bloco de Notas" }])).toBe(true);
    expect(janelaCombina("VS Code", [{ name: "Code", title: "x - Visual Studio Code" }])).toBe(true);
    expect(janelaCombina("spotify", [{ name: "chrome", title: "Google" }])).toBe(false);
  });
});
