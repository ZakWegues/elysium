import * as crypto from "node:crypto";

/**
 * A cifra da ponte (25/11), de ponta a ponta entre o celular e o PC. O Cloudflare só vê o que sai
 * daqui. O mesmo cálculo está no celular (`modules/ponte`, Cifra.kt) — mudar um é mudar o outro.
 *
 * Cada conexão troca chaves novas (ECDH P-256 efêmero), e a troca é provada com uma chave derivada do
 * token do aparelho, que nunca viaja. Quem está no meio não consegue se passar por nenhum dos dois, e
 * quem descobrir o token depois não abre o que já passou.
 *
 *   celular → PC  0x01 | pubC(65) | nonceC(16) | HMAC(psk, "ponte1-c" pubC nonceC)
 *   PC → celular  0x02 | pubS(65) | nonceS(16) | HMAC(psk, "ponte1-s" pubC nonceC pubS nonceS)
 *   depois        0x03 | AES-256-GCM, com contador próprio em cada sentido
 */

export const TAM_OLA = 114;

const hmac = (chave: Buffer | string, ...partes: (Buffer | string)[]): Buffer => {
  const h = crypto.createHmac("sha256", chave);
  for (const p of partes) h.update(p);
  return h.digest();
};

/** O que sai do token do aparelho: a chave da prova e a credencial de entrada na ponte. */
export function segredosDoToken(token: string): { psk: Buffer; credencial: string; hash: string } {
  const credencial = hmac(token, "ponte-cel").toString("hex");
  return { psk: hmac(token, "ponte-psk"), credencial, hash: crypto.createHash("sha256").update(credencial).digest("hex") };
}

const nonceDe = (n: bigint): Buffer => {
  const b = Buffer.alloc(12);
  b.writeBigUInt64BE(n, 4);
  return b;
};

/** Um sentido da conversa: o contador impede repetir, pular ou reordenar. */
export class Sentido {
  private n = 0n;
  constructor(private readonly chave: Buffer) {}
  fechar(claro: Buffer): Buffer {
    const c = crypto.createCipheriv("aes-256-gcm", this.chave, nonceDe(this.n++));
    return Buffer.concat([Buffer.from([3]), c.update(claro), c.final(), c.getAuthTag()]);
  }
  /** Lança se o pacote foi mexido. */
  abrir(pacote: Buffer): Buffer {
    if (pacote.length < 17 || pacote[0] !== 3) throw new Error("pacote inválido");
    const d = crypto.createDecipheriv("aes-256-gcm", this.chave, nonceDe(this.n++));
    d.setAuthTag(pacote.subarray(pacote.length - 16));
    return Buffer.concat([d.update(pacote.subarray(1, pacote.length - 16)), d.final()]);
  }
}

export interface Chaves { envia: Sentido; recebe: Sentido }

function derivar(segredo: Buffer, psk: Buffer, nonceC: Buffer, nonceS: Buffer): { c2s: Buffer; s2c: Buffer } {
  const prk = hmac(Buffer.concat([nonceC, nonceS]), segredo, psk);
  return { c2s: hmac(prk, "c2s", Buffer.from([1])), s2c: hmac(prk, "s2c", Buffer.from([1])) };
}

/** O PC responde ao olá do celular. null = a prova não bate. */
export function responderOla(psk: Buffer, ola: Buffer): { resposta: Buffer; chaves: Chaves } | null {
  if (ola.length !== TAM_OLA || ola[0] !== 1) return null;
  const pubC = ola.subarray(1, 66), nonceC = ola.subarray(66, 82), mac = ola.subarray(82);
  if (!crypto.timingSafeEqual(mac, hmac(psk, "ponte1-c", pubC, nonceC))) return null;
  const ec = crypto.createECDH("prime256v1");
  const pubS = ec.generateKeys();
  let segredo: Buffer;
  try { segredo = ec.computeSecret(pubC); } catch { return null; } // ponto fora da curva
  const nonceS = crypto.randomBytes(16);
  const k = derivar(segredo, psk, nonceC, nonceS);
  const resposta = Buffer.concat([Buffer.from([2]), pubS, nonceS, hmac(psk, "ponte1-s", pubC, nonceC, pubS, nonceS)]);
  return { resposta, chaves: { envia: new Sentido(k.s2c), recebe: new Sentido(k.c2s) } };
}

/** O lado do celular — aqui só para os testes e o ensaio da ponte. */
export function comecarOla(psk: Buffer): { ola: Buffer; terminar(resposta: Buffer): Chaves | null } {
  const ec = crypto.createECDH("prime256v1");
  const pubC = ec.generateKeys();
  const nonceC = crypto.randomBytes(16);
  const ola = Buffer.concat([Buffer.from([1]), pubC, nonceC, hmac(psk, "ponte1-c", pubC, nonceC)]);
  return {
    ola,
    terminar(r) {
      if (r.length !== TAM_OLA || r[0] !== 2) return null;
      const pubS = r.subarray(1, 66), nonceS = r.subarray(66, 82);
      if (!crypto.timingSafeEqual(r.subarray(82), hmac(psk, "ponte1-s", pubC, nonceC, pubS, nonceS))) return null;
      const k = derivar(ec.computeSecret(pubS), psk, nonceC, nonceS);
      return { envia: new Sentido(k.c2s), recebe: new Sentido(k.s2c) };
    },
  };
}
