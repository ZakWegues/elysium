/**
 * Publica a ponte (`ponte/`) no Cloudflare de quem está logado no wrangler e liga este PC a ela.
 *
 *   npx wrangler@4 login     (uma vez; abre o navegador)
 *   node scripts/publicar-ponte.mjs
 *
 * O segredo da ponte é criado aqui, vai para o Cloudflare pela entrada do wrangler e fica em
 * `ponte.json`, na pasta de dados do app. Nunca é impresso. Publicar de novo mantém o mesmo.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "ponte");
const arquivo = path.join(process.env.APPDATA, "elysium", "ponte.json");
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(arquivo, "utf8")); } catch { /* primeira vez */ }
cfg.segredo = /^[0-9a-f]{64}$/.test(cfg.segredo ?? "") ? cfg.segredo : crypto.randomBytes(32).toString("hex");
cfg.sala = /^[0-9a-f]{32}$/.test(cfg.sala ?? "") ? cfg.sala : crypto.randomBytes(16).toString("hex");

function wrangler(args, input) {
  const r = spawnSync("npx", ["--yes", "wrangler@4", ...args], { cwd: pasta, input, encoding: "utf8", shell: true, env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status !== 0) { console.error(saida); process.exit(1); }
  return saida;
}

const saida = wrangler(["deploy"]);
const url = /https:\/\/[a-z0-9.-]+\.workers\.dev/.exec(saida)?.[0];
if (!url) { console.error(saida); throw new Error("o wrangler não disse o endereço da ponte"); }
wrangler(["secret", "put", "PONTE_SEGREDO"], cfg.segredo);
fs.writeFileSync(arquivo, JSON.stringify({ ligada: true, ...cfg, url }, null, 2));
console.log("ponte publicada e guardada em ponte.json");
