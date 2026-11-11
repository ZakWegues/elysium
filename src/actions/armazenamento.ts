import { shell } from "electron";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DiskEntry, getDashboardTelemetry } from "./systemInfo";

/**
 * Armazenamento (fase 12): o que está ocupando o disco e o que dá para liberar sem risco.
 *
 * Nasceu de um número: o C: desta máquina chegou a 97% usado. A sugestão da Início já
 * dizia "pouco espaço", mas não dizia ONDE nem oferecia nada além de ir para a aba PC.
 *
 * Mede só o que costuma crescer sem ninguém ver — Downloads, a pasta temporária do usuário
 * e a Lixeira — e os maiores arquivos de Downloads. Limpar é restrito ao que é, por
 * definição, descartável: esvaziar a Lixeira e apagar da pasta temporária o que tem mais de
 * dois dias (arquivo em uso é pulado pelo próprio Windows). **Nada em Downloads é apagado
 * pelo app**: lá só se abre a pasta e se mostra o arquivo; quem decide é o dono.
 */

export interface ArquivoGrande { nome: string; bytes: number; em: number }

export interface Armazenamento {
  discos: DiskEntry[];
  downloads: number;
  temp: number;
  lixeira: number;
  grandes: ArquivoGrande[];
  medidoEm: number;
}

const FORCE_UTF8 = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n";
const CACHE_MS = 5 * 60 * 1000;
let cache: Armazenamento | null = null;
let emCurso: Promise<Armazenamento> | null = null;

function rodarPs(script: string, prazoMs: number): Promise<string> {
  const encoded = Buffer.from(FORCE_UTF8 + script, "utf16le").toString("base64");
  return new Promise((resolve, reject) => {
    const ps = spawn("powershell.exe", ["-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-NonInteractive", "-EncodedCommand", encoded], { stdio: "pipe", windowsHide: true });
    let out = "";
    const prazo = setTimeout(() => { ps.kill(); reject(new Error("a medição passou do tempo")); }, prazoMs);
    ps.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    ps.on("close", () => { clearTimeout(prazo); resolve(out.trim()); });
    ps.on("error", (e) => { clearTimeout(prazo); reject(e); });
  });
}

// Uma passada só em Downloads serve para o total E para os maiores. A Lixeira é somada por
// unidade, na pasta do usuário atual (a de outros usuários não é legível, e não é dele).
const MEDIR = `
$ErrorActionPreference = 'SilentlyContinue'
$dl = Join-Path $env:USERPROFILE 'Downloads'
$arqs = @(Get-ChildItem -LiteralPath $dl -Recurse -Force -File)
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$lix = 0
Get-PSDrive -PSProvider FileSystem | ForEach-Object {
  $p = Join-Path $_.Root ('$Recycle.Bin\\' + $sid)
  if (Test-Path -LiteralPath $p) { $s = (Get-ChildItem -LiteralPath $p -Recurse -Force -File | Measure-Object Length -Sum).Sum; if ($s) { $lix += $s } }
}
$temp = (Get-ChildItem -LiteralPath $env:TEMP -Recurse -Force -File | Measure-Object Length -Sum).Sum
$epoca = [datetime]'1970-01-01'
[ordered]@{
  downloads = [int64](($arqs | Measure-Object Length -Sum).Sum)
  temp = [int64]$temp
  lixeira = [int64]$lix
  grandes = @($arqs | Sort-Object Length -Descending | Select-Object -First 8 | ForEach-Object {
    [ordered]@{ nome = $_.FullName.Substring($dl.Length + 1); bytes = [int64]$_.Length; em = [int64](($_.LastWriteTimeUtc - $epoca).TotalMilliseconds) }
  })
} | ConvertTo-Json -Compress -Depth 4
`;

export async function lerArmazenamento(forcar = false): Promise<Armazenamento> {
  if (!forcar && cache && Date.now() - cache.medidoEm < CACHE_MS) return cache;
  // Duas telas pedindo ao mesmo tempo (PC e celular) esperam a MESMA medição.
  if (emCurso) return emCurso;
  emCurso = (async () => {
    const [bruto, tel] = await Promise.all([rodarPs(MEDIR, 60_000), getDashboardTelemetry()]);
    const j = JSON.parse(bruto || "{}") as Partial<Armazenamento>;
    cache = {
      discos: tel.disks ?? [],
      downloads: Number(j.downloads) || 0,
      temp: Number(j.temp) || 0,
      lixeira: Number(j.lixeira) || 0,
      grandes: Array.isArray(j.grandes) ? j.grandes : [],
      medidoEm: Date.now(),
    };
    return cache;
  })();
  try { return await emCurso; } finally { emCurso = null; }
}

export type AlvoLimpeza = "lixeira" | "temp";

/**
 * Limpa o que é descartável por definição. Devolve quanto liberou, medido antes e depois
 * (a Lixeira e a pasta temporária mudam sozinhas; estimar pelo tamanho anterior mentiria).
 */
export async function limpar(alvo: AlvoLimpeza): Promise<{ liberado: number; message: string }> {
  const antes = await lerArmazenamento(true);
  const script = alvo === "lixeira"
    ? "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"
    // Só o que não é tocado há 2 dias: instalador ou programa rodando agora costuma usar a
    // pasta temporária, e apagar o que está em uso quebraria o que está em curso.
    : "$lim = (Get-Date).AddDays(-2); Get-ChildItem -LiteralPath $env:TEMP -Force -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt $lim } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue";
  await rodarPs(script, 120_000);
  const depois = await lerArmazenamento(true);
  const liberado = Math.max(0, antes[alvo] - depois[alvo]);
  const nome = alvo === "lixeira" ? "A Lixeira" : "A pasta temporária";
  return { liberado, message: liberado > 0 ? `${nome} liberou ${formatarBytes(liberado)}.` : `${nome} não tinha nada para liberar.` };
}

export type AlvoAbrir = "downloads" | "temp" | "limpeza" | "configuracoes" | "arquivo";

/** Abre no PC. `arquivo` mostra um arquivo de Downloads selecionado no Explorer. */
export async function abrirNoPc(alvo: AlvoAbrir, nome?: string): Promise<{ ok: boolean; message: string }> {
  const downloads = path.join(os.homedir(), "Downloads");
  switch (alvo) {
    case "downloads": await shell.openPath(downloads); return { ok: true, message: "Downloads aberto no PC." };
    case "temp": await shell.openPath(os.tmpdir()); return { ok: true, message: "Pasta temporária aberta no PC." };
    case "limpeza":
      spawn("cleanmgr.exe", [], { detached: true, stdio: "ignore" }).unref();
      return { ok: true, message: "Limpeza de Disco aberta no PC." };
    case "configuracoes": await shell.openExternal("ms-settings:storagesense"); return { ok: true, message: "Configurações de armazenamento abertas no PC." };
    case "arquivo": {
      // O nome vem do cliente: tem de continuar DENTRO de Downloads depois de resolvido.
      const alvoArq = path.resolve(downloads, String(nome ?? ""));
      if (!nome || !alvoArq.startsWith(downloads + path.sep) || !fs.existsSync(alvoArq)) return { ok: false, message: "Esse arquivo não está mais em Downloads." };
      shell.showItemInFolder(alvoArq);
      return { ok: true, message: "Mostrando o arquivo no PC." };
    }
  }
}

export function formatarBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1).replace(".", ",")} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  return `${Math.max(0, Math.round(b / 1e3))} kB`;
}

// ── Vigia do disco ───────────────────────────────────────────────────────────

const LIMITE_PCT = 95;
const INTERVALO_MS = 60 * 60 * 1000;
const UM_DIA = 24 * 60 * 60 * 1000;
let ultimoAviso = 0;
let vigia: NodeJS.Timeout | null = null;

/** Disco que merece aviso: ≥ 95% usado ou menos de 10 GB livres (o que vier primeiro). */
export function discoCritico(discos: DiskEntry[]): DiskEntry | null {
  return discos.find(d => d.totalGB > 0 && (d.usedPct >= LIMITE_PCT || d.freeGB < 10)) ?? null;
}

/**
 * Confere uma vez por hora e avisa no máximo uma vez por dia — no PC e no celular. A Início
 * já mostra o disco cheio o tempo todo; o aviso é para quem não está olhando para ela.
 */
export function vigiarDisco(avisar: (titulo: string, corpo: string) => void): void {
  if (vigia) return;
  const conferir = async () => {
    try {
      const d = discoCritico((await getDashboardTelemetry()).disks ?? []);
      if (!d || Date.now() - ultimoAviso < UM_DIA) return;
      ultimoAviso = Date.now();
      // Onde está o peso, não só quanto sobra: "Downloads ocupa 58 GB" é o que faz alguém
      // agir. A medição leva segundos e roda no máximo uma vez por dia (o aviso é diário).
      let onde = "";
      try {
        const a = await lerArmazenamento();
        const maior = [["Downloads", a.downloads], ["a Lixeira", a.lixeira], ["os temporários", a.temp]]
          .sort((x, y) => (y[1] as number) - (x[1] as number))[0];
        if ((maior[1] as number) >= 1e9) onde = ` ${maior[0]} ocupa ${formatarBytes(maior[1] as number)}.`;
      } catch { /* sem medição: vai só o número */ }
      avisar(`Disco ${d.name} quase cheio`, `Sobram ${String(d.freeGB).replace(".", ",")} GB (${String(d.usedPct).replace(".", ",")}% usado).${onde} Aba PC → Armazenamento mostra o que dá para liberar.`);
    } catch { /* telemetria falhou: tenta na próxima hora */ }
  };
  setTimeout(() => { void conferir(); }, 5 * 60 * 1000);
  vigia = setInterval(() => { void conferir(); }, INTERVALO_MS);
}
