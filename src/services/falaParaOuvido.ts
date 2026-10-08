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

export function paraOuvido(texto: string): string {
  return texto
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
