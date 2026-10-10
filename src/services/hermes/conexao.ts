import WebSocket from "ws";

/**
 * A conversa JSON-RPC com o `hermes serve` (fase 21, bloco 213), por WebSocket.
 *
 * O protocolo é o do `tui_gateway` do Hermes (contratos em `tui_gateway/contracts/`), medido ao
 * vivo em 09/10/2026 na v0.21.6:
 *  - o cliente chama métodos (`session.create`, `prompt.submit`…) com `id` e recebe a resposta;
 *  - o servidor manda eventos como `{ method: "event", params: { type, session_id, payload } }`;
 *  - o servidor também PERGUNTA ao cliente (`approval`, `clarify`, `sudo`…) com `id` próprio
 *    (`srq-<n>`) e espera a resposta com o mesmo `id` — o agente fica parado até ela chegar.
 *
 * Esta classe não sabe nada de Ely nem de processo: recebe a URL pronta. É o que deixa os testes
 * usarem um servidor falso de WebSocket.
 */

export interface EventoHermes {
  type: string;
  session_id?: string;
  payload?: Record<string, unknown>;
}

export type TratadorDePedido = (metodo: string, params: Record<string, unknown>) => Promise<unknown>;

interface Frame {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export class ErroRpcHermes extends Error {
  constructor(message: string, public codigo?: number) { super(message); }
}

export class ConexaoHermes {
  private ws: WebSocket | null = null;
  private proximoId = 0;
  private pendentes = new Map<number, { ok: (v: unknown) => void; erro: (e: Error) => void; timer: NodeJS.Timeout }>();
  private ouvintes = new Set<(e: EventoHermes) => void>();
  private aoFechar = new Set<() => void>();
  private tratador: TratadorDePedido | null = null;

  /** Abre a conexão e espera o `gateway.ready` (o servidor só atende depois dele). */
  abrir(url: string, prazoMs = 15_000): Promise<void> {
    return new Promise((ok, erro) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let pronto = false;
      const timer = setTimeout(() => { if (!pronto) { erro(new Error("o Hermes não respondeu a tempo")); ws.terminate(); } }, prazoMs);
      ws.on("message", (dados) => {
        let f: Frame;
        try { f = JSON.parse(String(dados)); } catch { return; }
        if (!pronto && f.method === "event" && (f.params as EventoHermes | undefined)?.type === "gateway.ready") {
          pronto = true;
          clearTimeout(timer);
          ok();
        }
        this.receber(f);
      });
      ws.on("error", (e) => { if (!pronto) { clearTimeout(timer); erro(e); } });
      ws.on("close", () => {
        clearTimeout(timer);
        if (!pronto) erro(new Error("o Hermes fechou a conexão"));
        this.ws = null;
        for (const [, p] of this.pendentes) { clearTimeout(p.timer); p.erro(new Error("conexão com o Hermes caiu")); }
        this.pendentes.clear();
        for (const f of this.aoFechar) f();
      });
    });
  }

  aberta(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  fechar(): void {
    try { this.ws?.close(); } catch { /* já caiu */ }
    this.ws = null;
  }

  chamar<T = unknown>(metodo: string, params: Record<string, unknown> = {}, prazoMs = 30_000): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error("sem conexão com o Hermes"));
    const id = ++this.proximoId;
    return new Promise<T>((ok, erro) => {
      const timer = setTimeout(() => { this.pendentes.delete(id); erro(new Error(`o Hermes não respondeu a ${metodo}`)); }, prazoMs);
      this.pendentes.set(id, { ok: ok as (v: unknown) => void, erro, timer });
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params }));
    });
  }

  /** Eventos (`message.delta`, `tool.start`…). Devolve a função que desliga o ouvinte. */
  ouvir(fn: (e: EventoHermes) => void): () => void {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  quandoFechar(fn: () => void): void {
    this.aoFechar.add(fn);
  }

  /** Quem responde as perguntas do servidor (`approval`, `clarify`…). Sem tratador, recusa. */
  responderPedidosCom(fn: TratadorDePedido): void {
    this.tratador = fn;
  }

  private receber(f: Frame): void {
    // Resposta a uma chamada nossa.
    if (f.id !== undefined && !f.method) {
      const p = typeof f.id === "number" ? this.pendentes.get(f.id) : undefined;
      if (!p) return;
      this.pendentes.delete(f.id as number);
      clearTimeout(p.timer);
      if (f.error) p.erro(new ErroRpcHermes(f.error.message ?? "erro do Hermes", f.error.code));
      else p.ok(f.result);
      return;
    }
    if (f.method === "event") {
      const e = f.params as EventoHermes | undefined;
      if (e && typeof e.type === "string") for (const o of this.ouvintes) { try { o(e); } catch (err) { console.warn("[hermes] ouvinte falhou:", err); } }
      return;
    }
    // Pergunta do servidor ao cliente.
    if (f.method && f.id !== undefined) {
      const id = f.id;
      const responder = (frame: Record<string, unknown>) => {
        try { this.ws?.send(JSON.stringify({ jsonrpc: "2.0", id, ...frame })); } catch { /* caiu */ }
      };
      const tratador = this.tratador;
      if (!tratador) { responder({ error: { code: -32000, message: "recusado" } }); return; }
      tratador(f.method, (f.params as Record<string, unknown>) ?? {})
        .then((result) => responder({ result: result ?? {} }))
        .catch((e) => responder({ error: { code: -32000, message: e instanceof Error ? e.message : String(e) } }));
    }
  }
}
