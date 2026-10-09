import { importarTarefas, listarTarefasTodas, Tarefa } from "./tarefas";
import { exportarCorpo, importarCorpo, listarTreinos } from "./corpo";
import { app } from "electron";
import { AppConfig, getOverrides, setOverride } from "../main/config";
import { addFact, listFacts } from "./memoryStore";
import { createReminder, listPending, Reminder } from "./scheduler";
import { getAllPresets, PresetEntry, PresetsMap, savePreset } from "./presetsStore";
import { listarRotinas, Rotina, salvarRotina } from "./rotinas";
import { ChatSession, listSessions, mergeSession } from "./chatSessionsStore";
import { importarListas, Lista, listarListas } from "./listas";
import { Habito, importarHabitos, listarHabitos, listarMetas, Meta } from "./habitos";
import { Episodio, importarEpisodios, listarEpisodios } from "./episodios";
import { importarModos, modosParaBackup, type Modo } from "./modos";
import { importarCartoes, listarCartoes, type Cartao } from "./cartoes";

/**
 * Exportar e importar tudo o que é do Zak (bloco 96) — o seguro contra formatar o PC.
 *
 * Vai: memória, lembretes pendentes, presets, rotinas, conversas com a IA e os ajustes.
 * **Não vai, de propósito**: a chave da Groq e o token do servidor (segredos; o arquivo de
 * backup costuma parar em pendrive e nuvem), a Caixa de recados (os anexos têm até 5 MB
 * cada — um backup com eles viraria centenas de MB; os textos continuam no celular) e o
 * login do Spotify (refaz em um clique).
 *
 * Importar **soma, não substitui**: fato de memória repetido é ignorado, lembrete já
 * existente (mesmo texto e hora) também, preset e rotina com o mesmo nome ficam como estão,
 * e conversa passa pelo `mergeSession` — vence a versão mais nova. Importar o mesmo arquivo
 * duas vezes não duplica nada.
 */

export const FORMATO = "elysium-backup";

export interface Backup {
  formato: typeof FORMATO;
  versao: 1;
  criadoEm: number;
  app: string;
  memoria: string[];
  /** `id` desde a fase 18: as tarefas apontam para ele (backup antigo não tem). */
  lembretes: (Pick<Reminder, "text" | "dueAt" | "kind" | "weekday"> & { id?: string })[];
  presets: PresetsMap;
  rotinas: Omit<Rotina, "id" | "ultimaExecucao" | "ultimoResultado">[];
  conversas: ChatSession[];
  ajustes: Partial<AppConfig>;
  /** Bloco 135. Opcional: backup antigo não tem. */
  listas?: Lista[];
  /** Fase 16. Opcional: backup antigo não tem. */
  habitos?: Habito[];
  metas?: Meta[];
  /** Fase 17. */
  tarefas?: Tarefa[];
  /** Fase 18: treinos, perfil corporal, pesos e corridas. */
  corpo?: ReturnType<typeof exportarCorpo>;
  /** Fase 19: as conversas que a Ely lembra. */
  episodios?: Episodio[];
  /** Fase 20: os modos que ele criou (o catálogo vem com o app). */
  modos?: Modo[];
  /** Fase 20: cartões de revisão, com a caixa e o dia de voltar. */
  cartoes?: Cartao[];
}

export interface ResumoImportacao {
  memoria: number;
  lembretes: number;
  presets: number;
  rotinas: number;
  conversas: number;
  ajustes: number;
  listas: number;
  habitos: number;
  /** Tarefas restauradas (fase 18 — antes somavam em `habitos`). */
  tarefas?: number;
  /** Treinos restaurados (fase 18). */
  corpo?: number;
  /** Conversas lembradas restauradas (fase 19). */
  episodios?: number;
  /** Modos criados por ele restaurados (fase 20). */
  modos?: number;
  cartoes?: number;
  /** Itens que não deu para restaurar (inválidos ou que falharam) — antes sumiam calados. */
  pulados?: number;
}

/** Ajustes que não viajam: dependem desta máquina e quebrariam em outra. */
const AJUSTES_LOCAIS = new Set<string>(["ollamaBaseUrl", "serverPort"]);

export function montarBackup(): Backup {
  const ajustes = { ...getOverrides() } as Record<string, unknown>;
  for (const k of AJUSTES_LOCAIS) delete ajustes[k];
  return {
    formato: FORMATO,
    versao: 1,
    criadoEm: Date.now(),
    app: app.getVersion(),
    memoria: listFacts().map(f => f.text),
    lembretes: listPending().map(r => ({ id: r.id, text: r.text, dueAt: r.dueAt, kind: r.kind, weekday: r.weekday })),
    presets: getAllPresets(),
    rotinas: listarRotinas().map(({ id: _id, ultimaExecucao: _u, ultimoResultado: _r, ...resto }) => resto),
    conversas: listSessions(),
    ajustes: ajustes as Partial<AppConfig>,
    listas: listarListas(),
    habitos: listarHabitos(),
    metas: listarMetas(),
    tarefas: listarTarefasTodas(),
    corpo: exportarCorpo(),
    episodios: listarEpisodios(),
    modos: modosParaBackup(),
    cartoes: listarCartoes(),
  };
}

/** Lê e valida só a casca; cada item é conferido na hora de somar, e item ruim é pulado. */
export function lerBackup(bruto: unknown): Backup {
  const b = bruto as Partial<Backup> | null;
  if (!b || typeof b !== "object" || b.formato !== FORMATO) throw new Error("Esse arquivo não é um backup do ELYSIUM.");
  if (b.versao !== 1) throw new Error(`Backup de uma versão que eu não conheço (${String(b.versao)}).`);
  return {
    formato: FORMATO, versao: 1, criadoEm: Number(b.criadoEm) || 0, app: String(b.app ?? "?"),
    memoria: Array.isArray(b.memoria) ? b.memoria.filter(x => typeof x === "string") : [],
    lembretes: Array.isArray(b.lembretes) ? b.lembretes : [],
    presets: b.presets && typeof b.presets === "object" ? b.presets : {},
    rotinas: Array.isArray(b.rotinas) ? b.rotinas : [],
    conversas: Array.isArray(b.conversas) ? b.conversas : [],
    ajustes: b.ajustes && typeof b.ajustes === "object" ? b.ajustes : {},
    listas: Array.isArray(b.listas) ? b.listas : [],
    habitos: Array.isArray(b.habitos) ? b.habitos : [],
    metas: Array.isArray(b.metas) ? b.metas : [],
    tarefas: Array.isArray(b.tarefas) ? b.tarefas : [],
    corpo: b.corpo && typeof b.corpo === "object" ? b.corpo : undefined,
    episodios: Array.isArray(b.episodios) ? b.episodios : [],
    modos: Array.isArray(b.modos) ? b.modos : [],
    cartoes: Array.isArray(b.cartoes) ? b.cartoes : [],
  };
}

export function aplicarBackup(b: Backup): ResumoImportacao {
  const resumo: ResumoImportacao = { memoria: 0, lembretes: 0, presets: 0, rotinas: 0, conversas: 0, ajustes: 0, listas: 0, habitos: 0, tarefas: 0, pulados: 0 };
  const pulou = () => { resumo.pulados = (resumo.pulados ?? 0) + 1; };
  /**
   * id do lembrete no backup → id aqui (08/10). O agendador dá id novo a cada lembrete
   * criado; sem este mapa, as tarefas restauradas apontavam para lembretes que não existem —
   * concluir não cancelava os avisos, e o lembrete aparecia duplicado (agenda + lista).
   */
  const mapaLembretes = new Map<string, string>();
  const pendentes = new Map(listPending().map(r => [`${r.text}|${r.dueAt}`, r.id] as const));

  for (const texto of b.memoria) {
    try { if (addFact(texto).created) resumo.memoria++; } catch { pulou(); }
  }

  for (const l of b.lembretes) {
    if (!l || typeof l.text !== "string" || !Number.isFinite(l.dueAt)) { pulou(); continue; }
    // Lembrete único que já passou não volta: dispararia na hora, fora de contexto.
    if (l.kind !== "weekly" && l.dueAt <= Date.now()) continue;
    const existente = pendentes.get(`${l.text}|${l.dueAt}`);
    if (existente) { if (l.id) mapaLembretes.set(l.id, existente); continue; }
    try {
      const novo = createReminder({ text: l.text, dueAt: l.dueAt, kind: l.kind, weekday: l.weekday });
      if (l.id) mapaLembretes.set(l.id, novo.id);
      resumo.lembretes++;
    } catch { pulou(); }
  }

  const presets = getAllPresets();
  for (const [chave, p] of Object.entries(b.presets)) {
    if (chave in presets || !p || !Array.isArray((p as { actions?: unknown }).actions)) continue;
    try { savePreset(chave, p as PresetEntry); resumo.presets++; } catch { pulou(); }
  }

  const rotinas = new Set(listarRotinas().map(r => r.nome.trim().toLowerCase()));
  for (const r of b.rotinas) {
    if (!r || typeof r.nome !== "string" || rotinas.has(r.nome.trim().toLowerCase())) continue;
    try { salvarRotina({ ...r, id: undefined }); resumo.rotinas++; } catch { pulou(); }
  }

  for (const s of b.conversas) {
    if (!s || typeof s.id !== "string" || !Array.isArray(s.messages)) continue;
    try { if (mergeSession(s)) resumo.conversas++; } catch { pulou(); }
  }

  // Itens pendentes somam na lista de mesmo nome; o que já está lá não duplica.
  try { resumo.listas = importarListas(b.listas ?? []); } catch { pulou(); }
  try { resumo.habitos = importarHabitos(b.habitos ?? [], b.metas ?? []); } catch { pulou(); }
  try {
    // Avisos que não existem mais aqui saem da tarefa; os que vieram ganham o id novo.
    const tarefas = (b.tarefas ?? []).map(t => {
      const ids = (t.lembreteIds ?? []).map(id => mapaLembretes.get(id)).filter((x): x is string => !!x);
      return { ...t, lembreteIds: ids.length ? ids : undefined };
    });
    resumo.tarefas = importarTarefas(tarefas);
  } catch { pulou(); }
  try { resumo.episodios = importarEpisodios(b.episodios ?? []); } catch { pulou(); }
  try {
    const m = importarModos(b.modos ?? []);
    resumo.modos = m.somados;
    resumo.cartoes = importarCartoes(b.cartoes ?? []);
    resumo.pulados = (resumo.pulados ?? 0) + m.pulados;
  } catch { pulou(); }
  // Corpo: só restaura se aqui ainda não há treino — não sobrescreve o que já está em uso.
  try { if (b.corpo && !listarTreinos().length) { importarCorpo(b.corpo); resumo.corpo = listarTreinos().length; } } catch { pulou(); }

  const ajustes = { ...b.ajustes } as Record<string, unknown>;
  for (const k of AJUSTES_LOCAIS) delete ajustes[k];
  resumo.ajustes = Object.keys(ajustes).length;
  if (resumo.ajustes) setOverride(ajustes as Partial<AppConfig>);

  return resumo;
}
