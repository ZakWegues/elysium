import * as os from "node:os";

/**
 * Quem pode falar com o servidor da porta 4200 (fase 23.2, blindagem).
 *
 * O servidor escuta em 0.0.0.0 porque o celular chega por endereços que mudam (Wi-Fi de casa,
 * Tailscale, ZeroTier). Mas "qualquer interface" não precisa ser "qualquer origem": um port-
 * forward esquecido no roteador, ou o firewall do Windows aberto no perfil Público, deixaria a
 * API (que desliga o PC e lê a tela) ao alcance da internet. Daqui só passa rede privada.
 *
 * E o cabeçalho Host: uma página maliciosa aberta no navegador do PC pode fazer DNS rebinding
 * (o domínio dela passa a apontar para 127.0.0.1) e conversar com a API como se fosse a mesma
 * origem. O app do celular sempre fala por IP; nome de domínio de fora é recusado.
 */

/** IPv4 em número de 32 bits, ou null. */
function ipv4(s: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some(n => n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

const FAIXAS_V4: [string, number][] = [
  ["127.0.0.0", 8],     // loopback
  ["10.0.0.0", 8],      // RFC 1918
  ["172.16.0.0", 12],   // RFC 1918
  ["192.168.0.0", 16],  // RFC 1918
  ["100.64.0.0", 10],   // CGNAT — Tailscale/ZeroTier
  ["169.254.0.0", 16],  // link-local (cabo direto)
];

function naFaixa(ip: number, base: string, bits: number): boolean {
  const b = ipv4(base)!;
  const mascara = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((ip & mascara) >>> 0) === ((b & mascara) >>> 0);
}

/** O endereço de origem do socket é de rede privada (ou do próprio PC)? Pura. */
export function enderecoPermitido(endereco: string | undefined): boolean {
  if (!endereco) return false;
  let e = endereco.toLowerCase();
  if (e.startsWith("::ffff:")) e = e.slice(7);           // IPv4 embrulhado em IPv6
  const v4 = ipv4(e);
  if (v4 !== null) return FAIXAS_V4.some(([b, n]) => naFaixa(v4, b, n));
  if (e === "::1") return true;
  if (/^fe[89ab][0-9a-f]:/.test(e)) return true;          // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(e)) return true;          // fc00::/7 ULA (Tailscale IPv6)
  return false;
}

/**
 * O cabeçalho Host é um endereço IP, `localhost`, o nome deste PC (ou `.local`) ou um nome do
 * Tailscale (`*.ts.net`)? Nome de domínio qualquer = DNS rebinding. Pura (o nome do PC entra
 * por parâmetro nos testes).
 */
export function hostPermitido(host: string | undefined, nomeDoPc = os.hostname()): boolean {
  if (!host) return false;
  let h = host.trim().toLowerCase();
  if (h.startsWith("[")) {                                  // [IPv6]:porta
    const fim = h.indexOf("]");
    if (fim < 0) return false;
    return /^[0-9a-f:.]+$/.test(h.slice(1, fim));
  }
  h = h.replace(/:\d+$/, "");
  if (ipv4(h) !== null) return true;
  const pc = nomeDoPc.toLowerCase();
  return h === "localhost" || h === pc || h === `${pc}.local` || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.ts\.net$/.test(h);
}
