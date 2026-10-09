import { getApiKey, getConfig } from "../main/config";
import { callChat, type Provider } from "./llm";
import { ehCompromisso, interpretarQuando, interpretarTexto } from "./planoDeLembrete";
import { criarTarefa } from "./tarefas";
import { adicionarNaLista, normalizarNomeLista } from "./listas";
import { criarLembreteComTarefa, rotuloDoPrazo } from "../actions/memoryActions";

/**
 * Despejo por voz (fase 19, bloco 194).
 *
 * A pessoa fala tudo de uma vez — "amanhã preciso comprar pão e leite, estudar física sexta às
 * 14h, ligar pra vó, e tive uma ideia de vídeo sobre SSD" — e a Ely separa em tarefas (com
 * data), itens de lista e notas. É o que se elogia no Ramble do Todoist. A regra que importa:
 * NADA é gravado antes de ele ver a prévia e confirmar ("Confirma? Diga sim." na voz; marcar
 * e "Salvar" na tela). Um modelo errando a separação custa uma olhada, não uma bagunça na lista.
 *
 * As datas NÃO vêm do modelo: cada tarefa passa pelo mesmo leitor de "sexta 14h" do quick add
 * (`interpretarTexto`) — a fase 17 mostrou o 7B errando o dia da semana.
 */

export interface ItemDespejo {
  id: string;
  tipo: "tarefa" | "lista" | "nota";
  texto: string;
  /** Só para `lista`: o nome normalizado ("Compras"). */
  lista?: string;
  /** Só para `tarefa` com data: no formato do `interpretarQuando`. */
  quando?: string | null;
  semHora?: boolean;
  /** "sexta às 14h" — para a prévia. */
  rotulo?: string | null;
}

const MAX_ITENS = 20;

const PROMPT = `Você organiza um "despejo" falado: a pessoa disse várias coisas de uma vez e você separa cada uma.
Responda só JSON: {"itens": [{"tipo": "tarefa", "texto": "..."}, {"tipo": "lista", "lista": "Compras", "texto": "leite"}, {"tipo": "nota", "texto": "..."}]}
- tarefa: algo para FAZER. Mantenha no texto as palavras de dia e hora exatamente como ele falou ("estudar física sexta às 14h"). Comece pelo verbo.
- lista: item para comprar ou pôr numa lista com nome ("lista do mercado" = Compras). Um item por entrada.
- nota: ideia ou informação para guardar, que não é uma ação.
Não invente nada que ele não disse. Não junte coisas diferentes num item só. No máximo ${MAX_ITENS} itens.`;

/** O JSON do modelo → itens válidos, com as datas lidas do texto. Pura. */
export function interpretarDespejo(bruto: string, agora = new Date()): ItemDespejo[] {
  let j: unknown;
  try { j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)); } catch { return []; }
  const itens = (j as { itens?: unknown })?.itens;
  if (!Array.isArray(itens)) return [];
  const saida: ItemDespejo[] = [];
  const vistos = new Set<string>();
  for (const [i, bruto] of itens.entries()) {
    const it = bruto as { tipo?: unknown; texto?: unknown; lista?: unknown };
    const tipo = it?.tipo === "tarefa" || it?.tipo === "lista" || it?.tipo === "nota" ? it.tipo : null;
    const texto = typeof it?.texto === "string" ? it.texto.trim().replace(/\s+/g, " ").replace(/[.;]+$/, "") : "";
    if (!tipo || texto.length < 2 || texto.length > 200) continue;
    const chave = `${tipo}|${texto.toLowerCase()}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const id = `d${i}`;
    if (tipo === "lista") {
      saida.push({ id, tipo, texto, lista: normalizarNomeLista(typeof it.lista === "string" ? it.lista : "Compras") });
    } else if (tipo === "tarefa") {
      const lido = interpretarTexto(texto, agora);
      const q = lido.quando ? interpretarQuando(lido.quando, lido.semHora) : null;
      saida.push({
        id, tipo, texto: lido.quando ? lido.texto : texto,
        quando: lido.quando, semHora: lido.semHora,
        rotulo: q ? rotuloDoPrazo(q.ms, !q.temHora && ehCompromisso(lido.texto)) : null,
      });
    } else {
      saida.push({ id, tipo, texto });
    }
    if (saida.length >= MAX_ITENS) break;
  }
  return saida;
}

/** "2 tarefas (estudar física, sexta às 14h; ligar pra vó), 2 itens em Compras e 1 nota". Pura. */
export function descreverDespejo(itens: ItemDespejo[]): string {
  const tarefas = itens.filter(i => i.tipo === "tarefa");
  const listas = itens.filter(i => i.tipo === "lista");
  const notas = itens.filter(i => i.tipo === "nota");
  const partes: string[] = [];
  if (tarefas.length) partes.push(`${tarefas.length === 1 ? "1 tarefa" : `${tarefas.length} tarefas`} (${tarefas.map(t => (t.rotulo ? `${t.texto}, ${t.rotulo}` : t.texto)).join("; ")})`);
  const porLista = new Map<string, number>();
  for (const l of listas) porLista.set(l.lista ?? "Compras", (porLista.get(l.lista ?? "Compras") ?? 0) + 1);
  for (const [nome, n] of porLista) partes.push(`${n === 1 ? "1 item" : `${n} itens`} em ${nome}`);
  if (notas.length) partes.push(notas.length === 1 ? "1 nota" : `${notas.length} notas`);
  if (!partes.length) return "";
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/** Pede a separação ao modelo. Não grava nada. */
export async function interpretarFala(texto: string): Promise<ItemDespejo[]> {
  const t = texto.trim().slice(0, 4000);
  if (t.length < 10) return [];
  const cfg = getConfig();
  const tentar = (provider: Provider) => callChat({
    provider, model: provider === "ollama" ? cfg.ollamaChatModel : cfg.brainModel, json: true,
    messages: [{ role: "system", content: PROMPT }, { role: "user", content: t }],
    temperature: 0.1, maxTokens: 1200, timeoutMs: 60_000,
  });
  // A separação é o tipo de tarefa em que o modelo grande erra bem menos; o local é a reserva.
  const primeiro: Provider = cfg.chatProvider === "ollama" || !getApiKey() ? "ollama" : "groq";
  let bruto: string;
  try { bruto = await tentar(primeiro); }
  catch (e) {
    if (primeiro === "ollama" && getApiKey()) bruto = await tentar("groq");
    else if (primeiro === "groq") bruto = await tentar("ollama");
    else throw e;
  }
  return interpretarDespejo(bruto);
}

/** "2026-10-09" ou "2026-10-09T14:00", com mês, dia e hora que existem. Pura. */
export function dataValida(q: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(q);
  if (!m) return false;
  const [a, mes, d, h, min] = m.slice(1).map(x => Number(x ?? 0));
  const dt = new Date(a, mes - 1, d, h, min);
  return dt.getFullYear() === a && dt.getMonth() === mes - 1 && dt.getDate() === d && h < 24 && min < 60;
}

/**
 * Itens que vieram do celular ou do dashboard (já na prévia, talvez editados): confere tudo de
 * novo antes de gravar — o cliente não decide tipo nem tamanho. Pura.
 */
export function validarItens(bruto: unknown): ItemDespejo[] {
  if (!Array.isArray(bruto)) return [];
  const saida: ItemDespejo[] = [];
  for (const [i, x] of bruto.slice(0, MAX_ITENS).entries()) {
    const it = x as Partial<ItemDespejo> | null;
    if (!it || (it.tipo !== "tarefa" && it.tipo !== "lista" && it.tipo !== "nota")) continue;
    const texto = typeof it.texto === "string" ? it.texto.trim().slice(0, 200) : "";
    if (texto.length < 2) continue;
    const item: ItemDespejo = { id: typeof it.id === "string" ? it.id.slice(0, 20) : `d${i}`, tipo: it.tipo, texto };
    if (it.tipo === "lista") item.lista = normalizarNomeLista(typeof it.lista === "string" ? it.lista.slice(0, 60) : "Compras");
    if (it.tipo === "tarefa" && typeof it.quando === "string" && dataValida(it.quando) && interpretarQuando(it.quando, !!it.semHora)) {
      item.quando = it.quando;
      item.semHora = !!it.semHora;
    }
    saida.push(item);
  }
  return saida;
}

/** Grava os itens escolhidos. Devolve o que entrou e o que não deu (com o motivo). */
export function aplicarDespejo(itens: ItemDespejo[]): { criados: number; falhas: string[]; mensagem: string } {
  let criados = 0;
  const falhas: string[] = [];
  for (const it of itens.slice(0, MAX_ITENS)) {
    try {
      if (it.tipo === "lista") { adicionarNaLista(it.lista ?? "Compras", [it.texto]); criados++; continue; }
      if (it.tipo === "nota") { adicionarNaLista("Notas", [it.texto]); criados++; continue; }
      if (it.quando) {
        const r = criarLembreteComTarefa(it.texto, it.quando, false, it.semHora, { usarPedido: false });
        if (r.ok) { criados++; continue; }
        // Data que já passou: a tarefa entra sem data, e ele vê o porquê.
        criarTarefa({ texto: it.texto, origem: "manual" });
        criados++;
        falhas.push(`"${it.texto}" entrou sem data (${r.mensagem.replace(/\.$/, "")})`);
        continue;
      }
      criarTarefa({ texto: it.texto, origem: "manual" });
      criados++;
    } catch (e) {
      falhas.push(`"${it.texto}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const mensagem = criados
    ? `Pronto, anotei ${criados === 1 ? "1 coisa" : `${criados} coisas`}.${falhas.length ? ` ${falhas.join("; ")}.` : ""}`
    : `Não consegui anotar nada.${falhas.length ? ` ${falhas.join("; ")}.` : ""}`;
  return { criados, falhas, mensagem };
}
