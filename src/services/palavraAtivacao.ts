import { spawn, ChildProcess } from "node:child_process";

/**
 * "Elysium" em voz alta acorda o assistente (bloco 88) — sem apertar o atalho.
 *
 * O spike do §26 previa medir três caminhos: Porcupine (precisa de chave da Picovoice),
 * openWakeWord (precisa baixar modelos ONNX e compilar o onnxruntime para o Electron) e
 * VAD + Whisper (chamada paga à Groq a cada frase dita perto do microfone). Achado no
 * caminho, que tornou os três desnecessários: o Windows já tem um reconhecedor de fala
 * **offline** em pt-BR (OneCore, `MS-1046-110-WINMO-DNN`, vem com o idioma), exposto pela
 * API WinRT `Windows.Media.SpeechRecognition`. Com uma LISTA FECHADA de frases
 * ("elysium", "ei elysium", "ok elysium") ele:
 *
 * - roda sem a "política de fala online" (a ditação livre exige; a lista não) — medido;
 * - custa **0,3% de um núcleo e ~94 MB** escutando (30 s medidos, silêncio);
 * - não manda áudio a lugar nenhum — o reconhecimento é local.
 *
 * Um PowerShell fica rodando em laço (`RecognizeAsync` com lista, 10 s de silêncio
 * inicial, 4 s de "falatório" no máximo) e escreve uma linha por tentativa. Só vale
 * confiança **High** ou **Medium**: "Low" é o reconhecedor chutando a frase mais parecida
 * com qualquer barulho. Desligado por padrão — é o microfone sempre aberto, e isso é
 * escolha do Zak, em Ajustes → Voz.
 *
 * Três detalhes da ponte PowerShell ↔ WinRT que custaram tentativas (ficam no script):
 * `IAsyncOperation` vira Task pelo `AsTask` genérico por reflexão; o construtor da lista
 * precisa de `[string[]]` via `::new`; e `Constraints.Add` só funciona chamado pelo
 * `ICollection<ISpeechRecognitionConstraint>` por reflexão — direto, o PowerShell 5.1 não
 * enxerga o método no `__ComObject`.
 */

const SCRIPT = String.raw`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`" + String.raw`1' })[0]
function Await($op, [Type]$tipo) { $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
try {
  $rec = New-Object Windows.Media.SpeechRecognition.SpeechRecognizer (New-Object Windows.Globalization.Language 'pt-BR')
  $c = [Windows.Media.SpeechRecognition.SpeechRecognitionListConstraint]::new([string[]]@('ely', 'ei ely', 'oi ely', 'ok ely', 'elysium', 'ei elysium', 'ok elysium', 'oi elysium', 'ely para', 'para ely', 'para', 'chega', 'espera', 'espera ai', 'silencio', 'para de falar', 'pode parar'), 'acordar')
  $tl = [System.Collections.Generic.ICollection[Windows.Media.SpeechRecognition.ISpeechRecognitionConstraint]]
  $tl.GetMethod('Add').Invoke($rec.Constraints, @($c)) | Out-Null
  $comp = Await ($rec.CompileConstraintsAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
  if ($comp.Status -ne 'Success') { [Console]::Out.WriteLine("ERRO|compilação: " + $comp.Status); exit 2 }
  $rec.Timeouts.InitialSilenceTimeout = [TimeSpan]::FromSeconds(10)
  $rec.Timeouts.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(400)
  $rec.Timeouts.BabbleTimeout = [TimeSpan]::FromSeconds(4)
} catch { [Console]::Out.WriteLine("ERRO|" + $_.Exception.Message); exit 3 }
[Console]::Out.WriteLine("PRONTO"); [Console]::Out.Flush()
while ($true) {
  try {
    $r = Await ($rec.RecognizeAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionResult])
    if ($r.Status -eq 'Success' -and $r.Text) { [Console]::Out.WriteLine(("OUVI|{0}|{1}" -f $r.Confidence, $r.Text)); [Console]::Out.Flush() }
    elseif ($r.Status -eq 'Success') { [Console]::Out.WriteLine("VOZ|"); [Console]::Out.Flush() }
  } catch { [Console]::Out.WriteLine("ERRO|" + $_.Exception.Message); [Console]::Out.Flush(); Start-Sleep -Seconds 3 }
}
`;

let processo: ChildProcess | null = null;
/** Ligado pela palavra de ativação (Ajustes) — microfone aberto o tempo todo. */
let porPalavra = false;
/** 19/10: ligado só enquanto a Ely fala, para dar para interromper sem a palavra de ativação. */
let porFala = false;
let tentativas: number[] = [];
export type Confianca = "High" | "Medium";
export type Ouvido =
  | { tipo: "acordar"; confianca: Confianca; texto: string }
  | { tipo: "parar"; confianca: Confianca; texto: string }
  | { tipo: "voz" };
let aoOuvirAtual: ((o: Ouvido) => void) | null = null;

function querendoEscutar(): boolean { return porPalavra || porFala; }

/** "OUVI|High|elysium" → true quando vale acordar. Exportado para os testes. */
export function linhaAcorda(linha: string): boolean {
  const [tipo, confianca, texto] = linha.trim().split("|");
  return tipo === "OUVI" && (confianca === "High" || confianca === "Medium") && /\bely(sium)?\b/i.test(texto ?? "");
}

/**
 * Uma linha do reconhecedor vira o que foi ouvido (19/10). "Ely"/"Elysium" = acordar; "para",
 * "chega", "espera", "silêncio" = parar; qualquer fala fora da lista (o reconhecedor devolve
 * "rejeitado" ou confiança baixa) = voz. Pura.
 */
export function lerLinha(linha: string): Ouvido | null {
  const [tipo, confianca, bruto] = linha.trim().split("|");
  if (tipo === "VOZ") return { tipo: "voz" };
  if (tipo !== "OUVI") return null;
  const texto = (bruto ?? "").trim();
  if (confianca !== "High" && confianca !== "Medium") return { tipo: "voz" };
  if (/\b(para|chega|espera|silencio|parar)\b/i.test(texto)) return { tipo: "parar", confianca, texto };
  if (/\bely(sium)?\b/i.test(texto)) return { tipo: "acordar", confianca, texto };
  return null;
}

function subir(): void {
  const encoded = Buffer.from(SCRIPT, "utf16le").toString("base64");
  const ps = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-NonInteractive", "-EncodedCommand", encoded], { stdio: ["ignore", "pipe", "pipe"] });
  processo = ps;
  let resto = "";
  ps.stdout?.on("data", (d: Buffer) => {
    resto += d.toString("utf8");
    const linhas = resto.split(/\r?\n/);
    resto = linhas.pop() ?? "";
    for (const l of linhas) {
      if (l.startsWith("ERRO|")) { console.warn(`[palavra] ${l.slice(5)}`); continue; }
      if (l === "PRONTO") { console.log("[palavra] escutando (offline)"); continue; }
      const o = lerLinha(l);
      if (!o) continue;
      if (o.tipo !== "voz") console.log(`[palavra] ${l}`);
      aoOuvirAtual?.(o);
    }
  });
  ps.on("exit", (code) => {
    if (processo === ps) processo = null;
    if (!querendoEscutar()) return;
    // Caiu sozinho (microfone sumiu, serviço de fala reiniciou): sobe de novo, mas no
    // máximo 5 vezes em 10 minutos — um defeito permanente não pode virar um laço de
    // PowerShell subindo e morrendo a cada segundo.
    const agora = Date.now();
    tentativas = tentativas.filter(t => agora - t < 10 * 60_000);
    if (tentativas.length >= 5) { console.error(`[palavra] caiu 5 vezes em 10 min (último código ${code}); desisti até religar em Ajustes.`); porPalavra = false; porFala = false; return; }
    tentativas.push(agora);
    setTimeout(() => { if (querendoEscutar() && !processo) subir(); }, 3000);
  });
}

function acertarProcesso(): void {
  if (querendoEscutar() && !processo) subir();
  else if (!querendoEscutar() && processo) { processo.kill(); processo = null; }
}

function semAcentoMin(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Interromper a fala pela voz (C4 do catálogo, fase 12; 19/10 mais solto). Com a caixa de som
 * tocando, o reconhecedor ouve o próprio ELYSIUM — então nunca vale quando a frase ouvida está
 * na fala que está saindo ("para" no meio da resposta dela não a corta). Fora isso, confiança
 * alta ou média servem. Pura.
 */
export function podeInterromper(confianca: Confianca, falando: string, ouvido = "ely"): boolean {
  const f = semAcentoMin(falando);
  const o = semAcentoMin(ouvido).trim();
  const escapado = o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (o && new RegExp(`\\b${escapado}\\b`).test(f)) return false;
  // O nome ("Ely", "ELYSIUM") na fala dela: o reconhecedor confunde um com o outro.
  if (/\bely/.test(o) && /\bely/.test(f)) return false;
  return confianca === "High" || confianca === "Medium";
}

export function ligarPalavraDeAtivacao(aoOuvir: (o: Ouvido) => void): void {
  aoOuvirAtual = aoOuvir;
  if (porPalavra) return;
  porPalavra = true;
  tentativas = [];
  acertarProcesso();
}

export function desligarPalavraDeAtivacao(): void {
  porPalavra = false;
  acertarProcesso();
}

/**
 * 19/10: escutar só enquanto a Ely fala (sem a palavra de ativação ligada) — o microfone abre na
 * fala dela e fecha quando ela termina. O reconhecimento é o mesmo, local e offline.
 */
export function escutarDuranteFala(falando: boolean, aoOuvir: (o: Ouvido) => void): void {
  aoOuvirAtual = aoOuvir;
  porFala = falando;
  if (falando) tentativas = [];
  acertarProcesso();
}

export function palavraDeAtivacaoLigada(): boolean {
  return porPalavra;
}
