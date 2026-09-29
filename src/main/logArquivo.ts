import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * O log do processo principal em arquivo (bloco 97).
 *
 * Tudo o que o main escreve com `console.*` ia para o stdout de um app sem console — no
 * app instalado, para lugar nenhum. Metade das sessões de conserto começou reconstruindo o
 * que um log teria dito (o `voiceLocale` do bloco 62, o `invalid model name` do 78). Agora
 * cada linha vai também para `%APPDATA%\elysium\logs\elysium-AAAA-MM-DD.log`, com hora, e os
 * arquivos com mais de 7 dias são apagados ao abrir.
 *
 * 🔴 Nada de segredo no arquivo: a chave da Groq (`gsk_…`) e qualquer token de 64 hex (o
 * do servidor, o do Spotify) são mascarados ANTES de escrever. O log vai parar em
 * "copiar diagnóstico", que vai parar numa conversa.
 */

const DIAS = 7;
let pasta = "";
let arquivoDoDia = "";
let fila: string[] = [];
let agendado = false;

export function pastaDeLogs(): string {
  return pasta;
}

export function mascarar(texto: string): string {
  return texto
    .replace(/gsk_[A-Za-z0-9]{12,}/g, "gsk_[oculto]")
    .replace(/\b(gh[pousr]_|github_pat_)[A-Za-z0-9_]{16,}/g, "$1[oculto]")
    .replace(/\b[a-f0-9]{64}\b/gi, "[token oculto]")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{16,}/gi, "$1[oculto]");
}

function dia(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatar(args: unknown[]): string {
  return args.map(a => {
    if (typeof a === "string") return a;
    if (a instanceof Error) return a.stack ?? a.message;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(" ");
}

function descarregar(): void {
  agendado = false;
  if (!fila.length || !pasta) return;
  const hoje = path.join(pasta, `elysium-${dia()}.log`);
  arquivoDoDia = hoje;
  const bloco = fila.join("");
  fila = [];
  // Assíncrono e em lote: um console.log por quadro de telemetria não pode virar uma
  // escrita síncrona em disco no processo que também atende o microfone.
  fs.appendFile(hoje, bloco, () => { /* disco cheio ou sem permissão: o app segue */ });
}

function registrar(nivel: string, args: unknown[]): void {
  const agora = new Date();
  const hora = agora.toTimeString().slice(0, 8);
  fila.push(`${hora} ${nivel} ${mascarar(formatar(args))}\n`);
  if (fila.length > 500) fila.splice(0, fila.length - 500);
  if (!agendado) { agendado = true; setTimeout(descarregar, 250); }
}

export function iniciarLogEmArquivo(): void {
  try {
    pasta = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(pasta, { recursive: true });
    const limite = Date.now() - DIAS * 86_400_000;
    for (const f of fs.readdirSync(pasta)) {
      const m = f.match(/^elysium-(\d{4})-(\d{2})-(\d{2})\.log$/);
      if (m && new Date(+m[1], +m[2] - 1, +m[3]).getTime() < limite) fs.unlink(path.join(pasta, f), () => {});
    }
  } catch {
    pasta = "";
    return;
  }
  for (const [nome, nivel] of [["log", "INFO"], ["info", "INFO"], ["warn", "AVISO"], ["error", "ERRO"]] as const) {
    const original = console[nome].bind(console);
    console[nome] = (...args: unknown[]) => { original(...args); registrar(nivel, args); };
  }
  process.on("exit", () => {
    if (!fila.length || !pasta) return;
    try { fs.appendFileSync(path.join(pasta, `elysium-${dia()}.log`), fila.join("")); } catch { /* fim */ }
  });
  console.log(`[log] ELYSIUM ${app.getVersion()} — log em ${pasta}`);
}

/** As últimas N linhas do log de hoje (e de ontem, se hoje ainda tem pouco). */
export function ultimasLinhas(n = 60): string[] {
  if (!pasta) return [];
  const arquivos = [path.join(pasta, `elysium-${dia(new Date(Date.now() - 86_400_000))}.log`), arquivoDoDia || path.join(pasta, `elysium-${dia()}.log`)];
  const linhas: string[] = [];
  for (const a of arquivos) {
    try { linhas.push(...fs.readFileSync(a, "utf8").split(/\r?\n/).filter(Boolean)); } catch { /* não existe */ }
  }
  return [...linhas, ...fila.join("").split("\n").filter(Boolean)].slice(-n);
}
