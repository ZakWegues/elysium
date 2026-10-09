import Store from "electron-store";
import crypto from "node:crypto";
import { diaLocal } from "./hora";
import { radicais, semAcento } from "./texto";

/**
 * Cartões de revisão com repetição espaçada (fase 20, bloco 209).
 *
 * O sistema de Leitner: cinco caixas, cada uma com um intervalo maior (1, 3, 7, 14 e 30
 * dias). Acertou, o cartão sobe de caixa e volta mais tarde; errou, volta para a caixa 1 e
 * aparece amanhã. É o que o Anki faz, sem a configuração — o que importa é rever no dia
 * certo, e a Ely lembra por ele.
 *
 * De onde vêm os cartões:
 *  - do quiz (modo estudo): cada pergunta que ele errou vira cartão sozinha — o modelo põe
 *    uma marca `[[REVISAR: pergunta || resposta]]` no fim da mensagem, que sai antes de
 *    chegar à tela (`extrairRevisoes`, `filtroDeMarcas`);
 *  - à mão: "guarda pra revisar: mitocôndria é a organela que produz energia".
 *
 * A revisão por voz ("Ely, revisão") é uma conversa curta: ela lê a frente, ele responde, ela
 * julga sem modelo (`julgar`) e segue. "Acertei" logo depois de um "não" corrige o julgamento —
 * comparar resposta falada com texto escrito erra, e ele é o juiz final.
 */

export interface Cartao {
  id: string;
  frente: string;
  verso: string;
  /** 1 a 5. */
  caixa: number;
  /** Dia local (YYYY-MM-DD) em que volta. */
  proxima: string;
  origem: "quiz" | "manual";
  criadoEm: number;
  acertos: number;
  erros: number;
}

export const INTERVALOS = [1, 3, 7, 14, 30];
export const MAX_CARTOES = 2000;
const MAX_TEXTO = 300;

const store = new Store<{ cartoes: Cartao[] }>({ name: "cartoes", defaults: { cartoes: [] } });

function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return diaLocal(new Date(a, m - 1, d + n));
}

function chave(t: string): string {
  return semAcento(t).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function listarCartoes(): Cartao[] {
  return store.get("cartoes");
}

/** Cria (ou devolve o que já existe com a mesma frente). `null` se faltar frente ou verso. */
export function criarCartao(frente: string, verso: string, origem: Cartao["origem"] = "manual", hoje = new Date()): Cartao | null {
  const f = String(frente ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXTO);
  const v = String(verso ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXTO);
  if (f.length < 2 || !v) return null;
  const todos = listarCartoes();
  const igual = todos.find(c => chave(c.frente) === chave(f));
  if (igual) {
    // A mesma pergunta errada de novo: volta para a caixa 1, com o verso mais novo.
    const novo = { ...igual, verso: v, caixa: 1, proxima: somarDias(diaLocal(hoje), 1) };
    store.set("cartoes", todos.map(c => (c.id === igual.id ? novo : c)));
    return novo;
  }
  const c: Cartao = { id: crypto.randomBytes(6).toString("hex"), frente: f, verso: v, caixa: 1, proxima: somarDias(diaLocal(hoje), 1), origem, criadoEm: hoje.getTime(), acertos: 0, erros: 0 };
  // Teto: sai o mais antigo dos que já estão na última caixa (os que ele já sabe).
  let lista = [...todos, c];
  if (lista.length > MAX_CARTOES) {
    const i = lista.findIndex(x => x.caixa === 5);
    lista.splice(i >= 0 ? i : 0, 1);
  }
  store.set("cartoes", lista);
  return c;
}

export function apagarCartao(id: string): boolean {
  const todos = listarCartoes();
  if (!todos.some(c => c.id === id)) return false;
  store.set("cartoes", todos.filter(c => c.id !== id));
  return true;
}

/** Os que vencem hoje (ou venceram), dos mais atrasados para os mais novos. */
export function cartoesVencidos(hoje = new Date()): Cartao[] {
  const d = diaLocal(hoje);
  return listarCartoes().filter(c => c.proxima <= d).sort((a, b) => a.proxima.localeCompare(b.proxima) || a.caixa - b.caixa);
}

/** A regra de Leitner. Pura. */
export function proximoEstado(c: Pick<Cartao, "caixa">, acertou: boolean, hoje = new Date()): { caixa: number; proxima: string } {
  const caixa = acertou ? Math.min(5, c.caixa + 1) : 1;
  return { caixa, proxima: somarDias(diaLocal(hoje), acertou ? INTERVALOS[caixa - 1] : 1) };
}

export function responderCartao(id: string, acertou: boolean, hoje = new Date()): Cartao | null {
  const todos = listarCartoes();
  const c = todos.find(x => x.id === id);
  if (!c) return null;
  const novo: Cartao = { ...c, ...proximoEstado(c, acertou, hoje), acertos: c.acertos + (acertou ? 1 : 0), erros: c.erros + (acertou ? 0 : 1) };
  store.set("cartoes", todos.map(x => (x.id === id ? novo : x)));
  return novo;
}

/** Desfaz um julgamento (o "acertei" depois de um "não"): põe o cartão de volta como estava. */
function restaurar(c: Cartao): void {
  store.set("cartoes", listarCartoes().map(x => (x.id === c.id ? c : x)));
}

/** Backup: soma, a mesma frente não duplica. */
export function importarCartoes(lista: unknown): number {
  if (!Array.isArray(lista)) return 0;
  const existentes = new Set(listarCartoes().map(c => chave(c.frente)));
  const novos: Cartao[] = [];
  for (const x of lista) {
    const c = x as Partial<Cartao>;
    if (typeof c?.frente !== "string" || typeof c?.verso !== "string" || existentes.has(chave(c.frente))) continue;
    existentes.add(chave(c.frente));
    novos.push({
      id: crypto.randomBytes(6).toString("hex"), frente: c.frente.slice(0, MAX_TEXTO), verso: c.verso.slice(0, MAX_TEXTO),
      caixa: Math.min(5, Math.max(1, Math.round(Number(c.caixa) || 1))),
      proxima: typeof c.proxima === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.proxima) ? c.proxima : diaLocal(),
      origem: c.origem === "quiz" ? "quiz" : "manual", criadoEm: Number(c.criadoEm) || Date.now(),
      acertos: Number(c.acertos) || 0, erros: Number(c.erros) || 0,
    });
  }
  store.set("cartoes", [...listarCartoes(), ...novos].slice(-MAX_CARTOES));
  return novos.length;
}

// ── a marca do quiz ─────────────────────────────────────────────────────────────────

const MARCA = /\[\[\s*REVISAR\s*:\s*([^\]|]+?)\s*\|\|\s*([^\]]+?)\s*\]\]/gi;

/** Tira as marcas do texto e devolve os cartões delas. Pura. */
export function extrairRevisoes(texto: string): { limpo: string; cartoes: { frente: string; verso: string }[] } {
  const cartoes: { frente: string; verso: string }[] = [];
  let limpo = texto.replace(MARCA, (_m, f: string, v: string) => { cartoes.push({ frente: f.trim(), verso: v.trim() }); return ""; });
  // Marca cortada pelo limite de tokens: some também, sem virar cartão.
  const solta = limpo.lastIndexOf("[[");
  if (solta >= 0 && !limpo.slice(solta).includes("]]")) limpo = limpo.slice(0, solta);
  return { limpo: limpo.replace(/[ \t]+\n/g, "\n").trim(), cartoes };
}

/**
 * Para o streaming: devolve uma função que recebe cada pedaço e só repassa o que não é
 * marca. Segura o "[" do fim até saber se vira "[[". Pura (estado dentro do fechamento).
 */
export function filtroDeMarcas(repassar: (pedaco: string) => void): (pedaco: string) => void {
  let tudo = "";
  let enviado = 0;
  return (pedaco: string) => {
    tudo += pedaco;
    let visivel = tudo;
    const i = visivel.indexOf("[[");
    if (i >= 0) visivel = visivel.slice(0, i);
    else if (visivel.endsWith("[")) visivel = visivel.slice(0, -1);
    if (visivel.length > enviado) { repassar(visivel.slice(enviado)); enviado = visivel.length; }
  };
}

/** Guarda os cartões do quiz que vieram na resposta e devolve o texto limpo. */
export function guardarRevisoesDoTexto(texto: string): string {
  const { limpo, cartoes } = extrairRevisoes(texto);
  for (const c of cartoes) { try { criarCartao(c.frente, c.verso, "quiz"); } catch (e) { console.warn("[cartoes] não guardei:", e); } }
  return limpo;
}

// ── "guarda pra revisar: X é Y" ─────────────────────────────────────────────────────

const GUARDAR = /^\s*(?:ely[,!]?\s+)?(?:guarda|guardar|salva|salvar|anota|anotar|cria|criar|faz|faça|faca)\s+(?:isso\s+|um\s+cart[aã]o\s+|esse\s+cart[aã]o\s+)?(?:(?:pra|para)\s+(?:eu\s+)?revis(?:ar|[aã]o)|de\s+revis[aã]o|na\s+revis[aã]o)\s*[:,–—-]?\s*(.{3,})$/i;

/** O cartão de um pedido falado; `semFormato` quando é pedido de cartão sem "X é Y". Pura. */
export function pedidoDeCartao(texto: string): { frente: string; verso: string } | { semFormato: true } | null {
  const m = GUARDAR.exec(texto);
  if (!m) return null;
  const corpo = m[1].trim().replace(/[.!]$/, "");
  // O primeiro separador que aparecer divide: "=" e travessão antes de ":" e de " é ".
  for (const sep of [/\s*=\s*/, /\s+[–—-]\s+/, /\s*:\s+/, /\s+(?:é|significa|quer dizer)\s+/i]) {
    const m = sep.exec(corpo);
    if (!m) continue;
    const frente = corpo.slice(0, m.index).trim();
    const verso = corpo.slice(m.index + m[0].length).trim();
    if (frente.length >= 2 && verso) return { frente, verso };
  }
  return { semFormato: true };
}

// ── a revisão por voz ───────────────────────────────────────────────────────────────

const PARAR = /^(?:ely )?(?:para|parar|pare|chega|encerra|encerrar|sai|sair|termina|terminar|acabou|fim)(?: (?:a|da|de) revisao)?$/;
const NAO_SEI = /^(?:ely )?(?:nao sei|sei la|passa|pula|proxim[ao]|nao lembro|esqueci|nao faco ideia)$/;
const ACERTEI = /^(?:ely )?(?:(?:mas )?(?:eu )?acertei|(?:mas )?(?:ta|esta|estava) cert[ao]|considera cert[ao]|conta como cert[ao]|foi isso que eu disse)$/;
const STOP = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "um", "uma", "que", "em", "no", "na", "por", "para", "pra", "com", "se", "eh"]);

/**
 * A resposta falada bate com o verso? Sem modelo: os números do verso têm de estar lá e
 * pelo menos metade das palavras de conteúdo (pelo radical — "fotossíntese" e
 * "fotossintético" contam igual). Pura.
 */
export function julgar(resposta: string, verso: string): boolean {
  const r = chave(resposta);
  const v = chave(verso);
  if (!r) return false;
  if (r === v || (v.length >= 3 && r.includes(v))) return true;
  const numerosV = v.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (numerosV.some(n => !r.includes(n))) return false;
  const palavrasV = new Set([...radicais(v.split(" ").filter(p => !STOP.has(p)).join(" "))]);
  // Palavras curtas importam ("Sol", "H2O"): radical de 3 quando a palavra tem 3.
  for (const p of v.split(" ")) if (p.length === 3 && !STOP.has(p)) palavrasV.add(p);
  if (!palavrasV.size) return numerosV.length > 0;
  const rr = new Set([...radicais(r), ...r.split(" ").filter(p => p.length === 3)]);
  let bate = 0;
  for (const p of palavrasV) if (rr.has(p)) bate++;
  return bate / palavrasV.size >= 0.5;
}

interface Sessao { fila: string[]; atual: string | null; certos: number; feitos: number; ultimo: { antes: Cartao; acertou: boolean } | null; expiraEm: number }
const VALIDADE_MS = 5 * 60_000;
let sessao: Sessao | null = null;

function frase(c: Cartao, i: number, total: number): string {
  return `Cartão ${i} de ${total}: ${c.frente}`;
}

function proximaPergunta(s: Sessao): string {
  const id = s.fila.shift() ?? null;
  s.atual = id;
  const c = id ? listarCartoes().find(x => x.id === id) : undefined;
  if (!c) return fimDaRevisao();
  return frase(c, s.feitos + 1, s.feitos + 1 + s.fila.length);
}

function fimDaRevisao(): string {
  const s = sessao;
  sessao = null;
  if (!s || !s.feitos) return "Revisão encerrada.";
  const amanha = cartoesVencidos(new Date(Date.now() + 86_400_000)).length;
  return `Fim da revisão: ${s.certos} de ${s.feitos} certos.${amanha ? ` Amanhã ${amanha === 1 ? "volta" : "voltam"} ${amanha} ${amanha === 1 ? "cartão" : "cartões"}.` : ""}`;
}

/** "Ely, revisão": começa com os vencidos de hoje (até 20). */
export function comecarRevisao(agora = Date.now()): string {
  const venc = cartoesVencidos(new Date(agora));
  if (!venc.length) {
    const total = listarCartoes().length;
    return total ? "Nada para revisar hoje. Os cartões voltam no dia certo." : "Você ainda não tem cartões. Erre uma pergunta no modo estudo, ou diga \"guarda pra revisar: pergunta é resposta\".";
  }
  sessao = { fila: venc.slice(0, 20).map(c => c.id), atual: null, certos: 0, feitos: 0, ultimo: null, expiraEm: agora + VALIDADE_MS };
  const n = Math.min(20, venc.length);
  return `${n} ${n === 1 ? "cartão" : "cartões"} para hoje. Responda em voz alta; "para" encerra. ${proximaPergunta(sessao)}`;
}

export function haRevisaoAtiva(agora = Date.now()): boolean {
  if (sessao && sessao.expiraEm <= agora) sessao = null;
  return !!sessao;
}

/**
 * O pedido é a resposta de um cartão? Devolve a fala, ou `null` quando não há revisão (ou
 * ela venceu, ou `ehOutroPedido` diz que é um comando — aí a revisão acaba em silêncio e o
 * pedido segue o caminho normal, como na confirmação).
 */
export function responderRevisao(texto: string, ehOutroPedido: (t: string) => boolean = () => false, agora = Date.now()): string | null {
  if (!haRevisaoAtiva(agora) || !sessao) return null;
  const s = sessao;
  const t = chave(texto);
  if (PARAR.test(t)) return fimDaRevisao();
  if (ACERTEI.test(t) && s.ultimo && !s.ultimo.acertou) {
    restaurar(s.ultimo.antes);
    responderCartao(s.ultimo.antes.id, true);
    s.ultimo = { ...s.ultimo, acertou: true };
    s.certos++;
    s.expiraEm = agora + VALIDADE_MS;
    const c = s.atual ? listarCartoes().find(x => x.id === s.atual) : undefined;
    return `Valeu, contei como certo. ${c ? `Seguindo: ${c.frente}` : fimDaRevisao()}`;
  }
  if (ehOutroPedido(texto)) { sessao = null; return null; }
  const atual = s.atual ? listarCartoes().find(x => x.id === s.atual) : undefined;
  if (!atual) return fimDaRevisao();
  const acertou = !NAO_SEI.test(t) && julgar(texto, atual.verso);
  s.ultimo = { antes: atual, acertou };
  responderCartao(atual.id, acertou);
  s.feitos++;
  if (acertou) s.certos++;
  s.expiraEm = agora + VALIDADE_MS;
  const veredito = acertou ? `Certo: ${atual.verso}.` : `${NAO_SEI.test(t) ? "Sem problema" : "Não era isso"}: a resposta é ${atual.verso}. Se você disse isso, diga "acertei".`;
  return `${veredito} ${proximaPergunta(s)}`;
}

export function encerrarRevisao(): void { sessao = null; }
