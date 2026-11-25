import Store from "electron-store";
import * as crypto from "node:crypto";

/**
 * Um token por aparelho (25/11, com a ponte). Antes todos os celulares usavam o mesmo: tirar um era
 * regenerar o token e parear todos de novo. Agora cada um tem o seu, derivado do token do PC com o id
 * do aparelho — nada novo viaja pela rede, e revogar é só tirar o id da lista.
 *
 * O celular já pareado adota o dele sozinho (`aparelho.adotar`); o QR já sai com um. Sete dias depois
 * da primeira adoção, o token do PC deixa de valer para quem vem de fora.
 */

export interface AparelhoPareado { id: string; nome: string; criadoEm: number; vistoEm: number }
export interface TokenVivo { id: string; token: string }

interface Guardado { lista: AparelhoPareado[]; pendente: string; mestreAte: number }
const store = new Store<Guardado>({ name: "aparelhos-tokens", defaults: { lista: [], pendente: "", mestreAte: 0 } });
// Em memória: a lista é consultada a cada pedido, e o electron-store relê o disco a cada `get`.
const g: Guardado = { lista: store.get("lista"), pendente: store.get("pendente"), mestreAte: store.get("mestreAte") };
function guardar<K extends keyof Guardado>(chave: K, valor: Guardado[K]): void {
  g[chave] = valor;
  store.set(chave, valor);
}

export const MESTRE = "mestre";
const MESTRE_AINDA_MS = 7 * 86_400_000;
const MAX = 10;

export function tokenDoAparelho(mestre: string, id: string): string {
  return crypto.createHmac("sha256", mestre).update(`aparelho:${id}`).digest("hex");
}

let aoMudar: () => void = () => {};
export function avisarQuandoMudar(f: () => void): void { aoMudar = f; }

const novoId = (): string => crypto.randomBytes(8).toString("hex");
const nomeLimpo = (n: string): string => n.replace(/[\x00-\x1f<>&"]/g, "").trim().slice(0, 40) || "Celular";

export function listarPareados(): AparelhoPareado[] { return g.lista; }

/** O token do PC ainda vale para quem vem de fora? Só até a semana da adoção acabar. */
export function mestreVale(agora = Date.now()): boolean {
  const ate = g.mestreAte;
  return !ate || agora < ate;
}

/** Todos os tokens que valem agora para quem vem de fora. */
export function tokensVivos(mestre: string): TokenVivo[] {
  if (!mestre) return [];
  const ids = [...g.lista.map((a) => a.id), g.pendente].filter(Boolean);
  return [...ids.map((id) => ({ id, token: tokenDoAparelho(mestre, id) })), ...(mestreVale() ? [{ id: MESTRE, token: mestre }] : [])];
}

/** O id que vai no próximo QR: fica reservado até alguém usá-lo. */
export function idDoQr(): string {
  let id = g.pendente;
  if (!id) { id = novoId(); guardar("pendente", id); aoMudar(); }
  return id;
}

function entrou(id: string, nome: string, agora: number): void {
  guardar("lista", [...g.lista, { id, nome, criadoEm: agora, vistoEm: agora }].slice(-MAX));
  if (!g.mestreAte) guardar("mestreAte", agora + MESTRE_AINDA_MS);
}

/** Um pedido assinado por este aparelho chegou. */
const ultimaNota = new Map<string, number>();
export function vistoAgora(id: string): void {
  if (id === MESTRE) return;
  const agora = Date.now();
  if (g.pendente === id) {
    entrou(id, "Celular", agora);
    guardar("pendente", "");
    aoMudar();
    return;
  }
  // No disco, no máximo a cada 10 min.
  if (agora - (ultimaNota.get(id) ?? 0) < 600_000) return;
  ultimaNota.set(id, agora);
  guardar("lista", g.lista.map((a) => (a.id === id ? { ...a, vistoEm: agora } : a)));
}

/** O celular pede o token dele. Quem já tem um só atualiza o nome. */
export function adotar(quem: string, nome: string): { id: string; proprio: boolean } {
  const agora = Date.now();
  const n = nomeLimpo(nome);
  if (quem !== MESTRE) {
    guardar("lista", g.lista.map((a) => (a.id === quem ? { ...a, nome: n } : a)));
    return { id: quem, proprio: true };
  }
  const id = novoId();
  entrou(id, n, agora);
  aoMudar();
  return { id, proprio: false };
}

export function revogar(id: string): void {
  guardar("lista", g.lista.filter((a) => a.id !== id));
  // Quem é revogado pode ter guardado o token antigo do PC: ele deixa de valer já.
  guardar("mestreAte", 1);
  aoMudar();
}

/** Token do PC regenerado: todos os derivados morreram junto. */
export function esquecerPareados(): void {
  guardar("lista", []);
  guardar("pendente", "");
  guardar("mestreAte", 0);
  aoMudar();
}
