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
 * Resposta: `OK` ou `ERR <mensagem>`.
 */

import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";

const HOST_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NxInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);

  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct INPUTUNION {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
  }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION u; }

  const uint INPUT_KEYBOARD    = 1;
  const uint KEYEVENTF_KEYUP   = 0x0002;
  const uint KEYEVENTF_UNICODE = 0x0004;

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

    switch ($cmd) {
      'PING' { }

      'MOVE' {
        $d = $arg.Split(' ')
        $p = New-Object NxInput+POINT
        [void][NxInput]::GetCursorPos([ref]$p)
        [void][NxInput]::SetCursorPos($p.X + [int]$d[0], $p.Y + [int]$d[1])
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

    [Console]::Out.WriteLine('OK')
  } catch {
    [Console]::Out.WriteLine("ERR $($_.Exception.Message -replace '\\r?\\n', ' ')")
  }
  [Console]::Out.Flush()
}
`;

export type MouseButton = "left" | "right" | "middle";

class InputHost {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  /** Uma resposta por comando, na ordem — o host processa serialmente. */
  private pending: { resolve: () => void; reject: (e: Error) => void }[] = [];
  private starting = false;

  private start(): void {
    if (this.proc || this.starting) return;
    this.starting = true;

    const encoded = Buffer.from(HOST_SCRIPT, "utf16le").toString("base64");
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
      else waiter.resolve();
    }
  }

  private failAllPending(err: Error): void {
    const waiting = this.pending;
    this.pending = [];
    for (const w of waiting) w.reject(err);
  }

  private send(line: string): Promise<void> {
    this.start();
    const proc = this.proc;
    if (!proc) return Promise.reject(new Error("não foi possível iniciar o host de entrada"));

    return new Promise<void>((resolve, reject) => {
      // Sem timeout por comando: o host é serial e cada operação é sub-milissegundo.
      // Se ele travar, o `close` acima rejeita tudo que estiver pendente.
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
