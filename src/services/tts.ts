import { MsEdgeTTS, OUTPUT_FORMAT, ProsodyOptions } from "msedge-tts";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn, ChildProcess } from "node:child_process";

const VOICE = "pt-BR-AntonioNeural";
const TTS_TIMEOUT_MS = 30_000;

// Rate/pitch levemente reduzidos: soa menos apressado e menos robótico
// que o padrão (rate 1.0 / pitch +0Hz) do msedge-tts.
const PROSODY: ProsodyOptions = { rate: "-8%", pitch: "-3%", volume: "+0%" };

let _tts: MsEdgeTTS | null = null;
let _cancelFn: (() => void) | null = null;

export function cancelSpeak(): void {
  if (_cancelFn) { _cancelFn(); _cancelFn = null; }
}

/**
 * Strip URLs, file paths, code blocks, emojis, and markdown syntax
 * from text before TTS. Display side (chat) always receives the raw text.
 */
export function cleanTextForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, "trecho de código")
    .replace(/`[^`\n]+`/g, "código")
    .replace(/https?:\/\/[^\s)>\]"']+/gi, "o link")
    .replace(/[A-Za-z]:\\[^\s,;'"<>|]+/g, "o caminho")
    .replace(/#{1,6}\s?/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{1F300}-\u{1F9FF}]|[\u{FE00}-\u{FEFF}]/gu, "")
    .replace(/[!?.]{3,}/g, ".")
    .replace(/[-=_*~]{3,}/g, "")
    .replace(/^[-*+>]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 2000);
}

export async function synthesize(text: string): Promise<void> {
  if (!text?.trim()) return;
  const clean = cleanTextForSpeech(text);
  if (!clean) return;

  return new Promise<void>((resolve) => {
    let settled = false;
    let ps: ChildProcess | null = null;
    let tmpFile = "";

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(globalTimer);
      _cancelFn = null;
      resolve();
    };

    _cancelFn = () => {
      if (settled) return;
      settled = true;
      clearTimeout(globalTimer);
      ps?.kill();
      if (tmpFile) fs.unlink(tmpFile, () => {});
      _cancelFn = null;
      resolve();
    };

    const globalTimer = setTimeout(() => { if (!settled) _cancelFn?.(); }, TTS_TIMEOUT_MS);

    // ── Fallback: síntese 100% offline via SAPI do Windows (System.Speech).
    // Usado quando o msedge-tts falha (rede, token expirado, etc) — nunca
    // deixa o app completamente mudo.
    function speakOffline() {
      if (settled) return;
      const safe = clean.replace(/'/g, "''");
      const psScript = [
        "Add-Type -AssemblyName System.Speech",
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
        "try {",
        "  $voices = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'pt*' }",
        "  $v = ($voices | Where-Object { $_.VoiceInfo.Gender -eq 'Male' } | Select-Object -First 1)",
        "  if (-not $v) { $v = $voices | Select-Object -First 1 }",
        "  if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }",
        "} catch {}",
        `$s.Speak('${safe}')`,
      ].join("\n");
      const encoded = Buffer.from(psScript, "utf16le").toString("base64");

      ps = spawn("powershell.exe", [
        "-ExecutionPolicy", "Bypass", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encoded,
      ], { stdio: "pipe" });

      let stderr = "";
      ps.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
      ps.on("close", (code) => {
        if (code !== 0) console.error(`[TTS] fallback SAPI saiu com código ${code}: ${stderr.trim()}`);
        finish();
      });
      ps.on("error", (err) => {
        console.error("[TTS] falha ao spawnar powershell (fallback SAPI):", err);
        finish();
      });
    }

    (async () => {
      try {
        if (!_tts) _tts = new MsEdgeTTS();

        // Use MP3 — only format reliably supported by msedge-tts v1.3.4
        await _tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const audioStream = _tts.toStream(clean, PROSODY);

        const chunks: Buffer[] = [];
        audioStream.on("data", (c: Buffer) => { if (!settled) chunks.push(c); });

        await new Promise<void>((res, rej) => {
          audioStream.on("end", res);
          audioStream.on("error", rej);
        });

        if (settled) return;

        const mp3 = Buffer.concat(chunks);
        if (!mp3.length) {
          console.error("[TTS] stream neural retornou 0 bytes — usando fallback offline");
          speakOffline();
          return;
        }

        tmpFile = path.join(os.tmpdir(), `nx_tts_${Date.now()}.mp3`);
        fs.writeFileSync(tmpFile, mp3);

        // MCI (winmm.dll): "play alias wait" blocks until playback completes.
        // Works on Win10/11 for MP3 without any external codec.
        // PS single-quoted string: only ' needs escaping (as ''); backslashes are literal.
        const safePath = tmpFile.replace(/'/g, "''");
        const psScript = [
          "Add-Type @\"",
          "using System;using System.Text;using System.Runtime.InteropServices;",
          "public class NxMci {",
          "    [DllImport(\"winmm.dll\",CharSet=CharSet.Auto)]",
          "    public static extern int mciSendString(string cmd,StringBuilder sb,int sz,IntPtr h);",
          "}",
          "\"@",
          `$f='${safePath}'`,
          "[NxMci]::mciSendString('open \"'+$f+'\" alias nx_s',$null,0,[IntPtr]::Zero)|Out-Null",
          "[NxMci]::mciSendString('play nx_s wait',$null,0,[IntPtr]::Zero)|Out-Null",
          "[NxMci]::mciSendString('close nx_s',$null,0,[IntPtr]::Zero)|Out-Null",
          "Remove-Item $f -Force -EA 0",
        ].join("\n");

        const encoded = Buffer.from(psScript, "utf16le").toString("base64");

        ps = spawn("powershell.exe", [
          "-ExecutionPolicy", "Bypass", "-NonInteractive",
          "-WindowStyle", "Hidden", "-EncodedCommand", encoded,
        ], { stdio: "pipe" });

        let stderr = "";
        ps.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
        ps.on("close", (code) => {
          if (code !== 0) {
            console.error(`[TTS] powershell (playback neural) saiu com código ${code}: ${stderr.trim()} — usando fallback offline`);
            fs.unlink(tmpFile, () => {});
            speakOffline();
            return;
          }
          finish();
        });
        ps.on("error", (err) => {
          console.error("[TTS] falha ao spawnar powershell (playback neural) — usando fallback offline:", err);
          fs.unlink(tmpFile, () => {});
          speakOffline();
        });
      } catch (err) {
        console.error("[TTS] falha na síntese neural (msedge-tts) — usando fallback offline:", err);
        _tts = null; // reset so next call opens a fresh connection
        speakOffline();
      }
    })();
  });
}
