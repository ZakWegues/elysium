import "./lib/devtools";
import { Renderer, type ActionEvent, type OpenUIError } from "@openuidev/react-lang";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { library } from "./lib/library";
import { definirInternet } from "./config";
import { aoReceber, enviarAoHost, ligarPonte } from "./ponte";
import { estado as esquemaEstado, type MensagemDoHost, type Tema } from "./protocolo";
import "./movimento.css";

/**
 * A tela inteligente, do lado de dentro do sandbox (iframe `sandbox="allow-scripts"` no PC,
 * WebView no celular). Recebe o programa OpenUI Lang do host, desenha com a biblioteca, e devolve
 * só mensagens: altura, ações (perguntar / abrir link / copiar), estado e pedidos (fotos, rota).
 */

type Programa = Extract<MensagemDoHost, { tipo: "programa" }>;

function aplicarTema(t: Tema) {
  const raiz = document.documentElement;
  raiz.dataset.theme = t.esquema === "escuro" ? "dark" : "light";
  raiz.style.colorScheme = t.esquema === "escuro" ? "dark" : "light";
  for (const [nome, valor] of Object.entries(t.vars ?? {})) raiz.style.setProperty(nome, valor);
  if (t.reduzirMovimento) raiz.dataset.reduzir = "";
  else delete raiz.dataset.reduzir;
}

/** Ação da tela → host. @ToAssistant vira "perguntar", @OpenUrl "abrirLink", @CopyToClipboard "copiar". */
function aoAgir(e: ActionEvent) {
  const p = e.params ?? {};
  if (e.type === "continue_conversation") {
    const texto = typeof p.message === "string" ? p.message : e.humanFriendlyMessage;
    if (texto?.trim()) enviarAoHost({ tipo: "acao", acao: "perguntar", valor: texto.slice(0, 4000) });
  } else if (e.type === "open_url" && typeof p.url === "string") {
    enviarAoHost({ tipo: "acao", acao: "abrirLink", valor: p.url.slice(0, 4000) });
  } else if (e.type === "CopyToClipboard" && typeof p.text === "string") {
    enviarAoHost({ tipo: "acao", acao: "copiar", valor: p.text.slice(0, 4000) });
  }
}

/** Número de um texto como "R$ 1.234,56" / "37%" / "12 km" → [prefixo, número, sufixo, casas]. */
function numeroDe(texto: string): { antes: string; n: number; depois: string; casas: number } | null {
  const m = /^(\D*?)(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?)(\D*)$/.exec(texto.trim());
  if (!m) return null;
  const casas = m[2].includes(",") ? m[2].split(",")[1].length : 0;
  const n = Number(m[2].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? { antes: m[1], n, depois: m[3], casas } : null;
}

/**
 * Número calculado que muda (um slider mexe no total): conta até o valor novo em ≤ 300 ms. Só
 * nos títulos, só quando o formato bate dos dois lados; com movimento reduzido, troca direto.
 */
function ligarContagem(raiz: HTMLElement) {
  const mo = new MutationObserver((mudancas) => {
    if (document.documentElement.dataset.reduzir !== undefined || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const m of mudancas) {
      const no = m.target;
      if (no.nodeType !== Node.TEXT_NODE || !no.parentElement?.closest(".iui-title")) continue;
      const de = numeroDe(m.oldValue ?? ""), para = numeroDe(no.textContent ?? "");
      if (!de || !para || de.n === para.n || de.antes !== para.antes || de.depois !== para.depois) continue;
      const t0 = performance.now(), dur = 300, alvo = no.textContent;
      const fmt = (v: number) => para.antes + v.toLocaleString("pt-BR", { minimumFractionDigits: para.casas, maximumFractionDigits: para.casas }) + para.depois;
      const passo = (agora: number) => {
        if (no.textContent !== alvo && no.textContent !== (no as Text & { _ultimo?: string })._ultimo) return; // o React escreveu de novo
        const k = Math.min(1, (agora - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        const v = k >= 1 ? alvo! : fmt(de.n + (para.n - de.n) * e);
        (no as Text & { _ultimo?: string })._ultimo = v;
        mo.disconnect(); no.textContent = v; observar();
        if (k < 1) requestAnimationFrame(passo);
      };
      requestAnimationFrame(passo);
    }
  });
  const observar = () => mo.observe(raiz, { characterData: true, characterDataOldValue: true, subtree: true });
  observar();
}

function Tela() {
  const [programa, setPrograma] = useState<Programa | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const timerEstado = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sair = aoReceber((m) => {
      if (m.tipo === "programa") { aplicarTema(m.tema); setPrograma(m); }
      else if (m.tipo === "tema") aplicarTema(m.tema);
      else if (m.tipo === "config") definirInternet(m.internet);
    });
    // Só agora, com alguém ouvindo: o host manda o programa ao receber isto.
    enviarAoHost({ tipo: "pronta" });
    return sair;
  }, []);

  // Altura: o host ajusta o iframe/WebView ao conteúdo.
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    let ultima = -1;
    const medir = () => {
      // No meio de um redimensionamento o quadro passa por larguras minúsculas e o texto quebra
      // letra a letra: medir aí faria o host pular para milhares de px.
      if (window.innerWidth < 120) return;
      // scrollHeight pega o que transborda (sombra, popover); +2 de folga contra arredondamento.
      const px = Math.ceil(Math.max(el.getBoundingClientRect().height, el.scrollHeight)) + 2;
      if (Math.abs(px - ultima) > 1) { ultima = px; enviarAoHost({ tipo: "altura", px: Math.min(px, 20_000) }); }
    };
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    medir();
    ligarContagem(el);
    return () => ro.disconnect();
  }, []);

  // A entrada em cascata só na 1ª pintura de cada programa.
  useEffect(() => {
    const el = caixa.current;
    if (!el || !programa || programa.streaming) return;
    for (const p of el.querySelectorAll<SVGPathElement>('.iui-chart-plot path[fill="none"]')) p.setAttribute("pathLength", "1");
    el.classList.add("entrando");
    const t = setTimeout(() => el.classList.remove("entrando"), 700);
    return () => clearTimeout(t);
  }, [programa?.texto, programa?.streaming]);

  function aoMudarEstado(vars: Record<string, unknown>) {
    if (timerEstado.current) clearTimeout(timerEstado.current);
    timerEstado.current = setTimeout(() => {
      const r = esquemaEstado.safeParse(vars);
      if (r.success) enviarAoHost({ tipo: "estado", vars: r.data });
    }, 400);
  }

  function aoErrar(erros: OpenUIError[]) {
    if (!erros.length || programa?.streaming) return;
    enviarAoHost({ tipo: "erro", mensagem: erros.map((e) => e.message).join(" | ").slice(0, 1000) });
  }

  return (
    <div id="tela" ref={caixa}>
      {programa ? (
        <Renderer
          response={programa.texto}
          library={library}
          isStreaming={programa.streaming === true}
          initialState={programa.estado}
          onAction={aoAgir}
          onStateUpdate={aoMudarEstado}
          onError={aoErrar}
          publishObservability={false}
        />
      ) : null}
    </div>
  );
}

// Link no texto (Markdown/Text): nunca navega dentro do sandbox — vira pedido ao host.
document.addEventListener("click", (e) => {
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!a) return;
  e.preventDefault();
  enviarAoHost({ tipo: "acao", acao: "abrirLink", valor: (a as HTMLAnchorElement).href.slice(0, 4000) });
}, true);

// Exceção solta vira `erro` para o host (que descarta a tela e fica só o texto).
addEventListener("error", (e) => enviarAoHost({ tipo: "erro", mensagem: String(e.message ?? e.error ?? "erro").slice(0, 1000) }));
addEventListener("unhandledrejection", (e) => enviarAoHost({ tipo: "erro", mensagem: String((e.reason as Error)?.message ?? e.reason ?? "erro").slice(0, 1000) }));

ligarPonte();
createRoot(document.getElementById("raiz")!).render(<Tela />);
