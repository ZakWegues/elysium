import { state } from "./state";

/**
 * Peças comuns do que o PC faz sozinho (fase 20, bloco 203 — saíram do `main.ts`).
 *
 * - `esperarOcioso`: o "espera o app ficar livre, até 1 min" estava copiado três vezes (resumo
 *   da manhã, "como foi", rotinas), com a mesma conta à mão.
 * - `aCada`: os `setInterval` do main nunca eram guardados nem limpos, e um callback que
 *   lançasse erro repetia o erro a cada volta sem ninguém ver. Agora cada um tem nome, try e
 *   é parado no "Sair".
 */

/** Espera o estado "ocioso" por até `maxMs`. Devolve se ficou ocioso. */
export async function esperarOcioso(maxMs = 60_000, passoMs = 1000): Promise<boolean> {
  const t0 = Date.now();
  while (!state.is("idle") && Date.now() - t0 < maxMs) await new Promise(r => setTimeout(r, passoMs));
  return state.is("idle");
}

const intervalos: NodeJS.Timeout[] = [];

/** `setInterval` com nome, try/catch e registro para parar no fim. */
export function aCada(ms: number, nome: string, fn: () => unknown): NodeJS.Timeout {
  const t = setInterval(() => {
    try {
      const r = fn();
      if (r && typeof (r as Promise<unknown>).catch === "function") (r as Promise<unknown>).catch((e) => console.warn(`[${nome}]`, e));
    } catch (e) { console.warn(`[${nome}]`, e); }
  }, ms);
  intervalos.push(t);
  return t;
}

/** Para todos os intervalos registrados (no "Sair"). */
export function pararIntervalos(): void {
  for (const t of intervalos.splice(0)) clearInterval(t);
}
