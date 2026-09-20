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

/**
 * Bloco 79 — gatilho por evento e condição. O barramento (`eventos.ts`) é importado no
 * MESMO ciclo de `resetModules` que o `rotinas.ts`, senão o listener fica preso a outra
 * instância do EventEmitter e nada dispara.
 */
async function carregarComEventos() {
  vi.resetModules();
  const r = await import("../src/services/rotinas");
  const ev = await import("../src/services/eventos");
  return { r, ev };
}
// O listener é `async` e disparado sem await: dá alguns tiques para ele terminar.
const esperar = () => new Promise(res => setTimeout(res, 20));

describe("rotinas — gatilho por evento", () => {
  it("valida o gatilho: evento desconhecido recusa, números são limitados, hora vira 00:00", async () => {
    const { r } = await carregarComEventos();
    expect(() => r.salvarRotina({ nome: "x", texto: "y", hora: "", gatilho: { tipo: "evento", evento: "nada" as never } })).toThrow(/evento desconhecido/);
    const rot = r.salvarRotina({ nome: "x", texto: "y", hora: "", gatilho: { tipo: "evento", evento: "pc.ocioso", minutos: 9999, limite: 3, cada: -5 } });
    expect(rot.hora).toBe("00:00");
    expect(rot.gatilho).toEqual({ tipo: "evento", evento: "pc.ocioso", app: undefined, minutos: 720, limite: 50, cada: 0 });
    expect(r.proximoDisparo(rot, SEXTA_14H)).toBeNull();
    expect(r.descreverGatilho(rot)).toBe("quando o PC ficar ocioso por 720 min");
    const porHora = r.salvarRotina({ nome: "h", texto: "y", hora: "7:00", gatilho: { tipo: "hora" } });
    expect(porHora.gatilho).toBeUndefined();
    expect(r.descreverGatilho(porHora)).toBe("às 07:00");
  });

  it("dispara no evento certo, filtra por app (nome ou título) e respeita o `cada`", async () => {
    const { r, ev } = await carregarComEventos();
    const rodou: string[] = [];
    r.iniciarRotinas(async rot => { rodou.push(rot.nome); return "ok"; }, () => {});
    r.salvarRotina({ nome: "chrome", texto: "t", hora: "", gatilho: { tipo: "evento", evento: "app.abriu", app: "Chrome", cada: 60 } });
    r.salvarRotina({ nome: "qualquer", texto: "t", hora: "", gatilho: { tipo: "evento", evento: "app.abriu", cada: 0 } });
    r.salvarRotina({ nome: "fechou", texto: "t", hora: "", gatilho: { tipo: "evento", evento: "app.fechou" } });

    ev.emitirEvento("app.abriu", { app: "notepad", titulo: "Sem título - Bloco de Notas" });
    await esperar();
    expect(rodou).toEqual(["qualquer"]);

    ev.emitirEvento("app.abriu", { app: "chrome#2", titulo: "GitHub - Google Chrome" });
    await esperar();
    expect(rodou).toEqual(["qualquer", "chrome", "qualquer"]);

    // Segundo Chrome dentro de 60 min: "chrome" segura, "qualquer" (cada 0) roda de novo.
    ev.emitirEvento("app.abriu", { app: "ApplicationFrameHost", titulo: "YouTube - Google Chrome" });
    await esperar();
    expect(rodou).toEqual(["qualquer", "chrome", "qualquer", "qualquer"]);
    r.pararRotinas();

    // Depois de parar, nada mais escuta.
    ev.emitirEvento("app.fechou", { app: "chrome" });
    await esperar();
    expect(rodou).toHaveLength(4);
  });

  it("ocioso dispara só no menor marco que cobre os minutos; CPU alta respeita o limite", async () => {
    const { r, ev } = await carregarComEventos();
    const rodou: string[] = [];
    r.iniciarRotinas(async rot => { rodou.push(rot.nome); return "ok"; }, () => {});
    r.salvarRotina({ nome: "ocioso20", texto: "t", hora: "", gatilho: { tipo: "evento", evento: "pc.ocioso", minutos: 20, cada: 0 } });
    r.salvarRotina({ nome: "cpu", texto: "t", hora: "", gatilho: { tipo: "evento", evento: "cpu.alta", limite: 90, cada: 0 } });

    for (const m of [5, 15, 30, 60, 120]) ev.emitirEvento("pc.ocioso", { minutos: m });
    await esperar();
    expect(rodou).toEqual(["ocioso20"]); // só no marco 30

    ev.emitirEvento("cpu.alta", { valor: 87 });
    ev.emitirEvento("cpu.alta", { valor: 95 });
    await esperar();
    expect(rodou).toEqual(["ocioso20", "cpu"]);
    r.pararRotinas();
  });

  it("rotina pausada não reage a evento", async () => {
    const { r, ev } = await carregarComEventos();
    const rodou: string[] = [];
    r.iniciarRotinas(async rot => { rodou.push(rot.nome); return "ok"; }, () => {});
    const rot = r.salvarRotina({ nome: "cel", texto: "t", hora: "", gatilho: { tipo: "evento", evento: "celular.conectou" } });
    r.alternarRotina(rot.id, false);
    ev.emitirEvento("celular.conectou");
    await esperar();
    expect(rodou).toEqual([]);
    r.pararRotinas();
  });
});

describe("rotinas — condição", () => {
  it("condição falsa não executa nem entrega, e fica registrada; `forcar` pula a condição", async () => {
    const { r } = await carregarComEventos();
    const entregas: string[] = [];
    const perguntas: string[] = [];
    r.iniciarRotinas(async () => "feito", (_, res) => entregas.push(res), async (cond, ctx) => { perguntas.push(`${cond}|${ctx}`); return false; });
    const rot = r.salvarRotina({ nome: "c", texto: "t", hora: "08:00", condicao: "  se o Spotify estiver aberto " });
    expect(rot.condicao).toBe("se o Spotify estiver aberto");

    expect(await r.executarRotina(rot.id, { contexto: "Evento: x" })).toMatch(/Condição não valeu/);
    expect(entregas).toEqual([]);
    expect(perguntas).toEqual(["se o Spotify estiver aberto|Evento: x"]);
    expect(r.listarRotinas()[0].ultimoResultado).toMatch(/não executei/);

    expect(await r.executarRotina(rot.id, { forcar: true })).toBe("feito");
    expect(entregas).toEqual(["feito"]);
    expect(perguntas).toHaveLength(1);
    r.pararRotinas();
  });

  it("condição verdadeira, indecisa (null) ou avaliador que estoura deixam a rotina rodar", async () => {
    const { r } = await carregarComEventos();
    let resposta: (() => Promise<boolean | null>) = async () => true;
    r.iniciarRotinas(async () => "feito", () => {}, () => resposta());
    const rot = r.salvarRotina({ nome: "c", texto: "t", hora: "08:00", condicao: "se chover" });
    expect(await r.executarRotina(rot.id)).toBe("feito");
    resposta = async () => null;
    expect(await r.executarRotina(rot.id)).toBe("feito");
    resposta = async () => { throw new Error("modelo fora"); };
    expect(await r.executarRotina(rot.id)).toBe("feito");
    r.pararRotinas();
  });
});
