import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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
 * 13/11 (o agente de tela, no jeito do `act_in_app` do Roamies):
 *   FOCADO                → OK <base64 {i,t,n,v,editavel,pid,x,y,w,h}>  (o campo com o cursor: o "aqui")
 *   FOCAR <i>             → OK
 *   NOPONTO <x> <y>       → OK <pid>          (de quem é o que está nesse ponto da tela)
 *   TECLA <vk>            → OK 1|0            (a tecla está apertada agora? — segurar o atalho)
 *   MOSTRAR <i>           → OK x y w h       (rola até ele aparecer; onde está agora)
 *   VALORDE <i>           → OK <base64 do texto> | OK !   (para conferir o que ficou escrito)
 *   PREENCHER <i> <b64>   → OK <base64 do valor depois> | OK !   (! = sem ValuePattern)
 *   ROLAR <i|-1> cima|baixo 0|1   → OK ok <percentual> | OK sem   (1 = até o fim)
 *   ESCOLHER <i> <b64>    → OK <base64 do nome escolhido> | OK sem
 *   CLICAR_EM <x> <y>     → OK            (clique do mouse de verdade, em pixels físicos)
 * Coordenadas: pixels físicos (a UIA dá assim e o host é DPI-aware); a camada converte para DIP.
 */

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @"
using System; using System.Runtime.InteropServices;
public class NxUia { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e); [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, uint d, UIntPtr e); [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk); }
"@
# Pixels físicos dos dois lados: a UIA já dá físicos; o SetCursorPos (CLICAR_EM) também precisa.
[void][NxUia]::SetProcessDPIAware()
$A = [System.Windows.Automation.AutomationElement]
$global:els = New-Object System.Collections.ArrayList
$global:raiz = $null
$UTF8 = New-Object System.Text.UTF8Encoding $false
function B64($s) { [Convert]::ToBase64String($UTF8.GetBytes($s)) }
$uteis = @('Button','Edit','ComboBox','CheckBox','RadioButton','TabItem','MenuItem','Hyperlink','ListItem','TreeItem','Document','Slider','SplitButton','MenuBar','Menu','ToolBar','Tab','Text','Image','DataItem','Header','HeaderItem')
function Ler([IntPtr]$h) {
  $root = $A::FromHandle($h)
  $global:raiz = $root
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
    # Fora da área da PRÓPRIA janela (rolado para fora): entra marcado (o agente age nele; o guia não marca).
    $fora = [int]($d -gt 0 -and -not $r.IsEmpty -and -not $rr.IntersectsWith($r))
    $tipo = $c.ControlType.ProgrammaticName -replace '^ControlType\.', ''
    $nome = [string]$c.Name
    if (-not $r.IsEmpty -and $r.Width -gt 3 -and $r.Height -gt 3 -and ($uteis -contains $tipo) -and ($nome -or $tipo -in @('Edit','ComboBox','Document'))) {
      $v = ''
      try { $vp = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); $v = [string]$vp.Current.Value } catch {}
      [void]$global:els.Add($e)
      [void]$out.Add([ordered]@{ i = $global:els.Count - 1; t = $tipo; n = $nome.Substring(0, [Math]::Min(90, $nome.Length)); x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height; a = [string]$c.AutomationId; v = $v.Substring(0, [Math]::Min(60, $v.Length)); f = [int]$c.HasKeyboardFocus; o = $fora })
    }
    if ($d -lt 14) {
      $filhos = @(); $f = $walker.GetFirstChild($e)
      while ($f -ne $null -and $filhos.Count -lt 120) { $filhos += ,$f; $f = $walker.GetNextSibling($f) }
      for ($k = $filhos.Count - 1; $k -ge 0; $k--) { $pilha.Push(@($filhos[$k], ($d + 1))) }
    }
  }
  $proc = ''; try { $proc = (Get-Process -Id $root.Current.ProcessId).ProcessName } catch {}
  return (B64 (ConvertTo-Json -Compress -Depth 4 ([ordered]@{ titulo = [string]$root.Current.Name; processo = $proc; pid = $root.Current.ProcessId; x = [int]$rr.X; y = [int]$rr.Y; w = [int]$rr.Width; h = [int]$rr.Height; elementos = $out })))
}
function Clicar([int]$i) {
  $e = $global:els[$i]
  try { $e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); return 'invoke' } catch {}
  try { $e.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select(); return 'select' } catch {}
  try { $e.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle(); return 'toggle' } catch {}
  try { $e.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand(); return 'expand' } catch {}
  $e.SetFocus(); return 'foco'
}
# O texto que um campo mostra agora (ValuePattern; senão TextPattern, como o Bloco de Notas novo).
function ValorDe($e) {
  try { return [string]$e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {}
  try { return [string]$e.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern).DocumentRange.GetText(4000) } catch {}
  return $null
}
# O elemento com o cursor de texto agora (o "aqui"): tipo, nome, valor e se aceita texto.
function Focado() {
  $e = $A::FocusedElement
  if ($e -eq $null) { return (B64 '{}') }
  $c = $e.Current
  $tipo = $c.ControlType.ProgrammaticName -replace '^ControlType\.', ''
  $ro = $true
  try { $ro = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.IsReadOnly } catch { if ($tipo -in @('Edit','Document')) { $ro = $false } }
  $v = ValorDe $e; if ($v -eq $null) { $v = '' }
  $r = $c.BoundingRectangle
  [void]$global:els.Add($e)
  return (B64 (ConvertTo-Json -Compress ([ordered]@{ i = $global:els.Count - 1; t = $tipo; n = [string]$c.Name; v = $v.Substring(0, [Math]::Min(300, $v.Length)); editavel = (-not $ro); pid = $c.ProcessId; x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height })))
}
# Escreve num campo pelo ValuePattern e devolve o que ele mostra depois (para conferir). '!' = sem ValuePattern.
function Preencher([int]$i, [string]$t) {
  $e = $global:els[$i]
  try { $vp = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern) } catch { return '!' }
  if ($vp.Current.IsReadOnly) { return '!' }
  try { $e.SetFocus() } catch {}
  $vp.SetValue($t)
  Start-Sleep -Milliseconds 60
  $v = ValorDe $e; if ($v -eq $null) { $v = '' }
  return (B64 $v)
}
# Rola o elemento (ou o primeiro antepassado que rola; -1 = a janela toda). fim: 100% / 0%.
function Rolar([int]$i, [string]$dir, [int]$fim) {
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $e = if ($i -ge 0) { $global:els[$i] } else { $global:raiz }
  $sp = $null
  for ($k = 0; $k -lt 12 -and $e -ne $null -and $sp -eq $null; $k++) {
    try { $p = $e.GetCurrentPattern([System.Windows.Automation.ScrollPattern]::Pattern); if ($p.Current.VerticallyScrollable) { $sp = $p } } catch {}
    if ($sp -eq $null) { $e = $walker.GetParent($e) }
  }
  if ($sp -eq $null -and $global:raiz -ne $null) {
    # A janela inteira: o primeiro descendente que rola na vertical (a página do navegador, a lista).
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsScrollPatternAvailableProperty, $true)
    foreach ($x in $global:raiz.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)) {
      try { $p = $x.GetCurrentPattern([System.Windows.Automation.ScrollPattern]::Pattern); if ($p.Current.VerticallyScrollable) { $sp = $p; break } } catch {}
    }
  }
  if ($sp -eq $null) { return 'sem' }
  if ($fim -eq 1) { $sp.SetScrollPercent(-1, $(if ($dir -eq 'cima') { 0 } else { 100 })) }
  else { $sp.ScrollVertical($(if ($dir -eq 'cima') { [System.Windows.Automation.ScrollAmount]::LargeDecrement } else { [System.Windows.Automation.ScrollAmount]::LargeIncrement })) }
  return ('ok ' + [int]$sp.Current.VerticalScrollPercent)
}
# Escolhe a opção de uma lista suspensa pelo nome (sem precisar abrir quando a lista já está na árvore).
function Escolher([int]$i, [string]$opcao) {
  $e = $global:els[$i]
  $alvo = $opcao.ToLower()
  $achar = {
    param($base)
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::ListItem)
    $itens = $base.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
    $exato = $null; $parte = $null
    foreach ($x in $itens) { $n = ([string]$x.Current.Name).ToLower(); if ($n -eq $alvo) { $exato = $x; break }; if ($parte -eq $null -and $n.Contains($alvo)) { $parte = $x } }
    if ($exato -ne $null) { return $exato } else { return $parte }
  }
  $item = & $achar $e
  if ($item -eq $null) {
    try { $e.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand(); Start-Sleep -Milliseconds 250 } catch {}
    $item = & $achar $e
    if ($item -eq $null -and $global:raiz -ne $null) { $item = & $achar $global:raiz }
  }
  if ($item -eq $null) { return 'sem' }
  $nome = [string]$item.Current.Name
  try { $item.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() } catch { try { $item.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() } catch { return 'sem' } }
  try { $e.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Collapse() } catch {}
  return (B64 $nome)
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
      'FOCADO' { [Console]::Out.WriteLine('OK ' + (Focado)) }
      'NOPONTO' { $e = $A::FromPoint((New-Object System.Windows.Point([double]$p[1], [double]$p[2]))); [Console]::Out.WriteLine('OK ' + $(if ($e) { $e.Current.ProcessId } else { 0 })) }
      'TECLA'  { [Console]::Out.WriteLine('OK ' + $(if (([NxUia]::GetAsyncKeyState([int]$p[1]) -band 0x8000) -ne 0) { 1 } else { 0 })) }
      'MOSTRAR' { $e = $global:els[[int]$p[1]]; try { $e.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern).ScrollIntoView(); Start-Sleep -Milliseconds 120 } catch {}; $r = $e.Current.BoundingRectangle; [Console]::Out.WriteLine('OK ' + [int]$r.X + ' ' + [int]$r.Y + ' ' + [int]$r.Width + ' ' + [int]$r.Height) }
      'FOCAR'  { $global:els[[int]$p[1]].SetFocus(); [Console]::Out.WriteLine('OK') }
      'VALORDE' { $v = ValorDe $global:els[[int]$p[1]]; if ($v -eq $null) { [Console]::Out.WriteLine('OK !') } else { [Console]::Out.WriteLine('OK ' + (B64 $v)) } }
      'PREENCHER' { [Console]::Out.WriteLine('OK ' + (Preencher ([int]$p[1]) ($UTF8.GetString([Convert]::FromBase64String($p[2]))))) }
      'ROLAR'  { [Console]::Out.WriteLine('OK ' + (Rolar ([int]$p[1]) $p[2] ([int]$p[3]))) }
      'ESCOLHER' { [Console]::Out.WriteLine('OK ' + (Escolher ([int]$p[1]) ($UTF8.GetString([Convert]::FromBase64String($p[2]))))) }
      'CLICAR_EM' { [void][NxUia]::SetCursorPos([int]$p[1], [int]$p[2]); Start-Sleep -Milliseconds 30; [NxUia]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); [NxUia]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero); [Console]::Out.WriteLine('OK') }
      'FRENTE' {
        $h = [IntPtr][Int64]$p[1]
        # Já na frente: não mexe (o truque do Alt abriria o menu dela e tiraria o cursor do campo).
        if ([NxUia]::GetForegroundWindow() -eq $h -and -not [NxUia]::IsIconic($h)) { [Console]::Out.WriteLine('OK 1') }
        else {
          if ([NxUia]::IsIconic($h)) { [void][NxUia]::ShowWindow($h, 9) }
          # Uma entrada nossa antes (mouse parado no lugar) libera o SetForegroundWindow; o Alt fica de reserva.
          [NxUia]::mouse_event(1, 0, 0, 0, [UIntPtr]::Zero)
          [void][NxUia]::SetForegroundWindow($h); Start-Sleep -Milliseconds 50
          if ([NxUia]::GetForegroundWindow() -ne $h) { [NxUia]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [NxUia]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero); [void][NxUia]::SetForegroundWindow($h); Start-Sleep -Milliseconds 60 }
          if ([NxUia]::GetForegroundWindow() -eq $h) { [Console]::Out.WriteLine('OK 1') } else { [Console]::Out.WriteLine('OK 0') }
        }
      }
      default  { [Console]::Out.WriteLine('ERR comando desconhecido') }
    }
  } catch { [Console]::Out.WriteLine('ERR ' + ($_.Exception.Message -replace '[\r\n]', ' ')) }
  [Console]::Out.Flush()
}
`;

export interface ElementoUia { i: number; t: string; n: string; x: number; y: number; w: number; h: number; a: string; v: string; f?: number; o?: number }
export interface LeituraUia { titulo: string; processo: string; elementos: ElementoUia[]; pid?: number; x?: number; y?: number; w?: number; h?: number }
export interface FocadoUia { i: number; t: string; n: string; v: string; editavel: boolean; pid: number; x: number; y: number; w: number; h: number }
const de64 = (s: string) => Buffer.from(s, "base64").toString("utf8");
const para64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

class UiaHost {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private pend: { ok: (s: string) => void; falha: (e: Error) => void; t: NodeJS.Timeout }[] = [];

  private iniciar(): ChildProcessWithoutNullStreams {
    if (this.proc) return this.proc;
    // Add-Type de System.Windows.Forms para o SendKeys do VALOR (reserva) vai junto.
    const script = "Add-Type -AssemblyName System.Windows.Forms\n" + SCRIPT;
    // 13/11: o script passou do limite da linha de comando (-EncodedCommand): vai num arquivo
    // (com BOM: o PowerShell 5 só lê UTF-8 assim).
    const arquivo = path.join(os.tmpdir(), "elysium-uia.ps1");
    fs.writeFileSync(arquivo, "﻿" + script, "utf8");
    const p = spawn("powershell.exe", ["-ExecutionPolicy", "Bypass", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-File", arquivo], { stdio: "pipe", windowsHide: true });
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
    return { titulo: String(j.titulo ?? ""), processo: String(j.processo ?? ""), elementos: lista as ElementoUia[], pid: Number(j.pid) || 0, x: Number(j.x) || 0, y: Number(j.y) || 0, w: Number(j.w) || 0, h: Number(j.h) || 0 };
  }
  /** O campo com o cursor de texto agora (null = nenhum). */
  async focado(): Promise<FocadoUia | null> {
    const j = JSON.parse(de64(await this.pedir("FOCADO", 4_000))) as Partial<FocadoUia>;
    return typeof j.i === "number" ? { i: j.i, t: String(j.t ?? ""), n: String(j.n ?? ""), v: String(j.v ?? ""), editavel: j.editavel === true, pid: Number(j.pid) || 0, x: Number(j.x) || 0, y: Number(j.y) || 0, w: Number(j.w) || 0, h: Number(j.h) || 0 } : null;
  }
  /** O processo dono do que está no ponto (pixels físicos) — para não clicar em outra janela por cima. */
  async noPonto(x: number, y: number): Promise<number> { return Number(await this.pedir(`NOPONTO ${Math.round(x)} ${Math.round(y)}`, 3_000)) || 0; }
  /** A tecla (código virtual) está apertada agora? */
  async teclaApertada(vk: number): Promise<boolean> { return (await this.pedir(`TECLA ${Math.trunc(vk)}`, 2_000)) === "1"; }
  /** Rola até o elemento aparecer e devolve onde ele está agora (pixels físicos). */
  async mostrar(i: number): Promise<{ x: number; y: number; w: number; h: number }> {
    const [x, y, w, h] = (await this.pedir(`MOSTRAR ${Math.trunc(i)}`, 4_000)).split(" ").map(Number);
    return { x, y, w, h };
  }
  async focar(i: number): Promise<void> { await this.pedir(`FOCAR ${Math.trunc(i)}`, 4_000); }
  /** O texto que o campo mostra agora (null = não dá para ler). */
  async valorDe(i: number): Promise<string | null> { const r = await this.pedir(`VALORDE ${Math.trunc(i)}`, 4_000); return r === "!" ? null : de64(r); }
  /** Escreve pelo ValuePattern e devolve o que o campo mostra depois (null = esse campo não aceita assim). */
  async preencher(i: number, texto: string): Promise<string | null> { const r = await this.pedir(`PREENCHER ${Math.trunc(i)} ${para64(texto)}`, 5_000); return r === "!" ? null : de64(r); }
  /** Rola (i = -1: a janela). `null` = nada ali rola pela acessibilidade; senão o percentual. */
  async rolar(i: number, direcao: "cima" | "baixo", ateOFim: boolean): Promise<number | null> {
    const r = await this.pedir(`ROLAR ${Math.trunc(i)} ${direcao} ${ateOFim ? 1 : 0}`, 6_000);
    return r.startsWith("ok") ? Number(r.split(" ")[1]) || 0 : null;
  }
  /** Escolhe a opção (pelo nome) numa lista suspensa. Devolve o nome escolhido, ou null. */
  async escolher(i: number, opcao: string): Promise<string | null> { const r = await this.pedir(`ESCOLHER ${Math.trunc(i)} ${para64(opcao)}`, 6_000); return r === "sem" ? null : de64(r); }
  /** Clique de verdade (pixels físicos da tela). */
  async clicarEm(x: number, y: number): Promise<void> { await this.pedir(`CLICAR_EM ${Math.round(x)} ${Math.round(y)}`, 3_000); }
  clicar(i: number): Promise<string> { return this.pedir(`CLICAR ${Math.trunc(i)}`, 5_000); }
  async valor(i: number, texto: string): Promise<void> { await this.pedir(`VALOR ${Math.trunc(i)} ${Buffer.from(texto, "utf8").toString("base64")}`, 5_000); }
  /**
   * Traz a janela para a frente (com o truque do Alt: janela de fundo não pode roubar o foco).
   * `true` = ela está mesmo na frente agora — só aí é seguro teclar/colar (senão iria no programa errado).
   */
  async frente(hwnd: string): Promise<boolean> {
    if (!/^\d+$/.test(hwnd)) return false;
    for (let i = 0; i < 2; i++) if ((await this.pedir(`FRENTE ${hwnd}`, 3_000)) === "1") return true;
    return false;
  }
  parar(): void { try { this.proc?.kill(); } catch { /* */ } this.proc = null; }
}

export const uiaHost = new UiaHost();
