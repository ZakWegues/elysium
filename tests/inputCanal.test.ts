import { describe, expect, it } from "vitest";
import {
  Acumulador, criarCanal, HostDeInput, LimiteDeFrames, MAX_EVENTOS_POR_FRAME, parseEventos, teclasParaVk,
} from "../src/services/inputCanal";

/** Dublê do host: anota cada chamada, na ordem. */
function hostFalso() {
  const chamadas: string[] = [];
  const anota = (s: string) => { chamadas.push(s); return Promise.resolve(); };
  const host: HostDeInput = {
    move: (dx, dy) => anota(`move ${dx} ${dy}`),
    wheel: (n) => anota(`wheel ${n}`),
    hwheel: (n) => anota(`hwheel ${n}`),
    buttonDown: (b) => anota(`down ${b}`),
    buttonUp: (b) => anota(`up ${b}`),
    click: (b) => anota(`click ${b}`),
    doubleClick: (b) => anota(`double ${b}`),
    keys: (v) => anota(`keys ${v.join(",")}`),
    type: (t) => anota(`type ${t}`),
  };
  return { host, chamadas };
}

describe("canal de input — parser", () => {
  it("aceita as operações conhecidas", () => {
    const r = parseEventos([["m", 1.5, -2], ["w", 0.25], ["w", 0, 1], ["d", "left"], ["u", "left"], ["c", "right"], ["dc"],
      ["k", ["win", "d"]], ["t", "olá"], ["bs", 3], ["ping", 42]]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.eventos.map(e => e.op)).toEqual(["m", "w", "w", "d", "u", "c", "dc", "k", "t", "bs", "ping"]);
  });
  it("recusa operação desconhecida, botão inválido e números ruins", () => {
    expect(parseEventos([["x", 1]]).ok).toBe(false);
    expect(parseEventos([["c", "meio"]]).ok).toBe(false);
    expect(parseEventos([["m", "1", 2]]).ok).toBe(false);
    expect(parseEventos([["m", Infinity, 2]]).ok).toBe(false);
    expect(parseEventos([["m", 99999, 0]]).ok).toBe(false);
    expect(parseEventos("m 1 2").ok).toBe(false);
    expect(parseEventos([]).ok).toBe(false);
  });
  it("limites: eventos por frame, texto, backspace e teclas", () => {
    const muitos = Array.from({ length: MAX_EVENTOS_POR_FRAME + 1 }, () => ["m", 1, 1]);
    expect(parseEventos(muitos).ok).toBe(false);
    expect(parseEventos([["t", "a".repeat(500)]]).ok).toBe(true);
    expect(parseEventos([["t", "a".repeat(501)]]).ok).toBe(false);
    expect(parseEventos([["bs", 0]]).ok).toBe(false);
    expect(parseEventos([["bs", 201]]).ok).toBe(false);
    expect(parseEventos([["k", ["ctrl", "teclainventada"]]]).ok).toBe(false);
    expect(parseEventos([["k", Array(9).fill("a")]]).ok).toBe(false);
  });
});

describe("canal de input — acumulador e limite", () => {
  it("guarda o subpixel até completar um pixel", () => {
    const a = new Acumulador();
    expect([a.tomar(0.4), a.tomar(0.4), a.tomar(0.4)]).toEqual([0, 0, 1]);
    expect(a.tomar(-0.6)).toBe(0);
    expect(a.tomar(-0.9)).toBe(-1);
  });
  it("no máximo 120 frames por segundo", () => {
    const l = new LimiteDeFrames(120);
    let aceitos = 0;
    for (let i = 0; i < 150; i++) if (l.permitir(1000 + i)) aceitos++;
    expect(aceitos).toBe(120);
    expect(l.permitir(2100)).toBe(true);
  });
});

describe("canal de input — teclas", () => {
  it("mapeia nomes para teclas virtuais", () => {
    expect(teclasParaVk(["ctrl", "shift", "esc"])).toEqual([0x11, 0x10, 0x1b]);
    expect(teclasParaVk(["win", "d"])).toEqual([0x5b, 0x44]);
    expect(teclasParaVk(["alt", "F4"])).toEqual([0x12, 0x73]);
    expect(teclasParaVk(["f1", "f12"])).toEqual([0x70, 0x7b]);
    expect(teclasParaVk(["pgup", "pgdn", "home", "end", "del"])).toEqual([0x21, 0x22, 0x24, 0x23, 0x2e]);
    expect(teclasParaVk(["up", "down", "left", "right"])).toEqual([0x26, 0x28, 0x25, 0x27]);
    expect(teclasParaVk(["7"])).toEqual([0x37]);
    expect(teclasParaVk(["playpause", "volup", "mute"])).toEqual([0xb3, 0xaf, 0xad]);
    expect(teclasParaVk(["f13"])).toBeNull();
  });
});

describe("canal de input — execução", () => {
  it("junta movimentos e mantém o clique depois do último movimento", () => {
    const { host, chamadas } = hostFalso();
    const canal = criarCanal(host);
    canal.tratar([["m", 2.6, 1], ["m", 2.6, 1], ["c", "left"], ["m", 0.2, 0]], 0);
    expect(chamadas).toEqual(["move 5 2", "click left"]);
    // O resto (0,2 + 0,2) fica para o próximo frame.
    canal.tratar([["m", 0.7, 0]], 10);
    expect(chamadas.at(-1)).toBe("move 1 0");
  });
  it("rolagem fracionária vira unidades de 1/120", () => {
    const { host, chamadas } = hostFalso();
    criarCanal(host).tratar([["w", 0.5, -0.25]], 0);
    expect(chamadas).toEqual(["wheel 60", "hwheel -30"]);
  });
  it("backspace repete a tecla e ping devolve o t", () => {
    const { host, chamadas } = hostFalso();
    const r = criarCanal(host).tratar([["bs", 2], ["ping", 123]], 0);
    expect(chamadas).toEqual(["keys 8", "keys 8"]);
    expect(r.pong).toBe(123);
  });
  it("frame inválido não chama o host", () => {
    const { host, chamadas } = hostFalso();
    const r = criarCanal(host).tratar([["m", 1, 1], ["zz"]], 0);
    expect(r.erro).toBeTruthy();
    expect(chamadas).toEqual([]);
  });
});
