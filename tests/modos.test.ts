import { beforeEach, describe, expect, it } from "vitest";
import {
  acharModo, apagarModoMeu, blocoDoModo, definirModo, EXPIRA_MS, importarModos, linhaDoAgente,
  listarModos, modoAtivo, modosParaBackup, pedidoDeModo, salvarModoMeu, tocarModo,
} from "../src/services/modos";
import { fastRoute } from "../src/services/fastRoute";
import { provedorDaConversa } from "../src/services/cerebroHibrido";
import { savePreset, deletePresetByKey } from "../src/services/presetsStore";
import { bolhasDoChat } from "../src/services/perguntas";
import { vozDoMomento } from "../src/services/tts";

describe("modos (bloco 205)", () => {
  beforeEach(() => {
    definirModo(null);
    for (const m of modosParaBackup()) apagarModoMeu(m.id);
  });

  it("acha pelo nome, sem acento, e pelos apelidos", () => {
    expect(acharModo("matemática")?.id).toBe("matematica");
    expect(acharModo("de Português")?.id).toBe("portugues");
    expect(acharModo("redação")?.id).toBe("portugues");
    expect(acharModo("english")?.id).toBe("ingles");
    expect(acharModo("física")?.id).toBe("ciencias");
    expect(acharModo("quiz")?.id).toBe("estudo");
    expect(acharModo("gaming")).toBeNull();
    expect(acharModo("foco")).toBeNull();
    expect(listarModos().length).toBeGreaterThanOrEqual(8);
  });

  it("entende o que se fala", () => {
    expect(pedidoDeModo("modo matemática")).toEqual({ tipo: "ligar", id: "matematica" });
    expect(pedidoDeModo("Ely, entra no modo inglês")).toEqual({ tipo: "ligar", id: "ingles" });
    expect(pedidoDeModo("ativa o modo de português")).toEqual({ tipo: "ligar", id: "portugues" });
    expect(pedidoDeModo("muda pro modo programação")).toEqual({ tipo: "ligar", id: "programacao" });
    expect(pedidoDeModo("sai do modo")).toEqual({ tipo: "desligar" });
    expect(pedidoDeModo("desliga o modo matemática")).toEqual({ tipo: "desligar" });
    expect(pedidoDeModo("modo normal")).toEqual({ tipo: "desligar" });
    expect(pedidoDeModo("qual modo tá ligado?")).toEqual({ tipo: "status" });
    expect(pedidoDeModo("quais modos tem?")).toEqual({ tipo: "listar" });
    expect(pedidoDeModo("cria um modo chefe de cozinha que responde como um chef, com receitas práticas")).toEqual({
      tipo: "criar", nome: "chefe de cozinha", instrucao: "responde como um chef, com receitas práticas",
    });
  });

  it("não pega o que é de outro lugar nem frase comum", () => {
    expect(pedidoDeModo("sai do modo foco")).toBeNull();
    expect(pedidoDeModo("modo gaming")).toBeNull();
    expect(pedidoDeModo("qual o modo de preparo do bolo?")).toBeNull();
    expect(pedidoDeModo("de que modo eu faço isso?")).toBeNull();
    expect(pedidoDeModo("abre o chrome")).toBeNull();
    expect(pedidoDeModo("a vida normal")).toBeNull();
  });

  it("no fastRoute, foco e anônimo continuam com as regras deles", () => {
    expect(fastRoute("modo foco")?.[0]).toMatchObject({ action: "focus" });
    expect(fastRoute("sai do modo foco")?.[0]).toMatchObject({ action: "focus", operation: "stop" });
    expect(fastRoute("modo anônimo")?.[0]).toMatchObject({ action: "anon_mode", ligar: true });
    expect(fastRoute("modo matemática")?.[0]).toMatchObject({ action: "mode", operacao: "ligar", id: "matematica" });
    expect(fastRoute("sai do modo")?.[0]).toMatchObject({ action: "mode", operacao: "desligar" });
    expect(fastRoute("modo gaming")).toBeNull();
  });

  it("um preset com o mesmo nome ganha do modo", () => {
    savePreset("modo estudo", { description: "Classroom e Spotify", actions: [] } as never);
    try {
      expect(pedidoDeModo("modo estudo")).toBeNull();
      expect(salvarModoMeu({ nome: "estudo", instrucao: "qualquer coisa longa" })).toBe("reservado");
    } finally { deletePresetByKey("modo estudo"); }
  });

  it("liga, conta uso e sai sozinho depois de 6 h parado", () => {
    const t0 = 1_000_000;
    definirModo("matematica", t0);
    expect(modoAtivo(t0 + 1000)?.id).toBe("matematica");
    tocarModo(t0 + EXPIRA_MS - 1000);
    expect(modoAtivo(t0 + EXPIRA_MS + 1000)?.id).toBe("matematica");
    expect(modoAtivo(t0 + 2 * EXPIRA_MS + 1000)).toBeNull();
  });

  it("o bloco do prompt muda na voz e a linha do agente é uma só", () => {
    const m = acharModo("matemática");
    expect(blocoDoModo(null, "texto")).toBe("");
    expect(blocoDoModo(m, "texto")).toMatch(/\[MODO MATEMÁTICA\][\s\S]*passo a passo/);
    expect(blocoDoModo(m, "texto")).not.toMatch(/Na voz/);
    expect(blocoDoModo(m, "voz")).toMatch(/Na voz/);
    expect(linhaDoAgente(m).split("\n").filter(Boolean)).toHaveLength(1);
    expect(linhaDoAgente(null)).toBe("");
  });

  it("modo de estudo vai para a nuvem no híbrido", () => {
    expect(provedorDaConversa("auto", "e o 3?", "voz", true)).toBe("ollama");
    expect(provedorDaConversa("auto", "e o 3?", "voz", true, true)).toBe("groq");
    expect(provedorDaConversa("ollama", "e o 3?", "voz", true, true)).toBe("ollama");
    expect(provedorDaConversa("auto", "e o 3?", "voz", false, true)).toBe("ollama");
  });

  it("bolhas e voz acompanham o modo", () => {
    definirModo("ingles");
    expect(bolhasDoChat(4)[0]).toMatch(/weekend/);
    expect(vozDoMomento()).toBe("pt-BR-ThalitaMultilingualNeural");
    definirModo(null);
    expect(bolhasDoChat(4).some(b => /weekend/.test(b))).toBe(false);
  });

  it("modos dele: valida, cria, apaga e soma no backup", () => {
    expect(salvarModoMeu({ nome: "x", instrucao: "faz alguma coisa útil" })).toBe("nome");
    expect(salvarModoMeu({ nome: "Chef", instrucao: "curto" })).toBe("instrucao");
    expect(salvarModoMeu({ nome: "foco", instrucao: "faz alguma coisa útil" })).toBe("reservado");
    expect(salvarModoMeu({ nome: "Inglês", instrucao: "faz alguma coisa útil" })).toBe("existe");
    const chef = salvarModoMeu({ nome: "Chef", instrucao: "responde como um chef de cozinha".padEnd(3000, "!") });
    if (typeof chef === "string") throw new Error(chef);
    expect(chef.instrucao.length).toBe(1500);
    expect(acharModo("chef")?.meu).toBe(true);
    definirModo(chef.id);
    expect(blocoDoModo(modoAtivo(), "texto")).toMatch(/criado por ele/);
    // Somar: o que já existe fica, o novo entra, o inválido conta como pulado.
    const r = importarModos([{ nome: "Chef", instrucao: "outra coisa qualquer" }, { nome: "Vendas", instrucao: "simula um cliente difícil" }, { nome: 3 }]);
    expect(r).toEqual({ somados: 1, pulados: 1 });
    expect(apagarModoMeu(chef.id)).toBe(true);
    expect(modoAtivo()).toBeNull();
  });
});

describe("modos: casos da revisão", () => {
  it("'volta ao normal' sem modo ligado não é sobre modo", () => {
    definirModo(null);
    expect(pedidoDeModo("volta ao normal")).toBeNull();
    expect(pedidoDeModo("modo normal")).toEqual({ tipo: "desligar" });
    definirModo("matematica");
    expect(pedidoDeModo("volta ao normal")).toEqual({ tipo: "desligar" });
    definirModo(null);
  });
});
