import { z } from "zod";
import { getApiKey } from "../main/config";
import { gerarGemini } from "./gemini";
import { semAcento } from "./texto";

/**
 * Desenho rápido da Ely flutuante (12/11). O jeito do Roamies (a ferramenta `draw` dele): o
 * modelo devolve um JSON pequeno de CARTÕES TIPADOS — fluxo, barras, linha do tempo, diagrama… —
 * e quem desenha é o app (`dashboard/js/flutuante.js`). Nada de tela inteira nem de SVG livre:
 * sai em poucos segundos, sempre com a cara do ELYSIUM e sem nada executável vindo do modelo.
 *
 * Roda em paralelo com a resposta falada, a partir do pedido transcrito.
 */

// Passou do limite: corta em vez de recusar (o modelo às vezes escreve uma palavra a mais).
const txt = (max: number) => z.string().trim().min(1).transform((s) => s.slice(0, max));
const opc = (max: number) => z.string().trim().transform((s) => s.slice(0, max)).optional();
const lista = <T extends z.ZodTypeAny>(item: T, min: number, max: number) => z.array(item).min(min).transform((a) => a.slice(0, max));
const TONS = ["a", "b", "ambar", "coral", "lilas", "branco", "preto"] as const;
const tom = z.enum(TONS).optional().catch(undefined);

const cartao = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("cartao"), titulo: opc(70), texto: opc(420), itens: lista(txt(110), 0, 6).optional() }),
  z.object({
    tipo: z.literal("fluxo"), titulo: opc(70),
    nos: lista(z.object({ id: txt(20), texto: txt(48), forma: z.enum(["caixa", "redondo", "losango"]).optional().catch(undefined), tom }), 2, 8),
    ligacoes: lista(z.object({ de: txt(20), para: txt(20), rotulo: opc(30), andando: z.boolean().optional() }), 0, 10).default([]),
  }),
  z.object({ tipo: z.literal("barras"), titulo: opc(70), unidade: opc(12), itens: lista(z.object({ rotulo: txt(30), valor: z.number().finite(), tom }), 2, 8) }),
  z.object({ tipo: z.literal("linhaDoTempo"), titulo: opc(70), eventos: lista(z.object({ quando: txt(24), texto: txt(110) }), 2, 8) }),
  z.object({ tipo: z.literal("tabela"), titulo: opc(70), colunas: lista(txt(28), 2, 4), linhas: lista(lista(z.string().trim().transform((c) => c.slice(0, 40)), 1, 4), 1, 7) }),
  z.object({ tipo: z.literal("passos"), titulo: opc(70), itens: lista(z.object({ titulo: txt(60), nota: opc(140) }), 2, 6) }),
  z.object({
    tipo: z.literal("diagrama"), titulo: opc(70), legenda: opc(200),
    partes: lista(z.object({
      forma: z.enum(["circulo", "anel", "ponto", "seta"]),
      x: z.number().finite().min(-1.2).max(1.2).catch(0), y: z.number().finite().min(-1.2).max(1.2).catch(0),
      r: z.number().finite().min(0.02).max(1.2).catch(0.2),
      /** Só a seta: para onde aponta. */
      x2: z.number().finite().min(-1.2).max(1.2).optional().catch(undefined), y2: z.number().finite().min(-1.2).max(1.2).optional().catch(undefined),
      tom, rotulo: opc(34),
      movimento: z.enum(["orbita", "pulso", "gira"]).optional().catch(undefined),
    }), 1, 14),
  }),
]);

export type Cartao = z.infer<typeof cartao>;

/**
 * Confere o que o modelo devolveu: cartão de tipo desconhecido ou incompleto sai, o resto passa
 * cortado nos limites. No fluxo, ligação para nó que não existe também sai. Pura.
 */
export function validarCartoes(bruto: unknown): Cartao[] {
  const lista = Array.isArray(bruto) ? bruto : Array.isArray((bruto as { cartoes?: unknown })?.cartoes) ? (bruto as { cartoes: unknown[] }).cartoes : [];
  const ok: Cartao[] = [];
  for (const c of lista.slice(0, 3)) {
    const r = cartao.safeParse(c);
    if (!r.success) continue;
    const v = r.data;
    if (v.tipo === "fluxo") {
      const ids = new Set(v.nos.map((n) => n.id));
      v.ligacoes = v.ligacoes.filter((l) => ids.has(l.de) && ids.has(l.para));
      // 12/11, medido: o modelo muitas vezes manda os nós em ordem e nenhuma ligação. Na ordem
      // em que vieram, com os pontinhos andando (é um processo).
      if (!v.ligacoes.length) v.ligacoes = v.nos.slice(1).map((n, i) => ({ de: v.nos[i].id, para: n.id, andando: true }));
    }
    if (v.tipo === "cartao" && !v.titulo && !v.texto && !v.itens?.length) continue;
    ok.push(v);
    if (ok.length === 2) break;
  }
  return ok;
}

/** "Me explica…", "como funciona…", "desenha…": a Ely flutuante desenha junto com a fala. Puro. */
export function pediuDesenho(texto: string): boolean {
  const t = semAcento(texto).toLowerCase();
  return /\b(explica|explique|explicar|me ensina|ensina|como funciona|como e que funciona|desenha|desenhe|ilustra|ilustre|mostra como|me mostra|o que e|o que sao|qual a diferenca|diferenca entre|passo a passo|como se faz|como fazer)\b/.test(t);
}

const SISTEMA = `Você desenha explicações visuais curtas para a assistente Ely, que fala a explicação em voz ao mesmo tempo.
Responda SÓ JSON: {"cartoes":[...]}. Quase sempre UM cartão; dois só se o segundo mostrar outra coisa (nunca um "cartao" que só repete a explicação: ela já é falada). Textos em português do Brasil, POUCAS palavras (rótulo: até 4; texto: uma frase).
Cada cartão: {"tipo": "...", "titulo": "...", "<tipo>": {o conteúdo daquele tipo}} — preencha SÓ o objeto do tipo escolhido.
- diagrama: {legenda, partes:[{forma:"circulo"|"anel"|"ponto"|"seta", x, y, r, x2, y2, tom, rotulo, movimento:"orbita"|"pulso"|"gira"}]} — coordenadas em NÚMEROS INTEIROS de -100 a 100 (0,0 = centro, y para cima); r = raio inteiro de 3 a 100; a seta vai de (x,y) a (x2,y2). "orbita" gira a parte em volta do centro (planeta, elétron, matéria do disco de acreção), "pulso" respira, "gira" gira no lugar. Para objetos e fenômenos: buraco negro (ponto = singularidade, anel = horizonte de eventos, anel maior que gira = disco de acreção, pontos em órbita = matéria caindo), átomo, sistema solar, célula. De 3 a 10 partes.
- fluxo: {nos:[{id, texto, forma:"caixa"|"redondo"|"losango", tom}], ligacoes:[{de, para, rotulo, andando}]} — processo, causa e efeito, decisão (losango = pergunta). andando:true = pontinhos correndo (o que viaja: sangue, energia, dados). Até 8 nós.
- barras: {unidade, itens:[{rotulo, valor, tom}]} — comparar quantidades (só números reais e conhecidos).
- linhaDoTempo: {eventos:[{quando, texto}]} — datas e etapas históricas.
- tabela: {colunas, linhas} — comparar lado a lado; a 1ª coluna nomeia a linha; "sim"/"não" viram ✓/✗.
- passos: {itens:[{titulo, nota}]} — como fazer algo.
- cartao: {texto, itens} — o resumo, quando nada acima cabe.
tom: "a" (cor principal do tema), "b" (segunda cor), "ambar", "coral", "lilas", "branco", "preto".
No diagrama, TODA parte importante tem rótulo, e o desenho ocupa o espaço (use o quadro de -100 a 100 todo).
Exemplo (buraco negro): {"cartoes":[{"tipo":"diagrama","titulo":"Buraco negro","diagrama":{"legenda":"Nada que passa do horizonte volta, nem a luz.","partes":[{"forma":"anel","x":0,"y":0,"r":85,"tom":"ambar","rotulo":"Disco de acreção","movimento":"gira"},{"forma":"anel","x":0,"y":0,"r":40,"tom":"a","rotulo":"Horizonte de eventos"},{"forma":"circulo","x":0,"y":0,"r":30,"tom":"preto"},{"forma":"ponto","x":0,"y":0,"r":4,"tom":"coral","rotulo":"Singularidade"},{"forma":"ponto","x":70,"y":30,"r":5,"tom":"ambar","rotulo":"Gás caindo","movimento":"orbita"},{"forma":"seta","x":-95,"y":60,"x2":-48,"y2":18,"tom":"b","rotulo":"Luz capturada"}]}}]}
Nunca invente números: sem número confiável, não use barras. Nunca repita frases.`;

const S = { type: "STRING" }, N = { type: "NUMBER" }, I = { type: "INTEGER" };
/**
 * Objeto do esquema. `obrig`: os campos que o modelo TEM de mandar, na ordem em que deve escrever
 * (12/11, medido: sem isso o Flash-Lite mandava só forma, x e y — sem raio, rótulo nem cor).
 */
const obj = (properties: Record<string, unknown>, obrig: string[] = []) => ({
  type: "OBJECT", properties,
  ...(obrig.length ? { required: obrig, propertyOrdering: [...obrig, ...Object.keys(properties).filter((k) => !obrig.includes(k))] } : {}),
});
const arr = (items: unknown) => ({ type: "ARRAY", items });
/**
 * Um objeto por tipo, cada um só com os campos dele (12/11, medido): com todos os campos soltos no
 * mesmo nível, o Flash-Lite enchia um campo que não era do tipo (a "unidade" de um diagrama) com a
 * mesma frase repetida até o fim dos tokens. E as coordenadas do diagrama são INTEIRAS (−100..100):
 * em número decimal ele às vezes não parava mais de escrever casas ("0.25555555…") e o JSON quebrava.
 */
const ESQUEMA = obj({
  cartoes: arr({
    ...obj({
      tipo: { type: "STRING", enum: ["diagrama", "fluxo", "barras", "linhaDoTempo", "tabela", "passos", "cartao"] },
      titulo: S,
      diagrama: obj({ legenda: S, partes: arr(obj({ forma: { type: "STRING", enum: ["circulo", "anel", "ponto", "seta"] }, rotulo: S, x: I, y: I, r: I, tom: S, movimento: { type: "STRING", enum: ["orbita", "pulso", "gira", "nenhum"] }, x2: I, y2: I }, ["forma", "rotulo", "x", "y", "r", "tom", "movimento"])) }, ["partes", "legenda"]),
      fluxo: obj({ nos: arr(obj({ id: S, texto: S, forma: S, tom: S }, ["id", "texto", "forma", "tom"])), ligacoes: arr(obj({ de: S, para: S, rotulo: S, andando: { type: "BOOLEAN" } }, ["de", "para", "andando"])) }, ["nos", "ligacoes"]),
      barras: obj({ unidade: S, itens: arr(obj({ rotulo: S, valor: N, tom: S }, ["rotulo", "valor"])) }, ["itens"]),
      linhaDoTempo: obj({ eventos: arr(obj({ quando: S, texto: S }, ["quando", "texto"])) }, ["eventos"]),
      tabela: obj({ colunas: arr(S), linhas: arr(arr(S)) }, ["colunas", "linhas"]),
      passos: obj({ itens: arr(obj({ titulo: S, nota: S }, ["titulo", "nota"])) }, ["itens"]),
      cartao: obj({ texto: S, itens: arr(S) }),
    }),
    required: ["tipo", "titulo"],
  }),
});

/**
 * O cartão vem como {tipo, titulo, <tipo>: {conteúdo}} (o formato do esquema); o desenho quer tudo
 * no mesmo nível. Aceita também o formato já achatado. Pura.
 */
export function achatar(c: unknown): unknown {
  if (!c || typeof c !== "object") return c;
  const o = c as Record<string, unknown>;
  const dentro = typeof o.tipo === "string" ? o[o.tipo] : undefined;
  if (!dentro || typeof dentro !== "object" || Array.isArray(dentro)) return o;
  const d: Record<string, unknown> = { ...(dentro as Record<string, unknown>), tipo: o.tipo, ...(o.titulo !== undefined ? { titulo: o.titulo } : {}) };
  // Diagrama do esquema: inteiros de −100 a 100 → a escala de −1 a 1 do desenho.
  if (o.tipo === "diagrama" && Array.isArray(d.partes)) {
    d.partes = d.partes.map((p) => {
      if (!p || typeof p !== "object") return p;
      const q = { ...(p as Record<string, unknown>) };
      for (const k of ["x", "y", "r", "x2", "y2"]) if (typeof q[k] === "number") q[k] = (q[k] as number) / 100;
      return q;
    });
  }
  return d;
}

/** Os cartões de um texto JSON do modelo (com ou sem o invólucro {"cartoes": [...]}). Pura. */
export function cartoesDoTexto(texto: string): Cartao[] {
  let j: unknown;
  try { j = JSON.parse(texto.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { return []; }
  const lista = Array.isArray(j) ? j : (j as { cartoes?: unknown })?.cartoes;
  return validarCartoes(Array.isArray(lista) ? lista.map(achatar) : []);
}

/**
 * 12/11, medido: a Groq devolve o JSON em ~0,3–1 s (qwen3.8-27b); o Gemini grátis, com os Flash
 * esgotados (20 por dia), cai no Flash-Lite, que levava 3–11 s. Então a Groq vai primeiro, sem
 * pensar e com prazo curto; falhou ou veio vazio, o Gemini com esquema.
 */
export const MODELO_GROQ_DESENHO = "qwen/qwen3.8-27b";

async function pelaGroq(pedido: string, sinal?: AbortSignal): Promise<Cartao[]> {
  const chave = getApiKey();
  if (!chave) return [];
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO_GROQ_DESENHO,
        messages: [{ role: "system", content: SISTEMA }, { role: "user", content: pedido.slice(0, 1500) }],
        response_format: { type: "json_object" },
        reasoning_effort: "none",
        temperature: 0.3,
        max_tokens: 1400,
      }),
      signal: AbortSignal.any([AbortSignal.timeout(6000), ...(sinal ? [sinal] : [])]),
    });
    if (!r.ok) { console.warn(`[desenho] Groq respondeu ${r.status}`); return []; }
    const j = await r.json() as { choices?: { message?: { content?: string } }[] };
    return cartoesDoTexto(j.choices?.[0]?.message?.content ?? "");
  } catch (e) {
    console.warn("[desenho] Groq falhou:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Pede os cartões. `null` = sem chave, sem resposta ou nada aproveitável. */
export async function desenharRapido(pedido: string, sinal?: AbortSignal): Promise<{ cartoes: Cartao[]; ms: number; por: "groq" | "gemini" } | null> {
  const t0 = Date.now();
  const daGroq = await pelaGroq(pedido, sinal);
  if (daGroq.length) return { cartoes: daGroq, ms: Date.now() - t0, por: "groq" };
  if (sinal?.aborted) return null;
  const r = await gerarGemini({
    sistema: SISTEMA,
    mensagens: [{ papel: "user", texto: pedido.slice(0, 1500) }],
    esquema: ESQUEMA,
    temperatura: 0.3,
    // Teto curto: um desenho cabe em ~600 tokens; passou disso, é o modelo repetindo.
    maxTokens: 1400,
    prazoMs: 9000,
    pensamento: "baixo",
    sinal,
  }).catch(() => null);
  const cartoes = r ? cartoesDoTexto(r.texto) : [];
  return cartoes.length ? { cartoes, ms: Date.now() - t0, por: "gemini" } : null;
}
