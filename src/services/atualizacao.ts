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
  /** Só do APK: o versionCode, lido da linha "versionCode N" que o script põe nas notas (07/10). */
  versionCode?: number;
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

export interface AssetGitHub { id: number; name: string; size: number; digest?: string | null }
export interface ReleaseGitHub { tag_name: string; body?: string | null; published_at: string; draft: boolean; prerelease: boolean; assets: AssetGitHub[] }

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

/**
 * A release de MAIOR versão (07/10). O `releases/latest` é a que o GitHub marcou como mais
 * recente, e isso nem sempre bate com a maior tag (uma republicação antiga mexe na marca).
 * E 404 aqui não é "sem release": num repositório privado é o token sem acesso a ele — antes
 * virava "nenhuma versão nova" em silêncio.
 */
export function maiorRelease(rels: ReleaseGitHub[]): ReleaseGitHub | null {
  let melhor: ReleaseGitHub | null = null;
  for (const r of rels) {
    if (r.draft || r.prerelease) continue;
    if (!melhor || compararVersoes(r.tag_name, melhor.tag_name) > 0) melhor = r;
  }
  return melhor;
}

async function ultimaRelease(repo: string, tk: string): Promise<ReleaseGitHub | null> {
  const r = await fetch(`https://api.github.com/repos/${DONO}/${repo}/releases?per_page=20`, {
    headers: { Authorization: `Bearer ${tk}`, Accept: "application/vnd.github+json", "User-Agent": "ELYSIUM", "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 404) throw new Error(`o token do GitHub não enxerga o repositório ${repo} (404)`);
  if (r.status === 401) throw new Error("o token do GitHub foi recusado (401)");
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
  return maiorRelease(await r.json() as ReleaseGitHub[]);
}

/**
 * Baixa um asset de release privada. A API responde 302 para um endereço assinado do
 * armazenamento do GitHub; o redirecionamento é seguido À MÃO para não mandar o token para
 * outro domínio (o armazenamento recusa pedido com dois tipos de autenticação).
 * Confere o SHA-256 contra o `digest` que o GitHub publica para cada asset.
 */
async function baixarAsset(repo: string, asset: AssetGitHub, destino: string, tk: string, aoProgresso: (p: number) => void): Promise<void> {
  const api = `https://api.github.com/repos/${DONO}/${repo}/releases/assets/${asset.id}`;
  let vigia: { parar: AbortController; rearmar: () => void; fim: () => void } | null = null;
  let r = await fetch(api, {
    headers: { Authorization: `Bearer ${tk}`, Accept: "application/octet-stream", "User-Agent": "ELYSIUM" },
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  if (r.status >= 300 && r.status < 400) {
    const onde = r.headers.get("location");
    if (!onde) throw new Error("redirecionamento sem destino");
    // 🔴 07/10: sem prazo aqui, um download parado deixava `baixando` em true para sempre e
    // nenhuma verificação seguinte baixava nada até reiniciar o app. O prazo é de INATIVIDADE
    // (60 s sem bytes), não do download inteiro — 115 MB numa rede lenta passam do minuto.
    const parar = new AbortController();
    let parado: NodeJS.Timeout = setTimeout(() => parar.abort(), 60_000);
    r = await fetch(onde, { headers: { "User-Agent": "ELYSIUM" }, signal: parar.signal });
    vigia = { parar, rearmar: () => { clearTimeout(parado); parado = setTimeout(() => parar.abort(), 60_000); }, fim: () => clearTimeout(parado) };
  }
  if (!r.ok || !r.body) { vigia?.fim(); throw new Error(`download respondeu ${r.status}`); }

  const temp = `${destino}.parcial`;
  const hash = crypto.createHash("sha256");
  const saida = fs.createWriteStream(temp);
  let lidos = 0, ultimoAviso = 0;
  try {
    for await (const pedaco of Readable.fromWeb(r.body as never)) {
      const b = pedaco as Buffer;
      vigia?.rearmar();
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
  } finally {
    vigia?.fim();
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

/** "…\nversionCode 20" no fim das notas → 20. Pura. */
export function versionCodeDasNotas(notas: string): number | undefined {
  const m = /versionCode (\d+)/.exec(notas);
  return m ? parseInt(m[1], 10) : undefined;
}

function pacoteDe(rel: ReleaseGitHub, asset: AssetGitHub): Pacote {
  const arquivo = path.join(pasta(), asset.name);
  const pronto = fs.existsSync(arquivo) && fs.statSync(arquivo).size === asset.size;
  return {
    versionCode: /\.apk$/i.test(asset.name) ? versionCodeDasNotas(rel.body ?? "") : undefined,
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
  let arquivos: string[] = [];
  try { arquivos = fs.readdirSync(pasta()); } catch { return; /* pasta sumiu: nada a limpar */ }
  // Um por um (07/10): o APK velho em uso pelo celular (sendo baixado) fica travado no
  // Windows, e um único try em volta do laço parava a limpeza inteira ali.
  for (const f of arquivos) {
    const p = path.join(pasta(), f);
    if (manter.includes(p)) continue;
    try { fs.rmSync(p, { force: true }); } catch { /* em uso: fica para a próxima */ }
  }
}

/**
 * Versões cujo instalador veio SEM a assinatura deste PC (07/10). Antes o arquivo era
 * apagado e a verificação seguinte (6 h depois) baixava de novo, para sempre.
 */
const rejeitadas = new Set<string>();

let baixando = false;

async function baixarPendentes(tk: string, assetPc?: AssetGitHub, assetCel?: AssetGitHub): Promise<void> {
  baixando = true;
  const falhou = (oque: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[atualizacao] download do ${oque} falhou:`, msg);
    mudar({ erro: `download do ${oque}: ${msg}` });
  };
  try {
    // Cada um no seu try (07/10): o .exe falhando não impede mais o APK do celular.
    const d = estado.desktop;
    if (d && !d.pronto && assetPc && !rejeitadas.has(d.versao)) {
      try {
        await baixarAsset(REPO_DESKTOP, assetPc, d.arquivo, tk, p => { if (estado.desktop?.versao === d.versao) mudar({ desktop: { ...estado.desktop, progresso: p } }); });
        // "Pronto" só se ainda é a MESMA versão: uma verificação no meio do download pode ter
        // trocado o pacote, e marcar o novo como pronto apontava para um arquivo que não existe.
        if (estado.desktop?.versao === d.versao) {
          mudar({ desktop: { ...estado.desktop, progresso: 1, pronto: true } });
          // Sem assinatura: some do disco e o APK do celular segue sendo baixado.
          if (!app.isPackaged || (await conferirAssinatura(estado.desktop!))) console.log(`[atualizacao] ELYSIUM ${d.versao} baixado.`);
        }
      } catch (e) { falhou("ELYSIUM", e); }
    }
    const c = estado.celular;
    if (c && !c.pronto && assetCel) {
      try {
        await baixarAsset(REPO_CELULAR, assetCel, c.arquivo, tk, p => { if (estado.celular?.versao === c.versao) mudar({ celular: { ...estado.celular, progresso: p } }); });
        if (estado.celular?.versao === c.versao) {
          mudar({ celular: { ...estado.celular, progresso: 1, pronto: true } });
          console.log(`[atualizacao] ELYSIUM-M ${c.versao} guardado para o celular.`);
        }
      } catch (e) { falhou("ELYSIUM-M", e); }
    }
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

    // Cada repositório por si (07/10): o token sem acesso a um deles não pode esconder o outro.
    const erros: string[] = [];
    // Repositório que FALHOU (rede, 404) é diferente de "sem release": o pacote que já estava
    // baixado dele fica — antes ele sumia do estado e o `limparAntigos` apagava o arquivo.
    const falhou = new Set<string>();
    const pegar = (repo: string) => ultimaRelease(repo, tk).catch((e: unknown) => { erros.push(e instanceof Error ? e.message : String(e)); falhou.add(repo); return null; });
    const [relPc, relCel] = await Promise.all([pegar(REPO_DESKTOP), pegar(REPO_CELULAR)]);
    if (erros.length === 2) throw new Error(erros[0]);
    const assetPc = relPc?.assets.find(a => /\.exe$/i.test(a.name));
    const assetCel = relCel?.assets.find(a => /\.apk$/i.test(a.name));

    // Só interessa o instalador se for MAIS NOVO que o que está rodando.
    const desktop = falhou.has(REPO_DESKTOP) ? estado.desktop : relPc && assetPc && compararVersoes(relPc.tag_name, estado.atual) > 0 ? pacoteDe(relPc, assetPc) : undefined;
    // O APK é guardado sempre (o PC não sabe a versão do celular; quem compara é o app).
    const celular = falhou.has(REPO_CELULAR) ? estado.celular : relCel && assetCel ? pacoteDe(relCel, assetCel) : undefined;
    // Durante um download, o estado de quem está baixando fica como está: recriar o pacote
    // zeraria a barra até o próximo aviso de progresso.
    mudar({
      semToken: false,
      desktop: baixando && desktop && estado.desktop?.versao === desktop.versao ? estado.desktop : desktop,
      celular: baixando && celular && estado.celular?.versao === celular.versao ? estado.celular : celular,
      verificadoEm: Date.now(),
      erro: erros[0],
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
// ── Assinatura (bloco 115) ───────────────────────────────────────────────────
//
// O SHA-256 confere o download contra o próprio GitHub — protege de arquivo corrompido, não
// de uma release maliciosa: quem publicasse no repositório rodaria código aqui, de
// madrugada. Desde a 1.6.0 o instalador sai assinado pelo certificado que mora SÓ neste PC
// (`CN=ELYSIUM (Zak)`, em Cert:\CurrentUser\My; backup no scripts/backup-chaves.ps1), e o
// atualizador só roda o que tiver essa assinatura.
//
// Autoassinado, então o Windows responde "UnknownError" (a raiz não é confiada) e não
// "Valid" — e isso basta: o que importa é QUEM assinou (a impressão digital fixada abaixo) e
// que o arquivo não mudou depois (mudou = "HashMismatch", outro estado). Não se instala a
// raiz nas lojas de confiança do Windows de propósito: é configuração de segurança do
// sistema, e o pino da impressão digital já resolve.
//
// Lista, não constante única: se um dia a chave for trocada, a versão que troca aceita as
// duas até todo PC ter passado por ela.

export const ASSINATURAS_ACEITAS = ["D4D614A814BE2294CCF4328C3EA78C2E7CCCA08C"];

/** Pura, para teste. */
export function assinaturaConfere(status: string, impressao: string, aceitas: string[] = ASSINATURAS_ACEITAS): boolean {
  return (status === "Valid" || status === "UnknownError") && aceitas.includes(impressao.trim().toUpperCase());
}

function lerAssinatura(arquivo: string): Promise<{ status: string; impressao: string }> {
  const script = `$s = Get-AuthenticodeSignature -LiteralPath '${arquivo.replace(/'/g, "''")}'; "$($s.Status)|$($s.SignerCertificate.Thumbprint)"`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { timeout: 30000, windowsHide: true }, (err, out) => {
      if (err) { resolve({ status: "erro", impressao: "" }); return; }
      const [status = "", impressao = ""] = String(out).trim().split("|");
      resolve({ status, impressao });
    });
  });
}

/** O instalador baixado tem a assinatura deste PC? Se não tiver, some do disco. */
async function conferirAssinatura(d: Pacote): Promise<boolean> {
  const a = await lerAssinatura(d.arquivo);
  if (assinaturaConfere(a.status, a.impressao)) return true;
  // Falha do PowerShell ("erro") não é assinatura errada: não rejeita a versão, tenta de novo.
  if (a.status !== "erro") rejeitadas.add(d.versao);
  console.error(`[atualizacao] ${d.versao} NÃO tem a assinatura deste PC (status ${a.status}, ${a.impressao || "sem certificado"}); apagando e não instalando.`);
  try { fs.rmSync(d.arquivo, { force: true }); } catch { /* segue */ }
  mudar({ desktop: { ...d, pronto: false, progresso: 0 }, erro: `a versão ${d.versao} não tem a assinatura do ELYSIUM — não instalei` });
  return false;
}

export async function instalarAtualizacaoDesktop(): Promise<{ ok: boolean; mensagem: string }> {
  const d = estado.desktop;
  if (!d?.pronto || !fs.existsSync(d.arquivo)) return { ok: false, mensagem: "Nenhuma atualização baixada." };
  if (!app.isPackaged) return { ok: false, mensagem: "Em desenvolvimento o instalador não roda — ele substituiria a versão instalada." };
  // Ponto único de passagem: botão, celular e madrugada chegam todos aqui.
  if (!(await conferirAssinatura(d))) return { ok: false, mensagem: `A versão ${d.versao} não tem a assinatura do ELYSIUM; não instalei.` };
  // As notas vão junto para a versão nova mostrar na Início ao abrir.
  gravarNovidades({ ...lerNovidades(), notas: { versao: d.versao, texto: d.notas } });
  // Só fecha o app quando o instalador DE FATO abriu (07/10). Antes o `setTimeout(sair)`
  // rodava de qualquer jeito: se o spawn falhasse, o ELYSIUM fechava e não voltava — e o
  // celular perdia o PC até alguém abrir o app na mão.
  const abriu = await new Promise<boolean>((resolve) => {
    let filho: ReturnType<typeof spawn>;
    try { filho = spawn(d.arquivo, ["/S", "--updated", "--force-run"], { detached: true, stdio: "ignore", windowsHide: true }); }
    catch { resolve(false); return; }
    filho.once("spawn", () => { filho.unref(); resolve(true); });
    filho.once("error", (e) => { console.error("[atualizacao] o instalador não abriu:", e.message); resolve(false); });
  });
  if (!abriu) {
    mudar({ erro: `o instalador da ${d.versao} não abriu` });
    return { ok: false, mensagem: `O instalador da versão ${d.versao} não abriu; o ELYSIUM continua na ${estado.atual}.` };
  }
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
    void instalarAtualizacaoDesktop();
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
