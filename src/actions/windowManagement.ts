import { nomeDeProcessoValido, rodarPs } from "./ps";

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

/** O nome do processo que o filtro usa. Pura. */
export function processoAlvo(targetApp: string): string {
  const lower = targetApp.toLowerCase().trim();
  return PROCESS_MAP[lower] ?? lower.replace(/\s+/g, "");
}

/**
 * O script NÃO leva o nome: ele vem em `$env:NX_PROC` (bloco 198). Antes o nome entrava cru no
 * `-like '*…*'` — sem escape nenhum —, e um nome com aspas vindo do modelo virava comando.
 */
export function buildScript(operation: WinOperation): string {

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
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like ('*' + $env:NX_PROC + '*') -and $_.MainWindowHandle -ne 0 }
$proc = $procs | Select-Object -First 1
if ($proc) {
    [NxWindow]::ShowWindowAsync($proc.MainWindowHandle, ${SW_MAXIMIZE}) | Out-Null
    [NxWindow]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    Write-Output "ok"
} else { Write-Output "notfound" }
`;

    case "minimize":
      return `${type_defs}
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like ('*' + $env:NX_PROC + '*') -and $_.MainWindowHandle -ne 0 }
$proc = $procs | Select-Object -First 1
if ($proc) {
    [NxWindow]::ShowWindowAsync($proc.MainWindowHandle, ${SW_MINIMIZE}) | Out-Null
    Write-Output "ok"
} else { Write-Output "notfound" }
`;

    case "focus":
      return `${type_defs}
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like ('*' + $env:NX_PROC + '*') -and $_.MainWindowHandle -ne 0 }
$proc = $procs | Select-Object -First 1
if ($proc) {
    [NxWindow]::ShowWindowAsync($proc.MainWindowHandle, ${SW_RESTORE}) | Out-Null
    [NxWindow]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    Write-Output "ok"
} else { Write-Output "notfound" }
`;

    case "close":
      return `${type_defs}
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like ('*' + $env:NX_PROC + '*') -and $_.MainWindowHandle -ne 0 }
$proc = $procs | Select-Object -First 1
if ($proc) {
    [NxWindow]::PostMessage($proc.MainWindowHandle, [NxWindow]::WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    Write-Output "ok"
} else { Write-Output "notfound" }
`;
  }
}

async function runScript(script: string, procName: string): Promise<string> {
  const r = await rodarPs(script, { NX_PROC: procName }, { timeoutMs: 15_000 });
  return r.codigo === 0 ? r.saida : "error";
}

const OP_LABELS: Record<WinOperation, [string, string]> = {
  maximize: ["maximizei", "maximizada"],
  minimize: ["minimizei", "minimizada"],
  focus:    ["trouxe para frente", "em foco"],
  close:    ["fechei", "fechada"],
};

export async function windowManagement(targetApp: string, operation: WinOperation): Promise<string> {
  const procName = processoAlvo(targetApp);
  if (!nomeDeProcessoValido(procName)) return `Não reconheci "${targetApp}" como programa.`;
  const result = await runScript(buildScript(operation), procName);

  if (result === "ok") {
    const [verb] = OP_LABELS[operation];
    return `Ok, ${verb} a janela do ${targetApp}.`;
  }
  if (result === "notfound") {
    return `Não encontrei nenhuma janela aberta do ${targetApp}.`;
  }
  return `Não consegui manipular a janela do ${targetApp}.`;
}
