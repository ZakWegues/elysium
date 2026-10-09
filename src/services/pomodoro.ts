import Store from "electron-store";
import { semAcento } from "./texto";

/**
 * Pomodoro (fase 20, bloco 208): blocos de foco e pausa que a Ely conduz.
 *
 * "Ely, pomodoro" = 4 ciclos de 25 min de foco com 5 de pausa, e uma pausa longa de 15 no
 * fim. Aceita "pomodoro de 50", "pomodoro de 50 e 10", "3 ciclos". Durante o foco, o modo
 * foco de sempre fica ligado (avisa o Discord aberto); na troca de fase ela fala e manda ao
 * celular. O estado vai para o disco: o PC reiniciar no meio não perde o pomodoro — ao
 * voltar, ele pula as fases que passaram e segue na certa.
 *
 * A máquina de fases é pura (`montarFases`, `avancar`) — o resto só a liga ao relógio.
 */

export type TipoFase = "foco" | "pausa" | "longa";
export interface Fase { tipo: TipoFase; min: number }
export interface ConfigPomodoro { foco: number; pausa: number; longa: number; ciclos: number }
export interface EstadoPomodoro {
  ativo: boolean;
  fases: Fase[];
  indice: number;
  /** Epoch ms em que a fase atual termina. */
  fimEm: number;
  comecouEm: number;
  config: ConfigPomodoro;
}

export const PADRAO: ConfigPomodoro = { foco: 25, pausa: 5, longa: 15, ciclos: 4 };
const PARADO: EstadoPomodoro = { ativo: false, fases: [], indice: 0, fimEm: 0, comecouEm: 0, config: PADRAO };

const limite = (n: unknown, min: number, max: number, padrao: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= min && v <= max ? v : padrao;
};

/** Valores fora do razoável voltam ao padrão. Pura. */
export function configValida(c: Partial<ConfigPomodoro> = {}): ConfigPomodoro {
  return {
    foco: limite(c.foco, 5, 120, PADRAO.foco),
    pausa: limite(c.pausa, 1, 30, PADRAO.pausa),
    longa: limite(c.longa, 5, 60, PADRAO.longa),
    ciclos: limite(c.ciclos, 1, 8, PADRAO.ciclos),
  };
}

/** F P F P F P F L — a pausa longa só fecha séries de 4 ciclos ou mais. Pura. */
export function montarFases(c: ConfigPomodoro): Fase[] {
  const fases: Fase[] = [];
  for (let i = 0; i < c.ciclos; i++) {
    fases.push({ tipo: "foco", min: c.foco });
    if (i < c.ciclos - 1) fases.push({ tipo: "pausa", min: c.pausa });
  }
  if (c.ciclos >= 4) fases.push({ tipo: "longa", min: c.longa });
  return fases;
}

export function novoEstado(c: ConfigPomodoro, agora: number): EstadoPomodoro {
  const fases = montarFases(c);
  return { ativo: true, fases, indice: 0, fimEm: agora + fases[0].min * 60_000, comecouEm: agora, config: c };
}

/**
 * Leva o estado até `agora`: cada fase vencida passa para a seguinte (encostada no fim da
 * anterior, não em `agora` — o relógio não escorrega). Devolve as fases em que ENTROU, e
 * `terminou` quando passou da última. Pura.
 */
export function avancar(e: EstadoPomodoro, agora: number): { estado: EstadoPomodoro; entrou: number[]; terminou: boolean } {
  if (!e.ativo) return { estado: e, entrou: [], terminou: false };
  let { indice, fimEm } = e;
  const entrou: number[] = [];
  while (fimEm <= agora) {
    indice++;
    if (indice >= e.fases.length) return { estado: { ...PARADO, config: e.config }, entrou, terminou: true };
    fimEm += e.fases[indice].min * 60_000;
    entrou.push(indice);
  }
  return { estado: { ...e, indice, fimEm }, entrou, terminou: false };
}

/** "Pula a pausa": a fase atual acaba agora. Pura. */
export function pular(e: EstadoPomodoro, agora: number): EstadoPomodoro {
  return e.ativo ? { ...e, fimEm: agora } : e;
}

/** Qual ciclo de foco é a fase `i` (1-based) e quantos há. Pura. */
export function cicloDa(e: EstadoPomodoro, i = e.indice): { ciclo: number; de: number } {
  const ciclo = e.fases.slice(0, i + 1).filter(f => f.tipo === "foco").length;
  return { ciclo: Math.max(1, ciclo), de: e.config.ciclos };
}

const minutos = (n: number) => (n === 1 ? "1 minuto" : `${n} minutos`);

/** A fala da troca de fase. Pura. */
export function falaDaFase(e: EstadoPomodoro, i = e.indice): string {
  const f = e.fases[i];
  const { ciclo, de } = cicloDa(e, i);
  if (f.tipo === "foco") return `Foco: ${minutos(f.min)}. Ciclo ${ciclo} de ${de}.`;
  if (f.tipo === "longa") return `Série completa! Pausa longa de ${minutos(f.min)}.`;
  return `Pausa de ${minutos(f.min)}. ${ciclo} de ${de} ciclos feitos.`;
}

export function falaDoEstado(e: EstadoPomodoro, agora = Date.now()): string {
  if (!e.ativo) return "Nenhum pomodoro rodando.";
  const f = e.fases[e.indice];
  const resta = Math.max(1, Math.ceil((e.fimEm - agora) / 60_000));
  const { ciclo, de } = cicloDa(e);
  const nome = f.tipo === "foco" ? "foco" : f.tipo === "longa" ? "pausa longa" : "pausa";
  return `Pomodoro: ${nome}, ${resta === 1 ? "falta 1 minuto" : `faltam ${resta} minutos`}. Ciclo ${ciclo} de ${de}.`;
}

// ── o que se fala ─────────────────────────────────────────────────────────────────

export type PedidoPomodoro =
  | { tipo: "start"; config: Partial<ConfigPomodoro> }
  | { tipo: "stop" } | { tipo: "status" } | { tipo: "skip" };

/** "pomodoro", "pomodoro de 50 e 10, 3 ciclos", "para o pomodoro"… Frase inteira. Pura. */
export function pedidoDePomodoro(texto: string): PedidoPomodoro | null {
  const t = semAcento(texto).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().replace(/^ely /, "");
  if (!/pomodoro|pausa|descanso|intervalo|ciclo/.test(t)) return null;
  if (/^(?:para|parar|pare|encerra|encerrar|cancela|cancelar|termina|terminar|desliga|desligar|chega de) (?:o |a |esse |essa )?(?:pomodoro|sessao de pomodoro)$/.test(t)) return { tipo: "stop" };
  if (/^(?:como (?:ta|esta) o pomodoro|quanto falta (?:do|no|pro fim do|para o fim do) pomodoro|status do pomodoro|em que ciclo (?:eu )?(?:to|estou|estamos)|quanto falta (?:da|pra|para) (?:pausa|o fim da pausa))$/.test(t)) return { tipo: "status" };
  if (/^(?:pula|pular|pule|encerra|termina) (?:a pausa|o descanso|o intervalo|essa fase|esta fase|pro proximo ciclo|para o proximo ciclo)$/.test(t)) return { tipo: "skip" };
  const m = /^(?:(?:comeca|comecar|inicia|iniciar|liga|ligar|bora|vamos|faz|fazer|quero|bota|poe)(?: (?:um|o|uma|de|no))? )?(?:pomodoro|sessao de pomodoro|tecnica pomodoro)(.*)$/.exec(t);
  if (!m) return null;
  let resto = m[1].trim();
  const config: Partial<ConfigPomodoro> = {};
  const pegar = (re: RegExp, f: (x: RegExpExecArray) => void) => {
    const r = re.exec(resto);
    if (r) { f(r); resto = (resto.slice(0, r.index) + " " + resto.slice(r.index + r[0].length)).replace(/\s+/g, " ").trim(); }
  };
  pegar(/\b(\d{1,2}) ciclos?\b/, r => { config.ciclos = Number(r[1]); });
  pegar(/\b(?:com )?pausa (?:longa )?de (\d{1,2})(?: minutos?| min)?\b/, r => { config.pausa = Number(r[1]); });
  pegar(/\bde (\d{1,3})(?: minutos?| min)?(?: (?:e|com|por) (\d{1,2})(?: minutos?| min)?(?: de (?:pausa|descanso))?)?\b/, r => { config.foco = Number(r[1]); if (r[2]) config.pausa = Number(r[2]); });
  resto = resto.replace(/^(?:e|com|,)\s*/, "").replace(/\b(?:agora|por favor|pf)\b/g, "").trim();
  // Sobrou coisa que não entendi ("pomodoro amanhã às 9"): é para o cérebro.
  if (resto) return null;
  return { tipo: "start", config };
}

// ── relógio, disco e avisos ──────────────────────────────────────────────────────────

export interface DependenciasPomodoro {
  /** Fala e manda ao celular. */
  avisar: (titulo: string, fala: string) => void;
  focoLigar: (minutos: number) => Promise<unknown>;
  focoParar: () => void;
  mudou?: (e: EstadoPomodoro) => void;
}

const store = new Store<{ pomodoro: EstadoPomodoro }>({ name: "pomodoro", defaults: { pomodoro: PARADO } });
let deps: DependenciasPomodoro | null = null;
let timer: NodeJS.Timeout | null = null;

export function estadoPomodoro(): EstadoPomodoro { return store.get("pomodoro"); }

function gravar(e: EstadoPomodoro): void {
  store.set("pomodoro", e);
  try { deps?.mudou?.(e); } catch { /* aviso é best-effort */ }
}

/** Entra na fase `i`: liga ou desliga o foco. */
async function entrarNaFase(e: EstadoPomodoro): Promise<void> {
  if (!deps) return;
  const f = e.fases[e.indice];
  try {
    if (f.tipo === "foco") await deps.focoLigar(Math.max(1, Math.round((e.fimEm - Date.now()) / 60_000)));
    else deps.focoParar();
  } catch (err) { console.warn("[pomodoro] foco:", err); }
}

function armar(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  const e = estadoPomodoro();
  if (!e.ativo) return;
  // setTimeout com mais de ~24 dias estoura; aqui o teto é 2 h por fase.
  timer = setTimeout(() => { void virar(); }, Math.max(0, e.fimEm - Date.now()));
}

async function virar(agora = Date.now(), silencioso = false): Promise<void> {
  const { estado, entrou, terminou } = avancar(estadoPomodoro(), agora);
  gravar(estado);
  if (terminou) {
    deps?.focoParar();
    if (!silencioso) deps?.avisar("Pomodoro concluído", "Pomodoro concluído. Bom trabalho!");
  } else if (entrou.length) {
    await entrarNaFase(estado);
    // Depois de horas desligado, só a fase atual é anunciada.
    if (!silencioso) deps?.avisar("Pomodoro", falaDaFase(estado));
  }
  armar();
}

export async function comecarPomodoro(c: Partial<ConfigPomodoro> = {}, agora = Date.now()): Promise<EstadoPomodoro> {
  const e = novoEstado(configValida(c), agora);
  gravar(e);
  await entrarNaFase(e);
  armar();
  return e;
}

export function pararPomodoro(): EstadoPomodoro {
  const e = estadoPomodoro();
  if (timer) { clearTimeout(timer); timer = null; }
  gravar({ ...PARADO, config: e.config });
  if (e.ativo) deps?.focoParar();
  return estadoPomodoro();
}

export async function pularFase(agora = Date.now()): Promise<EstadoPomodoro> {
  const e = estadoPomodoro();
  if (!e.ativo) return e;
  gravar(pular(e, agora));
  await virar(agora);
  return estadoPomodoro();
}

/** No boot: liga os avisos e retoma (pulando em silêncio as fases que passaram). */
export function iniciarPomodoro(d: DependenciasPomodoro): void {
  deps = d;
  const e = estadoPomodoro();
  if (!e.ativo) return;
  if (e.fimEm <= Date.now()) void virar(Date.now(), true);
  else { void entrarNaFase(e); armar(); }
}

export function pararRelogioPomodoro(): void {
  if (timer) { clearTimeout(timer); timer = null; }
}

/** Para o card e para o celular. */
export function pomodoroParaCliente(e = estadoPomodoro(), agora = Date.now()) {
  if (!e.ativo) return { ativo: false as const, config: e.config };
  const f = e.fases[e.indice];
  const { ciclo, de } = cicloDa(e);
  return { ativo: true as const, fase: f.tipo, faseMin: f.min, fimEm: e.fimEm, restaMs: Math.max(0, e.fimEm - agora), ciclo, de, config: e.config, agora };
}
