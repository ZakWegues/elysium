import { describe, expect, it } from "vitest";
import { aplicarDespejo, descreverDespejo, interpretarDespejo, validarItens } from "../src/services/despejo";
import { fastRoute } from "../src/services/fastRoute";
import { listarTarefas } from "../src/services/tarefas";
import { obterLista } from "../src/services/listas";

// Quinta-feira, 8 de outubro de 2026, 10h.
const agora = new Date(2026, 9, 8, 10, 0);

describe("despejo (bloco 194)", () => {
  it("separa tarefas, listas e notas; a data sai do texto, não do modelo", () => {
    const bruto = JSON.stringify({ itens: [
      { tipo: "tarefa", texto: "estudar física sexta às 14h" },
      { tipo: "tarefa", texto: "ligar pra vó" },
      { tipo: "lista", lista: "mercado", texto: "leite" },
      { tipo: "lista", lista: "mercado", texto: "leite" },
      { tipo: "nota", texto: "ideia de vídeo sobre SSD" },
      { tipo: "outra coisa", texto: "lixo" },
      { tipo: "tarefa", texto: "" },
    ] });
    const itens = interpretarDespejo(bruto, agora);
    expect(itens.map(i => i.tipo)).toEqual(["tarefa", "tarefa", "lista", "nota"]);
    expect(itens[0].texto).toBe("Estudar física");
    expect(itens[0].quando).toBe("2026-10-09T14:00");
    expect(itens[1].quando).toBeNull();
    expect(itens[2].lista).toBe("Compras");
    expect(descreverDespejo(itens)).toMatch(/^2 tarefas \(Estudar física, .+; ligar pra vó\), 1 item em Compras e 1 nota$/);
    expect(interpretarDespejo("sem json", agora)).toEqual([]);
  });

  it("valida o que vem do cliente antes de gravar", () => {
    const v = validarItens([
      { id: "a", tipo: "tarefa", texto: "estudar", quando: "2026-13-99" },
      { id: "b", tipo: "lista", texto: "pão", lista: "lista do mercado" },
      { tipo: "virus", texto: "x" },
      { tipo: "nota", texto: "x".repeat(500) },
    ]);
    expect(v).toHaveLength(3);
    expect(v[0].quando).toBeUndefined();
    expect(v[1].lista).toBe("Compras");
    expect(v[2].texto.length).toBe(200);
    expect(validarItens("nada")).toEqual([]);
  });

  it("grava tarefas e itens de lista", () => {
    const r = aplicarDespejo([
      { id: "1", tipo: "tarefa", texto: "Ligar pra vó" },
      { id: "2", tipo: "lista", texto: "Pão de queijo", lista: "Compras" },
      { id: "3", tipo: "nota", texto: "Ideia: vídeo sobre SSD" },
    ]);
    expect(r.criados).toBe(3);
    expect(listarTarefas().some(t => t.texto === "Ligar pra vó")).toBe(true);
    expect(obterLista("Compras")?.itens.some(i => i.texto === "Pão de queijo")).toBe(true);
    expect(obterLista("Notas")?.itens.some(i => i.texto === "Ideia: vídeo sobre SSD")).toBe(true);
  });

  it("'anota tudo isso: …' vai inteiro para a separação, antes da regra de nota", () => {
    expect(fastRoute("Anota tudo isso: comprar pão, estudar física sexta e ligar pra vó")).toEqual([
      { action: "brain_dump", texto: "comprar pão, estudar física sexta e ligar pra vó" },
    ]);
    // "anota que…" continua sendo UMA nota.
    expect(fastRoute("anota que a senha do wifi está na geladeira")?.[0].action).toBe("list_add");
  });
});

describe("despejo não sequestra pedido normal (revisão da fase 19)", () => {
  it("só gatilho explícito com cara de lista", () => {
    for (const t of ["organiza pra mim as janelas lado a lado", "organiza isso por ordem alfabética", "anota tudo que eu falar na reunião de hoje", "despejo do lixo é amanhã às 8 da manhã", "anota tudo isso"]) {
      expect(fastRoute(t)?.[0]?.action).not.toBe("brain_dump");
    }
    expect(fastRoute("despejo: pão, leite e café")?.[0]).toEqual({ action: "brain_dump", texto: "pão, leite e café" });
  });
});
