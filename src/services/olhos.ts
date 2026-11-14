import { desktopCapturer, screen } from "electron";
import { getConfig } from "../main/config";
import { gerarGemini } from "./gemini";

/**
 * Os olhos do agente de tela (13/11): quando a acessibilidade não acha o botão/campo (jogo, app
 * desenhado à mão, imagem), tira uma foto SÓ da janela e pergunta a um modelo de visão onde está.
 *
 * Primeiro o modelo LOCAL (qwen3-vl:2b no Ollama: ~2 GB, de graça, a foto não sai do PC); se ele
 * não responder a tempo ou não achar, o Gemini (a foto vai para o Google). Os dois respondem em
 * coordenadas 0–1000 da imagem — é o formato nativo dos dois.
 */

export const MODELO_VISAO_LOCAL = "qwen3-vl:2b";
let localLentoAte = 0;

export interface Retangulo { x: number; y: number; w: number; h: number }
export interface Visto { x: number; y: number; por: "local" | "gemini" }

/** Ponto 0–1000 da foto → pixel físico da tela. null se fora da faixa. Pura. */
export function pontoNaTela(r: Retangulo, nx: unknown, ny: unknown): { x: number; y: number } | null {
  const a = Number(nx), b = Number(ny);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a > 1000 || b > 1000) return null;
  return { x: Math.round(r.x + (a / 1000) * r.w), y: Math.round(r.y + (b / 1000) * r.h) };
}

/**
 * Foto (JPEG base64) do retângulo em pixels físicos, no máximo 1280 de largura. `area` é o pedaço
 * que coube na tela (janela saindo pela borda) — é contra ele que o 0–1000 da resposta vale.
 */
export async function fotoDaArea(r: Retangulo): Promise<{ base64: string; area: Retangulo }> {
  const dip = screen.screenToDipRect(null, { x: r.x, y: r.y, width: r.w, height: r.h });
  const d = screen.getDisplayMatching(dip);
  const sf = d.scaleFactor || 1;
  const fontes = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: Math.round(d.size.width * sf), height: Math.round(d.size.height * sf) } });
  const fonte = fontes.find((f) => f.display_id === String(d.id)) ?? fontes[0];
  if (!fonte) throw new Error("sem tela para fotografar");
  const img = fonte.thumbnail;
  const tam = img.getSize();
  const ox = Math.round(d.bounds.x * sf), oy = Math.round(d.bounds.y * sf);
  const x = Math.max(0, r.x - ox), y = Math.max(0, r.y - oy);
  const w = Math.max(1, Math.min(r.w - (x - (r.x - ox)), tam.width - x)), h = Math.max(1, Math.min(r.h - (y - (r.y - oy)), tam.height - y));
  const corte = img.crop({ x, y, width: w, height: h });
  const final = w > 1280 ? corte.resize({ width: 1280 }) : corte;
  return { base64: final.toJPEG(72).toString("base64"), area: { x: x + ox, y: y + oy, w, h } };
}

const PERGUNTA = (alvo: string) => `A imagem é uma janela do computador. Ache: ${alvo}
Responda SÓ JSON {"achou": true|false, "visto": "o que está dentro da caixa, em poucas palavras", "x1": n, "y1": n, "x2": n, "y2": n} com a CAIXA do elemento (canto de cima à esquerda e canto de baixo à direita) em coordenadas normalizadas de 0 a 1000 (x a partir da esquerda, y a partir do topo).
Só "achou": true se o elemento estiver CLARAMENTE visível na imagem (o próprio ícone, logo ou texto). Coisa parecida, outro logo ou dúvida = "achou": false. Não chute.`;

const ESQUEMA = {
  type: "object",
  properties: { achou: { type: "boolean" }, visto: { type: "string" }, x1: { type: "integer" }, y1: { type: "integer" }, x2: { type: "integer" }, y2: { type: "integer" } },
  required: ["achou", "visto", "x1", "y1", "x2", "y2"],
};
type Resposta = { achou?: boolean; visto?: string; x1?: number; y1?: number; x2?: number; y2?: number };

export interface Caixa { x: number; y: number; w: number; h: number; por: "local" | "gemini"; visto: string }

/** A caixa 0–1000 da resposta → retângulo em pixels físicos. null se inválida. Pura. */
export function caixaNaTela(r: Retangulo, j: Resposta | null | undefined): Omit<Caixa, "por" | "visto"> | null {
  if (!j?.achou) return null;
  const a = pontoNaTela(r, Math.min(Number(j.x1), Number(j.x2)), Math.min(Number(j.y1), Number(j.y2)));
  const b = pontoNaTela(r, Math.max(Number(j.x1), Number(j.x2)), Math.max(Number(j.y1), Number(j.y2)));
  if (!a || !b) return null;
  const w = Math.max(12, b.x - a.x), h = Math.max(12, b.y - a.y);
  // Caixa do tamanho da janela quase toda: o modelo não achou de verdade.
  if (w > r.w * 0.85 && h > r.h * 0.85) return null;
  return { x: a.x, y: a.y, w, h };
}

async function perguntarLocal(foto: string, alvo: string, prazoMs: number): Promise<Resposta | null> {
  const base = (getConfig().ollamaBaseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
  try {
    const r = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODELO_VISAO_LOCAL, stream: false, format: ESQUEMA, keep_alive: "10m", options: { temperature: 0 }, messages: [{ role: "user", content: PERGUNTA(alvo), images: [foto] }] }),
      signal: AbortSignal.timeout(prazoMs),
    });
    if (!r.ok) return null;
    const j = await r.json() as { message?: { content?: string } };
    return JSON.parse(j.message?.content ?? "{}");
  } catch { return null; }
}

/**
 * A caixa de `alvo` (descrição: "o botão Enviar", "o ícone do YouTube") dentro da janela `r`, em
 * pixels físicos. A janela tem de estar na frente (a foto é do que aparece). null = ninguém achou.
 */
export async function acharCaixaNaTela(r: Retangulo, alvo: string): Promise<Caixa | null> {
  const { base64: foto, area } = await fotoDaArea(r);
  // 14/11: o local e o Gemini correm juntos; vale a primeira resposta que achou (o local, de graça,
  // ganha quando a placa de vídeo está livre; com ela cheia, o Gemini responde antes e nada atrasa).
  // Local lento (> 5 s) fica de fora por 10 min.
  const local = Date.now() > localLentoAte ? (async (): Promise<Caixa | null> => {
    const t0 = Date.now();
    const j = await perguntarLocal(foto, alvo, 5_000);
    if (!j && Date.now() - t0 >= 4_900) localLentoAte = Date.now() + 10 * 60_000;
    const c = caixaNaTela(area, j);
    return c ? { ...c, por: "local", visto: String(j?.visto ?? "") } : null;
  })() : Promise.resolve(null);
  const nuvem = (async (): Promise<Caixa | null> => {
    const g = await gerarGemini({ mensagens: [{ papel: "user", texto: PERGUNTA(alvo), imagem: { mime: "image/jpeg", base64: foto } }], esquema: ESQUEMA, temperatura: 0, maxTokens: 200, prazoMs: 12_000 }).catch(() => null);
    if (!g) return null;
    try {
      const j = JSON.parse(g.texto) as Resposta;
      const c = caixaNaTela(area, j);
      return c ? { ...c, por: "gemini", visto: String(j.visto ?? "") } : null;
    } catch { return null; }
  })();
  return primeiraQueAchou([local, nuvem]);
}

/** A primeira promessa que resolve com algo (não null); null se todas derem null. Pura. */
export function primeiraQueAchou<T>(ps: Promise<T | null>[]): Promise<T | null> {
  return new Promise((ok) => {
    let faltam = ps.length;
    if (!faltam) { ok(null); return; }
    for (const p of ps) p.then((v) => { if (v) ok(v); else if (--faltam === 0) ok(null); }, () => { if (--faltam === 0) ok(null); });
  });
}

/** O centro de `alvo` na tela (para clicar). null = ninguém achou. */
export async function acharNaTela(r: Retangulo, alvo: string): Promise<Visto | null> {
  const c = await acharCaixaNaTela(r, alvo);
  return c ? { x: Math.round(c.x + c.w / 2), y: Math.round(c.y + c.h / 2), por: c.por } : null;
}
