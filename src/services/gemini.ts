import { getGeminiKey } from "../main/config";

/**
 * Gemini pela chave do Google AI Studio do dono (24/10). Rápido e de cota grande: escreve as telas
 * (os DADOS das telas prontas, em JSON com esquema, e o gerador livre) e é o modelo do Hermes.
 *
 * O modelo não é fixo: a lista da API diz quais a chave enxerga, e fica o **Flash** estável mais
 * novo (econômico e rápido), com o **Flash-Lite** de reserva. 404/429/5xx num modelo → o próximo.
 * A chave nunca vai para log nem para URL (vai no cabeçalho `x-goog-api-key`).
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const VALIDADE_LISTA_MS = 6 * 60 * 60_000;
const RESERVA = { flash: ["gemini-2.5-flash"], lite: ["gemini-2.5-flash-lite"] };

export type Busca = (url: string, init?: RequestInit) => Promise<Response>;
export type Modelos = { flash: string[]; lite: string[] };

/** "gemini-2.5-flash" → [2, 5]; nomes com sufixo (preview, exp, imagem, tts, data) não entram. Pura. */
function versao(nome: string, tipo: "flash" | "lite"): number[] | null {
  const re = tipo === "flash" ? /^gemini-(\d+(?:\.\d+)?)-flash$/ : /^gemini-(\d+(?:\.\d+)?)-flash-lite$/;
  const m = re.exec(nome);
  return m ? m[1].split(".").map(Number) : null;
}

/** Da lista da API: os Flash e os Flash-Lite estáveis, do mais novo para o mais velho. Pura. */
export function escolherModelos(nomes: string[]): Modelos {
  const ordenar = (tipo: "flash" | "lite") => nomes
    .map((n) => n.replace(/^models\//, ""))
    .map((n) => ({ n, v: versao(n, tipo) }))
    .filter((x): x is { n: string; v: number[] } => x.v !== null)
    .sort((a, b) => (b.v[0] - a.v[0]) || ((b.v[1] ?? 0) - (a.v[1] ?? 0)))
    .map((x) => x.n);
  const flash = ordenar("flash"), lite = ordenar("lite");
  return { flash: flash.length ? flash : RESERVA.flash, lite: lite.length ? lite : RESERVA.lite };
}

let lista: { em: number; chave: string; modelos: Modelos } | null = null;

/** Os modelos que a chave enxerga (cache de 6 h). Sem rede: os de reserva. */
export async function modelosGemini(chave: string, busca: Busca = fetch): Promise<Modelos> {
  if (lista && lista.chave === chave && Date.now() - lista.em < VALIDADE_LISTA_MS) return lista.modelos;
  try {
    const r = await busca(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": chave }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json() as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
    const nomes = (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name ?? "");
    const modelos = escolherModelos(nomes);
    lista = { em: Date.now(), chave, modelos };
    return modelos;
  } catch (e) {
    console.warn("[gemini] lista de modelos indisponível:", e instanceof Error ? e.message : e);
    return RESERVA;
  }
}

export type Mensagem = { papel: "user" | "model"; texto: string };

export type PedidoGemini = {
  mensagens: Mensagem[];
  sistema?: string;
  /** Esquema (subconjunto OpenAPI) → a resposta vem em JSON nesse formato. */
  esquema?: object;
  temperatura?: number;
  maxTokens?: number;
  prazoMs?: number;
  /** Tarefa simples: começa pelo Flash-Lite. */
  leve?: boolean;
  sinal?: AbortSignal;
};

/** Gera. `null` = sem chave ou nenhum modelo respondeu. */
export async function gerarGemini(p: PedidoGemini, busca: Busca = fetch, chave = getGeminiKey()): Promise<{ texto: string; modelo: string } | null> {
  if (!chave) return null;
  const { flash, lite } = await modelosGemini(chave, busca);
  const ordem = (p.leve ? [...lite, ...flash] : [...flash, ...lite]).slice(0, 3);
  for (const modelo of ordem) {
    if (p.sinal?.aborted) return null;
    const corpo = {
      ...(p.sistema ? { systemInstruction: { parts: [{ text: p.sistema }] } } : {}),
      contents: p.mensagens.map((m) => ({ role: m.papel, parts: [{ text: m.texto }] })),
      generationConfig: {
        temperature: p.temperatura ?? 0.3,
        maxOutputTokens: p.maxTokens ?? 8192,
        ...(p.esquema ? { responseMimeType: "application/json", responseSchema: p.esquema } : {}),
        // 2.5: sem "pensar" (é o que dá a velocidade; as tarefas aqui não precisam).
        ...(/^gemini-2\.5-flash/.test(modelo) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    };
    const sinais = [AbortSignal.timeout(p.prazoMs ?? 45_000), ...(p.sinal ? [p.sinal] : [])];
    try {
      const r = await busca(`${BASE}/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
        signal: AbortSignal.any(sinais),
      });
      if (!r.ok) {
        console.warn(`[gemini] ${modelo} respondeu ${r.status}; tentando o próximo`);
        continue;
      }
      const j = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
      const c = j.candidates?.[0];
      const texto = (c?.content?.parts ?? []).map((x) => x.text ?? "").join("").trim();
      if (!texto) { console.warn(`[gemini] ${modelo} sem texto (${c?.finishReason ?? "?"})`); continue; }
      return { texto, modelo };
    } catch (e) {
      if (p.sinal?.aborted) return null;
      console.warn(`[gemini] ${modelo} falhou:`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}

/** Só para os testes. */
export function zerarListaGemini(): void {
  lista = null;
}
