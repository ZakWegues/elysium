import { getConfig } from "../main/config";
import { climaFalado } from "./clima";
import { listPending } from "./scheduler";
import { listarRotinas, proximoDisparo } from "./rotinas";
import { listMessages } from "./mailboxStore";
import { verificarSaude } from "./saude";
import { estadoAtualizacao } from "./atualizacao";
import { eventosDoDia } from "./agenda";

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
  if (f.alertas.length) partes.push(`Atenção: ${f.alertas.slice(0, 3).join("; ")}.`);
  if (f.versaoNova) partes.push(`A versão ${f.versaoNova} do ELYSIUM está pronta para instalar.`);

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
    agenda: agenda ?? (eventos ?? []).filter(e => !e.diaInteiro && e.inicio > agora.getTime()).map(e => ({ titulo: e.titulo, em: e.inicio })),
  });
}
