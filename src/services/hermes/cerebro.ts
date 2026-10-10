import { getConfig, nomeDoUsuario } from "../../main/config";
import type { Canal } from "../estiloResposta";
import { modoAtivo } from "../modos";
import { buildMemoryBlock } from "../memoryStore";
import { pedirConfirmacao } from "../confirmacao";
import { ConexaoHermes } from "./conexao";
import { acharHermes, garantirMcp, garantirPerfil, subirServidor, ServidorHermes, PERFIL_PADRAO } from "./processo";
import { contextoDoTurno } from "./persona";
import { FimDoTurno, PRAZO_SINAL_FRIO_MS, PRAZO_SINAL_QUENTE_MS, rodarTurno } from "./sessao";
import { descricaoDaAprovacao, falaDoEsclarecimento, respostaDeRecusa, respostasDoEsclarecimento, tipoDaPergunta } from "./aprovacoes";

/**
 * O Hermes como cérebro da Ely (fase 21, bloco 213): o servidor, a sessão e a ponte com o
 * `executarComando`.
 *
 * - Sobe na partida do app (`iniciarHermes`), uma vez, e cai junto no "Sair".
 * - Uma sessão por conversa: renovada depois do mesmo tempo ocioso que zera o histórico do chat
 *   (`chatIdleResetMs`). A sessão é aberta ANTES do primeiro pedido — o primeiro turno de uma
 *   sessão fria levou 6–11 s nas medições; os seguintes, 2–3 s.
 * - Qualquer falha devolve `null`: quem chama cai no cérebro de sempre e marca "reserva".
 */

export type EstadoHermes = "desligado" | "sem-hermes" | "subindo" | "pronto" | "erro";

interface Pendente {
  metodo: string;
  params: Record<string, unknown>;
  responder: (r: unknown) => void;
  resto: Promise<FimDoTurno>;
  expiraEm: number;
}

const s = {
  estado: "desligado" as EstadoHermes,
  erro: null as string | null,
  modelo: null as string | null,
  servidor: null as ServidorHermes | null,
  con: null as ConexaoHermes | null,
  sessao: null as { id: string; ultimoUso: number; turnos: number } | null,
  saindo: false,
  tentativas: 0,
  /** Quem recebe as perguntas do servidor no turno que está rodando. */
  aguardando: null as ((metodo: string, params: Record<string, unknown>, responder: (r: unknown) => void) => void) | null,
  /** O pedido do dono no turno atual — a política do MCP compara as ações com ele. */
  pedido: "",
  esclarecimento: null as Pendente | null,
  ultimaLatenciaMs: null as number | null,
  urlMcp: null as string | null,
};

export function estadoHermes(): { estado: EstadoHermes; erro: string | null; modelo: string | null; perfil: string; latenciaMs: number | null; ligado: boolean } {
  return { estado: s.estado, erro: s.erro, modelo: s.modelo, perfil: perfil(), latenciaMs: s.ultimaLatenciaMs, ligado: getConfig().cerebro === "hermes" };
}

/** O pedido do turno do Hermes que está rodando ("" fora de um turno). */
export function pedidoDoHermes(): string {
  return s.pedido;
}

function perfil(): string {
  return (getConfig().hermesPerfil || PERFIL_PADRAO).trim() || PERFIL_PADRAO;
}

export function hermesPronto(): boolean {
  return s.estado === "pronto" && !!s.con?.aberta();
}

/** O endereço do MCP do ELYSIUM, definido pelo servidor da porta 4200 antes da partida. */
export function definirUrlDoMcp(url: string): void {
  s.urlMcp = url;
}

export async function iniciarHermes(): Promise<void> {
  if (getConfig().cerebro !== "hermes" || s.saindo) return;
  if (s.estado === "subindo" || hermesPronto()) return;
  const exe = acharHermes();
  if (!exe) { s.estado = "sem-hermes"; s.erro = "Hermes não instalado"; return; }
  s.estado = "subindo";
  s.erro = null;
  try {
    await garantirPerfil(exe, perfil());
    if (s.urlMcp) await garantirMcp(exe, s.urlMcp, perfil()).catch(e => console.warn("[hermes] MCP:", e instanceof Error ? e.message : e));
    const t0 = Date.now();
    s.servidor = await subirServidor(exe, perfil());
    s.servidor.filho.on("exit", () => { if (!s.saindo) reiniciarDepois("o processo do Hermes saiu"); });
    const con = new ConexaoHermes();
    await con.abrir(s.servidor.url);
    con.responderPedidosCom((metodo, params) => tratarPedido(metodo, params));
    con.quandoFechar(() => { if (!s.saindo && s.con === con) reiniciarDepois("a conexão caiu"); });
    await con.chamar("client.capabilities", { server_requests: true });
    s.con = con;
    s.estado = "pronto";
    s.tentativas = 0;
    console.log(`[hermes] pronto em ${Date.now() - t0} ms (perfil ${perfil()})`);
    void abrirSessao().catch(e => console.warn("[hermes] sessão:", e instanceof Error ? e.message : e));
  } catch (e) {
    s.estado = "erro";
    s.erro = e instanceof Error ? e.message : String(e);
    console.warn("[hermes] não subiu:", s.erro);
    encerrarProcesso();
    reiniciarDepois(s.erro);
  }
}

function reiniciarDepois(motivo: string): void {
  if (s.saindo || getConfig().cerebro !== "hermes") return;
  s.estado = "erro";
  s.erro = motivo;
  s.con = null;
  s.sessao = null;
  encerrarProcesso();
  // Recuo: 10 s, 30 s, 90 s… até 10 min. Uma chave errada não vira um laço quente.
  const espera = Math.min(600_000, 10_000 * 3 ** Math.min(s.tentativas++, 4));
  setTimeout(() => { void iniciarHermes(); }, espera).unref?.();
}

function encerrarProcesso(): void {
  try { s.con?.fechar(); } catch { /* */ }
  try { s.servidor?.filho.kill(); } catch { /* */ }
  s.servidor = null;
}

export function pararHermes(): void {
  s.saindo = true;
  encerrarProcesso();
  s.con = null;
  s.estado = "desligado";
}

/** Ligado/desligado em Ajustes: sobe ou derruba sem reiniciar o app. */
export function aplicarConfigHermes(): void {
  if (getConfig().cerebro === "hermes") { s.saindo = false; void iniciarHermes(); }
  else { pararHermes(); s.saindo = false; }
}

async function abrirSessao(): Promise<{ id: string; ultimoUso: number; turnos: number }> {
  const con = s.con;
  if (!con) throw new Error("sem conexão");
  const r = await con.chamar<{ session_id: string; info?: { model?: string } }>("session.create", { title: "ELYSIUM", hidden: true }, 30_000);
  s.modelo = r.info?.model ?? s.modelo;
  s.sessao = { id: r.session_id, ultimoUso: Date.now(), turnos: 0 };
  return s.sessao;
}

async function sessaoAtual(): Promise<{ id: string; ultimoUso: number; turnos: number }> {
  const idle = getConfig().chatIdleResetMs ?? 300_000;
  if (s.sessao && Date.now() - s.sessao.ultimoUso < idle) return s.sessao;
  const velha = s.sessao;
  if (velha) void s.con?.chamar("session.close", { session_id: velha.id }, 5_000).catch(() => {});
  return abrirSessao();
}

/** "Nova conversa" no app também começa uma sessão nova no Hermes. */
export function novaSessaoHermes(): void {
  s.sessao = null;
  if (hermesPronto()) void abrirSessao().catch(() => {});
}

async function tratarPedido(metodo: string, params: Record<string, unknown>): Promise<unknown> {
  const fn = s.aguardando;
  if (!fn || tipoDaPergunta(metodo) === "recusar") return respostaDeRecusa(metodo);
  return new Promise((resolver) => {
    let respondido = false;
    fn(metodo, params, (r) => { if (!respondido) { respondido = true; resolver(r); } });
  });
}

export interface RespostaHermes { reply: string; pergunta?: boolean }

/**
 * Um pedido pelo Hermes. `null` = não deu (fora do ar, demorou, erro do modelo): o chamador cai
 * no cérebro de sempre.
 */
export async function agirViaHermes(texto: string, op: { canal?: Canal; onToken?: (t: string) => void } = {}): Promise<RespostaHermes | null> {
  if (!hermesPronto()) { if (s.estado === "erro" || s.estado === "desligado") void iniciarHermes(); return null; }
  const con = s.con!;
  let sessao;
  try { sessao = await sessaoAtual(); } catch (e) { console.warn("[hermes] sem sessão:", e instanceof Error ? e.message : e); return null; }
  const cfg = getConfig();
  const canal = op.canal ?? "voz";
  const primeiro = sessao.turnos === 0;
  const corpo = contextoDoTurno(texto, canal, {
    nome: nomeDoUsuario(),
    tratamento: cfg.tratamento ?? "",
    estilo: cfg.estiloResposta,
    instrucoes: cfg.instrucoesPessoais,
    modo: modoAtivo(),
    memoria: cfg.hermesContextoPessoal ? buildMemoryBlock(texto) : undefined,
  }, primeiro);
  sessao.turnos++;
  sessao.ultimoUso = Date.now();
  s.pedido = texto;
  const t0 = Date.now();
  let primeiroToken = 0;
  const fim = await rodarTurno(con, sessao.id, corpo, {
    onToken: (t) => { if (!primeiroToken) primeiroToken = Date.now(); op.onToken?.(t); },
    prazoSinalMs: primeiro ? PRAZO_SINAL_FRIO_MS : PRAZO_SINAL_QUENTE_MS,
  }, { aguardar: (fn) => { s.aguardando = fn; } });
  if (primeiroToken) s.ultimaLatenciaMs = primeiroToken - t0;
  sessao.ultimoUso = Date.now();
  return tratarFim(fim, true);
}

async function tratarFim(fim: FimDoTurno, noTurno: boolean): Promise<RespostaHermes | null> {
  if (fim.tipo === "resposta") { s.pedido = ""; return { reply: fim.texto }; }
  if (fim.tipo === "erro") {
    s.pedido = "";
    console.warn(`[hermes] turno falhou: ${fim.motivo}`);
    // Sessão que demorou a começar pode estar presa: a próxima abre outra.
    if (/demorou|não terminou/.test(fim.motivo)) s.sessao = null;
    return noTurno ? null : { reply: "Não consegui terminar isso agora." };
  }
  const antes = fim.texto ? `${fim.texto} ` : "";
  const tipo = tipoDaPergunta(fim.metodo);
  if (tipo === "recusar") {
    fim.responder(respostaDeRecusa(fim.metodo));
    return tratarFim(await fim.resto, noTurno);
  }
  if (tipo === "aprovacao") {
    const pergunta = pedirConfirmacao(
      descricaoDaAprovacao(fim.params),
      async () => {
        fim.responder({ choice: "once" });
        const r = await tratarFim(await fim.resto, false);
        return r?.reply ?? "Feito.";
      },
      Date.now(),
      () => fim.responder({ choice: "deny" }),
    );
    return { reply: antes + pergunta, pergunta: true };
  }
  // Esclarecimento: a próxima fala do dono é a resposta.
  if (s.esclarecimento) s.esclarecimento.responder({});
  s.esclarecimento = { metodo: fim.metodo, params: fim.params, responder: fim.responder, resto: fim.resto, expiraEm: Date.now() + 90_000 };
  const meu = s.esclarecimento;
  setTimeout(() => { if (s.esclarecimento === meu) { meu.responder({}); s.esclarecimento = null; } }, 91_000).unref?.();
  return { reply: antes + falaDoEsclarecimento(fim.params), pergunta: true };
}

/**
 * O Hermes perguntou algo no turno anterior: este pedido é a resposta. Devolve a fala final, ou
 * `null` quando não havia pergunta.
 */
export async function responderEsclarecimentoHermes(texto: string): Promise<string | null> {
  const p = s.esclarecimento;
  if (!p) return null;
  s.esclarecimento = null;
  if (p.expiraEm < Date.now()) { p.responder({}); return null; }
  s.pedido = texto;
  p.responder(respostasDoEsclarecimento(p.params, texto));
  const r = await tratarFim(await p.resto, false);
  return r?.reply ?? null;
}

/** A fala foi cortada ("Ely, para", atalho): o turno do Hermes para junto. */
export function interromperHermes(): void {
  const id = s.sessao?.id;
  if (id && s.pedido && s.con?.aberta()) void s.con.chamar("session.interrupt", { session_id: id }, 5_000).catch(() => {});
}
