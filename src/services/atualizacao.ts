import { app, powerMonitor } from "electron";
import { execFile, spawn } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import { getConfig, getGithubToken } from "../main/config";

/**
 * Atualização automática (bloco 95).
 *
 * As versões saem como releases nos repositórios do GitHub (`ZakWegues/elysium` com o
 * instalador, `ZakWegues/elysium-m` com o APK). O PC confere de tempos em tempos, baixa
 * sozinho o que for novo e:
 *
 * - **desktop**: instala quando o Zak pedir — o instalador roda em silêncio (`/S`) e o
 *   próprio NSIS reabre o app (`--force-run`). Não instala sozinho porque o app vive na
 *   bandeja e quase nunca fecha; "instalar ao sair" nunca aconteceria, e instalar sem
 *   perguntar derrubaria uma conversa no meio.
 * - **celular**: o APK fica guardado no PC e o app do celular baixa por `/api/update/apk`,
 *   com o mesmo token de sempre. Assim o celular não precisa de credencial do GitHub nem
 *   de internet — só de alcançar o PC.
 *
 * **Sem `electron-updater`, de propósito.** Ele exigiria o `latest.yml` + blockmap em cada
 * release e, com repositório privado, um token gravado no `app-update.yml` dentro do
 * instalador. Aqui são ~200 linhas sem dependência nova, e o token nunca sai do userData.
 *
 * **O token**: os repositórios são privados. Vale, nesta ordem, o token colado em Ajustes
 * (fica ao lado da chave da Groq, fora do backup) e o login do `gh` desta máquina. Ele só
 * dá leitura a um código que já está dentro do próprio instalador — o `app.asar` é JS puro —,
 * então vazar o token não entrega nada que o arquivo baixado já não entregasse.
 */

const DONO = "ZakWegues";
const REPO_DESKTOP = "elysium";
const REPO_CELULAR = "elysium-m";
const INTERVALO_MS = 6 * 60 * 60 * 1000;
const PRIMEIRA_VERIFICACAO_MS = 90 * 1000;

export interface Pacote {
  versao: string;
  notas: string;
  publicadaEm: string;
  arquivo: string;
  tamanho: number;
  /** 0–1 enquanto baixa; 1 quando está no disco e conferido. */
  progresso: number;
  pronto: boolean;
}

export interface EstadoAtualizacao {
  atual: string;
  verificando: boolean;
  verificadoEm?: number;
  erro?: string;
  /** Sem token nenhum: a tela diz o que fazer em vez de "falhou". */
  semToken?: boolean;
  desktop?: Pacote;
  celular?: Pacote;
}

interface AssetGitHub { id: number; name: string; size: number; digest?: string | null }
interface ReleaseGitHub { tag_name: string; body?: string | null; published_at: string; draft: boolean; prerelease: boolean; assets: AssetGitHub[] }

let estado: EstadoAtualizacao = { atual: app.getVersion(), verificando: false };
const ouvintes = new Set<(e: EstadoAtualizacao) => void>();
let sair: () => void = () => app.quit();
let timer: NodeJS.Timeout | null = null;
let tokenDoGh: { valor: string; em: number } | null = null;

// ── versões ──────────────────────────────────────────────────────────────────

/** "v1.10.2" → [1,10,2]. Sufixo de pré-lançamento é ignorado: release marcada como tal nem entra. */
export function partesDaVersao(v: string): number[] {
  return v.trim().replace(/^v/i, "").split(/[-+]/)[0].split(".").map(n => parseInt(n, 10) || 0);
}

/** >0 se `a` é mais nova que `b`. Compara número a número — "1.10.0" é mais nova que "1.9.0". */
export function compararVersoes(a: string, b: string): number {
  const pa = partesDaVersao(a), pb = partesDaVersao(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

// ── estado ───────────────────────────────────────────────────────────────────

export function estadoAtualizacao(): EstadoAtualizacao {
  return { ...estado };
}

export function aoMudarAtualizacao(cb: (e: EstadoAtualizacao) => void): () => void {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

function mudar(patch: Partial<EstadoAtualizacao>): void {
  estado = { ...estado, ...patch };
  for (const cb of ouvintes) { try { cb(estadoAtualizacao()); } catch { /* ouvinte quebrado não derruba os outros */ } }
}

function pasta(): string {
  const p = path.join(app.getPath("userData"), "atualizacoes");
  fs.mkdirSync(p, { recursive: true });
  return p;
}

// ── token ────────────────────────────────────────────────────────────────────

function lerTokenDoGh(): Promise<string> {
  // Cache de 1 h: o `gh` leva ~300 ms para responder e o token dele não muda sozinho.
  if (tokenDoGh && Date.now() - tokenDoGh.em < 60 * 60 * 1000) return Promise.resolve(tokenDoGh.valor);
  const candidatos = ["gh", path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "GitHub CLI", "gh.exe")];
  const tentar = (i: number): Promise<string> => new Promise(resolve => {
    if (i >= candidatos.length) { resolve(""); return; }
    execFile(candidatos[i], ["auth", "token"], { timeout: 5000, windowsHide: true }, (err, out) => {
      const t = String(out ?? "").trim();
      if (err || !t) { resolve(tentar(i + 1)); return; }
      tokenDoGh = { valor: t, em: Date.now() };
      resolve(t);
    });
  });
  return tentar(0);
}

async function token(): Promise<string> {
  return getGithubToken() || await lerTokenDoGh();
}

// ── GitHub ───────────────────────────────────────────────────────────────────

async function ultimaRelease(repo: string, tk: string): Promise<ReleaseGitHub | null> {
  const r = await fetch(`https://api.github.com/repos/${DONO}/${repo}/releases/latest`, {
    headers: { Authorization: `Bearer ${tk}`, Accept: "application/vnd.github+json", "User-Agent": "ELYSIUM", "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 404) return null; // repositório sem release ainda
  if (r.status === 401) throw new Error("o token do GitHub foi recusado (401)");
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
  const rel = await r.json() as ReleaseGitHub;
  return rel.draft || rel.prerelease ? null : rel;
}

/**
 * Baixa um asset de release privada. A API responde 302 para um endereço assinado do
 * armazenamento do GitHub; o redirecionamento é seguido À MÃO para não mandar o token para
 * outro domínio (o armazenamento recusa pedido com dois tipos de autenticação).
 * Confere o SHA-256 contra o `digest` que o GitHub publica para cada asset.
 */
async function baixarAsset(repo: string, asset: AssetGitHub, destino: string, tk: string, aoProgresso: (p: number) => void): Promise<void> {
  const api = `https://api.github.com/repos/${DONO}/${repo}/releases/assets/${asset.id}`;
  let r = await fetch(api, {
    headers: { Authorization: `Bearer ${tk}`, Accept: "application/octet-stream", "User-Agent": "ELYSIUM" },
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  if (r.status >= 300 && r.status < 400) {
    const onde = r.headers.get("location");
    if (!onde) throw new Error("redirecionamento sem destino");
    r = await fetch(onde, { headers: { "User-Agent": "ELYSIUM" } });
  }
  if (!r.ok || !r.body) throw new Error(`download respondeu ${r.status}`);

  const temp = `${destino}.parcial`;
  const hash = crypto.createHash("sha256");
  const saida = fs.createWriteStream(temp);
  let lidos = 0, ultimoAviso = 0;
  try {
    for await (const pedaco of Readable.fromWeb(r.body as never)) {
      const b = pedaco as Buffer;
      hash.update(b);
      lidos += b.length;
      if (!saida.write(b)) await new Promise<void>(res => saida.once("drain", () => res()));
      // Avisa no máximo a cada 1% — o renderer não precisa de um evento por pacote TCP.
      const p = asset.size ? lidos / asset.size : 0;
      if (p - ultimoAviso >= 0.01) { ultimoAviso = p; aoProgresso(Math.min(p, 0.99)); }
    }
    await new Promise<void>((res, rej) => saida.end((e?: Error | null) => e ? rej(e) : res()));
  } catch (e) {
    saida.destroy();
    fs.rmSync(temp, { force: true });
    throw e;
  }

  if (asset.size && lidos !== asset.size) {
    fs.rmSync(temp, { force: true });
    throw new Error(`download incompleto (${lidos} de ${asset.size} bytes)`);
  }
  const esperado = asset.digest?.startsWith("sha256:") ? asset.digest.slice(7) : "";
  const obtido = hash.digest("hex");
  if (esperado && esperado.toLowerCase() !== obtido) {
    fs.rmSync(temp, { force: true });
    throw new Error("o arquivo baixado não confere com o da release (SHA-256)");
  }
  fs.renameSync(temp, destino);
}

// ── ciclo ────────────────────────────────────────────────────────────────────

function pacoteDe(rel: ReleaseGitHub, asset: AssetGitHub): Pacote {
  const arquivo = path.join(pasta(), asset.name);
  const pronto = fs.existsSync(arquivo) && fs.statSync(arquivo).size === asset.size;
  return {
    versao: rel.tag_name.replace(/^v/i, ""),
    notas: (rel.body ?? "").trim().slice(0, 2000),
    publicadaEm: rel.published_at,
    arquivo,
    tamanho: asset.size,
    progresso: pronto ? 1 : 0,
    pronto,
  };
}

/** Apaga o que sobrou de versões antigas — 80 MB + 110 MB por release não podem acumular. */
function limparAntigos(manter: string[]): void {
  try {
    for (const f of fs.readdirSync(pasta())) {
      const p = path.join(pasta(), f);
      if (!manter.includes(p)) fs.rmSync(p, { force: true });
    }
  } catch { /* pasta sumiu: nada a limpar */ }
}

let baixando = false;

async function baixarPendentes(tk: string, assetPc?: AssetGitHub, assetCel?: AssetGitHub): Promise<void> {
  baixando = true;
  try {
    const d = estado.desktop;
    if (d && !d.pronto && assetPc) {
      await baixarAsset(REPO_DESKTOP, assetPc, d.arquivo, tk, p => mudar({ desktop: { ...estado.desktop!, progresso: p } }));
      mudar({ desktop: { ...estado.desktop!, progresso: 1, pronto: true } });
      console.log(`[atualizacao] ELYSIUM ${d.versao} baixado.`);
    }
    const c = estado.celular;
    if (c && !c.pronto && assetCel) {
      await baixarAsset(REPO_CELULAR, assetCel, c.arquivo, tk, p => mudar({ celular: { ...estado.celular!, progresso: p } }));
      mudar({ celular: { ...estado.celular!, progresso: 1, pronto: true } });
      console.log(`[atualizacao] ELYSIUM-M ${c.versao} guardado para o celular.`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[atualizacao] download falhou:", msg);
    mudar({ erro: `download: ${msg}` });
  } finally { baixando = false; }
}

/** Espera o download em curso acabar (para quem precisa do arquivo pronto, como um teste). */
export async function aguardarDownloads(prazoMs = 10 * 60 * 1000): Promise<void> {
  const limite = Date.now() + prazoMs;
  while (baixando && Date.now() < limite) await new Promise(r => setTimeout(r, 500));
}

export async function verificarAtualizacoes(): Promise<EstadoAtualizacao> {
  if (estado.verificando) return estadoAtualizacao();
  mudar({ verificando: true, erro: undefined });
  try {
    const tk = await token();
    if (!tk) { mudar({ semToken: true, verificadoEm: Date.now() }); return estadoAtualizacao(); }

    const [relPc, relCel] = await Promise.all([ultimaRelease(REPO_DESKTOP, tk), ultimaRelease(REPO_CELULAR, tk)]);
    const assetPc = relPc?.assets.find(a => /\.exe$/i.test(a.name));
    const assetCel = relCel?.assets.find(a => /\.apk$/i.test(a.name));

    // Só interessa o instalador se for MAIS NOVO que o que está rodando.
    const desktop = relPc && assetPc && compararVersoes(relPc.tag_name, estado.atual) > 0 ? pacoteDe(relPc, assetPc) : undefined;
    // O APK é guardado sempre (o PC não sabe a versão do celular; quem compara é o app).
    const celular = relCel && assetCel ? pacoteDe(relCel, assetCel) : undefined;
    // Durante um download, o estado de quem está baixando fica como está: recriar o pacote
    // zeraria a barra até o próximo aviso de progresso.
    mudar({
      semToken: false,
      desktop: baixando && desktop && estado.desktop?.versao === desktop.versao ? estado.desktop : desktop,
      celular: baixando && celular && estado.celular?.versao === celular.versao ? estado.celular : celular,
      verificadoEm: Date.now(),
    });
    // Nunca com download em curso: o `.parcial` que está sendo escrito não está na lista de
    // quem fica, e seria apagado debaixo do próprio download.
    if (!baixando) {
      limparAntigos([desktop?.arquivo, celular?.arquivo].filter((x): x is string => !!x));
      // Em segundo plano: quem pediu a verificação (a tela, o celular) recebe a resposta na
      // hora e acompanha o progresso pelos eventos — esperar 80 + 115 MB aqui estourava o
      // prazo do celular e deixava a tela em "Procurando…" durante o download inteiro.
      void baixarPendentes(tk, assetPc, assetCel);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[atualizacao] falhou:", msg);
    mudar({ erro: msg, verificadoEm: Date.now() });
  } finally {
    mudar({ verificando: false });
  }
  return estadoAtualizacao();
}

/**
 * Roda o instalador em silêncio e fecha o app. `--updated` faz o NSIS tratar como
 * atualização (sem perguntar pasta, mesma instalação de antes) e `--force-run` o faz abrir o
 * ELYSIUM de novo ao terminar. O instalador espera o app sair antes de copiar os arquivos.
 */
export function instalarAtualizacaoDesktop(): { ok: boolean; mensagem: string } {
  const d = estado.desktop;
  if (!d?.pronto || !fs.existsSync(d.arquivo)) return { ok: false, mensagem: "Nenhuma atualização baixada." };
  if (!app.isPackaged) return { ok: false, mensagem: "Em desenvolvimento o instalador não roda — ele substituiria a versão instalada." };
  // As notas vão junto para a versão nova mostrar na Início ao abrir.
  gravarNovidades({ ...lerNovidades(), notas: { versao: d.versao, texto: d.notas } });
  const filho = spawn(d.arquivo, ["/S", "--updated", "--force-run"], { detached: true, stdio: "ignore", windowsHide: true });
  filho.unref();
  console.log(`[atualizacao] instalando ${d.versao}; o app fecha agora e volta sozinho.`);
  setTimeout(sair, 400);
  return { ok: true, mensagem: `Instalando a versão ${d.versao}. O ELYSIUM volta em alguns segundos.` };
}

// ── Novidades ────────────────────────────────────────────────────────────────
//
// Depois de atualizar, a Início mostra UMA vez o que mudou. As notas são guardadas na hora
// de instalar (o instalador baixado já as tinha); se a versão chegou por instalação manual,
// vêm da release da própria tag. Fora da pasta `atualizacoes/`, que é limpa a cada verificação.

interface RegistroNovidades {
  vista?: string;
  notas?: { versao: string; texto: string };
  /** A versão que rodou por último, e a de antes dela — para juntar as notas de versões puladas. */
  rodando?: string;
  anterior?: string;
}

/**
 * As notas de todas as versões depois de `desde` até `atual`, da mais nova para a mais
 * velha. Quem pula versões (a madrugada pode ir da 1.5.2 direto para a 1.5.4) vê o que
 * mudou em cada uma, não só na última. Pura, para teste.
 */
export function juntarNotas(releases: { tag_name: string; body?: string | null }[], desde: string, atual: string): string {
  const escolhidas = releases
    .filter(r => compararVersoes(r.tag_name, desde) > 0 && compararVersoes(r.tag_name, atual) <= 0 && (r.body ?? "").trim())
    .sort((a, b) => compararVersoes(b.tag_name, a.tag_name));
  if (escolhidas.length <= 1) return (escolhidas[0]?.body ?? "").trim();
  return escolhidas.map(r => `${r.tag_name.replace(/^v/i, "")}: ${(r.body ?? "").trim()}`).join("\n\n");
}

function arquivoNovidades(): string {
  return path.join(app.getPath("userData"), "novidades.json");
}

function lerNovidades(): RegistroNovidades {
  try { return JSON.parse(fs.readFileSync(arquivoNovidades(), "utf8")) as RegistroNovidades; } catch { return {}; }
}

function gravarNovidades(r: RegistroNovidades): void {
  try { fs.writeFileSync(arquivoNovidades(), JSON.stringify(r)); } catch { /* só não lembra */ }
}

export async function novidadesPendentes(): Promise<{ versao: string; notas: string } | null> {
  const atual = app.getVersion();
  let r = lerNovidades();
  if (r.rodando !== atual) {
    r = { ...r, anterior: r.rodando, rodando: atual };
    gravarNovidades(r);
  }
  if (r.vista === atual) return null;

  // Pulou versões? Junta as notas de todas desde a última vista (ou a última que rodou).
  const desde = r.vista && compararVersoes(r.vista, atual) < 0 ? r.vista : r.anterior;
  if (desde && compararVersoes(atual, desde) > 0) {
    try {
      const tk = await token();
      if (tk) {
        const resp = await fetch(`https://api.github.com/repos/${DONO}/${REPO_DESKTOP}/releases?per_page=30`, {
          headers: { Authorization: `Bearer ${tk}`, Accept: "application/vnd.github+json", "User-Agent": "ELYSIUM" },
          signal: AbortSignal.timeout(15000),
        });
        if (resp.ok) {
          const texto = juntarNotas((await resp.json()) as ReleaseGitHub[], desde, atual);
          if (texto) return { versao: atual, notas: texto };
        }
      }
    } catch { /* cai na nota só desta versão */ }
  }

  if (r.notas?.versao === atual && r.notas.texto.trim()) return { versao: atual, notas: r.notas.texto };
  try {
    const tk = await token();
    if (!tk) return null;
    const resp = await fetch(`https://api.github.com/repos/${DONO}/${REPO_DESKTOP}/releases/tags/v${atual}`, {
      headers: { Authorization: `Bearer ${tk}`, Accept: "application/vnd.github+json", "User-Agent": "ELYSIUM" },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    const texto = String(((await resp.json()) as ReleaseGitHub).body ?? "").trim();
    if (!texto) return null;
    gravarNovidades({ ...r, notas: { versao: atual, texto } });
    return { versao: atual, notas: texto };
  } catch { return null; }
}

export function marcarNovidadesVistas(): void {
  gravarNovidades({ ...lerNovidades(), vista: app.getVersion() });
}

// ── De madrugada ─────────────────────────────────────────────────────────────
//
// O botão "instalar" quase nunca é clicado: o app vive na bandeja e a versão nova ficava
// baixada esperando. Com `atualizarDeMadrugada` (padrão ligado), ela instala sozinha entre
// 3 e 5 h — só com o PC parado há 15 min e o ELYSIUM sem ouvir, pensar ou falar. Instalar
// fecha o app por uns segundos; é a hora em que isso não atrapalha ninguém.

const OCIOSO_MIN_SEG = 15 * 60;

/** A janela de instalação automática. Pura, para teste. */
export function horaDeInstalarSozinho(agora: Date, pcParadoSeg: number, appOcupado: boolean): boolean {
  const h = agora.getHours();
  return h >= 3 && h < 5 && pcParadoSeg >= OCIOSO_MIN_SEG && !appOcupado;
}

let ocupado: () => boolean = () => false;
let timerMadrugada: NodeJS.Timeout | null = null;

function conferirMadrugada(): void {
  try {
    if (!estado.desktop?.pronto || !app.isPackaged || getConfig().atualizarDeMadrugada === false) return;
    if (!horaDeInstalarSozinho(new Date(), powerMonitor.getSystemIdleTime(), ocupado())) return;
    console.log("[atualizacao] madrugada e PC parado: instalando sozinho.");
    instalarAtualizacaoDesktop();
  } catch (e) { console.warn("[atualizacao] madrugada falhou:", e); }
}

export function iniciarAtualizacoes(opcoes: { sair: () => void; ocupado?: () => boolean }): void {
  sair = opcoes.sair;
  if (opcoes.ocupado) ocupado = opcoes.ocupado;
  estado = { atual: app.getVersion(), verificando: false };
  if (timer) return;
  setTimeout(() => { void verificarAtualizacoes(); }, PRIMEIRA_VERIFICACAO_MS);
  timer = setInterval(() => { void verificarAtualizacoes(); }, INTERVALO_MS);
  timerMadrugada = setInterval(conferirMadrugada, 10 * 60 * 1000);
}
