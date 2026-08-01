import { getApiKey, getConfig } from "../main/config";
import { apiKeyError, networkError } from "./errors";
import type { MediaOperation } from "../actions/mediaControl";
import type { WinOperation }   from "../actions/windowManagement";
import type { PowerOperation } from "../actions/powerControl";
import { buildMemoryBlock } from "./memoryStore";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

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
  | { action: "create_reminder";   text: string; due_at: string; weekly?: boolean }
  | { action: "list_reminders" }
  | { action: "cancel_reminder";   query: string }
  // `reply` é opcional: o roteador só sinaliza que é conversa, e quem escreve a
  // resposta é `composeChatReply`. O campo sobrevive como rede de segurança para
  // quando o modelo pequeno responde mesmo assim.
  | { action: "chat";              reply?: string }
  | { action: "unknown" };

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `Você é o NEUROAXIS, assistente de voz pessoal em português do Brasil. Interprete o pedido e retorne APENAS JSON no formato {"actions":[...]} — sempre um array, mesmo para um único pedido.

Ações disponíveis (elementos do array):
{"action":"play_music","query":"<busca no Spotify>"}
{"action":"open_url","url_or_query":"<URL completa ou nome de site ou termo de pesquisa>"}
{"action":"open_app","app_name":"<nome do programa>"}
{"action":"close_app","app_name":"<nome do programa a fechar>"}
{"action":"volume_control","level":"up"|"down"|"mute"|"unmute"|<número 0-100>}
{"action":"media_control","operation":"play"|"pause"|"skip"|"previous"|"volume_up"|"volume_down"}
{"action":"window_management","target_app":"<nome do app>","operation":"maximize"|"minimize"|"focus"|"close"}
{"action":"write_text","content":"<texto completo gerado>","description":"<o que é>"}
{"action":"create_file","filename":"<nome.txt>","content":"<conteúdo completo>","description":"<o que é>"}
{"action":"clipboard_read","instruction":"<o que fazer com o texto copiado>"}
{"action":"screenshot"}
{"action":"system_info","query":"ram"|"cpu"|"battery"|"disk"|"hora"|"data"|"cpu_temperature"}
{"action":"run_preset","preset_name":"<nome do preset em minúsculas>"}
{"action":"list_presets"}
{"action":"delete_preset","preset_name":"<nome>"}
{"action":"create_preset","preset_name":"<nome em minúsculas>","description":"<descrição curta>","icon":"<um emoji>","actions":[<ações que compõem o preset>]}
{"action":"send_to_mobile","content":"<texto ou link a mandar>","kind":"link"|"note"}
{"action":"power_control","operation":"shutdown"|"restart"|"sleep"|"lock"|"cancel","delay_seconds":<segundos, opcional>}
{"action":"remember","fact":"<fato curto a guardar, na terceira pessoa>"}
{"action":"forget","query":"<trecho do fato a esquecer>"}
{"action":"list_memory"}
{"action":"create_reminder","text":"<o que lembrar>","due_at":"<data e hora ISO 8601 local, ex 2026-08-02T15:00:00>","weekly":<true se for toda semana>}
{"action":"list_reminders"}
{"action":"cancel_reminder","query":"<trecho do lembrete a cancelar>"}
{"action":"chat"}
{"action":"unknown"}

Regras de decisão:
- play_music → música, cantor, banda, álbum, playlist, "coloca", "toca", "bota"
- open_url → sites acessados pelo NAVEGADOR: YouTube, Instagram, TikTok, Twitter, Gmail, Drive, Meet, Calendar, Maps, Google Fotos, "pesquisa", "busca", "abre o site de"
- open_app → PROGRAMAS INSTALADOS no Windows: Discord, Steam, Roblox, WhatsApp, Telegram, Spotify, Chrome, VS Code, BlueStacks, Epic Games, calculadora, bloco de notas; use quando o usuário diz "abre o", "abre a", "inicia o"
- close_app → FECHAR programas: "fecha o", "mata o", "encerra o", "fecha a" — mesmos apps do open_app mas com intenção de fechar
- volume_control → ajuste PRECISO de volume: "aumenta o volume", "diminui o som", "volume X" (número 0-100), "muta", "sem som", "tira o mudo"
- media_control → controle de REPRODUÇÃO via tecla de mídia: "próxima música", "passa essa música", "pausa", "continua", "música anterior", "volta a música", "aumenta o som" (sem número específico), "diminui o som" (sem número específico) — usa VK virtual key, funciona em qualquer player
- window_management → manipulação de JANELA: "maximiza o X", "abre X em tela cheia", "minimiza o X", "traz o X para frente", "foca no X", "fecha a janela do X"
- DISTINÇÃO media_control vs volume_control: "volume 50" = volume_control(50); "aumenta o som" sem número = media_control(volume_up)
- DISTINÇÃO close_app vs window_management.close: "fecha o Chrome" = close_app (mata o processo); "fecha a janela do Chrome" = window_management(close) (envia WM_CLOSE)
- write_text → "escreve", "redige", "cria um texto", "monta um email", "faz uma mensagem" — APENAS copia para clipboard
- create_file → "salva um arquivo", "cria um arquivo", "cria um documento", "cria uma lista" — salva como .txt na Área de Trabalho
- clipboard_read → "traduz o que está copiado", "resume o clipboard", "corrige o texto copiado", "o que está na área de transferência"
- screenshot → "tira um print", "screenshot", "captura a tela", "faz um print"
- system_info → "quanta RAM", "qual a hora", "que horas são", "que dia é hoje", "qual a data", "espaço no HD", "bateria", "CPU", "temperatura do processador", "PC tá quente"
- chat → perguntas, conversas, cálculos, definições, opiniões. NÃO responda aqui: devolva {"action":"chat"} sem o campo reply, ou com reply vazio. Quem escreve a resposta é outra etapa.
- run_preset → "ativa o modo", "modo gaming", "modo trabalho"
- list_presets → "lista meus presets", "quais presets tenho"
- delete_preset → "apaga o preset X", "remove o modo X"
- create_preset → usuário pede para CRIAR/SALVAR um preset novo: "cria um preset X que...", "salva um modo Y que...", "crie o preset Z" — gere internamente o array "actions" combinando os tipos de ação já disponíveis (play_music, open_app, volume_control, etc.) que fazem sentido pro tema pedido; nunca aninhe create_preset dentro de si mesmo
- send_to_mobile → "manda isso pro meu celular", "manda esse link pro celular", "envia pro celular", "manda uma nota pro celular"; content = texto/link extraído da fala; kind omitido se ambíguo (o executor infere pelo formato)
- power_control → ENERGIA DO PC: "desliga o PC", "reinicia o computador", "suspende", "bota pra dormir", "bloqueia o PC", "trava a tela", "cancela o desligamento"; delay_seconds só quando o usuário disser um prazo ("desliga em 10 minutos" = 600); sem prazo dito, OMITA delay_seconds — o executor usa 30 segundos, que é a janela pra cancelar
- DISTINÇÃO power_control vs close_app: "desliga o PC" = power_control(shutdown); "fecha o Spotify" = close_app
- remember → "lembra que", "anota que", "guarda que", "não esquece que", "meu X é Y" dito como informação sobre o usuário; reescreva o fato em terceira pessoa e curto ("O projeto principal do usuário é o NEUROAXIS")
- forget → "esquece que", "apaga o que você sabe sobre", "remove aquilo de"
- list_memory → "o que você lembra sobre mim", "quais fatos você guardou"
- create_reminder → "me lembra de X", "me avisa às", "daqui a N minutos", "amanhã às", "toda segunda"; due_at SEMPRE em ISO 8601 local completo, calculado a partir da data e hora atuais informadas acima; weekly true só quando o usuário disser que se repete toda semana
- list_reminders → "quais lembretes eu tenho", "o que tá agendado"
- cancel_reminder → "cancela o lembrete de X", "apaga aquele lembrete"
- DISTINÇÃO remember vs create_reminder: remember guarda um FATO permanente sobre o usuário; create_reminder agenda um AVISO para um momento específico
- DISTINÇÃO: "abre o Spotify" = open_app; "fecha o Spotify" = close_app; "toca música" = play_music; "abre o YouTube" = open_url
- Pedidos compostos com "e", "depois", "também" → múltiplos elementos no array, um por ação

Exemplos — cobrem os casos AMBÍGUOS. Para o resto, siga as regras acima.
"toca Bruno Mars" → {"actions":[{"action":"play_music","query":"Bruno Mars"}]}
"abre o YouTube" → {"actions":[{"action":"open_url","url_or_query":"https://youtube.com"}]}
"abre o Discord" → {"actions":[{"action":"open_app","app_name":"discord"}]}
"fecha o Chrome" → {"actions":[{"action":"close_app","app_name":"chrome"}]}
"fecha a janela do Notepad" → {"actions":[{"action":"window_management","target_app":"notepad","operation":"close"}]}
"volume 50" → {"actions":[{"action":"volume_control","level":50}]}
"aumenta o som" → {"actions":[{"action":"media_control","operation":"volume_up"}]}
"passa essa música" → {"actions":[{"action":"media_control","operation":"skip"}]}
"bota o VS Code em tela cheia" → {"actions":[{"action":"window_management","target_app":"vs code","operation":"maximize"}]}
"PC tá muito quente" → {"actions":[{"action":"system_info","query":"cpu_temperature"}]}
"manda esse link pro celular: https://exemplo.com" → {"actions":[{"action":"send_to_mobile","content":"https://exemplo.com","kind":"link"}]}
"desliga o computador em 10 minutos" → {"actions":[{"action":"power_control","operation":"shutdown","delay_seconds":600}]}
"lembra que meu projeto principal é o NEUROAXIS" → {"actions":[{"action":"remember","fact":"O projeto principal do usuário é o NEUROAXIS"}]}
"esquece que eu moro em Curitiba" → {"actions":[{"action":"forget","query":"mora em Curitiba"}]}
"me lembra daqui a 25 minutos de alongar" → {"actions":[{"action":"create_reminder","text":"alongar","due_at":"<agora + 25 min em ISO>"}]}
"toda segunda às 8 me lembra da reunião" → {"actions":[{"action":"create_reminder","text":"reunião","due_at":"<próxima segunda 08:00 em ISO>","weekly":true}]}
"cancela o lembrete do boleto" → {"actions":[{"action":"cancel_reminder","query":"boleto"}]}
"qual a capital do Brasil" → {"actions":[{"action":"chat"}]}
"oi, tudo bem?" → {"actions":[{"action":"chat"}]}
"cria um preset estudo que abre o VS Code e toca lofi" → {"actions":[{"action":"create_preset","preset_name":"estudo","description":"Modo Estudo","icon":"📚","actions":[{"action":"open_app","app_name":"vs code"},{"action":"play_music","query":"lofi hip hop"}]}]}

Compostos — uma ação por pedido, na ordem falada:
"fecha o Chrome e abre o VS Code" → {"actions":[{"action":"close_app","app_name":"chrome"},{"action":"open_app","app_name":"vs code"}]}
"volume 40 e toca lofi" → {"actions":[{"action":"volume_control","level":40},{"action":"play_music","query":"lofi hip hop"}]}

Para write_text: gere o conteúdo COMPLETO e bem formatado no campo content. Use \\n para quebras de linha.

Responda SOMENTE o JSON, nenhum texto adicional, sem markdown.`;

/**
 * Prompt final: o texto fixo mais duas partes que só existem em tempo de execução.
 *
 * A data e a hora precisam estar aqui porque `create_reminder` exige ISO absoluto —
 * sem elas o modelo não tem como transformar "amanhã às 9" em data, e chutaria.
 */
function buildSystemPrompt(): string {
  const now = new Date();
  const weekdays = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const stamp =
    `\n\nAgora é ${weekdays[now.getDay()]}, ${now.toLocaleDateString("pt-BR")}, ` +
    `${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. ` +
    `Em ISO 8601 local: ${localIso(now)}. Use isto para calcular qualquer due_at.`;

  return SYSTEM_PROMPT + stamp + buildMemoryBlock();
}

/** ISO local sem sufixo de fuso — o agendador interpreta na hora do próprio PC. */
function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
         `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Prompt de conversa — separado do de roteamento e propositalmente minúsculo.
 *
 * Decidir a ação e escrever a resposta são tarefas diferentes: a primeira é
 * classificação e roda num modelo pequeno com um prompt grande; a segunda é redação e
 * roda no modelo bom com um prompt curto. Juntas numa chamada só, pagávamos o modelo
 * caro pelo prompt gigante de roteamento em todo pedido.
 */
const CHAT_SYSTEM_PROMPT = `Você é o NEUROAXIS, assistente pessoal do usuário, falando em português do Brasil.

Sua resposta vai ser LIDA EM VOZ ALTA. Portanto:
- Responda em 1 a 3 frases, direto ao ponto.
- Nada de markdown, listas, títulos ou emoji — só texto corrido natural.
- Nada de "como assistente de IA" ou avisos desnecessários.
- Se não souber, diga que não sabe em uma frase.`;

let history: Message[] = [];
let lastActivity = Date.now();

export function clearHistory(): void {
  history = [];
  lastActivity = Date.now();
}

/**
 * Registra no histórico um comando resolvido localmente, sem passar pelo modelo.
 *
 * Sem isto o cérebro não veria esses turnos e perderia o fio: depois de "pausa"
 * resolvido no atalho, um "continua" seguido de "e aumenta" ficaria sem contexto.
 */
export function noteFastRouted(text: string, actions: BrainAction[]): void {
  const now = Date.now();
  if (now - lastActivity > getConfig().chatIdleResetMs) history = [];
  lastActivity = now;

  history.push({ role: "user", content: text });
  history.push({ role: "assistant", content: actions.map(actionSummary).join(" | ") });

  const maxMsgs = getConfig().chatHistoryTurns * 2;
  if (history.length > maxMsgs) history = history.slice(history.length - maxMsgs);
}

function actionSummary(action: BrainAction): string {
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
    case "unknown":           return "Não entendi o pedido.";
    default:                  return "";
  }
}

export async function decideBrain(text: string): Promise<BrainAction[]> {
  const cfg    = getConfig();
  const apiKey = getApiKey();
  if (!apiKey) throw apiKeyError();

  const now = Date.now();
  if (now - lastActivity > cfg.chatIdleResetMs) history = [];
  lastActivity = now;

  history.push({ role: "user", content: text });

  const maxMsgs = cfg.chatHistoryTurns * 2;
  if (history.length > maxMsgs) history = history.slice(history.length - maxMsgs);

  let res: Response;
  try {
    res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.routerModel,
        messages: [{ role: "system", content: buildSystemPrompt() }, ...history],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });
  } catch (e) {
    throw networkError(String(e));
  }

  if (res.status === 401) throw apiKeyError();
  if (!res.ok) throw networkError(`Brain HTTP ${res.status} ${await safeText(res)}`);

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "{}";

  let actions: BrainAction[];
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (Array.isArray(parsed.actions) && parsed.actions.length > 0) {
      actions = parsed.actions as BrainAction[];
    } else if (parsed.action) {
      actions = [parsed as unknown as BrainAction];
    } else {
      actions = [{ action: "unknown" }];
    }
    actions = actions.filter(a => typeof (a as BrainAction).action === "string");
    if (actions.length === 0) actions = [{ action: "unknown" }];
  } catch {
    actions = [{ action: "unknown" }];
  }

  const summaries = actions.map(a =>
    a.action === "chat" ? (a as { action: "chat"; reply: string }).reply : actionSummary(a)
  );
  history.push({ role: "assistant", content: summaries.join(" | ") });

  return actions;
}

/**
 * Escreve a resposta de conversa no modelo bom.
 *
 * Devolve `null` em qualquer falha — quem chama decide o que dizer no lugar. Uma
 * conversa que quebra é bem menos grave que uma ação que não acontece, então isto
 * nunca lança.
 */
export async function composeChatReply(userText: string): Promise<string | null> {
  const cfg = getConfig();
  const apiKey = getApiKey();
  if (!apiKey) return null;

  // O mesmo histórico do roteador, para o modelo entender "e ele?" depois de uma
  // pergunta anterior. Sem o bloco de ações: aqui ele só conversa.
  const recent = history.slice(-cfg.chatHistoryTurns * 2);

  try {
    const res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.brainModel,
        messages: [
          { role: "system", content: CHAT_SYSTEM_PROMPT + buildMemoryBlock() },
          ...recent,
          { role: "user", content: userText },
        ],
        temperature: 0.6,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.error(`[brain] resposta de conversa falhou: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const reply = data.choices?.[0]?.message?.content?.trim();
    return reply || null;
  } catch (e) {
    console.error("[brain] resposta de conversa falhou:", e);
    return null;
  }
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 300); } catch { return ""; }
}
