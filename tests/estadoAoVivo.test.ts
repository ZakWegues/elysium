import { describe, expect, it } from "vitest";
import { aoMudarEstadoAoVivo, avisarEstadoAoVivo, estadoDaFerramenta, nomeNoEventoHermes } from "../src/services/estadoAoVivo";

describe("o que a Ely está fazendo, em português de gente (13/11)", () => {
  it("as ferramentas do ELYSIUM dizem o que vai acontecer, com o alvo", () => {
    expect(estadoDaFerramenta("abrir_programa", { nome: "Chrome" })).toBe("Abrindo Chrome…");
    expect(estadoDaFerramenta("mcp_elysium_fechar_programa", { programa: "Spotify" })).toBe("Fechando Spotify…");
    expect(estadoDaFerramenta("tocar_musica", { busca: "Queen" })).toBe("Tocando Queen…");
    expect(estadoDaFerramenta("clima")).toBe("Vendo o clima…");
  });
  it("as do Hermes viram o efeito, nunca o comando", () => {
    expect(estadoDaFerramenta("web_search", { query: "x" })).toBe("Pesquisando…");
    expect(estadoDaFerramenta("web_extract")).toBe("Lendo a página…");
    const t = estadoDaFerramenta("terminal", { command: "cd C:\\Users && dir" });
    expect(t).toBe("Fazendo isso no PC…");
    expect(t).not.toMatch(/cd|dir|C:/);
    expect(estadoDaFerramenta("coisa_nova_qualquer")).toBe("Trabalhando nisso…");
  });
  it("lê o nome no evento do Hermes em formatos diferentes", () => {
    expect(nomeNoEventoHermes({ name: "web_search", args: { q: 1 } })).toEqual({ nome: "web_search", args: { q: 1 } });
    expect(nomeNoEventoHermes({ tool: "terminal", arguments: "{\"command\":\"ls\"}" })).toEqual({ nome: "terminal", args: { command: "ls" } });
    expect(nomeNoEventoHermes({ function: { name: "x", arguments: "lixo" } })).toEqual({ nome: "x", args: {} });
    expect(nomeNoEventoHermes(undefined).nome).toBe("");
  });
  it("avisa quem ouve e para de avisar ao desligar", () => {
    const vistos: string[] = [];
    const desligar = aoMudarEstadoAoVivo((t) => vistos.push(t));
    avisarEstadoAoVivo("Pesquisando…"); avisarEstadoAoVivo("");
    desligar(); avisarEstadoAoVivo("Depois");
    expect(vistos).toEqual(["Pesquisando…"]);
  });
});
