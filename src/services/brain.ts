import { provedorDaConversa } from "./cerebroHibrido";
import { blocoDoModo, modoAtivo, tocarModo } from "./modos";
import { filtroDeMarcas, guardarRevisoesDoTexto } from "./cartoes";
import { marcarReserva } from "./contextoComando";
import { getApiKey, getConfig, getGeminiKey, AppConfig, nomeDoUsuario } from "../main/config";
import { blocoDeInstrucoes, Canal, estiloValido, maxTokensDaConversa, personaStark, regrasDaConversa } from "./estiloResposta";
import { apiKeyError } from "./errors";
import { callChat, ChatMessage, Provider } from "./llm";
import { quemOcupaGpu } from "./gpuGuard";
import { contextoDoMomento } from "./persona";
import { lerHumor, linhaDoHumor } from "./humor";
import { estadoFoco } from "./foco";
import { aoMudarAnonimo, blocoDasConversasAnteriores, modoAnonimo, registrarEpisodio } from "./episodios";
import type { MediaOperation } from "../actions/mediaControl";
import type { WinOperation }   from "../actions/windowManagement";
import type { PowerOperation } from "../actions/powerControl";
import type { ComandoIsso } from "./isso";
import { buildMemoryBlock } from "./memoryStore";
import { aprenderDaConversa } from "./aprendizado";
import { buildRouterPromptBase } from "./routerPrompt";
import { blocoDoResumo, guardarTurnosPodados, limparResumo } from "./resumoHistorico";


export type BrainAction =
  | { action: "play_music";        query: string }
  | { action: "open_url";          url_or_query: string }
  | { action: "open_app";          app_name: string }
  | { action: "close_app";         app_name: string }
  | { action: "volume_control";    level: number | "up" | "down" | "mute" | "unmute" }
  | { action: "media_control";     operation: MediaOperation }
  | { action: "window_management"; target_app: string; operation: WinOperation }
  | { action: "write_text";        content: string; description: string }
  | { action: "create_file";       filename: string; content: string; description: string }
  | { action: "clipboard_read";    instruction: string }
  | { action: "screenshot";        filename?: string }
  | { action: "system_info";       query: string }
  | { action: "run_preset";        preset_name: string }
  | { action: "list_presets" }
  | { action: "delete_preset";     preset_name: string }
  | { action: "create_preset";     preset_name: string; description: string; icon?: string; actions: BrainAction[] }
  | { action: "send_to_mobile";    content: string; kind?: "link" | "note" }
  | { action: "power_control";     operation: PowerOperation; delay_seconds?: number }
  | { action: "remember";          fact: string }
  | { action: "forget";            query: string }
  | { action: "list_memory" }
  | { action: "weather" }
  // Modo foco (fase 12). Só o fastRoute produz: frases fechadas ("para o foco").
  | { action: "focus";             operation: "start" | "stop" | "status"; minutes?: number }
  // Resumo do dia (fase 13): também só pelo fastRoute ("bom dia", "resumo do dia").
  | { action: "daily_summary" }
  // Listas e timers (fase 14, blocos 135/136): o fastRoute e as ferramentas produzem.
  | { action: "list_add";          items: string[]; list: string }
  | { action: "type_text";         text: string }
  | { action: "habit_mark";        name: string }
  | { action: "goal_add";          name: string; delta: number }
  // Treino e corrida (fase 18): o fastRoute e as ferramentas produzem.
  | { action: "workout_mark";      name?: string }
  | { action: "run_log";           minutes: number; km?: number }
  | { action: "weight_log";        kg: number }
  // Condicionais sem modelo (fase 18): o fastRoute produz; a condição é conferida na hora.
  | { action: "close_if_open";     app_name: string }
  | { action: "pause_if_playing" }
  | { action: "list_show";         list?: string }
  | { action: "timer_start";       ms: number; name?: string }
  | { action: "timer_list" }
  | { action: "timer_cancel";      name?: string }
  // Conta exata (bloco 138): "quanto é 15% de 230" não passa pelo modelo.
  | { action: "calculate";         expression: string }
  // Bloco 190: "modo anônimo" — nada da conversa vira fato nem episódio até desligar.
  | { action: "anon_mode";         ligar: boolean }
  // Fase 20: "modo matemática", "sai do modo" — só o fastRoute produz (ver modos.ts).
  // Fase 20: cartões de revisão — "Ely, revisão", "guarda pra revisar: X é Y".
  // Fase 20: pomodoro — "Ely, pomodoro de 50", "pula a pausa", "para o pomodoro".
  // Fase 20: "monta um plano de estudo pra prova de física" — prévia e "Confirma? Diga sim.".
  // Fase 20: "tirei 6 e 7, média 6, quanto preciso na terceira?" — conta exata.
  | { action: "grade_needed";      notas: number[]; pesos?: number[]; media: number; pesoFaltante?: number; faltam?: number }
  | { action: "study_plan";        materia: string; assuntos: string[]; dia?: string; hora?: string }
  | { action: "pomodoro";          operacao: "start" | "stop" | "status" | "skip"; foco?: number; pausa?: number; ciclos?: number }
  | { action: "cards";             operacao: "revisar" | "status" | "guardar"; frente?: string; verso?: string }
  | { action: "mode";              operacao: "ligar" | "desligar" | "status" | "listar" | "criar"; id?: string; nome?: string; instrucao?: string }
  // Fase 21: "organiza minhas janelas", "salva o layout estudo", "joga o Chrome pra esquerda".
  | { action: "windows_layout";    modo: string; programa?: string; layout?: string }
  // Bloco 193: "resume isso", "traduz isso" — o copiado, ou a tela.
  | { action: "about_this";        comando: ComandoIsso }
  // Bloco 194: "anota tudo isso: …" — separa em tarefas, listas e notas, e pergunta antes.
  | { action: "brain_dump";        texto: string }
  | { action: "world_time";        city: string }
  | { action: "create_reminder";   text: string; due_at: string; weekly?: boolean; sem_hora?: boolean }
  | { action: "list_reminders" }
  | { action: "cancel_reminder";   query: string }
  | { action: "web_search";        query: string }
  | { action: "look_at_screen";    question: string }
  // `reply` é opcional: o roteador só sinaliza que é conversa, e quem escreve a
  // resposta é `composeChatReply`. O campo sobrevive como rede de segurança para
  // quando o modelo pequeno responde mesmo assim.
  | { action: "chat";              reply?: string }
  // `motivo`: quando não é o pedido que foi mal entendido, e sim o cérebro que está fora
  // do ar — dizer "não entendi" aí mandava o usuário repetir algo que estava certo.
  | { action: "unknown"; motivo?: string };

interface Message {
  role: "user" | "assistant";
  content: string;
}


/**
 * Prompt final: a parte determinística (texto fixo + data e hora), que mora em
 * `routerPrompt.ts` para a bancada de medição poder ler o mesmo texto sem carregar o
 * Electron, mais o bloco de memória, que é do usuário e muda a cada fato guardado.
 */
function buildSystemPrompt(pedido = ""): string {
  return buildRouterPromptBase() + buildMemoryBlock(pedido);
}

/**
 * Prompt de conversa — separado do de roteamento e propositalmente minúsculo.
 *
 * Decidir a ação e escrever a resposta são tarefas diferentes: a primeira é
 * classificação e roda num modelo pequeno com um prompt grande; a segunda é redação e
 * roda no modelo bom com um prompt curto. Juntas numa chamada só, pagávamos o modelo
 * caro pelo prompt gigante de roteamento em todo pedido.
 */
// Função, não constante: o nome do dono vem da config (fase 13), e pode mudar sem reiniciar.
// Bloco 130: o canal (voz ou texto) e o estilo decidem a forma — ver `estiloResposta.ts`.
const CHAT_SYSTEM_PROMPT = (canal: Canal = "voz") => `Você é a Ely, a assistente pessoal do ${nomeDoUsuario()} (o app se chama ELYSIUM; seu nome é Ely), falando em português do Brasil. Você fala de si no feminino ("a sua assistente", "pronta", "obrigada").

Fale como um parceiro inteligente e direto — solto, com personalidade, sem tom de robô ou de manual. Fale COM ele, na segunda pessoa ("você"), nunca sobre ele em terceira pessoa.
${personaStark(getConfig().tratamento ?? "chefe")}
${regrasDaConversa(canal, estiloValido(getConfig().estiloResposta))}
- Nunca diga "como modelo de linguagem", "como assistente" ou "eu sou uma IA"; nunca peça desculpas de forma mecânica.
- Use o histórico e a memória: continue o assunto de onde parou, não repita o que já disse.
- Se não souber, diga que não sabe em uma frase.`;

let history: Message[] = [];
let lastActivity = Date.now();
/**
 * Quando foi o pedido anterior a este, e quanto tempo passou (bloco 186). `null` até o
 * primeiro pedido depois de abrir o app: sem isso, a primeira conversa do dia viraria
 * "vocês não conversavam desde que o app abriu", o que não quer dizer nada.
 */
let ultimoPedidoEm: number | null = null;
let ausenciaAntesDoPedido = 0;

/**
 * A última tela mostrada (31/10), em texto: entra no contexto dos próximos pedidos para "e a 3ª
 * pergunta do quiz?" funcionar. Some depois de 3 pedidos, numa tela nova ou com a conversa zerada.
 * `estado`: o que o usuário fez nela (checklist marcado, respostas do quiz) — mexer conta como usar, e
 * os 3 pedidos recomeçam.
 */
let telaRecente: { texto: string; estado?: string; pedidos: number } | null = null;

export function registrarTelaMostrada(texto: string): void {
  telaRecente = texto ? { texto, pedidos: 0 } : null;
}

export function registrarEstadoDaTela(estado: string, texto?: string): void {
  if (!estado && !telaRecente) return;
  telaRecente = { texto: texto || telaRecente?.texto || "", ...(estado ? { estado } : {}), pedidos: 0 };
}

export function telaMostrada(): string | null {
  if (!telaRecente) return null;
  return telaRecente.estado ? `${telaRecente.texto}\nO que o usuário fez nela: ${telaRecente.estado}` : telaRecente.texto;
}

function blocoDaTela(): string {
  const t = telaMostrada();
  return t ? `\n\n[TELA QUE VOCÊ MOSTROU NA CONVERSA — o que ela tem; use se perguntarem sobre ela]\n${t}` : "";
}

export function clearHistory(): void {
  telaRecente = null;
  history = [];
  limparResumo();
  lastActivity = Date.now();
}

/**
 * Mantém os últimos `chatHistoryTurns` turnos; o que cai vai para o resumo (bloco 80) em
 * vez de sumir. Único lugar que corta o histórico — antes eram três cópias da mesma conta.
 */
function podarHistorico(): void {
  const maxMsgs = getConfig().chatHistoryTurns * 2;
  // Só no fim de um turno (última mensagem é a resposta): a pergunta e a resposta que caem
  // vão juntas para o resumo, numa chamada só. Entre a pergunta e a resposta passam
  // segundos de modelo, e a espera do resumo não cobria isso.
  if (history.length <= maxMsgs || history[history.length - 1]?.role !== "assistant") return;
  guardarTurnosPodados(history.slice(0, history.length - maxMsgs));
  history = history.slice(history.length - maxMsgs);
}

/** Reset por inatividade: conversa velha não vale como contexto, nem no resumo. */
function zerarSeOcioso(now: number): void {
  if (now - lastActivity > getConfig().chatIdleResetMs) { history = []; limparResumo(); telaRecente = null; }
  if (telaRecente && ++telaRecente.pedidos > 3) telaRecente = null;
  lastActivity = now;
  ausenciaAntesDoPedido = ultimoPedidoEm === null ? 0 : now - ultimoPedidoEm;
  ultimoPedidoEm = now;
  agendarAprendizado();
}

/**
 * Quando a conversa esfriar (o mesmo tempo que zera o histórico), propõe à memória os fatos
 * pessoais que o usuário disse (bloco 118). Cada atividade adia; só as falas do USUÁRIO vão.
 */
let timerAprendizado: NodeJS.Timeout | null = null;
// Modo anônimo virou (bloco 190): a conversa começa do zero dos dois lados da virada — ao
// ligar, nada do que vier se mistura com o antes; ao desligar, nada do anônimo é aprendido.
aoMudarAnonimo(() => {
  if (timerAprendizado) { clearTimeout(timerAprendizado); timerAprendizado = null; }
  history = [];
  limparResumo();
});
function agendarAprendizado(): void {
  if (timerAprendizado) clearTimeout(timerAprendizado);
  timerAprendizado = setTimeout(() => {
    timerAprendizado = null;
    // Modo anônimo (bloco 190): nada desta conversa vira fato nem episódio.
    if (modoAnonimo()) return;
    const falas = history.filter(m => m.role === "user").map(m => m.content);
    if (falas.length) void aprenderDaConversa(falas);
    // O episódio da conversa (bloco 190): o que se conversou e o que ficou pendente.
    if (falas.length) void registrarEpisodio(history.map(m => ({ ...m })), blocoDoResumo());
  }, getConfig().chatIdleResetMs + 5_000);
  // Não segura o processo vivo só por isto (testes e saída do app).
  timerAprendizado.unref?.();
}

/**
 * Registra no histórico um comando resolvido localmente, sem passar pelo modelo.
 *
 * Sem isto o cérebro não veria esses turnos e perderia o fio: depois de "pausa"
 * resolvido no atalho, um "continua" seguido de "e aumenta" ficaria sem contexto.
 */
export function noteFastRouted(text: string, actions: BrainAction[]): void {
  zerarSeOcioso(Date.now());
  history.push({ role: "user", content: text });
  history.push({ role: "assistant", content: actions.map(actionSummary).join(" | ") });
  podarHistorico();
}

export function actionSummary(action: BrainAction): string {
  switch (action.action) {
    case "play_music":        return `Toquei "${action.query}" no Spotify.`;
    case "open_url":          return `Abri: ${action.url_or_query}`;
    case "open_app":          return `Abri o app: ${action.app_name}`;
    case "close_app":         return `Fechei: ${action.app_name}`;
    case "volume_control":    return typeof action.level === "number" ? `Volume: ${action.level}%` : `Volume ${action.level}`;
    case "media_control":     return `Mídia: ${action.operation}`;
    case "window_management": return `Janela ${action.target_app}: ${action.operation}`;
    case "write_text":        return `Texto pronto: ${action.description}`;
    case "create_file":       return `Arquivo criado: ${action.filename}`;
    case "clipboard_read":    return `Clipboard: ${action.instruction}`;
    case "screenshot":        return "Screenshot capturado";
    case "system_info":       return `Info: ${action.query}`;
    case "weather":           return "Clima";
    case "focus":             return "Modo foco";
    case "daily_summary":     return "Resumo do dia";
    case "list_add":          return `Lista ${action.list}: ${action.items.join(", ")}`;
    case "type_text":         return "Digitando…";
    case "habit_mark":        return `Hábito ${action.name}`;
    case "goal_add":          return `Meta ${action.name}`;
    case "workout_mark":      return `Treino${action.name ? ` ${action.name}` : ""}`;
    case "run_log":           return `Corrida de ${action.minutes} min`;
    case "weight_log":        return `Peso ${action.kg} kg`;
    case "close_if_open":     return `Fechar ${action.app_name} se aberto`;
    case "pause_if_playing":  return "Pausar se tocando";
    case "list_show":         return `Lista ${action.list ?? ""}`.trim();
    case "timer_start":       return `Timer${action.name ? ` do ${action.name}` : ""}`;
    case "timer_list":        return "Timers";
    case "timer_cancel":      return "Cancelou timer";
    case "calculate":         return "Conta";
    case "anon_mode":         return action.ligar ? "Modo anônimo ligado" : "Modo anônimo desligado";
    case "grade_needed":      return "Nota necessária";
    case "study_plan":        return `Plano de estudo: ${action.materia}`;
    case "pomodoro":          return action.operacao === "start" ? "Pomodoro" : action.operacao === "stop" ? "Parou o pomodoro" : action.operacao === "skip" ? "Pulou a fase" : "Pomodoro";
    case "windows_layout":    return action.modo === "salvar_layout" ? `Salvou o layout ${action.layout ?? ""}`.trim() : action.modo === "aplicar_layout" ? `Layout ${action.layout ?? ""}`.trim() : "Organizou as janelas";
    case "cards":             return action.operacao === "guardar" ? "Cartão de revisão" : "Revisão";
    case "mode":              return action.operacao === "ligar" ? "Modo ligado" : action.operacao === "desligar" ? "Saiu do modo" : action.operacao === "criar" ? `Criou o modo ${action.nome ?? ""}`.trim() : "Modos";
    case "about_this":        return `Isso: ${action.comando}`;
    case "brain_dump":        return "Despejo para organizar";
    case "world_time":        return `Hora em ${action.city}`;
    case "run_preset":        return `Preset ativado: ${action.preset_name}`;
    case "list_presets":      return "Listou presets";
    case "delete_preset":     return `Removeu preset: ${action.preset_name}`;
    case "create_preset":     return `Criou preset: ${action.preset_name}`;
    case "send_to_mobile":    return `Mandou pro celular: ${action.content}`;
    case "power_control":     return `Energia: ${action.operation}`;
    case "remember":          return `Guardou na memória: ${action.fact}`;
    case "forget":            return `Esqueceu: ${action.query}`;
    case "list_memory":       return "Listou a memória";
    case "create_reminder":   return `Lembrete criado: ${action.text}`;
    case "list_reminders":    return "Listou lembretes";
    case "cancel_reminder":   return `Cancelou lembrete: ${action.query}`;
    case "web_search":        return `Pesquisou: ${action.query}`;
    case "look_at_screen":    return `Olhou a tela: ${action.question}`;
    case "unknown":           return "Não entendi o pedido.";
    default:                  return "";
  }
}

/** Nomes válidos da união `BrainAction`, para reconhecer invenção do modelo. */
export const ACOES_VALIDAS = new Set<string>([
  "play_music", "open_url", "open_app", "close_app", "volume_control", "media_control",
  "window_management", "write_text", "create_file", "clipboard_read", "screenshot",
  "system_info", "run_preset", "list_presets", "delete_preset", "create_preset",
  "send_to_mobile", "power_control", "remember", "forget", "list_memory",
  "create_reminder", "list_reminders", "cancel_reminder", "web_search",
  "look_at_screen", "chat", "unknown", "weather", "focus", "daily_summary",
  "list_add", "type_text", "habit_mark", "goal_add", "workout_mark", "run_log", "weight_log", "close_if_open", "pause_if_playing", "list_show", "timer_start", "timer_list", "timer_cancel", "calculate", "world_time",
]);

/**
 * Interpreta o JSON do roteador.
 *
 * Devolve `null` quando o resultado é inaproveitável — e é essa diferença que decide o
 * fallback. Antes, qualquer falha virava `unknown` ali mesmo; agora `unknown` continua
 * sendo resposta legítima do modelo ("não entendi"), enquanto `null` significa "este
 * provedor não entregou nada utilizável, vale tentar o outro".
 */
export function interpretarAcoes(content: string): BrainAction[] | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }

  let actions: BrainAction[];
  if (Array.isArray(parsed.actions) && parsed.actions.length > 0) actions = parsed.actions as BrainAction[];
  else if (parsed.action) actions = [parsed as unknown as BrainAction];
  else return null;

  // Ação inventada é sintoma de modelo que não seguiu o contrato. Filtrar em silêncio
  // esconderia isso; deixar passar faria o roteador chamar um executor inexistente.
  actions = actions.filter(a => typeof a?.action === "string" && ACOES_VALIDAS.has(a.action));
  return actions.length > 0 ? actions : null;
}

/**
 * Guarda no histórico o que o assistente de fato respondeu.
 *
 * Até setembro de 2026 o histórico só recebia o RESUMO da ação ("Abri o app: Chrome") e,
 * para conversa, o campo `reply` do roteador — que ficou vazio quando a resposta passou a
 * ser escrita na segunda etapa. Resultado: o modelo nunca via a própria resposta, e "e
 * ele?" depois de "quem foi Alan Turing" perdia o fio. Quem chama é o `executarComando`,
 * uma vez por pedido, com o texto final.
 */
export function recordAssistantReply(text: string): void {
  history.push({ role: "assistant", content: text });
  podarHistorico();
}

/**
 * Uma fala que a Ely começou sozinha (bloco 191: "como foi a prova?"). Entra no histórico
 * como dela, com o relógio da conversa reiniciado — a resposta dele, logo depois, precisa
 * desse contexto, e o histórico velho (de horas atrás) não serve mais.
 */
export function registrarFalaDaEly(texto: string): void {
  const agora = Date.now();
  if (agora - lastActivity > getConfig().chatIdleResetMs) { history = []; limparResumo(); }
  lastActivity = agora;
  history.push({ role: "assistant", content: texto });
  podarHistorico();
}

/**
 * Tira do histórico o último turno (a resposta e a pergunta que a gerou) — é o "refazer" e o
 * "editar a última pergunta" do chat (bloco 84). Sem isto o modelo veria a pergunta duas
 * vezes seguidas, com a resposta rejeitada no meio, e tenderia a repeti-la.
 */
/**
 * Tira do histórico ESTE turno (07/10, revisão): a pergunta e a resposta dele, procurando de
 * trás para frente. O "Parar" do celular fecha a conexão, mas o PC termina de gerar; se o Zak
 * já tiver mandado outra pergunta, o `desfazerUltimoTurno` tiraria a pergunta NOVA e deixaria
 * a resposta velha no lugar dela.
 */
export function desfazerTurno(pergunta: string, resposta: string): void {
  const iResp = history.map(m => m.role === "assistant" && m.content === resposta).lastIndexOf(true);
  if (iResp >= 0) history.splice(iResp, 1);
  const iPerg = history.map(m => m.role === "user" && m.content === pergunta).lastIndexOf(true);
  if (iPerg >= 0) history.splice(iPerg, 1);
}

export function desfazerUltimoTurno(): void {
  while (history.length && history[history.length - 1].role === "assistant") history.pop();
  if (history.length && history[history.length - 1].role === "user") history.pop();
}

/**
 * Decide qual provedor atende o roteamento agora.
 *
 * Com jogo aberto, o local é pulado mesmo estando configurado: carregar ~2,6 GB na GPU
 * bem na hora em que ela está disputada tiraria quadros do jogo, e ninguém ligaria a
 * queda ao assistente de voz. Ver `gpuGuard.ts`.
 */
export async function provedorDoRoteador(cfg: AppConfig): Promise<{ provider: Provider; motivo?: string }> {
  if (cfg.routerProvider !== "ollama") return { provider: "groq" };
  // Com a chave do Gemini o "ollama" vai para a nuvem (llm.ts): a GPU não importa mais.
  if (!cfg.evitarGpuOcupada || getGeminiKey()) return { provider: "ollama" };

  const ocupada = await quemOcupaGpu();
  if (!ocupada) return { provider: "ollama" };
  if (!getApiKey()) return { provider: "ollama", motivo: `${ocupada} está usando a GPU, mas não há chave da Groq para desviar` };
  return { provider: "groq", motivo: `${ocupada} está usando a GPU; roteando pela nuvem desta vez` };
}

/**
 * Registra o pedido no histórico (com o reset por inatividade). Era o começo de
 * `decideBrain`; saiu para o agente do bloco 78 registrar do mesmo jeito. Chamar UMA vez
 * por pedido — o agente e o roteador clássico nunca rodam os dois no mesmo pedido.
 */
export function registrarTurnoUsuario(text: string): void {
  zerarSeOcioso(Date.now());
  history.push({ role: "user", content: text });
  podarHistorico();
}

/**
 * A Ely acabou de responder (nos últimos `ms`)? "Explica isso" logo depois de uma resposta
 * dela é sobre a RESPOSTA, não sobre o que está copiado (bloco 193, revisão).
 */
export function respondeuHaPouco(ms = 120_000, agora = Date.now()): boolean {
  return history[history.length - 1]?.role === "assistant" && agora - lastActivity < ms;
}

/** A conversa recente como bloco de texto (sem o pedido atual), para o system prompt. */
export function contextoRecente(): string {
  const antes = blocoDoResumo();
  const recente = history.slice(0, -1)
    .map(m => (m.role === "user" ? `Usuário: ${m.content}` : `Ely: ${m.content}`))
    .join("\n");
  return (antes ? `(antes disso: ${antes})\n${recente}` : recente) + blocoDaTela();
}

/** A falha técnica em português de gente — a fala que substitui o "não entendi". */
export function motivoDaFalha(falha: string): string {
  if (/\b429\b|rate limit/i.test(falha)) {
    const s = /try again in ([\d.]+)s/i.exec(falha)?.[1];
    return `O cérebro local está fora do ar e a Groq pediu uma pausa${s ? ` de ${Math.ceil(Number(s))} segundos` : ""}. Tente de novo daqui a pouco.`;
  }
  if (/ollama/i.test(falha)) return "Não consegui falar com o Ollama, o cérebro local. Confira se ele está aberto e tente de novo.";
  return "Não consegui pensar agora: o cérebro não respondeu. Tente de novo em instantes.";
}

export async function decideBrain(text: string, jaRegistrado = false): Promise<BrainAction[]> {
  const cfg = getConfig();
  if (!jaRegistrado) registrarTurnoUsuario(text);

  // O histórico entra como bloco de texto no system, não como turnos de chat. Em modo
  // JSON o modelo local tende a responder ao ÚLTIMO turno do assistente do histórico em
  // vez de classificar o pedido novo; como contexto colado, ele lê e não imita.
  const routerContext = contextoRecente();
  let finalPrompt = buildSystemPrompt(text);
  if (routerContext) finalPrompt += "\n\n[CONTEXTO DA CONVERSA RECENTE]\n" + routerContext;

  const messages: ChatMessage[] = [
    { role: "system", content: finalPrompt },
    { role: "user", content: text },
  ];

  const { provider, motivo } = await provedorDoRoteador(cfg);
  if (motivo) console.log(`[brain] ${motivo}`);

  const modelo = provider === "ollama" ? cfg.ollamaRouterModel : cfg.routerModel;

  let actions: BrainAction[] | null = null;
  let falha = "";

  try {
    const content = await callChat({
      provider, model: modelo, messages, temperature: 0.1, maxTokens: 1500, json: true,
    });
    actions = interpretarAcoes(content);
    if (!actions) falha = "resposta sem ação aproveitável";
  } catch (e) {
    falha = e instanceof Error ? e.message : String(e);
  }

  // Rede de segurança. Vale só quando o local falhou: repetir na nuvem o que a nuvem já
  // recusou seria pagar duas vezes pelo mesmo erro.
  if (!actions && provider === "ollama" && cfg.fallbackToGroq && getApiKey()) {
    console.warn(`[brain] o roteador local falhou (${falha}); repetindo na Groq.`);
    try {
      const content = await callChat({
        provider: "groq", model: cfg.routerModel, messages,
        temperature: 0.1, maxTokens: 1500, json: true,
      });
      actions = interpretarAcoes(content);
    } catch (e) {
      falha = e instanceof Error ? e.message : String(e);
    }
  }

  if (!actions) {
    console.error(`[brain] nenhum provedor entregou ação: ${falha}`);
    if (provider === "ollama" && !getApiKey()) throw apiKeyError();
    actions = [{ action: "unknown", motivo: motivoDaFalha(falha) }];
  }

  // Nada vai pro histórico aqui: a resposta de verdade entra pelo `recordAssistantReply`,
  // depois que os executores rodarem. Empurrar o resumo agora e a resposta depois deixava
  // dois turnos de assistente seguidos para um pedido só.
  return actions;
}

/**
 * Data, hora, ausência e foco (bloco 186) e o tom de quem pediu (bloco 187). O prompt de
 * conversa não tinha nem a data — "ainda dá tempo de estudar hoje?" saía no chute.
 */
function blocoDoMomento(userText: string): string {
  let focoAtivo = false;
  try { focoAtivo = estadoFoco().ativo; } catch { /* sem foco */ }
  const tom = linhaDoHumor(lerHumor(userText));
  return `\n\n${contextoDoMomento(new Date(), { ausenciaMs: ausenciaAntesDoPedido, focoAtivo })}${tom ? `\n${tom}` : ""}`;
}

/**
 * Escreve a resposta de conversa no modelo bom.
 *
 * Devolve `null` em qualquer falha — quem chama decide o que dizer no lugar. Uma
 * conversa que quebra é bem menos grave que uma ação que não acontece, então isto
 * nunca lança.
 */
export async function composeChatReply(
  userText: string,
  /** Pedaços da resposta conforme saem do modelo — o streaming do bloco 59. */
  onToken?: (token: string) => void,
  /** Bloco 130: falada (curta) ou escrita no chat (markdown, tamanho livre). */
  canal: Canal = "voz",
): Promise<string | null> {
  // Fase 20: a marca [[REVISAR: …]] do quiz vira cartão e nunca chega à tela nem à voz.
  const r = await comporResposta(userText, onToken ? filtroDeMarcas(onToken) : undefined, canal);
  return r ? guardarRevisoesDoTexto(r, modoAtivo()?.id === "estudo") || null : r;
}

async function comporResposta(userText: string, onToken: ((token: string) => void) | undefined, canal: Canal): Promise<string | null> {
  const cfg = getConfig();

  // O mesmo histórico do roteador, para o modelo entender "e ele?" depois de uma
  // pergunta anterior. Sem o bloco de ações: aqui ele só conversa. O pedido atual já é o
  // último turno do histórico — `decideBrain` o empurrou antes de chegar aqui.
  const recent = history.slice(-cfg.chatHistoryTurns * 2);
  // Fase 20: o modo ligado vem logo depois da persona, e cada uso conta para as 6 h.
  const modo = modoAtivo();
  if (modo) tocarModo();
  const ultimo = recent[recent.length - 1];
  const messages: ChatMessage[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT(canal) + blocoDoModo(modo, canal) + blocoDoMomento(userText) + blocoDeInstrucoes(cfg.instrucoesPessoais) + buildMemoryBlock(userText) + blocoDasConversasAnteriores(userText) + (blocoDoResumo() ? `\n\n[O QUE VEIO ANTES NESTA CONVERSA]\n${blocoDoResumo()}` : "") + blocoDaTela() },
    ...recent.map(m => ({ role: m.role, content: m.content })),
    // Rede de segurança: se alguém chamar a composição sem passar pelo roteador, o
    // pedido não estaria no histórico e o modelo responderia ao turno anterior.
    ...(ultimo?.role === "user" && ultimo.content === userText ? [] : [{ role: "user" as const, content: userText }]),
  ];

  // O que já subiu para a tela em pedaços. Se o provedor cair DEPOIS de começar a
  // responder, o fallback não pode recomeçar do zero — o cliente veria a resposta do
  // primeiro seguida da do segundo. Nesse caso o parcial é a resposta.
  let parcial = "";
  const tentar = async (provider: Provider): Promise<string | null> => {
    if (provider === "groq" && !getApiKey()) return null;
    const model = provider === "ollama" ? cfg.ollamaChatModel : cfg.brainModel;
    parcial = "";
    const texto = await callChat({
      provider, model, messages, temperature: 0.6, maxTokens: maxTokensDaConversa(canal, estiloValido(cfg.estiloResposta)), timeoutMs: canal === "texto" ? 90_000 : 30_000,
      onToken: onToken ? (t) => { parcial += t; onToken(t); } : undefined,
    });
    return texto.trim() || null;
  };

  // Fase 16: "auto" escolhe por pedido — conhecimento e chat escrito na Groq, o resto local.
  const primeiro: Provider = provedorDaConversa(cfg.chatProvider, userText, canal, !!getApiKey(), !!modo?.nuvem);

  try {
    const reply = await tentar(primeiro);
    if (reply) return reply;
  } catch (e) {
    console.error(`[brain] resposta de conversa falhou no provedor "${primeiro}":`, e);
    if (parcial.trim()) return parcial.trim();
  }

  // Na volta, se a Groq (escolhida pelo "auto") falhou, o local responde.
  if (primeiro === "groq" && cfg.chatProvider === "auto") {
    try { const r = await tentar("ollama"); if (r) marcarReserva(); return r; } catch (e) { console.error("[brain] o local também falhou:", e); }
  }
  if (primeiro === "ollama" && cfg.fallbackToGroq) {
    try {
      return await tentar("groq");
    } catch (e) {
      console.error("[brain] o fallback de conversa na Groq também falhou:", e);
    }
  }

  return null;
}
