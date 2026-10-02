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
  $c = [Windows.Media.SpeechRecognition.SpeechRecognitionListConstraint]::new([string[]]@('ely', 'ei ely', 'oi ely', 'ok ely', 'elysium', 'ei elysium', 'ok elysium', 'oi elysium'), 'acordar')
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
  } catch { [Console]::Out.WriteLine("ERRO|" + $_.Exception.Message); [Console]::Out.Flush(); Start-Sleep -Seconds 3 }
}
`;

let processo: ChildProcess | null = null;
let ligado = false;
let tentativas: number[] = [];
export type Confianca = "High" | "Medium";
let aoOuvirAtual: ((confianca: Confianca) => void) | null = null;

/** "OUVI|High|elysium" → true quando vale acordar. Exportado para os testes. */
export function linhaAcorda(linha: string): boolean {
  const [tipo, confianca, texto] = linha.trim().split("|");
  return tipo === "OUVI" && (confianca === "High" || confianca === "Medium") && /\bely(sium)?\b/i.test(texto ?? "");
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
      if (l.startsWith("ERRO|")) console.warn(`[palavra] ${l.slice(5)}`);
      else if (l === "PRONTO") console.log("[palavra] escutando \"Elysium\" (offline)");
      else if (linhaAcorda(l)) { console.log(`[palavra] ${l}`); aoOuvirAtual?.(l.split("|")[1] as Confianca); }
    }
  });
  ps.on("exit", (code) => {
    if (processo === ps) processo = null;
    if (!ligado) return;
    // Caiu sozinho (microfone sumiu, serviço de fala reiniciou): sobe de novo, mas no
    // máximo 5 vezes em 10 minutos — um defeito permanente não pode virar um laço de
    // PowerShell subindo e morrendo a cada segundo.
    const agora = Date.now();
    tentativas = tentativas.filter(t => agora - t < 10 * 60_000);
    if (tentativas.length >= 5) { console.error(`[palavra] caiu 5 vezes em 10 min (último código ${code}); desisti até religar em Ajustes.`); ligado = false; return; }
    tentativas.push(agora);
    setTimeout(() => { if (ligado && !processo) subir(); }, 3000);
  });
}

/**
 * Interromper a fala dizendo "Elysium" (C4 do catálogo, fase 12). Com a caixa de som
 * tocando, o reconhecedor ouve o próprio ELYSIUM: só vale confiança ALTA (a média, que
 * basta com a sala em silêncio, pegaria palavra parecida no meio da fala), e nunca quando a
 * frase que está sendo falada contém "Elysium" — ele se interromperia ao dizer o nome.
 */
export function podeInterromper(confianca: Confianca, falando: string): boolean {
  // A fala da resposta que contém o próprio nome ("Ely", "ELYSIUM") não pode se interromper.
  return confianca === "High" && !/\bely/i.test(falando);
}

export function ligarPalavraDeAtivacao(aoOuvir: (confianca: Confianca) => void): void {
  aoOuvirAtual = aoOuvir;
  if (ligado) return;
  ligado = true;
  tentativas = [];
  subir();
}

export function desligarPalavraDeAtivacao(): void {
  ligado = false;
  aoOuvirAtual = null;
  processo?.kill();
  processo = null;
}

export function palavraDeAtivacaoLigada(): boolean {
  return ligado;
}
