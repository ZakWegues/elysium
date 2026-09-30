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
