/**
 * Geometria de janelas (fase 21, bloco 216) — puro, sem Windows: onde cada janela vai quando a
 * Ely "organiza", e como um layout salvo volta para o lugar.
 *
 * Posições de layout ficam RELATIVAS ao monitor (0–1): o mesmo layout serve com outra
 * resolução, ou com o notebook fora da dock.
 */

export interface Area { x: number; y: number; largura: number; altura: number }
export interface Retangulo { x: number; y: number; largura: number; altura: number }

export type ModoOrganizar = "lado_a_lado" | "quadrantes" | "esquerda" | "direita" | "cima" | "baixo" | "maximizar" | "centro" | "outro_monitor" | "cascata";

/** Os lugares para `n` janelas na área (até 4 em grade; mais que isso, colunas). Pura. */
export function grade(n: number, a: Area): Retangulo[] {
  const r = (x: number, y: number, l: number, h: number): Retangulo => ({ x: Math.round(a.x + x * a.largura), y: Math.round(a.y + y * a.altura), largura: Math.round(l * a.largura), altura: Math.round(h * a.altura) });
  if (n <= 0) return [];
  if (n === 1) return [r(0, 0, 1, 1)];
  if (n === 2) return [r(0, 0, 0.5, 1), r(0.5, 0, 0.5, 1)];
  if (n === 3) return [r(0, 0, 0.5, 1), r(0.5, 0, 0.5, 0.5), r(0.5, 0.5, 0.5, 0.5)];
  if (n === 4) return [r(0, 0, 0.5, 0.5), r(0.5, 0, 0.5, 0.5), r(0, 0.5, 0.5, 0.5), r(0.5, 0.5, 0.5, 0.5)];
  return Array.from({ length: n }, (_, i) => r(i / n, 0, 1 / n, 1));
}

/** Uma janela numa metade, no centro ou em cascata. Pura. */
export function lugarUnico(modo: ModoOrganizar, a: Area, i = 0): Retangulo {
  const meia = (x: number, y: number, l: number, h: number): Retangulo => ({ x: Math.round(a.x + x * a.largura), y: Math.round(a.y + y * a.altura), largura: Math.round(l * a.largura), altura: Math.round(h * a.altura) });
  switch (modo) {
    case "esquerda": return meia(0, 0, 0.5, 1);
    case "direita": return meia(0.5, 0, 0.5, 1);
    case "cima": return meia(0, 0, 1, 0.5);
    case "baixo": return meia(0, 0.5, 1, 0.5);
    case "centro": return meia(0.15, 0.1, 0.7, 0.8);
    case "cascata": { const d = Math.min(i, 8) * 36; return { x: a.x + 40 + d, y: a.y + 30 + d, largura: Math.round(a.largura * 0.62), altura: Math.round(a.altura * 0.7) }; }
    default: return meia(0, 0, 1, 1);
  }
}

/** Em que monitor está o centro do retângulo (o mais próximo, se nenhum contém). Pura. */
export function monitorDe(r: Retangulo, monitores: Area[]): number {
  const cx = r.x + r.largura / 2, cy = r.y + r.altura / 2;
  let melhor = 0, dist = Infinity;
  monitores.forEach((m, i) => {
    if (cx >= m.x && cx < m.x + m.largura && cy >= m.y && cy < m.y + m.altura) { melhor = i; dist = -1; return; }
    if (dist < 0) return;
    const d = Math.hypot(cx - (m.x + m.largura / 2), cy - (m.y + m.altura / 2));
    if (d < dist) { dist = d; melhor = i; }
  });
  return melhor;
}

export interface Relativo { x: number; y: number; l: number; a: number }

export function paraRelativo(r: Retangulo, m: Area): Relativo {
  const q = (v: number) => Math.round(v * 1000) / 1000;
  return { x: q((r.x - m.x) / m.largura), y: q((r.y - m.y) / m.altura), l: q(r.largura / m.largura), a: q(r.altura / m.altura) };
}

export function paraAbsoluto(rel: Relativo, m: Area): Retangulo {
  // Preso ao monitor: um layout salvo num monitor maior não sai pela borda.
  const l = Math.min(1, Math.max(0.1, rel.l)), a = Math.min(1, Math.max(0.1, rel.a));
  const x = Math.min(1 - l, Math.max(0, rel.x)), y = Math.min(1 - a, Math.max(0, rel.y));
  return { x: Math.round(m.x + x * m.largura), y: Math.round(m.y + y * m.altura), largura: Math.round(l * m.largura), altura: Math.round(a * m.altura) };
}

/** O mesmo lugar relativo no próximo monitor. Pura. */
export function noProximoMonitor(r: Retangulo, monitores: Area[]): Retangulo {
  if (monitores.length < 2) return r;
  const i = monitorDe(r, monitores);
  return paraAbsoluto(paraRelativo(r, monitores[i]), monitores[(i + 1) % monitores.length]);
}

export interface ItemDoLayout { processo: string; titulo: string; monitor: number; rel: Relativo; maximizada: boolean }
export interface JanelaParaCasar { hwnd: string; processo: string; titulo: string }

/**
 * Qual janela aberta é cada item do layout: mesmo processo, preferindo o título parecido; uma
 * janela não serve para dois itens. Devolve o hwnd por item (null = falta abrir). Pura.
 */
export function casarJanelas(itens: ItemDoLayout[], abertas: JanelaParaCasar[]): (string | null)[] {
  const usadas = new Set<string>();
  const palavras = (t: string) => new Set(t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(p => p.length > 2));
  return itens.map((item) => {
    const candidatas = abertas.filter(j => !usadas.has(j.hwnd) && j.processo.toLowerCase() === item.processo.toLowerCase());
    if (!candidatas.length) return null;
    const alvo = palavras(item.titulo);
    let melhor = candidatas[0], nota = -1;
    for (const c of candidatas) {
      const p = palavras(c.titulo);
      const comum = [...alvo].filter(w => p.has(w)).length;
      if (comum > nota) { nota = comum; melhor = c; }
    }
    usadas.add(melhor.hwnd);
    return melhor.hwnd;
  });
}

export interface PedidoDeJanelas { modo: ModoOrganizar | "salvar_layout" | "aplicar_layout"; programa?: string; layout?: string }

/**
 * Frases fechadas de janela para o `fastRoute` (instantâneo, sem modelo). Frase inteira; o que
 * não casa segue para o cérebro. Pura.
 */
export function pedidoDeJanelas(texto: string): PedidoDeJanelas | null {
  const t = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.!?]+$/, "").replace(/^(ely|elysium)[, ]+/, "").trim();
  if (/^(organiza|organizar|arruma|arrumar)( as| minhas| as minhas)? janelas$/.test(t)) return { modo: "quadrantes" };
  if (/^(coloca|poe|bota|deixa)?\s*(as |minhas |as minhas )?janelas lado a lado$|^lado a lado$/.test(t)) return { modo: "lado_a_lado" };
  if (/^(janelas )?em cascata$|^(coloca|poe|deixa) as janelas em cascata$/.test(t)) return { modo: "cascata" };
  let m = /^(?:salva|salvar|guarda|guardar|grava|gravar)(?: o| esse| este)? layout(?: como| chamado)? ([a-z0-9][a-z0-9 _-]{0,29})$/.exec(t);
  if (m) return { modo: "salvar_layout", layout: m[1].trim() };
  m = /^(?:(?:aplica|aplicar|abre|abrir|carrega|carregar|usa|usar|volta pro|volta para o|coloca|liga)(?: o)? )?layout ([a-z0-9][a-z0-9 _-]{0,29})$/.exec(t);
  if (m) return { modo: "aplicar_layout", layout: m[1].trim() };
  m = /^(?:joga|jogar|manda|mandar|move|mover|passa|passar|leva|levar|coloca|colocar)(?: o| a)? (.{2,40}?) (?:pro|pra o|para o|no) (?:outro|segundo) monitor$/.exec(t);
  if (m) return { modo: "outro_monitor", programa: m[1] };
  m = /^(?:joga|jogar|manda|mandar|move|mover|coloca|colocar|poe|por|bota|botar)(?: o| a)? (.{2,40}?) (?:pra|para a|para|na|a) (esquerda|direita)$/.exec(t);
  if (m) return { modo: m[2] as "esquerda" | "direita", programa: m[1] };
  return null;
}

/** Nome de layout aceitável: "estudo", "trabalho 2". Pura. */
export function nomeDeLayoutValido(nome: string): boolean {
  return /^[\p{L}\p{N} _-]{1,30}$/u.test(nome.trim());
}
