import { ChildProcess } from "node:child_process";
import { spawnPs } from "../actions/ps";

/**
 * Tem jogo ou apresentação em tela cheia agora? (fase 21, bloco 214 — a bolota some para não
 * atrapalhar.)
 *
 * O Windows responde isso direto: `SHQueryUserNotificationState` devolve 2 (app em tela cheia),
 * 3 (Direct3D em tela cheia — jogo) ou 4 (modo apresentação). É o mesmo sinal que ele usa para
 * segurar as próprias notificações. Um PowerShell só, vivo, pergunta a cada 2 s e escreve uma
 * linha; nada entra no texto do script.
 *
 * 🔴 Medido em 09/10/2026: com a ÁREA DE TRABALHO em primeiro plano (a janela do Explorer que
 * cobre a tela, classe `Progman`/`WorkerW`), o Windows também responde 2. Por isso a linha leva a
 * classe da janela da frente, e o shell não conta como tela cheia.
 */

const SCRIPT = [
  "Add-Type @\"",
  "using System;using System.Text;using System.Runtime.InteropServices;",
  "public class NxQuns {",
  "  [DllImport(\"shell32.dll\")] public static extern int SHQueryUserNotificationState(out int s);",
  "  [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
  "  [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);",
  "}",
  "\"@",
  "while ($true) {",
  "  $s = 0; [void][NxQuns]::SHQueryUserNotificationState([ref]$s)",
  "  $c = New-Object System.Text.StringBuilder 128; [void][NxQuns]::GetClassName([NxQuns]::GetForegroundWindow(), $c, 128)",
  "  [Console]::Out.WriteLine(\"Q$s C\" + $c.ToString()); [Console]::Out.Flush()",
  "  Start-Sleep -Milliseconds 2000",
  "}",
].join("\n");

const CLASSES_DO_SHELL = new Set(["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"]);

/** O estado do Windows (e a classe da janela da frente) significa "não atrapalhe"? Pura. */
export function ehTelaCheia(estado: number, classe = ""): boolean {
  if (estado === 3 || estado === 4) return true;
  return estado === 2 && !CLASSES_DO_SHELL.has(classe);
}

/** Lê uma linha "Q<estado> C<classe>" do vigia. Pura. */
export function lerLinhaDoVigia(linha: string): { estado: number; classe: string } | null {
  const m = /Q(\d+)\s+C(\S*)/.exec(linha);
  return m ? { estado: Number(m[1]), classe: m[2] } : null;
}

let filho: ChildProcess | null = null;
let atual = false;

export function vigiarTelaCheia(mudou: (cheia: boolean) => void): void {
  if (filho) return;
  try { filho = spawnPs(SCRIPT); } catch { return; }
  filho.stdout?.on("data", (d: Buffer) => {
    const linhas = d.toString().trim().split(/\r?\n/);
    const l = lerLinhaDoVigia(linhas[linhas.length - 1] ?? "");
    if (!l) return;
    const cheia = ehTelaCheia(l.estado, l.classe);
    if (cheia !== atual) { atual = cheia; mudou(cheia); }
  });
  filho.on("exit", () => { filho = null; });
}

export function pararVigiaTelaCheia(): void {
  try { filho?.kill(); } catch { /* */ }
  filho = null;
  atual = false;
}
