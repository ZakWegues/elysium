import { spawn, execFile, ChildProcess } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";

/**
 * O `hermes serve` que o ELYSIUM sobe para si (fase 21, bloco 213).
 *
 * Por que um servidor PRÓPRIO, e não o que o Zak já usa: o WebSocket do `hermes serve` só aceita
 * o token de sessão do processo (`HERMES_DASHBOARD_SESSION_TOKEN`, ou um aleatório por partida),
 * e esse token só o processo conhece. Subindo o nosso, o token é nosso; e o `--isolated` com
 * `-p ely` prende tudo ao perfil `ely` — sessões, memória e MCP separados do Hermes de uso normal.
 *
 * Medido em 09/10/2026: o servidor leva 9–14 s para subir; por isso ele sobe uma vez, na partida
 * do app, e fica de pé até o "Sair".
 */

export const PERFIL_PADRAO = "ely";

/** Onde o instalador oficial do Hermes põe o executável no Windows. */
export function acharHermes(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidatos = [
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "hermes", "bin", "hermes.exe") : "",
    env.USERPROFILE ? path.join(env.USERPROFILE, ".hermes", "bin", "hermes.exe") : "",
  ].filter(Boolean);
  return candidatos.find(c => fs.existsSync(c)) ?? null;
}

/** Uma porta livre no 127.0.0.1, escolhida pelo sistema. */
export function portaLivre(): Promise<number> {
  return new Promise((ok, erro) => {
    const s = net.createServer();
    s.unref();
    s.on("error", erro);
    s.listen(0, "127.0.0.1", () => {
      const porta = (s.address() as net.AddressInfo).port;
      s.close(() => ok(porta));
    });
  });
}

/** Esconde o token do MCP (`/mcp/<token>`) de qualquer texto que vá para log. Pura. */
export function mascararTokenMcp(t: string): string {
  return t.replace(/\/mcp\/[^\s"'/]+/g, "/mcp/***");
}

/** Roda um comando do Hermes e devolve a saída (sem shell: argumentos vão separados). */
export function rodarHermes(exe: string, args: string[], prazoMs = 60_000): Promise<string> {
  return new Promise((ok, erro) => {
    execFile(exe, args, { timeout: prazoMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (e, stdout, stderr) => {
      // Segurança (23.2): a mensagem do execFile traz a linha de comando inteira, e o `config set`
      // do MCP leva o token no caminho da URL — mascara antes de virar log.
      if (e) erro(new Error(mascararTokenMcp(`${args.slice(0, 3).join(" ")}: ${String(stderr || e.message).slice(0, 300)}`)));
      else ok(String(stdout));
    });
  });
}

/** O perfil existe? Lê a tabela do `hermes profile list` (a primeira coluna é o nome). Pura. */
export function perfilNaLista(saida: string, perfil: string): boolean {
  return saida.split(/\r?\n/).some(l => l.replace(/^[\s◆*]+/, "").split(/\s+/)[0] === perfil);
}

/**
 * Garante o perfil `ely`: cria clonando o perfil ativo (modelo e chave do dono, sem o ELYSIUM ler
 * a chave) e desliga a memória do Hermes nele — a memória pessoal mora só no ELYSIUM.
 */
export async function garantirPerfil(exe: string, perfil = PERFIL_PADRAO): Promise<void> {
  const lista = await rodarHermes(exe, ["profile", "list"]);
  if (perfilNaLista(lista, perfil)) return;
  console.log(`[hermes] criando o perfil "${perfil}"`);
  await rodarHermes(exe, ["profile", "create", perfil, "--clone", "--no-alias", "--description", "Cerebro da Ely, a assistente do ELYSIUM."], 180_000);
  await rodarHermes(exe, ["-p", perfil, "config", "set", "memory.memory_enabled", "false"]);
  await rodarHermes(exe, ["-p", perfil, "config", "set", "memory.user_profile_enabled", "false"]);
  // A ferramenta de memória escreve o MEMORY.md do perfil mesmo com a injeção desligada.
  await rodarHermes(exe, ["-p", perfil, "tools", "disable", "memory"]).catch(() => "");
}

/**
 * Registra o servidor MCP do ELYSIUM no perfil (bloco 213), se ainda não estiver lá com a URL
 * certa. A URL carrega o token do MCP no caminho e só é atendida vinda do próprio PC.
 */
export async function garantirMcp(exe: string, url: string, perfil = PERFIL_PADRAO): Promise<void> {
  // 🔴 Não use `hermes mcp add`: ele é interativo (pergunta autenticação, quais ferramentas
  // ligar e "sobrescrever?") e trava esperando um teclado que não existe. O `config set` grava a
  // mesma chave do config.yaml do perfil sem perguntar nada.
  const atual = (await rodarHermes(exe, ["-p", perfil, "config", "get", "mcp_servers.elysium.url"]).catch(() => "")).trim();
  if (atual.endsWith(url)) return;
  await rodarHermes(exe, ["-p", perfil, "config", "set", "mcp_servers.elysium.url", url]);
  await rodarHermes(exe, ["-p", perfil, "config", "set", "mcp_servers.elysium.enabled", "true"]);
  console.log("[hermes] ferramentas do ELYSIUM registradas no perfil");
}

/**
 * Encerra o Hermes com os filhos. O `hermes.exe` é um lançador que sobe um `python.exe` (medido
 * em 09/10): `kill()` só fecha o lançador e o Python ficava órfão segurando a porta. No Windows,
 * `taskkill /T` leva a árvore inteira.
 */
export function encerrarArvore(filho: ChildProcess): void {
  if (filho.exitCode !== null || !filho.pid) return;
  if (process.platform === "win32") {
    try { execFile("taskkill", ["/PID", String(filho.pid), "/T", "/F"], { windowsHide: true }, () => {}); return; } catch { /* cai no kill */ }
  }
  try { filho.kill(); } catch { /* já saiu */ }
}

export interface ServidorHermes {
  url: string;
  porta: number;
  filho: ChildProcess;
}

/** Sobe o `hermes serve` do perfil e espera ele atender. */
export async function subirServidor(exe: string, perfil = PERFIL_PADRAO, prazoMs = 60_000): Promise<ServidorHermes> {
  const porta = await portaLivre();
  const token = crypto.randomBytes(24).toString("base64url");
  const filho = spawn(exe, ["-p", perfil, "serve", "--port", String(porta), "--host", "127.0.0.1", "--skip-build", "--isolated"], {
    env: { ...process.env, HERMES_DASHBOARD_SESSION_TOKEN: token },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // A saída do Hermes não vai para o nosso log (pode ter o que ele conversa); só as últimas
  // linhas ficam em memória para explicar uma falha de partida.
  let cauda = "";
  const guardar = (d: Buffer) => { cauda = (cauda + d.toString()).slice(-1500); };
  filho.stdout?.on("data", guardar);
  filho.stderr?.on("data", guardar);
  let morreu: string | null = null;
  filho.on("exit", (c) => { morreu = `saiu com código ${c}`; });

  const inicio = Date.now();
  while (Date.now() - inicio < prazoMs) {
    if (morreu) throw new Error(`o Hermes ${morreu}: ${cauda.replace(/\s+/g, " ").slice(-300)}`);
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/api/status`);
      if (r.ok) return { url: `ws://127.0.0.1:${porta}/api/ws?token=${encodeURIComponent(token)}`, porta, filho };
    } catch { /* ainda subindo */ }
    await new Promise(r => setTimeout(r, 500));
  }
  encerrarArvore(filho);
  throw new Error("o Hermes não subiu em 60 s");
}
