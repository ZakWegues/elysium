import Store from "electron-store";
import * as crypto from "node:crypto";
import { textoDaTela } from "./telaInteligente";

/**
 * Telas salvas (31/10): uma tela inteligente que vale guardar (o checklist da viagem, o quiz da
 * prova) fica aqui com o estado — reabre no PC ou no celular do jeito que estava. Máximo 30; a
 * mesma tela salva de novo só atualiza o estado.
 */

export interface TelaSalva {
  id: string;
  titulo: string;
  programa: string;
  estado?: Record<string, unknown>;
  em: number;
}

const MAXIMO = 30;
const store = new Store<{ telas: TelaSalva[] }>({ name: "telas-salvas", defaults: { telas: [] } });

/** O título: o primeiro argumento do Hero (é o título que a tela mostra); senão, o primeiro texto. Puro. */
export function tituloDaTela(programa: string): string {
  const m = /Hero\(\s*"((?:[^"\\\n]|\\.)*)"/.exec(programa);
  let t = "";
  if (m) { try { t = JSON.parse(`"${m[1]}"`) as string; } catch { /* segue */ } }
  if (!t) t = textoDaTela(programa, 200).split(" · ")[0] ?? "";
  return (t.trim() || "Tela da Ely").slice(0, 80);
}

function hash(programa: string): string {
  return crypto.createHash("sha1").update(programa).digest("hex").slice(0, 12);
}

export function salvarTela(programa: string, estado?: Record<string, unknown>, titulo?: string, agora = Date.now()): TelaSalva {
  const id = hash(programa);
  const telas = store.get("telas").filter(t => t.id !== id);
  const tela: TelaSalva = { id, titulo: (titulo?.trim() || tituloDaTela(programa)).slice(0, 80), programa, ...(estado ? { estado } : {}), em: agora };
  store.set("telas", [tela, ...telas].slice(0, MAXIMO));
  return tela;
}

/** A lista leve (sem o programa), da mais nova para a mais velha. */
export function listarTelasSalvas(): { id: string; titulo: string; em: number }[] {
  return store.get("telas").map(({ id, titulo, em }) => ({ id, titulo, em }));
}

export function obterTelaSalva(id: string): TelaSalva | null {
  return store.get("telas").find(t => t.id === id) ?? null;
}

/** Guarda o estado novo (mexeu na tela salva) sem mudar a ordem. */
export function atualizarEstadoSalvo(id: string, estado: Record<string, unknown>): boolean {
  const telas = store.get("telas");
  const t = telas.find(x => x.id === id);
  if (!t) return false;
  t.estado = estado;
  store.set("telas", telas);
  return true;
}

export function apagarTelaSalva(id: string): boolean {
  const telas = store.get("telas");
  const resto = telas.filter(t => t.id !== id);
  store.set("telas", resto);
  return resto.length !== telas.length;
}
