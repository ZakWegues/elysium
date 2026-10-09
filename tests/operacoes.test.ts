import { describe, expect, it } from "vitest";
import { handleRpc } from "../src/services/rpc";
import { executarFerramenta } from "../src/services/ferramentas";
import { listarTarefasTodas, type Tarefa } from "../src/services/tarefas";

const amanha16 = () => {
  const d = new Date(Date.now() + 86_400_000); d.setHours(16, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T16:00`;
};

describe("uma regra, um lugar (bloco 202)", () => {
  it("RPC: criar, adiar, concluir com ressalva, reabrir", async () => {
    const c = await handleRpc("tarefas.criar", { texto: "Pagar a conta de luz", quando: amanha16() }, { confirmed: false }) as { tarefa: Tarefa };
    expect(c.tarefa.prazo).toBeDefined();
    const ad = await handleRpc("tarefas.adiar", { id: c.tarefa.id, para: "semana" }, { confirmed: false }) as { tarefa: Tarefa };
    expect(ad.tarefa.prazo!).toBeGreaterThan(c.tarefa.prazo!);
    const fe = await handleRpc("tarefas.concluir", { id: c.tarefa.id, ressalva: "paguei pelo app" }, { confirmed: false }) as { tarefa: Tarefa };
    expect(fe.tarefa.feita).toBe(true);
    expect(fe.tarefa.ressalva).toBe("paguei pelo app");
    const re = await handleRpc("tarefas.reabrir", { id: c.tarefa.id }, { confirmed: false }) as { tarefa?: Tarefa };
    expect(re).toBeTruthy();
    await expect(handleRpc("tarefas.concluir", { id: "nao-existe" }, { confirmed: false })).rejects.toMatchObject({ status: 404 });
  });

  it("🔴 concluir pela VOZ uma tarefa que repete cria a próxima (antes só o celular criava)", async () => {
    const c = await handleRpc("tarefas.criar", { texto: "Regar as plantas", quando: amanha16(), repete: "semanal" }, { confirmed: false }) as { tarefa: Tarefa };
    const fala = await executarFerramenta("concluir_tarefa", { tarefa: "regar as plantas" });
    expect(fala).toMatch(/Concluída: Regar as plantas\. A próxima já está na lista\./);
    const abertas = listarTarefasTodas().filter(t => t.texto === "Regar as plantas" && !t.feita);
    expect(abertas).toHaveLength(1);
    expect(abertas[0].prazo!).toBeGreaterThan(c.tarefa.prazo!);
    // Concluir de novo a mesma não cria outra.
    await executarFerramenta("concluir_tarefa", { tarefa: c.tarefa.texto });
    expect(listarTarefasTodas().filter(t => t.texto === "Regar as plantas" && !t.feita).length).toBeLessThanOrEqual(1);
  });

  it("hábito e meta: a mesma frase na voz e no agente", async () => {
    await handleRpc("habitos.save", { nome: "Leitura", dias: [0, 1, 2, 3, 4, 5, 6] }, { confirmed: false });
    expect(await executarFerramenta("marcar_habito", { habito: "leitura" })).toMatch(/^Leitura marcado\. Sequência de 1 dia\.$/);
    expect(await executarFerramenta("marcar_habito", { habito: "xadrez" })).toMatch(/Não achei o hábito xadrez/);
  });
});
