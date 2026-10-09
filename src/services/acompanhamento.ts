import Store from "electron-store";
import { ehCompromisso, limparDataDoTexto } from "./planoDeLembrete";
import { fimDoPrazo, listarTarefasTodas, type Tarefa } from "./tarefas";
import { listarEpisodios, marcarPerguntado, type Episodio } from "./episodios";

/**
 * "E aí, como foi a prova?" (fase 19, bloco 191).
 *
 * Uma pessoa que sabe da sua prova de sexta pergunta como foi no sábado. A Ely sabia (a prova
 * virou tarefa com aviso na véspera, fase 17) e nunca perguntava — o compromisso passava e
 * sumia da lista. A Alexa+ e o Pulse do ChatGPT são elogiados exatamente por esse tipo de
 * acompanhamento, e criticados quando ele vira cobrança. Então:
 *  - só COMPROMISSO (prova, consulta, entrevista… — `ehCompromisso`) que já passou, até 3 dias;
 *  - e pendência de uma conversa (bloco 190) de 1 a 7 dias atrás ("ficou de estudar ótica");
 *  - cada coisa é perguntada UMA vez (respondida, dispensada ou falada, não volta);
 *  - em voz, só na primeira volta ao PC do dia e pelo orçamento de avisos (`avisos.ts`); no
 *    Hoje, um card "A Ely quer saber" que dá para dispensar.
 */

export interface Acompanhamento {
  /** "t:<id da tarefa>" ou "e:<id do episódio>". */
  id: string;
  pergunta: string;
  em: number;
}

const DIA = 86_400_000;

/** Artigo da palavra principal do compromisso, para a pergunta soar natural. */
const FEMININOS = /^(prova|consulta|entrevista|viagem|apresenta[cç][aã]o|reuni[aã]o|defesa|formatura|audi[eê]ncia|entrega|festa|aula|cirurgia|vacina|avalia[cç][aã]o|banca|competi[cç][aã]o|corrida|partida)\b/i;
const MASCULINOS = /^(exame|teste|simulado|vestibular|enem|concurso|semin[aá]rio|voo|embarque|anivers[aá]rio|casamento|show|jogo|tcc|dentista|m[eé]dico|trabalho|campeonato|treino|encontro|curso|evento|interc[aâ]mbio|resultado)\b/i;

/** "Prova de matemática" → "a prova de matemática"; o que não reconhecer fica entre aspas. Pura. */
export function comArtigo(texto: string): string {
  const t = texto.trim().replace(/[.!?]+$/, "");
  const minus = t.charAt(0).toLowerCase() + t.slice(1);
  if (/^(a|o|as|os|minha|meu|minhas|meus)\s/i.test(minus)) return minus;
  if (FEMININOS.test(minus)) return `a ${minus}`;
  if (MASCULINOS.test(minus)) return `o ${minus}`;
  return `“${t}”`;
}

/** As perguntas que valem agora, as mais recentes primeiro (no máximo 3). Pura. */
export function acompanhamentos(tarefas: Tarefa[], episodios: Episodio[], perguntados: Set<string>, agora = Date.now()): Acompanhamento[] {
  const lista: Acompanhamento[] = [];
  for (const t of tarefas) {
    const id = `t:${t.id}`;
    const fim = fimDoPrazo(t);
    if (fim === undefined || perguntados.has(id) || !ehCompromisso(t.texto)) continue;
    if (fim > agora || agora - fim > 3 * DIA) continue;
    lista.push({ id, pergunta: `E aí, como foi ${comArtigo(limparDataDoTexto(t.texto))}?`, em: fim });
  }
  for (const e of episodios) {
    const id = `e:${e.id}`;
    if (e.perguntado || perguntados.has(id) || !e.pendencias.length) continue;
    const idade = agora - e.em;
    if (idade < DIA || idade > 7 * DIA) continue;
    const p = e.pendencias[0].replace(/[.!?]+$/, "");
    lista.push({ id, pergunta: `Da última vez você ficou de ${p.charAt(0).toLowerCase()}${p.slice(1)}. Conseguiu?`, em: e.em });
  }
  return lista.sort((a, b) => b.em - a.em).slice(0, 3);
}

// ── Store ────────────────────────────────────────────────────────────────────

const store = new Store<{ perguntados: string[] }>({ name: "acompanhamentos", defaults: { perguntados: [] } });

function perguntados(): Set<string> {
  const l = store.get("perguntados");
  return new Set(Array.isArray(l) ? l : []);
}

/** O que a Ely quer saber agora. Nunca lança. */
export function pendentesDeAcompanhamento(agora = Date.now()): Acompanhamento[] {
  try { return acompanhamentos(listarTarefasTodas(), listarEpisodios(), perguntados(), agora); } catch { return []; }
}

/** Respondida, dispensada ou falada: não volta. Guarda as últimas 200 marcas. */
export function marcarAcompanhado(id: string): void {
  const l = [...perguntados()].filter(x => x !== id);
  l.push(id);
  store.set("perguntados", l.slice(-200));
  if (id.startsWith("e:")) { try { marcarPerguntado(id.slice(2)); } catch { /* episódio apagado */ } }
}
