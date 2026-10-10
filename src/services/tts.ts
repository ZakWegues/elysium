import { modoAtivo, modoDeConta } from "./modos";

function ehModoDeConta(): boolean {
  try { return modoDeConta(); } catch { return false; }
}
import { matematicaParaOuvido, paraOuvido } from "./falaParaOuvido";
import { MsEdgeTTS, OUTPUT_FORMAT, ProsodyOptions } from "msedge-tts";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn, ChildProcess } from "node:child_process";
import { getConfig } from "../main/config";
import { spawnPs } from "../actions/ps";
import type { Humor } from "./humor";
import { duracaoDoMp3, Palavra, palavrasDoMetadado, palavrasPeloTexto } from "./bolota";

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

/**
 * Vozes que mudaram de nome ou não existem no serviço gratuito do Edge (fase 19): a
 * "pt-BR-ThalitaNeural" hoje é "ThalitaMultilingualNeural", e a Macerio é só do Azure pago.
 * Com o nome errado a síntese falha e cai calada no SAPI do Windows — a voz robótica que
 * parece "bug da Ely". Pura.
 */
export function vozEfetiva(voz: string | undefined): string {
  const v = voz?.trim() || VOICE;
  if (v === "pt-BR-ThalitaNeural") return "pt-BR-ThalitaMultilingualNeural";
  if (/^pt-BR-Macerio/.test(v)) return "pt-BR-AntonioNeural";
  return v;
}

/**
 * A voz agora: a escolhida em Ajustes, ou a do modo ligado (fase 20 — o modo inglês fala com
 * a Thalita multilíngue, que pronuncia inglês de verdade; a Francisca lê "weekend" em português).
 */
export function vozDoMomento(): string {
  let doModo: string | undefined;
  try { doModo = modoAtivo()?.voz; } catch { /* sem modo */ }
  return doModo ?? vozEfetiva(getConfig().voice);
}

function pct(n: number): string {
  const r = Math.round(n);
  return `${r >= 0 ? "+" : ""}${r}%`;
}

/**
 * A prosódia do momento (fase 19, bloco 189). O Edge gratuito não aceita estilos de emoção
 * (`express-as`), só velocidade, tom e volume — então o "jeito" da fala vem daqui, em
 * passos pequenos (o que passa de ~8% soa artificial):
 *  - a velocidade que o dono escolheu em Ajustes (−10 a +10);
 *  - com pressa, mais rápida; cansado ou triste, mais lenta e um pouco mais grave;
 *  - à noite, um pouco mais lenta e 30% mais baixa (o volume já existia).
 * Pura, para teste.
 */
export function prosodiaDoMomento(voz: string, opcoes: { noite?: boolean; humor?: Humor; velocidade?: number } = {}): ProsodyOptions {
  const masculina = /^pt-BR-(Antonio|Macerio)/.test(voz);
  let rate = masculina ? -8 : -4;
  let pitch = masculina ? -3 : 0;
  const vel = Number(opcoes.velocidade);
  rate += Number.isFinite(vel) ? Math.max(-10, Math.min(10, vel)) : 0;
  switch (opcoes.humor) {
    case "apressado": rate += 6; break;
    case "cansado":   rate -= 5; break;
    case "triste":    rate -= 5; pitch -= 2; break;
    case "animado":   rate += 3; pitch += 2; break;
    default: break;
  }
  if (opcoes.noite) rate -= 3;
  return { rate: pct(rate), pitch: pct(pitch), volume: opcoes.noite ? "-30%" : "+0%" };
}

/** A prosódia de agora, com a config e o relógio. */
function prosodiaAgora(voz: string, humor?: Humor): ProsodyOptions {
  return prosodiaDoMomento(voz, { noite: ehNoite(), humor, velocidade: getConfig().velocidadeFala });
}

/** A prosódia inteira entra na chave: a mesma frase à tarde não pode tocar alta à noite, nem lenta com pressa. */
function chaveMp3(voz: string, limpo: string, p: ProsodyOptions): string {
  return `${voz}|${p.rate}|${p.pitch}|${p.volume}|${limpo}`;
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
export function cleanTextForSpeech(raw: string, conta = ehModoDeConta()): string {
  // Fase 20: no modo matemática a conta vira fala ANTES da limpeza do markdown, que comia o
  // "*" da multiplicação e lia "3/4" como data.
  if (conta) raw = matematicaParaOuvido(raw);
  // Fase 18: depois de limpar o markdown, números, datas e unidades viram fala (falaParaOuvido.ts).
  return paraOuvido(raw
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
    .trim())
    // Teto DEPOIS de expandir ("16h" vira "16 horas"): folga para a parte de 1400 do celular.
    .substring(0, 2600);
}

// ── Voz para o celular (bloco 85) ────────────────────────────────────────────
// O celular falava com o `expo-speech` (a voz do Android, bem pior que a neural daqui).
// Agora ele pede o MP3 ao PC. Instância própria do MsEdgeTTS: a do `synthesize` pode estar
// no meio de uma fala na caixa de som, e `setMetadata` na mesma instância trocaria a voz
// dela no meio. Cache das últimas 20 falas: tocar de novo a mesma resposta não sintetiza.
let _ttsCelular: MsEdgeTTS | null = null;
const cacheMp3 = new Map<string, Buffer>();
/** Fase 21: o tempo de cada palavra do MP3 de mesma chave — o pulso da bolota. */
const cachePalavras = new Map<string, Palavra[]>();

/**
 * Fase 21 (bloco 214): avisa quando o áudio da Ely COMEÇA a tocar, com a duração e o tempo de
 * cada palavra. O player imprime uma marca logo antes do `play`, então o aviso não depende de
 * adivinhar quanto o PowerShell leva para compilar o Add-Type.
 */
export interface AudioTocando { texto: string; durMs: number; palavras: Palavra[] }
let ouvinteAudio: (a: AudioTocando) => void = () => {};
export function aoTocarAudio(fn: (a: AudioTocando) => void): void { ouvinteAudio = fn; }
function avisarAudio(a: AudioTocando): void {
  try { ouvinteAudio(a); } catch { /* bolota fechada não trava a fala */ }
}

/** Junta o metadado de palavras de um `toStream` (o stream pode não existir). */
function coletarPalavras(metadataStream: NodeJS.ReadableStream | null): () => Palavra[] {
  const pedacos: string[] = [];
  metadataStream?.on("data", (c: Buffer) => pedacos.push(String(c)));
  return () => palavrasDoMetadado(pedacos);
}

function guardarPalavras(chave: string, palavras: Palavra[]): void {
  if (!palavras.length) return;
  cachePalavras.set(chave, palavras);
  if (cachePalavras.size > 20) cachePalavras.delete(cachePalavras.keys().next().value as string);
}

export async function sintetizarMp3(texto: string, humor?: Humor): Promise<Buffer> {
  const limpo = cleanTextForSpeech(texto);
  if (!limpo) throw new Error("nada para falar");
  const voz = vozDoMomento();
  const prosodia = prosodiaAgora(voz, humor);
  const chave = chaveMp3(voz, limpo, prosodia);
  const guardado = cacheMp3.get(chave);
  if (guardado) return guardado;

  if (!_ttsCelular) _ttsCelular = new MsEdgeTTS();
  await _ttsCelular.setMetadata(voz, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
  const { audioStream, metadataStream } = _ttsCelular.toStream(limpo, prosodia);
  const palavras = coletarPalavras(metadataStream);
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
  guardarPalavras(chave, palavras());
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
export function preSintetizar(texto: string, humor?: Humor): void {
  sintetizarMp3(texto, humor).catch(() => { /* o synthesize tenta de novo na hora */ });
}

export async function synthesize(text: string, humor?: Humor): Promise<void> {
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
      // O texto vai em $env:NX_TEXTO (bloco 198): a fala vem do modelo e do /api/tts, e o
      // escape antigo (`''`) deixava as aspas curvas ‘ ’ fecharem a string.
      const psScript = [
        "Add-Type -AssemblyName System.Speech",
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
        "try {",
        "  $voices = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'pt*' }",
        "  $v = ($voices | Where-Object { $_.VoiceInfo.Gender -eq 'Female' } | Select-Object -First 1)",
        "  if (-not $v) { $v = $voices | Select-Object -First 1 }",
        "  if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }",
        "} catch {}",
        "$s.Speak($env:NX_TEXTO)",
      ].join("\n");
      ps = spawnPs(psScript, { NX_TEXTO: clean });
      // Voz offline: sem metadado nem MP3 — a duração sai do texto (~65 ms por letra).
      const durOffline = clean.length * 65;
      avisarAudio({ texto: clean, durMs: durOffline, palavras: palavrasPeloTexto(clean, durOffline) });

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
        const voz = vozDoMomento();
        const prosodia = prosodiaAgora(voz, humor);
        const chave = chaveMp3(voz, clean, prosodia);
        const jaPronto = cacheMp3.get(chave);
        let palavras = cachePalavras.get(chave) ?? [];
        // O `{}` é obrigatório: a 2.0.7 declara o terceiro parâmetro como opcional e lê
        // `metadataOptions.voiceLocale` sem conferir a partir da SEGUNDA chamada na mesma
        // instância — a primeira fala saía neural e todas as seguintes caíam no SAPI.
        let mp3: Buffer;
        if (jaPronto) mp3 = jaPronto;
        else {
          await _tts.setMetadata(voz, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
          const { audioStream, metadataStream } = _tts.toStream(clean, prosodia);
          const lerPalavras = coletarPalavras(metadataStream);

          const chunks: Buffer[] = [];
          audioStream.on("data", (c: Buffer) => { if (!settled) chunks.push(c); });

          await new Promise<void>((res, rej) => {
            audioStream.on("end", res);
            audioStream.on("error", rej);
          });
          mp3 = Buffer.concat(chunks);
          palavras = lerPalavras();
          guardarPalavras(chave, palavras);
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
        // O caminho vai em $env:NX_ARQUIVO (bloco 198): a pasta temporária é do usuário, e um
        // nome de usuário com aspas curvas fecharia a string do script antigo.
        const psScript = [
          "Add-Type @\"",
          "using System;using System.Text;using System.Runtime.InteropServices;",
          "public class NxMci {",
          "    [DllImport(\"winmm.dll\",CharSet=CharSet.Auto)]",
          "    public static extern int mciSendString(string cmd,StringBuilder sb,int sz,IntPtr h);",
          "}",
          "\"@",
          "$f = $env:NX_ARQUIVO",
          "[NxMci]::mciSendString('open \"'+$f+'\" alias nx_s',$null,0,[IntPtr]::Zero)|Out-Null",
          // Fase 21: a marca de "começou a tocar" para a bolota pulsar junto.
          "[Console]::Out.WriteLine('NX_PLAY'); [Console]::Out.Flush()",
          "[NxMci]::mciSendString('play nx_s wait',$null,0,[IntPtr]::Zero)|Out-Null",
          "[NxMci]::mciSendString('close nx_s',$null,0,[IntPtr]::Zero)|Out-Null",
          "Remove-Item $f -Force -EA 0",
        ].join("\n");

        ps = spawnPs(psScript, { NX_ARQUIVO: tmpFile });
        const durMs = duracaoDoMp3(mp3.length);
        const tocando: AudioTocando = { texto: clean, durMs, palavras: palavras.length ? palavras : palavrasPeloTexto(clean, durMs) };
        let avisado = false;
        ps.stdout?.on("data", (d: Buffer) => {
          if (!avisado && !settled && d.toString().includes("NX_PLAY")) { avisado = true; avisarAudio(tocando); }
        });

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
