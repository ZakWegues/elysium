// Validação local do programa (no lugar da correção da Thesys Cloud). Vai para o processo principal
// do PC como dist/validador.cjs: só o parser do lang-core e o schema da biblioteca, sem React.
import { createParser } from "@openuidev/lang-core";
import schema from "../dist/schema.json";

const parser = createParser(schema as Parameters<typeof createParser>[0]);
export const MAX_PROGRAMA = 200_000;

/**
 * O que o modelo devolveu → só o programa: tira cercas de Markdown e qualquer conversa antes do
 * primeiro `root =`. Puro.
 */
export function limparResposta(bruto: string): string {
  let t = String(bruto ?? "").replace(/\r\n/g, "\n").trim();
  const cerca = /```[a-zA-Z-]*\n([\s\S]*?)```/.exec(t);
  if (cerca) t = cerca[1].trim();
  const i = t.search(/^root\s*=/m);
  if (i > 0) t = t.slice(i);
  return t.trim();
}

export type Validacao = { ok: boolean; programa: string; erros: string[]; declaracoes: number };

/**
 * Parse + checagem de esquema. `erros` vem em texto curto, pronto para devolver ao modelo na
 * segunda tentativa. Puro.
 */
export function validarPrograma(bruto: string): Validacao {
  const programa = limparResposta(bruto);
  if (!programa) return { ok: false, programa, erros: ["resposta vazia: escreva o programa começando por root = ..."], declaracoes: 0 };
  if (programa.length > MAX_PROGRAMA) return { ok: false, programa: "", erros: ["programa grande demais"], declaracoes: 0 };
  if (!/^root\s*=/m.test(programa)) return { ok: false, programa, erros: ["falta a linha root = ..."], declaracoes: 0 };
  const r = parser.parse(programa);
  const erros: string[] = [];
  if (!r.root) erros.push("root não montou nenhum componente");
  if (r.meta.incomplete) erros.push("o programa terminou no meio (parênteses ou aspas abertos)");
  for (const e of r.meta.errors) erros.push(e.message);
  if (r.meta.unresolved.length) erros.push(`nomes usados e não definidos: ${r.meta.unresolved.join(", ")}`);
  return { ok: erros.length === 0, programa, erros: erros.slice(0, 12).map((e) => e.slice(0, 400)), declaracoes: r.meta.statementCount };
}
