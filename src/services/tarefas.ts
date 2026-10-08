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
  /**
   * Fase 18: compromisso sem hora dita ("prova sexta"). O prazo guarda o aviso do dia (8h),
   * mas a lista mostra "dia todo" e só chama de atrasada depois que o dia acaba.
   */
  semHora?: boolean;
  /** Fase 18: estrela — vai para o topo da lista. */
  prioridade?: "alta";
  /** Fase 18: repete. Concluir cria a próxima (o lembrete semanal virou isto). */
  repete?: "diaria" | "semanal";
}

/** O instante em que a tarefa passa a contar como atrasada. Sem hora = fim daquele dia. Pura. */
export function fimDoPrazo(t: Pick<Tarefa, "prazo" | "semHora">): number | undefined {
  if (t.prazo === undefined) return undefined;
  if (!t.semHora) return t.prazo;
  const d = new Date(t.prazo);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

export function estaAtrasada(t: Tarefa, agora = Date.now()): boolean {
  const fim = fimDoPrazo(t);
  return !t.feita && fim !== undefined && fim < agora;
}

/** A próxima ocorrência de uma tarefa que repete (mesma hora). Pura. */
export function proximaOcorrencia(prazo: number, repete: NonNullable<Tarefa["repete"]>, agora = Date.now()): number {
  const passo = repete === "diaria" ? 1 : 7;
  const d = new Date(prazo);
  do { d.setDate(d.getDate() + passo); } while (d.getTime() <= agora);
  return d.getTime();
}

const store = new Store<{ tarefas: Tarefa[]; lembretesMigrados: boolean }>({ name: "tarefas", defaults: { tarefas: [], lembretesMigrados: false } });

/** A migração única dos lembretes antigos para a lista (ver `migrarLembretesParaTarefas`). */
export function migracaoFeita(): boolean { return store.get("lembretesMigrados", false); }
export function marcarMigracao(): void { store.set("lembretesMigrados", true); }
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
  // Estrela primeiro (fase 18); dentro de cada grupo, por prazo.
  const pend = ts.filter(t => !t.feita).sort((a, b) =>
    (a.prioridade === "alta" ? 0 : 1) - (b.prioridade === "alta" ? 0 : 1)
    || (a.prazo ?? Infinity) - (b.prazo ?? Infinity) || a.criadaEm - b.criadaEm);
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

/**
 * Lista por filtro (fase 18, tela cheia): "abertas" (pendentes), "feitas" (os últimos 30 dias,
 * da mais recente) ou "todas" (pendentes + feitas). A do Hoje continua sendo `listarTarefas`.
 */
export function listarPorFiltro(filtro: "abertas" | "feitas" | "todas"): Tarefa[] {
  const ts = todas();
  const pend = ordenarTarefas(ts.filter(t => !t.feita));
  const feitas = ts.filter(t => t.feita).sort((a, b) => (b.feitaEm ?? 0) - (a.feitaEm ?? 0));
  return filtro === "abertas" ? pend : filtro === "feitas" ? feitas : [...pend, ...feitas];
}

export function obterTarefa(id: string): Tarefa | undefined { return todas().find(t => t.id === id); }
/** Todas, inclusive as concluídas em outros dias (backup). */
export function listarTarefasTodas(): Tarefa[] { return todas(); }

export function criarTarefa(dados: { texto: string; prazo?: number; lembreteIds?: string[]; origem?: Tarefa["origem"]; semHora?: boolean; prioridade?: Tarefa["prioridade"]; repete?: Tarefa["repete"] }): Tarefa {
  const texto = dados.texto.trim().slice(0, 200);
  if (!texto) throw new Error("a tarefa precisa de um texto");
  const t: Tarefa = {
    id: novoId(), texto,
    prazo: Number.isFinite(dados.prazo) ? dados.prazo : undefined,
    lembreteIds: dados.lembreteIds?.length ? dados.lembreteIds : undefined,
    feita: false, criadaEm: Date.now(), origem: dados.origem ?? "manual",
    ...(dados.semHora && Number.isFinite(dados.prazo) ? { semHora: true } : {}),
    ...(dados.prioridade === "alta" ? { prioridade: "alta" as const } : {}),
    ...(dados.repete && Number.isFinite(dados.prazo) ? { repete: dados.repete } : {}),
  };
  gravar([...todas(), t]);
  return t;
}

/**
 * Muda texto, prazo, prioridade, repetição ou ressalva. Devolve a tarefa nova e os lembretes
 * que ela tinha — quem chama cancela e agenda os novos (ver `reagendarTarefa` no
 * memoryActions). `prazo: null` tira a data.
 */
export function editarTarefa(id: string, m: { texto?: string; prazo?: number | null; semHora?: boolean; lembreteIds?: string[] | null; prioridade?: Tarefa["prioridade"] | null; repete?: Tarefa["repete"] | null; ressalva?: string | null }): { tarefa: Tarefa; antigos: string[] } | null {
  const ts = todas();
  const t = ts.find(x => x.id === id);
  if (!t) return null;
  const texto = m.texto !== undefined ? m.texto.trim().slice(0, 200) : t.texto;
  if (!texto) throw new Error("a tarefa precisa de um texto");
  const nova: Tarefa = { ...t, texto };
  if (m.prazo === null) { delete nova.prazo; delete nova.semHora; delete nova.repete; }
  else if (m.prazo !== undefined && Number.isFinite(m.prazo)) { nova.prazo = m.prazo; if (m.semHora) nova.semHora = true; else delete nova.semHora; }
  if (m.lembreteIds === null) delete nova.lembreteIds; else if (m.lembreteIds) nova.lembreteIds = m.lembreteIds.length ? m.lembreteIds : undefined;
  if (m.prioridade === null) delete nova.prioridade; else if (m.prioridade === "alta") nova.prioridade = "alta";
  if (m.repete === null) delete nova.repete; else if (m.repete && nova.prazo !== undefined) nova.repete = m.repete;
  if (m.ressalva === null) delete nova.ressalva; else if (m.ressalva !== undefined) nova.ressalva = m.ressalva.trim().slice(0, 300) || undefined;
  gravar(ts.map(x => x.id === id ? nova : x));
  return { tarefa: nova, antigos: t.lembreteIds ?? [] };
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
