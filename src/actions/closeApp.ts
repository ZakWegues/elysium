import { spawn } from "node:child_process";

// Maps common app names to their process names
const PROCESS_MAP: Record<string, string[]> = {
  chrome:         ["chrome"],
  discord:        ["Discord"],
  spotify:        ["Spotify"],
  steam:          ["steam"],
  "vs code":      ["Code"],
  vscode:         ["Code"],
  notepad:        ["notepad"],
  "bloco de notas": ["notepad"],
  vlc:            ["vlc"],
  obs:            ["obs64", "obs32", "obs"],
  roblox:         ["RobloxPlayerBeta", "RobloxPlayer"],
  whatsapp:       ["WhatsApp"],
  telegram:       ["Telegram"],
  edge:           ["msedge"],
  firefox:        ["firefox"],
  "google chrome": ["chrome"],
  bluestacks:     ["HD-Player"],
  epic:           ["EpicGamesLauncher"],
  "epic games":   ["EpicGamesLauncher"],
  notion:         ["Notion"],
  figma:          ["Figma"],
  slack:          ["slack"],
  zoom:           ["Zoom"],
  postman:        ["Postman"],
  "visual studio code": ["Code"],
  claude:         ["claude"],
  calculadora:    ["CalculatorApp", "calc"],
  calculator:     ["CalculatorApp", "calc"],
  "explorador de arquivos": ["explorer"],
};

export function deriveProcessNames(appName: string): string[] {
  const key = appName.toLowerCase().trim();
  if (PROCESS_MAP[key]) return PROCESS_MAP[key];
  for (const [k, v] of Object.entries(PROCESS_MAP)) {
    if (k.includes(key) || key.includes(k)) return v;
  }
  // Fallback: try appName directly and appName without spaces
  return [appName, appName.replace(/\s+/g, "")];
}

/**
 * "se o X estiver aberto, fecha" (fase 18): confere na lista de processos antes. Não aberto =
 * não faz nada e diz isso — antes o modelo fechava sem olhar ou olhava e não fechava.
 */
export async function closeAppIfOpen(appName: string, abertos: { name: string }[]): Promise<string> {
  const nomes = deriveProcessNames(appName).map(n => n.toLowerCase());
  const aberto = abertos.some(a => nomes.includes(a.name.toLowerCase()));
  if (!aberto) return `${appName} não está aberto — nada para fechar.`;
  return closeApp(appName);
}

export async function closeApp(appName: string): Promise<string> {
  const names = deriveProcessNames(appName);
  const safe = names.map(n => n.replace(/'/g, "''"));

  const psCmd =
    `$ErrorActionPreference='SilentlyContinue'; ` +
    safe.map(n => `Stop-Process -Name '${n}' -Force`).join("; ") +
    `; if ($?) { Write-Output 'ok' } else { Write-Output 'notfound' }`;

  return new Promise<string>((resolve) => {
    const ps = spawn("powershell.exe", [
      "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-NonInteractive",
      "-Command", psCmd,
    ], { stdio: "pipe" });
    ps.on("close", () => resolve(`${appName} fechado.`));
    ps.on("error", () => resolve(`Não consegui fechar ${appName}.`));
  });
}
