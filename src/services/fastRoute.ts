import { respondeuHaPouco, type BrainAction } from "./brain";
import { pedidoDeDitado, pedidoDeLista, pedidoDeNota } from "./listas";
import { acharHabito, listarHabitos, listarMetas, pedidoDeHabito, pedidoDeMeta } from "./habitos";
import { interpretarTimer } from "./timers";
import { calcular } from "./calculadora";
import { pedidoDeHora } from "./horaMundo";
import { listarTreinos, pedidoDeCorrida, pedidoDePeso, pedidoDeTreino } from "./corpo";
import { pedidoFecharSeAberto, pedidoLembreteDaquiA, pedidoPausarSeTocando } from "./condicionais";
import { pedidoComIsso } from "./isso";

/**
 * Roteamento local, sem IA.
 *
 * "pausa", "volume 40", "próxima música" são comandos fechados: não há ambiguidade
 * para um modelo resolver. Mandá-los para a Groq gastava ~4500 tokens de prompt cada,
 * e o teto do nível gratuito é 12000 por minuto — três comandos triviais já estouravam
 * a cota e derrubavam o comando seguinte, que talvez precisasse mesmo do cérebro.
 *
 * Aqui a resposta é instantânea e de graça. O cérebro continua atendendo tudo que não
 * casar exatamente com um destes padrões.
 *
 * Regra para manter isto seguro: **só entra padrão sem ambiguidade possível.** Na
 * dúvida, deixa passar para o modelo. Um falso positivo aqui executa a ação errada
 * sem chance de correção; um falso negativo só gasta uma chamada.
 */

/** Tira acento, pontuação e espaço duplicado — a fala transcrita varia demais. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Rule {
  /** Precisa casar a frase INTEIRA: evita disparar dentro de um pedido maior. */
  pattern: RegExp;
  build: (match: RegExpMatchArray) => BrainAction[];
}

const RULES: Rule[] = [
  // — modo anônimo (bloco 190) —
  { pattern: /^(?:ely )?(?:(?:liga|ativa|entra no|entrar no|ligar o|ativar o|liga o|ativa o) )?modo anonimo$/,
    build: () => [{ action: "anon_mode", ligar: true }] },
  { pattern: /^(?:ely )?(?:desliga|desativa|sai do|sair do|desligar o|desativar o|desliga o|desativa o) modo anonimo$/,
    build: () => [{ action: "anon_mode", ligar: false }] },

  // — mídia —
  { pattern: /^(pausa|pausar|pause|para a musica|parar a musica)$/,
    build: () => [{ action: "media_control", operation: "pause" }] },
  { pattern: /^(continua|continuar|retoma|retomar|play|toca de novo)$/,
    build: () => [{ action: "media_control", operation: "play" }] },
  { pattern: /^(proxima|proxima musica|pula|pular|passa|passa essa musica|skip)$/,
    build: () => [{ action: "media_control", operation: "skip" }] },
  // "volta" sozinho fica de fora: pode ser voltar a música ou voltar o som (desmutar).
  { pattern: /^(anterior|musica anterior|volta a musica)$/,
    build: () => [{ action: "media_control", operation: "previous" }] },

  // — volume —
  // Número explícito não tem como ser outra coisa.
  { pattern: /^volume (\d{1,3})$/,
    build: m => [{ action: "volume_control", level: clampVolume(m[1]) }] },
  { pattern: /^(bota|bota|poe|coloca|deixa) o volume (?:em |no )?(\d{1,3})$/,
    build: m => [{ action: "volume_control", level: clampVolume(m[2]) }] },
  { pattern: /^(muta|mutar|mudo|sem som|silencia|silenciar)$/,
    build: () => [{ action: "volume_control", level: "mute" }] },
  { pattern: /^(desmuta|desmutar|tira o mudo|volta o som)$/,
    build: () => [{ action: "volume_control", level: "unmute" }] },

  // — informação do sistema —
  { pattern: /^(que horas sao|qual a hora|me diz as horas|horas)$/,
    build: () => [{ action: "system_info", query: "hora" }] },
  { pattern: /^(que dia e hoje|qual a data|data de hoje)$/,
    build: () => [{ action: "system_info", query: "data" }] },
  // "memoria" sozinho fica de fora: tanto pode ser a RAM quanto o que o assistente
  // guardou sobre o usuário.
  { pattern: /^(quanta ram|uso de ram|quanto de ram)( esta sendo usada| ta sendo usada)?$/,
    build: () => [{ action: "system_info", query: "ram" }] },
  { pattern: /^(bateria|quanto de bateria|bateria do pc)$/,
    build: () => [{ action: "system_info", query: "battery" }] },
  { pattern: /^(espaco no hd|espaco em disco|quanto tem de espaco|disco)$/,
    build: () => [{ action: "system_info", query: "disk" }] },
  { pattern: /^(temperatura|temperatura do processador|temperatura da cpu)$/,
    build: () => [{ action: "system_info", query: "cpu_temperature" }] },

  // — captura —
  { pattern: /^(tira um print|print|screenshot|captura a tela|faz um print)$/,
    build: () => [{ action: "screenshot" }] },

  // — energia —
  // Só o que é inequívoco. "desliga" sozinho fica de fora de propósito: pode ser
  // "desliga a música". Bloquear e cancelar são reversíveis ou inofensivos.
  { pattern: /^(bloqueia|bloquear|trava|travar)( o pc| a tela| o computador)$/,
    build: () => [{ action: "power_control", operation: "lock" }] },
  { pattern: /^cancela(r)? o desligamento$/,
    build: () => [{ action: "power_control", operation: "cancel" }] },

  // — clima — a resposta vem da Open-Meteo (clima.ts); o modelo não sabe o tempo
  { pattern: /^(como (esta|ta) o tempo( hoje| la fora| agora)?|clima|clima (de )?hoje|previsao( do tempo)?( (de|para) hoje)?|que tempo faz( hoje)?|vai chover( hoje)?|(esta|ta) (frio|quente|chovendo)( la fora)?|temperatura la fora)$/,
    build: () => [{ action: "weather" }] },

  // — resumo do dia (fase 13) — "bom dia" sozinho vira o resumo: é a primeira coisa que se
  // diz de manhã, e responder só "bom dia" de volta desperdiçaria a deixa.
  { pattern: /^(bom dia( elysium)?|resumo do dia|resumo de hoje|meu dia|como (esta|ta|vai ser) (o )?meu dia( hoje)?|o que (eu )?tenho (pra|para) hoje)$/,
    build: () => [{ action: "daily_summary" }] },

  // — modo foco (fase 12) — "para" é o verbo aqui: o modelo lia como preposição e religava.
  { pattern: /^(para|pare|parar|desliga|desligar|encerra|encerrar|termina|terminar|acaba|acabar|sai|sair)( d[oa])?( o)?( modo)? (de )?foco$/,
    build: () => [{ action: "focus", operation: "stop" }] },
  { pattern: /^(quanto (tempo )?falta (d[oa]|n[oa]|pro|pra) (modo )?foco|como (esta|ta) o foco)$/,
    build: () => [{ action: "focus", operation: "status" }] },
  { pattern: /^(modo foco|(entra|entrar|ativa|ativar|liga|ligar|comeca|comecar) (em |no |o )?(modo )?foco)( (por|de) (\d+) (minutos?|min))?$/,
    build: (m) => [{ action: "focus", operation: "start", minutes: m[7] ? Number(m[7]) : undefined }] },

  // — listas e timers (blocos 135/136) —
  { pattern: /^(o que tem|o que falta|me (le|fala)|mostra|qual e)( n)?a( minha)? lista( (de|do|da) (.+))?$/,
    build: (m) => [{ action: "list_show", list: m[7] ? `lista de ${m[7]}` : undefined }] },
  { pattern: /^(minhas listas|quais listas( eu)? tenho)$/,
    build: () => [{ action: "list_show" }] },
  { pattern: /^(quanto falta (n|d)o timer( (do|da|de) .+)?|meus timers|quais timers( eu tenho)?|timers)$/,
    build: () => [{ action: "timer_list" }] },
  { pattern: /^(cancela|cancelar|para|parar|desliga|desligar) o timer( (do|da|de) (.+))?$/,
    build: (m) => [{ action: "timer_cancel", name: m[4] }] },

  // — presets e memória —
  { pattern: /^(lista(r)? (os )?presets|quais presets( eu)? tenho|meus presets)$/,
    build: () => [{ action: "list_presets" }] },
  { pattern: /^(quais (sao )?(os )?meus lembretes( de hoje| para hoje)?|quais lembretes( eu)? tenho( hoje)?|meus lembretes( de hoje)?|o que (esta|ta) agendado( para hoje| hoje)?)$/,
    build: () => [{ action: "list_reminders" }] },
  { pattern: /^(o que voce lembra sobre mim|o que voce sabe sobre mim|sua memoria)$/,
    build: () => [{ action: "list_memory" }] },
];

function clampVolume(raw: string): number {
  return Math.min(100, Math.max(0, parseInt(raw, 10)));
}

/**
 * Devolve as ações quando o texto casa exatamente com um comando fechado, ou `null`
 * para deixar o cérebro decidir.
 */
export function fastRoute(text: string): BrainAction[] | null {
  const normalized = normalize(text);
  if (!normalized) return null;

  // Antes da lista e da nota: "anota tudo isso: …" não é UMA nota.
  // "Anota tudo isso: …" (bloco 194): o texto ORIGINAL vai inteiro para a separação.
  // Só gatilho explícito, e o resto tem que ter cara de lista (vírgula ou " e "): "organiza
  // as janelas", "anota tudo que eu falar na reunião" e "despejo do lixo é amanhã" seguem
  // para o cérebro (a revisão pegou os três).
  const despejo = /^\s*(?:ely[,!]?\s+)?(?:despejo\s*:|anota tudo isso\s*[:,]?|anota a[íi] tudo isso\s*[:,]?|anota essas coisas\s*[:,]?)\s*(.{15,})$/is.exec(text);
  if (despejo && /,|\s(e|tamb[ée]m|depois)\s/i.test(despejo[1])) return [{ action: "brain_dump", texto: despejo[1].trim() }];
  // Listas e timers (blocos 135/136): o item e o nome precisam do texto ORIGINAL (com
  // acento: "café", "pão de queijo"), então vêm antes das regras sobre o normalizado.
  const lista = pedidoDeLista(text);
  if (lista) return [{ action: "list_add", items: lista.itens, list: lista.lista }];
  const nota = pedidoDeNota(text);
  if (nota) return [{ action: "list_add", items: [nota], list: "Notas" }];
  const ditado = pedidoDeDitado(text);
  if (ditado) return [{ action: "type_text", text: ditado }];
  // "marquei academia" (fase 16): atalho só quando o nome bate com um hábito cadastrado —
  // "fiz o café" não é hábito e segue para o cérebro.
  const habito = pedidoDeHabito(text);
  if (habito && acharHabito(listarHabitos(), habito, true)) return [{ action: "habit_mark", name: habito }];
  // Condicionais (fase 18): a condição é um fato que o PC confere na hora, sem modelo.
  const fecharSe = pedidoFecharSeAberto(text);
  if (fecharSe) return [{ action: "close_if_open", app_name: fecharSe }];
  if (pedidoPausarSeTocando(text)) return [{ action: "pause_if_playing" }];
  // "Resume isso", "traduz isso pro inglês" (bloco 193): o copiado ou a tela.
  const isso = pedidoComIsso(text);
  // "explica isso" logo depois de uma resposta dela fica com o cérebro: o "isso" é a resposta.
  if (isso && !(isso === "explicar" && /\b(isso|isto)\s*\??$/i.test(text.trim()) && respondeuHaPouco())) return [{ action: "about_this", comando: isso }];
  const daquiA = pedidoLembreteDaquiA(text);
  if (daquiA) {
    const d = new Date(Date.now() + daquiA.minutos * 60_000);
    const p = (n: number) => String(n).padStart(2, "0");
    return [{ action: "create_reminder", text: daquiA.texto, due_at: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }];
  }
  // Treino, corrida e peso (fase 18). "Treinei" só vira atalho com treino cadastrado.
  const treino = pedidoDeTreino(text);
  if (treino && listarTreinos().length) return [{ action: "workout_mark", name: treino.nome }];
  const corrida = pedidoDeCorrida(text);
  if (corrida) return [{ action: "run_log", minutes: corrida.minutos, km: corrida.km }];
  const peso = pedidoDePeso(text);
  if (peso) return [{ action: "weight_log", kg: peso }];
  const meta = pedidoDeMeta(text);
  if (meta && acharHabito(listarMetas().map(m => ({ nome: m.titulo })), meta.meta)) return [{ action: "goal_add", name: meta.meta, delta: meta.delta }];
  const timer = interpretarTimer(text);
  if (timer) return [{ action: "timer_start", ms: timer.ms, name: timer.nome || undefined }];
  // Hora em outra cidade (fase 14): "que horas são em Tóquio" virava o clima de Tóquio.
  const cidade = pedidoDeHora(text);
  if (cidade) return [{ action: "world_time", city: cidade }];
  // Conta (bloco 138): "quanto é 15% de 230", "calcula 12 vezes 7", ou a expressão pura.
  // `(?=\s|$)` e não `\b`: sem a flag u, "é" não conta como letra e o `\b` depois dele falha.
  if ((/^\s*(quanto (é|e|da|dá)|calcula|calcule)(?=\s|$)/i.test(text) || /^[\d\s.,+\-*/x×÷^()%]+[?=]?$/i.test(text.trim())) && /\d/.test(text) && calcular(text) !== null) {
    return [{ action: "calculate", expression: text }];
  }

  for (const rule of RULES) {
    const match = normalized.match(rule.pattern);
    if (match) return rule.build(match);
  }
  return null;
}
