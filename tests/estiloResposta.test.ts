import { describe, expect, it } from "vitest";
import { blocoDeInstrucoes, estiloValido, maxTokensDaConversa, paraFala, regraDoAgente, regrasDaConversa } from "../src/services/estiloResposta";

describe("estilo de resposta (blocos 130 e 134)", () => {
  it("voz continua curta e sem markdown; texto libera markdown e tamanho", () => {
    expect(regrasDaConversa("voz", "equilibrado")).toMatch(/LIDA EM VOZ ALTA[\s\S]*1 a 3 frases[\s\S]*Nada de markdown/);
    expect(regrasDaConversa("texto", "equilibrado")).toMatch(/ESCRITA no chat[\s\S]*markdown/);
    expect(regrasDaConversa("texto", "direto")).toMatch(/curto/);
    expect(regrasDaConversa("texto", "detalhado")).toMatch(/estender/);
    expect(regraDoAgente("voz")).toMatch(/sem markdown/);
    expect(regraDoAgente("texto")).toMatch(/markdown funciona/);
  });

  it("tetos de tokens: voz baixo, texto alto", () => {
    expect(maxTokensDaConversa("voz", "equilibrado")).toBe(300);
    expect(maxTokensDaConversa("texto", "equilibrado")).toBeGreaterThanOrEqual(1500);
    expect(maxTokensDaConversa("texto", "direto")).toBeLessThan(maxTokensDaConversa("texto", "detalhado"));
  });

  it("estilo inválido vira equilibrado; instruções vazias não entram; longas são cortadas", () => {
    expect(estiloValido("xyz")).toBe("equilibrado");
    expect(estiloValido("direto")).toBe("direto");
    expect(blocoDeInstrucoes("  ")).toBe("");
    expect(blocoDeInstrucoes("me chame de chefe")).toMatch(/COMO O USUÁRIO QUER[\s\S]*me chame de chefe/);
    expect(blocoDeInstrucoes("a".repeat(5000)).length).toBeLessThan(1700);
  });

  it("paraFala: curto passa inteiro; longo fala o começo e avisa da tela; código não é lido", () => {
    expect(paraFala("Tudo certo.")).toBe("Tudo certo.");
    const longo = "Primeira frase explicando. Segunda frase com detalhe. " + "Mais texto que não cabe. ".repeat(30);
    const f = paraFala(longo, 80);
    expect(f.startsWith("Primeira frase explicando.")).toBe(true);
    expect(f.endsWith("O resto está na tela.")).toBe(true);
    expect(f.length).toBeLessThan(140);
    expect(paraFala("Veja:\n```js\nconst x = 1;\n```\nPronto.")).not.toMatch(/const/);
  });
});

describe("pronúncia do nome (02/10)", async () => {
  const { cleanTextForSpeech } = await import("../src/services/tts");
  it("Ely é lido Éli; ELYSIUM e outras palavras não mudam", () => {
    expect(cleanTextForSpeech("Oi, eu sou a Ely do ELYSIUM.")).toBe("Oi, eu sou a Éli do ELYSIUM.");
    expect(cleanTextForSpeech("Elysium e Elyane")).toBe("Elysium e Elyane");
  });
});

describe("voz feminina (02/10)", async () => {
  const { migrarVozFeminina } = await import("../src/main/config");
  const { prosodiaDa } = await import("../src/services/tts");
  it("Antonio/Macerio salvos viram Francisca uma vez; escolha depois da marca é respeitada", () => {
    expect(migrarVozFeminina({ voice: "pt-BR-AntonioNeural" })).toEqual({ vozFemininaAplicada: true, voice: "pt-BR-FranciscaNeural" });
    expect(migrarVozFeminina({ voice: "pt-BR-MacerioMultilingualNeural" })?.voice).toBe("pt-BR-FranciscaNeural");
    expect(migrarVozFeminina({ voice: "pt-BR-ThalitaNeural" })).toEqual({ vozFemininaAplicada: true });
    expect(migrarVozFeminina({})).toEqual({ vozFemininaAplicada: true });
    expect(migrarVozFeminina({ voice: "pt-BR-AntonioNeural", vozFemininaAplicada: true })).toBeNull();
  });
  it("prosódia: feminina sem pitch baixado, masculina como antes", () => {
    expect(prosodiaDa("pt-BR-FranciscaNeural").pitch).toBe("+0%");
    expect(prosodiaDa("pt-BR-AntonioNeural").pitch).toBe("-3%");
  });
});

describe("fala por frase (02/10)", async () => {
  const { dividirEmFrases } = await import("../src/services/tts");
  it("curta inteira; longa em pedaços de frases inteiras, sem sobra minúscula", () => {
    expect(dividirEmFrases("Pronto, abri o Spotify.")).toEqual(["Pronto, abri o Spotify."]);
    expect(dividirEmFrases("   ")).toEqual([]);
    const longa = "Hoje faz 24 graus em São Paulo, com sol a tarde toda e vento fraco. " +
      "À noite esfria um pouco, chegando a 17 graus, e não deve chover. " +
      "Amanhã a previsão é parecida, só um pouco mais quente, com máxima de 27 graus no fim da tarde. " +
      "No fim de semana deve chover um pouco no sábado, mas o domingo volta a abrir. Ok.";
    const p = dividirEmFrases(longa);
    expect(p.length).toBeGreaterThan(1);
    expect(p.join(" ")).toBe(longa);
    expect(p.every(x => /[.!?]$/.test(x))).toBe(true);
    expect(p[p.length - 1]).not.toBe("Ok.");
  });
});

describe("voz baixa à noite (02/10)", async () => {
  const { ehNoite, prosodiaDa } = await import("../src/services/tts");
  it("22h–7h baixa 30%; desligado nunca baixa", () => {
    const as = (h: number) => new Date(2026, 9, 2, h, 30);
    expect(ehNoite(as(23), true)).toBe(true);
    expect(ehNoite(as(6), true)).toBe(true);
    expect(ehNoite(as(7), true)).toBe(false);
    expect(ehNoite(as(21), true)).toBe(false);
    expect(ehNoite(as(23), false)).toBe(false);
    expect(prosodiaDa("pt-BR-FranciscaNeural", true).volume).toBe("-30%");
    expect(prosodiaDa("pt-BR-FranciscaNeural", false).volume).toBe("+0%");
  });
});

describe("tema Stark (fase 16)", async () => {
  const { migrarTemaStark } = await import("../src/main/config");
  it("troca uma vez e depois respeita a escolha", () => {
    expect(migrarTemaStark({ theme: "lg" })).toEqual({ temaStarkAplicado: true, theme: "stark" });
    expect(migrarTemaStark({ theme: "lg", temaStarkAplicado: true })).toBeNull();
  });
});

describe("persona Stark (fase 16)", async () => {
  const { personaStark } = await import("../src/services/estiloResposta");
  it("leva o tratamento só quando há um", () => {
    expect(personaStark("chefe")).toMatch(/FRIDAY[\s\S]*"chefe"/);
    expect(personaStark("")).not.toMatch(/Chame-o/);
  });
});

describe("prosódia do momento e vozes (bloco 189)", async () => {
  const { prosodiaDoMomento, vozEfetiva } = await import("../src/services/tts");
  it("base de cada voz, velocidade do dono e humor em passos pequenos", () => {
    // 13/10: o tom nunca muda (pitch fora do natural soava "estranho"); a Thalita parte do natural.
    expect(prosodiaDoMomento("pt-BR-ThalitaMultilingualNeural")).toEqual({ rate: "+0%", pitch: "+0%", volume: "+0%" });
    expect(prosodiaDoMomento("pt-BR-FranciscaNeural")).toEqual({ rate: "-4%", pitch: "+0%", volume: "+0%" });
    expect(prosodiaDoMomento("pt-BR-AntonioNeural")).toEqual({ rate: "-6%", pitch: "+0%", volume: "+0%" });
    expect(prosodiaDoMomento("pt-BR-ThalitaMultilingualNeural", { velocidade: 6 }).rate).toBe("+6%");
    expect(prosodiaDoMomento("pt-BR-ThalitaMultilingualNeural", { velocidade: 99 }).rate).toBe("+10%");
    expect(prosodiaDoMomento("pt-BR-ThalitaMultilingualNeural", { humor: "apressado" }).rate).toBe("+4%");
    expect(prosodiaDoMomento("pt-BR-ThalitaMultilingualNeural", { humor: "triste" })).toEqual({ rate: "-3%", pitch: "+0%", volume: "+0%" });
    expect(prosodiaDoMomento("pt-BR-ThalitaMultilingualNeural", { noite: true })).toEqual({ rate: "-2%", pitch: "+0%", volume: "-30%" });
  });
  it("nomes de voz que não existem no Edge gratuito viram os que existem", () => {
    expect(vozEfetiva("pt-BR-ThalitaNeural")).toBe("pt-BR-ThalitaMultilingualNeural");
    expect(vozEfetiva("pt-BR-MacerioMultilingualNeural")).toBe("pt-BR-AntonioNeural");
    expect(vozEfetiva(undefined)).toBe("pt-BR-ThalitaMultilingualNeural");
    expect(vozEfetiva("pt-BR-FranciscaNeural")).toBe("pt-BR-FranciscaNeural");
  });
});
