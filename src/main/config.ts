import { app, safeStorage } from "electron";
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
  /** Marca que a troca única para a voz feminina (02/10) já rodou — ver `migrarVozFeminina`. */
  vozFemininaAplicada?: boolean;
  /** Marca que a troca única para o tema Stark (fase 16) já rodou — ver `migrarTemaStark`. */
  temaStarkAplicado?: boolean;
  /** Marca a troca única para o cérebro híbrido (fase 16) — ver `migrarCerebroHibrido`. */
  cerebroHibridoAplicado?: boolean;
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
  /** "auto" (fase 16): conhecimento e chat escrito na Groq, ação e conversa curta no local. */
  chatProvider: "groq" | "ollama" | "auto";
  /** Sem o sufixo `/v1`: o `llm.ts` fala com o endpoint nativo, o único que honra keep_alive. */
  ollamaBaseUrl: string;
  ollamaRouterModel: string;
  ollamaChatModel: string;
  /** Tempo que o modelo fica na VRAM sem uso antes de o Ollama descarregá-lo sozinho. */
  ollamaKeepAlive: string;
  /** Janela de contexto pedida ao Ollama. Ver o comentário no DEFAULTS. */
  ollamaNumCtx: number;
  /** Repetir na Groq quando o local devolve algo inaproveitável. Exige a API key. */
  fallbackToGroq: boolean;
  /**
   * O cérebro com ferramentas (bloco 78): o modelo olha o PC e age em etapas. Desligado,
   * volta ao roteador clássico de uma lista de ações — a rede de segurança.
   */
  cerebroFerramentas: boolean;
  /**
   * Fase 21: quem responde o que não é atalho. "hermes" = o Hermes Agent instalado no PC (perfil
   * `hermesPerfil`), com o cérebro de sempre como reserva; "elysium" = só o cérebro de sempre
   * (Groq/local, conforme `routerProvider`/`chatProvider`).
   */
  cerebro: "hermes" | "elysium";
  hermesPerfil: string;
  /** Mandar a memória pessoal ao Hermes (vai para um modelo de terceiros). Desligado por padrão. */
  hermesContextoPessoal: boolean;
  /** Fase 21: a bolota Stark flutuante — "sempre", "falando" (só quando ouve/pensa/fala) ou "desligada". */
  bolotaModo: "sempre" | "falando" | "desligada";
  /** Diâmetro da bolota, em px (90 a 220). */
  bolotaTamanho: number;
  /** Onde ela foi solta pela última vez (null = canto inferior direito). */
  bolotaPos: { x: number; y: number } | null;
  /** Dizer "Elysium" acorda o assistente (bloco 88, reconhecedor offline do Windows). */
  palavraDeAtivacao: boolean;
  /** Versão nova já baixada instala sozinha entre 3 e 5 h, com o PC parado (fase 12). */
  atualizarDeMadrugada: boolean;
  /**
   * Como o ELYSIUM chama o dono (fase 13). Dado pessoal mora nos dados do app, nunca no
   * código — decisão do Zak. Vazio = saudação sem nome e "o usuário" nos prompts.
   */
  nomeDoUsuario: string;
  /** Fala o resumo do dia na primeira volta ao PC entre 6 e 11 h (fase 13). */
  resumoAutomatico: boolean;
  /** Das 22 h às 7 h a voz sai 30% mais baixa (02/10). */
  vozBaixaDeNoite: boolean;
  /** Bipe curto ao começar e ao parar de ouvir (02/10). */
  somDeEscuta: boolean;
  /**
   * Fase 19: a voz começa na primeira frase pronta, sem esperar a resposta inteira. Tem
   * interruptor porque foi feito sem poder ouvir (na nuvem) — se picotar, desliga aqui.
   */
  falaAntecipada: boolean;
  /** Fase 19: velocidade da fala, de −10 a +10 (por cento, por cima do ajuste de cada voz). */
  velocidadeFala: number;
  /**
   * Acompanhar o acesso de fora de casa (Tailscale) no card Saúde, no resumo e na faixa do
   * celular (bloco 122). Desligado por padrão desde o bloco 128: o Zak não quer o Tailscale
   * agora, e um aviso permanente que ele decidiu ignorar vira ruído no card.
   */
  acessoRemotoNaSaude: boolean;
  /** Bloco 134: tamanho das respostas — "direto", "equilibrado" ou "detalhado". */
  estiloResposta: string;
  /**
   * Como a Ely chama o dono (fase 16, a persona FRIDAY): "chefe" por padrão. Vazio = sem
   * tratamento. Fica no config do userData; o código só tem o padrão genérico.
   */
  tratamento: string;
  /**
   * Bloco 134: como o dono quer que o ELYSIUM responda, em texto livre (até 1500
   * caracteres). Dado pessoal: mora só aqui, na config do app — nunca no código.
   */
  instrucoesPessoais: string;
  /** Com jogo aberto, rotear pela nuvem em vez de disputar VRAM. Ver `gpuGuard.ts`. */
  evitarGpuOcupada: boolean;
  /** Fase 18: seções do Hoje que o dono escondeu ("ideia", "manchetes"…). */
  hojeOcultos: string[];
  /**
   * Fase 18: quantos avisos que a Ely toma a iniciativa de dar (lembrete de hábito) podem
   * FALAR ou ir para o celular por dia. Acima disso, só a notificação discreta no PC. Os
   * lembretes que o dono pediu não contam — esses sempre tocam.
   */
  avisosProativosPorDia: number;
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
  /** O card "Notas rápidas" da Início (bloco 67). Texto livre, grava a cada pausa de digitação. */
  homeNotas: string;
}

const DEFAULTS: AppConfig = {
  shortcut: "Control+Shift+J",
  autoLaunch: true,
  silenceMs: 2500,
  maxRecordMs: 120000,
  // 02/10: a assistente se chama Ely, e o Zak pediu voz feminina. Antes era o Antonio.
  voice: "pt-BR-FranciscaNeural",
  sttModel: "whisper-large-v3",
  brainModel: "openai/gpt-oss-120b",
  routerModel: "openai/gpt-oss-120b",
  // 28/09/2026: o catálogo da conta (`groq:modelos`, catalogoGroq.ts) trocou o qwen3.6 pelo
  // qwen3.8 e TIROU os groq/compound*. A busca passou para o gpt-oss com a ferramenta
  // `browser_search` da própria Groq — ver webSearch.ts.
  visionModel: "qwen/qwen3.8-27b",
  searchModel: "openai/gpt-oss-120b",
  routerProvider: "ollama",
  chatProvider: "auto",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  // Bloco 82 (20/09/2026): medido na bancada do agente (scripts/bench-agente.mjs, 20 casos
  // compostos e condicionais × 3), o qwen2.5:7b acertou 80% em 1,0 s (p50) contra 73% em
  // 2,1 s do llama3.1:8b, com o mesmo prompt e as mesmas 33 ferramentas. O llama3.2:3b
  // ficou em 60% e AGE em conversa ("quanto é 15% de 200" → volume): descartado.
  ollamaRouterModel: "qwen2.5:7b",
  ollamaChatModel: "qwen2.5:7b",
  // 🔴 Era "60s", pensado para o llama3.2 (3B, ~2 GB), que recarregava em 2-4 s. O
  // llama3.1:8b ocupa ~4,9 GB e **medimos 18,3 s de carregamento a frio**. Com 60 s,
  // qualquer pausa de um minuto na conversa fazia o comando seguinte esperar 18 s sem
  // explicação. 10 minutos cobre uma sessão de uso real; a GPU disputada continua
  // protegida pelo `evitarGpuOcupada`, que desvia para a nuvem sem tocar na VRAM.
  ollamaKeepAlive: "10m",
  // 🔴 Sem isto o Ollama carrega com 4096 tokens (medido em 28/09/2026, `ollama ps`), e o
  // prompt do agente SOZINHO — system + as 33 ferramentas — já ocupa 3023. Com histórico,
  // resumo, memória e o resultado de uma leitura, passava do teto, e o Ollama corta o
  // COMEÇO da conversa em silêncio: some o system prompt, não a última mensagem. 8192 custa
  // ~0,3 GB a mais de VRAM (4,7 → 5,0 GB no qwen2.5:7b).
  ollamaNumCtx: 8192,
  fallbackToGroq: true,
  cerebroFerramentas: true,
  // Fase 21: decisão do Zak (09/10) — o Hermes responde tudo que não é atalho. Sem o Hermes
  // instalado, o estado fica "sem-hermes" e tudo segue pelo cérebro de sempre.
  cerebro: "hermes",
  hermesPerfil: "ely",
  hermesContextoPessoal: false,
  // Decisão do Zak (09/10): sempre visível, discreta quando parada.
  bolotaModo: "sempre",
  bolotaTamanho: 120,
  bolotaPos: null,
  // Microfone sempre aberto é escolha do dono, não padrão de fábrica.
  palavraDeAtivacao: false,
  atualizarDeMadrugada: true,
  nomeDoUsuario: "",
  resumoAutomatico: false,
  vozBaixaDeNoite: true,
  somDeEscuta: true,
  falaAntecipada: true,
  velocidadeFala: 0,
  acessoRemotoNaSaude: false,
  estiloResposta: "equilibrado",
  tratamento: "chefe",
  instrucoesPessoais: "",
  evitarGpuOcupada: true,
  hojeOcultos: [],
  avisosProativosPorDia: 6,
  spotifyClientId: "042904fef8cc41f0bf05b7abeda2d66f",
  chatHistoryTurns: 6,
  chatIdleResetMs: 300000,
  serverPort: 4200,
  theme: "stark",
  layout: { order: ["perf", "storage", "taskmgr"], hidden: [] },
  movimento: "auto",
  climaCidade: "",
  climaLat: null,
  climaLon: null,
  homeCards: { ordem: [], ocultos: [] },
  homeNotas: "",
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
const store = new Store<{ apiKey: string; overrides: Partial<AppConfig>; serverToken: string; mcpToken: string; githubToken: string; googleClientId: string; googleClientSecret: string }>({
  name: "elysium-config",
  defaults: { apiKey: "", overrides: {}, serverToken: "", mcpToken: "", githubToken: "", googleClientId: "", googleClientSecret: "" },
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
  // Fora do catálogo em 28/09/2026 (bloco 84). A visão dava 404 em toda imagem e a busca
  // na web caía em "não consegui pesquisar".
  "qwen/qwen3.6-27b",
  "groq/compound",
  "groq/compound-mini",
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

/**
 * 🔴 POR QUE A CURA PRECISA DE UMA LISTA, E NÃO DE UM ÚNICO PADRÃO.
 *
 * A primeira versão trocava o modelo morto pelo `DEFAULTS` da mesma chave. Isso resolve o
 * caso "o usuário escolheu um modelo que morreu" e **não resolve nada** no caso que de fato
 * derrubou o app em 21/08/2026: o id morto ERA o padrão. `healModel(x, x)` devolve `x`, e a
 * rede de segurança apontava para o mesmo buraco.
 *
 * Com uma fila de candidatos, cair fora do primeiro leva ao segundo. Só quando a fila
 * inteira morre é que não há mais o que fazer — e aí o log diz isso em vez de fingir que
 * curou.
 *
 * A ordem é por qualidade medida, não por preferência: em 21/08/2026 só o `gpt-oss-120b`
 * devolveu o nome da ação no formato certo; o `20b` e o `qwen` responderam
 * `"open_app(bloco de notas)"`. Eles estão aqui como último recurso, porque um roteador
 * ruim ainda é melhor que nenhum.
 */
const CANDIDATOS_GROQ: Record<string, string[]> = {
  routerModel: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
  brainModel:  ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
  visionModel: ["qwen/qwen3.8-27b"],
  searchModel: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
  sttModel:    ["whisper-large-v3", "whisper-large-v3-turbo"],
};

/** Mesma ideia do lado local. Vale para roteamento e conversa. */
const CANDIDATOS_OLLAMA = ["qwen2.5:7b", "llama3.1:8b", "llama3.1", "llama3.2"];

function primeiroVivo(candidatos: string[], mortos: Set<string>): string | null {
  return candidatos.find(m => !mortos.has(m)) ?? null;
}

const avisados = new Set<string>();

function healModel(value: string, fallback: string, key: string): string {
  if (!DECOMMISSIONED_MODELS.has(value)) return value;

  const vivo = primeiroVivo(CANDIDATOS_GROQ[key] ?? [fallback], DECOMMISSIONED_MODELS);
  if (!vivo) {
    console.error(`[config] ${key}="${value}" morreu e NENHUM candidato da Groq sobrou. Escolha um modelo em Ajustes → Cérebro.`);
    return value;
  }
  // Uma vez por modelo: o getConfig() roda a cada pedido, e o log de um dia virava esta
  // mesma linha repetida milhares de vezes, soterrando o que importava.
  const aviso = `${key}=${value}`;
  if (!avisados.has(aviso)) {
    avisados.add(aviso);
    console.warn(`[config] ${key}="${value}" foi desativado pela Groq; usando "${vivo}".`);
  }
  return vivo;
}

/**
 * Nome de modelo do Ollama como o Ollama aceita.
 *
 * 🔴 Achado do bloco 78: o campo "Modelo local" de Ajustes guardava `"llama3.1 8b"` — com
 * ESPAÇO, digitado à mão — e o Ollama respondia `400 invalid model name` em TODO pedido.
 * O roteador caía na Groq em silêncio há dias e batia no limite de tokens por minuto. Um
 * nome com espaço e sem dois-pontos é sempre isso: `nome tag` → `nome:tag`.
 */
function normalizarNomeOllama(value: string): string {
  const v = String(value ?? "").trim();
  if (!v.includes(":") && /\s/.test(v)) return v.replace(/\s+/g, ":");
  return v;
}

function healOllama(bruto: string, fallback: string, key: string): string {
  const value = normalizarNomeOllama(bruto);
  if (!OLLAMA_MODELS_MORTOS.has(value)) return value;

  const vivo = primeiroVivo(CANDIDATOS_OLLAMA, OLLAMA_MODELS_MORTOS);
  if (!vivo) {
    console.error(`[config] ${key}="${value}" não existe no Ollama e nenhum candidato sobrou. Rode: ollama pull ${fallback}`);
    return value;
  }
  console.warn(`[config] ${key}="${value}" não existe mais no Ollama; usando "${vivo}".`);
  return vivo;
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

/** Vozes masculinas do seletor de Ajustes — as que a troca de 02/10 substitui. */
const VOZES_MASCULINAS = /^pt-BR-(Antonio|Macerio)/;

/**
 * Troca única para a voz feminina (02/10). Quem tinha o Antonio salvo (era o padrão, então
 * muita gente "escolheu" sem escolher) passa para a Francisca UMA vez; a marca garante que
 * escolher de novo uma voz masculina em Ajustes depois disso é respeitado.
 */
export function migrarVozFeminina(o: Partial<AppConfig>): Partial<AppConfig> | null {
  if (o.vozFemininaAplicada) return null;
  const patch: Partial<AppConfig> = { vozFemininaAplicada: true };
  if (o.voice && VOZES_MASCULINAS.test(o.voice)) patch.voice = "pt-BR-FranciscaNeural";
  return patch;
}

/**
 * Troca única para o tema Stark (fase 16, 07/10): o Zak pediu o visual "Jarvis feminino"
 * como PADRÃO. Roda uma vez para todo mundo; escolher outro tema depois é respeitado.
 */
export function migrarTemaStark(o: Partial<AppConfig>): Partial<AppConfig> | null {
  if (o.temaStarkAplicado) return null;
  return { temaStarkAplicado: true, theme: "stark" };
}

/**
 * Troca única para o cérebro híbrido (fase 16): quem estava no local ("ollama", o padrão
 * antigo) passa para "auto". Quem tinha escolhido a nuvem fica. Escolher de novo em
 * Ajustes → Cérebro depois disso é respeitado.
 */
export function migrarCerebroHibrido(o: Partial<AppConfig>): Partial<AppConfig> | null {
  if (o.cerebroHibridoAplicado) return null;
  return o.chatProvider === "groq" ? { cerebroHibridoAplicado: true } : { cerebroHibridoAplicado: true, chatProvider: "auto" };
}

export function getConfig(): AppConfig {
  let overrides = store.get("overrides", {} as Partial<AppConfig>);
  const trocas = { ...(migrarVozFeminina(overrides) ?? {}), ...(migrarTemaStark(overrides) ?? {}), ...(migrarCerebroHibrido(overrides) ?? {}) };
  if (Object.keys(trocas).length) {
    overrides = { ...overrides, ...trocas };
    store.set("overrides", overrides);
  }
  const merged = { ...fileDefaults, ...overrides };

  // Modelo aposentado pela Groq volta ao padrão em vez de derrubar todo comando com
  // HTTP 400 — ver DECOMMISSIONED_MODELS.
  const curado: AppConfig = {
    ...merged,
    routerModel: healModel(merged.routerModel, DEFAULTS.routerModel, "routerModel"),
    brainModel:  healModel(merged.brainModel,  DEFAULTS.brainModel,  "brainModel"),
    visionModel: healModel(merged.visionModel, DEFAULTS.visionModel, "visionModel"),
    searchModel: healModel(merged.searchModel, DEFAULTS.searchModel, "searchModel"),
    ollamaRouterModel: healOllama(merged.ollamaRouterModel, DEFAULTS.ollamaRouterModel, "ollamaRouterModel"),
    ollamaChatModel:   healOllama(merged.ollamaChatModel,   DEFAULTS.ollamaChatModel,   "ollamaChatModel"),
    cerebro: merged.cerebro === "elysium" ? "elysium" : "hermes",
    hermesPerfil: /^[a-z0-9][a-z0-9_-]{0,31}$/.test(String(merged.hermesPerfil ?? "")) ? merged.hermesPerfil : DEFAULTS.hermesPerfil,
    bolotaModo: merged.bolotaModo === "falando" || merged.bolotaModo === "desligada" ? merged.bolotaModo : "sempre",
    bolotaTamanho: Math.min(220, Math.max(90, Math.round(Number(merged.bolotaTamanho) || DEFAULTS.bolotaTamanho))),
  };

  // A cura vai para o disco quando o modelo morto era uma escolha do USUÁRIO: sem isso o
  // Ajustes mostrava para sempre um modelo que não existe (o do Zak ficou meses em
  // "llama-3.1-8b-instant") e a cura rodava a cada leitura. Os padrões não são gravados —
  // continuam vindo do código, e um padrão novo chega sozinho na próxima versão.
  const MODELOS = ["routerModel", "brainModel", "visionModel", "searchModel", "ollamaRouterModel", "ollamaChatModel"] as const;
  const corrigir: Partial<AppConfig> = {};
  for (const k of MODELOS) {
    if (overrides[k] !== undefined && overrides[k] !== curado[k]) (corrigir as Record<string, unknown>)[k] = curado[k];
  }
  if (Object.keys(corrigir).length) {
    store.set("overrides", { ...overrides, ...corrigir });
    console.warn(`[config] modelo aposentado trocado também no disco: ${JSON.stringify(corrigir)}`);
  }
  return curado;
}

/** Só o que o usuário mudou (sem os padrões) — é o que o backup leva (bloco 96). */
export function getOverrides(): Partial<AppConfig> {
  return { ...store.get("overrides", {} as Partial<AppConfig>) };
}

export function setOverride(patch: Partial<AppConfig>): void {
  const current = store.get("overrides", {} as Partial<AppConfig>);
  store.set("overrides", { ...current, ...patch });
}

export function getApiKey(): string {
  // electron-store tem prioridade; .env só como fallback de desenvolvimento
  const stored = lerSegredo("apiKey");
  if (stored) return stored;
  const env = process.env.GROQ_API_KEY;
  return env && env.trim() ? env.trim() : "";
}

export function setApiKey(key: string): void {
  gravarSegredo("apiKey", key);
}

// ── Segredos cifrados (08/10) ─────────────────────────────────────────────────
//
// A chave da Groq, o token do GitHub e o segredo do Google ficavam em texto puro no
// elysium-config.json. Agora vão cifrados pelo `safeStorage` (no Windows, DPAPI: só esta conta
// de usuário desta máquina decifra). Não protege de outro programa rodando como o próprio
// usuário — protege o arquivo copiado, um backup do disco, um print do config.
//
// Migração preguiçosa: o primeiro acesso a um segredo antigo em texto puro o regrava cifrado.
// Sem cifra disponível (raro), fica como estava — perder a chave seria pior.
// O `serverToken` NÃO entra: ele já viaja no QR para o celular, e os scripts locais o leem.
type ChaveSecreta = "apiKey" | "githubToken" | "googleClientSecret";
const PREFIXO_CIFRA = "enc:v1:";

function cifraDisponivel(): boolean {
  try { return !!safeStorage?.isEncryptionAvailable(); } catch { return false; }
}

function lerSegredo(chave: ChaveSecreta): string {
  const bruto = (store.get(chave, "") || "").trim();
  if (!bruto) return "";
  if (bruto.startsWith(PREFIXO_CIFRA)) {
    try { return safeStorage.decryptString(Buffer.from(bruto.slice(PREFIXO_CIFRA.length), "base64")).trim(); }
    catch { console.warn(`[config] não consegui decifrar ${chave} (outra conta do Windows?) — informe de novo.`); return ""; }
  }
  if (cifraDisponivel()) gravarSegredo(chave, bruto);
  return bruto;
}

function gravarSegredo(chave: ChaveSecreta, valor: string): void {
  const v = (valor || "").trim();
  if (v && cifraDisponivel()) {
    try { store.set(chave, PREFIXO_CIFRA + safeStorage.encryptString(v).toString("base64")); return; } catch { /* cai no texto puro */ }
  }
  store.set(chave, v);
}

/**
 * Token do GitHub para ler as releases dos repositórios privados (bloco 95). Mora aqui, ao
 * lado da chave da Groq, e não nos `overrides`: assim não viaja no backup nem aparece no
 * diagnóstico. Vazio = o atualizador tenta o login do `gh` desta máquina.
 */
export function getGithubToken(): string {
  return lerSegredo("githubToken");
}

/**
 * Cliente OAuth do Google (bloco 120), criado pelo Zak no Google Cloud dele. Ao lado da
 * chave da Groq, fora dos `overrides`: não vai no backup nem no diagnóstico.
 */
export function getGoogleCliente(): { id: string; segredo: string } {
  return { id: (store.get("googleClientId", "") || "").trim(), segredo: lerSegredo("googleClientSecret") };
}

export function setGoogleCliente(id: string, segredo: string): void {
  store.set("googleClientId", (id || "").trim());
  gravarSegredo("googleClientSecret", segredo);
}

export function setGithubToken(token: string): void {
  gravarSegredo("githubToken", token);
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

export function userDataPath(): string {
  return app.getPath("userData");
}

/**
 * Fase 21: o token do MCP que o Hermes usa para chamar as ferramentas do ELYSIUM. Separado do
 * `serverToken` de propósito: não abre o RPC inteiro, só a lista permitida do `mcpElysium.ts`, e
 * só vindo do próprio PC.
 */
export function getOrCreateMcpToken(): string {
  const existing = store.get("mcpToken", "");
  if (/^[0-9a-f]{48}$/.test(existing)) return existing;
  const token = crypto.randomBytes(24).toString("hex");
  store.set("mcpToken", token);
  return token;
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

/** O nome do dono para os prompts ("o assistente do Zak"); sem nome, "o usuário". */
export function nomeDoUsuario(): string {
  return (getConfig().nomeDoUsuario || "").trim() || "usuário";
}
