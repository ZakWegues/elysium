import { spawn } from "node:child_process";

export type VolumeLevel = number | "up" | "down" | "mute" | "unmute";

import { CORE_AUDIO_CS } from "./coreAudio";
import { inputHost } from "../services/inputHost";

/** Roda o script com o tipo carregado e devolve o stdout (UTF-8, regra da §14). */
function rodarPs(corpo: string): Promise<string> {
  const script =
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; " +
    `Add-Type -TypeDefinition '${CORE_AUDIO_CS}' -Language CSharp -ErrorAction SilentlyContinue; ` +
    corpo;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolve, reject) => {
    const ps = spawn("powershell.exe", ["-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-NonInteractive", "-EncodedCommand", encoded], { stdio: "pipe" });
    let out = "", err = "";
    ps.stdout.on("data", (d: Buffer) => { out += d.toString("utf8"); });
    ps.stderr.on("data", (d: Buffer) => { err += d.toString("utf8"); });
    ps.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `powershell saiu com ${code}`))));
    ps.on("error", reject);
  });
}

export interface EstadoDoVolume { nivel: number; mudo: boolean }

/** Volume do dispositivo de saída padrão: 0–100 e se está mudo. */
export async function lerVolume(): Promise<EstadoDoVolume> {
  // Fase 22: pelo host de entrada (Core Audio já compilado, resposta em milissegundos);
  // se ele falhar, o caminho antigo de um PowerShell avulso.
  try { return await inputHost.volGet(); } catch { /* cai no avulso */ }
  const out = await rodarPs("$v=[ElyVol]::Get(); $m=[ElyVol]::Muted(); Write-Output ('{0}|{1}' -f [int][Math]::Round($v*100), $m)");
  const [n, m] = out.split(/\r?\n/).pop()!.split("|");
  return { nivel: Math.max(0, Math.min(100, Number(n) || 0)), mudo: /true/i.test(m ?? "") };
}

/** Passo de "aumenta"/"diminui" sem número: 10 pontos, como as teclas de mídia em dobro. */
const PASSO = 10;

/** Fase 22: o mesmo pedido pelo host de entrada. `null` = o host não deu conta (usa o avulso). */
async function volumePeloHost(level: VolumeLevel): Promise<string | null> {
  try {
    if (level === "mute") { await inputHost.volMute(true); return "Áudio mutado."; }
    if (level === "unmute") { await inputHost.volMute(false); return "Som reativado."; }
    if (level === "up" || level === "down") {
      const n = await inputHost.volStep(level === "up" ? PASSO : -PASSO);
      return Number.isFinite(n) ? `Volume em ${n}%.` : (level === "up" ? "Volume aumentado." : "Volume diminuído.");
    }
    const pct = Math.max(0, Math.min(100, Math.round(level)));
    await inputHost.volSet(pct);
    return `Volume em ${pct}%.`;
  } catch {
    return null;
  }
}

export async function volumeControl(level: VolumeLevel): Promise<string> {
  const rapido = await volumePeloHost(level);
  if (rapido) return rapido;
  try {
    if (level === "mute") { await rodarPs("[ElyVol]::Mute($true)"); return "Áudio mutado."; }
    if (level === "unmute") { await rodarPs("[ElyVol]::Mute($false)"); return "Som reativado."; }
    if (level === "up" || level === "down") {
      const sinal = level === "up" ? 1 : -1;
      // Subir com o som mudo desmuta: é o que a tecla física faz, e o que se espera.
      const out = await rodarPs(
        `$v=[ElyVol]::Get() + (${sinal * PASSO}/100.0); [ElyVol]::Set($v); ` +
        (level === "up" ? "[ElyVol]::Mute($false); " : "") +
        "Write-Output ([int][Math]::Round([ElyVol]::Get()*100))",
      );
      const n = Number(out.split(/\r?\n/).pop());
      return Number.isFinite(n) ? `Volume em ${n}%.` : (level === "up" ? "Volume aumentado." : "Volume diminuído.");
    }
    const pct = Math.max(0, Math.min(100, Math.round(level)));
    await rodarPs(`[ElyVol]::Set(${(pct / 100).toFixed(4)}); [ElyVol]::Mute($false)`);
    return `Volume em ${pct}%.`;
  } catch (e) {
    // Sem dispositivo de saída (fone desconectado no meio) ou COM indisponível: as teclas de
    // mídia ainda funcionam, então é o plano B em vez de um erro na cara.
    console.warn("[volume] Core Audio falhou, usando teclas de mídia:", (e as Error).message);
    const tecla = level === "mute" || level === "unmute" ? 173 : level === "down" ? 174 : 175;
    const vezes = typeof level === "number" ? 0 : level === "mute" || level === "unmute" ? 1 : 5;
    if (vezes) await rodarPs(`$s=New-Object -ComObject WScript.Shell; 1..${vezes}|ForEach-Object{$s.SendKeys([char]${tecla})}`).catch(() => {});
    return typeof level === "number" ? "Não consegui ajustar o volume agora." : "Feito.";
  }
}
