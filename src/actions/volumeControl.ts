import { spawn } from "node:child_process";

export type VolumeLevel = number | "up" | "down" | "mute" | "unmute";

// C# inline type for Windows Core Audio API (IAudioEndpointVolume)
const CORE_AUDIO_CS = [
  "using System; using System.Runtime.InteropServices;",
  "[ComImport,Guid(\"5CDF2C82-841E-4546-9722-0CF74078229A\"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]",
  "interface IAEV{int A();int B();int C();int D();",
  "int SetMasterVolumeLevelScalar(float f,ref Guid g);",
  "int F();int G();int H();int I();int J();int K();",
  "int SetMute([MarshalAs(UnmanagedType.Bool)]bool b,ref Guid g);",
  "int M();int N();int O();int P();int Q();int R();}",
  "[ComImport,Guid(\"A95664D2-9614-4F35-A746-DE8DB63617E6\"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]",
  "interface IMDE{int X();int GetDefaultAudioEndpoint(int f,int r,out IMMDev d);}",
  "[ComImport,Guid(\"D666063F-1587-4E43-81F1-B948E807363F\"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]",
  "interface IMMDev{int Activate(ref Guid i,int c,IntPtr p,[MarshalAs(UnmanagedType.IUnknown)]out object o);int Y();int Z();int W();}",
  "[ComImport,Guid(\"BCDE0395-E52F-467C-8E3D-C4579291692E\")] class MDE{}",
  "public class V{",
  "static IAEV EP(){var e=(IMDE)(object)new MDE();IMMDev d;e.GetDefaultAudioEndpoint(0,0,out d);",
  "var i=new Guid(\"5CDF2C82-841E-4546-9722-0CF74078229A\");object o;d.Activate(ref i,0x17,IntPtr.Zero,out o);return(IAEV)o;}",
  "public static void Set(float f){var g=Guid.Empty;EP().SetMasterVolumeLevelScalar(f,ref g);}",
  "public static void Mute(bool m){var g=Guid.Empty;EP().SetMute(m,ref g);}",
  "}",
].join(" ");

function buildPsScript(level: VolumeLevel): { script: string; reply: string } {
  if (level === "mute") {
    return {
      script: `(New-Object -ComObject WScript.Shell).SendKeys([char]173)`,
      reply: "Áudio mutado.",
    };
  }
  if (level === "unmute") {
    return {
      script: `(New-Object -ComObject WScript.Shell).SendKeys([char]173)`,
      reply: "Som reativado.",
    };
  }
  if (level === "up") {
    return {
      script: `$s=New-Object -ComObject WScript.Shell; 1..5|ForEach-Object{$s.SendKeys([char]175)}`,
      reply: "Volume aumentado.",
    };
  }
  if (level === "down") {
    return {
      script: `$s=New-Object -ComObject WScript.Shell; 1..5|ForEach-Object{$s.SendKeys([char]174)}`,
      reply: "Volume diminuído.",
    };
  }
  // Exact numeric level (0-100)
  const pct = Math.max(0, Math.min(100, Math.round(level as number)));
  const f = (pct / 100).toFixed(4);
  const script =
    `Add-Type -TypeDefinition '${CORE_AUDIO_CS}' -Language CSharp -ErrorAction SilentlyContinue; ` +
    `try { [V]::Set(${f}) } catch { ` +
    `$s=New-Object -ComObject WScript.Shell; ` +
    `$cur=[int]([System.Math]::Round((Get-Process|Where-Object{$_.Name -like 'svchost'}|Measure).Count)); ` +
    `1..10|ForEach-Object{$s.SendKeys([char]174)} }`;
  return { script, reply: `Volume em ${pct}%.` };
}

export async function volumeControl(level: VolumeLevel): Promise<string> {
  const { script, reply } = buildPsScript(level);

  // Use Base64-encoded command to avoid quoting issues
  const encoded = Buffer.from(script, "utf16le").toString("base64");

  return new Promise<string>((resolve) => {
    const ps = spawn("powershell.exe", [
      "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
      "-NonInteractive", "-EncodedCommand", encoded,
    ], { stdio: "pipe" });
    ps.on("close", () => resolve(reply));
    ps.on("error", () => resolve(reply));
  });
}
