import { getConfig } from "../main/config";
import { callChat } from "./llm";
import type { BrainAction } from "./brain";

/**
 * Sugestões de próxima pergunta (bloco 132) — os chips embaixo da resposta que se elogia
 * no Perplexity e no Gemini: em vez de pensar no que perguntar, um toque continua.
 *
 * Só depois de CONVERSA escrita (canal texto, sem ação no PC): depois de "pausa a música"
 * não há o que continuar, e na voz não há onde tocar. Uma chamada curta ao mesmo modelo da
 * conversa, em JSON; se ela falhar ou demorar, simplesmente não aparece chip nenhum — a
 * resposta já foi entregue antes.
 */

const PROMPT = `Você sugere as próximas perguntas que o usuário provavelmente vai querer fazer, em português do Brasil, depois da resposta abaixo.
Responda SÓ com JSON: {"sugestoes": ["...", "...", "..."]}
- Exatamente 3, cada uma com no máximo 60 caracteres, escritas como o usuário escreveria (primeira pessoa, sem "você poderia").
- Que aprofundem ou mudem de ângulo — nunca repetir a pergunta que já foi feita.
- Nada de pedir ação no PC (abrir, fechar, tocar).`;

/** Quando faz sentido sugerir: conversa (ou busca) escrita. Pura. */
export function deveSugerir(acoes: BrainAction[], canal: "voz" | "texto"): boolean {
  return canal === "texto" && acoes.length > 0 && acoes.every(a => a.action === "chat" || a.action === "web_search");
}

/** Valida o JSON do modelo: 1 a 3 frases curtas, sem repetir a pergunta. Pura. */
export function interpretarSugestoes(bruto: string, pergunta = ""): string[] {
  let j: unknown;
  try { j = JSON.parse(bruto); } catch {
    const m = /\{[\s\S]*\}/.exec(bruto);
    try { j = m ? JSON.parse(m[0]) : null; } catch { j = null; }
  }
  const lista = (j as { sugestoes?: unknown })?.sugestoes;
  if (!Array.isArray(lista)) return [];
  const base = pergunta.trim().toLowerCase();
  const vistas = new Set<string>();
  return lista
    .filter((s): s is string => typeof s === "string")
    .map(s => s.trim().replace(/\s+/g, " ").replace(/^["'“]|["'”]$/g, ""))
    .filter(s => s.length >= 4 && s.length <= 80 && s.toLowerCase() !== base)
    .filter(s => { const k = s.toLowerCase(); if (vistas.has(k)) return false; vistas.add(k); return true; })
    .slice(0, 3);
}

export async function sugerirContinuacoes(pergunta: string, resposta: string): Promise<string[]> {
  const cfg = getConfig();
  const provider = cfg.chatProvider;
  const model = provider === "ollama" ? cfg.ollamaChatModel : cfg.brainModel;
  try {
    const bruto = await callChat({
      provider, model, json: true, temperature: 0.5, maxTokens: 200, timeoutMs: 25_000,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: `PERGUNTA: ${pergunta.slice(0, 600)}\n\nRESPOSTA: ${resposta.slice(0, 2000)}` },
      ],
    });
    return interpretarSugestoes(bruto, pergunta);
  } catch (e) {
    console.warn("[continuacoes] sem sugestões:", e instanceof Error ? e.message : e);
    return [];
  }
}
