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
import { ideiaDoDia, testesFeitos } from "./ideiasDoDia";
import { estadoAtualizacao, notasDaVersaoAtual, secoesDasNotas } from "./atualizacao";
import { app } from "electron";

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
  /** Fase 18: as rotinas que ainda rodam hoje e as que já rodaram (com o resultado). */
  rotinasHoje: { id: string; nome: string; em: number }[];
  rotinasRodaram: { id: string; nome: string; em: number; ok: boolean; resultado: string }[];
  alertas: { titulo: string; detalhe: string; nivel: string }[];
  /** Card ELYSIUM: versão, o que veio na última atualização e o que testar. */
  elysium: { versao: string; novidades: string[]; paraTestar: { item: string; feito: boolean }[]; atualizacaoPronta: string | null };
  /** "Algo legal para fazer hoje" (renova: `hoje.ideia`). */
  ideia: string | null;
  /** Fase 18: "Meu amanhã" — depois das 18h, o que vem amanhã e o clima. */
  amanha: { tarefas: Tarefa[]; clima: { max: number; min: number; icone: string } | null } | null;
  /** Seções escondidas pelo dono (cada app esconde a sua). */
  ocultos: string[];
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
export function fatosDoDia(p: Omit<PainelHoje, "frase" | "geradoEm" | "ideia" | "elysium" | "amanha" | "ocultos">, agora = new Date()): string[] {
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
  if (p.rotinasHoje?.length) f.push(`Rotinas ainda hoje: ${p.rotinasHoje.map(r => `${r.nome} às ${hora(r.em)}`).join(", ")}`);
  return f;
}

async function fraseHumana(p: Omit<PainelHoje, "frase" | "geradoEm" | "ideia" | "elysium" | "amanha" | "ocultos">, reserva: string, tratamento: string, agora: Date): Promise<string> {
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
      // O gpt-oss raciocina antes de responder e o raciocínio conta no teto: com 160 a
      // resposta saía vazia e caía sempre na frase fixa.
      maxTokens: 900,
      esforco: "low",
      timeoutMs: 8000,
      messages: [
        { role: "system", content: `Você é a Ely, a assistente pessoal (no estilo da FRIDAY do Tony Stark: calorosa, esperta, um toque de humor). Escreva o resumo do topo da página "Hoje" em NO MÁXIMO duas frases curtas (até uns 220 caracteres no total), em português do Brasil, falando direto com a pessoa${tratamento ? ` (chame de "${tratamento}" no máximo uma vez)` : ""}. Destaque o que mais importa (prova ou compromisso amanhã, algo atrasado, uma sequência de hábito em jogo) e, se fizer sentido, um incentivo ou dica prática. Use SÓ os fatos dados — não invente nada. Sem listas, sem emoji, sem aspas, sem saudação (a saudação já está acima). Se não houver nada, diga algo leve e gentil sobre o dia tranquilo.` },
        { role: "user", content: `Agora: ${agora.toLocaleString("pt-BR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}.\nFatos:\n${fatos.length ? fatos.map(x => `- ${x}`).join("\n") : "- nada pendente"}` },
      ],
    });
    const frase = texto.replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").trim();
    if (!frase || frase.length > 400) { console.warn(`[hoje] frase do modelo descartada (${frase.length} caracteres)`); return reserva; }
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
  const rotinas = await seguro(() => listarRotinas(), []);
  const rotinasHoje = rotinas
    .filter(r => r.ativa)
    .map(r => ({ id: r.id, nome: r.nome, em: proximoDisparo(r, agora) }))
    .filter((r): r is { id: string; nome: string; em: number } => !!r.em && r.em <= limite)
    .sort((a, b) => a.em - b.em);
  const inicioDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const rotinasRodaram = rotinas
    .flatMap(r => (r.historico ?? []).filter(h => h.em >= inicioDoDia).map(h => ({ id: r.id, nome: r.nome, em: h.em, resultado: h.resultado, ok: !/falh|erro|não consegui|nao consegui/i.test(h.resultado) })))
    .sort((a, b) => b.em - a.em)
    .slice(0, 8);
  const proximaRotina = rotinasHoje[0] ? { nome: rotinasHoje[0].nome, em: rotinasHoje[0].em } : null;

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
    lembretes, tarefas, timers, listas, habitos, metas, proximaRotina, rotinasHoje, rotinasRodaram, alertas,
  };
  const fatos = fatosDoDia(base, agora);
  // Treino e nutrição ficam fora do Hoje (o Zak, 08/10): os dados estão no corpo.json e a Ely
  // responde quando ele pergunta (ferramentas treino_de_hoje, ver_meta_calorias).
  const [frase, ideia, elysium] = await Promise.all([
    fraseHumana(base, reserva, tratamento, agora),
    seguro(() => ideiaDoDia(fatos, false, agora), null),
    cardElysium(),
  ]);
  return { ...base, frase, ideia, elysium, amanha: meuAmanha(tarefas, clima, agora), ocultos: cfg.hojeOcultos ?? [], geradoEm: Date.now() };
}

/**
 * "Meu amanhã" (fase 18): o pedido mais repetido do Microsoft To Do é planejar o dia seguinte
 * na véspera. Depois das 18h o Hoje mostra o que vem amanhã — tarefas com prazo e o clima.
 * Pura (dados → card), para teste.
 */
export function meuAmanha(tarefas: Tarefa[], clima: Clima | null, agora = new Date()): PainelHoje["amanha"] {
  if (agora.getHours() < 18) return null;
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1).getTime();
  const fim = inicio + 86_400_000;
  const deAmanha = tarefas.filter(t => !t.feita && t.prazo !== undefined && t.prazo >= inicio && t.prazo < fim);
  return { tarefas: deAmanha, clima: clima?.amanha ?? null };
}

/** Card ELYSIUM: versão rodando, o que veio nela e o checklist "Para testar". */
async function cardElysium(): Promise<PainelHoje["elysium"]> {
  const versao = app.getVersion();
  const notas = await seguro(() => notasDaVersaoAtual(), { versao, texto: "" });
  const { novidades, paraTestar } = secoesDasNotas(notas.texto);
  const feitos = new Set(testesFeitos(versao));
  const e = estadoAtualizacao();
  return {
    versao,
    novidades,
    paraTestar: paraTestar.map(item => ({ item, feito: feitos.has(item) })),
    atualizacaoPronta: e.desktop?.pronto ? e.desktop.versao : null,
  };
}
