import { getConfig } from "../main/config";
import { estadoFoco } from "./foco";
import { diaDe } from "./habitos";

/**
 * Orçamento de avisos que a Ely dá por iniciativa própria (fase 18, 08/10).
 *
 * A pesquisa sobre assistentes proativos: o que irrita não é o aviso, é o aviso fora de hora
 * e em excesso — um conteúdo útil atrapalha se chega no meio de outra coisa. Então:
 *  - no modo foco, nada de falar nem de mandar para o celular (só a notificação do PC);
 *  - por dia, no máximo `avisosProativosPorDia` (padrão 6) falados/enviados; o resto vira só
 *    notificação discreta.
 * Lembrete que o dono PEDIU não passa por aqui — esse toca sempre.
 *
 * `podeAvisarAlto` é a única porta; `decidirAviso` é a conta pura, para teste.
 */

let contagem = { dia: "", n: 0 };

export function decidirAviso(estado: { focoAtivo: boolean; usadosHoje: number; limite: number }): "alto" | "discreto" {
  if (estado.focoAtivo) return "discreto";
  return estado.usadosHoje < Math.max(0, estado.limite) ? "alto" : "discreto";
}

/** true = pode falar e mandar para o celular (e já conta no orçamento do dia). */
export function podeAvisarAlto(agora = new Date()): boolean {
  const hoje = diaDe(agora);
  if (contagem.dia !== hoje) contagem = { dia: hoje, n: 0 };
  let focoAtivo = false;
  try { focoAtivo = estadoFoco().ativo; } catch { /* sem foco */ }
  const decisao = decidirAviso({ focoAtivo, usadosHoje: contagem.n, limite: getConfig().avisosProativosPorDia ?? 6 });
  if (decisao === "alto") contagem.n++;
  return decisao === "alto";
}
