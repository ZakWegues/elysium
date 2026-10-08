import { spawn } from "node:child_process";

/**
 * Para onde vai o som do PC (08/10). A Ely "não falava" e a voz estava saindo certinho — para
 * os "Alto-falantes (Steam Streaming Speakers)", o dispositivo virtual do Steam Remote Play,
 * que o Windows tinha posto como padrão. Ninguém ouve um alto-falante virtual. Agora o app
 * confere a saída padrão (nome, volume, mudo) e avisa — no PC e no celular.
 *
 * Só LÊ o dispositivo padrão pela API de áudio do Windows (IMMDeviceEnumerator); nunca troca.
 */

export interface SaidaDeSom {
  nome: string;
  volume: number;
  mudo: boolean;
  /** Dispositivo virtual (Steam, cabo virtual, NVIDIA virtual…): o som não chega a lugar nenhum audível. */
  virtual: boolean;
  em: number;
}

const VIRTUAIS = /steam streaming|virtual|vb-audio|cable|voicemeeter|remote audio|nvidia broadcast/i;

/** Pura: o nome do dispositivo diz se é virtual. */
export function ehVirtual(nome: string): boolean {
  return VIRTUAIS.test(nome);
}

const SCRIPT = String.raw`
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class NxEnum {}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface INxEnum { int N1(); [PreserveSig] int GetDefaultAudioEndpoint(int f, int r, out INxDev d); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface INxDev { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); int OpenPropertyStore(int a, out INxProps s); }
[Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface INxProps { int GetCount(out int c); int GetAt(int i, out NxKey k); int GetValue(ref NxKey k, out NxVar v); }
[StructLayout(LayoutKind.Sequential)] struct NxKey { public Guid fmtid; public int pid; }
[StructLayout(LayoutKind.Explicit)] struct NxVar { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr p; }
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface INxVol { int f1(); int f2(); int f3(out int c); int f4(float l, ref Guid g); int f5(float l, ref Guid g); int f6(out float l); int GetMasterVolumeLevelScalar(out float l); int f8(); int f9(); int f10(); int f11(); int f12(bool m, ref Guid g); int GetMute(out bool m); }
public static class NxSom {
  public static string Ler() {
    var en = (INxEnum)(new NxEnum());
    INxDev dev; if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) return "{}";
    INxProps ps; dev.OpenPropertyStore(0, out ps);
    var k = new NxKey { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };
    NxVar v; ps.GetValue(ref k, out v);
    string nome = Marshal.PtrToStringUni(v.p) ?? "";
    var iid = typeof(INxVol).GUID; object o; dev.Activate(ref iid, 23, IntPtr.Zero, out o);
    var vol = (INxVol)o; float nivel; vol.GetMasterVolumeLevelScalar(out nivel); bool mudo; vol.GetMute(out mudo);
    return "{\"nome\":\"" + nome.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\",\"volume\":" + Math.Round(nivel * 100) + ",\"mudo\":" + (mudo ? "true" : "false") + "}";
  }
}
"@
[NxSom]::Ler()
`;

let ultima: SaidaDeSom | null = null;

export function ultimaSaidaDeSom(): SaidaDeSom | null {
  return ultima;
}

/** Lê a saída padrão agora (~1 s: um PowerShell). `null` se não deu. */
export function lerSaidaDeSom(): Promise<SaidaDeSom | null> {
  return new Promise((resolve) => {
    let out = "";
    let ps;
    try {
      ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-EncodedCommand", Buffer.from(SCRIPT, "utf16le").toString("base64")], { stdio: ["ignore", "pipe", "ignore"] });
    } catch { resolve(null); return; }
    const t = setTimeout(() => { try { ps.kill(); } catch { /* já saiu */ } resolve(null); }, 15_000);
    ps.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    ps.on("error", () => { clearTimeout(t); resolve(null); });
    ps.on("close", () => {
      clearTimeout(t);
      try {
        const j = JSON.parse(out.trim().split(/\r?\n/).pop() ?? "{}") as { nome?: string; volume?: number; mudo?: boolean };
        if (!j.nome) { resolve(null); return; }
        ultima = { nome: j.nome, volume: j.volume ?? 0, mudo: !!j.mudo, virtual: ehVirtual(j.nome), em: Date.now() };
        resolve(ultima);
      } catch { resolve(null); }
    });
  });
}

/** O som está indo para onde ninguém ouve? Devolve a frase do aviso, ou null. Pura. */
export function problemaDeSom(s: SaidaDeSom | null): string | null {
  if (!s) return null;
  if (s.virtual) return `A saída de som do PC está em "${s.nome}", um alto-falante virtual — a voz da Ely não vai ser ouvida. Troque no ícone de som da barra de tarefas.`;
  if (s.mudo) return `O som do PC está no mudo ("${s.nome}") — a voz da Ely não vai ser ouvida.`;
  if (s.volume <= 3) return `O volume do PC está em ${s.volume}% — a voz da Ely quase não vai ser ouvida.`;
  return null;
}
