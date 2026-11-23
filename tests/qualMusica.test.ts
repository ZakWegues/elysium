import { describe, expect, it } from "vitest";
import { lerPedido } from "../src/services/destino";
import { aprender, estadoDosGostos, lerGostos, marcarMusica } from "../src/services/gostos";
import { falaDeGosto, foiDito, guardarLista, lerDitos, listaFalada, listaRecente, pedeParecidas } from "../src/services/musicaConversa";
import { combina, COMBINA_MINIMO, corrigeMusica, ehReferencia, escolherDaLista, lerMusicas, melhorFaixa } from "../src/services/qualMusica";
import { opcoesDaResposta } from "../src/services/respostasRapidas";

const f = (track: string, artist: string) => ({ track, artist });

describe("a música combina com o pedido (23/11)", () => {
  it("recusa o que não tem relação", () => {
    expect(melhorFaixa("Roll It System of a Down", [f("Weekend (feat. Miguel)", "Mac Miller, Miguel"), f("Toxicity", "System Of A Down")])).toBe(null);
    expect(melhorFaixa("a que você achar que for mais parecida", [f("P.I.T.T.Y. (Parecendo Uma Cafetina)", "NandaTsunami")])).toBe(null);
    expect(melhorFaixa("ela", [f("Esse Tal De Roque Enrow - Ao Vivo", "Rita Lee")])).toBe(null);
  });
  it("aceita nome certo, com erro de letra, só o artista e versões", () => {
    expect(melhorFaixa("Angel Massive Attack", [f("Angels", "Robbie Williams"), f("Angel", "Massive Attack")])?.artist).toBe("Massive Attack");
    expect(melhorFaixa("Roulete do System of a Down", [f("Aerials", "System Of A Down"), f("Roulette", "System Of A Down")])?.track).toBe("Roulette");
    expect(combina("Lies La Bonita", f("La Isla Bonita", "Madonna"))).toBeGreaterThanOrEqual(COMBINA_MINIMO);
    expect(combina("toxicity", f("Toxicity - Remastered", "System Of A Down"))).toBe(1);
    expect(combina("System of a Down", f("Chop Suey!", "System Of A Down"))).toBeGreaterThanOrEqual(COMBINA_MINIMO);
  });
  it("sabe quando o pedido aponta para a conversa", () => {
    for (const t of ["ela", "essa", "a que você achar que for mais parecida", "a segunda", "todas", "as três primeiras", "essa música", "a mais parecida", "uma dessas", "aquela que eu te falei"]) expect(ehReferencia(t), t).toBe(true);
    for (const t of ["Esse Tal de Roque Enrow", "Ela Partiu", "Aquele Abraço", "Angel Massive Attack", "Todo Carnaval Tem Seu Fim", "Uma Brasileira", "As Rosas Não Falam"]) expect(ehReferencia(t), t).toBe(false);
    expect(lerPedido("Eu quero que você toque ela no meu PC agora.")).toMatchObject({ pedido: { tipo: "tocar", busca: "ela", referencia: true }, dito: "pc" });
    expect(lerPedido("Bota pra tocar aí a que você achar que for mais parecida no meu Spotify no PC, fazendo favor.")).toMatchObject({ pedido: { tipo: "tocar", app: "spotify", referencia: true }, dito: "pc" });
    expect(lerPedido("toca todas no PC")).toMatchObject({ pedido: { referencia: true }, dito: "pc" });
    expect((lerPedido("Toca a música Roll It do System of a Down")?.pedido as { referencia?: boolean }).referencia).toBe(undefined);
  });
  it("escolhe da última lista", () => {
    const l = [{ titulo: "Roulette", artista: "System Of A Down" }, { titulo: "Nutshell", artista: "Alice In Chains" }, { titulo: "Like a Stone", artista: "Audioslave" }];
    expect(escolherDaLista("a segunda", l)).toEqual([l[1]]);
    expect(escolherDaLista("a última", l)).toEqual([l[2]]);
    expect(escolherDaLista("todas", l)).toEqual(l);
    expect(escolherDaLista("as duas primeiras", l)).toEqual(l.slice(0, 2));
    expect(escolherDaLista("a do Audioslave", l)).toEqual([l[2]]);
    expect(escolherDaLista("a que você achar que for mais parecida", l)).toEqual([l[0]]);
    expect(escolherDaLista("a quinta", l)).toBe(null);
    expect(escolherDaLista("Roll It do System of a Down", l)).toBe(null);
    expect(escolherDaLista("ela", l)).toBe(null);
    guardarLista(l.map((m, i) => ({ ...m, id: i + 1, capa: null, motivo: "" })), 1000);
    expect(listaRecente(2000).length).toBe(3);
    expect(listaRecente(1000 + 31 * 60_000)).toEqual([]);
  });
  it("percebe a correção", () => {
    expect(corrigeMusica("Não, eu tô falando a música Roleta em inglês, do System of a Down.")).toBe(true);
    expect(corrigeMusica("Nada a ver, eu tô falando a outra lá")).toBe(true);
    expect(corrigeMusica("não, obrigado")).toBe(false);
    expect(corrigeMusica("que horas são")).toBe(false);
  });
});

describe("músicas parecidas e gosto pela fala (23/11)", () => {
  it("percebe o pedido de sugestão", () => {
    for (const t of ["quero ouvir algumas músicas do System of A Down que sejam parecidas com Lonely Day", "me recomenda umas músicas tipo Deftones", "acha músicas parecidas com Angel", "faz uma listinha de músicas parecidas com essa", "me indica umas bandas no estilo de Portishead"]) expect(pedeParecidas(t), t).toBe(true);
    for (const t of ["toca uma música", "qual a letra dessa música", "me recomenda um filme com música boa", "põe leite na lista", "quem canta essa música parecida", "que música é essa"]) expect(pedeParecidas(t), t).toBe(false);
  });
  it("só chama o modelo quando há gosto musical na fala", () => {
    expect(falaDeGosto("eu amo a banda Deftones")).toBe(true);
    expect(falaDeGosto("não suporto sertanejo")).toBe(true);
    expect(falaDeGosto("gosto de pizza")).toBe(false);
    expect(falaDeGosto("toca a música Angel")).toBe(false);
  });
  it("lê o JSON do modelo e fala a lista", () => {
    const j = '```json {"musicas":[{"titulo":"Roulette","artista":"System of a Down","porque":"acústica"},{"titulo":"roulette","artista":"system of a down"},{"x":1}],"gosta":[{"tipo":"artista","nome":"Deftones"},{"nome":""}]} ```';
    expect(lerMusicas(j).map((m) => m.titulo)).toEqual(["Roulette"]);
    expect(lerDitos(j, "gosta")).toEqual([{ tipo: "artista", nome: "Deftones", artista: "" }]);
    expect(lerMusicas("nada")).toEqual([]);
    expect(listaFalada([{ titulo: "Roulette", artista: "SOAD" }, { titulo: "Nutshell", artista: "AIC" }, { titulo: "Spiders", artista: "SOAD" }])).toBe("Roulette e Spiders, de SOAD; Nutshell, de AIC");
  });
  it("só anota o que foi dito", () => {
    const t = "músicas parecidas com Loneliest Day do System of Fade Down";
    expect(foiDito({ nome: "Lonely Day", artista: "System of a Down" }, t)).toBe(true);
    expect(foiDito({ nome: "Duality", artista: "Slipknot" }, t)).toBe(false);
  });
  it("guarda o aprendido uma vez, e a resposta à mão apaga", () => {
    const m = { tipo: "musica" as const, nome: "Lonely Day", artista: "System Of A Down", id: 77 };
    expect(aprender(m, 1)).toMatchObject({ nome: "Lonely Day", valor: 1 });
    expect(aprender(m, 1)).toBe(null);
    expect(lerGostos().musicas[77].valor).toBe(1);
    expect(estadoDosGostos().aprendidos.length).toBe(1);
    marcarMusica(77, "Lonely Day", "System Of A Down", null);
    expect(estadoDosGostos().aprendidos).toEqual([]);
    expect(lerGostos().musicas[77]).toBe(undefined);
  });
  it("as escolhas da frase anterior viram botões", () => {
    expect(opcoesDaResposta("Então, do System, as que eu falei foram Lonely Day, Streamline, Lost in Hollywood e Aerials. Qual delas você quer escutar primeiro?", ["pode fazer"]))
      .toMatchObject({ pergunta: true, opcoes: ["Lonely Day", "Streamline", "Lost in Hollywood", "Aerials"], prontas: [] });
  });
});
