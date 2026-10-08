import Store from "electron-store";
import * as crypto from "node:crypto";

/**
 * Tarefas (fase 17, 08/10): a lista de afazeres da Ely — o "protocolo do dia" do Jarvis.
 *
 * O Zak pediu que o Hoje e os lembretes virassem uma todo-list, com uma RESSALVA ao concluir
 * ("feito, mas faltou a parte 3"). Todo lembrete criado pela Ely vira também uma tarefa
 * (`lembreteIds`); concluir a tarefa cancela os avisos que ainda não tocaram.
 *
 * As concluídas ficam visíveis até o fim do dia (com a ressalva), e no histórico por 30 dias.
 */

export interface Tarefa {
  id: string;
  texto: string;
  /** Quando é (ms). Sem prazo = "quando der". */
  prazo?: number;
  /** Os lembretes que avisam desta tarefa (o do dia e o da véspera, se for evento). */
  lembreteIds?: string[];
  feita: boolean;
  feitaEm?: number;
  /** O que ficou anotado ao concluir — "fiz, mas faltou X". */
  ressalva?: string;
  criadaEm: number;
  origem: "manual" | "lembrete";
}

const store = new Store<{ tarefas: Tarefa[] }>({ name: "tarefas", defaults: { tarefas: [] } });
const TRINTA_DIAS = 30 * 86_400_000;

const novoId = () => `t-${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

function todas(): Tarefa[] { return store.get("tarefas", []); }
function gravar(ts: Tarefa[]): void {
  // Concluídas há mais de 30 dias saem; as pendentes ficam sempre.
  const limite = Date.now() - TRINTA_DIAS;
  store.set("tarefas", ts.filter(t => !t.feita || (t.feitaEm ?? 0) > limite));
}

/**
 * Ordem da lista: pendentes primeiro (atrasadas, depois por prazo, sem prazo no fim), depois
 * as concluídas de hoje, da mais recente. Pura, para teste.
 */
export function ordenarTarefas(ts: Tarefa[], agora = Date.now()): Tarefa[] {
  const inicioHoje = new Date(agora); inicioHoje.setHours(0, 0, 0, 0);
  const pend = ts.filter(t => !t.feita).sort((a, b) => (a.prazo ?? Infinity) - (b.prazo ?? Infinity) || a.criadaEm - b.criadaEm);
  const feitasHoje = ts.filter(t => t.feita && (t.feitaEm ?? 0) >= inicioHoje.getTime()).sort((a, b) => (b.feitaEm ?? 0) - (a.feitaEm ?? 0));
  return [...pend, ...feitasHoje];
}

/** Acha pela parte do texto, sem acento — "concluí a prova" acha "Prova de cálculo". Pura. */
export function acharTarefa(ts: Tarefa[], trecho: string): Tarefa | undefined {
  const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const n = sem(trecho).replace(/^(a|o|as|os|minha|meu)\s+/, "");
  if (n.length < 3) return undefined;
  const pend = ts.filter(t => !t.feita);
  return pend.find(t => sem(t.texto) === n) ?? pend.find(t => sem(t.texto).includes(n));
}

export function listarTarefas(): Tarefa[] { return ordenarTarefas(todas()); }
/** Todas, inclusive as concluídas em outros dias (backup). */
export function listarTarefasTodas(): Tarefa[] { return todas(); }

export function criarTarefa(dados: { texto: string; prazo?: number; lembreteIds?: string[]; origem?: Tarefa["origem"] }): Tarefa {
  const texto = dados.texto.trim().slice(0, 200);
  if (!texto) throw new Error("a tarefa precisa de um texto");
  const t: Tarefa = {
    id: novoId(), texto,
    prazo: Number.isFinite(dados.prazo) ? dados.prazo : undefined,
    lembreteIds: dados.lembreteIds?.length ? dados.lembreteIds : undefined,
    feita: false, criadaEm: Date.now(), origem: dados.origem ?? "manual",
  };
  gravar([...todas(), t]);
  return t;
}

/**
 * Conclui, com ressalva opcional, e devolve os ids de lembrete que ainda não tocaram — quem
 * chama cancela (este módulo não conhece o agendador, para ficar puro de efeitos).
 */
export function concluirTarefa(id: string, ressalva?: string): { tarefa: Tarefa; lembretes: string[] } | null {
  const ts = todas();
  const t = ts.find(x => x.id === id);
  if (!t) return null;
  const nova: Tarefa = { ...t, feita: true, feitaEm: Date.now(), ressalva: ressalva?.trim().slice(0, 300) || undefined };
  gravar(ts.map(x => x.id === id ? nova : x));
  return { tarefa: nova, lembretes: t.lembreteIds ?? [] };
}

export function reabrirTarefa(id: string): Tarefa | null {
  const ts = todas();
  const t = ts.find(x => x.id === id);
  if (!t) return null;
  const nova: Tarefa = { ...t, feita: false, feitaEm: undefined, ressalva: undefined };
  gravar(ts.map(x => x.id === id ? nova : x));
  return nova;
}

export function apagarTarefa(id: string): Tarefa | null {
  const ts = todas();
  const t = ts.find(x => x.id === id);
  if (!t) return null;
  gravar(ts.filter(x => x.id !== id));
  return t;
}

/**
 * Lembrete cancelado (pela aba Rotinas, pela voz): sai da tarefa. A tarefa que nasceu do
 * lembrete e ficou sem nenhum aviso some junto — cancelar "a prova" é desistir dela.
 */
export function desvincularLembrete(lembreteId: string): void {
  const ts = todas();
  let mudou = false;
  const novas = ts.flatMap(t => {
    if (t.feita || !t.lembreteIds?.includes(lembreteId)) return [t];
    mudou = true;
    const restantes = t.lembreteIds.filter(x => x !== lembreteId);
    if (!restantes.length && t.origem === "lembrete") return [];
    return [{ ...t, lembreteIds: restantes.length ? restantes : undefined }];
  });
  if (mudou) gravar(novas);
}

/** Backup (bloco 96): soma sem duplicar pelo id. */
export function importarTarefas(ts: Tarefa[] = []): number {
  const atuais = todas();
  const novas = ts.filter(t => t?.id && t.texto && !atuais.some(x => x.id === t.id));
  gravar([...atuais, ...novas]);
  return novas.length;
}
