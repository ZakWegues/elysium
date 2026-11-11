import * as fs from "node:fs";
import * as path from "node:path";
import { semAcento } from "./texto";

/**
 * Achar o arquivo que o dono pediu para mandar ao celular (21/10: "me manda aquele PDF").
 *
 * Decisão do dono: a Ely procura nas pastas pessoais — Área de Trabalho, Documentos, Imagens,
 * Vídeos, Músicas e Downloads — e aceita qualquer caminho que ele disser por extenso. Fora disso
 * nunca: pastas do sistema, programas e os dados do próprio ELYSIUM (token, memória, chaves).
 */

const PULAR = /^(node_modules|\.git|\$recycle\.bin|appdata|\.cache|__pycache__)$/i;
const MAX_PROFUNDIDADE = 3;
const MAX_ENTRADAS = 25_000;

function dentroDe(caminho: string, pastas: string[]): boolean {
  const c = path.resolve(caminho).toLowerCase();
  return pastas.some(p => {
    const r = path.resolve(p).toLowerCase();
    return c === r || c.startsWith(r + path.sep);
  });
}

/** O caminho dito por extenso é proibido? Sistema, programas, AppData e os dados do ELYSIUM. Pura. */
export function caminhoProibido(caminho: string, proibidas: string[]): boolean {
  const c = path.resolve(caminho).toLowerCase();
  if (/^[a-z]:\\(windows|program files( \(x86\))?|programdata)(\\|$)/i.test(c)) return true;
  if (/\\appdata\\/i.test(c)) return true;
  // 31/10: chaves e segredos fora do AppData — SSH, GPG, Hermes, nuvens, Docker, Git.
  if (/\\\.(ssh|gnupg|hermes|aws|azure|docker|kube)(\\|$)/i.test(c)) return true;
  if (/\.(pem|key|pfx|p12|kdbx|ovpn)$|(^|\\)id_(rsa|ed25519|ecdsa)(\.pub)?$|(^|\\)\.env(\.[a-z]+)?$|(^|\\)\.git-credentials$/i.test(c)) return true;
  return dentroDe(c, proibidas);
}

function palavras(t: string): string[] {
  return semAcento(t).toLowerCase().replace(/[^a-z0-9.]+/g, " ").split(" ").filter(w => w.length >= 2);
}

/** O nome casa com o pedido? Todas as palavras do pedido aparecem no nome. Pura. */
export function nomeCasa(nome: string, pedido: string): boolean {
  const n = semAcento(nome).toLowerCase();
  const ws = palavras(pedido).filter(w => !["o", "a", "do", "da", "de", "arquivo", "aquele", "aquela"].includes(w));
  return ws.length > 0 && ws.every(w => n.includes(w));
}

export interface Achado { caminho: string; nome: string; mtime: number; tamanho: number }

/** Procura nas pastas, em largura, até 3 níveis; mais recentes primeiro. */
export function procurarArquivos(pedido: string, pastas: string[], proibidas: string[]): Achado[] {
  const achados: Achado[] = [];
  let vistos = 0;
  const fila: { dir: string; nivel: number }[] = pastas.filter(p => fs.existsSync(p)).map(dir => ({ dir, nivel: 0 }));
  while (fila.length && vistos < MAX_ENTRADAS) {
    const { dir, nivel } = fila.shift()!;
    let entradas: fs.Dirent[];
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      if (++vistos > MAX_ENTRADAS) break;
      const cheio = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (nivel < MAX_PROFUNDIDADE && !PULAR.test(e.name) && !e.name.startsWith(".") && !dentroDe(cheio, proibidas)) fila.push({ dir: cheio, nivel: nivel + 1 });
      } else if (e.isFile() && nomeCasa(e.name, pedido)) {
        try { const st = fs.statSync(cheio); achados.push({ caminho: cheio, nome: e.name, mtime: st.mtimeMs, tamanho: st.size }); } catch { /* sumiu */ }
      }
    }
  }
  return achados.sort((a, b) => b.mtime - a.mtime);
}

export type Escolha = { tipo: "um"; caminho: string } | { tipo: "varios"; opcoes: Achado[] } | { tipo: "nenhum" } | { tipo: "proibido" };

/**
 * O que mandar: caminho por extenso (se existe e não é proibido), um achado só, o achado cujo
 * nome é igual ao pedido, ou a lista para perguntar. Pura sobre o resultado da busca.
 */
export function escolherArquivo(pedido: string, achados: Achado[], proibidas: string[], existe = fs.existsSync): Escolha {
  const p = pedido.trim().replace(/^["']|["']$/g, "");
  if (/^[a-z]:[\\/]/i.test(p) || p.startsWith("\\\\")) {
    if (caminhoProibido(p, proibidas)) return { tipo: "proibido" };
    return existe(p) ? { tipo: "um", caminho: path.resolve(p) } : { tipo: "nenhum" };
  }
  if (!achados.length) return { tipo: "nenhum" };
  if (achados.length === 1) return { tipo: "um", caminho: achados[0].caminho };
  const exato = achados.filter(a => semAcento(a.nome).toLowerCase() === semAcento(p).toLowerCase());
  if (exato.length === 1) return { tipo: "um", caminho: exato[0].caminho };
  return { tipo: "varios", opcoes: achados.slice(0, 5) };
}
