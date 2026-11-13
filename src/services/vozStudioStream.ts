import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getConfig } from "../main/config";
import { escolherPerfilStudio, VOICESTUDIO_URL, vozesDoStudio } from "./voiceStudio";

/**
 * 12/11: a voz do VoiceStudio em streaming, do jeito que o Roamies faz (é o que deixa a voz dele
 * "instantânea"). Em vez de pedir um MP3 por frase e tocar por PowerShell/MCI, abre UM WebSocket
 * em `ws://127.0.0.1:3900/ws/tts`, manda `{text, voice}` e recebe `{"type":"start",
 * "sample_rate":24000,"format":"pcm16"}`, o PCM em binário e `{"type":"done"}`.
 *
 * O PCM vai para a janela escondida do gravador, que toca com Web Audio (ver `recorder.html`):
 * sem arquivo, sem processo novo por frase. A frase seguinte é pedida enquanto a atual toca
 * (`prepararNoStudio`, chamado pelo `preSintetizar`) — o motor gera mais rápido que a fala
 * (rtf 0,43 medido), então depois da primeira não há espera.
 *
 * Medido em 12/11: ~1,6 s até o primeiro áudio, quase fixo (frase curta ou longa). Os "beats"
 * (frases curtas já gravadas, tocadas na hora) cobrem essa partida.
 */

/** Quem toca o PCM (a janela do gravador). O main registra. */
export interface Tocador {
  pcm(id: string, pcm: Uint8Array, taxa: number, ganho: number): void;
  fim(id: string): void;
  parar(): void;
}

let tocador: Tocador | null = null;
let ultimoSomEm = 0;
/** Saiu som do estúdio há pouco (o beat não entra por cima de uma fala que já começou). */
export function somRecente(): boolean { return Date.now() - ultimoSomEm < 1500; }
export function registrarTocador(t: Tocador): void { tocador = t; }

/** Studio caiu (fechado, erro): 60 s sem tentar, a fala vai pelo Gemini/Edge. */
let ruimAte = 0;

/** O motor escolhido é o VoiceStudio e ele não falhou há pouco. */
export function usaStudio(): boolean {
  return getConfig().vozProvedor === "voicestudio" && Date.now() > ruimAte && tocador !== null;
}

/**
 * PCM16 chega em pedaços que podem cortar uma amostra no meio: o byte que sobra passa para o
 * próximo pedaço (o `whole()` do Roamies). Pura, para teste.
 */
export function juntarPcm(sobra: number | null, pedaco: Uint8Array): { pcm: Uint8Array; sobra: number | null } {
  let b = pedaco;
  if (sobra !== null) {
    const c = new Uint8Array(b.length + 1);
    c[0] = sobra;
    c.set(b, 1);
    b = c;
  }
  if (b.length % 2) return { pcm: b.subarray(0, b.length - 1), sobra: b[b.length - 1] };
  return { pcm: b, sobra: null };
}

/** Uma frase pedida ao estúdio: os pedaços que já chegaram e quem quer os próximos. */
interface Pedido {
  texto: string;
  pedacos: Uint8Array[];
  taxa: number;
  pronto: boolean;
  falhou: boolean;
  ouvintes: Set<() => void>;
}

const pedidos = new Map<string, Pedido>();
const filaEnvio: Pedido[] = [];
let ws: WebSocket | null = null;
let abrindo: Promise<boolean> | null = null;
let atual: Pedido | null = null;
let sobra: number | null = null;
let prazo: NodeJS.Timeout | null = null;
let perfil: { em: number; id: string | null } | null = null;

function avisarPedido(p: Pedido): void { for (const f of p.ouvintes) f(); }

function falhar(motivo: string): void {
  console.warn(`[TTS] VoiceStudio: ${motivo} — a fala vai pela outra voz por 60 s`);
  ruimAte = Date.now() + 60_000;
  for (const p of [atual, ...filaEnvio]) if (p) { p.falhou = true; avisarPedido(p); pedidos.delete(p.texto); }
  filaEnvio.length = 0;
  atual = null;
  try { ws?.close(); } catch { /* já fechado */ }
  ws = null;
}

function armar(ms: number, motivo: string): void {
  if (prazo) clearTimeout(prazo);
  prazo = setTimeout(() => falhar(motivo), ms);
}
function desarmar(): void { if (prazo) { clearTimeout(prazo); prazo = null; } }

async function perfilAtual(): Promise<string | null> {
  if (perfil && Date.now() - perfil.em < 60_000) return perfil.id;
  const vozes = await vozesDoStudio();
  perfil = { em: Date.now(), id: vozes ? escolherPerfilStudio(getConfig().voiceStudioVoz ?? "", vozes) : null };
  return perfil.id;
}

function abrir(): Promise<boolean> {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(true);
  if (abrindo) return abrindo;
  abrindo = new Promise<boolean>((ok) => {
    let s: WebSocket;
    try { s = new WebSocket(`${VOICESTUDIO_URL.replace(/^http/, "ws")}/ws/tts`); } catch { falhar("não abriu"); ok(false); return; }
    s.binaryType = "arraybuffer";
    const t = setTimeout(() => { falhar("não respondeu ao abrir"); ok(false); }, 5000);
    s.onopen = () => { clearTimeout(t); ws = s; ok(true); bombear(); };
    s.onerror = () => { clearTimeout(t); if (ws === s || !ws) { falhar("conexão caiu"); ok(false); } };
    s.onclose = () => { clearTimeout(t); if (ws === s) { ws = null; if (atual) falhar("fechou no meio"); } };
    s.onmessage = (e) => {
      const p = atual;
      if (!p) return;
      if (typeof e.data === "string") {
        let m: { type?: string; sample_rate?: number; detail?: string };
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === "start") { p.taxa = Number(m.sample_rate) || 24000; sobra = null; }
        else if (m.type === "done") { desarmar(); p.pronto = true; avisarPedido(p); atual = null; bombear(); }
        else if (m.type === "error") falhar(`erro: ${String(m.detail ?? "").slice(0, 120)}`);
        return;
      }
      const j = juntarPcm(sobra, new Uint8Array(e.data as ArrayBuffer));
      sobra = j.sobra;
      if (j.pcm.length) { p.pedacos.push(j.pcm); armar(30_000, "parou no meio da frase"); avisarPedido(p); }
    };
  }).finally(() => { abrindo = null; });
  return abrindo;
}

async function bombear(): Promise<void> {
  if (atual || !filaEnvio.length) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) { if (!(await abrir())) return; }
  if (atual || !filaEnvio.length || !ws) return;
  const p = filaEnvio.shift()!;
  atual = p;
  sobra = null;
  const voz = await perfilAtual();
  try { ws.send(JSON.stringify({ text: p.texto, ...(voz ? { voice: voz } : {}) })); } catch { falhar("envio falhou"); return; }
  // A primeira fala carrega o modelo na GPU: prazo largo.
  armar(60_000, "demorou demais");
}

function pedir(texto: string): Pedido {
  const ja = pedidos.get(texto);
  if (ja && !ja.falhou) return ja;
  const p: Pedido = { texto, pedacos: [], taxa: 24000, pronto: false, falhou: false, ouvintes: new Set() };
  pedidos.set(texto, p);
  // Guarda só as últimas frases (a fila de fala pede uma à frente).
  if (pedidos.size > 12) pedidos.delete(pedidos.keys().next().value as string);
  filaEnvio.push(p);
  void bombear();
  return p;
}

/** Começa a gerar a frase agora (a próxima da fila, enquanto a atual toca). */
export function prepararNoStudio(texto: string): void {
  if (usaStudio() && texto.trim()) pedir(texto.trim());
}

let idAtual = "";

/**
 * Fala a frase pelo estúdio. `true` = tocou (ou foi interrompida); `false` = o estúdio falhou
 * antes de sair som — quem chama fala pela outra voz. `aoComecar` recebe a duração estimada.
 */
export function falarNoStudio(texto: string, ganho: number, aoComecar: (durMs: number) => void, cancelado: () => boolean): Promise<boolean> {
  const t = tocador;
  if (!t) return Promise.resolve(false);
  const p = pedir(texto.trim());
  const id = crypto.randomUUID();
  idAtual = id;
  return new Promise<boolean>((ok) => {
    let enviados = 0;
    let comecou = false;
    const passo = () => {
      if (cancelado() || idAtual !== id) { p.ouvintes.delete(passo); ok(true); return; }
      if (p.falhou && !comecou) { p.ouvintes.delete(passo); ok(false); return; }
      while (enviados < p.pedacos.length) {
        const pcm = p.pedacos[enviados++];
        t.pcm(id, pcm, p.taxa, ganho);
        ultimoSomEm = Date.now();
        if (!comecou) {
          comecou = true;
          const amostras = p.pedacos.reduce((n, c) => n + c.length / 2, 0);
          // Pronto: a duração é exata; senão, pelo texto (~70 ms por letra falada, medido no motor).
          aoComecar(p.pronto ? Math.round((amostras / p.taxa) * 1000) : Math.max(800, texto.length * 70));
        }
      }
      if (p.pronto || p.falhou) {
        p.ouvintes.delete(passo);
        t.fim(id);
        esperarTocar.set(id, () => ok(true));
      }
    };
    p.ouvintes.add(passo);
    passo();
  });
}

/** O tocador terminou de tocar tudo daquele id (ou foi parado). */
const esperarTocar = new Map<string, () => void>();
export function tocou(id: string): void {
  const f = esperarTocar.get(id);
  esperarTocar.delete(id);
  f?.();
}

/** Interromper: cala o tocador e solta quem esperava. Os pedidos já gerados ficam no cache. */
export function pararStudio(): void {
  idAtual = "";
  tocador?.parar();
  for (const f of esperarTocar.values()) f();
  esperarTocar.clear();
}

// ── beats (12/11, o outro truque do Roamies) ─────────────────────────────────────────────
// Frases curtas já gravadas, que tocam no mesmo instante em que a transcrição volta: tapam o
// 1,6 s de partida do motor. Geradas no estúdio na primeira vez e guardadas como PCM.

export const BEATS = ["Certo.", "Um segundo.", "Já vejo.", "Deixa eu ver.", "Tá bom.", "Hum, certo.", "Só um instante."] as const;

let pastaBeats = "";
let ultimoBeat = -1;

/** Sorteia o índice do próximo beat, sem repetir o último. Pura com o sorteio injetado. */
export function proximoBeat(ultimo: number, total: number, sorteio = Math.random()): number {
  if (total <= 1) return 0;
  const i = Math.floor(sorteio * (total - 1));
  return i >= ultimo && ultimo >= 0 ? i + 1 : i;
}

function arquivoBeat(frase: string, voz: string): string {
  const h = crypto.createHash("sha1").update(`${voz}|${frase}`).digest("hex").slice(0, 16);
  return path.join(pastaBeats, `${h}.pcm`);
}

/** Na abertura: grava os beats que faltam (um por vez, sem pressa). */
export async function prepararBeats(pasta: string): Promise<void> {
  pastaBeats = pasta;
  if (!usaStudio()) return;
  const voz = (await perfilAtual()) ?? "padrao";
  try { fs.mkdirSync(pasta, { recursive: true }); } catch { return; }
  for (const frase of BEATS) {
    const arq = arquivoBeat(frase, voz);
    if (fs.existsSync(arq)) continue;
    const p = pedir(frase);
    await new Promise<void>((ok) => {
      const ver = () => { if (p.pronto || p.falhou) { p.ouvintes.delete(ver); ok(); } };
      p.ouvintes.add(ver);
      ver();
    });
    if (p.falhou) return;
    // 4 bytes de taxa + o PCM.
    const cab = Buffer.alloc(4);
    cab.writeUInt32LE(p.taxa, 0);
    try { fs.writeFileSync(arq, Buffer.concat([cab, ...p.pedacos.map((c) => Buffer.from(c))])); } catch { return; }
  }
}

/** Toca um beat agora, se houver gravado. `true` = tocou. */
export function tocarBeat(ganho: number): boolean {
  if (!usaStudio() || !tocador || !pastaBeats) return false;
  const voz = perfil?.id ?? "padrao";
  const i = proximoBeat(ultimoBeat, BEATS.length);
  let buf: Buffer;
  try { buf = fs.readFileSync(arquivoBeat(BEATS[i], voz)); } catch { return false; }
  if (buf.length < 8) return false;
  ultimoBeat = i;
  const id = `beat-${Date.now()}`;
  tocador.pcm(id, new Uint8Array(buf.subarray(4)), buf.readUInt32LE(0), ganho);
  tocador.fim(id);
  return true;
}
