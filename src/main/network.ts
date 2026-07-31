import * as os from "node:os";

/**
 * Retorna o IPv4 local mais provável de ser a interface Wi-Fi/Ethernet ativa
 * (usado pro celular achar o PC na mesma rede). Ignora loopback/internal.
 */
export function getLocalIPv4(): string | null {
  const interfaces = os.networkInterfaces();
  const candidates: { name: string; address: string }[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        candidates.push({ name, address: addr.address });
      }
    }
  }

  if (candidates.length === 0) return null;

  const preferred = candidates.find(c => /wi-?fi|wireless|ethernet/i.test(c.name));
  return (preferred ?? candidates[0]).address;
}
