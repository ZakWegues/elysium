import { spawn } from "node:child_process";
import { inputHost, MidiaDoHost } from "../services/inputHost";

export type MediaOperation = "play" | "pause" | "skip" | "previous" | "volume_up" | "volume_down";

// Windows Virtual-Key codes for media keys
const VK: Record<MediaOperation, number> = {
  play:        0xB3, // VK_MEDIA_PLAY_PAUSE
  pause:       0xB3, // VK_MEDIA_PLAY_PAUSE (same physical key)
  skip:        0xB0, // VK_MEDIA_NEXT_TRACK
  previous:    0xB1, // VK_MEDIA_PREV_TRACK
  volume_up:   0xAF, // VK_VOLUME_UP
  volume_down: 0xAE, // VK_VOLUME_DOWN
};

const REPLY: Record<MediaOperation, string> = {
  play:        "música tocando.",
  pause:       "música pausada.",
  skip:        "próxima faixa.",
  previous:    "faixa anterior.",
  volume_up:   "volume aumentado.",
  volume_down: "volume diminuído.",
};

function pressVirtualKey(vk: number): Promise<void> {
  // P/Invoke keybd_event via Add-Type in a fresh PowerShell process.
  // Each spawn is isolated, so the type name collision doesn't apply.
  const vkHex = "0x" + vk.toString(16).toUpperCase();
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class NxMediaKey {
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, uint dwExtraInfo);
}
"@
[NxMediaKey]::keybd_event(${vkHex}, 0, 0, 0)
Start-Sleep -Milliseconds 30
[NxMediaKey]::keybd_event(${vkHex}, 0, 2, 0)
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");

  return new Promise<void>((resolve) => {
    const ps = spawn("powershell.exe", [
      "-ExecutionPolicy", "Bypass",
      "-WindowStyle", "Hidden",
      "-NonInteractive",
      "-EncodedCommand", encoded,
    ], { stdio: "pipe" });
    // 31/10: prazo — um PowerShell travado não pode ficar vivo para sempre.
    const prazo = setTimeout(() => { try { ps.kill(); } catch { /* já saiu */ } resolve(); }, 8000);
    ps.on("close", () => { clearTimeout(prazo); resolve(); });
    ps.on("error", () => { clearTimeout(prazo); resolve(); });
  });
}

/** Fase 22: a mesma tecla pelo host de entrada, que já está vivo (sem PowerShell novo). */
const NO_HOST: Record<MediaOperation, MidiaDoHost> = {
  play: "playpause", pause: "playpause", skip: "next", previous: "prev", volume_up: "volup", volume_down: "voldown",
};

export async function mediaControl(operation: MediaOperation): Promise<string> {
  const vk = VK[operation];
  if (vk === undefined) return `Operação de mídia desconhecida: ${operation}.`;
  try { await inputHost.media(NO_HOST[operation]); }
  catch { await pressVirtualKey(vk); }
  return `Ok, ${REPLY[operation]}`;
}
