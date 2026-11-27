import { describe, expect, it } from "vitest";
import { avaliarSaude, FatosSaude, problemasParaAvisar } from "../src/services/saude";

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

describe("servidor do celular (bloco 127)", () => {
  it("porta ocupada vira erro com o motivo; de pé ou ausente não diz nada", () => {
    const f = base();
    f.servidor = { ouvindo: false, erro: "a porta 4200 está ocupada por outro programa" };
    const s = avaliarSaude(f).find(i => i.id === "servidor")!;
    expect(s.nivel).toBe("erro");
    expect(s.detalhe).toMatch(/4200 está ocupada.*não alcança/);
    f.servidor = { ouvindo: true, erro: null };
    expect(avaliarSaude(f).some(i => i.id === "servidor")).toBe(false);
    delete f.servidor;
    expect(avaliarSaude(f).some(i => i.id === "servidor")).toBe(false);
  });
});

describe("Tailscale (bloco 122)", async () => {
  const { interpretarStatus } = await import("../src/services/tailscale");
  const json = JSON.stringify({
    BackendState: "Running",
    Self: { TailscaleIPs: ["100.64.0.1", "fd7a::1"] },
    Peer: {
      a: { HostName: "Celular Teste", Online: false, OS: "android", LastSeen: "2026-09-30T10:00:00Z" },
      b: { HostName: "notebook", Online: true, OS: "windows", LastSeen: "0001-01-01T00:00:00Z" },
    },
  });
  it("lê o status: rodando, IP 100.x e só os celulares", () => {
    const s = interpretarStatus(json);
    expect(s).toMatchObject({ rodando: true, ip: "100.64.0.1" });
    expect(s.celulares).toEqual([{ nome: "Celular Teste", online: false, sistema: "android", vistoEm: Date.parse("2026-09-30T10:00:00Z") }]);
  });
  it("celular desligado no Tailscale vira aviso com o nome dele", () => {
    const f = base();
    f.tailscale = { instalado: true, ...interpretarStatus(json) };
    const t = avaliarSaude(f).find(i => i.id === "tailscale")!;
    expect(t.nivel).toBe("aviso");
    expect(t.detalhe).toMatch(/Celular Teste está desligado/);
  });
  it("parado no PC oferece abrir; sem Tailscale não diz nada", () => {
    const f = base();
    f.tailscale = { instalado: true, rodando: false, ip: null, celulares: [] };
    expect(avaliarSaude(f).find(i => i.id === "tailscale")?.conserto?.valor).toBe("tailscale");
    f.tailscale = { instalado: false, rodando: false, ip: null, celulares: [] };
    expect(avaliarSaude(f).find(i => i.id === "tailscale")).toBeUndefined();
  });
});

describe("som no card Saúde (fase 19, bloco 195)", () => {
  const som = (nome: string, volume = 50, mudo = false, virtual = false) => ({ nome, volume, mudo, virtual, em: 0 });
  it("alto-falante virtual vira aviso com o atalho para o som do Windows", () => {
    const item = avaliarSaude({ ...base(), som: som("Alto-falantes (Steam Streaming Speakers)", 50, false, true) }).find(i => i.id === "som")!;
    expect(item.nivel).toBe("aviso");
    expect(item.detalhe).toMatch(/virtual/);
    expect(item.conserto?.valor).toBe("som");
  });
  it("saída normal é ok; sem leitura, o item nem aparece", () => {
    expect(avaliarSaude({ ...base(), som: som("SAMSUNG (NVIDIA High Definition Audio)", 40) }).find(i => i.id === "som")?.nivel).toBe("ok");
    expect(avaliarSaude(base()).some(i => i.id === "som")).toBe(false);
  });

  it("27/11: Hermes, Gemini e os olhos locais aparecem no card", () => {
    const f = base();
    f.hermes = { estado: "pronto", erro: null, modelo: "gemini-3.1-flash-lite", semCota: true };
    f.gemini = { semCotaEmTodos: true };
    f.visaoLocal = { ok: false, detalhe: '"qwen3-vl:2b" não foi baixado — rode: ollama pull qwen3-vl:2b' };
    const por = Object.fromEntries(avaliarSaude(f).map(i => [i.id, i]));
    expect(por.hermes.nivel).toBe("aviso");
    expect(por.hermes.detalhe).toMatch(/fila de reserva/);
    expect(por.gemini.nivel).toBe("aviso");
    expect(por.visao.nivel).toBe("aviso");
    f.hermes = { estado: "erro", erro: "a conexão caiu", modelo: null, semCota: false };
    expect(avaliarSaude(f).find(i => i.id === "hermes")?.nivel).toBe("erro");
  });

  it("27/11: só avisa erro que continua na checagem seguinte, uma vez", () => {
    const erro = { id: "hermes", titulo: "Hermes", nivel: "erro" as const, detalhe: "fora do ar" };
    const aviso = { id: "gemini", titulo: "Gemini", nivel: "aviso" as const, detalhe: "sem cota" };
    let r = problemasParaAvisar([erro, aviso], new Map());
    expect(r.avisar).toEqual([]);
    r = problemasParaAvisar([erro, aviso], r.seguidas);
    expect(r.avisar.map(i => i.id)).toEqual(["hermes"]);
    r = problemasParaAvisar([erro], r.seguidas);
    expect(r.avisar).toEqual([]);
    // Sarou e voltou: avisa de novo na segunda checagem.
    r = problemasParaAvisar([], r.seguidas);
    r = problemasParaAvisar([erro], r.seguidas);
    r = problemasParaAvisar([erro], r.seguidas);
    expect(r.avisar.map(i => i.id)).toEqual(["hermes"]);
  });
});
