import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O store é o dublê em memória de `tests/setup.ts`; cada teste importa o módulo de novo
 * para começar com a lista vazia (`vi.resetModules`).
 */
async function carregar() {
  vi.resetModules();
  return await import("../src/services/rotinas");
}

// Sexta-feira, 18/09/2026, 14:00 local.
const SEXTA_14H = new Date(2026, 8, 18, 14, 0, 0, 0);

describe("rotinas — salvar e validar", () => {
  it("normaliza a hora, dedupe e ordena os dias, e usa PC quando nada é pedido", async () => {
    const r = await carregar();
    const rot = r.salvarRotina({ nome: " Bom dia ", texto: "clima", hora: "7:30", dias: [5, 1, 1, 9], entregar: [] });
    expect(rot.hora).toBe("07:30");
    expect(rot.dias).toEqual([1, 5]);
    expect(rot.entregar).toEqual(["pc"]);
    expect(rot.ativa).toBe(true);
    expect(rot.nome).toBe("Bom dia");
  });

  it("recusa hora inválida e texto vazio", async () => {
    const r = await carregar();
    expect(() => r.salvarRotina({ nome: "x", texto: "y", hora: "25:00" })).toThrow(/hora inválida/);
    expect(() => r.salvarRotina({ nome: "x", texto: "  ", hora: "08:00" })).toThrow(/sem texto/);
  });

  it("editar mantém id, criadaEm e o último resultado", async () => {
    const r = await carregar();
    const a = r.salvarRotina({ nome: "a", texto: "t", hora: "08:00" });
    const b = r.salvarRotina({ id: a.id, nome: "b", texto: "t2", hora: "09:00" });
    expect(b.id).toBe(a.id);
    expect(b.criadaEm).toBe(a.criadaEm);
    expect(r.listarRotinas()).toHaveLength(1);
    expect(r.listarRotinas()[0].nome).toBe("b");
  });

  it("alternar e apagar", async () => {
    const r = await carregar();
    const a = r.salvarRotina({ nome: "a", texto: "t", hora: "08:00" });
    expect(r.alternarRotina(a.id)?.ativa).toBe(false);
    expect(r.alternarRotina(a.id, true)?.ativa).toBe(true);
    expect(r.apagarRotina(a.id)).toBe(true);
    expect(r.apagarRotina(a.id)).toBe(false);
  });
});

describe("rotinas — próximo disparo", () => {
  it("hoje mais tarde, quando a hora ainda não passou", async () => {
    const r = await carregar();
    const rot = r.salvarRotina({ nome: "a", texto: "t", hora: "18:00" });
    const p = new Date(r.proximoDisparo(rot, SEXTA_14H)!);
    expect([p.getDate(), p.getHours()]).toEqual([18, 18]);
  });

  it("amanhã, quando a hora já passou e vale todo dia", async () => {
    const r = await carregar();
    const rot = r.salvarRotina({ nome: "a", texto: "t", hora: "07:30" });
    const p = new Date(r.proximoDisparo(rot, SEXTA_14H)!);
    expect([p.getDate(), p.getHours(), p.getMinutes()]).toEqual([19, 7, 30]);
  });

  it("pula o fim de semana em rotina de dias úteis", async () => {
    const r = await carregar();
    const rot = r.salvarRotina({ nome: "a", texto: "t", hora: "07:30", dias: [1, 2, 3, 4, 5] });
    const p = new Date(r.proximoDisparo(rot, SEXTA_14H)!);
    expect([p.getDate(), p.getDay()]).toEqual([21, 1]);   // segunda 21/09
  });

  it("pausada não tem próximo disparo", async () => {
    const r = await carregar();
    const rot = r.salvarRotina({ nome: "a", texto: "t", hora: "07:30", ativa: false });
    expect(r.proximoDisparo(rot, SEXTA_14H)).toBeNull();
  });
});

describe("entregas — fila para o celular", () => {
  it("pendentes, confirmar e histórico", async () => {
    const r = await carregar();
    const e1 = r.enfileirarEntrega({ tipo: "rotina", titulo: "A", corpo: "1" });
    const e2 = r.enfileirarEntrega({ tipo: "lembrete", titulo: "B", corpo: "2" });
    expect(r.entregasPendentes().map(e => e.id)).toEqual([e1.id, e2.id]);
    expect(r.confirmarEntregas([e1.id, "inexistente"])).toBe(1);
    expect(r.entregasPendentes().map(e => e.id)).toEqual([e2.id]);
    expect(r.historicoEntregas()[0].id).toBe(e2.id);   // mais recente primeiro
    expect(r.confirmarEntregas([e1.id])).toBe(0);        // já confirmada
  });

  it("a poda nunca joga fora o que não foi entregue", async () => {
    const r = await carregar();
    for (let i = 0; i < 70; i++) r.enfileirarEntrega({ tipo: "aviso", titulo: String(i), corpo: "" });
    expect(r.entregasPendentes()).toHaveLength(70);
    const ids = r.entregasPendentes().slice(0, 30).map(e => e.id);
    r.confirmarEntregas(ids);
    r.enfileirarEntrega({ tipo: "aviso", titulo: "nova", corpo: "" });
    // 71 no total; teto 60 → poda 11, todas entre as entregues.
    expect(r.historicoEntregas()).toHaveLength(60);
    expect(r.entregasPendentes()).toHaveLength(41);
  });
});

describe("rotinas — executar", () => {
  it("registra a última execução e entrega; falha vira texto, não exceção", async () => {
    const r = await carregar();
    const rot = r.salvarRotina({ nome: "a", texto: "t", hora: "08:00" });
    const entregas: string[] = [];
    r.iniciarRotinas(async () => "  resposta  ", (_, res) => entregas.push(res));
    expect(await r.executarRotina(rot.id)).toBe("resposta");
    expect(entregas).toEqual(["resposta"]);
    expect(r.listarRotinas()[0].ultimoResultado).toBe("resposta");
    r.pararRotinas();

    r.iniciarRotinas(async () => { throw new Error("boom"); }, () => {});
    expect(await r.executarRotina(rot.id)).toMatch(/Não consegui: boom/);
    r.pararRotinas();
  });
});

beforeEach(() => { vi.useRealTimers(); });
