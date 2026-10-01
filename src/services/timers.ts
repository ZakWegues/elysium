import Store from "electron-store";

/**
 * Timers com nome (bloco 136) — "timer de 10 minutos do miojo". O que mais se usa numa
 * Alexa, e o ELYSIUM só tinha o relógio do card (que não sabe o nome de nada, não avisa o
 * celular e não sobrevive a fechar o app) ou lembrete (que é para "amanhã às 9", não para
 * o forno). Vários ao mesmo tempo; ao acabar o PC avisa, fala, e o celular recebe.
 *
 * Persistido: fechou e abriu o app, os que ainda não venceram voltam a contar. O que
 * venceu com o app fechado há pouco (até 5 min) avisa uma vez ao abrir; mais velho que
 * isso, sai sem aviso — "acabou o timer do miojo" uma hora depois só confunde.
 */

export interface Timer { id: string; nome: string; criadoEm: number; fimEm: number; duracaoMs: number }

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, quarenta_e_cinco: 45, cinquenta: 50, sessenta: 60, noventa: 90,
};

function numero(s: string): number | null {
  const t = semAcento(s).trim().replace(/\s+e\s+/g, "_e_");
  if (/^\d+([.,]\d+)?$/.test(t)) return Number(t.replace(",", "."));
  return NUMEROS[t] ?? null;
}

/**
 * "timer de 10 minutos do miojo" → { ms, nome: "miojo" }. Aceita "1 hora e meia",
 * "30 segundos", "meia hora", "cronômetro"/"temporizador". Pura.
 */
export function interpretarTimer(texto: string): { ms: number; nome: string } | null {
  const t = semAcento(texto).replace(/[!?.]+$/g, "").trim();
  const m = /^(?:(?:poe|coloca|liga|cria|faz|marca|bota|inicia|comeca)\s+(?:um\s+)?)?(?:timer|temporizador|cronometro)\s+(?:de\s+)?(.+?)(?:\s+(?:do|da|de|pro|pra|para o|para a|para)\s+(.+))?$/.exec(t);
  if (!m) return null;
  const ms = duracao(m[1]);
  if (!ms) return null;
  // O nome vem do texto original, para manter acento ("pão de queijo").
  let nome = "";
  if (m[2]) {
    const original = texto.replace(/[!?.]+$/g, "").trim();
    const pos = semAcento(original).lastIndexOf(m[2]);
    nome = pos >= 0 ? original.slice(pos, pos + m[2].length) : m[2];
  }
  return { ms, nome: nome.trim() };
}

/** "10 minutos", "1 hora e meia", "meia hora", "90 segundos" → ms. Pura. */
export function duracao(s: string): number | null {
  const t = semAcento(s).trim();
  if (/^meia hora$/.test(t)) return 30 * 60_000;
  let total = 0;
  let achou = false;
  const re = /(\d+(?:[.,]\d+)?|[a-z]+(?: e [a-z]+)?)\s*(horas?|h|minutos?|min|m|segundos?|seg|s)\b/g;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const n = numero(m[1]);
    if (n === null) continue;
    const u = m[2];
    total += u.startsWith("h") ? n * 3_600_000 : u.startsWith("m") ? n * 60_000 : n * 1000;
    achou = true;
  }
  if (/\be meia\b/.test(t) && achou) total += /hora/.test(t) ? 30 * 60_000 : 30_000;
  if (!achou) return null;
  return total >= 1000 && total <= 24 * 3_600_000 ? total : null;
}

/** 610000 → "10 minutos e 10 segundos". Pura. */
export function duracaoFalada(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), seg = s % 60;
  const partes: string[] = [];
  if (h) partes.push(`${h} ${h === 1 ? "hora" : "horas"}`);
  if (m) partes.push(`${m} ${m === 1 ? "minuto" : "minutos"}`);
  if (seg && !h) partes.push(`${seg} ${seg === 1 ? "segundo" : "segundos"}`);
  return partes.length ? partes.join(" e ") : "menos de um segundo";
}

// ── estado ───────────────────────────────────────────────────────────────────

const store = new Store<{ timers: Timer[] }>({ name: "timers", defaults: { timers: [] } });
const agendados = new Map<string, NodeJS.Timeout>();
const ouvintes = new Set<(t: Timer) => void>();

export function ouvirTimers(fn: (t: Timer) => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

function acabou(id: string) {
  agendados.delete(id);
  const t = store.get("timers", []).find(x => x.id === id);
  store.set("timers", store.get("timers", []).filter(x => x.id !== id));
  if (t) for (const fn of ouvintes) { try { fn(t); } catch (e) { console.warn("[timers] ouvinte falhou:", e); } }
}

function agendar(t: Timer) {
  const falta = Math.max(0, t.fimEm - Date.now());
  agendados.set(t.id, setTimeout(() => acabou(t.id), falta));
}

/** Chamado uma vez ao subir o app. */
export function retomarTimers(): void {
  const agora = Date.now();
  const vivos = store.get("timers", []).filter(t => t.fimEm > agora - 5 * 60_000);
  store.set("timers", vivos);
  for (const t of vivos) agendar(t);
}

export function criarTimer(ms: number, nome = ""): Timer {
  const agora = Date.now();
  const t: Timer = { id: `t-${agora.toString(36)}-${Math.random().toString(36).slice(2, 6)}`, nome: nome.trim(), criadoEm: agora, fimEm: agora + ms, duracaoMs: ms };
  store.set("timers", [...store.get("timers", []), t]);
  agendar(t);
  return t;
}

export function listarTimers(): Timer[] {
  return store.get("timers", []).filter(t => t.fimEm > Date.now()).sort((a, b) => a.fimEm - b.fimEm);
}

/** Cancela pelo id, pelo nome ("o do miojo"), ou — sem nada — o único que existe. */
export function cancelarTimer(alvo?: string): Timer | null {
  const lista = listarTimers();
  const q = semAcento(alvo ?? "").replace(/^(o|a)\s+(timer\s+)?(do|da|de)\s+/, "").trim();
  const t = !q ? (lista.length === 1 ? lista[0] : null)
    : lista.find(x => x.id === alvo) ?? lista.find(x => x.nome && semAcento(x.nome).includes(q));
  if (!t) return null;
  clearTimeout(agendados.get(t.id));
  agendados.delete(t.id);
  store.set("timers", store.get("timers", []).filter(x => x.id !== t.id));
  return t;
}

export function timersFalados(): string {
  const l = listarTimers();
  if (!l.length) return "Nenhum timer correndo.";
  return l.map(t => `${t.nome ? `o do ${t.nome}` : "um timer"} acaba em ${duracaoFalada(t.fimEm - Date.now())}`).join("; ").replace(/^./, c => c.toUpperCase()) + ".";
}
