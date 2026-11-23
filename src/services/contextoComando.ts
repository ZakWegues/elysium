import { AsyncLocalStorage } from "node:async_hooks";
import type { Canal } from "./estiloResposta";
import type { AlvoNoCelular, Aparelho } from "./destino";

/**
 * O que um pedido carrega pelo caminho inteiro (bloco 131), sem passar parâmetro por
 * dez funções: o canal (voz/texto) e as fontes que a busca na web usou.
 *
 * A busca roda lá no fundo — dentro do agente, numa ferramenta, pelo roteador — e quem
 * precisa das fontes é o topo (`executarComando`, que entrega ao dashboard e ao celular).
 * O `AsyncLocalStorage` amarra os dois ao MESMO pedido: dois pedidos ao mesmo tempo (voz
 * no PC e texto do celular) não misturam as fontes um do outro.
 */
export interface Fonte { titulo: string; url: string }

/** 23/11: as músicas sugeridas nesta resposta, com os botões de tocar embaixo dela. */
export interface MusicasDaResposta { itens: { id: number; titulo: string; artista: string; capa: string | null; motivo: string }[]; aprendi: string[] }

interface Contexto { canal: Canal; fontes: Fonte[]; pedido?: string; reserva?: boolean; origem: Aparelho; abreNoCelular: boolean; abrir?: AlvoNoCelular; musicas?: MusicasDaResposta }

const als = new AsyncLocalStorage<Contexto>();

export function comContexto<T>(canal: Canal, fn: () => Promise<T>, pedido?: string, origem: Aparelho = "pc", abreNoCelular = false): Promise<T> {
  return als.run({ canal, fontes: [], pedido, origem, abreNoCelular }, fn);
}

/** De que aparelho veio o pedido (23/11). App antigo, que não sabe abrir nada, conta como PC. */
export function aparelhoDoPedido(): Aparelho {
  const c = als.getStore();
  return c?.origem === "celular" && c.abreNoCelular ? "celular" : "pc";
}

/** Põe o alvo na resposta deste pedido, se ele veio do celular. false = não veio de lá. */
export function abrirNoCelularAtual(alvo: AlvoNoCelular): boolean {
  const c = als.getStore();
  if (!c || c.origem !== "celular" || !c.abreNoCelular) return false;
  c.abrir = alvo;
  return true;
}
export function aberturaDoPedido(): AlvoNoCelular | undefined {
  return als.getStore()?.abrir;
}

export function registrarMusicas(m: MusicasDaResposta): void {
  const c = als.getStore();
  if (c) c.musicas = m;
}
export function musicasDaResposta(): MusicasDaResposta | undefined {
  return als.getStore()?.musicas;
}

/**
 * O texto do pedido que está rodando (fase 17): o lembrete tira o dia e a hora da fala em
 * vez de confiar na conta de calendário do modelo.
 */
export function pedidoAtual(): string | undefined {
  return als.getStore()?.pedido;
}

export function canalAtual(): Canal {
  return als.getStore()?.canal ?? "voz";
}

export function registrarFontes(fontes: Fonte[]): void {
  const c = als.getStore();
  if (!c) return;
  for (const f of fontes) if (!c.fontes.some(x => x.url === f.url)) c.fontes.push(f);
}

/**
 * Fase 18: a resposta veio do cérebro LOCAL porque a nuvem falhou. A pesquisa apontou o
 * fallback silencioso como o que mais confunde ("por que ela ficou burra?"): o app mostra um
 * selo discreto "modo local" nessa resposta.
 */
export function marcarReserva(): void {
  const c = als.getStore();
  if (c) c.reserva = true;
}
export function usouReserva(): boolean {
  return als.getStore()?.reserva === true;
}

export function fontesDoPedido(): Fonte[] {
  return als.getStore()?.fontes.slice(0, 5) ?? [];
}
