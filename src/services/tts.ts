import { MsEdgeTTS, OUTPUT_FORMAT, ProsodyOptions } from "msedge-tts";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn, ChildProcess } from "node:child_process";
import { getConfig } from "../main/config";

const VOICE = "pt-BR-FranciscaNeural";
const TTS_TIMEOUT_MS = 30_000;

// Rate/pitch levemente reduzidos: soa menos apressado e menos robótico
// que o padrão (rate 1.0 / pitch +0Hz) do msedge-tts.
const PROSODY_MASCULINA: ProsodyOptions = { rate: "-8%", pitch: "-3%", volume: "+0%" };
// A Francisca/Thalita (02/10) com o pitch baixado soa abafada; só um pouco mais devagar basta.
const PROSODY_FEMININA: ProsodyOptions = { rate: "-4%", pitch: "+0%", volume: "+0%" };

/**
 * Das 22 h às 7 h a Ely fala mais baixo (02/10): resposta no volume do dia, de madrugada,
 * acorda a casa. Desliga em Ajustes → Voz (`vozBaixaDeNoite`).
 */
export function ehNoite(d = new Date(), ligado = getConfig().vozBaixaDeNoite !== false): boolean {
  if (!ligado) return false;
  const h = d.getHours();
  return h >= 22 || h < 7;
}

export function prosodiaDa(voz: string, noite = ehNoite()): ProsodyOptions {
  const base = /^pt-BR-(Antonio|Macerio)/.test(voz) ? PROSODY_MASCULINA : PROSODY_FEMININA;
  return noite ? { ...base, volume: "-30%" } : base;
}

/** O volume entra na chave: a mesma frase sintetizada à tarde não pode tocar alta à noite. */
function chaveMp3(voz: string, limpo: string): string {
  return `${voz}|${ehNoite() ? "noite" : "dia"}|${limpo}`;
}

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
    // "Ely" (o nome da assistente, 02/10) é lido "Éli" — a voz pt-BR lia "Élai", como em inglês.
    .replace(/\bEly\b/gi, "Éli")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 2000);
}

// ── Voz para o celular (bloco 85) ────────────────────────────────────────────
// O celular falava com o `expo-speech` (a voz do Android, bem pior que a neural daqui).
// Agora ele pede o MP3 ao PC. Instância própria do MsEdgeTTS: a do `synthesize` pode estar
// no meio de uma fala na caixa de som, e `setMetadata` na mesma instância trocaria a voz
// dela no meio. Cache das últimas 20 falas: tocar de novo a mesma resposta não sintetiza.
let _ttsCelular: MsEdgeTTS | null = null;
const cacheMp3 = new Map<string, Buffer>();

export async function sintetizarMp3(texto: string): Promise<Buffer> {
  const limpo = cleanTextForSpeech(texto);
  if (!limpo) throw new Error("nada para falar");
  const voz = getConfig().voice?.trim() || VOICE;
  const chave = chaveMp3(voz, limpo);
  const guardado = cacheMp3.get(chave);
  if (guardado) return guardado;

  if (!_ttsCelular) _ttsCelular = new MsEdgeTTS();
  await _ttsCelular.setMetadata(voz, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {});
  const { audioStream } = _ttsCelular.toStream(limpo, prosodiaDa(voz));
  const pedacos: Buffer[] = [];
  await new Promise<void>((ok, falha) => {
    const t = setTimeout(() => falha(new Error("síntese demorou demais")), TTS_TIMEOUT_MS);
    audioStream.on("data", (c: Buffer) => pedacos.push(c));
    audioStream.on("end", () => { clearTimeout(t); ok(); });
    audioStream.on("error", (e) => { clearTimeout(t); falha(e); });
  }).catch((e) => { _ttsCelular = null; throw e; });
  const mp3 = Buffer.concat(pedacos);
  if (!mp3.length) throw new Error("síntese vazia");
  cacheMp3.set(chave, mp3);
  if (cacheMp3.size > 20) cacheMp3.delete(cacheMp3.keys().next().value as string);
  return mp3;
}

/**
 * Divide uma fala longa em pedaços por frase (02/10), para a primeira começar a tocar
 * enquanto a seguinte sintetiza — como o modo voz do ChatGPT. Frases curtas se juntam
 * (cada pedaço é uma síntese e um player; "Ok." sozinho sairia picotado). Fala curta
 * volta inteira. Pura, para teste.
 */
export function dividirEmFrases(texto: string, minimo = 70): string[] {
  const t = texto.trim();
  if (t.length <= minimo * 2) return t ? [t] : [];
  const frases = t.split(/(?<=[.!?…])\s+/);
  const pedacos: string[] = [];
  let atual = "";
  for (const f of frases) {
    atual = atual ? `${atual} ${f}` : f;
    if (atual.length >= minimo) { pedacos.push(atual); atual = ""; }
  }
  if (atual) {
    if (pedacos.length && atual.length < minimo / 2) pedacos[pedacos.length - 1] += " " + atual;
    else pedacos.push(atual);
  }
  return pedacos;
}

/**
 * Sintetiza a próxima frase enquanto a atual toca (02/10). Vai para o mesmo cache do MP3
 * do celular, que o `synthesize` consulta antes de abrir a conexão de novo.
 */
export function preSintetizar(texto: string): void {
  sintetizarMp3(texto).catch(() => { /* o synthesize tenta de novo na hora */ });
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
        "  $v = ($voices | Where-Object { $_.VoiceInfo.Gender -eq 'Female' } | Select-Object -First 1)",
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

        // 🔴 msedge-tts 1.3.4 dava "Connect Error" em toda chamada nesta máquina (pendência
        // 9 da §15) e a voz vivia no fallback SAPI, robótica. O endpoint do Edge mudou o
        // handshake; a 2.x acompanha. Na 2.x o `toStream` devolve { audioStream,
        // metadataStream } em vez do stream direto.
        // Pendência 10 da §15: a chave `voice` existia no config e nunca era lida.
        const voz = getConfig().voice?.trim() || VOICE;
        const jaPronto = cacheMp3.get(chaveMp3(voz, clean));
        // O `{}` é obrigatório: a 2.0.7 declara o terceiro parâmetro como opcional e lê
        // `metadataOptions.voiceLocale` sem conferir a partir da SEGUNDA chamada na mesma
        // instância — a primeira fala saía neural e todas as seguintes caíam no SAPI.
        let mp3: Buffer;
        if (jaPronto) mp3 = jaPronto;
        else {
          await _tts.setMetadata(voz, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {});
          const { audioStream } = _tts.toStream(clean, prosodiaDa(voz));

          const chunks: Buffer[] = [];
          audioStream.on("data", (c: Buffer) => { if (!settled) chunks.push(c); });

          await new Promise<void>((res, rej) => {
            audioStream.on("end", res);
            audioStream.on("error", rej);
          });
          mp3 = Buffer.concat(chunks);
        }

        if (settled) return;

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
