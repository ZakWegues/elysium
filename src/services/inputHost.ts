/**
 * Host de entrada remota — mouse e teclado controlados pelo celular.
 *
 * ## Por que um processo persistente
 *
 * Todo o resto do projeto dispara `powershell.exe -EncodedCommand ...` por ação e
 * espera terminar. Isso custa 150-250 ms de inicialização, o que é irrelevante para
 * "abre o Spotify" e inviável para movimento de cursor: arrastar o dedo na tela gera
 * dezenas de eventos por segundo. Aqui um único PowerShell fica vivo lendo comandos
 * linha a linha do stdin, então cada evento custa só o parsing de uma linha.
 *
 * ## Por que não um módulo nativo
 *
 * robotjs/nut-js resolveriam isto com uma API melhor, mas exigem rebuild de binário
 * nativo casado com a versão do Electron — uma fonte permanente de quebra a cada
 * atualização. SetCursorPos + mouse_event + SendKeys cobre o caso de uso sem
 * dependência nova.
 *
 * ## Protocolo (uma linha por comando, uma linha de resposta)
 *
 *   MOVE <dx> <dy>        move o cursor relativamente
 *   CLICK <left|right|middle>
 *   DOUBLE <left|right>
 *   DOWN <left|right>     pressiona sem soltar (arrastar)
 *   UP <left|right>
 *   SCROLL <delta>        positivo rola pra cima
 *   TYPE <base64>         digita texto literal
 *   KEY <sequência>       teclas especiais em sintaxe SendKeys, ex: {ENTER} ou ^c
 *   PING
 *
 * Fase 22 (canal por WebSocket, ver inputCanal.ts):
 *   WHEEL <n> / HWHEEL <n>  roda vertical/horizontal em unidades de 1/120 (rolagem suave)
 *   KEYS <vk1,vk2,...>      combinação por tecla virtual: aperta em ordem, solta ao contrário
 *                           (SendKeys não faz a tecla Windows)
 *   UP <vk1,vk2,...>        só solta as teclas (fase 23: antes do Ctrl+C do atalho de seleção)
 *   MEDIA <op>              playpause | next | prev | mute | volup | voldown
 *   VOLGET                  responde `OK <0-100>|<True/False>`
 *   VOLSET <0-100>          define e desmuta       VOLMUTE <0|1>
 *   VOLSTEP <±n>            soma n pontos (subir desmuta), responde `OK <nível>`
 *
 * Resposta: `OK [valor]` ou `ERR <mensagem>`.
 */

import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { CORE_AUDIO_CS } from "../actions/coreAudio";
import { VK_ESTENDIDAS } from "./inputCanal";

const HOST_SCRIPT = `
$ErrorActionPreference = 'Stop'

# O Node lê este stdout como UTF-8. Sem forçar aqui, o PowerShell escreve no code page
# ANSI do console e mensagens de exceção do Windows em português chegam corrompidas
# ("N?o ? poss?vel converter...").
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NxInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  // dwData é DWORD no Win32, mas a roda usa valores negativos para rolar pra baixo.
  // Declarar como int deixa o marshalling cuidar do complemento de dois; com uint,
  // passar -120 estoura com "Valor era muito grande ou muito pequeno para UInt32".
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int data, UIntPtr extra);
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);

  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct INPUTUNION {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
  }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION u; }

  const uint INPUT_MOUSE       = 0;
  const uint INPUT_KEYBOARD    = 1;
  const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
  const uint KEYEVENTF_KEYUP   = 0x0002;
  const uint KEYEVENTF_UNICODE = 0x0004;
  const uint MOUSEEVENTF_MOVE  = 0x0001;
  const uint MOUSEEVENTF_WHEEL = 0x0800;
  const uint MOUSEEVENTF_HWHEEL = 0x1000;

  // Fase 22: por monitor (V2). Sem isto, numa tela a 150% o Windows escalava o movimento
  // e o cursor andava aos pulos.
  public static void Dpi() { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch {} }

  // Movimento relativo por SendInput (o mesmo caminho de um mouse de verdade), em vez de
  // ler a posição e reposicionar.
  public static void Move(int dx, int dy) {
    INPUT[] i = new INPUT[1];
    i[0].type = INPUT_MOUSE;
    i[0].u.mi = new MOUSEINPUT { dx = dx, dy = dy, mouseData = 0, dwFlags = MOUSEEVENTF_MOVE, time = 0, dwExtraInfo = IntPtr.Zero };
    SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
  }

  public static void Wheel(int n, bool horizontal) {
    INPUT[] i = new INPUT[1];
    i[0].type = INPUT_MOUSE;
    i[0].u.mi = new MOUSEINPUT { dx = 0, dy = 0, mouseData = unchecked((uint)n), dwFlags = horizontal ? MOUSEEVENTF_HWHEEL : MOUSEEVENTF_WHEEL, time = 0, dwExtraInfo = IntPtr.Zero };
    SendInput(1, i, Marshal.SizeOf(typeof(INPUT)));
  }

  // Fase 23: só solta (o atalho Ctrl+Shift+E ainda está com Shift e E apertados quando o
  // Ctrl+C sintético sai — sem soltar, o programa veria Ctrl+Shift+C).
  public static void Up(ushort[] vks) {
    INPUT[] i = new INPUT[vks.Length];
    for (int k = 0; k < vks.Length; k++) {
      i[k].type = INPUT_KEYBOARD;
      i[k].u.ki = new KEYBDINPUT { wVk = vks[k], wScan = 0, dwFlags = KEYEVENTF_KEYUP, time = 0, dwExtraInfo = IntPtr.Zero };
    }
    SendInput((uint)i.Length, i, Marshal.SizeOf(typeof(INPUT)));
  }

  // Combinação: aperta na ordem e solta ao contrário (Ctrl+Shift+Esc, Win+D).
  public static void Keys(ushort[] vks, ushort[] estendidas) {
    INPUT[] i = new INPUT[vks.Length * 2];
    for (int k = 0; k < vks.Length; k++) {
      uint ext = Array.IndexOf(estendidas, vks[k]) >= 0 ? KEYEVENTF_EXTENDEDKEY : 0;
      i[k].type = INPUT_KEYBOARD;
      i[k].u.ki = new KEYBDINPUT { wVk = vks[k], wScan = 0, dwFlags = ext, time = 0, dwExtraInfo = IntPtr.Zero };
      int j = vks.Length * 2 - 1 - k;
      i[j].type = INPUT_KEYBOARD;
      i[j].u.ki = new KEYBDINPUT { wVk = vks[k], wScan = 0, dwFlags = ext | KEYEVENTF_KEYUP, time = 0, dwExtraInfo = IntPtr.Zero };
    }
    SendInput((uint)i.Length, i, Marshal.SizeOf(typeof(INPUT)));
  }

  // Envia o codepoint literal via SendInput. SendKeys NAO serve aqui: ele traduz o
  // caractere para uma tecla virtual pelo layout ativo (VkKeyScan), e no ABNT
  // brasileiro acentos exigem dead keys que essa API nao consegue expressar --
  // "acao" virava "acao" com acentos trocados de lugar. Com KEYEVENTF_UNICODE o
  // caractere chega intacto, seja qual for o layout.
  public static void TypeUnicode(string text) {
    if (text.Length == 0) return;
    INPUT[] inputs = new INPUT[text.Length * 2];
    for (int i = 0; i < text.Length; i++) {
      inputs[i*2].type = INPUT_KEYBOARD;
      inputs[i*2].u.ki = new KEYBDINPUT { wVk = 0, wScan = text[i], dwFlags = KEYEVENTF_UNICODE, time = 0, dwExtraInfo = IntPtr.Zero };
      inputs[i*2+1].type = INPUT_KEYBOARD;
      inputs[i*2+1].u.ki = new KEYBDINPUT { wVk = 0, wScan = text[i], dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time = 0, dwExtraInfo = IntPtr.Zero };
    }
    SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@

[NxInput]::Dpi()
$ESTENDIDAS = [uint16[]]@(__ESTENDIDAS__)
$MEDIA = @{ playpause = 0xB3; next = 0xB0; prev = 0xB1; mute = 0xAD; volup = 0xAF; voldown = 0xAE }

# Volume pela Core Audio, compilado UMA vez aqui (o volumeControl.ts abria um PowerShell e
# recompilava a cada chamada). Se falhar, os comandos VOL* respondem ERR e quem chamou cai
# no caminho antigo.
$volOk = $true
try { Add-Type -TypeDefinition '__CORE_AUDIO__' -Language CSharp } catch { $volOk = $false }

$LEFTDOWN=0x02; $LEFTUP=0x04; $RIGHTDOWN=0x08; $RIGHTUP=0x10
$MIDDLEDOWN=0x20; $MIDDLEUP=0x40; $WHEEL=0x0800

function Get-Flags($button, $down) {
  switch ($button) {
    'left'   { if ($down) { $LEFTDOWN }   else { $LEFTUP } }
    'right'  { if ($down) { $RIGHTDOWN }  else { $RIGHTUP } }
    'middle' { if ($down) { $MIDDLEDOWN } else { $MIDDLEUP } }
    default  { throw "botao desconhecido: $button" }
  }
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $line = $line.Trim()
  if ($line -eq '') { continue }

  try {
    $parts = $line.Split(' ', 2)
    $cmd = $parts[0].ToUpperInvariant()
    $arg = if ($parts.Length -gt 1) { $parts[1] } else { '' }

    $saida = ''
    switch ($cmd) {
      'PING' { }

      'MOVE' {
        $d = $arg.Split(' ')
        [NxInput]::Move([int]$d[0], [int]$d[1])
      }

      'WHEEL'  { [NxInput]::Wheel([int]$arg, $false) }
      'HWHEEL' { [NxInput]::Wheel([int]$arg, $true) }

      'KEYS' {
        $vks = [uint16[]]($arg.Split(',') | ForEach-Object { [uint16]$_ })
        [NxInput]::Keys($vks, $ESTENDIDAS)
      }

      'UP' {
        $vks = [uint16[]]($arg.Split(',') | ForEach-Object { [uint16]$_ })
        [NxInput]::Up($vks)
      }

      'MEDIA' {
        $vk = $MEDIA[$arg.Trim().ToLowerInvariant()]
        if ($null -eq $vk) { throw "midia desconhecida: $arg" }
        [NxInput]::Keys([uint16[]]@($vk), $ESTENDIDAS)
      }

      'VOLGET' {
        if (-not $volOk) { throw 'core audio indisponivel' }
        $saida = '{0}|{1}' -f [int][Math]::Round([ElyVol]::Get() * 100), [ElyVol]::Muted()
      }
      'VOLSET' {
        if (-not $volOk) { throw 'core audio indisponivel' }
        [ElyVol]::Set([double]$arg / 100.0); [ElyVol]::Mute($false)
      }
      'VOLMUTE' {
        if (-not $volOk) { throw 'core audio indisponivel' }
        [ElyVol]::Mute($arg.Trim() -eq '1')
      }
      'VOLSTEP' {
        if (-not $volOk) { throw 'core audio indisponivel' }
        $n = [int]$arg
        [ElyVol]::Set([ElyVol]::Get() + $n / 100.0)
        if ($n -gt 0) { [ElyVol]::Mute($false) }
        $saida = [string][int][Math]::Round([ElyVol]::Get() * 100)
      }

      'CLICK' {
        $b = $arg.Trim().ToLowerInvariant()
        [NxInput]::mouse_event((Get-Flags $b $true),  0, 0, 0, [UIntPtr]::Zero)
        [NxInput]::mouse_event((Get-Flags $b $false), 0, 0, 0, [UIntPtr]::Zero)
      }

      'DOUBLE' {
        $b = $arg.Trim().ToLowerInvariant()
        for ($i = 0; $i -lt 2; $i++) {
          [NxInput]::mouse_event((Get-Flags $b $true),  0, 0, 0, [UIntPtr]::Zero)
          [NxInput]::mouse_event((Get-Flags $b $false), 0, 0, 0, [UIntPtr]::Zero)
        }
      }

      'DOWN' { [NxInput]::mouse_event((Get-Flags $arg.Trim().ToLowerInvariant() $true),  0, 0, 0, [UIntPtr]::Zero) }
      'UP'   { [NxInput]::mouse_event((Get-Flags $arg.Trim().ToLowerInvariant() $false), 0, 0, 0, [UIntPtr]::Zero) }

      'SCROLL' {
        # Uma "marca" de roda são 120 unidades; o app manda em marcas.
        [NxInput]::mouse_event($WHEEL, 0, 0, ([int]$arg * 120), [UIntPtr]::Zero)
      }

      'TYPE' {
        $text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($arg))
        [NxInput]::TypeUnicode($text)
      }

      # SendKeys continua sendo a ferramenta certa aqui: teclas especiais e combos
      # ({ENTER}, ^c, %{F4}) sao exatamente o que a sintaxe dele expressa bem.
      'KEY' {
        [System.Windows.Forms.SendKeys]::SendWait($arg)
      }

      default { throw "comando desconhecido: $cmd" }
    }

    if ($saida -ne '') { [Console]::Out.WriteLine("OK $saida") } else { [Console]::Out.WriteLine('OK') }
  } catch {
    [Console]::Out.WriteLine("ERR $($_.Exception.Message -replace '\\r?\\n', ' ')")
  }
  [Console]::Out.Flush()
}
`;

/** O script com o C# da Core Audio e as teclas estendidas encaixados. */
function scriptDoHost(): string {
  return HOST_SCRIPT
    .replace("__CORE_AUDIO__", () => CORE_AUDIO_CS)
    .replace("__ESTENDIDAS__", () => VK_ESTENDIDAS.join(","));
}

export type MouseButton = "left" | "right" | "middle";
export type MidiaDoHost = "playpause" | "next" | "prev" | "mute" | "volup" | "voldown";

class InputHost {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  /** Uma resposta por comando, na ordem — o host processa serialmente. */
  private pending: { resolve: (valor: string) => void; reject: (e: Error) => void }[] = [];
  private starting = false;

  private start(): void {
    if (this.proc || this.starting) return;
    this.starting = true;

    const encoded = Buffer.from(scriptDoHost(), "utf16le").toString("base64");
    const proc = spawn("powershell.exe", [
      "-ExecutionPolicy", "Bypass", "-NoProfile", "-NonInteractive",
      "-WindowStyle", "Hidden", "-EncodedCommand", encoded,
    ], { stdio: "pipe", windowsHide: true });

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => this.onData(chunk));

    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk: string) => {
      // PowerShell não-interativo prefixa o stderr com um cabeçalho CLIXML mesmo
      // quando nada deu errado; logar isso só polui o console.
      const text = chunk.trim();
      if (!text || text.startsWith("#< CLIXML")) return;
      console.error("[inputHost] stderr:", text);
    });

    const die = (reason: string) => {
      if (this.proc !== proc) return;
      console.error(`[inputHost] host encerrado (${reason}); será reiniciado no próximo comando`);
      this.proc = null;
      this.failAllPending(new Error("host de entrada caiu"));
    };

    proc.on("error", e => { die(String(e)); });
    proc.on("close", code => { die(`código ${code}`); });

    this.proc = proc;
    this.starting = false;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;

      const waiter = this.pending.shift();
      if (!waiter) continue; // resposta órfã (host reiniciou) — descarta

      if (line.startsWith("ERR")) waiter.reject(new Error(line.slice(3).trim() || "falha no host de entrada"));
      else waiter.resolve(line.slice(2).trim());
    }
  }

  private failAllPending(err: Error): void {
    const waiting = this.pending;
    this.pending = [];
    for (const w of waiting) w.reject(err);
  }

  private send(line: string): Promise<void> {
    return this.pedir(line).then(() => undefined);
  }

  /** Como `send`, mas devolve o que vem depois do `OK` (VOLGET, VOLSTEP). */
  private pedir(line: string): Promise<string> {
    this.start();
    const proc = this.proc;
    if (!proc) return Promise.reject(new Error("não foi possível iniciar o host de entrada"));

    return new Promise<string>((resolve, reject) => {
      // Sem timeout por comando: o host é serial e cada operação é sub-milissegundo.
      // Se ele travar, o `close` acima rejeita tudo que estiver pendente.
      // Segurança (23.2): uma linha = um comando. Texto com quebra de linha (de qualquer
      // chamador) viraria um segundo comando escondido; o TYPE já vai em base64.
      if (/[\r\n]/.test(line)) { reject(new Error("comando do host com quebra de linha")); return; }
      this.pending.push({ resolve, reject });
      proc.stdin.write(line + "\n", err => {
        if (err) {
          this.pending.pop();
          reject(err);
        }
      });
    });
  }

  move(dx: number, dy: number): Promise<void> {
    return this.send(`MOVE ${Math.round(dx)} ${Math.round(dy)}`);
  }
  click(button: MouseButton): Promise<void> {
    return this.send(`CLICK ${button}`);
  }
  doubleClick(button: MouseButton): Promise<void> {
    return this.send(`DOUBLE ${button}`);
  }
  buttonDown(button: MouseButton): Promise<void> {
    return this.send(`DOWN ${button}`);
  }
  buttonUp(button: MouseButton): Promise<void> {
    return this.send(`UP ${button}`);
  }
  scroll(notches: number): Promise<void> {
    return this.send(`SCROLL ${Math.round(notches)}`);
  }
  type(text: string): Promise<void> {
    return this.send(`TYPE ${Buffer.from(text, "utf8").toString("base64")}`);
  }
  key(sequence: string): Promise<void> {
    return this.send(`KEY ${sequence}`);
  }
  ping(): Promise<void> {
    return this.send("PING");
  }

  // ── fase 22 ──
  /** Roda vertical em 1/120 de marca (positivo = para cima). */
  wheel(unidades: number): Promise<void> {
    return this.send(`WHEEL ${Math.trunc(unidades)}`);
  }
  /** Roda horizontal em 1/120 de marca (positivo = para a direita). */
  hwheel(unidades: number): Promise<void> {
    return this.send(`HWHEEL ${Math.trunc(unidades)}`);
  }
  /** Combinação por tecla virtual (inclui a tecla Windows, que o SendKeys não faz). */
  keys(vks: number[]): Promise<void> {
    const lista = vks.filter(v => Number.isInteger(v) && v > 0 && v < 256);
    if (!lista.length) return Promise.reject(new Error("nenhuma tecla válida"));
    return this.send(`KEYS ${lista.join(",")}`);
  }
  /** Solta teclas (só keyup) — fase 23, atalho de seleção. */
  soltar(vks: number[]): Promise<void> {
    const lista = vks.filter(v => Number.isInteger(v) && v > 0 && v < 256);
    if (!lista.length) return Promise.resolve();
    return this.send(`UP ${lista.join(",")}`);
  }
  media(op: MidiaDoHost): Promise<void> {
    return this.send(`MEDIA ${op}`);
  }
  async volGet(): Promise<{ nivel: number; mudo: boolean }> {
    const [n, m] = (await this.pedir("VOLGET")).split("|");
    return { nivel: Math.max(0, Math.min(100, Number(n) || 0)), mudo: /true/i.test(m ?? "") };
  }
  volSet(nivel: number): Promise<void> {
    return this.send(`VOLSET ${Math.max(0, Math.min(100, Math.round(nivel)))}`);
  }
  volMute(mudo: boolean): Promise<void> {
    return this.send(`VOLMUTE ${mudo ? 1 : 0}`);
  }
  async volStep(pontos: number): Promise<number> {
    return Number(await this.pedir(`VOLSTEP ${Math.round(pontos)}`));
  }

  /** Encerra o host. Chamado no `before-quit` do app. */
  stop(): void {
    const proc = this.proc;
    this.proc = null;
    this.failAllPending(new Error("aplicativo encerrando"));
    try { proc?.stdin.end(); } catch { /* já morreu */ }
    try { proc?.kill(); } catch { /* já morreu */ }
  }
}

export const inputHost = new InputHost();
