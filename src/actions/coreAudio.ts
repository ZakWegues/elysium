// actions/coreAudio.ts — o C# da Core Audio, num lugar só (fase 22): o volumeControl.ts usa
// num PowerShell avulso, e o host de entrada (services/inputHost.ts) compila uma vez e reaproveita.

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
export const CORE_AUDIO_CS = [
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
