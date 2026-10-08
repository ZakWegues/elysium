import { descreverSeries, gastoDaCorrida, listarTreinos, marcarTreino, montarPainelCorpo, registrarCorrida, registrarPeso } from "./corpo";
import { acharHabito, listarHabitos, marcarHabito } from "./habitos";

/**
 * O lado falado do treino (fase 18): o que a Ely responde ao "treinei", "corri 20 minutos" e
 * "pesei 58 quilos", e o texto que as ferramentas do agente leem. Separado de `corpo.ts`
 * para as contas lá continuarem puras e testáveis sem o resto do app.
 */

/** Marca o treino da vez (ou o citado) e, se existir um hábito de academia, ele junto. */
export function marcarTreinoFalado(nome?: string): string {
  const treinos = listarTreinos();
  if (!treinos.length) return "Ainda não tenho seus treinos cadastrados — dá para pôr na página Hoje.";
  const citado = nome ? treinos.find(t => t.nome.toLowerCase() === nome.toLowerCase()) ?? acharHabito(treinos, nome) : undefined;
  if (nome && !citado) return `Não achei o ${nome}. Os seus: ${treinos.map(t => t.nome).join(", ")}.`;
  const t = marcarTreino(true, citado?.id);
  if (!t) return "Não consegui marcar o treino.";
  // O hábito "Academia" (ou "Treino", "Musculação") é o mesmo fato — marcar duas vezes à mão
  // seria pedir para esquecer um.
  const habito = ["academia", "treino", "musculação", "musculacao", "malhar"]
    .map(n => acharHabito(listarHabitos(), n))
    .find(Boolean);
  if (habito) marcarHabito(habito.id, true);
  const p = montarPainelCorpo();
  const proximo = p.treinoHoje?.proximo;
  return `${t.nome} marcado${habito ? `, e ${habito.nome} também` : ""}. ${p.treinosNoMes} treino${p.treinosNoMes === 1 ? "" : "s"} este mês.${proximo ? ` O próximo é o ${proximo}.` : ""}`;
}

export function registrarCorridaFalada(minutos: number, km?: number): string {
  try {
    const antes = montarPainelCorpo();
    registrarCorrida(minutos, km, true);
    const p = montarPainelCorpo();
    const gasto = p.perfil.pesoKg ? gastoDaCorrida(minutos, p.perfil.pesoKg, km) : 0;
    const avancou = p.corrida.semana > antes.corrida.semana ? ` Semana ${p.corrida.semana} do plano liberada.` : "";
    const meta = p.meta && gasto ? ` Somei ${gasto} kcal na meta de hoje: ${p.meta.kcal}.` : "";
    return `Corrida de ${minutos} minutos anotada${km ? `, ${String(km).replace(".", ",")} km` : ""}.${meta}${avancou}`;
  } catch (e) {
    return `Não consegui anotar: ${(e as Error).message}.`;
  }
}

export function registrarPesoFalado(kg: number): string {
  try {
    registrarPeso(kg);
    const p = montarPainelCorpo();
    return `Peso de ${String(kg).replace(".", ",")} kg anotado.${p.meta ? ` Meta de hoje: ${p.meta.kcal} kcal.` : ""}${p.sugestao ? ` ${p.sugestao}` : ""}`;
  } catch (e) {
    return `Não consegui anotar o peso: ${(e as Error).message}.`;
  }
}

/** O treino da vez em texto, para a ferramenta e para a voz. */
export function treinoDeHojeFalado(): string {
  const p = montarPainelCorpo();
  if (!p.treinoHoje) return "Ainda não tenho seus treinos cadastrados.";
  const { treino, feitoHoje, proximo } = p.treinoHoje;
  const lista = treino.exercicios.map(e => `${e.nome} (${descreverSeries(e)}${e.carga ? `, ${e.carga}` : ""})`).join("; ");
  return `${feitoHoje ? `O ${treino.nome} de hoje já foi feito.` : `Hoje é o ${treino.nome}:`} ${lista}.${feitoHoje && proximo ? ` O próximo é o ${proximo}.` : ""}`;
}

export function metaFalada(): string {
  const p = montarPainelCorpo();
  if (!p.meta) return `Para calcular a meta faltam: ${p.faltaPerfil.join(", ")}. Dá para preencher na página Hoje.`;
  const m = p.meta;
  return `Meta de hoje: ${m.kcal} kcal — ${m.proteinaG} g de proteína, ${m.gorduraG} g de gordura e ${m.carboG} g de carboidrato.${m.corrida ? ` Já inclui ${m.corrida} kcal da corrida.` : ""}${p.sugestao ? ` ${p.sugestao}` : ""}`;
}
