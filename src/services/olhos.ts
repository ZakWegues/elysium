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
Responda SÓ JSON {"achou": true|false, "x": n, "y": n} com o CENTRO do elemento em coordenadas normalizadas de 0 a 1000 (x a partir da esquerda, y a partir do topo). Se não estiver na imagem, "achou": false.`;

const ESQUEMA = { type: "object", properties: { achou: { type: "boolean" }, x: { type: "integer" }, y: { type: "integer" } }, required: ["achou", "x", "y"] };

async function perguntarLocal(foto: string, alvo: string, prazoMs: number): Promise<{ achou?: boolean; x?: number; y?: number } | null> {
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
 * Onde está `alvo` (descrição: "o botão Enviar", "a caixa de pesquisa") dentro da janela `r`.
 * null = nenhum dos dois achou.
 */
export async function acharNaTela(r: Retangulo, alvo: string): Promise<Visto | null> {
  const { base64: foto, area } = await fotoDaArea(r);
  // O local demorou demais da última vez (placa de vídeo cheia): vai direto ao Gemini por 10 min.
  if (Date.now() > localLentoAte) {
    const t0 = Date.now();
    const local = await perguntarLocal(foto, alvo, 6_000);
    if (!local && Date.now() - t0 >= 5_900) localLentoAte = Date.now() + 10 * 60_000;
    const pl = local?.achou ? pontoNaTela(area, local.x, local.y) : null;
    if (pl) return { ...pl, por: "local" };
  }
  const g = await gerarGemini({ mensagens: [{ papel: "user", texto: PERGUNTA(alvo), imagem: { mime: "image/jpeg", base64: foto } }], esquema: ESQUEMA, temperatura: 0, maxTokens: 200, prazoMs: 12_000, leve: true }).catch(() => null);
  if (!g) return null;
  try {
    const j = JSON.parse(g.texto) as { achou?: boolean; x?: number; y?: number };
    const pg = j.achou ? pontoNaTela(area, j.x, j.y) : null;
    return pg ? { ...pg, por: "gemini" } : null;
  } catch { return null; }
}

