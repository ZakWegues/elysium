import Store from "electron-store";
import WebSocket from "ws";
import * as crypto from "node:crypto";
import type { Duplex } from "node:stream";
import { responderOla, segredosDoToken, type Chaves } from "./ponteCripto";
import { Fluxos } from "./ponteFluxos";
import type { TokenVivo } from "./aparelhosTokens";

/**
 * Usar o ELYSIUM fora de casa sem Tailscale (25/11). O PC liga para uma ponte no Cloudflare (`ponte/`)
 * e espera; o celular liga para a mesma ponte e os dois conversam cifrados (ponteCripto.ts). Nenhuma
 * porta se abre aqui. Cada conexão do celular entra no mesmo servidor HTTP de sempre, com a mesma
 * assinatura por pedido — a ponte é só o caminho.
 */

interface Config { url: string; sala: string; segredo: string; ligada: boolean }
const store = new Store<Config>({ name: "ponte", defaults: { url: "", sala: "", segredo: "", ligada: true } });

/** Faixa própria (ULA): passa como rede privada e nunca como "o próprio PC". */
export function enderecoDaPonte(hash: string): string {
  return `fde1:e:${hash.slice(0, 4)}:${hash.slice(4, 8)}::1`;
}
export function ehDaPonte(endereco: string | undefined): boolean {
  return !!endereco && endereco.startsWith("fde1:e:");
}

const BATIDA_MS = 30_000;
const OLA_MS = 10_000;

let ws: WebSocket | null = null;
let conectada = false;
let tentativas = 0;
let timer: NodeJS.Timeout | null = null;
let batida: NodeJS.Timeout | null = null;
let ultimoSinal = 0;
let tokens: () => TokenVivo[] = () => [];
let atender: (s: Duplex, endereco: string) => void = () => {};

interface Canal { hash: string; psk: Buffer; chaves: Chaves | null; fluxos: Fluxos | null; prazo: NodeJS.Timeout }
const canais = new Map<number, Canal>();

export function estadoDaPonte(): { configurada: boolean; ligada: boolean; conectada: boolean; celulares: number } {
  const c = store.store;
  return { configurada: !!(c.url && c.sala && c.segredo), ligada: c.ligada, conectada, celulares: [...canais.values()].filter((x) => x.chaves).length };
}

/** Para o celular: onde fica a ponte. Nada disto é segredo (as chaves saem do token). */
export function infoDaPonte(): { url: string; sala: string } | null {
  const c = store.store;
  return c.ligada && c.url && c.sala && c.segredo ? { url: c.url, sala: c.sala } : null;
}

export function ligarPonte(v: boolean): void {
  store.set("ligada", v);
  if (v) conectar(); else desligar();
}

export function iniciarPonte(opcoes: { tokens: () => TokenVivo[]; atender: (s: Duplex, endereco: string) => void }): void {
  tokens = opcoes.tokens;
  atender = opcoes.atender;
  conectar();
}

/** Um aparelho entrou ou foi revogado: a ponte passa a valer para a lista nova, na hora. */
export function permitidosMudaram(): void {
  const hashes = new Set(tokens().map((t) => segredosDoToken(t.token).hash));
  for (const [n, c] of canais) if (!hashes.has(c.hash)) fecharCanal(n, true);
  if (conectada) ws?.send(JSON.stringify({ permitidos: [...hashes] }));
}

function desligar(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  const velho = ws;
  ws = null;
  aoCair();
  try { velho?.close(); } catch { /* já fechado */ }
}

function aoCair(): void {
  conectada = false;
  if (batida) { clearInterval(batida); batida = null; }
  for (const n of [...canais.keys()]) fecharCanal(n, false);
}

function conectar(): void {
  const c = store.store;
  if (!c.ligada || !c.url || !c.sala || !c.segredo || ws) return;
  const sock = new WebSocket(`${c.url.replace(/^http/, "ws")}/pc/${c.sala}`, { headers: { Authorization: `Bearer ${c.segredo}` }, handshakeTimeout: 15_000, maxPayload: 1024 * 1024 });
  ws = sock;
  sock.on("open", () => {
    tentativas = 0;
    conectada = true;
    ultimoSinal = Date.now();
    console.log("[ponte] ligada");
    permitidosMudaram();
    // A sala responde "q" sem acordar; sem resposta em duas batidas, a conexão morreu.
    batida = setInterval(() => {
      if (Date.now() - ultimoSinal > BATIDA_MS * 2.5) { sock.terminate(); return; }
      try { sock.send("p"); } catch { /* o close cuida */ }
    }, BATIDA_MS);
  });
  sock.on("message", (dados, binario) => {
    ultimoSinal = Date.now();
    if (ws !== sock) return;
    if (!binario) { controle(String(dados)); return; }
    const b = dados as Buffer;
    if (b.length > 4) doCelular(b.readUInt32BE(0), b.subarray(4));
  });
  sock.on("error", (e) => console.warn(`[ponte] ${e.message}`));
  sock.on("close", () => {
    if (ws !== sock) return;
    ws = null;
    aoCair();
    // 2, 4, 8… até 5 min: sem internet (ou a ponte fora do ar) não vale insistir.
    if (store.get("ligada")) timer = setTimeout(() => { timer = null; conectar(); }, Math.min(300_000, 2000 * 2 ** tentativas++));
  });
}

function controle(texto: string): void {
  let m: { abriu?: number; quem?: string; fechou?: number };
  try { m = JSON.parse(texto) as typeof m; } catch { return; }
  if (typeof m.fechou === "number") { fecharCanal(m.fechou, false); return; }
  if (typeof m.abriu !== "number" || typeof m.quem !== "string") return;
  const n = m.abriu;
  const dono = tokens().map((t) => segredosDoToken(t.token)).find((s) => s.hash === m.quem);
  if (!dono) { ws?.send(JSON.stringify({ fechar: n })); return; }
  canais.set(n, { hash: dono.hash, psk: dono.psk, chaves: null, fluxos: null, prazo: setTimeout(() => fecharCanal(n, true), OLA_MS) });
}

function enviar(n: number, b: Buffer): void {
  const cab = Buffer.alloc(4);
  cab.writeUInt32BE(n);
  try { ws?.send(Buffer.concat([cab, b])); } catch { /* caindo */ }
}

function doCelular(n: number, b: Buffer): void {
  const c = canais.get(n);
  if (!c) return;
  if (!c.chaves) {
    const r = responderOla(c.psk, Buffer.from(b));
    if (!r) { fecharCanal(n, true); return; }
    c.chaves = r.chaves;
    const endereco = enderecoDaPonte(c.hash);
    c.fluxos = new Fluxos(endereco, (q) => { if (c.chaves && canais.get(n) === c) enviar(n, c.chaves.envia.fechar(q)); }, (f) => { clearTimeout(c.prazo); atender(f, endereco); });
    enviar(n, r.resposta);
    return;
  }
  try { c.fluxos!.recebeu(c.chaves.recebe.abrir(b)); }
  catch { fecharCanal(n, true); } // pacote mexido: acaba a conversa inteira
}

function fecharCanal(n: number, avisar: boolean): void {
  const c = canais.get(n);
  if (!c) return;
  canais.delete(n);
  clearTimeout(c.prazo);
  c.fluxos?.fechar();
  if (avisar && conectada) { try { ws?.send(JSON.stringify({ fechar: n })); } catch { /* caindo */ } }
}

/** Só para os testes do formato. */
export const idDeTeste = (): string => crypto.randomBytes(16).toString("hex");
