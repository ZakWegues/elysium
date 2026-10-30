import { spawn } from "node:child_process";
import * as os from "node:os";

export type InfoQuery = "ram" | "cpu" | "battery" | "disk" | "hora" | "data" | "cpu_temperature" | string;

const QUERIES: Record<string, string> = {
  ram: [
    "$m = Get-CimInstance Win32_OperatingSystem",
    "$livre = [math]::Round($m.FreePhysicalMemory / 1MB, 1)",
    "$total = [math]::Round($m.TotalVisibleMemorySize / 1MB, 1)",
    "$uso = [math]::Round($total - $livre, 1)",
    "Write-Output \"RAM: $uso GB em uso de $total GB. $livre GB livres.\"",
  ].join("; "),

  cpu: [
    "$load = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average",
    "Write-Output \"Processador: $([math]::Round($load))% de uso.\"",
  ].join("; "),

  battery: [
    "$b = Get-WmiObject Win32_Battery",
    "if ($b) { $status = if ($b.BatteryStatus -eq 2) { 'carregando' } else { 'descarregando' }",
    "Write-Output \"Bateria em $($b.EstimatedChargeRemaining)%, $status.\" }",
    "else { Write-Output 'Nenhuma bateria detectada. Você está usando energia da tomada.' }",
  ].join("; "),

  disk: [
    "$d = Get-PSDrive -Name C",
    "$livre = [math]::Round($d.Free / 1GB, 1)",
    "$uso = [math]::Round($d.Used / 1GB, 1)",
    "$total = [math]::Round($livre + $uso, 1)",
    "Write-Output \"Disco C: $livre GB livres de $total GB. $uso GB em uso.\"",
  ].join("; "),

  hora: `Write-Output "São $(Get-Date -Format 'HH:mm')."`,

  data: `Write-Output "Hoje é $(Get-Date -Format 'dddd, dd/MM/yyyy')."`,

  cpu_temperature: `
$zones = Get-CimInstance -Namespace 'root/wmi' -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue
if ($zones) {
  $avgK = ($zones | Measure-Object CurrentTemperature -Average).Average
  $c = [math]::Round($avgK / 10 - 273.15, 1)
  Write-Output "Temperatura do processador: $c graus Celsius."
} else {
  Write-Output "Temperatura não disponível neste hardware."
}
`,
};

/**
 * O Node decodifica este stdout como UTF-8, mas o PowerShell escreve no code page ANSI
 * do console. Sem forçar, todo acento volta corrompido — "São 11:34" virava "S?o 11:34"
 * na fala e na tela.
 */
const FORCE_UTF8 = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n";

/**
 * 31/10: com prazo. O WMI às vezes trava, e sem prazo a promessa ficava pendurada para sempre —
 * a telemetria do celular e do dashboard parava sem erro e o PowerShell nunca morria.
 */
function runPs(script: string, prazoMs = 15_000): Promise<string> {
  const encoded = Buffer.from(FORCE_UTF8 + script, "utf16le").toString("base64");
  return new Promise<string>((resolve) => {
    const ps = spawn("powershell.exe", [
      "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
      "-NonInteractive", "-EncodedCommand", encoded,
    ], { stdio: "pipe" });

    let out = "";
    const prazo = setTimeout(() => { try { ps.kill(); } catch { /* já saiu */ } resolve("Não consegui obter essa informação."); }, prazoMs);
    ps.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    ps.on("close", () => { clearTimeout(prazo); resolve(out.trim() || "Não consegui obter essa informação."); });
    ps.on("error", () => { clearTimeout(prazo); resolve("Não consegui obter essa informação."); });
  });
}

export async function systemInfo(query: InfoQuery): Promise<string> {
  const key    = query.toLowerCase().trim();
  // Bloco 198: o `key` vem do modelo e ia para dentro de um Write-Output com aspas DUPLAS —
  // onde `$(…)` executa. Pedido desconhecido não chega mais ao PowerShell.
  const script = QUERIES[key];
  if (!script) return `Não sei como obter: ${key.slice(0, 40)}.`;
  return runPs(script);
}

// ── Raw telemetry (numbers, not prose) ───────────────────────────────────────

export interface SystemTelemetry {
  timestamp:       number;
  cpu_pct:         number;
  ram_pct:         number;
  battery_pct:     number | null;
  battery_charging: boolean;
}

// 24/10: CPU e RAM saem do Node (os), sem abrir PowerShell; só a bateria precisa do WMI, e ela
// muda devagar — fica em cache por 1 min. Antes eram 2 PowerShell a cada 5 s/30 s com o celular ligado.
let _cpuAntes = os.cpus().map((c) => c.times);
function cpuAgora(): number {
  const agora = os.cpus().map((c) => c.times);
  let ocupado = 0, total = 0;
  agora.forEach((t, i) => {
    const a = _cpuAntes[i] ?? t;
    const tot = (t.user + t.nice + t.sys + t.idle + t.irq) - (a.user + a.nice + a.sys + a.idle + a.irq);
    total += tot;
    ocupado += tot - (t.idle - a.idle);
  });
  _cpuAntes = agora;
  return total > 0 ? Math.round((ocupado / total) * 100) : 0;
}
const ramAgora = () => Math.round((1 - os.freemem() / os.totalmem()) * 1000) / 10;

/** CPU e RAM sem PowerShell: o laço de anomalias usa isto enquanto o dashboard está escondido. */
export function cpuERam(): { cpu_pct: number; ram_pct: number } {
  return { cpu_pct: cpuAgora(), ram_pct: ramAgora() };
}

const BATERIA_SCRIPT = `
$bat = Get-WmiObject Win32_Battery
$batPct   = if ($bat) { [int]$bat.EstimatedChargeRemaining } else { -1 }
$charging = if ($bat -and $bat.BatteryStatus -eq 2) { $true } else { $false }
@{ battery=$batPct; charging=$charging } | ConvertTo-Json -Compress
`;
let _bateria: { pct: number | null; carregando: boolean; em: number } | null = null;
let _lendoBateria: Promise<void> | null = null;
async function bateria(): Promise<{ pct: number | null; carregando: boolean }> {
  if (!_bateria || Date.now() - _bateria.em > 60_000) {
    _lendoBateria ??= runPs(BATERIA_SCRIPT).then((raw) => {
      try {
        const p = JSON.parse(raw) as { battery: number; charging: boolean };
        _bateria = { pct: p.battery === -1 ? null : (p.battery ?? null), carregando: p.charging ?? false, em: Date.now() };
      } catch { _bateria = { pct: null, carregando: false, em: Date.now() }; }
    }).finally(() => { _lendoBateria = null; });
    if (!_bateria) await _lendoBateria;
  }
  return { pct: _bateria?.pct ?? null, carregando: _bateria?.carregando ?? false };
}

export async function getSystemTelemetry(): Promise<SystemTelemetry> {
  const bat = await bateria();
  return {
    timestamp:        Date.now(),
    cpu_pct:          cpuAgora(),
    ram_pct:          ramAgora(),
    battery_pct:      bat.pct,
    battery_charging: bat.carregando,
  };
}

// ── Background monitor ────────────────────────────────────────────────────────

let _ramAlertedAt   = 0;
let _batAlertedAt   = 0;
const ALERT_COOLDOWN = 5 * 60 * 1_000; // re-alert at most every 5 min

export function startMonitor(alert: (title: string, msg: string) => void): void {
  const check = async () => {
    const ram = ramAgora();
    const bat = (await bateria()).pct ?? -1;
    const now = Date.now();

    if (ram > 92 && now - _ramAlertedAt > ALERT_COOLDOWN) {
      _ramAlertedAt = now;
      alert("ELYSIUM — RAM Alta", `Uso de RAM em ${ram.toFixed(1)}%. Considere fechar alguns programas.`);
    }

    if (bat !== -1 && bat < 20 && now - _batAlertedAt > ALERT_COOLDOWN) {
      _batAlertedAt = now;
      alert("ELYSIUM — Bateria Baixa", `Bateria em ${bat}%. Conecte o carregador.`);
    }
  };

  setInterval(() => { check().catch(() => { /* best effort */ }); }, 30_000).unref();
}

// ── Top Processes ─────────────────────────────────────────────────────────────

export interface ProcessEntry {
  name:     string;
  pid:      number;
  cpu:      number;
  ramMB:    number;
  isSystem: boolean;
}

const TOP_PROC_SCRIPT = `
try {
  $pathMap = @{}
  try { Get-Process | ForEach-Object { try { $pathMap[[string]$_.Id] = if ($_.Path) { $_.Path } else { '' } } catch {} } } catch {}
  $raw = Get-WmiObject Win32_PerfFormattedData_PerfProc_Process -ErrorAction Stop |
    Where-Object { $_.Name -notmatch '^_Total$|^Idle$' } |
    Sort-Object PercentProcessorTime -Descending |
    Select-Object -First 15
  $out = $raw | ForEach-Object {
    $p = $pathMap[[string]$_.IDProcess]
    $sys = (-not $p) -or $p -match '^C:\\\\Windows\\\\' -or $p -match 'WindowsApps'
    @{ name=$_.Name; pid=[int]$_.IDProcess; cpu=[int]$_.PercentProcessorTime; ramMB=[math]::Round($_.WorkingSet/1MB,1); isSystem=[bool]$sys }
  }
  ConvertTo-Json -Compress -InputObject @($out)
} catch {
  "[]"
}
`;

export async function getTopProcesses(): Promise<ProcessEntry[]> {
  const raw = await runPs(TOP_PROC_SCRIPT);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ProcessEntry[];
    return [];
  } catch { return []; }
}

// ── Programas com janela ─────────────────────────────────────────────────────

export interface RunningApp {
  /** Nome do executável sem `.exe` e sem o sufixo `#N` dos contadores de desempenho. */
  name:  string;
  pid:   number;
  title: string;
}

/**
 * O que está "aberto" no sentido em que uma pessoa usa a palavra: processo com janela
 * principal. `getTopProcesses` não serve para isso — devolve os 15 que mais consomem CPU,
 * e um Chrome ocioso fica de fora enquanto o `MsMpEng` entra. Era por isso que "Abertos
 * agora" no dashboard quase sempre dizia "nenhum" com meia dúzia de programas na tela.
 */
const RUNNING_APPS_SCRIPT = `
try {
  $out = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } |
    ForEach-Object { @{ name=$_.ProcessName; pid=[int]$_.Id; title=[string]$_.MainWindowTitle } }
  ConvertTo-Json -Compress -InputObject @($out)
} catch {
  "[]"
}
`;

export async function getRunningApps(): Promise<RunningApp[]> {
  const raw = await runPs(RUNNING_APPS_SCRIPT);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is RunningApp => p && typeof p.name === "string" && typeof p.pid === "number")
      .map(p => ({ ...p, name: p.name.replace(/#\d+$/, ""), title: String(p.title ?? "").slice(0, 120) }));
  } catch { return []; }
}

// ── Disk Details ──────────────────────────────────────────────────────────────

export interface DiskEntry {
  name:    string;
  freeGB:  number;
  totalGB: number;
  usedPct: number;
}

const DISK_SCRIPT = `
$drives = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null -and ($_.Free + $_.Used) -gt 0 }
$out = $drives | ForEach-Object {
  $total = $_.Free + $_.Used
  @{
    name    = $_.Name
    freeGB  = [math]::Round($_.Free  / 1GB, 1)
    totalGB = [math]::Round($total   / 1GB, 1)
    usedPct = [math]::Round($_.Used  / $total * 100, 1)
  }
}
ConvertTo-Json -Compress -InputObject @($out)
`;

export async function getDiskDetails(): Promise<DiskEntry[]> {
  const raw = await runPs(DISK_SCRIPT);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as DiskEntry[];
    return [];
  } catch { return []; }
}

// ── Dashboard Telemetry (single PS call, everything at once) ──────────────────

export interface DashboardTelemetry extends SystemTelemetry {
  cpu_temp:  number | null;
  disks:     DiskEntry[];
  processes: ProcessEntry[];
  /** Segundos desde o último boot — a aba PC mostra "ligado há 3 h". */
  uptime_sec: number;
  /** RAM total e em uso, em GB; o percentual sozinho não diz quanto sobra. */
  ram_total_gb: number;
  ram_used_gb:  number;
}

const DASH_TELEMETRY_SCRIPT = `
$mem    = Get-CimInstance Win32_OperatingSystem
$ramPct = [math]::Round(($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / $mem.TotalVisibleMemorySize * 100, 1)
$ramTot = [math]::Round($mem.TotalVisibleMemorySize / 1MB, 1)
$ramUsd = [math]::Round(($mem.TotalVisibleMemorySize - $mem.FreePhysicalMemory) / 1MB, 1)
$uptime = [int]((Get-Date) - $mem.LastBootUpTime).TotalSeconds
$cpu    = [int](Get-WmiObject Win32_Processor | Measure-Object LoadPercentage -Average).Average
$bat    = Get-WmiObject Win32_Battery
$batPct     = if ($bat) { [int]$bat.EstimatedChargeRemaining } else { -1 }
$charging   = if ($bat -and $bat.BatteryStatus -eq 2) { $true } else { $false }

$tempC = $null
try {
  $zones = Get-CimInstance -Namespace 'root/wmi' -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop
  if ($zones) { $tempC = [math]::Round(($zones | Measure-Object CurrentTemperature -Average).Average / 10 - 273.15, 1) }
} catch {}

$drives = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null -and ($_.Free + $_.Used) -gt 0 }
$disks  = @($drives | ForEach-Object {
  $t = $_.Free + $_.Used
  @{ name=$_.Name; freeGB=[math]::Round($_.Free/1GB,1); totalGB=[math]::Round($t/1GB,1); usedPct=[math]::Round($_.Used/$t*100,1) }
})

$procs = @()
try {
  $perf = Get-WmiObject Win32_PerfFormattedData_PerfProc_Process -ErrorAction Stop |
    Where-Object { $_.Name -notmatch '^_Total$|^Idle$' } |
    Sort-Object PercentProcessorTime -Descending |
    Select-Object -First 15
  if ($perf) {
    $procs = @($perf | ForEach-Object {
      @{ name=$_.Name; pid=[int]$_.IDProcess; cpu=[int]$_.PercentProcessorTime; ramMB=[math]::Round($_.WorkingSet/1MB,1); isSystem=$false }
    })
  }
} catch {}
if ($procs.Count -eq 0) {
  try {
    $procs = @(Get-Process | Where-Object { $_.Id -ne 0 } |
      Sort-Object WorkingSet -Descending | Select-Object -First 15 |
      ForEach-Object { @{ name=$_.Name; pid=[int]$_.Id; cpu=0; ramMB=[math]::Round($_.WorkingSet/1MB,1); isSystem=$false } })
  } catch {}
}

@{
  cpu=$cpu; ram=$ramPct; battery=$batPct; charging=$charging; temp=$tempC
  disks=$disks; processes=$procs; uptime=$uptime; ramTotal=$ramTot; ramUsed=$ramUsd
} | ConvertTo-Json -Compress -Depth 4
`;

export async function getDashboardTelemetry(): Promise<DashboardTelemetry> {
  const raw = await runPs(DASH_TELEMETRY_SCRIPT);
  const fallback: DashboardTelemetry = {
    timestamp: Date.now(), cpu_pct: 0, ram_pct: 0,
    battery_pct: null, battery_charging: false,
    cpu_temp: null, disks: [], processes: [],
    uptime_sec: 0, ram_total_gb: 0, ram_used_gb: 0,
  };
  try {
    const p = JSON.parse(raw) as {
      cpu: number; ram: number; battery: number; charging: boolean;
      temp: number | null; disks: DiskEntry[]; processes: ProcessEntry[];
      uptime?: number; ramTotal?: number; ramUsed?: number;
    };
    return {
      timestamp:        Date.now(),
      cpu_pct:          p.cpu      ?? 0,
      ram_pct:          p.ram      ?? 0,
      battery_pct:      p.battery === -1 ? null : (p.battery ?? null),
      battery_charging: p.charging ?? false,
      cpu_temp:         p.temp     ?? null,
      disks:            Array.isArray(p.disks)     ? p.disks     : [],
      processes:        Array.isArray(p.processes) ? p.processes : [],
      uptime_sec:       p.uptime   ?? 0,
      ram_total_gb:     p.ramTotal ?? 0,
      ram_used_gb:      p.ramUsed  ?? 0,
    };
  } catch { return fallback; }
}

// ── Kill process ──────────────────────────────────────────────────────────────

/** 31/10: processos do Windows que, se mortos, derrubam a sessão (mesma lista do closeApp). */
const PROCESSOS_DO_SISTEMA = ["csrss", "winlogon", "wininit", "lsass", "services", "smss", "svchost", "dwm", "system", "registry", "fontdrvhost", "explorer"];

export async function killProcess(pid: number): Promise<void> {
  // Só número inteiro positivo chega ao script (o RPC já confere; aqui é a última porta).
  if (!Number.isInteger(pid) || pid <= 4) throw new Error("pid inválido");
  const nome = (await runPs(`(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName`, 8000)).trim().toLowerCase();
  if (PROCESSOS_DO_SISTEMA.includes(nome)) throw new Error(`"${nome}" é do Windows — fechar derrubaria a sessão.`);
  const script = `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`;
  await runPs(script);
}
