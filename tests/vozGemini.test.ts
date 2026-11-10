import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => process.env.TEMP ?? "." } }));
vi.mock("../src/main/config", () => ({ getGeminiKey: () => "chave-de-teste" }));
const { audioDaInteracao, audioDoGenerate, duracaoDoWav, estiloDaFala, pcmParaWav, sintetizarVozGemini, vozGeminiValida } = await import("../src/services/vozGemini");
const { diaDaCota, limiteDo429, tipoDo429, usoNoLogDoHermes } = await import("../src/services/cotaGemini");

const pcm = Buffer.alloc(48_000); // 1 s de silêncio a 24 kHz, 16 bits
const wavB64 = pcmParaWav(pcm).toString("base64");

describe("voz do Gemini (26/10)", () => {
  it("WAV: cabeçalho certo, duração pelo tamanho; PCM cru vira WAV", () => {
    const wav = pcmParaWav(pcm);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(duracaoDoWav(wav)).toBe(1000);
    expect(audioDaInteracao({ steps: [{ type: "model_output", content: [{ type: "audio", data: pcm.toString("base64") }] }] })?.subarray(0, 4).toString()).toBe("RIFF");
    expect(audioDaInteracao({ output_audio: { data: wavB64 } })?.length).toBe(wav.length);
    expect(audioDoGenerate({ candidates: [{ content: { parts: [{ inlineData: { data: pcm.toString("base64") } }] } }] })?.length).toBe(wav.length);
    expect(audioDaInteracao({})).toBeNull();
  });

  it("tom pelo contexto, sempre com sotaque do Brasil; voz desconhecida vira a Kore", () => {
    expect(estiloDaFala()).toMatch(/Brazilian Portuguese/);
    expect(estiloDaFala({ noite: true })).toMatch(/calm, soft/);
    expect(estiloDaFala({ humor: "apressado" })).toMatch(/faster/);
    expect(estiloDaFala({ humor: "cansado" })).toMatch(/gentle/);
    expect(vozGeminiValida("Sulafat")).toBe("Sulafat");
    expect(vozGeminiValida("Inventada")).toBe("Kore");
  });

  it("interações primeiro; 404 → generateContent; o tom vai em speech_metadata, nunca no texto", async () => {
    const urls: string[] = [];
    const corpos: unknown[] = [];
    const busca = async (url: string, init?: RequestInit) => {
      urls.push(url); corpos.push(JSON.parse(String(init?.body)));
      if (url.endsWith("/interactions")) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: pcm.toString("base64") } }] } }] }), { status: 200 });
    };
    const r = await sintetizarVozGemini("Oi!", "Kore", "calm", { busca, chave: "k" });
    expect(r?.modelo).toBe("gemini-3.8-flash-lite-tts");
    expect(urls[0]).toMatch(/\/interactions$/);
    expect(urls[1]).toMatch(/gemini-3\.8-flash-lite-tts:generateContent$/);
    const c0 = corpos[0] as { input: { content: { text: string; annotations: { style: string }[] }[] }[] };
    expect(c0.input[0].content[0].text).toBe("Oi!");
    expect(c0.input[0].content[0].annotations[0].style).toBe("calm");
  });
});

describe("cota do Gemini (26/10)", () => {
  it("o dia vira à meia-noite do Pacífico", () => {
    expect(diaDaCota(new Date("2026-10-26T06:59:00Z"))).toBe("2026-10-25");
    expect(diaDaCota(new Date("2026-10-26T07:01:00Z"))).toBe("2026-10-26");
  });

  it("aprende o limite diário do 429", () => {
    const corpo = JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_requests_per_model_per_day", quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "100" }] }] } });
    expect(limiteDo429(corpo)).toBe(100);
    expect(limiteDo429("sem json")).toBeNull();
  });

  it("429 por minuto não é a cota do dia: só uma pausa, com o tempo do RetryInfo", () => {
    const porMinuto = JSON.stringify({ error: { code: 429, details: [
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", quotaValue: "10" }] },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "37s" }] } });
    expect(tipoDo429(porMinuto)).toEqual({ porDia: false, esperaMs: 37_000 });
    const porDia = JSON.stringify({ error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "20" }] }] } });
    expect(tipoDo429(porDia).porDia).toBe(true);
    expect(tipoDo429("quota")).toEqual({ porDia: false, esperaMs: null });
  });

  it("conta as chamadas do Hermes ao Gemini do dia, no log dele", () => {
    const log = [
      "2026-10-25 23:00:00,000 INFO x: API call #1: model=gemini-3.5-flash-lite provider=gemini in=1",
      "2026-10-26 08:00:00,000 INFO x: API call #2: model=gemini-3.5-flash-lite provider=gemini in=1",
      "2026-10-26 08:01:00,000 INFO x: API call #3: model=gemini-3.5-flash-lite provider=gemini in=1",
      "2026-10-26 08:02:00,000 INFO x: API call #4: model=nvidia/x provider=openrouter in=1",
      "2026-10-26 08:03:00,000 WARNING x: API call failed error_type=RateLimitError provider=gemini model=gemini-3.6-flash 429 RESOURCE_EXHAUSTED",
    ].join("\n");
    const r = usoNoLogDoHermes(log, new Date("2026-10-26T05:00:00"));
    expect(r.uso).toEqual({ "gemini-3.5-flash-lite": 2 });
    expect(r.esgotados).toEqual(["gemini-3.6-flash"]);
  });
});
