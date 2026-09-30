import { describe, expect, it } from "vitest";
import { avaliarSaude, FatosSaude } from "../src/services/saude";

const base = (): FatosSaude => ({
  cerebroLocal: true,
  ollama: { ok: true, detalhe: "" },
  modeloLocal: "qwen2.5:7b",
  groqChave: true,
  groqLimiteHaMin: null,
  inicioDesejado: true,
  inicio: { ok: true, detalhe: "sobe com o Windows, esta versão" },
  atualizacao: { atual: "1.5.3", verificando: false },
  discos: [{ name: "C", freeGB: 200, totalGB: 476, usedPct: 58 }],
  celularConectado: true,
  celularVistoEm: null,
  backupChavesEm: Date.now() - 86_400_000,
  agora: Date.now(),
});

describe("saúde do ELYSIUM (fase 12)", () => {
  it("tudo certo é tudo ok", () => {
    expect(avaliarSaude(base()).every(i => i.nivel === "ok")).toBe(true);
  });

  it("a noite de 29/09: Ollama parado, Groq no limite, boot na cópia velha, disco cheio", () => {
    const f = base();
    f.ollama = { ok: false, detalhe: "o Ollama não está rodando (inicie o serviço)" };
    f.groqLimiteHaMin = 2;
    f.inicio = { ok: false, detalhe: "o Windows sobe outra cópia: C:/x/ELYSIUM.exe" };
    f.discos = [{ name: "C", freeGB: 25, totalGB: 476, usedPct: 95 }];
    const itens = avaliarSaude(f);
    const por = Object.fromEntries(itens.map(i => [i.id, i]));
    expect(por.cerebro.nivel).toBe("erro");
    expect(por.cerebro.conserto?.valor).toBe("ollama");
    expect(por.groq.nivel).toBe("aviso");
    expect(por.inicio.conserto?.valor).toBe("inicio");
    expect(por.disco.conserto).toMatchObject({ tipo: "painel", valor: "armazenamento" });
  });

  it("modelo não baixado não oferece 'subir o Ollama'", () => {
    const f = base();
    f.ollama = { ok: false, detalhe: '"qwen2.5:7b" não foi baixado — rode: ollama pull qwen2.5:7b' };
    const cerebro = avaliarSaude(f).find(i => i.id === "cerebro")!;
    expect(cerebro.nivel).toBe("erro");
    expect(cerebro.conserto).toBeUndefined();
  });

  it("versão baixada oferece instalar", () => {
    const f = base();
    f.atualizacao = { atual: "1.5.3", verificando: false, desktop: { versao: "1.5.4", notas: "", publicadaEm: "", arquivo: "", tamanho: 1, progresso: 1, pronto: true } };
    expect(avaliarSaude(f).find(i => i.id === "versao")?.conserto?.valor).toBe("update.install");
  });
});

describe("disco no card de saúde", () => {
  it("94,7% com 25 GB livres é aviso, não 'espaço de sobra'", () => {
    const f = base();
    f.discos = [{ name: "C", freeGB: 25.2, totalGB: 475.8, usedPct: 94.7 }];
    const d = avaliarSaude(f).find(i => i.id === "disco")!;
    expect(d.nivel).toBe("aviso");
    expect(d.conserto?.valor).toBe("armazenamento");
  });
});

describe("backup das chaves (bloco 113)", () => {
  it("sem backup é aviso com o comando", () => {
    const f = base();
    f.backupChavesEm = null;
    const c = avaliarSaude(f).find(i => i.id === "chaves")!;
    expect(c.nivel).toBe("aviso");
    expect(c.detalhe).toMatch(/backup-chaves\.ps1/);
  });
  it("backup de mais de 6 meses volta a avisar", () => {
    const f = base();
    f.backupChavesEm = f.agora - 200 * 86_400_000;
    expect(avaliarSaude(f).find(i => i.id === "chaves")!.nivel).toBe("aviso");
  });
});
