/**
 * As perguntas que você faz para a IA — e as bolhas de partida do chat.
 *
 * POR QUE UM ARQUIVO NOVO
 *
 * O `history.ts` já conta frequência, mas `actionLabel()` devolve `null` para tudo que não
 * seja abrir app/URL/música/preset. Ou seja: **conversa nunca foi registrada em lugar
 * nenhum**. Não havia como saber o que você mais pergunta, porque isso nunca foi guardado.
 *
 * Alargar o `history.ts` seria pior: ele alimenta o menu da bandeja e as pílulas de
 * "comandos recentes", que são para AÇÕES re-executáveis. Uma pergunta não é um comando —
 * misturar as duas faria a bandeja oferecer "que horas são?" como atalho de sistema.
 *
 * O QUE VAI PARA A TELA
 *
 * Uma mistura de três fontes, sorteada com peso e trocada a cada abertura:
 *   · o que você repete — sai daqui, e começa vazio até você conversar;
 *   · partidas curadas, que existem para a tela não nascer vazia;
 *   · contexto do momento, que o `sugestoes.ts` já sabe montar.
 */

import Store from "electron-store";

export interface Pergunta {
  texto: string;
  count: number;
  lastUsed: number;
}

const store = new Store<{ perguntas: Pergunta[] }>({
  name: "perguntas",
  defaults: { perguntas: [] },
});

/** Teto do que fica em disco. O mesmo do `history.ts`, pelo mesmo motivo: não crescer para sempre. */
const TETO = 50;

/**
 * Perguntas muito longas não viram bolha — não cabem, e são pedidos únicos, não hábitos.
 * O corte é generoso de propósito: "resume o que aconteceu no meu PC hoje de manhã" tem 48.
 */
const TAMANHO_MAX = 60;

function normalizar(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Chamado a cada mensagem enviada ao cérebro. Guarda o texto original (é ele que volta para
 * a bolha), mas casa por forma normalizada, senão "Que horas são?" e "que horas sao" virariam
 * duas entradas com contagem 1 cada e nenhuma chegaria à tela.
 */
export function registrarPergunta(texto: string): void {
  const t = texto.trim();
  if (!t || t.length > TAMANHO_MAX * 3) return;

  const chave = normalizar(t);
  const lista = store.get("perguntas");
  const existente = lista.find(p => normalizar(p.texto) === chave);

  if (existente) {
    existente.count++;
    existente.lastUsed = Date.now();
  } else {
    lista.push({ texto: t, count: 1, lastUsed: Date.now() });
  }

  lista.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
  store.set("perguntas", lista.slice(0, TETO));
}

/**
 * Só o que virou hábito. Uma pergunta feita uma vez não é hábito — se entrasse, a fileira
 * de bolhas viraria um histórico, e histórico já existe na tela de conversas.
 */
export function perguntasFrequentes(n = 3): Pergunta[] {
  return store.get("perguntas").filter(p => p.count >= 2 && p.texto.length <= TAMANHO_MAX).slice(0, n);
}

/**
 * Partidas curadas. Existem para a fileira não nascer vazia — quem acabou de instalar não
 * tem hábito nenhum ainda — e para lembrar do que o assistente dá conta.
 */
const CURADAS = [
  "O que eu tenho pra hoje?",
  "Como está o tempo?",
  "Resume como está o meu PC",
  "O que está consumindo mais CPU?",
  "Me lembra de beber água em 1 hora",
  "Quais presets eu tenho?",
  "O que você consegue fazer?",
  "Quanto espaço sobrou no disco?",
];

function sortear<T>(pool: T[], n: number): T[] {
  const resto = pool.slice();
  const saida: T[] = [];
  while (saida.length < n && resto.length) {
    saida.push(resto.splice(Math.floor(Math.random() * resto.length), 1)[0]);
  }
  return saida;
}

/**
 * A fileira que aparece acima da barra de escrita: o que você repete primeiro, curadas
 * preenchendo o resto. Sorteadas a cada chamada, para a tela ter algo diferente a dizer
 * cada vez que você a abre.
 */
export function bolhasDoChat(quantas = 4): string[] {
  const frequentes = perguntasFrequentes(2).map(p => p.texto);
  const faltam = quantas - frequentes.length;
  const curadas = sortear(CURADAS.filter(c => !frequentes.some(f => normalizar(f) === normalizar(c))), faltam);
  // As frequentes primeiro: são as que você provavelmente quer de novo.
  return [...frequentes, ...curadas].slice(0, quantas);
}
