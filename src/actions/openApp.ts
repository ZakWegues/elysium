import { shell } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import { spawn } from "node:child_process";
import { appNotFoundError } from "../services/errors";
import { notify } from "../main/notify";

type AppMap = Record<string, string>;

let appsMap: AppMap | null = null;

function loadAppsMap(): AppMap {
  if (appsMap) return appsMap;
  try {
    appsMap = JSON.parse(fs.readFileSync(path.join(__dirname, "../config/apps.json"), "utf-8")) as AppMap;
  } catch {
    appsMap = {};
  }
  return appsMap;
}

export async function openApp(appName: string): Promise<string> {
  const map = loadAppsMap();
  const key = appName.toLowerCase().trim();

  const command = map[key] ?? findPartial(map, key) ?? null;

  try {
    await launch(command ?? appName);
    return `Abrindo ${appName}.`;
  } catch {
    throw appNotFoundError(appName);
  }
}

function findPartial(map: AppMap, key: string): string | null {
  for (const [k, v] of Object.entries(map)) {
    if (k.includes(key) || key.includes(k)) return v;
  }
  return null;
}

async function launch(command: string): Promise<void> {
  // URLs e protocol handlers com :// → shell.openExternal
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(command) || command.startsWith("https://") || command.startsWith("http://")) {
    await shell.openExternal(command);
    return;
  }

  // Protocolos tipo "spotify:" "ms-settings:" → shell.openExternal
  if (/^[a-z][a-z0-9+\-.]*:$/i.test(command)) {
    await shell.openExternal(command);
    return;
  }

  // Caminho absoluto para .exe → shell.openPath (Electron, tem foreground)
  if (path.isAbsolute(command)) {
    const err = await shell.openPath(command);
    if (err) throw new Error(err);
    return;
  }

  // Nome de app → resolve via PS, lança via shell do Electron (garante foreground)
  // PS só faz a busca; quem abre é o Electron.
  const appId = await resolveAppId(command);
  if (!appId) throw new Error(`App não encontrado: ${command}`);

  if (/^[A-Za-z]:\\/.test(appId)) {
    // AppID é caminho completo de exe
    const err = await shell.openPath(appId);
    if (err) throw new Error(err);
  } else {
    // UWP/Store/GUID → explorer.exe tem foreground rights nativos no Windows
    await launchViaExplorer(appId);
  }
}

function launchViaExplorer(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("explorer.exe", [`shell:AppsFolder\\${appId}`], {
      detached: true,
      stdio: "ignore",
    });
    proc.unref();
    // Explorer delegates to shell and exits fast; 4s timeout prevents state from hanging
    const timer = setTimeout(resolve, 4000);
    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
    proc.on("close", () => { clearTimeout(timer); resolve(); });
  });
}

/**
 * Usa PowerShell apenas para resolver o AppID/path de um app pelo nome.
 * Ordem: Get-StartApps → App Paths registry → Get-Command (PATH).
 * Retorna o AppID/path ou null se não encontrado.
 */
function resolveAppId(name: string): Promise<string | null> {
  const safe = name.replace(/'/g, "''");

  const psQuery =
    // O Node lê este stdout como UTF-8 e o PowerShell escreve em ANSI. Aqui o retorno é
    // um caminho de arquivo, então acento corrompido não só fica feio: quebra o
    // `shell.openPath` de qualquer programa instalado sob "Arquivos de Programas".
    `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ` +
    `$ErrorActionPreference='SilentlyContinue'; ` +
    // 1. Get-StartApps por nome (UWP, Store, Win32 registrados)
    `$a=Get-StartApps|Where-Object{$_.Name -like '*${safe}*'}|Select-Object -First 1; ` +
    `if($a){ Write-Output $a.AppID; exit 0 } ` +
    // 2. App Paths registry (apps instalados com .exe em HKCU/HKLM)
    `foreach($n in @('${safe}.exe','${safe}')){ ` +
      `foreach($h in @('HKCU:','HKLM:')){ ` +
        `$r=Get-ItemProperty "$h\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$n" -EA SilentlyContinue; ` +
        `if($r){ Write-Output $r.'(default)'; exit 0 } ` +
      `} ` +
    `} ` +
    // 3. Fallback: Get-Command (procura em PATH)
    `$cmd=Get-Command '${safe}' -EA SilentlyContinue; ` +
    `if($cmd -and $cmd.Source){ Write-Output $cmd.Source; exit 0 } ` +
    `exit 1`;

  return new Promise<string | null>((resolve) => {
    const ps = spawn(
      "powershell.exe",
      ["-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-NonInteractive", "-Command", psQuery],
      { stdio: "pipe" },
    );
    let out = "";
    ps.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    ps.on("close", (code) => {
      const appId = out.trim();
      resolve(code === 0 && appId ? appId : null);
    });
    ps.on("error", () => resolve(null));
  });
}
