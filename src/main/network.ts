import * as os from "node:os";

export interface LocalEndpoint {
  /** Nome da interface, como o Windows reporta. */
  iface:   string;
  address: string;
  /** Interface de VPN mesh (Tailscale/ZeroTier) — funciona fora da rede de casa. */
  tunnel:  boolean;
}

const TUNNEL_RE   = /tailscale|zerotier|wireguard|wg\d|zt[a-z0-9]{8}/i;
const PREFERRED_RE = /wi-?fi|wireless|ethernet/i;

/** Endereços do Tailscale/ZeroTier ficam em faixas próprias e conhecidas. */
function looksLikeTunnelAddress(addr: string): boolean {
  // Tailscale distribui 100.64.0.0/10 (CGNAT); ZeroTier usa muito 10.147.x / 172.2x.
  const [a, b] = addr.split(".").map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

/**
 * Todos os IPv4 não-loopback da máquina, ordenados por probabilidade de o celular
 * conseguir alcançar: Wi-Fi/Ethernet primeiro (rede de casa, mais rápido), túnel
 * depois (funciona de qualquer lugar, mas com salto extra), resto por último.
 *
 * O QR de pareamento carrega a lista inteira: o celular corre todos em paralelo e
 * fica com o que responder. É isso que faz o pareamento sobreviver a troca de IP
 * por DHCP e a sair de casa.
 */
export function getAllLocalIPv4(): LocalEndpoint[] {
  const interfaces = os.networkInterfaces();
  const found: LocalEndpoint[] = [];

  for (const [iface, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      found.push({
        iface,
        address: addr.address,
        tunnel:  TUNNEL_RE.test(iface) || looksLikeTunnelAddress(addr.address),
      });
    }
  }

  return found.sort((a, b) => rank(a) - rank(b));
}

function rank(e: LocalEndpoint): number {
  if (e.tunnel) return 1;                      // alcançável de fora, mas com salto extra
  if (PREFERRED_RE.test(e.iface)) return 0;    // rede local, caminho mais curto
  return 2;                                    // adaptadores virtuais, Hyper-V, etc.
}

/**
 * Melhor endereço único, para exibir na UI. Mantido para quem só precisa de um.
 * A lista completa vai no QR — ver getAllLocalIPv4().
 */
export function getLocalIPv4(): string | null {
  const all = getAllLocalIPv4();
  const local = all.find(e => !e.tunnel);
  return (local ?? all[0])?.address ?? null;
}
