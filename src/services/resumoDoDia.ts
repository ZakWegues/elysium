import { listarHabitos, resumirHabito } from "./habitos";
import { getConfig } from "../main/config";
import { climaFalado } from "./clima";
import { listPending } from "./scheduler";
import { listarRotinas, proximoDisparo } from "./rotinas";
import { listMessages } from "./mailboxStore";
import { verificarSaude } from "./saude";
import { estadoAtualizacao } from "./atualizacao";
import { eventosDoDia } from "./agenda";
import { montarPainelCorpo } from "./corpo";
import { dicaDoCorpo, ideiaDoDia } from "./ideiasDoDia";
import { listarTarefas } from "./tarefas";
import { notasDaVersaoAtual, secoesDasNotas } from "./atualizacao";

/**
 * Resumo do dia falado (fase 13, bloco 117) — "bom dia".
 *
 * Montado SEM modelo, só com o que o app já sabe: clima, lembretes e rotinas de hoje,
 * recados do celular não lidos, o que o card Saúde acusa e versão nova esperando. Com o
 * modelo local ele sairia em 5–20 s e podia inventar um lembrete; assim sai em menos de um
 * segundo (o clima é a única ida à rede) e diz só o que é verdade.
 *
 * `montarResumo` é pura (fatos → texto) para ser testada; `resumoDoDia` junta os fatos.
 */

export interface FatosResumo {
  agora: Date;
  nome: string;
  clima: string | null;
  lembretes: { texto: string; em: number }[];
  rotinas: { nome: string; em: number }[];
  recadosNovos: number;
  alertas: string[];
  versaoNova: string | null;
  /** Bloco 120 — entra quando a agenda do Google estiver ligada. */
  agenda?: { titulo: string; em: number }[];
  /** Fase 16: hábitos que valem hoje e ainda não foram feitos, com a sequência em jogo. */
  habitosFaltando?: { nome: string; sequencia: number }[];
  /** Fase 18 (08/10): o resumo do Hoje completo — o Zak pediu "tudo que já tá e mais um pouco". */
  tarefasAtrasadas?: string[];
  treino?: { nome: string; exercicios: string[]; feito: boolean } | null;
  meta?: { kcal: number; proteinaG: number } | null;
  dica?: string | null;
  corrida?: { semana: number; texto: string; feitaHoje: boolean } | null;
  /** Uma frase sobre a última atualização do ELYSIUM e quantos itens há para testar. */
  elysium?: { versao: string; novidade: string | null; paraTestar: number } | null;
  ideia?: string | null;
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, "0") : ""}`;
}

function saudacao(d: Date): string {
  const h = d.getHours();
  return h < 5 ? "Boa madrugada" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** "a, b e c" */
function lista(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

export function montarResumo(f: FatosResumo): string {
  const partes: string[] = [`${saudacao(f.agora)}${f.nome ? `, ${f.nome}` : ""}.`];
  if (f.clima) partes.push(f.clima);

  const agenda = [...(f.agenda ?? [])].sort((a, b) => a.em - b.em);
  if (agenda.length) partes.push(`Na agenda: ${lista(agenda.slice(0, 4).map(e => `${e.titulo} às ${hhmm(e.em)}`))}${agenda.length > 4 ? ", e mais" : ""}.`);

  const lembretes = [...f.lembretes].sort((a, b) => a.em - b.em);
  if (lembretes.length === 1) partes.push(`Um lembrete hoje: ${lembretes[0].texto}, às ${hhmm(lembretes[0].em)}.`);
  else if (lembretes.length > 1) partes.push(`${lembretes.length} lembretes hoje: ${lista(lembretes.slice(0, 4).map(l => `${l.texto} às ${hhmm(l.em)}`))}.`);

  const rotinas = [...f.rotinas].sort((a, b) => a.em - b.em);
  if (rotinas.length) partes.push(`${rotinas.length === 1 ? "Rotina" : "Rotinas"} de hoje: ${lista(rotinas.slice(0, 3).map(r => `${r.nome} às ${hhmm(r.em)}`))}.`);

  if (f.recadosNovos === 1) partes.push("Tem um recado do celular que você ainda não viu.");
  else if (f.recadosNovos > 1) partes.push(`Tem ${f.recadosNovos} recados do celular que você ainda não viu.`);

  // Ponto e vírgula, não "a, b e c": cada alerta já tem "título: detalhe" e a vírgula
  // embaralhava os dois (bloco 126, lido no card Hoje).
  // Fase 16: hábito pendente com sequência em jogo é o lembrete que mais vale ("não quebra
  // os 12 dias da leitura").
  if (f.tarefasAtrasadas?.length) partes.push(`${f.tarefasAtrasadas.length === 1 ? "Uma tarefa atrasada" : `${f.tarefasAtrasadas.length} tarefas atrasadas`}: ${lista(f.tarefasAtrasadas.slice(0, 3))}.`);

  // Corpo (fase 18): treino da vez, meta do dia e a dica — na ordem em que se usa.
  if (f.treino) {
    partes.push(f.treino.feito
      ? `O ${f.treino.nome} de hoje já está feito.`
      : `Hoje é dia de ${f.treino.nome}${f.treino.exercicios.length ? `, começando por ${lista(f.treino.exercicios.slice(0, 3))}` : ""}.`);
  }
  if (f.meta) partes.push(`Meta de hoje: ${f.meta.kcal} calorias, com ${f.meta.proteinaG} gramas de proteína.`);
  if (f.dica) partes.push(`Dica: ${f.dica.replace(/[.!]?$/, ".")}`);
  if (f.corrida && !f.corrida.feitaHoje) partes.push(`Na corrida, semana ${f.corrida.semana} do plano: ${f.corrida.texto.replace(/ · /g, ", ")}.`);

  const hab = f.habitosFaltando ?? [];
  if (hab.length) {
    const emRisco = hab.filter(h => h.sequencia >= 3).sort((a, b) => b.sequencia - a.sequencia)[0];
    partes.push(`${hab.length === 1 ? `Falta um hábito hoje: ${hab[0].nome}` : `Faltam ${hab.length} hábitos hoje: ${lista(hab.slice(0, 4).map(h => h.nome))}`}${emRisco ? ` — a sequência de ${emRisco.sequencia} dias de ${emRisco.nome} está em jogo` : ""}.`);
  }
  if (f.alertas.length) partes.push(`Atenção: ${f.alertas.slice(0, 3).join("; ")}.`);
  if (f.versaoNova) partes.push(`A versão ${f.versaoNova} do ELYSIUM está pronta para instalar.`);
  else if (f.elysium?.novidade) partes.push(`No ELYSIUM ${f.elysium.versao}: ${f.elysium.novidade.replace(/[.!]?$/, ".")}${f.elysium.paraTestar ? ` Tem ${f.elysium.paraTestar === 1 ? "um item" : `${f.elysium.paraTestar} itens`} para testar no Hoje.` : ""}`);
  if (f.ideia) partes.push(`Uma ideia para hoje: ${f.ideia.replace(/[.!?]?$/, ".")}`);

  if (partes.length === 1 || (partes.length === 2 && f.clima)) partes.push("Nada marcado para hoje.");
  return partes.join(" ");
}

function mesmoDia(a: number, b: Date): boolean {
  const d = new Date(a);
  return d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && d.getDate() === b.getDate();
}

export async function resumoDoDia(agenda?: FatosResumo["agenda"]): Promise<string> {
  const agora = new Date();
  const [clima, saude, eventos] = await Promise.all([
    climaFalado().catch(() => null),
    verificarSaude().catch(() => []),
    // Agenda do Google (bloco 120), se conectada; sem ela, o resumo segue sem.
    agenda ? Promise.resolve(null) : eventosDoDia(0).catch(() => []),
  ]);
  const lembretes = listPending()
    .filter(r => r.dueAt > agora.getTime() && mesmoDia(r.dueAt, agora))
    .map(r => ({ texto: r.text, em: r.dueAt }));
  const rotinas = listarRotinas()
    .filter(r => r.ativa)
    .map(r => ({ nome: r.nome, em: proximoDisparo(r, agora) }))
    .filter((r): r is { nome: string; em: number } => r.em !== null && mesmoDia(r.em, agora));
  // Recado vindo do celular ainda não aberto no PC.
  const recadosNovos = listMessages().filter(m => m.from === "mobile" && !m.readAt).length;
  // Só o que pede ação — "Chaves de assinatura sem backup" também conta.
  const alertas = saude.filter(i => i.nivel !== "ok" && i.id !== "versao").map(i => `${i.titulo}: ${i.detalhe.split(" — ")[0].replace(/\s*\([^)]*\)/g, "")}`);
  const e = estadoAtualizacao();
  return montarResumo({
    agora,
    nome: (getConfig().nomeDoUsuario || "").trim(),
    // "Sem cidade configurada" não é notícia no bom dia.
    clima: clima && !/defina|configur/i.test(clima) ? clima : null,
    lembretes,
    rotinas,
    recadosNovos,
    alertas,
    versaoNova: e.desktop?.pronto ? e.desktop.versao : null,
    habitosFaltando: listarHabitos().map(h => resumirHabito(h, agora)).filter(h => h.valeHoje && !h.feitoHoje).map(h => ({ nome: h.nome, sequencia: h.sequencia })),
    ...(await extrasFase18(agora)),
    agenda: agenda ?? (eventos ?? []).filter(e => !e.diaInteiro && e.inicio > agora.getTime()).map(e => ({ titulo: e.titulo, em: e.inicio })),
  });
}

/** Promessa com prazo: o resumo é falado, não pode esperar o modelo por 9 s. */
function ate<T>(ms: number, p: Promise<T>): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>(r => setTimeout(() => r(null), ms))]);
}

/**
 * O que a fase 18 somou ao resumo. A dica e a ideia normalmente já estão no cache (o Hoje as
 * gerou); se não, esperam no máximo 4 s e o resumo segue sem elas.
 */
async function extrasFase18(agora: Date): Promise<Partial<FatosResumo>> {
  const corpo = (() => { try { return montarPainelCorpo(agora); } catch { return null; } })();
  const temCorpo = !!corpo && (corpo.treinos.length > 0 || !corpo.faltaPerfil.length);
  const th = temCorpo ? corpo!.treinoHoje : null;
  let atrasadas: string[] = [];
  try { atrasadas = listarTarefas().filter(t => !t.feita && t.prazo && t.prazo < agora.getTime()).map(t => t.texto); } catch { /* segue */ }
  const [dica, ideia, notas] = await Promise.all([
    temCorpo ? ate(4000, dicaDoCorpo(false, agora)) : Promise.resolve(null),
    ate(4000, ideiaDoDia([], false, agora)),
    ate(4000, notasDaVersaoAtual()),
  ]);
  const secoes = notas ? secoesDasNotas(notas.texto) : null;
  return {
    tarefasAtrasadas: atrasadas,
    treino: th ? { nome: th.treino.nome, exercicios: th.treino.exercicios.map(e => e.nome), feito: th.feitoHoje } : null,
    meta: temCorpo && corpo!.meta ? { kcal: corpo!.meta.kcal, proteinaG: corpo!.meta.proteinaG } : null,
    dica: dica?.texto ?? null,
    corrida: temCorpo ? { semana: corpo!.corrida.semana, texto: corpo!.corrida.texto, feitaHoje: corpo!.corrida.feitaHoje } : null,
    elysium: notas && secoes?.novidades.length ? { versao: notas.versao, novidade: secoes.novidades[0], paraTestar: secoes.paraTestar.length } : null,
    ideia,
  };
}
