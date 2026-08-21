import { app } from "electron";
import Store from "electron-store";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Configuração do app.
 *
 * - Defaults vêm de config.json (empacotado em dist/config.json).
 * - A API key e overrides do usuário ficam no electron-store (userData),
 *   nunca hardcoded e nunca versionados.
 */

export interface UiLayout {
  order: string[];
  hidden: string[];
}

export interface AppConfig {
  shortcut: string;
  autoLaunch: boolean;
  silenceMs: number;
  maxRecordMs: number;
  voice: string;
  sttModel: string;
  /** Modelo que escreve as respostas de conversa — vale pagar qualidade aqui. */
  brainModel: string;
  /**
   * Modelo que decide QUAL ação executar — separado do de conversa porque é ele que
   * carrega o prompt grande, em todo comando.
   *
   * Contra a intuição, o padrão aqui é o modelo GRANDE. No nível gratuito da Groq o
   * `llama-3.1-8b-instant` tem teto de 6000 tokens por minuto, metade dos 12000 do
   * `llama-3.3-70b-versatile` — medido, não suposto. Trocar pelo pequeno para
   * "economizar cota" faz o oposto.
   */
  routerModel: string;
  /**
   * Modelo que enxerga imagens (print da tela, foto do celular). Levantado da própria
   * API em 01/08/2026: é o único da conta que aceita `image_url`. Emite blocos
   * `<think>` que o `vision.ts` remove antes de falar.
   */
  visionModel: string;
  /**
   * Modelo com busca na web embutida. Os `groq/compound*` são sistemas agênticos que
   * pesquisam sozinhos e devolvem a resposta pronta — por isso não há chave de
   * serviço de busca em lugar nenhum do projeto.
   */
  searchModel: string;
  /**
   * Client ID do app no painel do Spotify.
   *
   * Não é segredo: no fluxo PKCE ele aparece na própria URL de login, e a prova de
   * posse é um valor aleatório gerado a cada tentativa. Fica aqui, versionado, para o
   * app funcionar sem passo extra de configuração. O que NUNCA é versionado é o
   * refresh token, guardado no perfil do usuário por `spotify.ts`.
   */
  /**
   * Quem decide QUAL ação executar, e quem escreve a resposta de conversa.
   *
   * O padrão passou a ser o Ollama local em 14/08/2026, medido pela bancada
   * (`scripts/bench-router.mjs`) e não suposto: o `llama3.2` de 3B acertou 93% dos 46
   * casos, com zero JSON inválido, contra um 70B da Groq que sequer completou a rodada
   * por esgotar a cota diária do plano gratuito.
   *
   * ⚠️ O ponto fraco medido do 3B é **pedido composto**: 12 de 18. "Fecha o Chrome e abre
   * o VS Code" sai pela metade com alguma frequência. O `fallbackToGroq` não cobre esse
   * caso — ação faltando é um JSON perfeitamente válido. Cobre falha de formato, ação
   * fora da união e queda do Ollama.
   */
  routerProvider: "groq" | "ollama";
  chatProvider: "groq" | "ollama";
  /** Sem o sufixo `/v1`: o `llm.ts` fala com o endpoint nativo, o único que honra keep_alive. */
  ollamaBaseUrl: string;
  ollamaRouterModel: string;
  ollamaChatModel: string;
  /** Tempo que o modelo fica na VRAM sem uso antes de o Ollama descarregá-lo sozinho. */
  ollamaKeepAlive: string;
  /** Repetir na Groq quando o local devolve algo inaproveitável. Exige a API key. */
  fallbackToGroq: boolean;
  /** Com jogo aberto, rotear pela nuvem em vez de disputar VRAM. Ver `gpuGuard.ts`. */
  evitarGpuOcupada: boolean;
  spotifyClientId: string;
  chatHistoryTurns: number;
  chatIdleResetMs: number;
  serverPort: number;
  theme: string;
  layout: UiLayout;
  /**
   * Cidade do card de clima. Escolhida pelo usuário em Ajustes — não há
   * geolocalização nem descoberta por IP em lugar nenhum (ver `clima.ts`).
   * Vazio significa "sem clima": o card e a bolha simplesmente somem.
   */
  /**
   * Movimento da interface: "auto" segue o Windows, "sempre" ignora a preferência do
   * sistema, "nunca" desliga de vez.
   *
   * Existe porque "Efeitos de animação" do Windows é um interruptor só para o sistema
   * inteiro, e quem o desliga por causa de um jogo ou de uma máquina lenta não
   * necessariamente quer um app parado. O padrão continua sendo obedecer.
   */
  movimento: "auto" | "sempre" | "nunca";
  climaCidade: string;
  climaLat: number | null;
  climaLon: number | null;
  /** Ordem e visibilidade dos cards da tela Início. */
  /**
   * Cards da tela Início.
   *
   * `fixos` e `tamanhos` são opcionais porque chegaram depois: uma configuração gravada
   * antes deles não tem as chaves, e a ausência tem que significar "padrão de fábrica"
   * em vez de derrubar a leitura. `tamanhos` guarda, por card, quantas colunas ele ocupa
   * (`span`) e a altura travada em px (`alt`) — sem entrada, o card é do tamanho que o
   * catálogo declara e cresce com o conteúdo.
   */
  homeCards: {
    ordem: string[];
    ocultos: string[];
    fixos?: string[];
    tamanhos?: Record<string, { span?: number; alt?: number }>;
  };
}

const DEFAULTS: AppConfig = {
  shortcut: "Control+Shift+J",
  autoLaunch: true,
  silenceMs: 2500,
  maxRecordMs: 120000,
  voice: "pt-BR-FranciscaNeural",
  sttModel: "whisper-large-v3",
  brainModel: "openai/gpt-oss-120b",
  routerModel: "openai/gpt-oss-120b",
  visionModel: "qwen/qwen3.6-27b",
  searchModel: "groq/compound-mini",
  routerProvider: "ollama",
  chatProvider: "ollama",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  ollamaRouterModel: "llama3.1:8b",
  ollamaChatModel: "llama3.1:8b",
  // 🔴 Era "60s", pensado para o llama3.2 (3B, ~2 GB), que recarregava em 2-4 s. O
  // llama3.1:8b ocupa ~4,9 GB e **medimos 18,3 s de carregamento a frio**. Com 60 s,
  // qualquer pausa de um minuto na conversa fazia o comando seguinte esperar 18 s sem
  // explicação. 10 minutos cobre uma sessão de uso real; a GPU disputada continua
  // protegida pelo `evitarGpuOcupada`, que desvia para a nuvem sem tocar na VRAM.
  ollamaKeepAlive: "10m",
  fallbackToGroq: true,
  evitarGpuOcupada: true,
  spotifyClientId: "042904fef8cc41f0bf05b7abeda2d66f",
  chatHistoryTurns: 6,
  chatIdleResetMs: 300000,
  serverPort: 4200,
  theme: "ely",
  layout: { order: ["perf", "storage", "taskmgr"], hidden: [] },
  movimento: "auto",
  climaCidade: "",
  climaLat: null,
  climaLon: null,
  homeCards: { ordem: [], ocultos: [] },
};

function loadDefaults(): AppConfig {
  // dist/config.json fica um nível acima de dist/main/
  const candidate = path.join(__dirname, "..", "config.json");
  try {
    if (fs.existsSync(candidate)) {
      const raw = JSON.parse(fs.readFileSync(candidate, "utf-8"));
      return { ...DEFAULTS, ...raw };
    }
  } catch {
    // se o arquivo estiver corrompido, usa os defaults embutidos
  }
  return DEFAULTS;
}

// Store seguro no userData. A API key vive aqui.
const store = new Store<{ apiKey: string; overrides: Partial<AppConfig>; serverToken: string }>({
  name: "elysium-config",
  defaults: { apiKey: "", overrides: {}, serverToken: "" },
});

const fileDefaults = loadDefaults();

/**
 * Modelos que a Groq desativou.
 *
 * Um modelo escolhido nas configurações fica guardado para sempre, então quando a Groq
 * aposenta um deles o app quebra de um dia para o outro, com HTTP 400 em todo comando —
 * e o usuário não tem como adivinhar que a causa é uma escolha feita meses atrás. Cair
 * no padrão sozinho é melhor que continuar batendo num modelo que não existe mais.
 */
const DECOMMISSIONED_MODELS = new Set([
  "llama-3.3-70b-specdec",
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
  "mixtral-8x7b-32768",
  "gemma-7b-it",
  // Aposentados em algum momento até 20/08/2026. Verificado contra `GET /v1/models`
  // nesta conta: a família Llama sumiu inteira da Groq. Estes dois eram o **padrão**
  // do app, então a defesa acima não protegia ninguém — o valor morto era justamente
  // o fallback. Foi a causa do "Não entendi o que você pediu" em todo comando.
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama-3.1-70b-versatile",
  "llama3-70b-8192",
  "llama3-8b-8192",
]);

/**
 * Modelos locais do Ollama que saíram do ar por não estarem mais baixados.
 *
 * Mesma doença da lista acima, outro dono: o `llama3.2` deixou de existir na máquina e
 * todo roteamento local passou a levar HTTP 404 do próprio Ollama. Como o app cai na
 * Groq quando o local falha, e a Groq também estava com o modelo morto, o usuário via
 * só o sintoma final.
 */
const OLLAMA_MODELS_MORTOS = new Set(["llama3.2", "llama3.2:latest", "llama3.2:3b"]);

function healModel(value: string, fallback: string, key: string): string {
  if (!DECOMMISSIONED_MODELS.has(value)) return value;
  console.warn(`[config] ${key}="${value}" foi desativado pela Groq; usando "${fallback}".`);
  return fallback;
}

function healOllama(value: string, fallback: string, key: string): string {
  if (!OLLAMA_MODELS_MORTOS.has(value)) return value;
  console.warn(`[config] ${key}="${value}" não existe mais no Ollama; usando "${fallback}".`);
  return fallback;
}

/**
 * Marca um modelo como morto em tempo de execução, quando o provedor respondeu que ele
 * não existe.
 *
 * 🔴 POR QUE ISSO PRECISOU EXISTIR: esta é a **terceira** vez que um id fixo no código
 * derruba o assistente inteiro — `llama-3.3-70b-specdec`, depois `llama-3.3-70b-versatile`
 * junto com `llama3.2`. A lista estática só protege contra os modelos que alguém já
 * soube que morreram, e ninguém fica auditando o catálogo da Groq. Aqui o próprio 404
 * do provedor vira a fonte da verdade: o modelo entra na lista, o `getConfig()` seguinte
 * já devolve o padrão, e o comando seguinte funciona em vez de repetir o mesmo erro
 * para sempre.
 */
export function marcarModeloMorto(provider: "groq" | "ollama", modelo: string): void {
  const alvo = provider === "groq" ? DECOMMISSIONED_MODELS : OLLAMA_MODELS_MORTOS;
  if (alvo.has(modelo)) return;
  alvo.add(modelo);
  console.warn(`[config] "${modelo}" não existe no provedor ${provider}; caindo no padrão a partir de agora.`);
}

export function getConfig(): AppConfig {
  const overrides = store.get("overrides", {} as Partial<AppConfig>);
  const merged = { ...fileDefaults, ...overrides };

  // Modelo aposentado pela Groq volta ao padrão em vez de derrubar todo comando com
  // HTTP 400 — ver DECOMMISSIONED_MODELS.
  return {
    ...merged,
    routerModel: healModel(merged.routerModel, DEFAULTS.routerModel, "routerModel"),
    brainModel:  healModel(merged.brainModel,  DEFAULTS.brainModel,  "brainModel"),
    visionModel: healModel(merged.visionModel, DEFAULTS.visionModel, "visionModel"),
    searchModel: healModel(merged.searchModel, DEFAULTS.searchModel, "searchModel"),
    ollamaRouterModel: healOllama(merged.ollamaRouterModel, DEFAULTS.ollamaRouterModel, "ollamaRouterModel"),
    ollamaChatModel:   healOllama(merged.ollamaChatModel,   DEFAULTS.ollamaChatModel,   "ollamaChatModel"),
  };
}

export function setOverride(patch: Partial<AppConfig>): void {
  const current = store.get("overrides", {} as Partial<AppConfig>);
  store.set("overrides", { ...current, ...patch });
}

export function getApiKey(): string {
  // electron-store tem prioridade; .env só como fallback de desenvolvimento
  const stored = store.get("apiKey", "");
  if (stored && stored.trim()) return stored.trim();
  const env = process.env.GROQ_API_KEY;
  return env && env.trim() ? env.trim() : "";
}

export function setApiKey(key: string): void {
  store.set("apiKey", (key || "").trim());
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

export function userDataPath(): string {
  return app.getPath("userData");
}

export function getOrCreateServerToken(): string {
  const existing = store.get("serverToken", "");
  if (existing && existing.length === 64) return existing;
  const token = crypto.randomBytes(32).toString("hex");
  store.set("serverToken", token);
  return token;
}

/** Gera um novo token e invalida o anterior — pareamentos antigos do Portal precisam parear de novo. */
export function regenerateServerToken(): string {
  const token = crypto.randomBytes(32).toString("hex");
  store.set("serverToken", token);
  return token;
}
