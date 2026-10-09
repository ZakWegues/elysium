import Store from "electron-store";
import { semAcento } from "./texto";

/**
 * Listas que o PC e o celular dividem — compras, tarefas e o que mais o Zak criar (bloco
 * 135). É o que se elogia na Alexa: "põe leite na lista" de qualquer lugar e a lista está
 * no celular na hora do mercado.
 *
 * O nome da lista é normalizado ("mercado", "supermercado", "lista de compras" = Compras;
 * "afazeres", "pendências" = Tarefas), e item repetido não duplica: o que já está na lista
 * é ignorado, e o que já foi marcado volta a ficar pendente. As funções puras ficam no
 * topo, para teste; o resto é o store.
 */

export interface ItemLista { id: string; texto: string; feito: boolean; em: number }
export interface Lista { id: string; nome: string; itens: ItemLista[]; atualizadaEm: number }

const semAcentoLocal = (s: string) => semAcento(s).trim();

const SINONIMOS: [RegExp, string][] = [
  [/^(compras?|mercado|supermercado|feira|lista de compras?|do mercado)$/, "Compras"],
  [/^(tarefas?|afazeres|a fazer|pendencias?|to ?do|coisas pra fazer|coisas para fazer)$/, "Tarefas"],
  [/^(notas?|anotacoes|notas rapidas)$/, "Notas"],
];

/** "lista do mercado" → "Compras"; "lista de presentes" → "Presentes". Pura. */
export function normalizarNomeLista(nome: string | undefined): string {
  const limpo = semAcentoLocal(nome ?? "")
    .replace(/^(a |na |da |minha |)lista\s*(de |do |da |dos |das |pra |para |)/, "")
    .replace(/^(de |do |da )/, "")
    .trim();
  if (!limpo) return "Compras";
  for (const [re, nomeCanonico] of SINONIMOS) if (re.test(limpo)) return nomeCanonico;
  // Nome livre: devolve como o usuário escreveu (com acento), só sem o "lista de".
  const original = (nome ?? "").trim().replace(/^(a |na |da |minha )?lista\s*(de |do |da |dos |das |pra |para )?/i, "").trim();
  return original.charAt(0).toUpperCase() + original.slice(1);
}

/** "leite, ovo e café" → ["leite", "ovo", "café"]. Pura. */
export function separarItens(texto: string): string[] {
  return texto
    .split(/\s*(?:,|;|\n|\s+e\s+|\s+mais\s+)\s*/i)
    .map(s => s.trim().replace(/^(um|uma|uns|umas|o|a|os|as)\s+/i, "").replace(/[.!?]+$/, "").trim())
    .filter(s => s.length > 0 && s.length <= 80);
}

/** Junta itens novos à lista, sem duplicar. Pura (não muta a lista recebida). */
export function juntarItens(lista: Lista, novos: string[], agora = Date.now()): { lista: Lista; adicionados: string[]; repetidos: string[] } {
  const itens = lista.itens.map(i => ({ ...i }));
  const adicionados: string[] = [];
  const repetidos: string[] = [];
  for (const texto of novos) {
    const chave = semAcentoLocal(texto);
    const existente = itens.find(i => semAcentoLocal(i.texto) === chave);
    if (existente && !existente.feito) { repetidos.push(texto); continue; }
    if (existente) { existente.feito = false; existente.em = agora; adicionados.push(texto); continue; }
    itens.push({ id: `i-${agora.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, texto, feito: false, em: agora });
    adicionados.push(texto);
  }
  return { lista: { ...lista, itens, atualizadaEm: agora }, adicionados, repetidos };
}

/** O item que o usuário quis dizer ("o leite" → "leite integral"). Pura. */
export function acharItem(lista: Lista, texto: string): ItemLista | undefined {
  const q = semAcentoLocal(texto).replace(/^(o|a|os|as)\s+/, "");
  return lista.itens.find(i => semAcentoLocal(i.texto) === q) ?? lista.itens.find(i => semAcentoLocal(i.texto).includes(q) || q.includes(semAcentoLocal(i.texto)));
}

/**
 * "põe leite e ovo na lista do mercado" → { itens, lista }. Para o atalho sem modelo
 * (fastRoute). Só frases inequívocas: verbo de pôr + "na lista". Pura.
 */
export function pedidoDeLista(texto: string): { itens: string[]; lista: string } | null {
  const m = /^\s*(?:p[oõ]e|coloca|adiciona|acrescenta|bota|anota)\s+(.+?)\s+(?:na|à|a)\s+(?:minha\s+)?lista(?:\s+(?:de|do|da|dos|das|pra|para)\s+(.+?))?\s*[.!]?\s*$/i.exec(texto);
  if (!m) return null;
  // "lista de reprodução" é playlist (Spotify), não lista de compras.
  if (m[2] && /reprodu|playlist|spotify|m[uú]sica/i.test(m[2])) return null;
  const itens = separarItens(m[1]);
  if (!itens.length) return null;
  return { itens, lista: normalizarNomeLista(m[2] ? `lista de ${m[2]}` : undefined) };
}

/**
 * "Anota que a reunião mudou para quinta" → item na lista Notas (02/10). Diferente de
 * "lembra que…" (memória): a nota é para o Zak reler, a Ely não a usa como fato sobre ele.
 * Pura.
 */
export function pedidoDeNota(texto: string): string | null {
  const m = /^\s*(?:anota|anote|toma nota|tome nota)(?:\s+(?:a[ií]|isso|pra mim))?\s*(?:que\s+|:\s*)(.{3,300}?)\s*[.!]?\s*$/i.exec(texto);
  return m ? m[1].trim() : null;
}

/**
 * "Digita bom dia a todos" → digita onde o cursor está (02/10, ditado). Só com "digita" ou
 * "escreve aí/aqui": "escreve um poema" é pedido de texto para a Ely, não ditado. Pura.
 */
export function pedidoDeDitado(texto: string): string | null {
  const m = /^\s*(?:digita|digite|escreve a[ií]|escreva a[ií]|escreve aqui|escreva aqui)\s*[:,]?\s+(.{1,1000})$/i.exec(texto);
  return m ? m[1].trim() : null;
}

/** Uma lista em frase curta (para a voz e para a ferramenta). Pura. */
export function listaFalada(lista: Lista): string {
  const pendentes = lista.itens.filter(i => !i.feito).map(i => i.texto);
  if (!pendentes.length) return `A lista ${lista.nome} está vazia.`;
  const ultimo = pendentes.length > 1 ? ` e ${pendentes[pendentes.length - 1]}` : "";
  return `Na lista ${lista.nome}: ${pendentes.slice(0, pendentes.length > 1 ? -1 : 1).join(", ")}${ultimo}.`;
}

// ── store ────────────────────────────────────────────────────────────────────

const store = new Store<{ listas: Lista[] }>({ name: "listas", defaults: { listas: [] } });

export function listarListas(): Lista[] {
  return store.get("listas", []).slice().sort((a, b) => b.atualizadaEm - a.atualizadaEm);
}

function gravar(listas: Lista[]) { store.set("listas", listas); }

export function obterLista(nome: string, criar = false): Lista | undefined {
  const n = normalizarNomeLista(nome);
  const achada = store.get("listas", []).find(l => semAcentoLocal(l.nome) === semAcentoLocal(n));
  if (achada || !criar) return achada;
  // Sufixo aleatório (fase 19): o despejo cria "Compras" e "Notas" no mesmo milissegundo, e
  // com o id só do relógio as duas nasciam iguais — gravar uma sobrescrevia a outra.
  const nova: Lista = { id: `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, nome: n, itens: [], atualizadaEm: Date.now() };
  gravar([...store.get("listas", []), nova]);
  return nova;
}

export function adicionarNaLista(nome: string, itens: string[]): { lista: Lista; adicionados: string[]; repetidos: string[] } {
  const atual = obterLista(nome, true)!;
  const r = juntarItens(atual, itens);
  gravar(store.get("listas", []).map(l => l.id === atual.id ? r.lista : l));
  return r;
}

export function marcarItem(nome: string, texto: string, feito = true): ItemLista | null {
  const lista = obterLista(nome);
  if (!lista) return null;
  const item = acharItem(lista, texto);
  if (!item) return null;
  const nova = { ...lista, atualizadaEm: Date.now(), itens: lista.itens.map(i => i.id === item.id ? { ...i, feito } : i) };
  gravar(store.get("listas", []).map(l => l.id === lista.id ? nova : l));
  return { ...item, feito };
}

/** Pelo id (o card e o celular sabem o id exato). */
export function alternarItem(listaId: string, itemId: string, feito: boolean): Lista | null {
  const lista = store.get("listas", []).find(l => l.id === listaId);
  if (!lista) return null;
  const nova = { ...lista, atualizadaEm: Date.now(), itens: lista.itens.map(i => i.id === itemId ? { ...i, feito } : i) };
  gravar(store.get("listas", []).map(l => l.id === listaId ? nova : l));
  return nova;
}

export function removerItem(listaId: string, itemId: string): Lista | null {
  const lista = store.get("listas", []).find(l => l.id === listaId);
  if (!lista) return null;
  const nova = { ...lista, atualizadaEm: Date.now(), itens: lista.itens.filter(i => i.id !== itemId) };
  gravar(store.get("listas", []).map(l => l.id === listaId ? nova : l));
  return nova;
}

export function limparFeitos(nome: string): number {
  const lista = obterLista(nome);
  if (!lista) return 0;
  const antes = lista.itens.length;
  const nova = { ...lista, atualizadaEm: Date.now(), itens: lista.itens.filter(i => !i.feito) };
  gravar(store.get("listas", []).map(l => l.id === lista.id ? nova : l));
  return antes - nova.itens.length;
}

export function apagarLista(listaId: string): boolean {
  const antes = store.get("listas", []);
  const depois = antes.filter(l => l.id !== listaId);
  gravar(depois);
  return depois.length !== antes.length;
}

/** Backup (bloco 96): soma, não substitui — mesma regra do resto. */
export function importarListas(listas: Lista[]): number {
  let n = 0;
  for (const l of listas) {
    if (!l || typeof l.nome !== "string" || !Array.isArray(l.itens)) continue;
    const r = adicionarNaLista(l.nome, l.itens.filter(i => i && !i.feito && typeof i.texto === "string").map(i => i.texto));
    n += r.adicionados.length;
  }
  return n;
}
