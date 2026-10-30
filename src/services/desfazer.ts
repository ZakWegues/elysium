/**
 * Desfazer (31/10): a última ação reversível — volume, lembrete criado/cancelado, memória
 * guardada/esquecida, itens de lista, preset apagado, programa fechado (reabre). Uma só, como o
 * "Desfazer" do Gmail: vale por 5 minutos e só enquanto nenhuma outra ação reversível veio depois.
 *
 * Quem executa registra (`registrarDesfazer`); o pipeline do pedido vê se apareceu uma nova
 * (`ultimoDesfazer`) e manda o rótulo junto da resposta — o botão "Desfazer" da bolha manda
 * "desfaz" como um pedido comum, que cai em `desfazerUltima`.
 */

export const VALIDADE_DESFAZER_MS = 5 * 60_000;

interface Desfazivel { id: number; rotulo: string; em: number; desfazer: () => Promise<string> | string }

let ultima: Desfazivel | null = null;
let contador = 0;

/** `rotulo` é o que a ação fez ("Volume em 30%"); `desfazer` devolve o que falar. */
export function registrarDesfazer(rotulo: string, desfazer: () => Promise<string> | string, agora = Date.now()): void {
  ultima = { id: ++contador, rotulo, em: agora, desfazer };
}

/** A ação que pode ser desfeita agora (id muda a cada registro), ou null. */
export function ultimoDesfazer(agora = Date.now()): { id: number; rotulo: string } | null {
  if (!ultima || agora - ultima.em > VALIDADE_DESFAZER_MS) return null;
  return { id: ultima.id, rotulo: ultima.rotulo };
}

/** Desfaz e esquece (não desfaz duas vezes). */
export async function desfazerUltima(agora = Date.now()): Promise<string> {
  const u = ultima && agora - ultima.em <= VALIDADE_DESFAZER_MS ? ultima : null;
  ultima = null;
  if (!u) return "Não tenho nada recente para desfazer.";
  try {
    return await u.desfazer();
  } catch (e) {
    console.warn("[desfazer] falhou:", (e as Error)?.message ?? e);
    return "Não consegui desfazer.";
  }
}

/** "desfaz", "Ely, desfaz isso", "desfazer a última", "volta atrás". Pura. */
export function ehPedidoDeDesfazer(texto: string): boolean {
  const t = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.!?,]/g, " ").replace(/\s+/g, " ").trim();
  return /^(ely )?(desfaz|desfazer|desfaca|volta atras|voltar atras)( isso| o que (voce )?fez| o ultimo| a ultima| a ultima acao)?( ely)?$/.test(t);
}

/** Só para os testes. */
export function zerarDesfazer(): void { ultima = null; }
