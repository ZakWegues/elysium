import Store from "electron-store";
import type { IncomingMessage } from "node:http";

/**
 * Quem está usando o token do servidor (bloco 98).
 *
 * O token é a única barreira da porta 4200 (§8), e até aqui não havia como saber QUEM o
 * usava — um celular antigo esquecido na gaveta, um script, alguém na rede com um token
 * vazado. Cada requisição autorizada anota o endereço e o tipo de cliente; cada recusa
 * (401) também, à parte — várias recusas do mesmo endereço é alguém tentando. A lista
 * aparece no pareamento, e "Regenerar token" zera tudo (o token velho deixa de valer na
 * hora, então os aparelhos antigos saem da lista de fato).
 *
 * Só endereço, tipo de cliente e contagens: nada do que foi pedido.
 */

export interface Aparelho {
  ip: string;
  cliente: string;
  primeiraVez: number;
  ultimaVez: number;
  pedidos: number;
  recusas: number;
}

const store = new Store<{ aparelhos: Record<string, Aparelho> }>({ name: "aparelhos", defaults: { aparelhos: {} } });
let memoria: Record<string, Aparelho> = store.get("aparelhos");
let gravarAgendado = false;

/** "okhttp/4.12.0" → "ELYSIUM-M (Android)". Exportado para os testes. */
export function tipoDeCliente(ua: string | undefined): string {
  const u = (ua ?? "").toLowerCase();
  if (!u) return "desconhecido";
  if (u.includes("okhttp") || u.includes("expo") || u.includes("reactnative")) return "ELYSIUM-M (Android)";
  if (u.includes("electron") || u.includes("chrome") || u.includes("mozilla")) return "navegador";
  if (u.includes("node") || u.includes("undici")) return "script (Node)";
  if (u.includes("curl") || u.includes("powershell") || u.includes("wget")) return "linha de comando";
  return ua!.slice(0, 40);
}

export function ipDe(req: IncomingMessage): string {
  const ip = req.socket.remoteAddress ?? "?";
  return ip.replace(/^::ffff:/, "") === "::1" ? "127.0.0.1" : ip.replace(/^::ffff:/, "");
}

function gravarDepois(): void {
  if (gravarAgendado) return;
  gravarAgendado = true;
  // Uma escrita por minuto no máximo: o trackpad manda dezenas de pedidos por segundo.
  setTimeout(() => { gravarAgendado = false; store.set("aparelhos", memoria); }, 60_000).unref?.();
}

export function registrarAcesso(req: IncomingMessage, autorizado: boolean): void {
  const ip = ipDe(req);
  const agora = Date.now();
  const a = memoria[ip] ?? { ip, cliente: tipoDeCliente(req.headers["user-agent"]), primeiraVez: agora, ultimaVez: agora, pedidos: 0, recusas: 0 };
  if (autorizado) { a.pedidos++; a.ultimaVez = agora; a.cliente = tipoDeCliente(req.headers["user-agent"]); }
  else a.recusas++;
  memoria[ip] = a;
  // 31/10: teto — IPv6 de privacidade e varreduras na rede criavam um registro por endereço, para sempre.
  const ips = Object.keys(memoria);
  if (ips.length > 50) {
    for (const velho of ips.sort((x, y) => memoria[x].ultimaVez - memoria[y].ultimaVez).slice(0, ips.length - 50)) delete memoria[velho];
  }
  gravarDepois();
}

export function listarAparelhos(): Aparelho[] {
  return Object.values(memoria).sort((x, y) => y.ultimaVez - x.ultimaVez);
}

export function esquecerAparelhos(): void {
  memoria = {};
  store.set("aparelhos", memoria);
}
