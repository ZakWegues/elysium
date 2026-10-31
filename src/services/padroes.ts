import Store from "electron-store";
import { todaAtividade, type ItemDeAtividade } from "./atividade";
import { listarRotinas, salvarRotina, type Rotina } from "./rotinas";
import { semAcento } from "./texto";

/**
 * Rotinas aprendidas (31/10): a Ely nota o que o Zak pede quase todo dia na mesma hora e
 * oferece virar rotina — "Você costuma pedir “abre o Spotify” por volta das 22h".
 *
 * Fonte: a linha do tempo (`atividade.ts`, 7 dias), só os itens com o `pedido` original (é ele
 * que a rotina vai executar). Padrão = o mesmo pedido em pelo menos 3 dias diferentes, todos a
 * até 45 min da hora mediana. Sem modelo, sem nada saindo do PC.
 *
 * A oferta aparece como sugestão no Início do PC e no Hoje do celular. Aceitar cria a rotina;
 * ignorar 5 vezes (ou recusar no celular) silencia aquele padrão por 30 dias.
 */

export interface Padrao {
  /** Chave estável: o pedido normalizado. */
  chave: string;
  pedido: string;
  /** "HH:MM", arredondada a 5 min. */
  hora: string;
  dias: number;
}

const MIN_DIAS = 3;
const JANELA_MIN = 45;
const TRINTA_DIAS = 30 * 86_400_000;
const MAX_OFERTAS = 5;

const store = new Store<{ silenciados: Record<string, number>; ofertas: Record<string, number> }>({
  name: "padroes", defaults: { silenciados: {}, ofertas: {} },
});

function chaveDe(pedido: string): string {
  return semAcento(pedido).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function minutoDoDia(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

function diaDe(ms: number): string {
  return new Date(ms).toDateString();
}

/** Acha os padrões nos itens dados. Puro (fora o relógio dos itens). */
export function acharPadroes(itens: ItemDeAtividade[]): Padrao[] {
  const grupos = new Map<string, { pedido: string; vezes: ItemDeAtividade[] }>();
  for (const i of itens) {
    if (!i.pedido) continue;
    const chave = chaveDe(i.pedido);
    if (chave.length < 4) continue;
    const g = grupos.get(chave) ?? { pedido: i.pedido.trim(), vezes: [] };
    g.vezes.push(i);
    grupos.set(chave, g);
  }
  const achados: Padrao[] = [];
  for (const [chave, g] of grupos) {
    // Uma vez por dia (a primeira): três pedidos seguidos no mesmo dia não são hábito.
    const porDia = new Map<string, number>();
    for (const v of g.vezes) if (!porDia.has(diaDe(v.em))) porDia.set(diaDe(v.em), minutoDoDia(v.em));
    if (porDia.size < MIN_DIAS) continue;
    const minutos = [...porDia.values()].sort((a, b) => a - b);
    const mediana = minutos[Math.floor(minutos.length / 2)];
    const perto = minutos.filter(m => Math.abs(m - mediana) <= JANELA_MIN);
    if (perto.length < MIN_DIAS) continue;
    const media = Math.round(perto.reduce((a, b) => a + b, 0) / perto.length / 5) * 5;
    const hora = `${String(Math.floor(media / 60) % 24).padStart(2, "0")}:${String(media % 60).padStart(2, "0")}`;
    achados.push({ chave, pedido: g.pedido, hora, dias: perto.length });
  }
  return achados.sort((a, b) => b.dias - a.dias);
}

/** Já existe rotina que faz isso? (mesmo texto normalizado) */
function jaEhRotina(p: Padrao, rotinas: Rotina[]): boolean {
  return rotinas.some(r => chaveDe(r.texto) === p.chave);
}

/** Os padrões que valem oferecer agora (sem rotina igual, sem silêncio em vigor). */
export function padroesParaOferecer(agora = Date.now()): Padrao[] {
  const silenciados = store.get("silenciados");
  const rotinas = listarRotinas();
  return acharPadroes(todaAtividade()).filter(p => !(silenciados[p.chave] > agora) && !jaEhRotina(p, rotinas));
}

/** Conta uma exibição; na 5ª sem aceitar, silencia por 30 dias. */
export function contarOferta(chave: string, agora = Date.now()): void {
  const ofertas = store.get("ofertas");
  ofertas[chave] = (ofertas[chave] ?? 0) + 1;
  if (ofertas[chave] >= MAX_OFERTAS) { silenciarPadrao(chave, agora); delete ofertas[chave]; }
  store.set("ofertas", ofertas);
}

export function silenciarPadrao(chave: string, agora = Date.now()): void {
  store.set("silenciados", { ...store.get("silenciados"), [chave]: agora + TRINTA_DIAS });
}

/** Aceitar: vira rotina diária na hora do padrão. */
export function aceitarPadrao(chave: string, agora = Date.now()): Rotina | null {
  const p = acharPadroes(todaAtividade()).find(x => x.chave === chave);
  if (!p) return null;
  const nome = p.pedido.charAt(0).toUpperCase() + p.pedido.slice(1);
  const rotina = salvarRotina({ nome: nome.slice(0, 60), texto: p.pedido, hora: p.hora, dias: [], entregar: ["pc"], falar: false });
  silenciarPadrao(chave, agora);
  return rotina;
}

/** Texto da oferta: "Você costuma pedir “abre o spotify” por volta das 22h." */
export function textoDaOferta(p: Padrao): string {
  const [h, m] = p.hora.split(":").map(Number);
  return `Você costuma pedir “${p.pedido}” por volta das ${h}h${m ? String(m).padStart(2, "0") : ""}. Criar rotina?`;
}

/** Só para os testes. */
export function zerarPadroes(): void { store.set("silenciados", {}); store.set("ofertas", {}); }
