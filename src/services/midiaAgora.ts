import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { CORE_AUDIO_CS } from "../actions/coreAudio";

/**
 * O que toca no PC agora, de qualquer app (25/11, Modo Mesa): Spotify, YouTube no navegador, VLC…
 * Vem da sessão de mídia do Windows (a mesma do controle de volume da barra de tarefas). Um
 * PowerShell só, que fica vivo enquanto algum celular está no Modo Mesa: ele olha a cada segundo e
 * só escreve quando algo muda. Também lê o volume, o mudo do microfone e troca a saída de som.
 */

export interface MidiaAgora {
  app: string;
  titulo: string;
  artista: string;
  album: string;
  tocando: boolean;
  /** Segundos, no instante `posEm` (epoch ms). Tocando, o celular anda o relógio sozinho. */
  pos: number;
  posEm: number;
  dur: number;
  podeVoltar: boolean;
  podeAvancar: boolean;
  /** O app aceita pular para um ponto (YouTube no navegador aceita; nem todo app aceita). */
  podePular: boolean;
  /** JPEG pequeno em base64 e a cor que manda nele (#rrggbb). */
  capa: string;
  cor: string;
}
export interface SomAgora { volume: number; mudo: boolean; micMudo: boolean | null }
export interface EstadoMesa { midia: MidiaAgora | null; som: SomAgora }
export interface Saida { id: string; nome: string; padrao: boolean }

/** O C# extra: saídas de som (enumerar e trocar a padrão) e o mudo do microfone. */
const SAIDAS_CS = String.raw`
using System; using System.Runtime.InteropServices; using System.Text;
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMesaEnum { int EnumAudioEndpoints(int f, int m, out IMesaCol c); int GetDefaultAudioEndpoint(int f, int r, out IMesaDev d); }
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMesaCol { int GetCount(out int n); int Item(int i, out IMesaDev d); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMesaDev { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); int OpenPropertyStore(int a, out IMesaProps s); int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id); }
[Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMesaProps { int GetCount(out int c); int GetAt(int i, out MesaKey k); int GetValue(ref MesaKey k, out MesaVar v); }
[StructLayout(LayoutKind.Sequential)] struct MesaKey { public Guid fmtid; public int pid; }
[StructLayout(LayoutKind.Explicit)] struct MesaVar { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr p; }
[Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMesaPolicy { int A(); int B(); int C(); int D(); int E(); int F(); int G(); int H(); int I(); int J();
  int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role); }
[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class MesaPolicy {}
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMesaVol { int f1(); int f2(); int f3(out int c); int f4(float l, ref Guid g); int f5(float l, ref Guid g); int f6(out float l); int f7(out float l); int f8(); int f9(); int f10(); int f11();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid g); int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m); }
public static class MesaSom {
  // O mesmo CLSID já está noutra classe deste processo (CORE_AUDIO_CS): pelo tipo do COM, não por new.
  static IMesaEnum Enum() { return (IMesaEnum)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"))); }
  static string Esc(string s) { return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\""); }
  static string Nome(IMesaDev d) {
    IMesaProps ps; d.OpenPropertyStore(0, out ps);
    var k = new MesaKey { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 };
    MesaVar v; ps.GetValue(ref k, out v); return Marshal.PtrToStringUni(v.p) ?? "";
  }
  public static string Saidas() {
    var en = Enum(); IMesaCol col; en.EnumAudioEndpoints(0, 1, out col);
    IMesaDev pd; string padrao = ""; if (en.GetDefaultAudioEndpoint(0, 1, out pd) == 0 && pd != null) pd.GetId(out padrao);
    int n; col.GetCount(out n); var sb = new StringBuilder("[");
    for (int i = 0; i < n; i++) { IMesaDev d; col.Item(i, out d); string id; d.GetId(out id);
      if (i > 0) sb.Append(","); sb.Append("{\"id\":\"" + Esc(id) + "\",\"nome\":\"" + Esc(Nome(d)) + "\",\"padrao\":" + (id == padrao ? "true" : "false") + "}"); }
    return sb.Append("]").ToString();
  }
  public static bool Usar(string id) {
    var p = (IMesaPolicy)(new MesaPolicy());
    for (int r = 0; r < 3; r++) if (p.SetDefaultEndpoint(id, r) != 0) return false;
    return true;
  }
  static IMesaVol Mic() {
    var en = Enum(); IMesaDev d; if (en.GetDefaultAudioEndpoint(1, 1, out d) != 0 || d == null) return null;
    var iid = typeof(IMesaVol).GUID; object o; d.Activate(ref iid, 23, IntPtr.Zero, out o); return (IMesaVol)o;
  }
  public static string MicMudo() { var m = Mic(); if (m == null) return "null"; bool b; m.GetMute(out b); return b ? "true" : "false"; }
  public static void MicMudar(bool v) { var m = Mic(); if (m == null) return; var g = Guid.Empty; m.SetMute(v, ref g); }
}
`;

/**
 * O laço do PowerShell. Comandos pela entrada, um por linha: `#id comando [argumento]`. Saída: uma
 * linha JSON por mudança (`{"e":…}`) e uma por resposta (`{"id":…}`).
 */
export const SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
${CORE_AUDIO_CS}
"@
Add-Type -TypeDefinition @"
${SAIDAS_CS}
"@
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`" + String.raw`1' })[0]
function Esperar($op, [Type]$t) { $k = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); if ($k.Wait(4000)) { $k.Result } else { $null } }
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$gm = Esperar ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$capaDe = ''; $capa = ''; $cor = ''
function Capa($p) {
  if (-not $p.Thumbnail) { return @('', '') }
  $st = Esperar ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  if (-not $st) { return @('', '') }
  $img = [System.Drawing.Image]::FromStream([System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st))
  $lado = 220; $bmp = New-Object System.Drawing.Bitmap $lado, $lado
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'
  # Miniatura do YouTube vem 16:9 com faixas: corta o quadrado do meio.
  $q = [Math]::Min($img.Width, $img.Height)
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $lado, $lado), (New-Object System.Drawing.Rectangle ([int](($img.Width - $q) / 2)), ([int](($img.Height - $q) / 2)), $q, $q), 'Pixel')
  $ms = New-Object System.IO.MemoryStream
  $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $par = New-Object System.Drawing.Imaging.EncoderParameters 1
  $par.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 72L
  $bmp.Save($ms, $enc, $par)
  # A cor: média puxada pelos pixels mais vivos (os cinzas quase não contam).
  $r = 0.0; $gg = 0.0; $b = 0.0; $peso = 0.0
  for ($y = 0; $y -lt $lado; $y += 11) { for ($x = 0; $x -lt $lado; $x += 11) {
    $c = $bmp.GetPixel($x, $y); $w = [Math]::Pow($c.GetSaturation() * [Math]::Min(1.0, $c.GetBrightness() * 2.2), 2) + 0.001
    $r += $c.R * $w; $gg += $c.G * $w; $b += $c.B * $w; $peso += $w } }
  $hex = '#{0:x2}{1:x2}{2:x2}' -f [int]($r / $peso), [int]($gg / $peso), [int]($b / $peso)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  return @([Convert]::ToBase64String($ms.ToArray()), $hex)
}
function Ler {
  $s = $gm.GetCurrentSession()
  $som = @{ volume = [int][Math]::Round([ElyVol]::Get() * 100); mudo = [ElyVol]::Muted(); micMudo = (ConvertFrom-Json ([MesaSom]::MicMudo())) }
  if (-not $s) { return @{ midia = $null; som = $som } }
  $p = Esperar ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $tl = $s.GetTimelineProperties(); $info = $s.GetPlaybackInfo()
  $chave = "$($s.SourceAppUserModelId)|$($p.Title)|$($p.Artist)"
  if ($chave -ne $script:capaDe) { $script:capaDe = $chave; $c = Capa $p; $script:capa = $c[0]; $script:cor = $c[1] }
  return @{ som = $som; midia = @{
    app = "$($s.SourceAppUserModelId)"; titulo = "$($p.Title)"; artista = "$($p.Artist)"; album = "$($p.AlbumTitle)"
    tocando = ("$($info.PlaybackStatus)" -eq 'Playing'); pos = [Math]::Round($tl.Position.TotalSeconds, 1)
    posEm = $(if ("$($info.PlaybackStatus)" -eq 'Playing') { $tl.LastUpdatedTime.ToUnixTimeMilliseconds() } else { 0 }); dur = [Math]::Round($tl.EndTime.TotalSeconds, 1)
    podeVoltar = $info.Controls.IsPreviousEnabled; podeAvancar = $info.Controls.IsNextEnabled; podePular = $info.Controls.IsPlaybackPositionEnabled; capa = $script:capa; cor = $script:cor } }
}
function Fazer($cmd, $arg) {
  $s = $gm.GetCurrentSession()
  switch ($cmd) {
    'alternar' { if ($s) { Esperar ($s.TryTogglePlayPauseAsync()) ([bool]) } }
    'proxima' { if ($s) { Esperar ($s.TrySkipNextAsync()) ([bool]) } }
    'anterior' { if ($s) { Esperar ($s.TrySkipPreviousAsync()) ([bool]) } }
    'pular' { if ($s) { Esperar ($s.TryChangePlaybackPositionAsync([long]([double]$arg * 10000000))) ([bool]) } }
    'saidas' { [MesaSom]::Saidas() }
    'usar' { [MesaSom]::Usar($arg) }
    'mic' { [MesaSom]::MicMudar($arg -eq '1'); $true }
  }
}
$ultimo = ''
# O Console.In do PowerShell lê de forma síncrona (o ReadLineAsync dele trava o laço): a entrada
# crua, que sim lê em outra thread.
$entrada = [Console]::OpenStandardInput()
$buf = New-Object byte[] 4096
$texto = ''
$leitura = $entrada.ReadAsync($buf, 0, $buf.Length)
while ($true) {
  if ($leitura.Wait(900)) {
    $n = $leitura.Result
    if ($n -le 0) { break }
    $texto += [Text.Encoding]::UTF8.GetString($buf, 0, $n)
    while ($texto.Contains([string][char]10)) {
      $i = $texto.IndexOf([char]10); $t = $texto.Substring(0, $i).Trim(); $texto = $texto.Substring($i + 1)
      if ($t -match '^#(\d+) (\w+) ?(.*)$') {
        $r = Fazer $Matches[2] $Matches[3]
        $out = if ($r -is [string]) { $r } else { ConvertTo-Json ([bool]$r) -Compress }
        [Console]::Out.WriteLine('{"id":' + $Matches[1] + ',"r":' + $out + '}')
        $ultimo = ''
      }
    }
    $leitura = $entrada.ReadAsync($buf, 0, $buf.Length)
  }
  $e = ConvertTo-Json (Ler) -Compress -Depth 4
  if ($e -ne $ultimo) { $ultimo = $e; [Console]::Out.WriteLine('{"e":' + $e + '}') }
}
`;

/** O JSON do PowerShell → o estado, conferido campo a campo. Pura. */
export function lerEstado(bruto: unknown): EstadoMesa | null {
  const j = bruto as { midia?: Record<string, unknown> | null; som?: Record<string, unknown> } | null;
  if (!j || typeof j !== "object" || !j.som) return null;
  const s = j.som;
  const som: SomAgora = { volume: Math.max(0, Math.min(100, Number(s.volume) || 0)), mudo: s.mudo === true, micMudo: typeof s.micMudo === "boolean" ? s.micMudo : null };
  const m = j.midia;
  if (!m || typeof m.titulo !== "string" || !m.titulo) return { midia: null, som };
  const txt = (v: unknown, n = 200) => (typeof v === "string" ? v.slice(0, n) : "");
  return {
    som,
    midia: {
      app: txt(m.app, 120), titulo: txt(m.titulo), artista: txt(m.artista), album: txt(m.album),
      tocando: m.tocando === true, pos: Math.max(0, Number(m.pos) || 0), posEm: Number(m.posEm) || Date.now(),
      dur: Math.max(0, Number(m.dur) || 0), podeVoltar: m.podeVoltar !== false, podeAvancar: m.podeAvancar !== false, podePular: m.podePular === true,
      capa: typeof m.capa === "string" && m.capa.length < 200_000 ? m.capa : "", cor: /^#[0-9a-f]{6}$/i.test(String(m.cor)) ? String(m.cor) : "",
    },
  };
}

/** "Spotify", "Chrome", "YouTube"… a partir do id do app do Windows. Pura. */
export function nomeDoApp(id: string): string {
  const s = id.toLowerCase();
  if (s.includes("spotify")) return "Spotify";
  if (s.includes("chrome")) return "Chrome";
  if (s.includes("msedge")) return "Edge";
  if (s.includes("firefox")) return "Firefox";
  if (s.includes("vlc")) return "VLC";
  if (s.includes("zunevideo") || s.includes("media")) return "Mídia";
  return id.replace(/\.exe$/i, "").split(/[!\\/._]/).filter(Boolean).pop() ?? id;
}

const PARA_SEM_NINGUEM_MS = 60_000;

let ps: ChildProcessWithoutNullStreams | null = null;
let atual: EstadoMesa | null = null;
let resto = "";
let proximoId = 1;
const esperando = new Map<number, (r: unknown) => void>();
const ouvintes = new Set<(e: EstadoMesa) => void>();
let ultimoUso = 0;
let vigia: NodeJS.Timeout | null = null;

function ligar(): void {
  ultimoUso = Date.now();
  if (ps) return;
  try {
    ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-EncodedCommand", Buffer.from(SCRIPT, "utf16le").toString("base64")], { windowsHide: true });
  } catch { ps = null; return; }
  const p = ps;
  p.stdout.setEncoding("utf8");
  p.stdout.on("data", (d: string) => {
    resto += d;
    const linhas = resto.split(/\r?\n/);
    resto = linhas.pop() ?? "";
    for (const l of linhas) tratar(l);
  });
  p.stderr.on("data", () => { /* o PowerShell reclama de coisa à toa */ });
  p.on("close", () => {
    if (ps !== p) return;
    ps = null;
    resto = "";
    for (const r of esperando.values()) r(null);
    esperando.clear();
  });
  if (!vigia) vigia = setInterval(() => {
    if (ouvintes.size || Date.now() - ultimoUso < PARA_SEM_NINGUEM_MS) return;
    desligar();
  }, 15_000);
}

function desligar(): void {
  if (vigia) { clearInterval(vigia); vigia = null; }
  const p = ps;
  ps = null;
  atual = null;
  try { p?.stdin.end(); p?.kill(); } catch { /* já saiu */ }
}

function tratar(linha: string): void {
  let j: { e?: unknown; id?: number; r?: unknown };
  try { j = JSON.parse(linha) as typeof j; } catch { return; }
  if (typeof j.id === "number") { esperando.get(j.id)?.(j.r); esperando.delete(j.id); return; }
  const e = lerEstado(j.e);
  if (!e) return;
  atual = e;
  for (const f of ouvintes) { try { f(e); } catch { /* quem ouve não derruba */ } }
}

function pedir(cmd: string, arg = ""): Promise<unknown> {
  ligar();
  if (!ps) return Promise.resolve(null);
  const id = proximoId++;
  return new Promise((resolve) => {
    const t = setTimeout(() => { esperando.delete(id); resolve(null); }, 8000);
    esperando.set(id, (r) => { clearTimeout(t); resolve(r); });
    ps!.stdin.write(`#${id} ${cmd} ${arg.replace(/[\r\n]/g, "")}\n`);
  });
}

/** O estado agora; na primeira vez espera o PowerShell subir (até 6 s). */
export async function estadoDaMesa(): Promise<EstadoMesa | null> {
  ligar();
  for (let i = 0; i < 60 && !atual && ps; i++) await new Promise((r) => setTimeout(r, 100));
  return atual;
}

export function assinarMesa(f: (e: EstadoMesa) => void): () => void {
  ouvintes.add(f);
  ligar();
  if (atual) f(atual);
  return () => { ouvintes.delete(f); ultimoUso = Date.now(); };
}

export type ComandoMidia = "alternar" | "proxima" | "anterior";
export async function comandoDeMidia(op: ComandoMidia): Promise<boolean> { return (await pedir(op)) === true; }
export async function pularPara(segundos: number): Promise<boolean> { return (await pedir("pular", String(Math.max(0, segundos)))) === true; }
export async function mudarMicrofone(mudo: boolean): Promise<void> { await pedir("mic", mudo ? "1" : "0"); }

export async function listarSaidas(): Promise<Saida[]> {
  const r = await pedir("saidas");
  return Array.isArray(r) ? r.filter((s): s is Saida => !!s && typeof s.id === "string" && typeof s.nome === "string").map((s) => ({ id: s.id, nome: s.nome, padrao: s.padrao === true })) : [];
}

export async function usarSaida(id: string): Promise<boolean> {
  // Só um id que o próprio Windows listou agora.
  if (!(await listarSaidas()).some((s) => s.id === id)) return false;
  return (await pedir("usar", id)) === true;
}
