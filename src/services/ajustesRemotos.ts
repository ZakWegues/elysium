import type { AppConfig } from "../main/config";

/**
 * Ajustes do PC no celular (12/11, pedido do dono: "as configurações que tem no ELYSIUM Desktop,
 * no mobile também" — principalmente o cérebro e o modo sem censura).
 *
 * O celular não tem uma cópia de cada tela: o PC manda este esquema (grupos, campos, opções e o
 * valor de agora) e o app desenha sozinho. Só entra o que é seguro mudar de longe — nada de chave,
 * token, porta, endereço ou caminho. A gravação passa pelo mesmo caminho dos Ajustes do PC (com os
 * efeitos de lá: Hermes, palavra de ativação, início com o Windows).
 *
 * As chaves e rótulos são os de `dashboard/js/ajustes.js` (o teste confere que existem lá).
 */

export type CampoRemoto =
  | { chave: keyof AppConfig; rotulo: string; tipo: "bool"; dica?: string }
  | { chave: keyof AppConfig; rotulo: string; tipo: "select"; opcoes: [string, string][]; dica?: string }
  | { chave: keyof AppConfig; rotulo: string; tipo: "texto"; max: number; dica?: string }
  | { chave: keyof AppConfig; rotulo: string; tipo: "faixa"; min: number; max: number; passo: number; unidade: string; dica?: string };

export interface GrupoRemoto { grupo: string; nota?: string; campos: CampoRemoto[] }

const VOZES_GEMINI = ["Kore", "Aoede", "Leda", "Sulafat", "Despina", "Achernar", "Vindemiatrix", "Zephyr", "Autonoe", "Callirrhoe",
  "Erinome", "Laomedeia", "Pulcherrima", "Gacrux", "Sadachbia", "Achird", "Puck", "Charon", "Fenrir", "Orus", "Iapetus", "Umbriel",
  "Algieba", "Enceladus", "Algenib", "Rasalgethi", "Alnilam", "Schedar", "Zubenelgenubi", "Sadaltager"];

export const AJUSTES_REMOTOS: GrupoRemoto[] = [
  {
    grupo: "Cérebro",
    nota: "Quem pensa e responde no PC. Vale para o PC e para o celular.",
    campos: [
      { chave: "semCensura", rotulo: "Modo sem censura", tipo: "bool",
        dica: "A conversa é escrita pelo modelo do PC, sem recusas. A pesquisa continua no Gemini. Também liga falando “modo sem censura”." },
      { chave: "semCensuraSoLocal", rotulo: "Sem censura — só o PC", tipo: "bool",
        dica: "Dentro do modo sem censura, nada vai para o Gemini, nem a pesquisa." },
      { chave: "cerebro", rotulo: "Cérebro principal", tipo: "select", opcoes: [["hermes", "Hermes (com reserva)"], ["elysium", "ELYSIUM — Groq e modelo local"]],
        dica: "Com o Hermes, tudo que não é atalho vai para ele; fora do ar, responde o cérebro de reserva." },
      { chave: "viaRapida", rotulo: "Resposta rápida para conhecimento", tipo: "bool",
        dica: "Pergunta de conhecimento que não depende de hoje responde em menos de 1 s, sem o Hermes." },
      { chave: "hermesContextoPessoal", rotulo: "Mandar minha memória ao Hermes", tipo: "bool",
        dica: "Ligado, os fatos guardados na memória vão para o modelo na nuvem que o Hermes usa." },
      { chave: "chatProvider", rotulo: "Quem escreve a resposta", tipo: "select", opcoes: [["auto", "Híbrido"], ["ollama", "Local (Ollama)"], ["groq", "Nuvem (Groq)"]] },
      { chave: "routerProvider", rotulo: "Quem decide a ação", tipo: "select", opcoes: [["ollama", "Local (Ollama)"], ["groq", "Nuvem (Groq)"]] },
      { chave: "cerebroFerramentas", rotulo: "Agir em etapas (ferramentas)", tipo: "bool" },
      { chave: "fallbackToGroq", rotulo: "Cair na Groq se o local falhar", tipo: "bool" },
      { chave: "ollamaReserva", rotulo: "Ollama de reserva do Gemini", tipo: "bool" },
      { chave: "evitarGpuOcupada", rotulo: "Usar a nuvem com jogo aberto", tipo: "bool" },
    ],
  },
  {
    grupo: "Voz do PC",
    nota: "A voz e o microfone do PC (a voz do celular fica em Voz).",
    campos: [
      { chave: "vozProvedor", rotulo: "Quem dá a voz", tipo: "select", opcoes: [["gemini", "Gemini"], ["edge", "Microsoft (Edge)"], ["voicestudio", "VoiceStudio — local, a mais rápida"]] },
      { chave: "voiceStudioVoz", rotulo: "Voz do VoiceStudio", tipo: "texto", max: 80, dica: "O nome do perfil no VoiceStudio. Vazio = o perfil em português de lá." },
      { chave: "vozGemini", rotulo: "Voz do Gemini", tipo: "select", opcoes: VOZES_GEMINI.map((v) => [v, v] as [string, string]) },
      { chave: "voice", rotulo: "Voz da Microsoft", tipo: "select", opcoes: [["pt-BR-ThalitaMultilingualNeural", "Thalita"], ["pt-BR-FranciscaNeural", "Francisca"], ["pt-BR-AntonioNeural", "Antonio"]] },
      { chave: "velocidadeFala", rotulo: "Velocidade da fala", tipo: "faixa", min: -10, max: 10, passo: 1, unidade: "%" },
      { chave: "falaAntecipada", rotulo: "Começar a falar antes de terminar", tipo: "bool" },
      { chave: "vozBaixaDeNoite", rotulo: "Falar mais baixo à noite", tipo: "bool" },
      { chave: "palavraDeAtivacao", rotulo: "Acordar ao ouvir “Ely” (no PC)", tipo: "bool" },
      { chave: "continuarConversa", rotulo: "Responder sem chamar de novo", tipo: "bool" },
      { chave: "interromperFalando", rotulo: "Cortar a Ely pela voz", tipo: "bool" },
      { chave: "interromperComQualquerFala", rotulo: "Qualquer fala corta (de fone)", tipo: "bool" },
      { chave: "resumoAutomatico", rotulo: "Resumo do dia pela manhã", tipo: "bool" },
      { chave: "resumoHoras", rotulo: "Horário do resumo", tipo: "select", opcoes: [["5-10", "5 h às 10 h"], ["6-11", "6 h às 11 h"], ["7-12", "7 h às 12 h"], ["8-13", "8 h às 13 h"], ["9-14", "9 h às 14 h"]] },
    ],
  },
  {
    grupo: "Conversa e telas",
    campos: [
      { chave: "respostasRapidas", rotulo: "Respostas rápidas", tipo: "bool" },
      { chave: "respostasInterativas", rotulo: "Respostas interativas (telas)", tipo: "select", opcoes: [["nunca", "Nunca"], ["pedir", "Quando eu pedir"], ["perguntar", "A Ely pergunta"], ["priorizar", "Priorizar"]] },
      { chave: "telasComInternet", rotulo: "Telas com fotos da internet", tipo: "bool" },
    ],
  },
  {
    grupo: "Sistema do PC",
    campos: [
      { chave: "autoLaunch", rotulo: "Iniciar com o Windows", tipo: "bool" },
      { chave: "atualizarDeMadrugada", rotulo: "Atualizar sozinho de madrugada", tipo: "bool" },
      { chave: "acessoRemotoNaSaude", rotulo: "Acompanhar o acesso de fora (Tailscale)", tipo: "bool" },
    ],
  },
];

const PADROES_SEM_CONFIG: Partial<Record<keyof AppConfig, unknown>> = { vozProvedor: "gemini", vozGemini: "Kore", viaRapida: true };

/** O esquema com o valor de agora de cada campo (o que o celular desenha). Pura. */
export function ajustesComValores(cfg: AppConfig): (GrupoRemoto & { campos: (CampoRemoto & { valor: unknown })[] })[] {
  return AJUSTES_REMOTOS.map((g) => ({
    ...g,
    campos: g.campos.map((c) => ({ ...c, valor: (cfg as unknown as Record<string, unknown>)[c.chave] ?? PADROES_SEM_CONFIG[c.chave] ?? (c.tipo === "bool" ? false : c.tipo === "texto" ? "" : null) })),
  }));
}

/** O campo pela chave, se ela puder ser mudada pelo celular. Pura. */
export function campoRemoto(chave: unknown): CampoRemoto | null {
  if (typeof chave !== "string") return null;
  for (const g of AJUSTES_REMOTOS) for (const c of g.campos) if (c.chave === chave) return c;
  return null;
}

/** O valor no formato do campo, ou `undefined` se não servir (tipo errado, fora da lista ou da faixa). Pura. */
export function valorRemotoValido(c: CampoRemoto, v: unknown): unknown {
  switch (c.tipo) {
    case "bool": return typeof v === "boolean" ? v : undefined;
    case "select": return typeof v === "string" && c.opcoes.some(([o]) => o === v) ? v : undefined;
    case "texto": return typeof v === "string" && v.length <= c.max ? v.trim() : undefined;
    case "faixa": {
      const n = typeof v === "number" ? v : Number.NaN;
      if (!Number.isFinite(n) || n < c.min || n > c.max) return undefined;
      return Math.round(n / c.passo) * c.passo;
    }
  }
}
