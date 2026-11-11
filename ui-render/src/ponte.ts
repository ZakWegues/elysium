import { z } from "zod/v4";

/**
 * A ponte entre a tela (dentro do iframe/WebView sandbox, sem acesso a nada) e o app que a
 * hospeda (o dashboard do PC ou o ChatScreen do celular). Só `postMessage`, e tudo que chega é
 * validado aqui; o host valida o que sai (protocolo.ts tem os dois lados).
 *
 * A tela não fala com a internet: fotos e rotas são pedidas ao host, que busca pelo PC com
 * cache e lista fixa de hosts. Só os tiles do mapa (OpenFreeMap) saem direto — decisão do dono.
 */

import { mensagemDoHost, type MensagemDaTela, type MensagemDoHost } from "./protocolo";

const PRAZO_MS = 10_000;
let proximoId = 1;
const esperando = new Map<number, { ok: (dados: unknown) => void; erro: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
type Ouvinte = (m: MensagemDoHost) => void;
const ouvintes = new Set<Ouvinte>();

/** Na WebView do celular (react-native-webview) o host é o app nativo, não uma janela pai. */
type JanelaRn = Window & { ReactNativeWebView?: { postMessage: (texto: string) => void }; __elyHost?: (m: unknown) => void };
const rn = () => (window as JanelaRn).ReactNativeWebView;

export function enviarAoHost(m: MensagemDaTela): void {
  // Celular: a mensagem vai como texto JSON para o app, que valida tudo do lado de lá.
  const nativo = rn();
  if (nativo) { nativo.postMessage(JSON.stringify(m)); return; }
  // Sandbox sem allow-same-origin: a origem da tela é "null" e a do host não se conhece daqui.
  // O conteúdo não tem segredo; quem decide o que fazer com ele é o host, que valida tudo.
  window.parent.postMessage(m, "*");
}

/** Pede algo ao host (fotos, rota). Rejeita em 10 s ou se o host recusar. */
export function pedirAoHost<T>(rota: "fotos" | "rota", params: Record<string, string>, validar: z.ZodType<T>): Promise<T> {
  const id = proximoId++;
  return new Promise<T>((ok, erro) => {
    const timer = setTimeout(() => { esperando.delete(id); erro(new Error("o app não respondeu")); }, PRAZO_MS);
    esperando.set(id, {
      ok: (dados) => { const r = validar.safeParse(dados); if (r.success) ok(r.data); else erro(new Error("resposta fora do formato")); },
      erro, timer,
    });
    enviarAoHost({ tipo: "pedido", id, rota, params });
  });
}

/** A última de cada tipo, para quem começar a ouvir depois (o React monta depois da 1ª mensagem). */
const ultimas = new Map<MensagemDoHost["tipo"], MensagemDoHost>();

export function aoReceber(o: Ouvinte): () => void {
  ouvintes.add(o);
  for (const tipo of ["config", "programa", "tema"] as const) { const m = ultimas.get(tipo); if (m) o(m); }
  return () => { ouvintes.delete(o); };
}

/**
 * Liga a escuta. No PC/navegador só aceita mensagens da janela que hospeda (`window.parent`); na
 * WebView do celular o app chama `window.__elyHost(m)` (injectJavaScript). Sempre no formato.
 */
export function ligarPonte(): void {
  if (rn()) (window as JanelaRn).__elyHost = (dados) => receber(dados);
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || rn()) return;
    receber(e.data);
  });
}

function receber(dados: unknown): void {
  const r = mensagemDoHost.safeParse(dados);
  if (!r.success) return;
  const m = r.data;
  if (m.tipo === "resposta") {
    const p = esperando.get(m.id);
    if (!p) return;
    esperando.delete(m.id);
    clearTimeout(p.timer);
    if (m.erro) p.erro(new Error(m.erro));
    else p.ok(m.dados);
    return;
  }
  ultimas.set(m.tipo, m);
  for (const o of ouvintes) o(m);
}
