/**
 * Pedidos condicionais resolvidos sem modelo (fase 18, 08/10).
 *
 * "se o chrome estiver aberto, fecha ele" e "se estiver tocando alguma coisa, pausa" eram as
 * falhas que sobravam na bancada: o modelo de 7B fechava sem olhar, ou olhava e não fechava.
 * São frases de forma fixa e a condição é um fato que o PC sabe na hora — não precisa de
 * modelo. A pesquisa apontou o mesmo: o básico tem de ser rápido e determinístico (o que
 * derrubou a confiança no Gemini, na Siri e no Humane foi o básico falhando).
 *
 * "fecha tudo menos X" fica de fora DE PROPÓSITO: fechar é encerrar o processo, e fechar tudo
 * sem perguntar perderia trabalho não salvo. Esse continua com o agente.
 *
 * Puras — testadas em tests/condicionais.test.ts.
 */

const sem = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.!?]+$/, "").trim();

/** "se o chrome estiver aberto, fecha ele" → "chrome". */
export function pedidoFecharSeAberto(texto: string): string | null {
  const m = /^se\s+(?:o|a|os|as)?\s*(.{2,40}?)\s+(?:estiver|tiver|esta|ta|for)\s+(?:aberto|aberta|abertos|ligado|ligada|rodando|em execucao)\s*,?\s*(?:entao\s+)?(?:fecha|feche|fechar|encerra|encerre|mata)(?:\s+(?:ele|ela|eles|o|a|isso|esse|essa|programa|app))?$/.exec(sem(texto));
  if (!m) return null;
  const app = m[1].replace(/^(?:programa|app|aplicativo)\s+(?:do|da|de)?\s*/, "").trim();
  return app.length >= 2 ? app : null;
}

/**
 * "me lembra daqui a 20 minutos de tirar o bolo" → { minutos: 20, texto: "tirar o bolo" }.
 * O 7B criava um TIMER no lugar do lembrete (a bancada pegou): os dois avisam, mas o
 * lembrete entra na lista e tem o texto. "daqui a N" é conta de relógio — não precisa de modelo.
 */
export function pedidoLembreteDaquiA(texto: string): { minutos: number; texto: string } | null {
  const t = texto.trim().replace(/[.!]+$/, "");
  const m = /^(?:me\s+)?(?:lembra|lembre|lembrar|avisa|avise)(?:[- ]me)?\s+daqui\s+a\s+(\d{1,3}|uma|um|meia)\s+(minutos?|min|horas?|h)\s+(?:de|para|pra|que|do|da)\s+(.{2,120})$/i.exec(t);
  if (!m) return null;
  const n = m[1] === "uma" || m[1] === "um" ? 1 : m[1] === "meia" ? 0.5 : Number(m[1]);
  const minutos = /^h/i.test(m[2]) ? Math.round(n * 60) : Math.round(n);
  if (!minutos || minutos > 24 * 60) return null;
  return { minutos, texto: m[3].trim() };
}

/** "se estiver tocando alguma coisa, pausa" → "pause". */
export function pedidoPausarSeTocando(texto: string): "pause" | null {
  return /^se\s+(?:estiver|tiver|esta|ta|tiver alguma coisa)\s+(?:tocando|rodando)(?:\s+(?:alguma coisa|algo|musica|uma musica|algum som))?\s*,?\s*(?:entao\s+)?(?:pausa|pause|pausar|para|pare|parar)(?:\s+(?:a musica|ela|isso))?$/.test(sem(texto)) ? "pause" : null;
}
