import { getConfig } from "../main/config";
import { climaAgora, type Clima } from "./clima";
import { listPending } from "./scheduler";
import { listarTimers } from "./timers";
import { listarListas } from "./listas";
import { listarHabitos, listarMetas, resumirHabito, type HabitoResumo, type Meta } from "./habitos";
import { listarRotinas, proximoDisparo } from "./rotinas";
import { verificarSaude } from "./saude";

/**
 * Central "Hoje" (fase 16, 07/10): o briefing de manhã do Jarvis, numa tela. Junta o que
 * já existe espalhado (clima, lembretes, timers, listas, rotinas, saúde do PC) mais hábitos
 * e metas, numa chamada só (`hoje.painel`), para o PC e o celular desenharem igual.
 *
 * Cada fonte é independente: uma que falha (clima sem rede, saúde demorando) vira vazio,
 * não derruba o painel. As frases ficam em funções puras, para teste.
 */

export interface PainelHoje {
  saudacao: string;
  frase: string;
  data: string;
  clima: Pick<Clima, "cidade" | "temperatura" | "max" | "min" | "descricao" | "icone" | "chuvaHoje"> | null;
  lembretes: { id: string; texto: string; em: number }[];
  timers: { id: string; nome: string; fimEm: number }[];
  listas: { id: string; nome: string; pendentes: number; itens: string[] }[];
  habitos: HabitoResumo[];
  metas: Meta[];
  proximaRotina: { nome: string; em: number } | null;
  alertas: { titulo: string; detalhe: string; nivel: string }[];
  geradoEm: number;
}

/** "Bom dia, chefe." — a saudação no tom da Ely (FRIDAY). Pura. */
export function saudacaoStark(hora: number, tratamento: string): string {
  const parte = hora < 5 ? "Boa madrugada" : hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const t = tratamento.trim();
  return t ? `${parte}, ${t}.` : `${parte}.`;
}

const POR_EXTENSO = ["nenhum", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
const contar = (n: number, um: string, varios: string) => `${n <= 10 ? POR_EXTENSO[n] : n} ${n === 1 ? um : varios}`;

/**
 * A frase de abertura: o que pede atenção hoje, em uma linha, no estilo "relatório de
 * status". Sem nada pendente, diz isso — também é informação. Pura.
 */
export function fraseDeAbertura(f: { lembretesHoje: number; habitosFaltando: number; chuva: boolean; alertas: number; timers: number }): string {
  const partes: string[] = [];
  if (f.alertas) partes.push(f.alertas === 1 ? "um alerta no PC" : `${f.alertas} alertas no PC`);
  if (f.lembretesHoje) partes.push(`${contar(f.lembretesHoje, "lembrete", "lembretes")} para hoje`);
  if (f.timers) partes.push(contar(f.timers, "timer correndo", "timers correndo"));
  if (f.habitosFaltando) partes.push(`${f.habitosFaltando === 1 ? "falta um hábito" : `faltam ${f.habitosFaltando} hábitos`}`);
  if (f.chuva) partes.push("chuva no radar");
  if (!partes.length) return "Sistemas no ar. Nada pendente por enquanto.";
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
  return `Sistemas no ar. ${lista.charAt(0).toUpperCase()}${lista.slice(1)}.`;
}

function fimDoDia(agora: Date): number {
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59).getTime();
}

async function seguro<T>(fn: () => Promise<T> | T, padrao: T): Promise<T> {
  try { return await fn(); } catch { return padrao; }
}

export async function montarPainelHoje(agora = new Date()): Promise<PainelHoje> {
  const [clima, alertas] = await Promise.all([
    seguro(() => climaAgora(), null),
    seguro(async () => (await verificarSaude()).filter(i => i.nivel !== "ok").map(i => ({ titulo: i.titulo, detalhe: i.detalhe, nivel: i.nivel })), [] as PainelHoje["alertas"]),
  ]);
  const limite = fimDoDia(agora);
  const lembretes = await seguro(() => listPending().filter(r => r.dueAt <= limite).sort((a, b) => a.dueAt - b.dueAt).slice(0, 8).map(r => ({ id: r.id, texto: r.text, em: r.dueAt })), []);
  const timers = await seguro(() => listarTimers().map(t => ({ id: t.id, nome: t.nome, fimEm: t.fimEm })), []);
  const listas = await seguro(() => listarListas().map(l => {
    const pend = l.itens.filter(i => !i.feito);
    return { id: l.id, nome: l.nome, pendentes: pend.length, itens: pend.slice(0, 5).map(i => i.texto) };
  }).filter(l => l.pendentes > 0), []);
  const habitos = await seguro(() => listarHabitos().map(h => resumirHabito(h, agora)).filter(h => h.valeHoje), [] as HabitoResumo[]);
  const metas = await seguro(() => listarMetas().filter(m => !m.concluidaEm), [] as Meta[]);
  const proximaRotina = await seguro(() => {
    let melhor: { nome: string; em: number } | null = null;
    for (const r of listarRotinas()) {
      if (!r.ativa) continue;
      const em = proximoDisparo(r, agora);
      if (em && em <= limite && (!melhor || em < melhor.em)) melhor = { nome: r.nome, em };
    }
    return melhor;
  }, null);

  const cfg = getConfig();
  return {
    saudacao: saudacaoStark(agora.getHours(), cfg.tratamento ?? "chefe"),
    frase: fraseDeAbertura({
      lembretesHoje: lembretes.length,
      habitosFaltando: habitos.filter(h => !h.feitoHoje).length,
      chuva: !!clima?.chuvaHoje,
      alertas: alertas.length,
      timers: timers.length,
    }),
    data: agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }),
    clima: clima ? { cidade: clima.cidade, temperatura: clima.temperatura, max: clima.max, min: clima.min, descricao: clima.descricao, icone: clima.icone, chuvaHoje: clima.chuvaHoje } : null,
    lembretes, timers, listas, habitos, metas, proximaRotina, alertas,
    geradoEm: Date.now(),
  };
}
