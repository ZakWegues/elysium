import Store from "electron-store";
import { listarJanelas, rodarPsJanelas, Janela } from "./janelas";
import { openApp } from "./openApp";
import {
  Area, casarJanelas, grade, ItemDoLayout, lugarUnico, ModoOrganizar, monitorDe, noProximoMonitor,
  nomeDeLayoutValido, paraAbsoluto, paraRelativo, Retangulo,
} from "../services/layoutJanelas";

/**
 * Organizar janelas e layouts salvos (fase 21, bloco 216).
 *
 * "Organiza minhas janelas" põe as janelas visíveis lado a lado (2), em L (3) ou em quadrantes
 * (4); "joga o Chrome pra esquerda", "manda pro outro monitor"; "salva o layout estudo" guarda
 * onde cada programa está (relativo ao monitor) e "layout estudo" abre o que falta e põe tudo
 * de volta. Os hwnd vêm do `EnumWindows` (números validados); nada de texto do pedido entra no
 * script do PowerShell.
 */

const store = new Store<{ layouts: Record<string, ItemDoLayout[]> }>({ name: "layouts-janelas", defaults: { layouts: {} } });

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const ACEITA_DPI = "[void][ElyWin]::SetProcessDPIAware()\n";

export async function monitores(): Promise<Area[]> {
  const out = await rodarPsJanelas(`${ACEITA_DPI}[ElyWin]::Monitores()`);
  const lista = out.split(/\r?\n/).map(l => l.trim().split(",").map(Number)).filter(p => p.length >= 4 && p.every(Number.isFinite));
  // O principal primeiro: "monitor 1" é o da barra de tarefas.
  lista.sort((a, b) => (b[4] ?? 0) - (a[4] ?? 0));
  return lista.map(([x, y, largura, altura]) => ({ x, y, largura, altura }));
}

async function retangulos(hwnds: string[]): Promise<Map<string, Retangulo & { maximizada: boolean }>> {
  const validos = hwnds.filter(h => /^\d{1,20}$/.test(h));
  if (!validos.length) return new Map();
  const out = await rodarPsJanelas(ACEITA_DPI + validos.map(h => `Write-Output ("${h} " + [ElyWin]::Rect(([IntPtr][long]${h})))`).join("\n"));
  const mapa = new Map<string, Retangulo & { maximizada: boolean }>();
  for (const l of out.split(/\r?\n/)) {
    const [h, resto] = l.trim().split(" ");
    const p = (resto ?? "").split(",").map(Number);
    if (h && p.length >= 4) mapa.set(h, { x: p[0], y: p[1], largura: p[2], altura: p[3], maximizada: p[4] === 1 });
  }
  return mapa;
}

async function posicionar(itens: { hwnd: string; r: Retangulo; maximizar?: boolean }[]): Promise<void> {
  const cmds = itens
    .filter(i => /^\d{1,20}$/.test(i.hwnd) && [i.r.x, i.r.y, i.r.largura, i.r.altura].every(Number.isFinite))
    .map(i => {
      const h = `([IntPtr][long]${i.hwnd})`;
      const pos = `[ElyWin]::Pos(${h}, ${Math.round(i.r.x)}, ${Math.round(i.r.y)}, ${Math.round(i.r.largura)}, ${Math.round(i.r.altura)})`;
      return i.maximizar ? `${pos}; [ElyWin]::Max(${h})` : pos;
    });
  if (cmds.length) await rodarPsJanelas(ACEITA_DPI + cmds.join("\n"));
}

/** A janela de um programa pelo nome falado ("chrome", "vs code"); sem nome, a que está em foco. */
function acharJanela(janelas: Janela[], programa?: string): Janela | undefined {
  if (!programa?.trim()) return janelas.find(j => j.emFoco) ?? janelas.find(j => !j.minimizada);
  const p = semAcento(programa).replace(/\s+/g, "");
  return janelas.find(j => semAcento(j.processo).replace(/\s+/g, "").includes(p) || semAcento(j.titulo).replace(/\s+/g, "").includes(p));
}

/** As que aparecem na tela, da mais recente para a mais antiga (ordem Z do Windows). */
function visiveis(janelas: Janela[]): Janela[] {
  return janelas.filter(j => !j.minimizada && !/^(electron|elysium)$/i.test(j.processo));
}

export async function organizarJanelas(modo: ModoOrganizar, programa?: string): Promise<string> {
  const janelas = await listarJanelas();
  const mons = await monitores();
  if (!mons.length) return "Não consegui ler os monitores.";

  if (modo === "lado_a_lado" || modo === "quadrantes" || modo === "cascata") {
    const n = modo === "lado_a_lado" ? 2 : 4;
    const alvo = visiveis(janelas).slice(0, modo === "cascata" ? 8 : n);
    if (!alvo.length) return "Não tem janela aberta para organizar.";
    const rects = await retangulos(alvo.map(j => j.hwnd));
    const primeira = rects.get(alvo[0].hwnd);
    const mon = mons[primeira ? monitorDe(primeira, mons) : 0];
    const lugares = modo === "cascata" ? alvo.map((_, i) => lugarUnico("cascata", mon, i)) : grade(alvo.length, mon);
    await posicionar(alvo.map((j, i) => ({ hwnd: j.hwnd, r: lugares[i] })));
    if (alvo.length === 1) return `Só tinha uma janela: ${alvo[0].processo} ocupando a tela.`;
    return `Pronto: ${alvo.map(j => j.processo).join(", ")} ${modo === "cascata" ? "em cascata" : alvo.length === 2 ? "lado a lado" : "em grade"}.`;
  }

  const j = acharJanela(janelas, programa);
  if (!j) return programa ? `Não achei uma janela de ${programa} aberta.` : "Não achei a janela.";
  const r = (await retangulos([j.hwnd])).get(j.hwnd);
  const mon = mons[r ? monitorDe(r, mons) : 0];
  if (modo === "outro_monitor") {
    if (mons.length < 2) return "Só tem um monitor ligado.";
    const destino = noProximoMonitor(r ?? { ...mon }, mons);
    await posicionar([{ hwnd: j.hwnd, r: destino, maximizar: r?.maximizada }]);
    return `${j.processo} foi para o outro monitor.`;
  }
  if (modo === "maximizar") { await posicionar([{ hwnd: j.hwnd, r: lugarUnico("maximizar", mon), maximizar: true }]); return `${j.processo} maximizado.`; }
  await posicionar([{ hwnd: j.hwnd, r: lugarUnico(modo, mon) }]);
  const onde: Record<string, string> = { esquerda: "na metade esquerda", direita: "na metade direita", cima: "em cima", baixo: "embaixo", centro: "no centro" };
  return `${j.processo} ${onde[modo] ?? "posicionado"}.`;
}

export function listarLayouts(): string[] {
  return Object.keys(store.get("layouts"));
}

export async function salvarLayout(nome: string): Promise<string> {
  if (!nomeDeLayoutValido(nome)) return "Nome de layout inválido (até 30 letras e números).";
  const janelas = visiveis(await listarJanelas()).slice(0, 12);
  if (!janelas.length) return "Não tem janela aberta para salvar.";
  const mons = await monitores();
  const rects = await retangulos(janelas.map(j => j.hwnd));
  const itens: ItemDoLayout[] = [];
  for (const j of janelas) {
    const r = rects.get(j.hwnd);
    if (!r) continue;
    const m = monitorDe(r, mons);
    // Título curto: serve só para escolher entre duas janelas do mesmo programa.
    itens.push({ processo: j.processo, titulo: j.titulo.slice(0, 80), monitor: m, rel: paraRelativo(r, mons[m]), maximizada: r.maximizada });
  }
  const chave = nome.trim().toLowerCase();
  store.set("layouts", { ...store.get("layouts"), [chave]: itens });
  return `Layout ${chave} salvo com ${itens.length} ${itens.length === 1 ? "janela" : "janelas"}.`;
}

export function apagarLayout(nome: string): boolean {
  const todos = { ...store.get("layouts") };
  const chave = nome.trim().toLowerCase();
  if (!todos[chave]) return false;
  delete todos[chave];
  store.set("layouts", todos);
  return true;
}

export async function aplicarLayout(nome: string): Promise<string> {
  const chave = nome.trim().toLowerCase();
  const itens = store.get("layouts")[chave];
  if (!itens?.length) {
    const tem = listarLayouts();
    return tem.length ? `Não tenho o layout ${chave}. Salvos: ${tem.join(", ")}.` : `Não tenho layout salvo. Diga "salva o layout ${chave}" com as janelas no lugar.`;
  }
  let abertas = await listarJanelas();
  let casadas = casarJanelas(itens, abertas);
  // Abre o que falta (pelo nome do processo, o mesmo que "abre o X" usa) e espera a janela.
  const faltam = itens.filter((_, i) => !casadas[i]);
  const abriu: string[] = [];
  for (const f of faltam) {
    try { await openApp(f.processo); abriu.push(f.processo); } catch { /* fica de fora */ }
  }
  if (abriu.length) {
    for (let t = 0; t < 10; t++) {
      await new Promise(r => setTimeout(r, 800));
      abertas = await listarJanelas();
      casadas = casarJanelas(itens, abertas);
      if (casadas.every(Boolean)) break;
    }
  }
  const mons = await monitores();
  await posicionar(itens.flatMap((it, i) => {
    const h = casadas[i];
    if (!h) return [];
    const m = mons[Math.min(it.monitor, mons.length - 1)] ?? mons[0];
    return [{ hwnd: h, r: paraAbsoluto(it.rel, m), maximizar: it.maximizada }];
  }));
  const ok = casadas.filter(Boolean).length;
  const ficou = itens.length - ok;
  return `Layout ${chave}: ${ok} ${ok === 1 ? "janela no lugar" : "janelas no lugar"}${abriu.length ? `, abri ${abriu.join(", ")}` : ""}${ficou ? `; ${ficou} não abriu` : ""}.`;
}
