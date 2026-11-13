import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";

/**
 * Ler e mexer na janela da frente pela acessibilidade do Windows (UI Automation) — 13/11, a Ely
 * flutuante no jeito do Roamies (o `read_window` / `act_in_app` dele).
 *
 * Um PowerShell PERSISTENTE (como o `inputHost`): carregar o UIAutomationClient custa ~0,5 s, e uma
 * leitura nova a cada pedido não pode pagar isso de novo. Ele guarda os elementos da última leitura,
 * então clicar/preencher é pelo número que a leitura deu.
 *
 * Protocolo (uma linha por comando, uma linha de resposta; textos em base64 UTF-8 — o console do
 * PowerShell come os acentos):
 *   LER <hwnd>            → OK <base64 do JSON {titulo, processo, elementos:[{i,t,n,x,y,w,h,a,v}]}>
 *   CLICAR <i>            → OK <como: invoke|toggle|select|expand|foco>
 *   VALOR <i> <base64>    → OK            (escreve num campo)
 *   FRENTE <hwnd>         → OK            (traz a janela para a frente, antes de teclas)
 *   PING                  → OK
 * Coordenadas: as do próprio processo (sem DPI), que batem com as do Electron (DIP).
 */

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @"
using System; using System.Runtime.InteropServices;
public class NxUia { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); }
"@
$A = [System.Windows.Automation.AutomationElement]
$global:els = New-Object System.Collections.ArrayList
$UTF8 = New-Object System.Text.UTF8Encoding $false
function B64($s) { [Convert]::ToBase64String($UTF8.GetBytes($s)) }
$uteis = @('Button','Edit','ComboBox','CheckBox','RadioButton','TabItem','MenuItem','Hyperlink','ListItem','TreeItem','Document','Slider','SplitButton','MenuBar','Menu','ToolBar','Tab','Text','Image','DataItem','Header','HeaderItem')
function Ler([IntPtr]$h) {
  $root = $A::FromHandle($h)
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $global:els = New-Object System.Collections.ArrayList
  $out = New-Object System.Collections.ArrayList
  $pilha = New-Object System.Collections.Stack
  $pilha.Push(@($root, 0))
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $rr = $root.Current.BoundingRectangle
  while ($pilha.Count -gt 0 -and $out.Count -lt 260 -and $sw.ElapsedMilliseconds -lt 2500) {
    $par = $pilha.Pop(); $e = $par[0]; $d = $par[1]
    try { $c = $e.Current } catch { continue }
    $r = $c.BoundingRectangle
    # Fora da área da PRÓPRIA janela (rolado para fora, aba escondida): não serve. (Fora do monitor serve.)
    if ($d -gt 0 -and -not $r.IsEmpty -and -not $rr.IntersectsWith($r)) { continue }
    $tipo = $c.ControlType.ProgrammaticName -replace '^ControlType\.', ''
    $nome = [string]$c.Name
    if (-not $r.IsEmpty -and $r.Width -gt 3 -and $r.Height -gt 3 -and ($uteis -contains $tipo) -and ($nome -or $tipo -in @('Edit','ComboBox','Document'))) {
      $v = ''
      try { $vp = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); $v = [string]$vp.Current.Value } catch {}
      [void]$global:els.Add($e)
      [void]$out.Add([ordered]@{ i = $global:els.Count - 1; t = $tipo; n = $nome.Substring(0, [Math]::Min(90, $nome.Length)); x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height; a = [string]$c.AutomationId; v = $v.Substring(0, [Math]::Min(60, $v.Length)) })
    }
    if ($d -lt 14) {
      $filhos = @(); $f = $walker.GetFirstChild($e)
      while ($f -ne $null -and $filhos.Count -lt 120) { $filhos += ,$f; $f = $walker.GetNextSibling($f) }
      for ($k = $filhos.Count - 1; $k -ge 0; $k--) { $pilha.Push(@($filhos[$k], ($d + 1))) }
    }
  }
  $proc = ''; try { $proc = (Get-Process -Id $root.Current.ProcessId).ProcessName } catch {}
  return (B64 (ConvertTo-Json -Compress -Depth 4 ([ordered]@{ titulo = [string]$root.Current.Name; processo = $proc; elementos = $out })))
}
function Clicar([int]$i) {
  $e = $global:els[$i]
  try { $e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); return 'invoke' } catch {}
  try { $e.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select(); return 'select' } catch {}
  try { $e.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle(); return 'toggle' } catch {}
  try { $e.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand(); return 'expand' } catch {}
  $e.SetFocus(); return 'foco'
}
while ($true) {
  $linha = [Console]::In.ReadLine()
  if ($linha -eq $null) { break }
  $p = $linha.Split(' ')
  try {
    switch ($p[0]) {
      'PING'   { [Console]::Out.WriteLine('OK') }
      'LER'    { [Console]::Out.WriteLine('OK ' + (Ler ([IntPtr][Int64]$p[1]))) }
      'CLICAR' { [Console]::Out.WriteLine('OK ' + (Clicar ([int]$p[1]))) }
      'VALOR'  { $t = $UTF8.GetString([Convert]::FromBase64String($p[2])); $e = $global:els[[int]$p[1]]; try { $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($t) } catch { $e.SetFocus(); [System.Windows.Forms.SendKeys]::SendWait($t) }; [Console]::Out.WriteLine('OK') }
      'FRENTE' { $h = [IntPtr][Int64]$p[1]; [void][NxUia]::ShowWindow($h, 9); [void][NxUia]::SetForegroundWindow($h); [Console]::Out.WriteLine('OK') }
      default  { [Console]::Out.WriteLine('ERR comando desconhecido') }
    }
  } catch { [Console]::Out.WriteLine('ERR ' + ($_.Exception.Message -replace '[\r\n]', ' ')) }
  [Console]::Out.Flush()
}
`;

export interface ElementoUia { i: number; t: string; n: string; x: number; y: number; w: number; h: number; a: string; v: string }
export interface LeituraUia { titulo: string; processo: string; elementos: ElementoUia[] }

class UiaHost {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private pend: { ok: (s: string) => void; falha: (e: Error) => void; t: NodeJS.Timeout }[] = [];

  private iniciar(): ChildProcessWithoutNullStreams {
    if (this.proc) return this.proc;
    // Add-Type de System.Windows.Forms para o SendKeys do VALOR (reserva) vai junto.
    const script = "Add-Type -AssemblyName System.Windows.Forms\n" + SCRIPT;
    const enc = Buffer.from(script, "utf16le").toString("base64");
    const p = spawn("powershell.exe", ["-ExecutionPolicy", "Bypass", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", enc], { stdio: "pipe", windowsHide: true });
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (c: string) => this.dados(c));
    p.stderr.setEncoding("utf8");
    p.stderr.on("data", (c: string) => { const t = c.trim(); if (t && !t.startsWith("#< CLIXML")) console.warn("[uia] stderr:", t.slice(0, 300)); });
    const morreu = () => { if (this.proc !== p) return; this.proc = null; for (const w of this.pend.splice(0)) { clearTimeout(w.t); w.falha(new Error("o leitor de janelas caiu")); } };
    p.on("error", morreu);
    p.on("close", morreu);
    this.proc = p;
    return p;
  }

  private dados(c: string): void {
    this.buffer += c;
    let i: number;
    while ((i = this.buffer.indexOf("\n")) >= 0) {
      const linha = this.buffer.slice(0, i).trim();
      this.buffer = this.buffer.slice(i + 1);
      if (!linha) continue;
      const w = this.pend.shift();
      if (!w) continue;
      clearTimeout(w.t);
      if (linha.startsWith("ERR")) w.falha(new Error(linha.slice(3).trim() || "falhou"));
      else w.ok(linha.slice(2).trim());
    }
  }

  private pedir(linha: string, prazoMs: number): Promise<string> {
    if (/[\r\n]/.test(linha)) return Promise.reject(new Error("comando com quebra de linha"));
    const p = this.iniciar();
    return new Promise((ok, falha) => {
      // Travou (janela que não responde à acessibilidade): derruba o host; o próximo pedido sobe outro.
      const t = setTimeout(() => { falha(new Error("a janela não respondeu a tempo")); try { p.kill(); } catch { /* já foi */ } }, prazoMs);
      this.pend.push({ ok, falha, t });
      p.stdin.write(linha + "\n");
    });
  }

  /** Sobe o host antes de precisar (a carga do UIAutomationClient sai do caminho do pedido). */
  aquecer(): void { void this.pedir("PING", 15_000).catch(() => {}); }

  async ler(hwnd: string): Promise<LeituraUia> {
    if (!/^\d+$/.test(hwnd)) throw new Error("janela inválida");
    const b64 = await this.pedir(`LER ${hwnd}`, 8_000);
    const j = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Partial<LeituraUia> & { elementos?: unknown };
    const lista = Array.isArray(j.elementos) ? j.elementos : j.elementos ? [j.elementos] : [];
    return { titulo: String(j.titulo ?? ""), processo: String(j.processo ?? ""), elementos: lista as ElementoUia[] };
  }
  clicar(i: number): Promise<string> { return this.pedir(`CLICAR ${Math.trunc(i)}`, 5_000); }
  async valor(i: number, texto: string): Promise<void> { await this.pedir(`VALOR ${Math.trunc(i)} ${Buffer.from(texto, "utf8").toString("base64")}`, 5_000); }
  async frente(hwnd: string): Promise<void> { if (/^\d+$/.test(hwnd)) await this.pedir(`FRENTE ${hwnd}`, 3_000); }
  parar(): void { try { this.proc?.kill(); } catch { /* */ } this.proc = null; }
}

export const uiaHost = new UiaHost();
