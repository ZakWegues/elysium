import Store from "electron-store";
import * as spotify from "./spotify";
import { estadoDaMesa, nomeDoApp, type EstadoMesa } from "./midiaAgora";
import { teclasParaVk } from "./inputCanal";

/**
 * O Modo Mesa (25/11): o celular apoiado ao lado do PC vira uma central de controle. Aqui moram os
 * atalhos dele (guardados no PC, valem para qualquer celular) e o estado que vai ao vivo.
 */

export type TipoAtalho = "acao" | "app" | "preset" | "rotina" | "teclas" | "link";
export const ACOES = ["bloquear", "print", "microfone", "foco", "timer", "area", "copiar", "colar", "youtube", "janelas"] as const;
export type Acao = (typeof ACOES)[number];
export interface Atalho { id: string; tipo: TipoAtalho; rotulo: string; icone: string; valor: string }

export const ATALHOS_PADRAO: Atalho[] = [
  { id: "a1", tipo: "acao", rotulo: "Bloquear", icone: "lock", valor: "bloquear" },
  { id: "a2", tipo: "acao", rotulo: "Microfone", icone: "mic-off", valor: "microfone" },
  { id: "a3", tipo: "acao", rotulo: "Print", icone: "camera", valor: "print" },
  { id: "a4", tipo: "acao", rotulo: "Área de trabalho", icone: "monitor", valor: "area" },
  { id: "a5", tipo: "acao", rotulo: "YouTube", icone: "youtube", valor: "youtube" },
  { id: "a6", tipo: "acao", rotulo: "Foco 25 min", icone: "target", valor: "foco" },
  { id: "a7", tipo: "acao", rotulo: "Timer 5 min", icone: "clock", valor: "timer" },
  { id: "a8", tipo: "acao", rotulo: "Copiar do PC", icone: "download", valor: "copiar" },
  { id: "a9", tipo: "acao", rotulo: "Colar no PC", icone: "upload", valor: "colar" },
];

const store = new Store<{ atalhos: Atalho[] | null }>({ name: "mesa", defaults: { atalhos: null } });
const MAX = 24;

/** Confere um atalho vindo do celular. null = recusado. Pura. */
export function atalhoValido(v: unknown): Atalho | null {
  const a = v as Partial<Atalho> | null;
  if (!a || typeof a !== "object") return null;
  const tipos: TipoAtalho[] = ["acao", "app", "preset", "rotina", "teclas", "link"];
  if (typeof a.tipo !== "string" || !tipos.includes(a.tipo as TipoAtalho)) return null;
  const rotulo = typeof a.rotulo === "string" ? a.rotulo.replace(/[\x00-\x1f]/g, "").trim().slice(0, 24) : "";
  const valor = typeof a.valor === "string" ? a.valor.trim().slice(0, 300) : "";
  const icone = typeof a.icone === "string" && /^[a-z0-9-]{1,30}$/.test(a.icone) ? a.icone : "zap";
  const id = typeof a.id === "string" && /^[\w-]{1,40}$/.test(a.id) ? a.id : "";
  if (!rotulo || !valor || !id) return null;
  if (a.tipo === "acao" && !(ACOES as readonly string[]).includes(valor)) return null;
  if (a.tipo === "link" && !/^https?:\/\/[^\s]+$/i.test(valor)) return null;
  if (a.tipo === "teclas" && !teclasParaVk(valor.split("+"))) return null;
  return { id, tipo: a.tipo as TipoAtalho, rotulo, icone, valor };
}

export function lerAtalhos(): Atalho[] {
  return store.get("atalhos") ?? ATALHOS_PADRAO;
}

export function salvarAtalhos(lista: unknown): Atalho[] {
  if (!Array.isArray(lista)) throw new Error("lista de atalhos inválida");
  const ok = lista.slice(0, MAX).map(atalhoValido).filter((a): a is Atalho => !!a);
  const vistos = new Set<string>();
  const unicos = ok.filter((a) => (vistos.has(a.id) ? false : (vistos.add(a.id), true)));
  store.set("atalhos", unicos);
  return unicos;
}

/** O app do Spotify manda ao Windows um quadrado preto no lugar da capa. Pura. */
export function capaVazia(m: { capa: string; cor: string }): boolean {
  return !m.capa || (m.cor === "#000000" && m.capa.length < 6000);
}

/** O Spotify não manda capa para o Windows: busca na API dele (uma vez por música). */
let capaDe = "";
let capaUrl = "";
let tentouEm = 0;
async function capaDoSpotify(e: EstadoMesa): Promise<string> {
  const m = e.midia;
  if (!m || (m.capa && !capaVazia(m)) || nomeDoApp(m.app) !== "Spotify" || !spotify.isConnected()) return "";
  const chave = `${m.titulo}|${m.artista}`;
  if (chave === capaDe && (capaUrl || Date.now() - tentouEm < 30_000)) return capaUrl;
  // Pausado há tempo, a API do Spotify não diz nada: tenta de novo em 30 s (ao tocar, acha).
  capaDe = chave;
  capaUrl = "";
  tentouEm = Date.now();
  try { const n = await spotify.getNowPlaying(); if (n?.track === m.titulo && n.albumArt?.startsWith("https://")) capaUrl = n.albumArt; } catch { /* sem capa */ }
  return capaUrl;
}

/** O estado como vai ao celular: nome do app legível e a capa (a do Windows ou a do Spotify). */
export async function paraOCelular(e: EstadoMesa): Promise<EstadoMesa & { midia: (EstadoMesa["midia"] & { nomeApp: string; capaUrl: string }) | null }> {
  if (!e.midia) return { ...e, midia: null };
  const capaUrl = await capaDoSpotify(e);
  return { ...e, midia: { ...e.midia, capa: capaVazia(e.midia) ? "" : e.midia.capa, nomeApp: nomeDoApp(e.midia.app), capaUrl } };
}

export async function estadoParaOCelular(): Promise<Awaited<ReturnType<typeof paraOCelular>> | null> {
  const e = await estadoDaMesa();
  return e ? paraOCelular(e) : null;
}
