import { ehSim } from "./confirmacao";
import { pedeResposta } from "./live";
import { decidirTela, gerarTela, OFERTA, pediuTela, type Gerador, type ModoInterativo } from "./telaInteligente";

/**
 * Telas inteligentes no celular (Fase 4, 22/10) — as mesmas regras do chat do PC (main.ts), para
 * o chat do celular pelo WebSocket. Só vale para app que avisa que desenha telas (`telas: true` no
 * comando): app antigo nunca recebe oferta que não consegue mostrar.
 *
 * A tela viaja num frame `{type:"ui"}` com o id do pedido, DEPOIS do reply: `gerando` (o celular
 * põe o esqueleto embaixo da bolha), depois `programa` ou `falhou`. Fica guardada na retomada:
 * se a conexão cair enquanto gera, o celular pede `retomar` e recebe a tela do mesmo jeito.
 */

/** A oferta "Quer que eu monte isso como tela?" esperando o "sim" (15 min). */
let oferta: { pergunta: string; resposta: string; em: number } | null = null;
/** A última resposta: "monta uma tela disso" usa como contexto. */
let ultima: { pergunta: string; resposta: string } | null = null;

const VALIDADE_OFERTA_MS = 15 * 60_000;
const FALA_DE_CONTEXTO = /\b(disso|isso|dessa|desse|essa|esse|acima|anterior)\b/i;

export type Atalho = { pergunta: string; resposta: string; daOferta: boolean };

/**
 * Antes do cérebro: "sim" à oferta, ou pedido explícito de tela, vai direto para o gerador (sem o
 * agente — ele entendia "tela" como programar uma aba nova). null = segue o pedido normal.
 * Qualquer outra mensagem descarta a oferta.
 */
export function atalhoDeTela(texto: string, refazer: boolean, modo: ModoInterativo | string | undefined, temGerador: boolean, agora = Date.now()): Atalho | null {
  const o = oferta && agora - oferta.em < VALIDADE_OFERTA_MS ? oferta : null;
  oferta = null;
  if (refazer) return null;
  if (o && ehSim(texto)) return { pergunta: o.pergunta, resposta: o.resposta, daOferta: true };
  if (modo !== "nunca" && temGerador && pediuTela(texto)) {
    return { pergunta: texto, resposta: FALA_DE_CONTEXTO.test(texto) && ultima ? ultima.resposta : "", daOferta: false };
  }
  return null;
}

/**
 * Depois da resposta: oferece (a pergunta vai no fim do texto, e as respostas rápidas viram
 * Sim/Não), gera sozinho ("priorizar") ou nada. `podeSugerir` = conversa, sem ação no PC.
 */
export function depoisDaResposta(texto: string, reply: string, podeSugerir: boolean, modo: ModoInterativo | string | undefined, temGerador: boolean, agora = Date.now()): { reply: string; gerar: boolean } {
  const decisao = podeSugerir && (modo === "priorizar" || !pedeResposta(reply))
    ? decidirTela(modo, texto, "texto", temGerador)
    : "nada";
  oferta = decisao === "oferecer" ? { pergunta: texto, resposta: reply, em: agora } : null;
  ultima = { pergunta: texto, resposta: reply };
  return { reply: decisao === "oferecer" ? `${reply}\n\n${OFERTA}` : reply, gerar: decisao === "gerar" };
}

export type FrameUi = { estado?: "gerando"; programa?: string; texto?: string; falhou?: true; cancelada?: true; pergunta?: string; resposta?: string };

/** Telas do celular sendo geradas, pelo id do pedido: o "Cancelar" do esqueleto aborta aqui. */
const emCurso = new Map<string, AbortController>();

/** `{type:"ui.cancelar", id}` do celular. true = havia uma tela sendo gerada com esse id. */
export function cancelarTelaDoCelular(id: string): boolean {
  const c = emCurso.get(id);
  c?.abort();
  return !!c;
}

/**
 * Gera e manda os frames (gerando → programa | falhou). `texto` troca o texto da bolha. Falhou
 * (não cancelada): pergunta e resposta vão junto, para o "Tentar de novo" do celular.
 */
export async function gerarParaCelular(
  pergunta: string, resposta: string, gerador: Gerador | null, enviar: (f: FrameUi) => void,
  textos: { pronto?: string; falhou?: string } = {}, id?: string,
): Promise<boolean> {
  const paraTentar = { pergunta: pergunta.slice(0, 2000), resposta: resposta.slice(0, 6000) };
  if (!gerador) { enviar({ falhou: true, ...paraTentar, ...(textos.falhou ? { texto: textos.falhou } : {}) }); return false; }
  const controle = new AbortController();
  if (id) emCurso.set(id, controle);
  try {
    enviar({ estado: "gerando" });
    const tela = await gerarTela(pergunta, resposta, gerador, undefined, controle.signal).catch(() => null);
    if (tela) {
      console.log(`[UI] tela do celular em ${tela.ms} ms (${tela.tentativas}ª, ${tela.modelo ?? tela.provedor})`);
      enviar({ programa: tela.programa, ...(textos.pronto ? { texto: textos.pronto } : {}) });
      return true;
    }
    if (controle.signal.aborted) enviar({ falhou: true, cancelada: true, ...(textos.pronto ? { texto: "Tela cancelada." } : {}) });
    else enviar({ falhou: true, ...paraTentar, ...(textos.falhou ? { texto: textos.falhou } : {}) });
    return false;
  } finally {
    if (id && emCurso.get(id) === controle) emCurso.delete(id);
  }
}

/** Só para os testes. */
export function zerarTelasDoCelular(): void {
  oferta = null;
  ultima = null;
}
