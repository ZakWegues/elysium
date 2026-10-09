import { synthesize, cancelSpeak, dividirEmFrases, preSintetizar } from "../services/tts";
import type { Humor } from "../services/humor";

/**
 * A fila de fala do PC e o "turno" atual (fase 20, bloco 203 — saiu do `main.ts`).
 *
 * Uma fala por vez, em pedaços por frase (o próximo sintetiza enquanto o atual toca). O
 * `turno` é o número que separa um pedido do seguinte: interromper avança o número, e quem
 * estava trabalhando para o turno velho confere `turnoAtual() !== meu` e desiste — sem isso,
 * o handler interrompido devolvia o estado a "ocioso" no meio do pedido novo.
 *
 * O módulo não conhece janela nem bandeja: quem quer saber se há fala saindo registra
 * `aoMudarFala` (o main avisa o dashboard e a bandeja).
 */

type Item = { text: string; resolve: () => void; inteira?: string; humor?: Humor };
const fila: Item[] = [];
let tocando = false;
let turno = 0;
/** Cada `drenar` tem a sua geração; interromper avança, e o laço velho para de puxar da fila. */
let geracao = 0;
let falandoAgora = "";
let ouvinte: (falando: boolean) => void = () => {};

export function aoMudarFala(fn: (falando: boolean) => void): void { ouvinte = fn; }

function avisar(f: boolean): void {
  // Janela destruída ou bandeja fora não podem travar a fila com `tocando = true` para sempre.
  try { ouvinte(f); } catch (e) { console.warn("[fala] aviso de fala falhou:", e); }
}

/** O turno corrente. */
export function turnoAtual(): number { return turno; }
/** Começa um turno novo e devolve o número dele. */
export function novoTurno(): number { return ++turno; }

/** A fala INTEIRA que está saindo (o barge-in confere se tem "Ely" nela). */
export function falaAtual(): string { return falandoAgora; }
export function estaFalando(): boolean { return tocando; }

/** Para tudo: cala, esvazia a fila (resolvendo quem esperava) e avança o turno. */
export function interromperTudo(): void {
  turno++;
  geracao++;
  cancelSpeak();
  // Resolve quem esperava pelos pedaços que não vão mais tocar: a promessa do `falar` mora
  // no ÚLTIMO pedaço, e descartá-lo sem resolver deixava o `await falar(...)` pendurado.
  for (const item of fila.splice(0)) item.resolve();
  falandoAgora = "";
  tocando = false;
  avisar(false);
}

/** Enfileira. Resolve quando o ÚLTIMO pedaço desta fala termina (ou é interrompido). */
export function falar(texto: string, humor?: Humor): Promise<void> {
  const pedacos = dividirEmFrases(texto);
  if (!pedacos.length) return Promise.resolve();
  return new Promise((resolve) => {
    pedacos.forEach((p, i) => fila.push({ text: p, inteira: texto, humor, resolve: i === pedacos.length - 1 ? resolve : () => {} }));
    if (!tocando) void drenar();
  });
}

async function drenar(): Promise<void> {
  // Laço, não recursão: a versão antiga se chamava sem `await` e uma exceção no meio deixava a
  // fila parada com `tocando = true`. A geração impede dois laços ao mesmo tempo: interrompido
  // no meio de um `synthesize`, o laço velho acordava e puxava pedaços da fala NOVA junto com
  // o laço que ela abriu — duas vozes por cima.
  const minha = ++geracao;
  tocando = true;
  while (fila.length && minha === geracao) {
    avisar(true);
    const item = fila.shift()!;
    falandoAgora = item.inteira ?? item.text;
    try {
      if (fila[0]) preSintetizar(fila[0].text, fila[0].humor);
      await synthesize(item.text, item.humor);
    } catch { /* best-effort: o próximo pedaço segue */ }
    item.resolve();
  }
  if (minha !== geracao) return;
  tocando = false;
  falandoAgora = "";
  avisar(false);
}
