/**
 * Canal de entrada pelo WebSocket do celular (fase 22).
 *
 * O trackpad mandava um POST HTTP a cada 40 ms, sem esperar resposta: os pedidos chegavam
 * fora de ordem (o clique antes do último movimento), cada um pagava cabeçalho, token e
 * limite de taxa, e o subpixel sumia no `Math.round`. Agora o celular junta os eventos de um
 * quadro e manda UM frame pelo WebSocket que já está aberto e autenticado:
 *
 *   {"type":"input","ev":[["m",3.4,-1.2],["m",2.1,0],["c","left"]]}
 *
 * Operações:
 *   m dx dy     move relativo (px, fracionário — o resto acumula para o próximo)
 *   w dy dx     rolagem em marcas da roda (fracionária: rolagem suave)
 *   d btn       aperta sem soltar (arrastar)     u btn   solta
 *   c btn       clique                           dc      duplo clique esquerdo
 *   k [teclas]  combinação (["ctrl","shift","esc"], ["win","d"]) — aperta em ordem, solta ao contrário
 *   t texto     digita (até 500 caracteres)      bs n    n backspaces (teclado ao vivo)
 *   ping [t]    responde {"type":"input.pong","t"} — o celular mede a ida e volta e sabe que o canal existe
 *
 * Tudo aqui é puro e testável (tests/inputCanal.test.ts) menos `criarCanal`, que fala com o host.
 */

export type Botao = "left" | "right" | "middle";

export type EventoInput =
  | { op: "m"; dx: number; dy: number }
  | { op: "w"; dy: number; dx: number }
  | { op: "d" | "u" | "c"; botao: Botao }
  | { op: "dc" }
  | { op: "k"; vks: number[] }
  | { op: "t"; texto: string }
  | { op: "bs"; n: number }
  | { op: "ping"; t: number | null };

export const MAX_EVENTOS_POR_FRAME = 64;
export const MAX_FRAMES_POR_SEGUNDO = 120;
export const MAX_TEXTO = 500;
const MAX_DELTA = 5000;
const MAX_TECLAS = 8;
const MAX_BACKSPACE = 200;

export type ResultadoParse = { ok: true; eventos: EventoInput[] } | { ok: false; erro: string };

const BOTOES: readonly Botao[] = ["left", "right", "middle"];
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_DELTA;

/** Valida a lista `ev` de um frame `type:"input"`. Uma operação ruim recusa o frame inteiro. */
export function parseEventos(ev: unknown): ResultadoParse {
  if (!Array.isArray(ev)) return { ok: false, erro: "ev precisa ser uma lista" };
  if (ev.length === 0) return { ok: false, erro: "frame vazio" };
  if (ev.length > MAX_EVENTOS_POR_FRAME) return { ok: false, erro: `no máximo ${MAX_EVENTOS_POR_FRAME} eventos por frame` };
  const eventos: EventoInput[] = [];
  for (const item of ev) {
    if (!Array.isArray(item) || typeof item[0] !== "string") return { ok: false, erro: "evento malformado" };
    const [op, a, b] = item as [string, unknown, unknown];
    switch (op) {
      case "m":
        if (!numero(a) || !numero(b)) return { ok: false, erro: "m precisa de dx e dy" };
        eventos.push({ op: "m", dx: a, dy: b });
        break;
      case "w": {
        const dx = b === undefined ? 0 : b;
        if (!numero(a) || !numero(dx) || Math.abs(a) > 100 || Math.abs(dx) > 100) return { ok: false, erro: "w precisa de dy (e dx) em marcas" };
        eventos.push({ op: "w", dy: a, dx });
        break;
      }
      case "d": case "u": case "c":
        if (!BOTOES.includes(a as Botao)) return { ok: false, erro: `${op} precisa de left, right ou middle` };
        eventos.push({ op, botao: a as Botao });
        break;
      case "dc":
        eventos.push({ op: "dc" });
        break;
      case "k": {
        if (!Array.isArray(a) || a.length === 0 || a.length > MAX_TECLAS || !a.every(x => typeof x === "string")) {
          return { ok: false, erro: `k precisa de 1 a ${MAX_TECLAS} teclas` };
        }
        const vks = teclasParaVk(a as string[]);
        if (!vks) return { ok: false, erro: "tecla desconhecida" };
        eventos.push({ op: "k", vks });
        break;
      }
      case "t":
        if (typeof a !== "string" || a.length === 0 || a.length > MAX_TEXTO) return { ok: false, erro: `t precisa de 1 a ${MAX_TEXTO} caracteres` };
        eventos.push({ op: "t", texto: a });
        break;
      case "bs":
        if (typeof a !== "number" || !Number.isInteger(a) || a < 1 || a > MAX_BACKSPACE) return { ok: false, erro: `bs precisa de 1 a ${MAX_BACKSPACE}` };
        eventos.push({ op: "bs", n: a });
        break;
      case "ping":
        eventos.push({ op: "ping", t: typeof a === "number" && Number.isFinite(a) ? a : null });
        break;
      default:
        return { ok: false, erro: `operação desconhecida: ${op.slice(0, 12)}` };
    }
  }
  return { ok: true, eventos };
}

/**
 * Guarda a fração que o inteiro não leva. Sem isto, um dedo devagar (0,4 px por evento)
 * nunca movia o cursor: `Math.round(0.4)` é 0 para sempre.
 */
export class Acumulador {
  private resto = 0;
  tomar(d: number): number {
    this.resto += d;
    const envia = Math.trunc(this.resto) || 0; // sem -0
    this.resto -= envia;
    return envia;
  }
  zerar(): void { this.resto = 0; }
}

/** Janela deslizante de 1 s: no máximo `max` frames por conexão. */
export class LimiteDeFrames {
  private marcas: number[] = [];
  constructor(private readonly max = MAX_FRAMES_POR_SEGUNDO) {}
  permitir(agora: number): boolean {
    while (this.marcas.length && agora - this.marcas[0] >= 1000) this.marcas.shift();
    if (this.marcas.length >= this.max) return false;
    this.marcas.push(agora);
    return true;
  }
}

// ── teclas ─────────────────────────────────────────────────────────────────────

const VK_NOMES: Record<string, number> = {
  ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12,
  win: 0x5b, meta: 0x5b, super: 0x5b,
  esc: 0x1b, escape: 0x1b, tab: 0x09, enter: 0x0d, return: 0x0d, space: 0x20, espaco: 0x20,
  backspace: 0x08, del: 0x2e, delete: 0x2e, ins: 0x2d, insert: 0x2d,
  home: 0x24, end: 0x23, pgup: 0x21, pageup: 0x21, pgdn: 0x22, pagedown: 0x22,
  left: 0x25, up: 0x26, right: 0x27, down: 0x28,
  printscreen: 0x2c, prtsc: 0x2c, capslock: 0x14, apps: 0x5d, menu: 0x5d,
  // mídia e volume
  playpause: 0xb3, next: 0xb0, prev: 0xb1, stop: 0xb2,
  mute: 0xad, volup: 0xaf, voldown: 0xae,
};

/** Teclas que o Windows só entende certo com KEYEVENTF_EXTENDEDKEY (o host liga a flag). */
export const VK_ESTENDIDAS: readonly number[] = [0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e, 0x5b, 0x5d, 0x2c];

/** ["ctrl","shift","esc"] → [0x11, 0x10, 0x1B]. `null` se alguma tecla não existir. */
export function teclasParaVk(teclas: readonly string[]): number[] | null {
  const vks: number[] = [];
  for (const bruta of teclas) {
    const t = bruta.trim().toLowerCase();
    let vk: number | undefined = VK_NOMES[t];
    if (vk === undefined && /^f([1-9]|1[0-2])$/.test(t)) vk = 0x70 + Number(t.slice(1)) - 1;
    if (vk === undefined && /^[a-z]$/.test(t)) vk = t.toUpperCase().charCodeAt(0);
    if (vk === undefined && /^[0-9]$/.test(t)) vk = t.charCodeAt(0);
    if (vk === undefined) return null;
    vks.push(vk);
  }
  return vks;
}

// ── execução ───────────────────────────────────────────────────────────────────

/** O que o canal precisa do host de entrada (o `inputHost` real, ou um dublê no teste). */
export interface HostDeInput {
  move(dx: number, dy: number): Promise<void>;
  wheel(unidades: number): Promise<void>;
  hwheel(unidades: number): Promise<void>;
  buttonDown(b: Botao): Promise<void>;
  buttonUp(b: Botao): Promise<void>;
  click(b: Botao): Promise<void>;
  doubleClick(b: Botao): Promise<void>;
  keys(vks: number[]): Promise<void>;
  type(texto: string): Promise<void>;
}

export interface CanalDeInput {
  /** Trata o `ev` de um frame. Devolve o `t` do ping (para o pong) quando houver um. */
  tratar(ev: unknown, agora?: number): { pong: number | null; erro?: string };
}

/**
 * Um canal por conexão: acumuladores de subpixel e o limite de frames são dela. Os comandos
 * vão ao host NA ORDEM em que chegaram (o host é serial e o stdin preserva a ordem) — por isso
 * o clique nunca passa na frente do último movimento. Movimentos seguidos viram um só.
 */
export function criarCanal(host: HostDeInput, aoErro: (e: unknown) => void = () => {}): CanalDeInput {
  const ax = new Acumulador(), ay = new Acumulador();
  const wy = new Acumulador(), wx = new Acumulador();
  const limite = new LimiteDeFrames();
  const mandar = (p: Promise<void>) => { p.catch(aoErro); };
  return {
    tratar(ev, agora = Date.now()) {
      if (!limite.permitir(agora)) return { pong: null, erro: "rápido demais" };
      const r = parseEventos(ev);
      if (!r.ok) return { pong: null, erro: r.erro };
      let pong: number | null = null;
      let mx = 0, my = 0;
      const soltarMovimento = () => {
        const dx = ax.tomar(mx), dy = ay.tomar(my);
        mx = 0; my = 0;
        if (dx || dy) mandar(host.move(dx, dy));
      };
      for (const e of r.eventos) {
        if (e.op === "m") { mx += e.dx; my += e.dy; continue; }
        soltarMovimento();
        switch (e.op) {
          case "w": {
            const v = wy.tomar(e.dy * 120), h = wx.tomar(e.dx * 120);
            if (v) mandar(host.wheel(v));
            if (h) mandar(host.hwheel(h));
            break;
          }
          case "d": mandar(host.buttonDown(e.botao)); break;
          case "u": mandar(host.buttonUp(e.botao)); break;
          case "c": mandar(host.click(e.botao)); break;
          case "dc": mandar(host.doubleClick("left")); break;
          case "k": mandar(host.keys(e.vks)); break;
          case "t": mandar(host.type(e.texto)); break;
          case "bs": for (let i = 0; i < e.n; i++) mandar(host.keys([0x08])); break;
          case "ping": pong = e.t ?? agora; break;
        }
      }
      soltarMovimento();
      return { pong };
    },
  };
}
