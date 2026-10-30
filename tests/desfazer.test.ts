import { beforeEach, describe, expect, it } from "vitest";
import { desfazerUltima, ehPedidoDeDesfazer, registrarDesfazer, ultimoDesfazer, VALIDADE_DESFAZER_MS, zerarDesfazer } from "../src/services/desfazer";
import { cancelReminderAction, createReminderAction, forget, remember } from "../src/actions/memoryActions";
import { listPending } from "../src/services/scheduler";
import { listarTarefasTodas } from "../src/services/tarefas";
import { listFacts } from "../src/services/memoryStore";
import { routeAction } from "../src/actions/router";
import { obterLista } from "../src/services/listas";
import { findPresetKey, savePreset } from "../src/services/presetsStore";

beforeEach(() => zerarDesfazer());

describe("desfazer (31/10)", () => {
  it("reconhece o pedido falado, e não confunde com outra coisa", () => {
    for (const t of ["desfaz", "Ely, desfaz isso", "desfazer a última", "Volta atrás!", "desfaça"]) expect(ehPedidoDeDesfazer(t)).toBe(true);
    for (const t of ["desfaz a mala amanhã", "como desfazer um nó", "volta"]) expect(ehPedidoDeDesfazer(t)).toBe(false);
  });

  it("uma só, vale 5 minutos e não desfaz duas vezes", async () => {
    let n = 0;
    registrarDesfazer("x", () => { n++; return "feito"; }, 1000);
    expect(ultimoDesfazer(1000 + VALIDADE_DESFAZER_MS + 1)).toBeNull();
    expect(ultimoDesfazer(2000)?.rotulo).toBe("x");
    expect(await desfazerUltima(2000)).toBe("feito");
    expect(await desfazerUltima(2000)).toMatch(/nada recente/);
    expect(n).toBe(1);
  });

  it("memória: guardar e esquecer voltam atrás", async () => {
    remember("o time favorito é o Azul FC");
    expect(listFacts().some(f => f.text.includes("Azul FC"))).toBe(true);
    await desfazerUltima();
    expect(listFacts().some(f => f.text.includes("Azul FC"))).toBe(false);

    remember("prefere café sem açúcar");
    forget("café sem açúcar");
    expect(listFacts().some(f => f.text.includes("café"))).toBe(false);
    expect(await desfazerUltima()).toMatch(/lembro de novo/);
    expect(listFacts().some(f => f.text.includes("café"))).toBe(true);
  });

  it("lista: os itens que entraram saem; os que já estavam ficam", async () => {
    await routeAction({ action: "list_add", list: "Testes", items: ["pão"] });
    zerarDesfazer();
    await routeAction({ action: "list_add", list: "Testes", items: ["pão", "leite", "ovo"] });
    expect(ultimoDesfazer()?.rotulo).toMatch(/leite e ovo/);
    await desfazerUltima();
    expect(obterLista("Testes")!.itens.map(i => i.texto)).toEqual(["pão"]);
  });

  it("lembrete: criar e cancelar voltam atrás, com a tarefa", async () => {
    const amanha = new Date(Date.now() + 86_400_000); amanha.setHours(15, 0, 0, 0);
    const iso = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, "0")}-${String(amanha.getDate()).padStart(2, "0")}T15:00:00`;
    createReminderAction("regar as plantas", iso);
    expect(listPending().some(r => r.text.includes("regar"))).toBe(true);
    await desfazerUltima();
    expect(listPending().some(r => r.text.includes("regar"))).toBe(false);
    expect(listarTarefasTodas().some(t => t.texto === "regar as plantas")).toBe(false);

    createReminderAction("pagar a conta de luz", iso);
    cancelReminderAction("conta de luz");
    expect(listarTarefasTodas().some(t => t.texto === "pagar a conta de luz")).toBe(false);
    expect(await desfazerUltima()).toMatch(/voltou/);
    const r = listPending().find(x => x.text.includes("conta de luz"))!;
    expect(listarTarefasTodas().find(t => t.texto === "pagar a conta de luz")?.lembreteIds).toEqual([r.id]);
  });

  it("preset apagado volta igual", async () => {
    savePreset("cinema", { description: "Modo cinema", actions: [] } as never);
    await routeAction({ action: "delete_preset", preset_name: "cinema" });
    expect(findPresetKey("cinema")).toBeUndefined();
    await desfazerUltima();
    expect(findPresetKey("cinema")).toBe("cinema");
  });
});
