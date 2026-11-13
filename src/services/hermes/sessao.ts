import { avisarEstadoAoVivo, estadoDaFerramenta, nomeNoEventoHermes } from "../estadoAoVivo";
import { ConexaoHermes, EventoHermes } from "./conexao";

/**
 * Um turno de conversa com o Hermes (fase 21, bloco 213) — sem processo nem config: recebe a
 * conexão pronta. É o que os testes exercitam com o servidor falso.
 *
 * Um pedido vira `prompt.submit` numa sessão do perfil `ely`; os pedaços chegam em
 * `message.delta` e o fim em `message.complete`. No meio, o Hermes pode PERGUNTAR (aprovação de
 * comando, esclarecimento): o turno termina ali com a pergunta, e a resposta do dono no pedido
 * seguinte destrava o agente (ver `aprovacoes.ts`).
 */

/** Tempos medidos em 09/10 (nemotron :free): sessão quente 2,0–2,7 s até a 1ª palavra; fria 6–11 s. */
export const PRAZO_SINAL_QUENTE_MS = 6_000;
export const PRAZO_SINAL_FRIO_MS = 20_000;
export const PRAZO_TURNO_MS = 120_000;
/** Sem nenhum evento por este tempo no meio do turno = o Hermes travou (ferramenta lenta conta como evento). */
export const PRAZO_SILENCIO_MS = 25_000;

export type FimDoTurno =
  | { tipo: "resposta"; texto: string }
  | { tipo: "pergunta"; texto: string; metodo: string; params: Record<string, unknown>; responder: (r: unknown) => void; resto: Promise<FimDoTurno> }
  | { tipo: "erro"; motivo: string };

export interface OpcoesTurno {
  onToken?: (t: string) => void;
  /** Prazo para o 1º sinal de vida (pensamento, ferramenta ou texto). Estourou = reserva. */
  prazoSinalMs: number;
  prazoTurnoMs?: number;
  prazoSilencioMs?: number;
}

/** Eventos que mostram que o agente está trabalhando neste turno. Puro. */
export function ehSinalDeVida(tipo: string): boolean {
  return /^(message\.(start|delta)|thinking\.delta|reasoning\.delta|tool\.(start|generating))$/.test(tipo);
}

/**
 * O fim de um turno vindo do `message.complete`: texto, ou erro quando o Hermes mesmo falhou
 * (429 do OpenRouter, modelo fora). Puro.
 */
export function lerFim(payload: Record<string, unknown> | undefined, acumulado: string): FimDoTurno {
  const p = payload ?? {};
  const texto = typeof p.text === "string" && p.text.trim() ? p.text : acumulado;
  if (p.status === "error" || p.error) return { tipo: "erro", motivo: String(p.error ?? p.failure_reason ?? "erro do modelo").slice(0, 200) };
  if (p.status === "interrupted" && !texto.trim()) return { tipo: "erro", motivo: "interrompido" };
  if (!texto.trim()) return { tipo: "erro", motivo: "resposta vazia" };
  return { tipo: "resposta", texto: texto.trim() };
}

/**
 * Manda o texto e acompanha o turno até o fim, a pergunta do servidor ou o prazo.
 * `pedidos` recebe as perguntas do servidor desta sessão (quem liga é o `cerebro.ts`).
 */
export function rodarTurno(
  con: ConexaoHermes,
  sessionId: string,
  texto: string,
  op: OpcoesTurno,
  pedidos: { aguardar: (fn: ((metodo: string, params: Record<string, unknown>, responder: (r: unknown) => void) => void) | null) => void },
): Promise<FimDoTurno> {
  return new Promise<FimDoTurno>((resolver) => {
    let acumulado = "";
    let sinal = false;
    let acabou = false;
    let esperandoDono = false;
    // Depois de uma pergunta, o resto do turno segue aqui (o "sim" do dono destrava o agente).
    let resolverAtual = resolver;

    const terminar = (fim: FimDoTurno) => {
      if (acabou) return;
      acabou = true;
      clearTimeout(tSinal);
      clearTimeout(tTurno);
      if (tSilencio) clearTimeout(tSilencio);
      desligar();
      pedidos.aguardar(null);
      resolverAtual(fim);
    };

    // Medido na bancada (10/10): o modelo :free às vezes começa (pensamento) e para de mandar
    // qualquer coisa — o turno ficava preso até os 120 s. Sem evento nenhum por
    // `prazoSilencioMs` depois do primeiro sinal, desiste e o chamador cai na reserva.
    let tSilencio: ReturnType<typeof setTimeout> | null = null;
    const vigiarSilencio = () => {
      if (tSilencio) clearTimeout(tSilencio);
      tSilencio = setTimeout(() => {
        void con.chamar("session.interrupt", { session_id: sessionId }, 5_000).catch(() => {});
        terminar(acumulado.trim() ? { tipo: "resposta", texto: acumulado.trim() } : { tipo: "erro", motivo: "o Hermes parou no meio" });
      }, op.prazoSilencioMs ?? PRAZO_SILENCIO_MS);
    };

    const desligar = con.ouvir((e: EventoHermes) => {
      if (e.session_id && e.session_id !== sessionId) return;
      if (sinal && !esperandoDono) vigiarSilencio();
      if (ehSinalDeVida(e.type)) { if (!sinal) vigiarSilencio(); sinal = true; clearTimeout(tSinal); }
      if (e.type === "message.delta") {
        const t = typeof e.payload?.text === "string" ? e.payload.text : "";
        if (t) { acumulado += t; op.onToken?.(t); }
      } else if (e.type === "tool.start") {
        // 13/11: o que o Hermes está fazendo, traduzido ("Pesquisando…"), para a Ely flutuante.
        const { nome, args } = nomeNoEventoHermes(e.payload);
        if (nome) avisarEstadoAoVivo(estadoDaFerramenta(nome, args));
      } else if (e.type === "message.complete") {
        terminar(lerFim(e.payload, acumulado));
      }
    });

    pedidos.aguardar((metodo, params, responder) => {
      sinal = true;
      clearTimeout(tSinal);
      // Esperando o "sim" do dono: o silêncio do Hermes é normal; volta a vigiar na resposta.
      esperandoDono = true;
      if (tSilencio) clearTimeout(tSilencio);
      const responderOriginal = responder;
      responder = (r: unknown) => { esperandoDono = false; vigiarSilencio(); responderOriginal(r); };
      // O turno "acaba" para quem perguntou, com a pergunta; o resto continua numa promessa nova.
      const anterior = resolverAtual;
      const resto = new Promise<FimDoTurno>((r) => { resolverAtual = r; });
      anterior({ tipo: "pergunta", texto: acumulado.trim(), metodo, params, responder, resto });
      acumulado = "";
    });

    const tSinal = setTimeout(() => {
      if (sinal) return;
      void con.chamar("session.interrupt", { session_id: sessionId }, 5_000).catch(() => {});
      terminar({ tipo: "erro", motivo: "o Hermes demorou para começar" });
    }, op.prazoSinalMs);
    const tTurno = setTimeout(() => {
      void con.chamar("session.interrupt", { session_id: sessionId }, 5_000).catch(() => {});
      terminar(acumulado.trim() ? { tipo: "resposta", texto: acumulado.trim() } : { tipo: "erro", motivo: "o Hermes não terminou a tempo" });
    }, op.prazoTurnoMs ?? PRAZO_TURNO_MS);

    con.chamar<{ status?: string }>("prompt.submit", { session_id: sessionId, text: texto }, 15_000)
      .then((r) => { if (r?.status && r.status !== "streaming" && r.status !== "queued") console.warn(`[hermes] prompt.submit: ${r.status}`); })
      .catch((e) => terminar({ tipo: "erro", motivo: e instanceof Error ? e.message : String(e) }));
  });
}
