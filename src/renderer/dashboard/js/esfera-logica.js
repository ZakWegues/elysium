// dashboard/js/esfera-logica.js — contas puras da esfera do Chat (fase 22).
//
// Fica num arquivo à parte para os testes alcançarem sem janela: no dashboard vira
// `window.EsferaLogica`; no vitest, `module.exports`. O celular tem o espelho em
// `src/lib/esferaLogica.ts` — os números são os mesmos de propósito.

(function (raiz) {
  /** Velocidade angular (rad/s) do seno do "pensando": a esfera e os pontinhos usam a mesma. */
  const RITMO_PENSANDO = 4;
  /** Duração da esfera "nascendo" (pontos espalhados → esfera). */
  const NASCER_MS = 900;

  /** Curva de saída: rápida no começo, assenta no fim. */
  function easeOutCubic(k) {
    const x = Math.max(0, Math.min(1, k));
    return 1 - Math.pow(1 - x, 3);
  }

  /**
   * Entre 22h e 6h a esfera fica mais calma: gira 40% mais devagar, brilha 25% menos e
   * respira mais devagar — combina com a voz baixa da noite. `hora` de 0 a 23 (pode ter fração).
   */
  function fatorNoturno(hora) {
    const h = ((Number(hora) % 24) + 24) % 24;
    const noite = h >= 22 || h < 6;
    return noite ? { giro: 0.6, brilho: 0.75, respira: 0.6 } : { giro: 1, brilho: 1, respira: 1 };
  }

  /** Cada tecla dá um micro-pulso: +0,04, sem passar de 0,15 (nunca abaixa quem já está alto). 22.1: era 0,08/0,35. */
  function pulsoDeTecla(nivel) {
    const n = Number(nivel) || 0;
    return n >= 0.15 ? n : Math.min(0.15, n + 0.04);
  }

  // ── física dos pontos (fase 23) ──
  /** Queda suave (smoothstep invertido): 1 no centro, 0 a partir de `raio`. */
  function quedaSuave(d, raio) {
    if (!(raio > 0) || d >= raio) return 0;
    const k = 1 - Math.max(0, d) / raio;
    return k * k * (3 - 2 * k);
  }
  /** Um passo de mola amortecida: devolve [posição, velocidade]. `a` = aceleração externa. */
  function passoMola(o, v, k, c, a, dt) {
    const v2 = v + (a - k * o - c * v) * dt;
    return [o + v2 * dt, v2];
  }
  /** Acima disto (px de tela por segundo) o mouse "joga" os pontos em vez de só abrir espaço. */
  const VEL_RAPIDA = 900;
  /** Força de repulsão: aceleração que, com a mola `k`, segura o ponto a `fracao·R` do lugar. */
  function aceleracaoRepulsao(d, R, k, fracao = 0.24, alcance = 0.36) {
    return k * fracao * R * quedaSuave(d, alcance * R);
  }

  const api = { RITMO_PENSANDO, NASCER_MS, easeOutCubic, fatorNoturno, pulsoDeTecla, quedaSuave, passoMola, VEL_RAPIDA, aceleracaoRepulsao };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.EsferaLogica = api;
})(typeof window !== "undefined" ? window : globalThis);
