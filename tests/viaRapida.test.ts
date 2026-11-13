import { describe, expect, it } from "vitest";
import { viaRapida } from "../src/services/cerebroHibrido";

describe("via rápida da conversa (12/11)", () => {
  it("pergunta de conhecimento atemporal vai direto", () => {
    for (const q of ["o que é um eclipse lunar?", "por que o céu é azul?", "como funciona um buraco negro", "me explica a fotossíntese", "quem foi Santos Dumont?", "qual a diferença entre vírus e bactéria?"]) expect(viaRapida(q), q).toBe(true);
  });
  it("o que depende de hoje, da internet, do PC ou dele fica com o Hermes", () => {
    for (const q of ["qual o preço do dólar hoje?", "quem ganhou o jogo ontem?", "qual a previsão do tempo?", "o que é esse arquivo aberto?", "quanto de RAM o meu pc tem?", "o que tem na minha agenda?", "pesquisa sobre buracos negros", "abre o spotify", "oi tudo bem", "quais as notícias de 2026?", "o que é isso aqui na tela?"]) expect(viaRapida(q), q).toBe(false);
  });
});
