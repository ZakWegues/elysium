import { spawn } from "node:child_process";

export type WinOperation = "maximize" | "minimize" | "focus" | "close";

// Map common spoken names to Windows process names
const PROCESS_MAP: Record<string, string> = {
  "chrome":          "chrome",
  "google chrome":   "chrome",
  "firefox":         "firefox",
  "edge":            "msedge",
  "microsoft edge":  "msedge",
  "discord":         "discord",
  "spotify":         "spotify",
  "vs code":         "code",
  "vscode":          "code",
  "visual studio code": "code",
  "steam":           "steam",
  "obs":             "obs64",
  "notepad":         "notepad",
  "bloco de notas":  "notepad",
  "explorer":        "explorer",
  "explorador":      "explorer",
  "calculadora":     "calculatorapp",
  "calc":            "calculator",
  "word":            "winword",
  "excel":           "excel",
  "powerpoint":      "powerpnt",
  "teams":           "teams",
  "slack":           "slack",
  "telegram":        "telegram",
  "whatsapp":        "whatsapp",
  "vlc":             "vlc",
  "taskmgr":         "taskmgr",
  "gerenciador de tarefas": "taskmgr",
};

// SW_ constants passed to ShowWindowAsync
const SW_MINIMIZE  = 6;
const SW_MAXIMIZE  = 3;
const SW_RESTORE   = 9;

function buildScript(targetApp: string, operation: WinOperation): string {
  const lower = targetApp.toLowerCase().trim();
  const procName = PROCESS_MAP[lower] ?? lower.replace(/\s+/g, "");

  const type_defs = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class NxWindow {
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    public const uint WM_CLOSE = 0x0010;
}
"@
`;

  switch (operation) {
    case "maximize":
      return `${type_defs}
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '*${procName}*' -and $_.MainWindowHandle -ne 0 }
$proc = $procs | Select-Object -First 1
if ($proc) {
    [NxWindow]::ShowWindowAsync($proc.MainWindowHandle, ${SW_MAXIMIZE}) | Out-Null
    [NxWindow]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    Write-Output "ok"
} else { Write-Output "notfound" }
`;

    case "minimize":
      return `${type_defs}
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '*${procName}*' -and $_.MainWindowHandle -ne 0 }
$proc = $procs | Select-Object -First 1
if ($proc) {
    [NxWindow]::ShowWindowAsync($proc.MainWindowHandle, ${SW_MINIMIZE}) | Out-Null
    Write-Output "ok"
} else { Write-Output "notfound" }
`;

    case "focus":
      return `${type_defs}
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '*${procName}*' -and $_.MainWindowHandle -ne 0 }
$proc = $procs | Select-Object -First 1
if ($proc) {
    [NxWindow]::ShowWindowAsync($proc.MainWindowHandle, ${SW_RESTORE}) | Out-Null
    [NxWindow]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    Write-Output "ok"
} else { Write-Output "notfound" }
`;

    case "close":
      return `${type_defs}
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '*${procName}*' -and $_.MainWindowHandle -ne 0 }
$proc = $procs | Select-Object -First 1
if ($proc) {
    [NxWindow]::PostMessage($proc.MainWindowHandle, [NxWindow]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    Write-Output "ok"
} else { Write-Output "notfound" }
`;
  }
}

function runScript(script: string): Promise<string> {
  // O Node lê este stdout como UTF-8 e o PowerShell escreve em ANSI; sem forçar, todo
  // acento na resposta volta corrompido.
  const encoded = Buffer.from(
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n" + script,
    "utf16le",
  ).toString("base64");
  return new Promise<string>((resolve) => {
    const ps = spawn("powershell.exe", [
      "-ExecutionPolicy", "Bypass",
      "-WindowStyle", "Hidden",
      "-NonInteractive",
      "-EncodedCommand", encoded,
    ], { stdio: "pipe" });
    let out = "";
    ps.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    ps.on("close", () => resolve(out.trim()));
    ps.on("error", () => resolve("error"));
  });
}

const OP_LABELS: Record<WinOperation, [string, string]> = {
  maximize: ["maximizei", "maximizada"],
  minimize: ["minimizei", "minimizada"],
  focus:    ["trouxe para frente", "em foco"],
  close:    ["fechei", "fechada"],
};

export async function windowManagement(targetApp: string, operation: WinOperation): Promise<string> {
  const script = buildScript(targetApp, operation);
  const result = await runScript(script);

  if (result === "ok") {
    const [verb] = OP_LABELS[operation];
    return `Ok, ${verb} a janela do ${targetApp}.`;
  }
  if (result === "notfound") {
    return `Não encontrei nenhuma janela aberta do ${targetApp}.`;
  }
  return `Não consegui manipular a janela do ${targetApp}.`;
}
