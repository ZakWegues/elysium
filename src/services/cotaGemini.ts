import * as fs from "node:fs";
import * as path from "node:path";
import { app } from "electron";

/**
 * A cota do Gemini no plano gratuito (26/10, pedido do Zak: avisar quando a voz ou a cota geral
 * estiver acabando). O Google não tem API que diga quanto sobra: aqui se CONTA o uso de cada modelo
 * no dia do Google (vira à meia-noite do Pacífico — 4 ou 5 h no Brasil), e o LIMITE se aprende do
 * próprio 429 (o erro traz `quotaValue`). O Hermes chama o Gemini por conta própria; o uso dele
 * vem do log dele (`API call #… provider=gemini`).
 */

export type Categoria = "voz" | "texto";
type Modelo = { usos: number; limite?: number; esgotado?: boolean; pausaAte?: number; categoria: Categoria };
type Estado = { dia: string; modelos: Record<string, Modelo>; avisado: Record<string, boolean> };

/** O dia do Google para a cota: a data no fuso do Pacífico. Pura. */
export function diaDaCota(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** O limite diário que o 429 informa (`quotaValue` de uma violação "per day"), se houver. Pura. */
export function limiteDo429(corpo: string): number | null {
  try {
    const j = JSON.parse(corpo) as { error?: { details?: { violations?: { quotaId?: string; quotaMetric?: string; quotaValue?: string }[] }[] } };
    for (const d of j.error?.details ?? []) for (const v of d.violations ?? []) {
      if (/day/i.test(`${v.quotaId ?? ""} ${v.quotaMetric ?? ""}`) && Number(v.quotaValue) > 0) return Number(v.quotaValue);
    }
  } catch { /* corpo sem JSON */ }
  const m = /quotaValue["\s:]+"?(\d+)/.exec(corpo);
  return m ? Number(m[1]) : null;
}

/**
 * 09/11: nem todo 429 é a cota do dia. O limite POR MINUTO também dá 429, e antes qualquer um
 * marcava o modelo como esgotado até a meia-noite do Pacífico — modelos bons ficavam fora o dia
 * inteiro e o aviso "a cota acabou" saía à toa. `porDia` só com uma violação diária; `esperaMs`
 * vem do RetryInfo ("37s"). Pura.
 */
export function tipoDo429(corpo: string): { porDia: boolean; esperaMs: number | null } {
  let porDia = false, esperaMs: number | null = null;
  try {
    const j = JSON.parse(corpo) as { error?: { details?: { violations?: { quotaId?: string; quotaMetric?: string }[]; retryDelay?: string }[] } };
    for (const d of j.error?.details ?? []) {
      for (const v of d.violations ?? []) if (/day/i.test(`${v.quotaId ?? ""} ${v.quotaMetric ?? ""}`)) porDia = true;
      const s = /^(\d+(?:\.\d+)?)s$/.exec(d.retryDelay ?? "");
      if (s) esperaMs = Math.ceil(Number(s[1]) * 1000);
    }
  } catch { /* corpo sem JSON */ }
  return { porDia, esperaMs };
}

let estado: Estado | null = null;
let avisar: ((titulo: string, corpo: string) => void) | null = null;

function arquivo(): string {
  return path.join(app.getPath("userData"), "cota-gemini.json");
}

function carregar(): Estado {
  const dia = diaDaCota();
  if (estado?.dia === dia) return estado;
  let salvo: Estado | null = null;
  try { salvo = JSON.parse(fs.readFileSync(arquivo(), "utf8")) as Estado; } catch { /* primeiro uso */ }
  // Dia novo: zera os usos, mas os limites aprendidos ficam (são da conta, não do dia).
  const modelos: Record<string, Modelo> = {};
  for (const [m, v] of Object.entries(salvo?.modelos ?? {})) modelos[m] = salvo?.dia === dia ? v : { usos: 0, limite: v.limite, categoria: v.categoria };
  estado = { dia, modelos, avisado: salvo?.dia === dia ? salvo.avisado : {} };
  return estado;
}

function salvar(): void {
  try { fs.writeFileSync(arquivo(), JSON.stringify(estado)); } catch { /* sem disco: fica na memória */ }
}

export function ligarAvisoDeCota(fn: (titulo: string, corpo: string) => void): void {
  avisar = fn;
}

/** Uma chamada ao Gemini: conta, aprende o limite do 429 e avisa (uma vez por dia) perto do fim. */
export function registrarUsoGemini(categoria: Categoria, modelo: string, status: number, corpoErro = ""): void {
  let e: Estado;
  try { e = carregar(); } catch { return; }
  const m = e.modelos[modelo] ??= { usos: 0, categoria };
  if (status >= 200 && status < 300) m.usos++;
  if (status === 429) {
    const { porDia, esperaMs } = tipoDo429(corpoErro);
    if (porDia) {
      m.esgotado = true;
      const limite = limiteDo429(corpoErro);
      if (limite) m.limite = limite;
    } else {
      // Limite por minuto (ou 429 sem detalhe): só uma pausa curta.
      m.pausaAte = Date.now() + (esperaMs ?? 60_000);
    }
  }
  salvar();
  verificarAviso(e, modelo, m);
}

function verificarAviso(e: Estado, modelo: string, m: Modelo): void {
  if (!avisar) return;
  const nome = m.categoria === "voz" ? "a voz do Gemini" : `o ${modelo}`;
  if (m.esgotado && !e.avisado[`${modelo}:fim`]) {
    e.avisado[`${modelo}:fim`] = true; salvar();
    avisar("ELYSIUM — cota do Gemini", `A cota de hoje acabou para ${nome}. ${m.categoria === "voz" ? "A Ely fala com a voz da Microsoft até a cota voltar" : "O app usa outro modelo"} (volta às ${horaDaVirada()}).`);
  } else if (m.limite && m.usos >= m.limite * 0.8 && !e.avisado[`${modelo}:80`]) {
    e.avisado[`${modelo}:80`] = true; salvar();
    avisar("ELYSIUM — cota do Gemini", `${m.usos} de ${m.limite} usos de hoje para ${nome}. Volta às ${horaDaVirada()}.`);
  }
}

/** A hora local em que a cota volta (meia-noite do Pacífico). */
export function horaDaVirada(agora = new Date()): string {
  for (let h = 0; h < 30; h++) {
    const t = new Date(agora.getTime() + h * 3600_000);
    t.setMinutes(0, 0, 0);
    if (diaDaCota(t) !== diaDaCota(agora)) return t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return "meia-noite do Pacífico";
}

export function cotaEsgotada(modelo: string): boolean {
  try { const m = carregar().modelos[modelo]; return !!m?.esgotado || (m?.pausaAte ?? 0) > Date.now(); } catch { return false; }
}

// ── o uso do Hermes, pelo log dele ─────────────────────────────────────────────────────────

let cacheHermes: { em: number; uso: Record<string, number>; esgotados: string[] } | null = null;

/** Conta as chamadas do Hermes ao Gemini no dia da cota, no texto do log. Pura. */
export function usoNoLogDoHermes(texto: string, desdeLocal: Date): { uso: Record<string, number>; esgotados: string[] } {
  const uso: Record<string, number> = {};
  const esgotados = new Set<string>();
  for (const linha of texto.split(/\r?\n/)) {
    const d = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/.exec(linha);
    if (!d || new Date(d[1].replace(" ", "T")) < desdeLocal) continue;
    const c = /API call #\d+: model=(\S+) provider=gemini/.exec(linha);
    if (c) uso[c[1]] = (uso[c[1]] ?? 0) + 1;
    if (/provider=gemini/.test(linha) && /RESOURCE_EXHAUSTED|\b429\b/.test(linha)) {
      const m = /model=(gemini[\w.-]+)/.exec(linha);
      if (m) esgotados.add(m[1]);
    }
  }
  return { uso, esgotados: [...esgotados].filter(Boolean) };
}

/** Início do dia da cota, no relógio local. */
function inicioDoDia(agora = new Date()): Date {
  let t = new Date(agora);
  t.setMinutes(0, 0, 0);
  for (let h = 0; h < 26 && diaDaCota(new Date(t.getTime() - 3600_000)) === diaDaCota(agora); h++) t = new Date(t.getTime() - 3600_000);
  return t;
}

function usoDoHermes(): { uso: Record<string, number>; esgotados: string[] } {
  if (cacheHermes && Date.now() - cacheHermes.em < 60_000) return cacheHermes;
  const log = path.join(process.env.LOCALAPPDATA ?? "", "hermes", "logs", "agent.log");
  let r = { uso: {} as Record<string, number>, esgotados: [] as string[] };
  try {
    // Só o fim do arquivo: um dia de log cabe folgado em 3 MB.
    const tam = fs.statSync(log).size, ler = Math.min(tam, 3_000_000);
    const fd = fs.openSync(log, "r");
    const buf = Buffer.alloc(ler);
    fs.readSync(fd, buf, 0, ler, tam - ler);
    fs.closeSync(fd);
    r = usoNoLogDoHermes(buf.toString("utf8"), inicioDoDia());
  } catch { /* sem Hermes ou sem log */ }
  cacheHermes = { em: Date.now(), ...r };
  return r;
}

/** Para Ajustes: uso do dia por modelo (do app e do Hermes), limites aprendidos e a hora da virada. */
export function resumoDaCota(): { dia: string; virada: string; modelos: { modelo: string; categoria: Categoria | "hermes"; usos: number; limite?: number; esgotado: boolean }[] } {
  const e = carregar();
  const h = usoDoHermes();
  const lista = Object.entries(e.modelos).map(([modelo, m]) => ({ modelo, categoria: m.categoria as Categoria | "hermes", usos: m.usos + (h.uso[modelo] ?? 0), limite: m.limite, esgotado: !!m.esgotado || h.esgotados.includes(modelo) }));
  for (const [modelo, usos] of Object.entries(h.uso)) if (!e.modelos[modelo]) lista.push({ modelo, categoria: "hermes", usos, limite: undefined, esgotado: h.esgotados.includes(modelo) });
  return { dia: e.dia, virada: horaDaVirada(), modelos: lista.sort((a, b) => b.usos - a.usos) };
}
