/**
 * Calculadora exata (bloco 138). Pura, sem `eval`.
 *
 * O modelo local de 7B erra conta com frequência ("15% de 230" vira 34,05). Aqui a conta é
 * feita de verdade: + − × ÷, potência, parênteses, raiz, porcentagem, e as palavras que se
 * fala ("mais", "vezes", "dividido por", "elevado a", "15% de 200", "200 mais 10%").
 * Números no jeito brasileiro: "1.234,5" = 1234,5; "3.5" (um ponto, sem vírgula) = 3,5.
 */

type Tok = { t: "num"; v: number } | { t: "op"; v: string } | { t: "(" } | { t: ")" } | { t: "%" } | { t: "de" } | { t: "raiz" };

const PALAVRAS: [RegExp, string][] = [
  [/\bdividido por\b|\bdividido\b|÷/g, " / "],
  [/\bmultiplicado por\b|\bvezes\b|×/g, " * "],
  [/\bmais\b/g, " + "],
  [/\bmenos\b|−/g, " - "],
  [/\belevado (a|ao)\b|\bna potência\b|\*\*/g, " ^ "],
  [/\bao quadrado\b/g, " ^ 2 "],
  [/\bao cubo\b/g, " ^ 3 "],
  [/\bpor cento\b|\bporcento\b/g, " % "],
  [/\braiz quadrada de\b|\braiz de\b|√/g, " raiz "],
];

function numeroBr(s: string): number {
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  // Só pontos: "1.234.567" (milhar) ou "3.5" (decimal).
  if (/^\d{1,3}(\.\d{3})+$/.test(s) && (s.match(/\./g) ?? []).length > 1) return Number(s.replace(/\./g, ""));
  return Number(s);
}

export function tokenizar(expr: string): Tok[] | null {
  let s = expr.toLowerCase().replace(/^\s*(quanto (é|e|da|dá)|calcula|calcule|qual (é|e) o resultado de)\s+/, "").replace(/[?=]+\s*$/, "");
  for (const [re, sub] of PALAVRAS) s = s.replace(re, sub);
  s = s.replace(/(\d)\s*x\s*(\d)/g, "$1 * $2");
  const toks: Tok[] = [];
  const re = /\s*(\d[\d.,]*|[-+*/^()%]|de\b|raiz\b)/y;
  let pos = 0;
  while (pos < s.length) {
    if (/^\s*$/.test(s.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) return null;
    pos = re.lastIndex;
    const x = m[1];
    if (/^\d/.test(x)) { const n = numeroBr(x.replace(/[.,]$/, "")); if (!Number.isFinite(n)) return null; toks.push({ t: "num", v: n }); }
    else if (x === "(") toks.push({ t: "(" });
    else if (x === ")") toks.push({ t: ")" });
    else if (x === "%") toks.push({ t: "%" });
    else if (x === "de") toks.push({ t: "de" });
    else if (x === "raiz") toks.push({ t: "raiz" });
    else toks.push({ t: "op", v: x });
  }
  return toks.length ? toks : null;
}

/** O valor da expressão, ou null se não for uma conta. */
export function calcular(expr: string): number | null {
  const lidos = tokenizar(expr);
  if (!lidos || !lidos.some(t => t.t === "num")) return null;
  const toks: Tok[] = lidos;
  let i = 0;
  const ver = () => toks[i];
  const ehOp = (v: string) => { const t = ver(); return t?.t === "op" && t.v === v; };

  // Valor com a marca de porcentagem: "+ 10%" soma 10% do que veio antes.
  function expressao(): number {
    let v = termo().v;
    while (ehOp("+") || ehOp("-")) {
      const op = (toks[i++] as { v: string }).v;
      const d = termo();
      const delta = d.pct ? v * d.v : d.v;
      v = op === "+" ? v + delta : v - delta;
    }
    return v;
  }
  function termo(): { v: number; pct: boolean } {
    let r = potencia();
    while (ehOp("*") || ehOp("/")) {
      const op = (toks[i++] as { v: string }).v;
      const d = potencia();
      r = { v: op === "*" ? r.v * d.v : r.v / d.v, pct: false };
    }
    return r;
  }
  function potencia(): { v: number; pct: boolean } {
    const b = unario();
    if (ehOp("^")) { i++; const e = potencia(); return { v: Math.pow(b.v, e.v), pct: false }; }
    return b;
  }
  function unario(): { v: number; pct: boolean } {
    if (ehOp("-")) { i++; const u = unario(); return { v: -u.v, pct: u.pct }; }
    if (ehOp("+")) { i++; return unario(); }
    if (ver()?.t === "raiz") { i++; const u = unario(); return { v: Math.sqrt(u.v), pct: false }; }
    let v = primario();
    if (ver()?.t === "%") {
      i++;
      v = v / 100;
      // "15% de 200" = 30.
      if (ver()?.t === "de") { i++; return { v: v * unario().v, pct: false }; }
      return { v, pct: true };
    }
    return { v, pct: false };
  }
  function primario(): number {
    const t = toks[i++];
    if (!t) throw new Error("fim");
    if (t.t === "num") return t.v;
    if (t.t === "(") { const v = expressao(); if (toks[i++]?.t !== ")") throw new Error("parêntese"); return v; }
    throw new Error("inesperado");
  }
  try {
    const v = expressao();
    if (i !== toks.length || !Number.isFinite(v)) return null;
    return v;
  } catch { return null; }
}

/** 1234.5 → "1.234,5"; até 6 casas, sem zeros sobrando. Pura. */
export function formatarNumero(v: number): string {
  const arred = Math.round(v * 1e6) / 1e6;
  return arred.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
}
