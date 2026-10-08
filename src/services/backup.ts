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
  lembretes: Pick<Reminder, "text" | "dueAt" | "kind" | "weekday">[];
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
  /** Treinos restaurados (fase 18). */
  corpo?: number;
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
    lembretes: listPending().map(r => ({ text: r.text, dueAt: r.dueAt, kind: r.kind, weekday: r.weekday })),
    presets: getAllPresets(),
    rotinas: listarRotinas().map(({ id: _id, ultimaExecucao: _u, ultimoResultado: _r, ...resto }) => resto),
    conversas: listSessions(),
    ajustes: ajustes as Partial<AppConfig>,
    listas: listarListas(),
    habitos: listarHabitos(),
    metas: listarMetas(),
    tarefas: listarTarefasTodas(),
    corpo: exportarCorpo(),
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
  };
}

export function aplicarBackup(b: Backup): ResumoImportacao {
  const resumo: ResumoImportacao = { memoria: 0, lembretes: 0, presets: 0, rotinas: 0, conversas: 0, ajustes: 0, listas: 0, habitos: 0 };

  for (const texto of b.memoria) {
    try { if (addFact(texto).created) resumo.memoria++; } catch { /* fato inválido: pula */ }
  }

  const jaTem = new Set(listPending().map(r => `${r.text}|${r.dueAt}`));
  for (const l of b.lembretes) {
    if (!l || typeof l.text !== "string" || !Number.isFinite(l.dueAt)) continue;
    // Lembrete único que já passou não volta: dispararia na hora, fora de contexto.
    if (l.kind !== "weekly" && l.dueAt <= Date.now()) continue;
    if (jaTem.has(`${l.text}|${l.dueAt}`)) continue;
    try { createReminder({ text: l.text, dueAt: l.dueAt, kind: l.kind, weekday: l.weekday }); resumo.lembretes++; } catch { /* pula */ }
  }

  const presets = getAllPresets();
  for (const [chave, p] of Object.entries(b.presets)) {
    if (chave in presets || !p || !Array.isArray((p as { actions?: unknown }).actions)) continue;
    try { savePreset(chave, p as PresetEntry); resumo.presets++; } catch { /* pula */ }
  }

  const rotinas = new Set(listarRotinas().map(r => r.nome.trim().toLowerCase()));
  for (const r of b.rotinas) {
    if (!r || typeof r.nome !== "string" || rotinas.has(r.nome.trim().toLowerCase())) continue;
    try { salvarRotina({ ...r, id: undefined }); resumo.rotinas++; } catch { /* pula */ }
  }

  for (const s of b.conversas) {
    if (!s || typeof s.id !== "string" || !Array.isArray(s.messages)) continue;
    try { if (mergeSession(s)) resumo.conversas++; } catch { /* pula */ }
  }

  // Itens pendentes somam na lista de mesmo nome; o que já está lá não duplica.
  try { resumo.listas = importarListas(b.listas ?? []); } catch { /* pula */ }
  try { resumo.habitos = importarHabitos(b.habitos ?? [], b.metas ?? []); } catch { /* pula */ }
  try { resumo.habitos += importarTarefas(b.tarefas ?? []); } catch { /* pula */ }
  // Corpo: só restaura se aqui ainda não há treino — não sobrescreve o que já está em uso.
  try { if (b.corpo && !listarTreinos().length) { importarCorpo(b.corpo); resumo.corpo = listarTreinos().length; } } catch { /* pula */ }

  const ajustes = { ...b.ajustes } as Record<string, unknown>;
  for (const k of AJUSTES_LOCAIS) delete ajustes[k];
  resumo.ajustes = Object.keys(ajustes).length;
  if (resumo.ajustes) setOverride(ajustes as Partial<AppConfig>);

  return resumo;
}
