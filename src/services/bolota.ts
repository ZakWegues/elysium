/**
 * O pulso da fala da Ely (fase 21) — puro. A esfera 3D do Chat se mexe com ele.
 *
 * A voz toca por PowerShell/MCI, então não há volume para medir: o pulso vem do tempo de cada
 * palavra que o Edge devolve junto com o áudio (`wordBoundaryEnabled`). Sem esse metadado
 * (voz offline), o envelope sai do texto e da duração.
 */

export interface Palavra {
  /** Início, em ms desde o começo do áudio. */
  inicio: number;
  /** Duração, em ms. */
  dur: number;
  /** Tamanho da palavra (letras): palavra longa pulsa um pouco mais forte. */
  tam: number;
}

/**
 * Os tempos de palavra do metadado do Edge (`{"Metadata":[{"Type":"WordBoundary","Data":{
 * "Offset","Duration","text":{"Text","Length"}}}]}`, tempos em unidades de 100 ns). Puro.
 */
export function palavrasDoMetadado(pedacos: string[]): Palavra[] {
  const palavras: Palavra[] = [];
  for (const p of pedacos) {
    // Um pedaço do stream pode trazer mais de um JSON colado.
    for (const bruto of p.split(/(?<=\})\s*(?=\{)/)) {
      let j: { Metadata?: { Type?: string; Data?: { Offset?: number; Duration?: number; text?: { Text?: string; Length?: number } } }[] };
      try { j = JSON.parse(bruto); } catch { continue; }
      for (const m of j.Metadata ?? []) {
        if (m.Type !== "WordBoundary" || !m.Data) continue;
        const inicio = Math.round((m.Data.Offset ?? 0) / 10_000);
        const dur = Math.max(40, Math.round((m.Data.Duration ?? 0) / 10_000));
        palavras.push({ inicio, dur, tam: m.Data.text?.Length ?? m.Data.text?.Text?.length ?? 4 });
      }
    }
  }
  return palavras.sort((a, b) => a.inicio - b.inicio);
}

/** Duração do MP3 de 48 kbps (o formato que o ELYSIUM pede ao Edge). Pura. */
export function duracaoDoMp3(bytes: number, kbps = 48): number {
  return Math.round((bytes * 8) / kbps);
}

/**
 * Sem metadado: palavras espalhadas pela duração, cada uma com tempo proporcional ao tamanho e
 * uma pausa depois de pontuação. Pura.
 */
export function palavrasPeloTexto(texto: string, durMs: number): Palavra[] {
  const tokens = texto.split(/\s+/).filter(Boolean);
  if (!tokens.length || durMs <= 0) return [];
  const pesos = tokens.map(t => t.replace(/[^\p{L}\p{N}]/gu, "").length + 2 + (/[.!?…;:,]$/.test(t) ? 3 : 0));
  const total = pesos.reduce((a, b) => a + b, 0);
  const palavras: Palavra[] = [];
  let t = 0;
  tokens.forEach((tok, i) => {
    const fatia = (pesos[i] / total) * durMs;
    const letras = tok.replace(/[^\p{L}\p{N}]/gu, "").length || 1;
    palavras.push({ inicio: Math.round(t), dur: Math.round(fatia * (/[.!?…;:,]$/.test(tok) ? 0.6 : 0.85)), tam: letras });
    t += fatia;
  });
  return palavras;
}

/**
 * O envelope da fala: um valor de 0 a 1 a cada `passoMs`. Cada palavra é um "morro" (sobe
 * rápido, desce devagar), mais alto quanto maior a palavra. Entre palavras, cai a quase zero —
 * é o que faz o pulso parecer fala, não ruído. Pura.
 */
export function envelopeDasPalavras(palavras: Palavra[], durMs: number, passoMs = 33): number[] {
  const fim = Math.max(durMs, ...palavras.map(p => p.inicio + p.dur), 0);
  const n = Math.ceil(fim / passoMs) + 1;
  const env = new Array<number>(n).fill(0);
  for (const p of palavras) {
    const pico = Math.min(1, 0.45 + Math.min(p.tam, 12) * 0.05);
    const a = Math.floor(p.inicio / passoMs);
    const b = Math.max(a + 1, Math.ceil((p.inicio + p.dur) / passoMs));
    const subida = Math.max(1, Math.round((b - a) * 0.25));
    for (let i = a; i <= b && i < n; i++) {
      const k = i - a;
      const v = k <= subida ? pico * (k / subida) : pico * Math.max(0, 1 - (k - subida) / (b - a - subida + 1));
      env[i] = Math.max(env[i], v);
    }
  }
  return env.map(v => Math.round(v * 100) / 100);
}

