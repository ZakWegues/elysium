/**
 * Retomada de resposta (21/10). O Zak usa o ELYSIUM principalmente pelo celular, e a conexão
 * caía no meio: troca de Wi-Fi, app minimizado, o Android derrubando o socket. A resposta que
 * estava vindo morria junto — o PC descartava e o celular mostrava "a conexão parou no meio".
 *
 * Agora o pedido do celular chega com um `id`. O PC guarda o que já respondeu daquele id por
 * 10 min; quem reconectar pede `{type:"retomar", id}` e recebe o texto até ali e o resto conforme
 * sai. O socket caindo NÃO descarta mais o turno — só o "Parar" do celular (`{type:"parar"}`).
 */

export type Envio = (texto: string) => void;

export interface Pedido {
  id: string;
  texto: string;
  /** O que já foi respondido (os pedaços concatenados). */
  parcial: string;
  /** O frame final (`reply` ou `error`) quando terminou. */
  final: Record<string, unknown> | null;
  criadoEm: number;
  /** Quem recebe os próximos pedaços; null quando ninguém está conectado. */
  destino: Envio | null;
  parado: boolean;
}

export const VALIDADE_MS = 10 * 60_000;
const MAXIMO = 50;

const pedidos = new Map<string, Pedido>();

/** Id que o celular manda: curto, só letras, números e hífen. Pura. */
export function idValido(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(id);
}

function limpar(agora = Date.now()): void {
  for (const [id, p] of pedidos) if (agora - p.criadoEm > VALIDADE_MS) pedidos.delete(id);
  while (pedidos.size > MAXIMO) pedidos.delete(pedidos.keys().next().value as string);
}

/** Abre o registro do pedido. Devolve null se o id já existe (o mesmo pedido chegou duas vezes). */
export function abrirPedido(id: string, texto: string, destino: Envio, agora = Date.now()): Pedido | null {
  limpar(agora);
  if (pedidos.has(id)) return null;
  const p: Pedido = { id, texto, parcial: "", final: null, criadoEm: agora, destino, parado: false };
  pedidos.set(id, p);
  return p;
}

/** Um pedaço da resposta: guarda e repassa a quem estiver conectado. */
export function pedaco(p: Pedido, texto: string): void {
  p.parcial += texto;
  if (p.destino && !p.parado) {
    try { p.destino(JSON.stringify({ type: "chunk", text: texto, id: p.id })); } catch { p.destino = null; }
  }
}

/** Terminou: guarda o frame final e entrega se houver alguém. */
export function terminar(p: Pedido, final: Record<string, unknown>): void {
  p.final = { ...final, id: p.id };
  if (p.destino && !p.parado) {
    try { p.destino(JSON.stringify(p.final)); } catch { p.destino = null; }
  }
}

/** A conexão de quem pediu caiu: o pedido continua, só fica sem destino até alguém retomar. */
export function soltarDestino(destino: Envio): void {
  for (const p of pedidos.values()) if (p.destino === destino) p.destino = null;
}

/**
 * Alguém (re)conectou e quer o pedido de volta. Manda o que já veio e, se terminou, o final;
 * se não, passa a receber os próximos pedaços. false = id desconhecido ou vencido.
 */
export function retomar(id: string, destino: Envio, agora = Date.now()): boolean {
  limpar(agora);
  const p = pedidos.get(id);
  if (!p || p.parado) return false;
  destino(JSON.stringify({ type: "retomada", id, text: p.parcial }));
  if (p.final) destino(JSON.stringify(p.final));
  else p.destino = destino;
  return true;
}

/** O "Parar" do celular: ninguém quer mais esta resposta. Devolve o pedido (para desfazer o turno). */
export function parar(id: string): Pedido | null {
  const p = pedidos.get(id);
  if (!p) return null;
  p.parado = true;
  p.destino = null;
  return p;
}

/** Só para os testes. */
export function zerarPedidos(): void {
  pedidos.clear();
}
