/**
 * Texto escrito para o olho → texto para o ouvido (fase 18, 08/10). Pura.
 *
 * A pesquisa sobre assistentes de voz foi unânime: números, datas e unidades por extenso,
 * sem símbolos que a voz lê errado. A voz neural lia "16h" como "dezesseis agá", "15/10" como
 * "quinze barra dez", "3×10–12" como "três vezes dez traço doze" e "R$ 12,50" quebrado. O
 * resumo do dia (com treino, calorias e horários) é exatamente esse tipo de texto.
 *
 * Os números continuam em algarismo: a voz pt-BR lê "16" e "2830" bem — o que ela erra é o
 * que vem colado neles.
 */

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function hora(h: number, m: number): string {
  if (h === 0 && m === 0) return "meia-noite";
  if (h === 12 && m === 0) return "meio-dia";
  const horas = h === 1 ? "1 hora" : `${h} horas`;
  return m ? `${h} e ${String(m).padStart(2, "0").replace(/^0/, "")}` : horas;
}

// ── matemática (fase 20, bloco 206) ────────────────────────────────────────────────

const SOBRESCRITO: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
const ORDINAL_DA_FRACAO: Record<number, [string, string]> = {
  2: ["meio", "meios"], 3: ["terço", "terços"], 4: ["quarto", "quartos"], 5: ["quinto", "quintos"],
  6: ["sexto", "sextos"], 7: ["sétimo", "sétimos"], 8: ["oitavo", "oitavos"], 9: ["nono", "nonos"], 10: ["décimo", "décimos"],
};

const FUNCAO: Record<string, string> = { sen: "seno", sin: "seno", cos: "cosseno", tg: "tangente", tan: "tangente", ln: "logaritmo natural", log: "log" };

function potencia(n: string): string {
  if (n === "2") return " ao quadrado";
  if (n === "3") return " ao cubo";
  return ` elevado a ${n}`;
}

function fracao(a: string, b: string): string {
  const den = Number(b);
  const nome = ORDINAL_DA_FRACAO[den];
  return nome ? `${a} ${Number(a) === 1 ? nome[0] : nome[1]}` : `${a} sobre ${b}`;
}

/**
 * Símbolos que a voz nunca lê direito, em qualquer conversa: "x²" saía "x dois", "√9"
 * sumia, "≠" ficava mudo. Seguros sempre — nenhum deles aparece em texto comum. Pura.
 */
export function simbolosParaOuvido(texto: string): string {
  return texto
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_m, s: string) => potencia([...s].map(c => SOBRESCRITO[c]).join("")))
    .replace(/√\s*\(([^)]{1,40})\)/g, " raiz quadrada de $1")
    .replace(/√\s*(\w+)/g, " raiz quadrada de $1")
    .replace(/∛\s*(\w+)/g, " raiz cúbica de $1")
    .replace(/π/g, " pi ")
    .replace(/≠/g, " diferente de ")
    .replace(/≥/g, " maior ou igual a ")
    .replace(/≤/g, " menor ou igual a ")
    .replace(/≈/g, " aproximadamente ")
    .replace(/±/g, " mais ou menos ")
    .replace(/∞/g, " infinito ")
    .replace(/Δ/g, " delta ")
    .replace(/÷/g, " dividido por ");
}

/**
 * Conta escrita → conta falada, só no modo matemática/ciências/estudo: lá "3/4" é fração
 * e "2*3" é vezes; fora dele, "3/4" é data e "3×10" é série de treino. Vem ANTES da
 * limpeza do markdown (que comia o "*" da multiplicação) e das regras de data. Pura.
 */
export function matematicaParaOuvido(texto: string): string {
  return simbolosParaOuvido(texto
    // LaTeX que o modelo às vezes manda: \frac{a}{b}, \sqrt{x}, x^{2}, \cdot, $…$.
    .replace(/\\[()[\]]/g, " ")
    .replace(/(?<!R)\$/g, " ")
    .replace(/\\d?frac\{([^{}]{1,30})\}\{([^{}]{1,30})\}/g, (_m, a: string, b: string) => /^\d+$/.test(a) && /^\d+$/.test(b) ? fracao(a, b) : `${a} sobre ${b}`)
    .replace(/\\sqrt\{([^{}]{1,40})\}/g, " raiz quadrada de $1")
    .replace(/\\(cdot|times)/g, " vezes ")
    .replace(/\\div/g, " dividido por ")
    .replace(/\\(pi)\b/g, " pi ")
    .replace(/\\(leq?|le)\b/g, " menor ou igual a ")
    .replace(/\\(geq?|ge)\b/g, " maior ou igual a ")
    .replace(/\\(neq?|ne)\b/g, " diferente de ")
    .replace(/\\(left|right)\b/g, "")
    .replace(/\^\{([^{}]{1,10})\}/g, (_m, n: string) => potencia(n.trim()))
    .replace(/\^\s*\(?(-?\w+)\)?/g, (_m, n: string) => potencia(n))
    // Funções: "sen(x)", "cos x", "log 100".
    // Só com parêntese ou com um argumento curto: "sentido" e "costa" não são função.
    .replace(/\b(sen|sin|cos|tg|tan|ln|log)\s*\(([^()]{1,30})\)/g, (_m, f: string, x: string) => `${FUNCAO[f]} de ${x}`)
    .replace(/\b(sen|sin|cos|tg|tan)\s+(x|y|θ|α|β|\d+°?)(?!\w)/g, (_m, f: string, x: string) => `${FUNCAO[f]} de ${x}`)
    // Fração simples "3/4" — mas não data: "3/4 às 14h", "dia 3/4", "3/4/2026".
    .replace(/(^|[^\w/])(\d{1,2})\/(\d{1,2})(?![\w/])(?!\s*(?:às|as|de 20\d\d)\b)/g, (m, antes: string, a: string, b: string, i: number, todo: string) =>
      /\bdia\s*$/i.test(todo.slice(0, i + antes.length)) || Number(b) === 0 ? m : `${antes}${fracao(a, b)}`)
    // Operadores.
    .replace(/(\w|\))\s*[*×·]\s*(?=[\w(])/g, "$1 vezes ")
    .replace(/\s+\/\s+/g, " dividido por ")
    .replace(/\s*=\s*/g, " igual a ")
    .replace(/\s+\+\s+|(?<=\d)\+(?=\d)/g, " mais ")
    .replace(/\s+[−-]\s+|(?<=\d)[−](?=\d)/g, " menos ")
    .replace(/(^|\s)[−-](?=\d)/g, "$1menos ")
    .replace(/[()]/g, " ")
    .replace(/\s{2,}/g, " "));
}

export function paraOuvido(texto: string): string {
  return simbolosParaOuvido(texto)
    // Dinheiro: "R$ 1.234,50" → "1234 reais e 50 centavos".
    // Milhar com ponto primeiro; senão o número inteiro (sem isso "R$ 12345" virava "123 reais45").
    .replace(/R\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?/g, (_m, inteiro: string, cent?: string) => {
      const reais = inteiro.replace(/\./g, "");
      const c = cent && cent !== "00" ? ` e ${Number(cent)} centavo${Number(cent) === 1 ? "" : "s"}` : "";
      return `${reais} rea${reais === "1" ? "l" : "is"}${c}`;
    })
    // Datas: "15/10/2026" e "15/10" → "15 de outubro (de 2026)".
    .replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g, (m, d: string, mes: string, ano?: string) => {
      const n = Number(mes);
      if (n < 1 || n > 12 || Number(d) < 1 || Number(d) > 31) return m;
      return `${Number(d)} de ${MESES[n - 1]}${ano ? ` de ${ano}` : ""}`;
    })
    // Horas: "16:30", "16h30", "16h" → "16 e 30", "16 horas".
    .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_m, h: string, m: string) => hora(Number(h), Number(m)))
    .replace(/\b([01]?\d|2[0-3])h([0-5]\d)?\b/g, (_m, h: string, m?: string) => hora(Number(h), Number(m ?? 0)))
    // Séries de treino: "2 aquec. + 3×4–6" → "2 de aquecimento mais 3 séries de 4 a 6".
    .replace(/(\d+)\s*aquec\.?\s*\+\s*/g, "$1 de aquecimento mais ")
    .replace(/(\d+)\s*[×x]\s*(\d+)\s*[–-]\s*(\d+)/g, "$1 séries de $2 a $3")
    .replace(/(\d+)\s*[×x]\s*(\d+)\b/g, "$1 séries de $2")
    // Intervalo numérico: "4–6" → "4 a 6".
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1 a $2")
    // Unidades coladas no número.
    .replace(/(\d)\s*kcal\b/gi, "$1 calorias")
    .replace(/(\d)\s*kg\b/gi, "$1 quilos")
    .replace(/(\d)\s*km\b/gi, "$1 quilômetros")
    .replace(/(\d)\s*min\b/gi, "$1 minutos")
    .replace(/(\d)\s*g\b(?!\w)/g, "$1 gramas")
    .replace(/(\d)\s*°C?/g, "$1 graus")
    // Separadores visuais viram pausa.
    .replace(/\s*·\s*/g, ", ")
    .replace(/\s*→\s*/g, ", ")
    .replace(/\s{2,}/g, " ");
}
