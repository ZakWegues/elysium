import * as crypto from "node:crypto";

/**
 * Pedido assinado em vez de token no cabeçalho (31/10, varredura da noite).
 *
 * O servidor da porta 4200 fala HTTP puro na rede de casa. Com `Authorization: Bearer <token>`
 * qualquer um na mesma rede que capturasse um pacote (Wi-Fi aberto, ARP spoofing) levava o
 * token e passava a mandar no PC. Agora o celular manda uma ASSINATURA do pedido feita com o
 * token, sem o token:
 *
 *   X-Elysium-Assinatura: v1:<segundos>:<nonce>:<hmac>
 *   hmac = HMAC-SHA256(token, "<MÉTODO>\n<caminho com query>\n<segundos>\n<nonce>") em hex
 *
 * Quem captura o pacote não tem como assinar outro pedido, e repetir o mesmo não passa: a hora
 * tem que estar a menos de 5 min da do PC e o nonce não pode ter sido visto antes.
 *
 * Limite conhecido: o corpo não entra na conta (as rotas leem o corpo depois da autenticação).
 * Alguém que intercepte E altere o tráfego no meio do caminho ainda poderia trocar o corpo de
 * um pedido — mas não roubar o token nem fazer pedidos novos. Só criptografia (Tailscale) fecha
 * isso por completo.
 */

/** Diferença de relógio aceita entre o celular e o PC. */
export const JANELA_S = 300;

export type ResultadoAssinatura = { ok: true } | { ok: false; motivo: string };

/** O texto assinado. Exportado para os testes e para o celular fazer a mesma conta. */
export function textoAssinado(metodo: string, caminho: string, segundos: number, nonce: string): string {
  return `${metodo.toUpperCase()}\n${caminho}\n${segundos}\n${nonce}`;
}

export function assinar(token: string, metodo: string, caminho: string, segundos: number, nonce: string): string {
  return crypto.createHmac("sha256", token).update(textoAssinado(metodo, caminho, segundos, nonce)).digest("hex");
}

/** Nonces vistos recentemente, com teto: o mais antigo sai quando enche. */
export class NoncesVistos {
  private vistos = new Map<string, number>();
  constructor(private teto = 5000) {}
  /** true se o nonce é novo (e passa a ser lembrado); false se já foi usado. */
  registrar(nonce: string, agoraS: number): boolean {
    for (const [n, t] of this.vistos) {
      if (agoraS - t <= JANELA_S * 2) break;
      this.vistos.delete(n);
    }
    if (this.vistos.has(nonce)) return false;
    this.vistos.set(nonce, agoraS);
    while (this.vistos.size > this.teto) this.vistos.delete(this.vistos.keys().next().value as string);
    return true;
  }
}

/** Confere o cabeçalho. Pura, a não ser pelo registro do nonce. */
export function verificarAssinatura(
  cabecalho: string | undefined,
  metodo: string,
  caminho: string,
  token: string,
  agoraS: number,
  vistos: NoncesVistos,
): ResultadoAssinatura {
  if (!cabecalho || !token) return { ok: false, motivo: "sem assinatura" };
  const m = /^v1:(\d{9,11}):([A-Za-z0-9_-]{8,64}):([0-9a-f]{64})$/.exec(cabecalho.trim());
  if (!m) return { ok: false, motivo: "formato" };
  const segundos = Number(m[1]);
  if (Math.abs(agoraS - segundos) > JANELA_S) return { ok: false, motivo: "relógio" };
  const esperado = Buffer.from(assinar(token, metodo, caminho, segundos, m[2]), "hex");
  const recebido = Buffer.from(m[3], "hex");
  if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) return { ok: false, motivo: "assinatura" };
  if (!vistos.registrar(m[2], agoraS)) return { ok: false, motivo: "repetido" };
  return { ok: true };
}
