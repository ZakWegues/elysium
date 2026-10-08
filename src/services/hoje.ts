import { getConfig } from "../main/config";
import { climaAgora, type Clima } from "./clima";
import { listPending } from "./scheduler";
import { listarTimers } from "./timers";
import { listarListas } from "./listas";
import { listarHabitos, listarMetas, resumirHabito, type HabitoResumo, type Meta } from "./habitos";
import { listarRotinas, proximoDisparo } from "./rotinas";
import { verificarSaude } from "./saude";
import { listarTarefas, type Tarefa } from "./tarefas";
import { callChat } from "./llm";
import { getApiKey } from "../main/config";

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
  /** Lembretes SEM tarefa (os antigos, os semanais); os outros aparecem em `tarefas`. */
  lembretes: { id: string; texto: string; em: number }[];
  /** Fase 17: a lista de afazeres — pendentes por prazo, e as feitas hoje com a ressalva. */
  tarefas: Tarefa[];
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

/**
 * A frase do Hoje com gente por trás (fase 17, 08/10): o Zak gostou da página, mas a linha
 * "Sistemas no ar. Dois lembretes…" soava como relatório de máquina. A Ely escreve duas
 * frases a partir dos FATOS do painel — o que importa hoje, com calor e sem inventar.
 * Cache de 20 min pela impressão digital dos fatos: abrir a aba de novo não chama o modelo.
 * Qualquer falha (sem rede, sem modelo, demorou) cai na frase fixa.
 */
let cacheHumano: { chave: string; frase: string; em: number } | null = null;

/** Os fatos em linhas curtas, do mais importante ao menos. Pura, para teste. */
export function fatosDoDia(p: Omit<PainelHoje, "frase" | "geradoEm">, agora = new Date()): string[] {
  const f: string[] = [];
  const hora = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1).getTime();
  const depois = amanha + 86_400_000;
  const pend = p.tarefas.filter(t => !t.feita);
  const atrasadas = pend.filter(t => t.prazo && t.prazo < agora.getTime());
  const hoje = pend.filter(t => t.prazo && t.prazo >= agora.getTime() && t.prazo < amanha);
  const deAmanha = pend.filter(t => t.prazo && t.prazo >= amanha && t.prazo < depois);
  if (atrasadas.length) f.push(`Atrasadas: ${atrasadas.map(t => t.texto).join(", ")}`);
  if (hoje.length) f.push(`Hoje: ${hoje.map(t => `${t.texto} às ${hora(t.prazo!)}`).join(", ")}`);
  if (deAmanha.length) f.push(`Amanhã: ${deAmanha.map(t => t.texto).join(", ")}`);
  const feitas = p.tarefas.filter(t => t.feita);
  if (feitas.length) f.push(`Já concluídas hoje: ${feitas.map(t => t.ressalva ? `${t.texto} (ressalva: ${t.ressalva})` : t.texto).join(", ")}`);
  const faltam = p.habitos.filter(h => !h.feitoHoje);
  if (faltam.length) f.push(`Hábitos que faltam hoje: ${faltam.map(h => h.sequencia >= 3 ? `${h.nome} (sequência de ${h.sequencia} dias em jogo)` : h.nome).join(", ")}`);
  else if (p.habitos.length) f.push("Todos os hábitos de hoje feitos");
  if (p.clima) f.push(`Clima: ${Math.round(p.clima.temperatura)} graus, ${p.clima.descricao}${p.clima.chuvaHoje ? ", com chuva hoje" : ""}`);
  if (p.alertas.length) f.push(`Alertas do PC: ${p.alertas.map(a => a.titulo).join(", ")}`);
  if (p.timers.length) f.push(`Timers correndo: ${p.timers.map(t => t.nome || "sem nome").join(", ")}`);
  return f;
}

async function fraseHumana(p: Omit<PainelHoje, "frase" | "geradoEm">, reserva: string, tratamento: string, agora: Date): Promise<string> {
  const fatos = fatosDoDia(p, agora);
  const chave = `${agora.getHours() < 12 ? "m" : agora.getHours() < 18 ? "t" : "n"}|${tratamento}|${fatos.join("|")}`;
  if (cacheHumano && cacheHumano.chave === chave && Date.now() - cacheHumano.em < 20 * 60_000) return cacheHumano.frase;
  const provider = getApiKey() ? "groq" : "ollama";
  const cfg = getConfig();
  try {
    const texto = await callChat({
      provider,
      model: provider === "groq" ? cfg.brainModel : cfg.ollamaChatModel,
      temperature: 0.7,
      maxTokens: 160,
      timeoutMs: 8000,
      messages: [
        { role: "system", content: `Você é a Ely, a assistente pessoal (no estilo da FRIDAY do Tony Stark: calorosa, esperta, um toque de humor). Escreva o resumo do topo da página "Hoje" em NO MÁXIMO duas frases curtas, em português do Brasil, falando direto com a pessoa${tratamento ? ` (chame de "${tratamento}" no máximo uma vez)` : ""}. Destaque o que mais importa (prova ou compromisso amanhã, algo atrasado, uma sequência de hábito em jogo) e, se fizer sentido, um incentivo ou dica prática. Use SÓ os fatos dados — não invente nada. Sem listas, sem emoji, sem aspas, sem saudação (a saudação já está acima). Se não houver nada, diga algo leve e gentil sobre o dia tranquilo.` },
        { role: "user", content: `Agora: ${agora.toLocaleString("pt-BR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}.\nFatos:\n${fatos.length ? fatos.map(x => `- ${x}`).join("\n") : "- nada pendente"}` },
      ],
    });
    const frase = texto.replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").trim();
    if (!frase || frase.length > 400) return reserva;
    cacheHumano = { chave, frase, em: Date.now() };
    return frase;
  } catch {
    return reserva;
  }
}

export async function montarPainelHoje(agora = new Date()): Promise<PainelHoje> {
  const [clima, alertas] = await Promise.all([
    seguro(() => climaAgora(), null),
    seguro(async () => (await verificarSaude()).filter(i => i.nivel !== "ok").map(i => ({ titulo: i.titulo, detalhe: i.detalhe, nivel: i.nivel })), [] as PainelHoje["alertas"]),
  ]);
  const limite = fimDoDia(agora);
  const tarefas = await seguro(() => listarTarefas(), [] as Tarefa[]);
  const comTarefa = new Set(tarefas.flatMap(t => t.lembreteIds ?? []));
  const lembretes = await seguro(() => listPending().filter(r => r.dueAt <= limite && !comTarefa.has(r.id)).sort((a, b) => a.dueAt - b.dueAt).slice(0, 8).map(r => ({ id: r.id, texto: r.text, em: r.dueAt })), []);
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
  const tratamento = cfg.tratamento ?? "chefe";
  const reserva = fraseDeAbertura({
    lembretesHoje: lembretes.length + tarefas.filter(t => !t.feita && t.prazo && t.prazo <= limite).length,
    habitosFaltando: habitos.filter(h => !h.feitoHoje).length,
    chuva: !!clima?.chuvaHoje,
    alertas: alertas.length,
    timers: timers.length,
  });
  const base = {
    saudacao: saudacaoStark(agora.getHours(), tratamento),
    data: agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }),
    clima: clima ? { cidade: clima.cidade, temperatura: clima.temperatura, max: clima.max, min: clima.min, descricao: clima.descricao, icone: clima.icone, chuvaHoje: clima.chuvaHoje } : null,
    lembretes, tarefas, timers, listas, habitos, metas, proximaRotina, alertas,
  };
  return { ...base, frase: await fraseHumana(base, reserva, tratamento, agora), geradoEm: Date.now() };
}
