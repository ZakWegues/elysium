import { addFact, listFacts, removeFactById, removeFactByText } from "../services/memoryStore";
import { registrarDesfazer } from "../services/desfazer";
import {
  cancelReminder, cancelReminderByText, createReminder, listPending, Reminder,
} from "../services/scheduler";
import { ajustarPeloTexto, ehCompromisso, HORA_PADRAO, interpretarQuando, planejarLembretes } from "../services/planoDeLembrete";
import { pedidoAtual } from "../services/contextoComando";
import { apagarTarefa, criarTarefa, desvincularLembrete, editarTarefa, importarTarefas, listarTarefasTodas, marcarMigracao, migracaoFeita, obterTarefa, proximaOcorrencia, type Tarefa } from "../services/tarefas";

// ── memória ───────────────────────────────────────────────────────────────────

export function remember(fact: string): string {
  const { fact: saved, created } = addFact(fact);
  if (created) registrarDesfazer(`Guardei: ${saved.text}`, () => { removeFactById(saved.id); return `Pronto, esqueci: ${saved.text}.`; });
  return created ? `Guardei: ${saved.text}.` : "Isso eu já sabia.";
}

export function forget(query: string): string {
  const removed = removeFactByText(query);
  if (removed) registrarDesfazer(`Esqueci: ${removed.text}`, () => { addFact(removed.text); return `Pronto, lembro de novo: ${removed.text}.`; });
  return removed ? `Esqueci: ${removed.text}.` : "Não achei nada assim na memória.";
}

export function listMemory(): string {
  const facts = listFacts();
  if (facts.length === 0) return "Ainda não guardei nada sobre você.";
  return `Eu lembro de: ${facts.map(f => f.text).join("; ")}.`;
}

// ── lembretes ─────────────────────────────────────────────────────────────────

/**
 * Converte o ISO devolvido pelo cérebro em epoch.
 *
 * O modelo manda hora local sem fuso ("2026-08-02T15:00:00"); o `Date` do Node
 * interpreta isso como local, que é o que queremos. Se vier com Z ou offset, também
 * funciona.
 */
function parseDueAt(iso: string): number {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) throw new Error(`data inválida: ${iso}`);
  return ms;
}

/** "hoje às 16h", "amanhã às 8h", "sábado às 10h", "25/12 às 16h" — como se fala (fase 17). */
function formatWhen(dueAt: number): string {
  const d = new Date(dueAt);
  const hoje = new Date();
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const diaD = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((diaD - base) / 86_400_000);
  const hora = d.getMinutes() ? `${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}` : `${d.getHours()}h`;
  if (dias === 0) return `hoje às ${hora}`;
  if (dias === 1) return `amanhã às ${hora}`;
  if (dias > 1 && dias < 7) return `${d.toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "")} às ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hora}`;
}

/**
 * Fase 17 (08/10): sem hora dita, 16h; compromisso (prova, consulta…) ganha aviso na
 * véspera às 16h; e o lembrete entra na lista de tarefas do Hoje — concluir lá cancela os
 * avisos que faltam. Ver `planoDeLembrete.ts` e `tarefas.ts`.
 */
export function createReminderAction(text: string, dueAt: string, weekly?: boolean, semHora?: boolean): string {
  const r = criarLembreteComTarefa(text, dueAt, weekly, semHora);
  // 31/10: desfazer apaga a tarefa e os avisos dela (o semanal, sem tarefa, fica de fora).
  const tarefa = r.tarefa;
  if (tarefa) {
    registrarDesfazer(`Lembrete: ${tarefa.texto}`, () => {
      for (const id of tarefa.lembreteIds ?? []) cancelReminder(id);
      apagarTarefa(tarefa.id);
      return `Pronto, apaguei o lembrete: ${tarefa.texto}.`;
    });
  }
  return r.mensagem;
}

/**
 * O lembrete com a tarefa junto, dizendo se deu certo (fase 18, 08/10). Antes só voltava a
 * frase, e o RPC `tarefas.criar` devolvia "Esse horário já passou" como SUCESSO: o app
 * mostrava "Anotado", apagava o que foi digitado e não criava nada.
 */
export function criarLembreteComTarefa(text: string, dueAt: string, weekly?: boolean, semHora?: boolean, extras: { prioridade?: Tarefa["prioridade"]; repete?: Tarefa["repete"]; usarPedido?: boolean } = {}): { ok: boolean; mensagem: string; tarefa?: Tarefa } {
  // O dia e a hora que o dono FALOU valem mais que a conta do modelo (fase 17).
  const pedido = extras.usarPedido === false ? null : pedidoAtual();
  const ajuste = pedido && !weekly ? ajustarPeloTexto(pedido, dueAt ?? "") : null;
  if (ajuste) { dueAt = ajuste.quando; semHora = ajuste.semHora; }
  const quando = interpretarQuando(dueAt ?? "", semHora);
  if (!quando) return { ok: false, mensagem: "Não entendi para quando é o lembrete." };
  const avisos = planejarLembretes(text.trim(), quando, Date.now(), weekly);
  // Compromisso de HOJE sem hora, dito depois das 8h (a revisão pegou): o aviso do dia já
  // passou, mas o dia não — entra na lista como "dia todo", sem aviso, em vez de recusar.
  const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
  if (!weekly && !avisos.length && !quando.temHora && quando.ms >= hoje0.getTime() && quando.ms < hoje0.getTime() + 86_400_000) {
    const tarefa = criarTarefa({ texto: text.trim(), prazo: quando.ms, origem: "manual", semHora: true, prioridade: extras.prioridade, repete: extras.repete });
    return { ok: true, tarefa, mensagem: `Anotado para hoje: ${text.trim()}.` };
  }
  // Um lembrete no passado quase sempre é erro de cálculo do modelo, não pedido real.
  // Disparar na hora seria pior que avisar que não deu certo.
  if (!avisos.length || (!weekly && avisos.every(a => a.em <= Date.now()))) {
    return { ok: false, mensagem: quando.temHora ? "Esse horário já passou. Pode repetir dizendo quando?" : "Esse dia já passou (sem hora, o aviso é às 16h). Pode dizer a hora ou outro dia?" };
  }
  // Semanal pela voz continua um lembrete do agendador, que toca toda semana sozinho — não
  // depende de ninguém concluir nada. A tarefa que se repete (`repete`) é outra coisa: a da
  // lista, que só avança quando é concluída (como no Todoist).
  if (weekly) {
    const r = createReminder({ text: avisos[0].texto, dueAt: avisos[0].em, kind: "weekly", weekday: new Date(avisos[0].em).getDay() });
    return { ok: true, mensagem: `Combinado, toda semana ${formatWhen(r.dueAt)}: ${r.text}.` };
  }
  const criados = avisos.map(a => createReminder({ text: a.texto, dueAt: a.em }));
  const principal = avisos.find(a => !a.vespera) ?? avisos[avisos.length - 1];
  let tarefa: Tarefa | undefined;
  try {
    tarefa = criarTarefa({ texto: text.trim(), prazo: principal.em, lembreteIds: criados.map(r => r.id), origem: "lembrete", semHora: !quando.temHora && ehCompromisso(text), prioridade: extras.prioridade, repete: extras.repete });
  } catch { /* a lista é um extra: o aviso já está agendado */ }
  const vespera = avisos.find(a => a.vespera);
  return {
    ok: true,
    tarefa,
    mensagem: vespera
      ? `Combinado: te lembro na véspera, ${formatWhen(vespera.em)}, e no dia, ${formatWhen(principal.em)} — ${text.trim()}.`
      : `Combinado, te aviso ${formatWhen(principal.em)}: ${text.trim()}.`,
  };
}

/** Tarefa nova com os avisos planejados (sem olhar o pedido falado). */
function criarTarefaComAvisos(texto: string, quando: { ms: number; temHora: boolean }, repete?: Tarefa["repete"], prioridade?: Tarefa["prioridade"]): Tarefa {
  const avisos = planejarLembretes(texto, quando, Date.now());
  const criados = avisos.map(a => createReminder({ text: a.texto, dueAt: a.em }));
  const principal = avisos.find(a => !a.vespera)?.em ?? quando.ms;
  return criarTarefa({ texto, prazo: principal, lembreteIds: criados.map(r => r.id), origem: "lembrete", semHora: !quando.temHora && ehCompromisso(texto), repete, prioridade });
}

/**
 * Muda a data de uma tarefa (editar, adiar, reabrir — fase 18): cancela os avisos antigos e
 * planeja os novos com as mesmas regras de sempre (16h sem hora, véspera para compromisso).
 * `quando` null tira a data. Devolve a mensagem de erro se a data nova não serve.
 */
export function reagendarTarefa(id: string, quando: string | null, semHora = false, texto?: string): { ok: boolean; mensagem: string; tarefa?: Tarefa } {
  const t = obterTarefa(id);
  if (!t) return { ok: false, mensagem: "Tarefa não encontrada." };
  const novoTexto = texto?.trim() || t.texto;
  if (quando === null) {
    for (const r of t.lembreteIds ?? []) cancelReminder(r);
    const e = editarTarefa(id, { texto: novoTexto, prazo: null, lembreteIds: null });
    return { ok: true, mensagem: "Sem data agora.", tarefa: e?.tarefa };
  }
  const q = interpretarQuando(quando, semHora);
  if (!q) return { ok: false, mensagem: "Não entendi a data nova." };
  // Tarefa já feita: corrigir a data não agenda aviso (tocaria por algo já concluído).
  if (t.feita) {
    for (const r of t.lembreteIds ?? []) cancelReminder(r);
    const e = editarTarefa(id, { texto: novoTexto, prazo: q.ms, semHora: !q.temHora, lembreteIds: null });
    return { ok: true, mensagem: "Data corrigida.", tarefa: e?.tarefa };
  }
  const avisos = planejarLembretes(novoTexto, q, Date.now());
  if (!avisos.length) return { ok: false, mensagem: q.temHora ? "Esse horário já passou." : "Esse dia já passou." };
  for (const r of t.lembreteIds ?? []) cancelReminder(r);
  const criados = avisos.map(a => createReminder({ text: a.texto, dueAt: a.em }));
  const principal = avisos.find(a => !a.vespera) ?? avisos[avisos.length - 1];
  const semHoraFinal = !q.temHora && ehCompromisso(novoTexto);
  const e = editarTarefa(id, { texto: novoTexto, prazo: principal.em, semHora: semHoraFinal, lembreteIds: criados.map(r => r.id) });
  return { ok: true, mensagem: `Combinado, ${rotuloDoPrazo(principal.em, semHoraFinal)}.`, tarefa: e?.tarefa };
}

/** Recria os avisos de uma tarefa reaberta, se o prazo ainda não passou (fase 18). */
export function reavisarTarefa(id: string): void {
  const t = obterTarefa(id);
  if (!t || t.prazo === undefined || t.prazo <= Date.now()) return;
  const d = new Date(t.prazo);
  const p = (n: number) => String(n).padStart(2, "0");
  const dia = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  reagendarTarefa(id, t.semHora ? dia : `${dia}T${p(d.getHours())}:${p(d.getMinutes())}`, !!t.semHora);
}

/** Concluiu uma tarefa que repete: a próxima entra na lista, com o aviso dela (fase 18). */
export function proximaDaRepeticao(t: Tarefa): Tarefa | null {
  if (!t.repete || t.prazo === undefined) return null;
  const ms = proximaOcorrencia(t.prazo, t.repete);
  return criarTarefaComAvisos(t.texto, { ms, temHora: !t.semHora }, t.repete, t.prioridade);
}

/** "dd/mm" ou "dd/mm HH:MM", curto, para o celular e a prévia do quick add. */
export function rotuloDoPrazo(ms: number, semHora: boolean): string {
  const quando = formatWhen(ms);
  return semHora ? quando.replace(/ às \d+h(\d{2})?$/, " · dia todo") : quando;
}

/**
 * Uma vez (fase 17): os lembretes de uma vez que já existiam entram na lista de tarefas, e o
 * compromisso ganha o aviso da véspera às 16h — o mesmo que um lembrete novo ganharia.
 * Marcado no store das tarefas; rodar de novo não duplica.
 */
export function migrarLembretesParaTarefas(): number {
  if (migracaoFeita()) return 0;
  let n = 0;
  const jaLigados = new Set(listarTarefasTodas().flatMap(t => t.lembreteIds ?? []));
  for (const r of listPending()) {
    if (r.kind !== "once" || jaLigados.has(r.id) || r.dueAt <= Date.now()) continue;
    const ids = [r.id];
    if (ehCompromisso(r.text)) {
      const d = new Date(r.dueAt);
      const vespera = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, HORA_PADRAO, 0, 0, 0).getTime();
      if (vespera > Date.now()) ids.unshift(createReminder({ text: `Amanhã: ${r.text}`, dueAt: vespera }).id);
    }
    try { criarTarefa({ texto: r.text, prazo: r.dueAt, lembreteIds: ids, origem: "lembrete" }); n++; } catch { /* segue */ }
  }
  marcarMigracao();
  return n;
}

export function listRemindersAction(): string {
  const pending = listPending();
  if (pending.length === 0) return "Você não tem nenhum lembrete agendado.";
  const list = pending
    .map((r: Reminder) => `${r.text} ${r.kind === "weekly" ? "toda semana " : ""}${formatWhen(r.dueAt)}`)
    .join("; ");
  return `Seus lembretes: ${list}.`;
}

export function cancelReminderAction(query: string): string {
  const removed = cancelReminderByText(query);
  if (removed) {
    // A tarefa ligada a ele (que pode sumir junto) é guardada antes, para o desfazer (31/10).
    const tarefa = listarTarefasTodas().find(t => t.lembreteIds?.includes(removed.id));
    desvincularLembrete(removed.id);
    registrarDesfazer(`Cancelei: ${removed.text}`, () => {
      if (removed.kind !== "weekly" && removed.dueAt <= Date.now()) return "Esse lembrete já teria tocado; não dá para trazer de volta.";
      const novo = createReminder({ text: removed.text, dueAt: removed.dueAt, kind: removed.kind, weekday: removed.weekday });
      if (tarefa) {
        const atual = obterTarefa(tarefa.id);
        if (atual) editarTarefa(atual.id, { lembreteIds: [...(atual.lembreteIds ?? []), novo.id] });
        else importarTarefas([{ ...tarefa, lembreteIds: [novo.id] }]);
      }
      return `Pronto, o lembrete voltou: ${removed.text}.`;
    });
  }
  return removed ? `Cancelei o lembrete: ${removed.text}.` : "Não achei esse lembrete.";
}
