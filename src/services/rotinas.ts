import Store from "electron-store";
import * as crypto from "node:crypto";

/**
 * Rotinas — automações agendadas — e a fila de entregas para o celular.
 *
 * O pedido (bloco 68): "todo dia me mandar tal coisa". Uma rotina é um texto que o
 * ELYSIUM executa numa hora, em certos dias, como se o Zak tivesse falado — passa pelo
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

export interface Rotina {
  id: string;
  nome: string;
  /** O que o ELYSIUM executa, como se tivesse sido dito. */
  texto: string;
  /** "HH:MM", hora local. */
  hora: string;
  /** 0 = domingo … 6 = sábado. Vazio = todos os dias. */
  dias: number[];
  /** Para onde vai a resposta. */
  entregar: ("pc" | "celular")[];
  /** Falar a resposta no PC. */
  falar: boolean;
  ativa: boolean;
  criadaEm: number;
  ultimaExecucao?: number;
  ultimoResultado?: string;
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

export function salvarRotina(input: Partial<Rotina> & { nome: string; texto: string; hora: string }): Rotina {
  const nome = input.nome.trim();
  const texto = input.texto.trim();
  if (!nome) throw new Error("rotina sem nome");
  if (!texto) throw new Error("rotina sem texto");
  const hora = validarHora(input.hora);
  const dias = Array.isArray(input.dias) ? [...new Set(input.dias.map(Number).filter(d => d >= 0 && d <= 6))].sort() : [];
  const entregar = (Array.isArray(input.entregar) ? input.entregar : ["pc", "celular"]).filter(e => e === "pc" || e === "celular") as ("pc" | "celular")[];

  const todas = store.get("rotinas");
  const existente = input.id ? todas.find(r => r.id === input.id) : undefined;
  const rotina: Rotina = {
    id: existente?.id ?? crypto.randomBytes(8).toString("hex"),
    nome, texto, hora, dias,
    entregar: entregar.length ? entregar : ["pc"],
    falar: Boolean(input.falar),
    ativa: input.ativa ?? existente?.ativa ?? true,
    criadaEm: existente?.criadaEm ?? Date.now(),
    ultimaExecucao: existente?.ultimaExecucao,
    ultimoResultado: existente?.ultimoResultado,
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
  store.set("rotinas", todas);
}

/** Próximo disparo em epoch ms, para a Início dizer "amanhã 08:00". */
export function proximoDisparo(r: Rotina, agora = new Date()): number | null {
  if (!r.ativa) return null;
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

let tique: NodeJS.Timeout | null = null;
let executor: ExecutorDeRotina | null = null;
let entregador: EntregadorDeRotina | null = null;
let rodando = false;

/** Executa uma rotina agora (pelo tique ou pelo botão "rodar agora"). */
export async function executarRotina(id: string): Promise<string> {
  const r = store.get("rotinas").find(x => x.id === id);
  if (!r) throw new Error("rotina não encontrada");
  if (!executor) throw new Error("agendador de rotinas não iniciado");
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

async function verificar(): Promise<void> {
  if (rodando) return;
  rodando = true;
  try {
    const agora = new Date();
    const hhmm = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
    for (const r of store.get("rotinas")) {
      if (!r.ativa || r.hora !== hhmm) continue;
      if (r.dias.length && !r.dias.includes(agora.getDay())) continue;
      // Já rodou neste minuto (o tique é de 30 s para não perder o minuto por deriva).
      if (r.ultimaExecucao && agora.getTime() - r.ultimaExecucao < 90_000) continue;
      await executarRotina(r.id);
    }
  } finally {
    rodando = false;
  }
}

export function iniciarRotinas(exec: ExecutorDeRotina, entrega: EntregadorDeRotina): void {
  executor = exec;
  entregador = entrega;
  if (tique) clearInterval(tique);
  tique = setInterval(() => { verificar().catch(err => console.error("[rotinas]", err)); }, 30_000);
}

export function pararRotinas(): void {
  if (tique) clearInterval(tique);
  tique = null;
}
