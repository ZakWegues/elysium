import { spawn } from "node:child_process";

export type VolumeLevel = number | "up" | "down" | "mute" | "unmute";

/**
 * Volume do Windows pela Core Audio (IAudioEndpointVolume), com LEITURA (bloco 86).
 *
 * Antes só "definir número" passava pela Core Audio; mudo, subir e descer eram teclas de
 * mídia por SendKeys. Dois defeitos disso: não havia como ler o volume (a aba PC e o card
 * "Tocando" mostravam chips 25/50/75/100 em vez de um controle honesto), e "desmutar" era a
 * MESMA tecla que mutar — pedido com o som ligado, ele mutava. Agora tudo é a interface,
 * com os métodos na ordem da vtable (IUnknown fica de fora; o resto tem que estar na
 * posição exata, por isso os nomes de preenchimento).
 */
const CORE_AUDIO_CS = [
  "using System; using System.Runtime.InteropServices;",
  "[ComImport,Guid(\"5CDF2C82-841E-4546-9722-0CF74078229A\"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]",
  "interface IAEV{int RegisterNotify(IntPtr p);int UnregisterNotify(IntPtr p);int GetChannelCount(out int n);",
  "int SetMasterLevel(float f,ref Guid g);int SetMasterScalar(float f,ref Guid g);",
  "int GetMasterLevel(out float f);int GetMasterScalar(out float f);",
  "int SetChLevel(uint c,float f,ref Guid g);int SetChScalar(uint c,float f,ref Guid g);",
  "int GetChLevel(uint c,out float f);int GetChScalar(uint c,out float f);",
  "int SetMute([MarshalAs(UnmanagedType.Bool)]bool b,ref Guid g);int GetMute([MarshalAs(UnmanagedType.Bool)]out bool b);}",
  "[ComImport,Guid(\"A95664D2-9614-4F35-A746-DE8DB63617E6\"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]",
  "interface IMDE{int EnumAudioEndpoints(int f,int m,out IntPtr c);int GetDefaultAudioEndpoint(int f,int r,out IMMDev d);}",
  "[ComImport,Guid(\"D666063F-1587-4E43-81F1-B948E807363F\"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]",
  "interface IMMDev{int Activate(ref Guid i,int c,IntPtr p,[MarshalAs(UnmanagedType.IUnknown)]out object o);}",
  "[ComImport,Guid(\"BCDE0395-E52F-467C-8E3D-C4579291692E\")] class MDE{}",
  "public class ElyVol{",
  "static IAEV EP(){var e=(IMDE)(object)new MDE();IMMDev d;Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0,1,out d));",
  "var i=new Guid(\"5CDF2C82-841E-4546-9722-0CF74078229A\");object o;Marshal.ThrowExceptionForHR(d.Activate(ref i,0x17,IntPtr.Zero,out o));return(IAEV)o;}",
  "public static float Get(){float f;EP().GetMasterScalar(out f);return f;}",
  "public static bool Muted(){bool b;EP().GetMute(out b);return b;}",
  "public static void Set(float f){var g=Guid.Empty;EP().SetMasterScalar(Math.Max(0f,Math.Min(1f,f)),ref g);}",
  "public static void Mute(bool m){var g=Guid.Empty;EP().SetMute(m,ref g);}",
  "}",
].join(" ");

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
  const out = await rodarPs("$v=[ElyVol]::Get(); $m=[ElyVol]::Muted(); Write-Output ('{0}|{1}' -f [int][Math]::Round($v*100), $m)");
  const [n, m] = out.split(/\r?\n/).pop()!.split("|");
  return { nivel: Math.max(0, Math.min(100, Number(n) || 0)), mudo: /true/i.test(m ?? "") };
}

/** Passo de "aumenta"/"diminui" sem número: 10 pontos, como as teclas de mídia em dobro. */
const PASSO = 10;

export async function volumeControl(level: VolumeLevel): Promise<string> {
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
