import { describe, expect, it } from "vitest";
import { alvoDoApp, lerPedido, refDoAlvo, tirarAparelho } from "../src/services/destino";
import { leituraDaFaixa, motivoDe, pesoNoMomento, sementes, sorteio, temGostoBastante, votar, type Gostos } from "../src/services/gostos";
import { urlDaDeezer, lerMusica } from "../src/services/deezer";
import { ESTILOS } from "../src/services/catalogoMusical";
import { aberturaDoPedido, abrirNoCelularAtual, aparelhoDoPedido, comContexto } from "../src/services/contextoComando";

describe("abrir e tocar no aparelho certo (23/11)", () => {
  it("separa o aparelho do pedido", () => {
    expect(tirarAparelho("abre o YouTube no meu celular")).toEqual({ dito: "celular", sem: "abre o YouTube" });
    expect(tirarAparelho("abre o YouTube no PC, por favor").dito).toBe("pc");
    expect(tirarAparelho("abre o YouTube")).toEqual({ dito: null, sem: "abre o YouTube" });
    expect(tirarAparelho("no celularzinho").dito).toBe(null);
  });

  it("lê abrir, tocar, pesquisar e passar", () => {
    expect(lerPedido("Ely, abre o YouTube no celular.")).toMatchObject({ pedido: { tipo: "abrir", nome: "YouTube" }, dito: "celular" });
    expect(lerPedido("abre o YouTube")).toMatchObject({ pedido: { tipo: "abrir", nome: "YouTube" }, dito: null });
    expect(lerPedido("toca Angel, a música da banda Massive Attack no meu celular")?.dito).toBe("celular");
    expect(lerPedido("coloca a música Angel da banda Massive Attack no meu celular")).toMatchObject({ pedido: { tipo: "tocar", busca: "Angel Massive Attack", app: null }, dito: "celular" });
    expect(lerPedido("toca Teardrop no YouTube no PC")).toMatchObject({ pedido: { tipo: "tocar", busca: "Teardrop", app: "youtube" }, dito: "pc", semAparelho: "toca Teardrop no YouTube" });
    expect(lerPedido("pesquisa receita de bolo no YouTube")).toMatchObject({ pedido: { tipo: "pesquisar", busca: "receita de bolo", site: "youtube" } });
    expect(lerPedido("continua no celular")).toMatchObject({ pedido: { tipo: "passar" }, dito: "celular" });
    expect(lerPedido("passa a música pro PC")).toMatchObject({ pedido: { tipo: "passar" }, dito: "pc" });
  });

  it("não pega o que não é disso", () => {
    for (const t of ["coloca leite na lista", "bota o volume em 40", "toca a próxima", "toca de novo", "abre o Chrome e fecha o Spotify", "que horas são", "manda isso no celular", "põe um lembrete no celular", "como abrir uma empresa", "continua"]) expect(lerPedido(t), t).toBe(null);
  });

  it("o celular conhece os apps, e o ref guarda o alvo", () => {
    expect(alvoDoApp("o Insta")).toMatchObject({ rotulo: "Instagram", pacote: "com.instagram.android" });
    expect(alvoDoApp("câmera")).toMatchObject({ acao: "android.media.action.STILL_IMAGE_CAMERA" });
    expect(alvoDoApp("globo.com")).toMatchObject({ url: "https://globo.com" });
    expect(alvoDoApp("bloco de notas")).toBe(null);
    const ref = refDoAlvo({ rotulo: "Olá", url: "https://a.b" });
    expect(JSON.parse(Buffer.from(ref.slice(6), "base64url").toString("utf8"))).toEqual({ rotulo: "Olá", url: "https://a.b" });
  });

  it("o alvo só vai na resposta se o pedido veio do celular que sabe abrir", async () => {
    await comContexto("voz", async () => {
      expect(aparelhoDoPedido()).toBe("celular");
      expect(abrirNoCelularAtual({ rotulo: "x", url: "https://x.y" })).toBe(true);
      expect(aberturaDoPedido()?.rotulo).toBe("x");
    }, "", "celular", true);
    await comContexto("voz", async () => {
      expect(aparelhoDoPedido()).toBe("pc");
      expect(abrirNoCelularAtual({ rotulo: "x" })).toBe(false);
    }, "", "celular", false);
  });
});

const art = (nome: string, id = 1) => ({ id, nome, foto: null });
const vazio: Gostos = { estilos: {}, artistas: {}, musicas: {}, escutados: {} };

describe("gostos e sugestões (23/11)", () => {
  it("as sementes juntam artista, música, estilo e o que ele ouve", () => {
    const g: Gostos = { ...vazio, artistas: { portishead: { nome: "Portishead", valor: 1 }, anitta: { nome: "Anitta", valor: -1 } }, musicas: { 1: { valor: 1, titulo: "x", artista: "Portishead" } }, escutados: { tricky: { nome: "Tricky", ok: 4, pulou: 0 } } };
    const s = sementes(g);
    expect(s[0]).toMatchObject({ nome: "Portishead", peso: 2.8, estilo: "trip-hop" });
    expect(s.find((x) => x.nome === "Anitta")!.peso).toBe(-2);
    expect(s.find((x) => x.nome === "Tricky")!.peso).toBe(1);
    expect(sementes({ ...vazio, estilos: { jazz: 1 } }).length).toBe(5);
  });

  it("quem é parecido com vários sobe; com quem ele não gosta, desce; e diz o motivo", () => {
    const c = votar([
      { semente: { nome: "Portishead", peso: 2 }, peso: 2, parecidos: [art("Lamb"), art("Morcheeba")] },
      { semente: { nome: "Tricky", peso: 2 }, peso: 2, parecidos: [art("Morcheeba"), art("Goldie")] },
      { semente: { nome: "Anitta", peso: -2 }, peso: -2, parecidos: [art("Goldie"), art("Ludmilla")] },
    ], vazio);
    expect(c[0].artista.nome).toBe("Morcheeba");
    expect(c[0].porque.sort()).toEqual(["Portishead", "Tricky"]);
    expect(c.map((x) => x.artista.nome)).not.toContain("Ludmilla");
    expect(c.map((x) => x.artista.nome)).not.toContain("Goldie");
    expect(motivoDe(["A", "B"], false)).toBe("porque você gosta de A e B");
  });

  it("o momento puxa os estilos certos", () => {
    const s = { nome: "Metallica", peso: 2, estilo: "metal" };
    expect(pesoNoMomento(s, "treino")).toBeGreaterThan(2);
    expect(pesoNoMomento(s, "noite")).toBeLessThan(1);
    expect(pesoNoMomento(s, "geral")).toBe(2);
  });

  it("ouvir quase toda conta a favor; largar cedo, contra", () => {
    expect(leituraDaFaixa(200_000, 240_000)).toBe("ok");
    expect(leituraDaFaixa(20_000, 240_000)).toBe("pulou");
    expect(leituraDaFaixa(120_000, 240_000)).toBe(null);
    expect(leituraDaFaixa(5_000, 10_000)).toBe(null);
  });

  it("só sugere com o bastante, sorteia igual com a mesma semente", () => {
    expect(temGostoBastante(vazio)).toBe(false);
    expect(temGostoBastante({ ...vazio, estilos: { jazz: 1 } })).toBe(true);
    expect(sorteio("a")()).toBe(sorteio("a")());
    expect(sorteio("a")()).not.toBe(sorteio("b")());
  });

  it("o catálogo tem dezenas de estilos e centenas de artistas, sem id repetido", () => {
    expect(ESTILOS.length).toBeGreaterThanOrEqual(36);
    expect(new Set(ESTILOS.map((e) => e.id)).size).toBe(ESTILOS.length);
    expect(ESTILOS.reduce((n, e) => n + e.artistas.length, 0)).toBeGreaterThan(330);
  });

  it("da Deezer só entra endereço dela, e música tocável", () => {
    expect(urlDaDeezer("https://cdn-images.dzcdn.net/x.jpg")).toBe("https://cdn-images.dzcdn.net/x.jpg");
    expect(urlDaDeezer("https://mal.com/dzcdn.net/x.jpg")).toBe(null);
    expect(lerMusica({ id: 1, title: "x", artist: { name: "y", id: 2 }, readable: false })).toBe(null);
  });
});
