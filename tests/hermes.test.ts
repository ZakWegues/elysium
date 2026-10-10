import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, WebSocket as WsCliente } from "ws";
import type { AddressInfo } from "node:net";
import { ConexaoHermes } from "../src/services/hermes/conexao";
import { ehSinalDeVida, lerFim, rodarTurno } from "../src/services/hermes/sessao";
import { contextoDoTurno } from "../src/services/hermes/persona";
import { descricaoDaAprovacao, falaDoEsclarecimento, respostaDeRecusa, respostasDoEsclarecimento, tipoDaPergunta } from "../src/services/hermes/aprovacoes";
import { perfilNaLista } from "../src/services/hermes/processo";
import { ehDoProprioPc, FERRAMENTAS_DO_HERMES, responderMcp } from "../src/services/mcpElysium";
import { pedirConfirmacao, responderConfirmacao } from "../src/services/confirmacao";

/**
 * Servidor falso do `hermes serve`: manda `gateway.ready`, responde `session.create` e, a cada
 * `prompt.submit`, roda o roteiro do teste (eventos e perguntas ao cliente).
 */
type Roteiro = (ws: WsCliente, sid: string, enviar: (o: object) => void, perguntar: (metodo: string, params: object) => Promise<unknown>) => void;

let servidor: WebSocketServer | null = null;
afterEach(() => { servidor?.close(); servidor = null; });

async function falso(roteiro: Roteiro): Promise<string> {
  servidor = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise(r => servidor!.once("listening", r));
  servidor.on("connection", (ws) => {
    const enviar = (o: object) => ws.send(JSON.stringify(o));
    let srq = 0;
    const esperando = new Map<string, (v: unknown) => void>();
    const perguntar = (metodo: string, params: object) => new Promise<unknown>((ok) => {
      const id = `srq-${++srq}`;
      esperando.set(id, ok);
      enviar({ jsonrpc: "2.0", id, method: metodo, params });
    });
    enviar({ jsonrpc: "2.0", method: "event", params: { type: "gateway.ready", payload: { skin: {} } } });
    ws.on("message", (d) => {
      const f = JSON.parse(String(d));
      if (typeof f.id === "string" && esperando.has(f.id)) { esperando.get(f.id)!(f.result); esperando.delete(f.id); return; }
      if (f.method === "client.capabilities") enviar({ jsonrpc: "2.0", id: f.id, result: { server_requests: ["approval", "clarify"] } });
      else if (f.method === "session.create") enviar({ jsonrpc: "2.0", id: f.id, result: { session_id: "s1", info: { model: "x" } } });
      else if (f.method === "session.interrupt") enviar({ jsonrpc: "2.0", id: f.id, result: { status: "interrupted" } });
      else if (f.method === "prompt.submit") {
        enviar({ jsonrpc: "2.0", id: f.id, result: { status: "streaming" } });
        roteiro(ws, f.params.session_id, enviar, perguntar);
      }
    });
  });
  return `ws://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/ws?token=t`;
}

const evento = (type: string, payload: object = {}, session_id = "s1") => ({ jsonrpc: "2.0", method: "event", params: { type, session_id, payload } });

async function conectar(url: string): Promise<ConexaoHermes> {
  const c = new ConexaoHermes();
  await c.abrir(url);
  return c;
}

function pedidosDe() {
  let fn: ((m: string, p: Record<string, unknown>, r: (x: unknown) => void) => void) | null = null;
  return {
    aguardar: (f: typeof fn) => { fn = f; },
    tratador: (m: string, p: Record<string, unknown>) => new Promise<unknown>((ok) => { if (fn) fn(m, p, ok); else ok({}); }),
  };
}

describe("ponte com o Hermes (bloco 213)", () => {
  it("um turno: os pedaços chegam e o fim vem do message.complete", async () => {
    const url = await falso((_ws, sid, enviar) => {
      enviar(evento("message.start", {}, sid));
      enviar(evento("message.delta", { text: "Olá, " }, sid));
      enviar(evento("message.delta", { text: "chefe." }, sid));
      enviar(evento("message.delta", { text: "ruído de outra sessão" }, "outra"));
      enviar(evento("message.complete", { text: "Olá, chefe.", status: "complete" }, sid));
    });
    const con = await conectar(url);
    const p = pedidosDe();
    con.responderPedidosCom(p.tratador);
    const pedacos: string[] = [];
    const fim = await rodarTurno(con, "s1", "oi", { onToken: t => pedacos.push(t), prazoSinalMs: 2000 }, p);
    expect(fim).toEqual({ tipo: "resposta", texto: "Olá, chefe." });
    expect(pedacos.join("")).toBe("Olá, chefe.");
    con.fechar();
  });

  it("a aprovação do Hermes vira pergunta, e o resto do turno segue depois da resposta", async () => {
    let escolha: unknown = null;
    const url = await falso(async (_ws, sid, enviar, perguntar) => {
      enviar(evento("thinking.delta", { text: "…" }, sid));
      const r = await perguntar("approval", { session_id: sid, request_id: "a1", command: "winget install x" });
      escolha = r;
      enviar(evento("message.complete", { text: "Instalei.", status: "complete" }, sid));
    });
    const con = await conectar(url);
    const p = pedidosDe();
    con.responderPedidosCom(p.tratador);
    const fim = await rodarTurno(con, "s1", "instala x", { prazoSinalMs: 2000 }, p);
    expect(fim.tipo).toBe("pergunta");
    if (fim.tipo !== "pergunta") return;
    expect(fim.metodo).toBe("approval");
    fim.responder({ choice: "once" });
    expect(await fim.resto).toEqual({ tipo: "resposta", texto: "Instalei." });
    expect(escolha).toEqual({ choice: "once" });
    con.fechar();
  });

  it("sem sinal de vida no prazo: erro (o chamador cai na reserva)", async () => {
    const url = await falso(() => { /* mudo */ });
    const con = await conectar(url);
    const p = pedidosDe();
    const fim = await rodarTurno(con, "s1", "oi", { prazoSinalMs: 150 }, p);
    expect(fim.tipo).toBe("erro");
    con.fechar();
  });

  it("erro do modelo no message.complete é erro, não resposta", () => {
    expect(lerFim({ status: "error", error: "429 rate limit" }, "").tipo).toBe("erro");
    expect(lerFim({ status: "complete" }, "texto acumulado")).toEqual({ tipo: "resposta", texto: "texto acumulado" });
    expect(lerFim({ status: "complete", text: "" }, "").tipo).toBe("erro");
  });

  it("sinais de vida", () => {
    expect(ehSinalDeVida("thinking.delta")).toBe(true);
    expect(ehSinalDeVida("tool.start")).toBe(true);
    expect(ehSinalDeVida("session.info")).toBe(false);
  });
});

describe("persona da Ely no Hermes", () => {
  const base = { nome: "", tratamento: "chefe", estilo: "equilibrado", instrucoes: "responda curto", modo: null };
  it("primeiro turno leva a persona e as instruções; os seguintes, só o que muda", () => {
    const um = contextoDoTurno("que horas são", "voz", base, true, new Date(2026, 9, 9, 22, 0));
    expect(um).toContain("Você é a Ely");
    expect(um).toContain('"chefe"');
    expect(um).toContain("LIDA EM VOZ ALTA");
    expect(um).toContain("responda curto");
    expect(um.endsWith("que horas são")).toBe(true);
    const dois = contextoDoTurno("e amanhã?", "texto", base, false);
    expect(dois).not.toContain("Você é a Ely");
    expect(dois).not.toContain("responda curto");
    expect(dois).toContain("ESCRITA no chat");
  });
  it("sem memória pessoal por padrão", () => {
    expect(contextoDoTurno("x", "voz", base, true)).not.toContain("[MEMÓRIA");
  });
});

describe("perguntas do Hermes", () => {
  it("só aprovação e esclarecimento passam; o resto é recusado", () => {
    expect(tipoDaPergunta("approval")).toBe("aprovacao");
    expect(tipoDaPergunta("clarify")).toBe("esclarecimento");
    expect(tipoDaPergunta("sudo")).toBe("recusar");
    expect(tipoDaPergunta("secret")).toBe("recusar");
    expect(respostaDeRecusa("approval")).toEqual({ choice: "deny" });
  });
  it("descrição e esclarecimento em português", () => {
    expect(descricaoDaAprovacao({ command: "rm -rf x" })).toContain("rm -rf x");
    const params = { questions: [{ qid: "q1", question: "Qual pasta?", choices: ["Documentos", "Área de trabalho"] }] };
    expect(falaDoEsclarecimento(params)).toContain("Opções: Documentos, Área de trabalho");
    expect(respostasDoEsclarecimento(params, "na documentos")).toEqual({ answers: { q1: "Documentos" } });
  });
  it("o 'não' e a troca de pedido avisam quem perguntou", async () => {
    let cancelou = 0;
    pedirConfirmacao("Vou instalar.", async () => "ok", Date.now(), () => cancelou++);
    expect(await responderConfirmacao("não")).toBe("Tudo bem, deixei como estava.");
    expect(cancelou).toBe(1);
    pedirConfirmacao("Vou instalar.", async () => "ok", Date.now(), () => cancelou++);
    expect(await responderConfirmacao("abre o chrome")).toBeNull();
    expect(cancelou).toBe(2);
    pedirConfirmacao("Vou instalar.", async () => "instalado", Date.now(), () => cancelou++);
    expect(await responderConfirmacao("sim")).toBe("instalado");
    expect(cancelou).toBe(2);
  });
});

describe("processo do Hermes", () => {
  it("acha o perfil na tabela do `hermes profile list`", () => {
    const saida = " Profile          Model\n ───────\n ◆default         nvidia/x   running\n  ely            nvidia/x   stopped\n";
    expect(perfilNaLista(saida, "ely")).toBe(true);
    expect(perfilNaLista(saida, "default")).toBe(true);
    expect(perfilNaLista(saida, "outro")).toBe(false);
  });
});

describe("MCP do ELYSIUM para o Hermes", () => {
  const ex = {
    definicoes: () => [
      { name: "volume", description: "volume", parameters: { type: "object" } },
      { name: "energia", description: "desliga", parameters: { type: "object" } },
      { name: "apagar_rotina", description: "apaga", parameters: { type: "object" } },
    ],
    executar: async (nome: string) => nome === "volume" ? { resultado: "Volume em 40." } : { resultado: "Apagar? Confirma? Diga sim.", pergunta: true },
  };
  it("lista só as permitidas (energia e apagar rotina ficam de fora)", async () => {
    const r = await responderMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ex) as { result: { tools: { name: string }[] } };
    expect(r.result.tools.map(t => t.name)).toEqual(["volume"]);
    expect(FERRAMENTAS_DO_HERMES.has("energia")).toBe(false);
    expect(FERRAMENTAS_DO_HERMES.has("lembrar_fato")).toBe(false);
  });
  it("chamada fora da lista é recusada; notificação não tem resposta", async () => {
    const r = await responderMcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "energia", arguments: {} } }, ex) as { result: { isError?: boolean } };
    expect(r.result.isError).toBe(true);
    expect(await responderMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, ex)).toBeNull();
  });
  it("initialize devolve a versão pedida quando conhecida", async () => {
    const r = await responderMcp({ jsonrpc: "2.0", id: 3, method: "initialize", params: { protocolVersion: "2025-03-26" } }, ex) as { result: { protocolVersion: string } };
    expect(r.result.protocolVersion).toBe("2025-03-26");
  });
  it("só atende o próprio PC", () => {
    expect(ehDoProprioPc("127.0.0.1")).toBe(true);
    expect(ehDoProprioPc("::ffff:127.0.0.1")).toBe(true);
    expect(ehDoProprioPc("192.168.15.22")).toBe(false);
  });
});
