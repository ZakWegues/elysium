import { describe, expect, it, vi } from "vitest";

/** Cada `carregar()` é um PC "novo": módulos (e os stores em memória) do zero. */
async function carregar() {
  vi.resetModules();
  const backup = await import("../src/services/backup");
  const memoria = await import("../src/services/memoryStore");
  const lembretes = await import("../src/services/scheduler");
  const rotinas = await import("../src/services/rotinas");
  const conversas = await import("../src/services/chatSessionsStore");
  const config = await import("../src/main/config");
  return { backup, memoria, lembretes, rotinas, conversas, config };
}

describe("backup (bloco 96)", () => {
  it("ida e volta: o que sai de um PC entra no outro", async () => {
    const a = await carregar();
    a.memoria.addFact("meu carro é um civic prata");
    a.lembretes.createReminder({ text: "dentista", dueAt: Date.now() + 86_400_000 });
    a.lembretes.createReminder({ text: "já passou", dueAt: Date.now() + 50 });
    a.rotinas.salvarRotina({ nome: "Bom dia", texto: "como está o tempo", hora: "07:30" });
    a.conversas.saveSession({ id: "s1", title: "Oi", createdAt: 1, updatedAt: 2, favorite: false, messages: [{ id: "m1", from: "me", text: "oi", ts: 1 }] });
    a.config.setOverride({ voice: "pt-BR-FranciscaNeural", ollamaBaseUrl: "http://outra:11434" } as never);
    const b = a.backup.montarBackup();
    expect(b.formato).toBe("elysium-backup");
    expect(b.memoria).toContain("meu carro é um civic prata");
    expect(b.ajustes).toEqual({ voice: "pt-BR-FranciscaNeural" }); // o endereço do Ollama é desta máquina
    expect(JSON.stringify(b)).not.toMatch(/apiKey|serverToken/);

    await new Promise(r => setTimeout(r, 80)); // o lembrete "já passou" vence
    const novo = await carregar();
    const lido = novo.backup.lerBackup(JSON.parse(JSON.stringify(b)));
    const r1 = novo.backup.aplicarBackup(lido);
    expect(r1).toMatchObject({ memoria: 1, rotinas: 1, conversas: 1, ajustes: 1 });
    expect(r1.lembretes).toBe(1); // o que já tinha passado não volta
    expect(novo.memoria.listFacts().map(f => f.text)).toContain("meu carro é um civic prata");
    expect(novo.config.getConfig().voice).toBe("pt-BR-FranciscaNeural");

    // Importar de novo não duplica nada.
    const r2 = novo.backup.aplicarBackup(lido);
    expect(r2).toMatchObject({ memoria: 0, lembretes: 0, rotinas: 0 });
    expect(novo.rotinas.listarRotinas()).toHaveLength(1);
  });

  it("recusa arquivo que não é backup e versão desconhecida", async () => {
    const { backup } = await carregar();
    expect(() => backup.lerBackup({ foo: 1 })).toThrow(/não é um backup/);
    expect(() => backup.lerBackup({ formato: "elysium-backup", versao: 9 })).toThrow(/versão/);
  });
});
