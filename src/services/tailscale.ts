import { shell } from "electron";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Tailscale visto do PC (fase 13, bloco 122) — decisão do Zak: fora de casa continua pela
 * VPN, a porta do PC nunca vai para a internet. O que faltava era VER quando ela cai.
 *
 * No dia em que isto foi escrito, o Tailscale do PC estava rodando e o do celular (Android
 * com HyperOS) aparecia DESLIGADO na rede — o mesmo problema anotado em agosto (§12: o
 * gerenciador de bateria mata o app e o ícone de VPN continua na barra). O card Saúde passa
 * a dizer isso com o nome do aparelho, em vez de o celular só mostrar "PC fora do ar".
 */

export interface AparelhoTailscale { nome: string; online: boolean; sistema: string; vistoEm: number | null }
export interface EstadoTailscale { instalado: boolean; rodando: boolean; ip: string | null; celulares: AparelhoTailscale[] }

const PASTA = path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Tailscale");

/** O JSON do `tailscale status --json` → o que interessa. Pura, para teste. */
export function interpretarStatus(bruto: string): Omit<EstadoTailscale, "instalado"> {
  const j = JSON.parse(bruto) as {
    BackendState?: string;
    Self?: { TailscaleIPs?: string[] };
    Peer?: Record<string, { HostName?: string; Online?: boolean; OS?: string; LastSeen?: string }>;
  };
  const celulares = Object.values(j.Peer ?? {})
    .filter(p => /android|ios/i.test(p.OS ?? ""))
    .map(p => {
      const visto = p.LastSeen ? Date.parse(p.LastSeen) : NaN;
      // O Tailscale manda "0001-01-01T00:00:00Z" para quem está online agora.
      return { nome: p.HostName ?? "celular", online: Boolean(p.Online), sistema: p.OS ?? "", vistoEm: Number.isNaN(visto) || visto < 0 ? null : visto };
    });
  return {
    rodando: j.BackendState === "Running",
    ip: (j.Self?.TailscaleIPs ?? []).find(x => /^100\./.test(x)) ?? null,
    celulares,
  };
}

export function estadoTailscale(): Promise<EstadoTailscale> {
  const exe = path.join(PASTA, "tailscale.exe");
  if (!fs.existsSync(exe)) return Promise.resolve({ instalado: false, rodando: false, ip: null, celulares: [] });
  return new Promise((resolve) => {
    execFile(exe, ["status", "--json"], { timeout: 8000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      try { resolve({ instalado: true, ...interpretarStatus(String(out)) }); }
      catch { resolve({ instalado: true, rodando: false, ip: null, celulares: [] }); }
      void err;
    });
  });
}

/** Abre o app do Tailscale no PC pelo shell (sem herdar handles — bloco 108). */
export async function abrirTailscale(): Promise<boolean> {
  const gui = path.join(PASTA, "tailscale-ipn.exe");
  if (!fs.existsSync(gui)) return false;
  return (await shell.openPath(gui)) === "";
}
