import Store from "electron-store";
import * as crypto from "node:crypto";
import { EventoPc, MARCOS_OCIOSO, NomeEvento, ouvirEventos, ROTULO_EVENTO } from "./eventos";
import { semAcento } from "./texto";

/**
 * Rotinas — automações agendadas — e a fila de entregas para o celular.
 *
 * O pedido (bloco 68): "todo dia me mandar tal coisa". Uma rotina é um texto que o
 * ELYSIUM executa numa hora, em certos dias, como se o dono tivesse falado — passa pelo
 * mesmo `executarComando` do chat e da voz, então vale qualquer coisa que já funciona
 * ali: "como está o tempo", "abre o Spotify", "roda o preset trabalho", "quais são os
 * meus lembretes de hoje". A resposta vira notificação no PC (e fala, se pedido) e vai
 * para o celular.
 *
 * ## Por que existe uma fila de entregas
 *
 * O push pela Expo nunca foi validado (precisa de credenciais FCM no projeto EAS, §15).
 * O que funciona sem nada na nuvem é o próprio aparelho vir buscar: o app do celular
 * chama `notify.pending` quando abre, quando o WebSocket conecta e, em segundo plano, a
 * cada ~15 min pelo WorkManager (bloco 72). Cada entrega fica aqui até o celular confirmar
 * por `notify.ack`. Com o app aberto, o WS avisa na hora (`{type:"notify"}`) — a fila é o
 * caminho que sobrevive ao app fechado.
 *
 * ## Agendamento
 *
 * Um tique por minuto compara "HH:MM" e o dia da semana. É proposital que seja mais burro
 * que o `scheduler.ts` dos lembretes (que arma um `setTimeout` para o próximo): rotina é
 * recorrente e barata de testar a cada minuto, e um tique fixo não tem estado para
 * perder quando o PC hiberna. `ultimaExecucao` impede disparar duas vezes no mesmo
 * minuto e, na volta de uma hibernação, ignora o que já venceu — rotina atrasada em
 * horas não é rotina, é ruído.
 */

/**
 * Quando a rotina dispara (bloco 79). Sem `gatilho` = por hora (`hora` + `dias`), como
 * sempre foi. Por evento: o barramento de `eventos.ts`, com filtro (`app`) e parâmetros
 * (`minutos` de ociosidade, `limite` de CPU/RAM) e um `cada` mínimo entre disparos —
 * "quando o Chrome abrir" não pode rodar a cada alt-tab.
 */
export type Gatilho =
  | { tipo: "hora" }
  | { tipo: "evento"; evento: NomeEvento; app?: string; minutos?: number; limite?: number; cada?: number };

export interface Rotina {
  id: string;
  nome: string;
  /** O que o ELYSIUM executa, como se tivesse sido dito. */
  texto: string;
  /** "HH:MM", hora local. Só vale com gatilho por hora. */
  hora: string;
  /** 0 = domingo … 6 = sábado. Vazio = todos os dias. Só vale com gatilho por hora. */
  dias: number[];
  gatilho?: Gatilho;
  /**
   * Condição em português, avaliada pelo cérebro com ferramentas antes de executar
   * ("se o Spotify estiver aberto", "se for chover amanhã"). Vazia = sempre.
   */
  condicao?: string;
  /** Para onde vai a resposta. */
  entregar: ("pc" | "celular")[];
  /** Falar a resposta no PC. */
  falar: boolean;
  ativa: boolean;
  criadaEm: number;
  ultimaExecucao?: number;
  ultimoResultado?: string;
  /** As últimas 5 execuções (fase 16), da mais nova para a mais antiga. */
  historico?: { em: number; resultado: string }[];
}

export interface Entrega {
  id: string;
  tipo: "rotina" | "lembrete" | "aviso";
  titulo: string;
  corpo: string;
  em: number;
  /** Preenchido quando o celular confirmou (`notify.ack`). */
  entregueEm?: number;
  /** Para o app abrir no lugar certo: id da rotina/lembrete. */
  ref?: string;
}

/** Quantas entregas ficam guardadas (entregues ou não) para o histórico da aba Rotinas. */
const MAX_ENTREGAS = 60;

const store = new Store<{ rotinas: Rotina[]; entregas: Entrega[] }>({
  name: "rotinas",
  defaults: { rotinas: [], entregas: [] },
});

// ── Rotinas ───────────────────────────────────────────────────────────────────

export function listarRotinas(): Rotina[] {
  return store.get("rotinas").slice().sort((a, b) => a.hora.localeCompare(b.hora));
}

function validarHora(hora: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hora).trim());
  if (!m) throw new Error("hora inválida — use HH:MM");
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error("hora inválida — use HH:MM");
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const EVENTOS_VALIDOS = new Set<string>(Object.keys(ROTULO_EVENTO));

function validarGatilho(bruto: unknown): Gatilho | undefined {
  if (!bruto || typeof bruto !== "object") return undefined;
  const g = bruto as Record<string, unknown>;
  if (g.tipo !== "evento") return undefined;
  if (!EVENTOS_VALIDOS.has(String(g.evento))) throw new Error(`evento desconhecido: ${String(g.evento)}`);
  const num = (k: string, min: number, max: number) => {
    const v = Number(g[k]);
    return Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : undefined;
  };
  return {
    tipo: "evento",
    evento: g.evento as NomeEvento,
    app: typeof g.app === "string" && g.app.trim() ? g.app.trim() : undefined,
    minutos: num("minutos", 1, 720),
    limite: num("limite", 50, 100),
    cada: num("cada", 0, 1440),
  };
}

/** "às 07:30, dias úteis" ou "quando o Chrome abrir" — para as telas e o card. */
export function descreverGatilho(r: Rotina): string {
  const g = r.gatilho;
  if (!g || g.tipo === "hora") return `às ${r.hora}`;
  let base = ROTULO_EVENTO[g.evento];
  if ((g.evento === "app.abriu" || g.evento === "app.fechou") && g.app) base = base.replace("um programa", `o ${g.app}`);
  if (g.evento === "pc.ocioso") base += ` por ${g.minutos ?? 30} min`;
  if ((g.evento === "cpu.alta" || g.evento === "ram.alta") && g.limite) base += ` (${g.limite}%)`;
  return base;
}

export function salvarRotina(input: Partial<Rotina> & { nome: string; texto: string; hora: string }): Rotina {
  const nome = input.nome.trim();
  const texto = input.texto.trim();
  if (!nome) throw new Error("rotina sem nome");
  if (!texto) throw new Error("rotina sem texto");
  const gatilho = validarGatilho(input.gatilho);
  // Por evento a hora não importa, mas o campo continua obrigatório no formato: "00:00".
  const hora = validarHora(gatilho ? (input.hora || "00:00") : input.hora);
  const condicao = typeof input.condicao === "string" && input.condicao.trim() ? input.condicao.trim().slice(0, 300) : undefined;
  const dias = Array.isArray(input.dias) ? [...new Set(input.dias.map(Number).filter(d => d >= 0 && d <= 6))].sort() : [];
  const entregar = (Array.isArray(input.entregar) ? input.entregar : ["pc", "celular"]).filter(e => e === "pc" || e === "celular") as ("pc" | "celular")[];

  const todas = store.get("rotinas");
  const existente = input.id ? todas.find(r => r.id === input.id) : undefined;
  const rotina: Rotina = {
    id: existente?.id ?? crypto.randomBytes(8).toString("hex"),
    nome, texto, hora, dias,
    entregar: entregar.length ? entregar : ["pc"],
    gatilho,
    condicao,
    falar: Boolean(input.falar),
    ativa: input.ativa ?? existente?.ativa ?? true,
    criadaEm: existente?.criadaEm ?? Date.now(),
    ultimaExecucao: existente?.ultimaExecucao,
    ultimoResultado: existente?.ultimoResultado,
    historico: existente?.historico,
  };
  store.set("rotinas", existente ? todas.map(r => (r.id === rotina.id ? rotina : r)) : [...todas, rotina]);
  return rotina;
}

export function apagarRotina(id: string): boolean {
  const todas = store.get("rotinas");
  const resto = todas.filter(r => r.id !== id);
  if (resto.length === todas.length) return false;
  store.set("rotinas", resto);
  return true;
}

export function alternarRotina(id: string, ativa?: boolean): Rotina | null {
  const todas = store.get("rotinas");
  const r = todas.find(x => x.id === id);
  if (!r) return null;
  r.ativa = ativa ?? !r.ativa;
  store.set("rotinas", todas);
  return r;
}

function registrarExecucao(id: string, resultado: string): void {
  const todas = store.get("rotinas");
  const r = todas.find(x => x.id === id);
  if (!r) return;
  r.ultimaExecucao = Date.now();
  r.ultimoResultado = resultado.slice(0, 400);
  r.historico = [{ em: r.ultimaExecucao, resultado: resultado.slice(0, 200) }, ...(r.historico ?? [])].slice(0, 5);
  store.set("rotinas", todas);
}

/** Próximo disparo em epoch ms, para a Início dizer "amanhã 08:00". */
export function proximoDisparo(r: Rotina, agora = new Date()): number | null {
  if (!r.ativa) return null;
  if (r.gatilho && r.gatilho.tipo === "evento") return null;   // não tem hora: tem gatilho
  const [h, m] = r.hora.split(":").map(Number);
  for (let k = 0; k < 8; k++) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + k, h, m, 0, 0);
    if (d.getTime() <= agora.getTime()) continue;
    if (r.dias.length && !r.dias.includes(d.getDay())) continue;
    return d.getTime();
  }
  return null;
}

// ── Entregas ──────────────────────────────────────────────────────────────────

export function enfileirarEntrega(e: Omit<Entrega, "id" | "em"> & { em?: number }): Entrega {
  const entrega: Entrega = { id: crypto.randomBytes(6).toString("hex"), em: e.em ?? Date.now(), ...e };
  const todas = [...store.get("entregas"), entrega];
  // Poda pelo mais antigo, mas nunca joga fora o que ainda não foi entregue.
  while (todas.length > MAX_ENTREGAS) {
    const i = todas.findIndex(x => x.entregueEm);
    if (i < 0) break;
    todas.splice(i, 1);
  }
  store.set("entregas", todas);
  return entrega;
}

export function entregasPendentes(): Entrega[] {
  return store.get("entregas").filter(e => !e.entregueEm).sort((a, b) => a.em - b.em);
}

export function historicoEntregas(): Entrega[] {
  // Mais recente primeiro; empate no mesmo milissegundo desempata pela ordem de chegada.
  return store.get("entregas").map((e, i) => ({ e, i })).sort((a, b) => (b.e.em - a.e.em) || (b.i - a.i)).map(x => x.e);
}

export function confirmarEntregas(ids: string[]): number {
  const alvo = new Set(ids);
  const todas = store.get("entregas");
  let n = 0;
  for (const e of todas) {
    if (alvo.has(e.id) && !e.entregueEm) { e.entregueEm = Date.now(); n++; }
  }
  if (n) store.set("entregas", todas);
  return n;
}

// ── Agendador ─────────────────────────────────────────────────────────────────

export type ExecutorDeRotina = (rotina: Rotina) => Promise<string>;
export type EntregadorDeRotina = (rotina: Rotina, resultado: string) => void;
/** Avalia a `condicao` em português. `null` = não deu para avaliar (executa mesmo assim, avisando). */
export type AvaliadorDeCondicao = (condicao: string, contexto: string) => Promise<boolean | null>;

let tique: NodeJS.Timeout | null = null;
let executor: ExecutorDeRotina | null = null;
let entregador: EntregadorDeRotina | null = null;
let avaliador: AvaliadorDeCondicao | null = null;
let desligarEventos: (() => void) | null = null;
let rodando = false;

/**
 * Executa uma rotina agora (pelo tique, por evento ou pelo botão "rodar agora").
 *
 * `forcar` pula a condição — é o botão "rodar agora": quem clica quer ver o resultado.
 * Condição falsa registra "Condição não valeu" sem entregar: o dono vê no histórico que a
 * rotina olhou e decidiu não agir, em vez de achar que ela não rodou.
 */
export async function executarRotina(id: string, opcoes: { forcar?: boolean; contexto?: string } = {}): Promise<string> {
  const r = store.get("rotinas").find(x => x.id === id);
  if (!r) throw new Error("rotina não encontrada");
  if (!executor) throw new Error("agendador de rotinas não iniciado");

  if (r.condicao && !opcoes.forcar) {
    let vale: boolean | null = null;
    try { vale = avaliador ? await avaliador(r.condicao, opcoes.contexto ?? "") : null; }
    catch (e) { console.warn("[rotinas] condição não avaliada:", (e as Error).message); }
    if (vale === false) {
      registrarExecucao(r.id, `Condição não valeu (${r.condicao}); não executei.`);
      return "Condição não valeu; não executei.";
    }
  }

  let resultado: string;
  try {
    resultado = (await executor(r)).trim() || "Feito.";
  } catch (e) {
    resultado = `Não consegui: ${(e as Error).message}`;
  }
  registrarExecucao(r.id, resultado);
  entregador?.(r, resultado);
  return resultado;
}

/** Nome de app como o `apps.running` devolve, sem caixa, sufixo nem acento. */
const normalizarApp = (x: unknown) => semAcento(String(x ?? "")).replace(/#\d+$/, "").replace(/\.exe$/, "").replace(/[^a-z0-9]/g, "");

/** Um evento chegou: dispara as rotinas que o escutam, respeitando filtro e o `cada`. */
async function aoEvento(e: EventoPc): Promise<void> {
  for (const r of store.get("rotinas")) {
    const g = r.gatilho;
    if (!r.ativa || !g || g.tipo !== "evento" || g.evento !== e.nome) continue;
    if ((e.nome === "app.abriu" || e.nome === "app.fechou") && g.app) {
      const alvo = normalizarApp(g.app), app = normalizarApp(e.dados.app), titulo = normalizarApp(e.dados.titulo);
      if (!app.includes(alvo) && !titulo.includes(alvo)) continue;
    }
    // Ocioso: o main emite nos marcos 5/15/30/60/120; a rotina dispara no menor marco que
    // cobre os minutos dela — e só nele, senão "30 min" dispararia de novo aos 60 e 120.
    if (e.nome === "pc.ocioso") {
      const alvo = MARCOS_OCIOSO.find(m => m >= (g.minutos ?? 30)) ?? 120;
      if (Number(e.dados.minutos) !== alvo) continue;
    }
    if ((e.nome === "cpu.alta" || e.nome === "ram.alta") && Number(e.dados.valor ?? 0) < (g.limite ?? 90)) continue;
    // Intervalo mínimo entre disparos: 60 min por padrão, 0 = sem limite.
    const cadaMs = (g.cada ?? 60) * 60_000;
    if (cadaMs && r.ultimaExecucao && e.em - r.ultimaExecucao < cadaMs) continue;
    const contexto = `Evento: ${ROTULO_EVENTO[e.nome]}${Object.keys(e.dados).length ? " " + JSON.stringify(e.dados) : ""}`;
    await executarRotina(r.id, { contexto }).catch(err => console.error("[rotinas] por evento:", err));
  }
}

async function verificar(): Promise<void> {
  if (rodando) return;
  rodando = true;
  try {
    const agora = new Date();
    const hhmm = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
    for (const r of store.get("rotinas")) {
      if (!r.ativa || r.hora !== hhmm) continue;
      if (r.gatilho && r.gatilho.tipo === "evento") continue;
      if (r.dias.length && !r.dias.includes(agora.getDay())) continue;
      // Já rodou neste minuto (o tique é de 30 s para não perder o minuto por deriva).
      if (r.ultimaExecucao && agora.getTime() - r.ultimaExecucao < 90_000) continue;
      await executarRotina(r.id);
    }
  } finally {
    rodando = false;
  }
}

export function iniciarRotinas(exec: ExecutorDeRotina, entrega: EntregadorDeRotina, avaliar?: AvaliadorDeCondicao): void {
  executor = exec;
  entregador = entrega;
  avaliador = avaliar ?? null;
  if (tique) clearInterval(tique);
  tique = setInterval(() => { verificar().catch(err => console.error("[rotinas]", err)); }, 30_000);
  desligarEventos?.();
  desligarEventos = ouvirEventos(e => { aoEvento(e).catch(err => console.error("[rotinas] evento:", err)); });
}

export function pararRotinas(): void {
  if (tique) clearInterval(tique);
  tique = null;
  desligarEventos?.();
  desligarEventos = null;
}
