import { shell } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import { spawn } from "node:child_process";
import { rodarPs } from "./ps";
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

/**
 * Nome que veio de fora (modelo, RPC) e NÃO está no `apps.json`: só nome de programa
 * (bloco 199). Caminho absoluto, `file:`, `search-ms:`, `ms-…:` e qualquer `x:` saíam direto
 * para `openPath`/`openExternal` — o modelo, enganado por uma página, podia rodar um `.exe`
 * baixado. Os comandos do `apps.json` são do projeto e continuam valendo como estão. Pura.
 */
export function nomeDeProgramaAceito(nome: string): boolean {
  const n = nome.trim();
  if (!n || n.length > 80) return false;
  if (/[\\/:*?"<>|]/.test(n) || /^\.|\.\./.test(n)) return false;
  return /^[\p{L}\p{N} ._&+()-]+$/u.test(n);
}

export async function openApp(appName: string): Promise<string> {
  const map = loadAppsMap();
  const key = appName.toLowerCase().trim();

  const command = map[key] ?? findPartial(map, key) ?? null;
  if (!command && !nomeDeProgramaAceito(appName)) {
    return `Não abro "${appName}": só programas pelo nome (caminhos e links ficam de fora por segurança).`;
  }

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
async function resolveAppId(name: string): Promise<string | null> {
  // O nome vai em $env:NX_NOME (bloco 198): antes era `'…${safe}…'` com o `''` de escape,
  // que as aspas curvas ‘ ’ furavam.
  const psQuery = [
    "$ErrorActionPreference='SilentlyContinue'",
    "$n = $env:NX_NOME",
    // 1. Get-StartApps por nome (UWP, Store, Win32 registrados)
    "$a = Get-StartApps | Where-Object { $_.Name -like ('*' + $n + '*') } | Select-Object -First 1",
    "if ($a) { Write-Output $a.AppID; exit 0 }",
    // 2. App Paths registry (apps instalados com .exe em HKCU/HKLM)
    "foreach ($x in @(($n + '.exe'), $n)) { foreach ($h in @('HKCU:','HKLM:')) {",
    "  $r = Get-ItemProperty -LiteralPath ($h + '\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\' + $x) -EA SilentlyContinue",
    "  if ($r) { Write-Output $r.'(default)'; exit 0 } } }",
    // 3. Get-Command (PATH), só aplicativo — nunca script ou função do PowerShell.
    "$cmd = Get-Command -Name $n -CommandType Application -EA SilentlyContinue | Select-Object -First 1",
    "if ($cmd -and $cmd.Source) { Write-Output $cmd.Source; exit 0 }",
    "exit 1",
  ].join("\n");
  const r = await rodarPs(psQuery, { NX_NOME: name }, { timeoutMs: 20_000 });
  const appId = r.saida.split(/\r?\n/)[0]?.trim() ?? "";
  return r.codigo === 0 && appId ? appId : null;
}
