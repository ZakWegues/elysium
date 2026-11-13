import { spawn } from "node:child_process";

/**
 * As janelas abertas no PC, uma por uma (bloco 87).
 *
 * O `apps.running` é por PROCESSO (`MainWindowHandle` do Get-Process): o Chrome com três
 * janelas aparece uma vez, e os apps da loja aparecem todos como "ApplicationFrameHost".
 * Aqui é o `EnumWindows` do Windows, filtrado como a barra de tarefas filtra — visível, com
 * título, sem dono, sem ser janela de ferramenta e sem estar "cloaked" (as janelas UWP
 * suspensas continuam existindo e visíveis para a API; o DWM só não as desenha). Cada item
 * tem o `hwnd`, que é o que as ações usam: fechar a janela certa, não "a primeira do Chrome".
 */

export interface Janela {
  hwnd: string;
  pid: number;
  processo: string;
  titulo: string;
  minimizada: boolean;
  maximizada: boolean;
  emFoco: boolean;
}

export type OperacaoJanela = "focar" | "minimizar" | "maximizar" | "restaurar" | "fechar" | "so_esta";

const TIPO_CS = [
  "using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;",
  "public class ElyWin {",
  " delegate bool EnumProc(IntPtr h, IntPtr l);",
  " [DllImport(\"user32.dll\")] static extern bool EnumWindows(EnumProc f, IntPtr l);",
  " [DllImport(\"user32.dll\")] static extern bool IsWindowVisible(IntPtr h);",
  " [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);",
  " [DllImport(\"user32.dll\")] static extern int GetWindowTextLength(IntPtr h);",
  " [DllImport(\"user32.dll\")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);",
  " [DllImport(\"user32.dll\")] static extern IntPtr GetWindow(IntPtr h, uint c);",
  " [DllImport(\"user32.dll\")] static extern int GetWindowLong(IntPtr h, int i);",
  " [DllImport(\"user32.dll\")] public static extern bool IsIconic(IntPtr h);",
  " [DllImport(\"user32.dll\")] public static extern bool IsZoomed(IntPtr h);",
  " [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
  " [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr h, int c);",
  " [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr h);",
  " [DllImport(\"user32.dll\")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);",
  " [DllImport(\"user32.dll\")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);",
  " [DllImport(\"dwmapi.dll\")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);",
  " public static List<string> List() {",
  "  var r = new List<string>(); var fg = GetForegroundWindow();",
  "  EnumWindows((h, l) => {",
  "   if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true;",
  // 13/11: camadas por cima (Roamies, Smart Notch, a própria Ely flutuante) não são "a janela dele":
  // janela de ferramenta (0x80), que nunca pega foco (NOACTIVATE 0x08000000) ou transparente ao
  // clique (TRANSPARENT 0x20 + LAYERED 0x80000).
  "   int ex = GetWindowLong(h, -20);",
  "   if ((ex & 0x80) != 0 || (ex & 0x08000000) != 0 || ((ex & 0x20) != 0 && (ex & 0x80000) != 0)) return true;",
  "   int c; if (DwmGetWindowAttribute(h, 14, out c, 4) == 0 && c != 0) return true;",
  "   int n = GetWindowTextLength(h); if (n == 0) return true;",
  "   var sb = new StringBuilder(n + 1); GetWindowText(h, sb, n + 1);",
  "   uint pid; GetWindowThreadProcessId(h, out pid);",
  "   r.Add(h.ToInt64() + \"\\t\" + pid + \"\\t\" + (IsIconic(h) ? 1 : 0) + (IsZoomed(h) ? 1 : 0) + (h == fg ? 1 : 0) + \"\\t\" + sb.ToString().Replace(\"\\t\", \" \"));",
  "   return true; }, IntPtr.Zero);",
  "  return r; }",
  // Janela em segundo plano não pode roubar o foco (regra do Windows contra pop-ups); um
  // Alt "apertado e solto" antes do SetForegroundWindow é o jeito conhecido de liberar.
  " public static void Focar(IntPtr h) { if (IsIconic(h)) ShowWindowAsync(h, 9); keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero); SetForegroundWindow(h); }",
  // Fase 21 (bloco 216): posição. Tudo em pixels físicos (SetProcessDPIAware), senão a escala
  // de 150% embaralha o que é lido e o que é escrito.
  " [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }",
  " [StructLayout(LayoutKind.Sequential)] struct MINFO { public int cb; public RECT mon; public RECT work; public uint flags; }",
  " delegate bool MonProc(IntPtr m, IntPtr dc, ref RECT r, IntPtr d);",
  " [DllImport(\"user32.dll\")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonProc f, IntPtr d);",
  " [DllImport(\"user32.dll\")] static extern bool GetMonitorInfo(IntPtr m, ref MINFO i);",
  " [DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware();",
  " [DllImport(\"user32.dll\")] static extern bool GetWindowRect(IntPtr h, out RECT r);",
  " [DllImport(\"user32.dll\")] static extern bool ShowWindow(IntPtr h, int c);",
  " [DllImport(\"user32.dll\")] static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int ht, uint f);",
  " [DllImport(\"dwmapi.dll\")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT v, int s);",
  " public static List<string> Monitores() {",
  "  var r = new List<string>();",
  "  EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr m, IntPtr dc, ref RECT rc, IntPtr d) => { var i = new MINFO(); i.cb = Marshal.SizeOf(typeof(MINFO)); GetMonitorInfo(m, ref i); r.Add(i.work.L + \",\" + i.work.T + \",\" + (i.work.R - i.work.L) + \",\" + (i.work.B - i.work.T) + \",\" + (i.flags & 1)); return true; }, IntPtr.Zero);",
  "  return r; }",
  " public static string Rect(IntPtr h) { RECT f; if (DwmGetWindowAttribute(h, 9, out f, 16) != 0) GetWindowRect(h, out f); return f.L + \",\" + f.T + \",\" + (f.R - f.L) + \",\" + (f.B - f.T) + \",\" + (IsZoomed(h) ? 1 : 0); }",
  // A janela tem uma borda invisível de ~7 px no Windows 10/11 (a área de redimensionar): o
  // retângulo pedido é o VISÍVEL, então a borda é somada de volta antes do SetWindowPos.
  " public static void Pos(IntPtr h, int x, int y, int w, int ht) {",
  "  if (IsIconic(h) || IsZoomed(h)) ShowWindow(h, 9);",
  "  RECT r, f; GetWindowRect(h, out r);",
  "  int dl = 0, dt = 0, dr = 0, db = 0;",
  "  if (DwmGetWindowAttribute(h, 9, out f, 16) == 0) { dl = f.L - r.L; dt = f.T - r.T; dr = r.R - f.R; db = r.B - f.B; }",
  "  SetWindowPos(h, IntPtr.Zero, x - dl, y - dt, w + dl + dr, ht + dt + db, 0x0004 | 0x0040); }",
  " public static void Max(IntPtr h) { ShowWindow(h, 3); }",
  "}",
].join("\n");

function rodarPs(corpo: string): Promise<string> {
  const script =
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n" +
    `Add-Type -TypeDefinition @'\n${TIPO_CS}\n'@ -Language CSharp -ErrorAction SilentlyContinue\n` +
    corpo;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolve, reject) => {
    const ps = spawn("powershell.exe", ["-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-NonInteractive", "-EncodedCommand", encoded], { stdio: "pipe" });
    let out = "", err = "";
    ps.stdout.on("data", (d: Buffer) => { out += d.toString("utf8"); });
    ps.stderr.on("data", (d: Buffer) => { err += d.toString("utf8"); });
    ps.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim().slice(0, 300) || `powershell saiu com ${code}`))));
    ps.on("error", reject);
  });
}

/** Processos que são o próprio Windows e não interessam na lista. */
const IGNORAR = new Set(["textinputhost", "shellexperiencehost", "searchhost", "startmenuexperiencehost", "lockapp", "systemsettingsbroker"]);

export async function listarJanelas(): Promise<Janela[]> {
  const out = await rodarPs(
    "$nomes=@{}; Get-Process | ForEach-Object { $nomes[[uint32]$_.Id] = $_.ProcessName }\n" +
    "foreach ($l in [ElyWin]::List()) { $p = $l.Split(\"`t\"); Write-Output ($l + \"`t\" + $nomes[[uint32]$p[1]]) }",
  );
  const lista: Janela[] = [];
  for (const linha of out.split(/\r?\n/)) {
    const [hwnd, pid, flags, titulo, processo] = linha.split("\t");
    if (!hwnd || !titulo || !flags) continue;
    const proc = (processo ?? "").trim();
    if (IGNORAR.has(proc.toLowerCase()) || titulo === "Program Manager") continue;
    lista.push({
      hwnd, pid: Number(pid), processo: proc, titulo: titulo.trim(),
      minimizada: flags[0] === "1", maximizada: flags[1] === "1", emFoco: flags[2] === "1",
    });
  }
  return lista;
}

export async function controlarJanela(hwnd: string, operacao: OperacaoJanela): Promise<string> {
  if (!/^\d{1,20}$/.test(hwnd)) throw new Error("hwnd inválido");
  const h = `([IntPtr][long]${hwnd})`;
  switch (operacao) {
    case "focar":      await rodarPs(`[ElyWin]::Focar(${h})`); return "Janela em foco.";
    case "minimizar":  await rodarPs(`[ElyWin]::ShowWindowAsync(${h}, 6) | Out-Null`); return "Janela minimizada.";
    case "maximizar":  await rodarPs(`[ElyWin]::ShowWindowAsync(${h}, 3) | Out-Null; [ElyWin]::Focar(${h})`); return "Janela maximizada.";
    case "restaurar":  await rodarPs(`[ElyWin]::ShowWindowAsync(${h}, 9) | Out-Null`); return "Janela restaurada.";
    // WM_CLOSE, não matar o processo: é o X da janela — o programa pergunta se quer salvar.
    case "fechar":     await rodarPs(`[ElyWin]::PostMessage(${h}, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null`); return "Pedi para a janela fechar.";
    case "so_esta": {
      // Minimiza todas as outras da lista e traz esta para a frente — "modo foco" de um clique.
      const outras = (await listarJanelas()).filter(j => j.hwnd !== hwnd && !j.minimizada).map(j => j.hwnd);
      const cmds = outras.map(o => `[ElyWin]::ShowWindowAsync(([IntPtr][long]${o}), 6) | Out-Null`).join("\n");
      await rodarPs(`${cmds}\n[ElyWin]::Focar(${h})`);
      return outras.length ? `Minimizei ${outras.length} ${outras.length === 1 ? "janela" : "janelas"}.` : "Já era a única.";
    }
  }
}

/** O mesmo PowerShell com o tipo `ElyWin`, para quem posiciona janelas (organizarJanelas.ts). */
export const rodarPsJanelas = rodarPs;
