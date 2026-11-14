import { getApiKey } from "../main/config";
import { semAcento } from "./texto";
import type { ElementoUia, LeituraUia } from "./uiaHost";

/**
 * O guia de tela da Ely flutuante (13/11, o `draw` + `act_in_app` do Roamies): "onde fica…",
 * "como eu faço… aqui", "clica em…", "escreve … no campo", "fecha essa guia". Lê a janela da frente
 * (UI Automation), pede ao modelo QUAIS elementos marcar (anel, seta, número, rótulo) com uma frase
 * por passo, e — se ele pediu para fazer — QUAL ação. As marcas aparecem por cima da tela.
 *
 * Segurança (pedido do dono: "permissão só se for algo muito pá, tipo apagar um arquivo ou um app;
 * não confundir 'feche essa guia' com 'desinstale esse app'"):
 * - Atalhos fixos sem modelo para o que é comum e inequívoco (fechar/abrir guia, voltar, atualizar).
 * - Ação destrutiva (apagar, excluir, desinstalar, formatar, esvaziar a lixeira, descartar…) só
 *   acontece se ELE disse um verbo destrutivo, e mesmo assim com confirmação na tela.
 * - Tudo o mais (clicar num botão comum, escrever num campo) vai direto.
 */

export type TipoMarca = "anel" | "seta" | "num" | "rotulo" | "sublinhado" | "destaque";
export interface Marca { tipo: TipoMarca; i: number; texto?: string; n?: number }
export interface Passo { dizer: string; marcas: Marca[] }
export type Acao =
  | { tipo: "clicar"; i: number }
  | { tipo: "escrever"; i: number; texto: string }
  | { tipo: "teclas"; teclas: string; descricao: string };
export interface Guia { fala: string; passos: Passo[]; acao: Acao | null; destrutiva: boolean; recusa?: string }

const norm = (t: string) => semAcento(t).toLowerCase().replace(/\s+/g, " ").trim();

/** O pedido é sobre a tela que ele está vendo (e não uma pergunta geral)? Puro. */
export function pediuNaTela(texto: string): boolean {
  const t = norm(texto);
  return /\b(aqui|nessa tela|nesta tela|nessa janela|nesta janela|nesse site|neste site|nesse programa|neste programa|nessa pagina|nesta pagina|esse botao|este botao|essa guia|esta guia|essa aba|esta aba)\b/.test(t)
    || /\b(onde (fica|esta|eu clico|clico|tem|acho)|me mostra onde|mostra onde|aponta|como (eu )?(faco|uso|mudo|ativo|desativo|acho|configuro|coloco|tiro) (isso|aqui|nesse|nessa|neste|nesta|o|a)\b)/.test(t)
    || /\b(clica|clique|aperta|aperte|pressiona|seleciona|marca a opcao)\b/.test(t)
    || /\b(escreve|escreva|digita|digite|preenche|preencha)\b.{0,40}\b(campo|caixa|aqui|busca|pesquisa)\b/.test(t)
    || /\b(fecha|feche|fechar|abre|abra|abrir) (essa|esta|a|uma|nova) (guia|aba)\b/.test(t);
}

const DESTRUTIVO_NOME = /\b(excluir|exclui|apagar|apaga|deletar|delete|remover|remove|desinstalar|uninstall|formatar|format|lixeira|esvaziar|descartar|discard|redefinir|resetar|reset|limpar tudo|clear all|erase|wipe|encerrar conta|cancelar assinatura)\b/;
const DESTRUTIVO_PEDIDO = /\b(exclu|apag|delet|remov|desinstal|format|lixeira|esvazi|descart|redefin|reset|limp|cancel(a|ar) (a )?assinatura|encerr(a|ar) (a )?conta|pag(a|ar|ue)\b|compr(a|ar)\b|transfer|pix\b|sai(r)? da conta|public|revog)/;

/** O elemento/ação apaga ou desfaz algo de vez? Puro. */
export function acaoDestrutiva(acao: Acao | null, els: ElementoUia[]): boolean {
  if (!acao) return false;
  if (acao.tipo === "teclas") return /shift\s*\+\s*del|\bdelete\b|\bdel\b/i.test(acao.teclas);
  const e = els.find((x) => x.i === acao.i);
  return !!e && DESTRUTIVO_NOME.test(norm(`${e.n} ${e.a}`));
}

/** Ele mesmo pediu algo destrutivo (apagar, desinstalar…)? Puro. */
export function pedidoDestrutivo(texto: string): boolean { return DESTRUTIVO_PEDIDO.test(norm(texto)); }

/**
 * Atalhos inequívocos, sem modelo (instantâneos): fechar/abrir guia, voltar, avançar, atualizar.
 * "Fecha essa guia" NUNCA vira fechar o programa nem desinstalar nada. Puro.
 */
export function atalhoDeTela(texto: string): Acao | null {
  const t = norm(texto);
  if (/\b(fecha|feche|fechar)\b.{0,12}\b(guia|aba)\b/.test(t)) return { tipo: "teclas", teclas: "ctrl+w", descricao: "Fechando a guia…" };
  if (/\b(abre|abra|abrir|nova)\b.{0,12}\b(nova )?(guia|aba)\b/.test(t) && !/\bguia d[eao]\b|\baba d[eao]\b/.test(t)) return { tipo: "teclas", teclas: "ctrl+t", descricao: "Abrindo uma guia nova…" };
  if (/^(ely,? )?(volta|voltar|volte)( (a|pra|para a) pagina( anterior)?)?$/.test(t)) return { tipo: "teclas", teclas: "alt+left", descricao: "Voltando a página…" };
  if (/^(ely,? )?(avanca|avancar)( a pagina)?$/.test(t)) return { tipo: "teclas", teclas: "alt+right", descricao: "Avançando a página…" };
  if (/\b(atualiza|atualizar|recarrega|recarregar)\b.{0,12}\b(pagina|site|guia|aba)\b/.test(t)) return { tipo: "teclas", teclas: "f5", descricao: "Atualizando a página…" };
  return null;
}

/** A lista de elementos compacta que vai ao modelo (uma linha por elemento). Pura. */
export function elementosParaPrompt(l: LeituraUia, max = 220): string {
  // Rolado para fora da janela: não dá para marcar na tela.
  return l.elementos.filter((e) => !e.o).slice(0, max).map((e) => `${e.i}|${e.t}|${(e.n || "").replace(/[|\n\r]/g, " ").slice(0, 70)}${e.v ? `|valor:${e.v.replace(/[|\n\r]/g, " ").slice(0, 30)}` : ""}`).join("\n");
}

const SISTEMA = `Você guia a pessoa NA TELA DELA, como um tutor apontando com o dedo. Você recebe o programa aberto e a lista dos elementos visíveis ("número|tipo|nome"). Responda SÓ JSON:
{"fala": "uma frase curta dita em voz (o que fazer, sem repetir os passos)",
 "passos": [{"dizer": "até 12 palavras", "marcas": [{"tipo": "anel"|"seta"|"num"|"rotulo"|"sublinhado"|"destaque", "i": número do elemento, "texto": "rótulo curto (opcional)"}]}],
 "acao": null | {"tipo": "clicar", "i": n} | {"tipo": "escrever", "i": n, "texto": "..."} | {"tipo": "teclas", "teclas": "ctrl+w", "descricao": "Fechando a guia…"}}
Regras:
- "onde fica X" / "me mostra": 1 passo, "anel" no elemento + "rotulo" com o nome. "como faço X": um passo por clique, na ordem, cada um com "num" e "anel" no controle certo. Só use elementos da lista.
- "acao" SÓ quando ele pediu para FAZER ("clica", "aperta", "escreve", "abre", "fecha", "marca"). Pergunta ("onde", "como") = acao null.
- NUNCA confunda pedidos: "fecha essa guia/aba" = teclas ctrl+w (NUNCA fechar o programa nem desinstalar). "fecha o programa/janela" = teclas alt+f4. Desinstalar, apagar, excluir só se ele disse exatamente isso.
- Não ache que um botão faz algo que o nome não diz. Sem elemento certo na lista: diga onde costuma ficar e não marque nada.
- Se o programa aberto não é o que o pedido supõe (ex.: perguntou do Explorador de Arquivos e a janela é o navegador), diga isso em uma frase e não marque nada.
- Português do Brasil, curto e direto.`;

/** O que o modelo devolveu, conferido contra a leitura (números que existem, ação permitida). Pura. */
export function validarGuia(bruto: unknown, l: LeituraUia, pedido: string): Guia {
  const j = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const existe = new Set(l.elementos.map((e) => e.i));
  const TIPOS: TipoMarca[] = ["anel", "seta", "num", "rotulo", "sublinhado", "destaque"];
  const passos: Passo[] = (Array.isArray(j.passos) ? j.passos : []).slice(0, 8).map((p, k) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const marcas = (Array.isArray(o.marcas) ? o.marcas : []).slice(0, 4).map((m) => (m ?? {}) as Record<string, unknown>)
      .filter((m) => TIPOS.includes(m.tipo as TipoMarca) && existe.has(Number(m.i)))
      .map((m) => ({ tipo: m.tipo as TipoMarca, i: Number(m.i), ...(typeof m.texto === "string" && m.texto.trim() ? { texto: m.texto.trim().slice(0, 40) } : {}), ...(m.tipo === "num" ? { n: k + 1 } : {}) }));
    return { dizer: typeof o.dizer === "string" ? o.dizer.trim().slice(0, 120) : "", marcas };
  }).filter((p) => p.dizer || p.marcas.length);
  let acao: Acao | null = null;
  const a = (j.acao ?? null) as Record<string, unknown> | null;
  if (a && typeof a === "object") {
    if (a.tipo === "clicar" && existe.has(Number(a.i))) acao = { tipo: "clicar", i: Number(a.i) };
    else if (a.tipo === "escrever" && existe.has(Number(a.i)) && typeof a.texto === "string" && a.texto) acao = { tipo: "escrever", i: Number(a.i), texto: a.texto.slice(0, 2000) };
    else if (a.tipo === "teclas" && typeof a.teclas === "string" && /^[a-z0-9+\s]{1,30}$/i.test(a.teclas)) acao = { tipo: "teclas", teclas: a.teclas.toLowerCase().replace(/\s+/g, ""), descricao: typeof a.descricao === "string" ? a.descricao.slice(0, 50) : "Fazendo isso…" };
  }
  const destrutiva = acaoDestrutiva(acao, l.elementos);
  // Destrutivo sem ele ter pedido isso com todas as letras: não faz (só mostra).
  if (destrutiva && !pedidoDestrutivo(pedido)) {
    return { fala: "Isso apagaria ou desfaria algo, e você não pediu isso. Só te mostrei onde fica.", passos, acao: null, destrutiva: false, recusa: "destrutiva sem pedido" };
  }
  const fala = typeof j.fala === "string" && j.fala.trim() ? j.fala.trim().slice(0, 300) : passos[0]?.dizer || "Pronto.";
  return { fala, passos, acao, destrutiva };
}

/** Pede ao modelo (Groq, ~0,5–1 s). null = sem chave ou sem resposta. */
export async function pedirGuia(pedido: string, l: LeituraUia, sinal?: AbortSignal): Promise<Guia | null> {
  const chave = getApiKey();
  if (!chave) return null;
  const usuario = `Programa: ${l.processo} — "${l.titulo}"\nElementos:\n${elementosParaPrompt(l)}\n\nPedido: ${pedido.slice(0, 600)}`;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "qwen/qwen3.8-27b", messages: [{ role: "system", content: SISTEMA }, { role: "user", content: usuario }], response_format: { type: "json_object" }, reasoning_effort: "none", temperature: 0.2, max_tokens: 900 }),
      signal: AbortSignal.any([AbortSignal.timeout(9000), ...(sinal ? [sinal] : [])]),
    });
    if (!r.ok) { console.warn(`[guia] Groq respondeu ${r.status}`); return null; }
    const j = await r.json() as { choices?: { message?: { content?: string } }[] };
    return validarGuia(JSON.parse(j.choices?.[0]?.message?.content ?? "{}"), l, pedido);
  } catch (e) {
    console.warn("[guia] falhou:", e instanceof Error ? e.message : e);
    return null;
  }
}

const VK: Record<string, number> = {
  ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5b, enter: 0x0d, tab: 0x09, esc: 0x1b, escape: 0x1b,
  space: 0x20, espaco: 0x20, backspace: 0x08, delete: 0x2e, del: 0x2e, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
  left: 0x25, up: 0x26, right: 0x27, down: 0x28,
};
/** "ctrl+shift+t" → teclas virtuais na ordem de apertar. null = alguma tecla desconhecida. Pura. */
export function vksDe(teclas: string): number[] | null {
  const out: number[] = [];
  for (const k of teclas.toLowerCase().split("+").map((x) => x.trim()).filter(Boolean)) {
    if (VK[k] !== undefined) out.push(VK[k]);
    else if (/^f([1-9]|1[0-2])$/.test(k)) out.push(0x70 + Number(k.slice(1)) - 1);
    else if (/^[a-z]$/.test(k)) out.push(k.toUpperCase().charCodeAt(0));
    else if (/^[0-9]$/.test(k)) out.push(k.charCodeAt(0));
    else return null;
  }
  return out.length ? out : null;
}
