import { describe, expect, it } from "vitest";
import { respostaSemSaber, viaRapida } from "../src/services/cerebroHibrido";

describe("via rápida da conversa (12/11)", () => {
  it("pergunta de conhecimento atemporal vai direto", () => {
    for (const q of ["o que é um eclipse lunar?", "por que o céu é azul?", "como funciona um buraco negro", "me explica a fotossíntese", "quem foi Santos Dumont?", "qual a diferença entre vírus e bactéria?"]) expect(viaRapida(q), q).toBe(true);
  });
  it("o que depende de hoje, da internet, do PC ou dele fica com o Hermes", () => {
    for (const q of ["qual o preço do dólar hoje?", "quem ganhou o jogo ontem?", "qual a previsão do tempo?", "o que é esse arquivo aberto?", "quanto de RAM o meu pc tem?", "o que tem na minha agenda?", "pesquisa sobre buracos negros", "abre o spotify", "oi tudo bem", "quais as notícias de 2026?", "o que é isso aqui na tela?"]) expect(viaRapida(q), q).toBe(false);
  });
  it("27/11: site, progresso ou pergunta longa qualquer vai ao Hermes (que pesquisa)", () => {
    for (const q of [
      "O port de GTA 6 está a quantos porcento pronto de acordo com o portwatch?",
      "o que é o portwatch e quanto tá o progresso do port?",
      "o que significa o status do site steamdb.info?",
      "por que o GTA 6 ainda não saiu no PC?",
      "como funciona o ranking da Steam?",
      "me fala sobre a versão nova do Windows",
    ]) expect(viaRapida(q), q).toBe(false);
  });
  it("27/11: resposta que diz não saber vai ao Hermes", () => {
    for (const r of ["Não tenho a informação atualizada do Portwatch sobre o percentual.", "Não consigo acessar sites agora.", "Não sei dizer o número exato.", "Meu conhecimento vai até 2025, então…", "Não tenho como saber isso daqui."]) expect(respostaSemSaber(r), r).toBe(true);
    for (const r of ["O céu é azul por causa do espalhamento de Rayleigh.", "Santos Dumont foi um inventor brasileiro.", "Não, a fotossíntese não precisa de oxigênio."]) expect(respostaSemSaber(r), r).toBe(false);
  });
});
