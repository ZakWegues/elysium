import { getGeminiKey } from "../main/config";
import { cotaEsgotada, registrarUsoGemini } from "./cotaGemini";

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

/**
 * 09/11: a API ainda LISTA o 2.5 Flash e o Flash-Lite, mas responde 404 neles — cada pesquisa
 * gastava duas tentativas antes de chegar num modelo vivo. 404 tira o modelo das listas por 24 h.
 */
const sumidos = new Map<string, number>();
const SUMIDO_MS = 24 * 60 * 60_000;
function marcarSumido(modelo: string): void { sumidos.set(modelo, Date.now() + SUMIDO_MS); }
function vivo(modelo: string): boolean {
  const ate = sumidos.get(modelo);
  if (ate === undefined) return true;
  if (ate > Date.now()) return false;
  sumidos.delete(modelo);
  return true;
}
/** Tira os sumidos; se não sobrar nenhum, fica a lista como está (melhor tentar que desistir). */
function semSumidos(m: Modelos): Modelos {
  const tirar = (l: string[]) => { const v = l.filter(vivo); return v.length ? v : l; };
  return { flash: tirar(m.flash), lite: tirar(m.lite) };
}

/** Os modelos que a chave enxerga (cache de 6 h). Sem rede: os de reserva. */
export async function modelosGemini(chave: string, busca: Busca = fetch): Promise<Modelos> {
  if (lista && lista.chave === chave && Date.now() - lista.em < VALIDADE_LISTA_MS) return semSumidos(lista.modelos);
  try {
    const r = await busca(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": chave }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json() as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
    const nomes = (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name ?? "");
    const modelos = escolherModelos(nomes);
    lista = { em: Date.now(), chave, modelos };
    return semSumidos(modelos);
  } catch (e) {
    console.warn("[gemini] lista de modelos indisponível:", e instanceof Error ? e.message : e);
    return RESERVA;
  }
}

/**
 * 26/10: o Flash mais novo nem sempre é o melhor — o gemini-3.8-flash estava sobrecarregado (503
 * "high demand", 109 s sem resposta). Mede os candidatos com um pedido mínimo, em paralelo, e
 * guarda a ordem por 30 min: quem responde mais rápido vai na frente; quem falhou, para o fim.
 */
let velocidade: { em: number; chave: string; ms: Map<string, number | null> } | null = null;
const VALIDADE_VELOCIDADE_MS = 30 * 60_000;

export async function medirModelosGemini(chave: string, busca: Busca = fetch): Promise<Map<string, number | null>> {
  if (velocidade && velocidade.chave === chave && Date.now() - velocidade.em < VALIDADE_VELOCIDADE_MS) return velocidade.ms;
  const { flash, lite } = await modelosGemini(chave, busca);
  const candidatos = [...flash.slice(0, 3), ...lite.slice(0, 2)];
  const medidas = await Promise.all(candidatos.map(async (modelo) => {
    // 26/10: no plano grátis os Flash têm 20 usos por dia; esgotado hoje não gasta nem um teste.
    if (cotaEsgotada(modelo)) return [modelo, null] as const;
    const t0 = Date.now();
    try {
      const r = await busca(`${BASE}/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Responda só: ok" }] }], generationConfig: { maxOutputTokens: 16 } }),
        signal: AbortSignal.timeout(12_000),
      });
      registrarUsoGemini("texto", modelo, r.status, r.ok ? "" : await r.text().catch(() => ""));
      if (r.status === 404) marcarSumido(modelo);
      return [modelo, r.ok ? Date.now() - t0 : null] as const;
    } catch { return [modelo, null] as const; }
  }));
  const ms = new Map<string, number | null>(medidas);
  velocidade = { em: Date.now(), chave, ms };
  console.log("[gemini] latência:", medidas.map(([m, t]) => `${m} ${t === null ? "falhou" : t + " ms"}`).join(", "));
  return ms;
}

/** Ordena pela velocidade medida (sem medida = mantém a posição; falhou = fim). Pura. */
export function ordenarPorVelocidade(modelos: string[], ms: Map<string, number | null> | undefined): string[] {
  if (!ms) return modelos;
  const peso = (m: string, i: number) => { const t = ms.get(m); return t === undefined ? 50_000 + i : t === null ? 100_000 + i : t; };
  return modelos.map((m, i) => ({ m, p: peso(m, i) })).sort((a, b) => a.p - b.p).map((x) => x.m);
}

/**
 * O modelo do Hermes: o Flash-Lite mais rápido que respondeu; nenhum Lite → o Flash mais rápido.
 * Medido em 26/10: no Lite cada chamada do Hermes leva 1–3 s (chat 2–5 s, pesquisa ~7 s); no
 * Flash, 3–32 s, e o 3.7/3.8 nem respondiam. As respostas do Lite saíram certas.
 */
export async function modeloDoHermes(chave: string, busca: Busca = fetch): Promise<string> {
  const { flash, lite } = await modelosGemini(chave, busca);
  const ms = await medirModelosGemini(chave, busca);
  const ok = (m: string) => typeof ms.get(m) === "number";
  return ordenarPorVelocidade(lite, ms).find(ok) ?? ordenarPorVelocidade(flash, ms).find(ok) ?? lite[0];
}

/** A ordem de tentativa: a preferência, com quem falhou na medição por último. Pura. */
export function ordemDeTentativa(preferencia: string[], ms: Map<string, number | null> | undefined): string[] {
  if (!ms) return preferencia;
  return [...preferencia.filter((m) => ms.get(m) !== null), ...preferencia.filter((m) => ms.get(m) === null)];
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
  /** 26/10: pesquisa no Google antes de responder (grounding); as fontes voltam em `fontes`. */
  buscar?: boolean;
  /** 11/11: raciocínio baixo nos modelos 3.x (as telas: mais rápido, a qualidade não muda). */
  pensamento?: "baixo";
};

export type FonteGemini = { titulo: string; url: string };

/** As fontes do grounding: o título é o site (o endereço é o redirecionador do Google). Pura. */
export function fontesDoGrounding(meta: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } | undefined, maximo = 4): FonteGemini[] {
  const fontes: FonteGemini[] = [];
  const vistos = new Set<string>();
  for (const c of meta?.groundingChunks ?? []) {
    const url = c.web?.uri, titulo = (c.web?.title ?? "").trim();
    if (!url || !/^https?:/.test(url)) continue;
    const chave = titulo || url;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    fontes.push({ titulo: titulo || "fonte", url });
    if (fontes.length >= maximo) break;
  }
  return fontes;
}

/** Gera. `null` = sem chave ou nenhum modelo respondeu. */
export async function gerarGemini(p: PedidoGemini, busca: Busca = fetch, chave = getGeminiKey()): Promise<{ texto: string; modelo: string; fontes: FonteGemini[] } | null> {
  if (!chave) return null;
  const { flash, lite } = await modelosGemini(chave, busca);
  const medido = velocidade?.chave === chave ? velocidade.ms : undefined;
  // Esgotado hoje conta como falha (vai para o fim), mesmo sem medição.
  const ms = new Map(medido ?? []);
  for (const m of [...flash, ...lite]) if (cotaEsgotada(m)) ms.set(m, null);
  const todos = ordemDeTentativa(p.leve ? [...ordenarPorVelocidade(lite, ms), ...ordenarPorVelocidade(flash, ms)] : [...ordenarPorVelocidade(flash, ms), ...ordenarPorVelocidade(lite, ms)], ms);
  // 09/11: sem cota (do dia ou numa pausa de 429) nem entra — ia para o fim, mas com três
  // tentativas no máximo ainda gastava uma ou duas antes de desistir. Todos sem cota: tenta assim mesmo.
  const comCota = todos.filter((m) => !cotaEsgotada(m));
  const ordem = (comCota.length ? comCota : todos).slice(0, 3);
  for (const modelo of ordem) {
    if (p.sinal?.aborted) return null;
    const corpo = {
      ...(p.sistema ? { systemInstruction: { parts: [{ text: p.sistema }] } } : {}),
      contents: p.mensagens.map((m) => ({ role: m.papel, parts: [{ text: m.texto }] })),
      ...(p.buscar ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: {
        temperature: p.temperatura ?? 0.3,
        maxOutputTokens: p.maxTokens ?? 8192,
        ...(p.esquema ? { responseMimeType: "application/json", responseSchema: p.esquema } : {}),
        // 2.5: sem "pensar" (é o que dá a velocidade; as tarefas aqui não precisam).
        ...(/^gemini-2\.5-flash/.test(modelo) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        // 11/11: o 3.x pensa por padrão; quem pede `pensamento: "baixo"` (as telas) corta isso.
        ...(p.pensamento === "baixo" && /^gemini-[3-9]/.test(modelo) ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
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
        registrarUsoGemini("texto", modelo, r.status, await r.text().catch(() => ""));
        if (r.status === 404) marcarSumido(modelo);
        console.warn(`[gemini] ${modelo} respondeu ${r.status}; tentando o próximo`);
        continue;
      }
      registrarUsoGemini("texto", modelo, r.status);
      const j = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string; groundingMetadata?: Parameters<typeof fontesDoGrounding>[0] }[] };
      const c = j.candidates?.[0];
      const texto = (c?.content?.parts ?? []).map((x) => x.text ?? "").join("").trim();
      if (!texto) { console.warn(`[gemini] ${modelo} sem texto (${c?.finishReason ?? "?"})`); continue; }
      return { texto, modelo, fontes: fontesDoGrounding(c?.groundingMetadata) };
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
  velocidade = null;
  sumidos.clear();
}
