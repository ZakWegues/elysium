// Publica o instalador da versão atual como release no GitHub (bloco 95).
//
//   npm run release -- "o que mudou nesta versão"
//   npm run release -- --notas-arquivo caminho.md
//
// É daqui que o ELYSIUM instalado puxa a atualização automática: ele lê a release mais nova
// de ZakWegues/elysium e baixa o `.exe` dela. Por isso o script recusa publicar o que não
// bate — instalador faltando, árvore suja ou commit que não está no GitHub —, porque uma
// release errada chega sozinha em todo PC com o app instalado.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO = "ZakWegues/elysium";
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const versao = JSON.parse(fs.readFileSync(path.join(raiz, "package.json"), "utf8")).version;
const tag = `v${versao}`;
const instalador = path.join(raiz, "release", `ELYSIUM-Setup-${versao}.exe`);

function sh(cmd, args, opts = {}) {
  // Com stdio herdado o execFileSync devolve null (a saída foi direto para o terminal).
  return String(execFileSync(cmd, args, { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }) ?? "").trim();
}
function falhar(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const args = process.argv.slice(2);
let notas = "";
const iArq = args.indexOf("--notas-arquivo");
if (iArq >= 0) notas = fs.readFileSync(args[iArq + 1], "utf8");
else notas = args.filter(a => !a.startsWith("--")).join(" ");
if (!notas.trim()) falhar("faltam as notas: npm run release -- \"o que mudou\"");

if (!fs.existsSync(instalador)) falhar(`não achei ${path.relative(raiz, instalador)} — rode npm run dist antes`);
if (sh("git", ["status", "--porcelain"])) falhar("há mudança não commitada; a release tem de corresponder a um commit");
const head = sh("git", ["rev-parse", "HEAD"]);
sh("git", ["fetch", "origin", "--quiet"]);
if (!sh("git", ["branch", "-r", "--contains", head])) falhar("o commit atual não está no GitHub; faça push antes");

// CI verde (bloco 114): a release instala sozinha em todo aparelho — de madrugada, no PC.
// Um commit cujo check falhou não sai. `--sem-ci` existe para emergência (CI fora do ar).
if (args.includes("--sem-ci")) {
  console.warn("! publicando sem conferir o CI (--sem-ci)");
} else {
  const runs = JSON.parse(sh("gh", ["run", "list", "--repo", REPO, "--commit", head, "--workflow", "check.yml", "--json", "status,conclusion", "--limit", "1"]) || "[]");
  if (!runs.length) falhar("o CI ainda não rodou neste commit (gh run list vazio)");
  if (runs[0].status !== "completed") falhar("o CI deste commit ainda está rodando — espere terminar");
  if (runs[0].conclusion !== "success") falhar(`o CI deste commit terminou em "${runs[0].conclusion}" — conserte antes de publicar`);
  console.log("✓ CI verde neste commit");
}

// A tag primeiro: o GitHub só aceita alvo por SHA completo ou branch, e a tag deixa a
// versão marcada no histórico do git também.
try { sh("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]); } catch { sh("git", ["tag", tag, head]); }
sh("git", ["push", "-q", "origin", tag]);

// Assinatura (bloco 115): o ELYSIUM instalado só roda instalador assinado por este PC. A
// impressão digital vem do próprio atualizacao.ts — uma cópia aqui divergiria na primeira
// troca de chave, e aí toda release sairia recusada.
{
  const fonte = fs.readFileSync(path.join(raiz, "src", "services", "atualizacao.ts"), "utf8");
  const impressao = /ASSINATURAS_ACEITAS = \["([0-9A-F]{40})"/.exec(fonte)?.[1];
  if (!impressao) falhar("não achei ASSINATURAS_ACEITAS no atualizacao.ts");
  const alvo = instalador.replace(/'/g, "''");
  const ps = [
    // Sem isto o PowerShell despeja o progresso ("Preparando módulos…") em CLIXML no terminal.
    "$ProgressPreference = 'SilentlyContinue'",
    `$c = Get-ChildItem Cert:\\CurrentUser\\My -CodeSigningCert | Where-Object Thumbprint -eq '${impressao}' | Select-Object -First 1`,
    "if (-not $c) { 'SEM_CERTIFICADO'; exit 0 }",
    `$s = Get-AuthenticodeSignature -LiteralPath '${alvo}'`,
    `if ($s.SignerCertificate.Thumbprint -ne '${impressao}') {`,
    // Carimbo de tempo: a assinatura continua valendo depois que o certificado vencer (2036).
    `  try { $null = Set-AuthenticodeSignature -LiteralPath '${alvo}' -Certificate $c -HashAlgorithm SHA256 -TimestampServer 'http://timestamp.digicert.com' -ErrorAction Stop }`,
    `  catch { $null = Set-AuthenticodeSignature -LiteralPath '${alvo}' -Certificate $c -HashAlgorithm SHA256 }`,
    "}",
    `$v = Get-AuthenticodeSignature -LiteralPath '${alvo}'`,
    '"$($v.Status)|$($v.SignerCertificate.Thumbprint)"',
  ].join("\n");
  const saida = String(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")], { encoding: "utf8" })).trim();
  if (saida === "SEM_CERTIFICADO") falhar(`o certificado ${impressao} não está em Cert:\\CurrentUser\\My — restaure o .pfx do backup (scripts/backup-chaves.ps1)`);
  const [status, lida] = saida.split("|");
  if (lida !== impressao || !["Valid", "UnknownError"].includes(status)) falhar(`a assinatura não conferiu depois de assinar (${saida})`);
  console.log(`✓ instalador assinado (${impressao.slice(0, 8)}…)`);
}

let existe = true;
try { sh("gh", ["release", "view", tag, "--repo", REPO]); } catch { existe = false; }

if (existe) {
  console.log(`A release ${tag} já existe; substituindo o instalador.`);
  sh("gh", ["release", "upload", tag, instalador, "--clobber", "--repo", REPO], { stdio: "inherit" });
} else {
  const arqNotas = path.join(raiz, "release", `notas-${versao}.md`);
  fs.writeFileSync(arqNotas, notas.trim() + "\n");
  sh("gh", ["release", "create", tag, instalador, "--repo", REPO, "--verify-tag", "--title", `ELYSIUM ${versao}`, "--notes-file", arqNotas], { stdio: "inherit" });
  fs.rmSync(arqNotas, { force: true });
}
console.log(`✓ ${tag} publicada em https://github.com/${REPO}/releases/tag/${tag}`);

// Poda (bloco 126): cada build deixava um instalador de ~76 MB em release/, e o disco C do
// PC chegou a 94% com 23 deles parados lá (1,7 GB). Todos estão no GitHub; aqui ficam só a
// versão publicada agora e a anterior, para um reinstalar rápido sem baixar.
{
  const versaoDe = (n) => /^ELYSIUM-Setup-(\d+)\.(\d+)\.(\d+)\.exe$/.exec(n)?.slice(1).map(Number);
  const pasta = path.join(raiz, "release");
  const antigos = fs.readdirSync(pasta)
    .filter(n => versaoDe(n))
    .sort((a, b) => { const x = versaoDe(a), y = versaoDe(b); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]; })
    .slice(2);
  let liberado = 0;
  for (const n of antigos) {
    for (const arq of [n, `${n}.blockmap`]) {
      const p = path.join(pasta, arq);
      try { liberado += fs.statSync(p).size; fs.rmSync(p); } catch { /* já não existe */ }
    }
  }
  if (antigos.length) console.log(`✓ ${antigos.length} instaladores antigos apagados de release/ (${Math.round(liberado / 1048576)} MB; continuam no GitHub)`);
}
