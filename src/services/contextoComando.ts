import { AsyncLocalStorage } from "node:async_hooks";
import type { Canal } from "./estiloResposta";

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

interface Contexto { canal: Canal; fontes: Fonte[] }

const als = new AsyncLocalStorage<Contexto>();

export function comContexto<T>(canal: Canal, fn: () => Promise<T>): Promise<T> {
  return als.run({ canal, fontes: [] }, fn);
}

export function canalAtual(): Canal {
  return als.getStore()?.canal ?? "voz";
}

export function registrarFontes(fontes: Fonte[]): void {
  const c = als.getStore();
  if (!c) return;
  for (const f of fontes) if (!c.fontes.some(x => x.url === f.url)) c.fontes.push(f);
}

export function fontesDoPedido(): Fonte[] {
  return als.getStore()?.fontes.slice(0, 5) ?? [];
}
