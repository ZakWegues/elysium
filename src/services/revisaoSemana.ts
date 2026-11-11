import { listarTarefasTodas, estaAtrasada, type Tarefa } from "./tarefas";
import { diaDe, listarHabitos, listarMetas, contaNoDia, feitoNoDia, forca, type Habito, type Meta } from "./habitos";
import { exportarCorpo } from "./corpo";

/**
 * Revisão da semana (fase 18, 08/10) — o "weekly review" que os apps de produtividade mais
 * elogiados (Todoist, Things) têm: o que foi feito, o que ficou para trás, como estão os
 * hábitos e as metas. Domingo à tarde a página Hoje oferece; a Ely também lê pela voz.
 *
 * `montarRevisao` é pura (dados → texto e números), para teste.
 */

export interface DadosRevisao {
  tarefas: Tarefa[];
  habitos: Habito[];
  metas: Meta[];
  treinos: number;
  corridas: number;
}

export interface Revisao {
  texto: string;
  concluidas: string[];
  atrasadas: string[];
  habitos: { nome: string; feitos: number; dias: number; forca: number }[];
  metas: { titulo: string; progresso: number; alvo: number }[];
  treinos: number;
  corridas: number;
}

const lista = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;

export function montarRevisao(d: DadosRevisao, agora = new Date()): Revisao {
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 6).getTime();
  const concluidas = d.tarefas.filter(t => t.feita && (t.feitaEm ?? 0) >= inicio).map(t => t.texto);
  const atrasadas = d.tarefas.filter(t => estaAtrasada(t, agora.getTime())).map(t => t.texto);
  const habitos = d.habitos.map(h => {
    let feitos = 0, dias = 0;
    for (let i = 0; i < 7; i++) {
      const dia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - i);
      if (!contaNoDia(h, dia)) continue;
      dias++;
      if (feitoNoDia(h, dia)) feitos++;
    }
    return { nome: h.nome, feitos, dias, forca: forca(h, agora) };
  }).filter(h => h.dias > 0);
  const metas = d.metas.filter(m => !m.concluidaEm).map(m => ({ titulo: m.titulo, progresso: m.progresso, alvo: m.alvo }));

  const partes: string[] = [];
  partes.push(concluidas.length ? `Nesta semana você concluiu ${concluidas.length === 1 ? "uma tarefa" : `${concluidas.length} tarefas`}${concluidas.length <= 4 ? `: ${lista(concluidas)}` : ""}.` : "Nenhuma tarefa concluída nesta semana.");
  if (atrasadas.length) partes.push(`${atrasadas.length === 1 ? "Uma ficou atrasada" : `${atrasadas.length} ficaram atrasadas`}: ${lista(atrasadas.slice(0, 4))} — vale reagendar ou desistir de vez.`);
  if (habitos.length) {
    const melhor = [...habitos].sort((a, b) => b.feitos / b.dias - a.feitos / a.dias)[0];
    const pior = [...habitos].sort((a, b) => a.feitos / a.dias - b.feitos / b.dias)[0];
    partes.push(`Hábitos: ${habitos.map(h => `${h.nome} ${h.feitos} de ${h.dias}`).join(", ")}.`);
    if (melhor && melhor.feitos === melhor.dias && melhor.dias > 1) partes.push(`${melhor.nome} foi perfeito.`);
    if (pior && pior !== melhor && pior.feitos / pior.dias < 0.5) partes.push(`${pior.nome} pede atenção na semana que vem.`);
  }
  // Treino e corrida ficam só nos números (para quem pergunta), não no texto (o dono, 08/10).
  if (metas.length) partes.push(`Metas: ${metas.map(m => `${m.titulo} em ${m.progresso} de ${m.alvo}`).join(", ")}.`);
  partes.push("Escolha a prioridade da próxima semana e me diga — eu anoto.");
  return { texto: partes.join(" "), concluidas, atrasadas, habitos, metas, treinos: d.treinos, corridas: d.corridas };
}

export function revisaoDaSemana(agora = new Date()): Revisao {
  const inicio = diaDe(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 6));
  const corpo = (() => { try { return exportarCorpo(); } catch { return null; } })();
  return montarRevisao({
    tarefas: listarTarefasTodas(),
    habitos: listarHabitos(),
    metas: listarMetas(),
    treinos: corpo ? corpo.feitos.filter(f => f.data >= inicio).length : 0,
    corridas: corpo ? corpo.corridas.filter(c => c.data >= inicio).length : 0,
  }, agora);
}
