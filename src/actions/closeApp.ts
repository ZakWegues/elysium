import { nomeDeProcessoValido, rodarPs } from "./ps";

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

/** Segurança (23.2): processos do sistema que nunca são mortos por nome (o Windows cai junto). */
const PROTEGIDOS = new Set(["explorer", "csrss", "winlogon", "wininit", "lsass", "services", "smss", "svchost", "dwm", "system", "registry", "fontdrvhost", "elysium", "electron"]);
const livre = (nomes: string[]) => nomes.filter(n => !PROTEGIDOS.has(n.toLowerCase().replace(/\.exe$/, "")));

export function deriveProcessNames(appName: string): string[] {
  const key = appName.toLowerCase().trim();
  if (PROCESS_MAP[key]) return livre(PROCESS_MAP[key]);
  // Parcial só com 3+ letras: "o" casava com "discord" e matava o programa errado.
  if (key.length >= 3) for (const [k, v] of Object.entries(PROCESS_MAP)) {
    if (k.includes(key) || key.includes(k)) return livre(v);
  }
  if (!livre([key, key.replace(/\s+/g, "")]).length) return [];
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
  // Bloco 198: os nomes vão em $env:NX_NOMES (separados por "|"), nunca no texto do script —
  // o escape antigo (`''`) deixava passar as aspas curvas ‘ ’, que o PowerShell também aceita.
  const names = deriveProcessNames(appName).filter(nomeDeProcessoValido);
  if (!names.length) return `Não reconheci "${appName}" como programa.`;
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "foreach ($n in ($env:NX_NOMES -split '\|')) { Stop-Process -Name $n -Force }",
  ].join("\n");
  const r = await rodarPs(script, { NX_NOMES: names.join("|") }, { timeoutMs: 15_000 });
  return r.codigo === -1 ? `Não consegui fechar ${appName}.` : `${appName} fechado.`;
}
