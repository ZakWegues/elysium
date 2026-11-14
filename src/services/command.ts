import { marcarPeloPedido } from "./marcarNaTela";
import { semAcento } from "./texto";
import { actionSummary, composeChatReply, decideBrain, noteFastRouted, recordAssistantReply, registrarTurnoUsuario, BrainAction } from "./brain";
import { contaComoAtividade, registrarAtividade } from "./atividade";
import { fastRoute } from "./fastRoute";
import { agir } from "./agente";
import { ferramenta } from "./ferramentas";
import { routeAction } from "../actions/router";
import { trackUsage } from "./history";
import { getApiKey, getConfig } from "../main/config";
import { viaRapida } from "./cerebroHibrido";
import type { Canal } from "./estiloResposta";
import { comContexto, Fonte, fontesDoPedido, marcarReserva, registrarFontes, usouReserva } from "./contextoComando";
import { agirViaHermes, registrarForaDoHermes, responderEsclarecimentoHermes } from "./hermes/cerebro";
import { criarFiltroDeFontes, separarFontes } from "./hermes/pesquisa";
import { ehEntradaDoLive } from "./live";
import { pedirConfirmacao, responderConfirmacao } from "./confirmacao";
import { responderRevisao, semMarcas } from "./cartoes";
import { decidirVocativo, dosarTratamento } from "./vocativo";
import { desfazerUltima, ehPedidoDeDesfazer, ultimoDesfazer } from "./desfazer";
import { fatosUsados } from "./memoryStore";
import { pedidoDeModoCensura, responderSemCensura, semCensuraLigado, trocarModoCensura } from "./semCensura";

export type ResultadoComando = {
  actions: BrainAction[];
  /** O que falar/mostrar. Vazio só quando nenhuma ação produziu texto. */
  reply: string;
  /** Verdadeiro quando o pedido resolveu no `fastRoute`, sem passar pelo modelo. */
  atalho: boolean;
  /** Bloco 131: as páginas que a busca na web leu para responder (vazio sem busca). */
  fontes: Fonte[];
  /** Fase 18: a nuvem falhou e quem respondeu foi o cérebro local (o app mostra "modo local"). */
  local?: boolean;
  /** 05/11: respondida pelo modelo local no modo sem censura (selo na bolha). */
  semCensura?: boolean;
  /** 31/10: este pedido fez algo reversível — o rótulo vai para o botão "Desfazer" da bolha. */
  desfazer?: string;
  /** 31/10: fatos da memória que a resposta usou — o rodapé "Lembrei: …". */
  memoria?: { id: string; text: string }[];
};

/**
 * O pipeline inteiro de um pedido, sem IPC nem janela — o mesmo para voz, chat do
 * dashboard e celular.
 *
 * Existia em duas cópias: esta (celular) e uma inline no `main.ts` (voz e dashboard). A
 * cópia do `main.ts` chamava `decideBrain` direto e NUNCA passou pelo `fastRoute`: "pausa"
 * dito ao microfone pagava uma chamada de modelo que o celular não pagava. Um caminho só,
 * e o `main.ts` fica com o que é dele — janela, bandeja, voz.
 *
 * `onActions` roda assim que as ações estão decididas e antes de executar: é o que o
 * dashboard usa para mostrar o rótulo "Abrindo o Chrome…" enquanto o executor trabalha.
 */
export type GanchosComando = {
  /** Ações decididas, antes de executar — para o rótulo "Abrindo o Chrome…". */
  onActions?: (actions: BrainAction[]) => void;
  /** Pedaço de resposta de conversa, conforme o modelo escreve. Só o `chat` emite. */
  onToken?: (token: string) => void;
  /**
   * Bloco 130: de onde veio o pedido. "voz" (padrão — microfone, áudio do celular) mantém
   * a resposta curta para falar; "texto" (chat digitado) responde como chat.
   */
  canal?: Canal;
};

export function executarComando(text: string, ganchos: GanchosComando = {}): Promise<ResultadoComando> {
  // Bloco 131: o pedido inteiro roda dentro de um contexto com o canal e as fontes.
  return comContexto(ganchos.canal ?? "voz", async () => {
    // 19/10: o "chefe" na medida — sorteado por resposta, só na primeira frase (vocativo.ts).
    const permitido = decidirVocativo();
    const antes = ultimoDesfazer()?.id;
    const r = await executarNoContexto(text, ganchos);
    const reply = dosarTratamento(r.reply, getConfig().tratamento ?? "", permitido);
    const novo = ultimoDesfazer();
    const memoria = fatosUsados(text, reply);
    return { ...r, reply, fontes: fontesDoPedido(), ...(usouReserva() ? { local: true } : {}), ...(novo && novo.id !== antes ? { desfazer: novo.rotulo } : {}), ...(memoria.length ? { memoria } : {}) };
  }, text);
}

async function executarNoContexto(
  text: string,
  ganchos: GanchosComando,
): Promise<Omit<ResultadoComando, "fontes">> {
  // Comandos fechados ("pausa", "volume 40") não precisam de modelo nenhum. Além de
  // instantâneo, isso preserva a cota de tokens por minuto da Groq para os pedidos
  // que realmente exigem interpretação.
  // Bloco 192: a Ely acabou de perguntar "Confirma? Diga sim." — este pedido é a resposta?
  // "sim" executa, "não" desiste; outra coisa descarta a pergunta e segue normal.
  const confirmado = await responderConfirmacao(text);
  if (confirmado !== null) {
    registrarTurnoUsuario(text);
    recordAssistantReply(confirmado);
    return { actions: [], reply: confirmado, atalho: true };
  }

  // 05/11: "modo sem censura" / "modo com censura" liga e desliga sem modelo nenhum.
  const censura = pedidoDeModoCensura(text);
  if (censura !== null) {
    const reply = trocarModoCensura(censura);
    ganchos.onToken?.(reply);
    return { actions: [], reply, atalho: true };
  }

  // 31/10: "desfaz" (ou o botão "Desfazer" da bolha) — a última ação reversível, sem modelo.
  if (ehPedidoDeDesfazer(text)) {
    registrarTurnoUsuario(text);
    const havia = ultimoDesfazer();
    const reply = await desfazerUltima();
    if (havia) registrarAtividade(`Desfez: ${havia.rotulo}`);
    recordAssistantReply(reply);
    ganchos.onToken?.(reply);
    return { actions: [], reply, atalho: true };
  }

  // Fase 20: no meio da revisão ("Ely, revisão"), o pedido é a resposta do cartão — a não ser
  // que seja um comando de verdade ("pausa", "abre o Chrome"): aí a revisão acaba e ele segue.
  const daRevisao = responderRevisao(text, (t) => { const a = fastRoute(t); return !!a && !a.every(x => x.action === "calculate"); });
  if (daRevisao !== null) {
    registrarTurnoUsuario(text);
    recordAssistantReply(daRevisao);
    return { actions: [], reply: daRevisao, atalho: true };
  }

  // Fase 21: o Hermes perguntou algo no turno anterior ("qual pasta?") — este pedido é a resposta.
  const doHermes = await responderEsclarecimentoHermes(text);
  if (doHermes !== null) {
    registrarTurnoUsuario(text);
    recordAssistantReply(doHermes);
    ganchos.onToken?.(doHermes);
    return { actions: [{ action: "chat" }], reply: doHermes, atalho: false };
  }

  // Fase 21: "modo live" que chega aqui veio do celular (a voz e o chat do PC tratam antes, no
  // main) — quem liga o laço é o app do celular; a resposta só confirma.
  if (ehEntradaDoLive(text)) {
    const reply = "Modo live ligado. Pode falar; diga tchau para sair.";
    ganchos.onToken?.(reply);
    return { actions: [{ action: "chat" }], reply, atalho: true };
  }

  // 14/11: "circula o YouTube no PC" (pedido do celular): a bolota do PC marca na tela dele.
  if (/(no|do|na tela do) (pc|computador|notebook)/i.test(semAcento(text))) {
    const marca = await marcarPeloPedido(text).catch(() => null);
    if (marca) {
      registrarTurnoUsuario(text);
      recordAssistantReply(marca.fala);
      ganchos.onToken?.(marca.fala);
      return { actions: [{ action: "chat" }], reply: marca.fala, atalho: true };
    }
  }

  const shortcut = fastRoute(text);
  if (shortcut) noteFastRouted(text, shortcut);

  let actions: BrainAction[] | null = shortcut;
  let replyPronta: string | null = null;

  // Fase 21: com o cérebro "hermes", tudo que não é atalho vai para o Hermes (perfil `ely`), que
  // pensa, usa as ferramentas dele e as do ELYSIUM (MCP) e escreve a resposta com a persona da
  // Ely. Qualquer falha — fora do ar, demorou a começar, erro do modelo — cai no cérebro de
  // sempre logo abaixo, com o selo "reserva".
  let turnoRegistrado = false;
  // 05/11: modo sem censura — conversa e pesquisa respondidas pelo modelo local; as ações que
  // o roteador decidir seguem pelo fluxo de baixo (sem Hermes nem agente: já estão decididas).
  if (!shortcut && semCensuraLigado()) {
    registrarTurnoUsuario(text);
    turnoRegistrado = true;
    const sc = await responderSemCensura(text, ganchos.canal ?? "voz", ganchos.onToken);
    if (sc.reply !== null) {
      recordAssistantReply(sc.reply);
      trackUsage(text, { action: "chat" });
      return { actions: sc.acoes, reply: sc.reply, atalho: false, semCensura: true };
    }
    actions = sc.acoes;
  }
  // 12/11: a via rápida — conhecimento atemporal (sem internet, PC ou vida dele) vai direto à
  // composição de conversa em streaming: ~0,8 s em vez de 6–7 s pelo Hermes. Falhou → Hermes.
  if (!actions && getConfig().cerebro === "hermes" && getConfig().viaRapida !== false && getApiKey() && viaRapida(text)) {
    registrarTurnoUsuario(text);
    turnoRegistrado = true;
    const rapida = await composeChatReply(text, ganchos.onToken, ganchos.canal ?? "voz").catch((e) => { console.warn("[via rápida] falhou; vai pelo Hermes:", e instanceof Error ? e.message : e); return null; });
    if (rapida) {
      registrarForaDoHermes(text, rapida);
      recordAssistantReply(rapida);
      trackUsage(text, { action: "chat" });
      return { actions: [{ action: "chat" }], reply: rapida, atalho: false };
    }
  }
  if (!actions && getConfig().cerebro === "hermes") {
    if (!turnoRegistrado) registrarTurnoUsuario(text);
    turnoRegistrado = true;
    // Fase 23: o bloco "FONTES:" do Hermes não aparece no streaming; vira os chips de fonte.
    const filtro = criarFiltroDeFontes(ganchos.onToken);
    const h = await agirViaHermes(text, { canal: ganchos.canal, onToken: filtro.empurrar });
    if (h) {
      const { texto: semFontes, fontes } = separarFontes(h.reply);
      if (fontes.length) registrarFontes(fontes);
      const reply = semMarcas(semFontes);
      recordAssistantReply(reply);
      trackUsage(text, { action: "chat" });
      return { actions: [{ action: "chat" }], reply, atalho: false };
    }
    marcarReserva();
  }

  // O cérebro com ferramentas (bloco 78): olha o PC, age em etapas e escreve a resposta.
  // "CHAT" vira a composição de sempre (com streaming); falha do provedor cai no roteador
  // clássico logo abaixo — ele continua inteiro como rede de segurança.
  if (!actions && getConfig().cerebroFerramentas !== false) {
    if (!turnoRegistrado) registrarTurnoUsuario(text);
    const r = await agir(text, {
      canal: ganchos.canal,
      onChamada: (nome, args) => { const eq = ferramentaComoAcao(nome, args); if (eq) ganchos.onActions?.([eq]); },
    });
    if (r?.modo === "ferramentas") {
      actions = r.acoes.length ? r.acoes : [{ action: "chat" }];
      // A marca do quiz no agente só sai da tela: o agente lê páginas e telas, e o quiz de
      // verdade passa pela conversa (fase 20, revisão).
      replyPronta = r.reply ? semMarcas(r.reply) : r.reply;
      // A resposta chega inteira; o dashboard e o celular esperam pedaços — um pedaço só.
      if (replyPronta) ganchos.onToken?.(replyPronta);
    } else if (r?.modo === "chat") {
      actions = [{ action: "chat" }];
    } else {
      actions = await decideBrain(text, true);
    }
  }
  if (!actions) actions = await decideBrain(text, turnoRegistrado);
  ganchos.onActions?.(actions);

  const replies: string[] = [];
  if (replyPronta !== null) {
    replies.push(replyPronta);
    for (const action of actions) trackUsage(text, action);
  } else {
    for (const action of actions) {
      replies.push(await resolveAction(action, text, ganchos.onToken, ganchos.canal));
      trackUsage(text, action);
      // 31/10: a linha do tempo do Hoje (o agente e o Hermes registram em ferramentas.ts).
      // Com uma ação só, o pedido vai junto: é ele que uma rotina aprendida repete (padroes.ts).
      if (contaComoAtividade(action)) registrarAtividade(actionSummary(action), Date.now(), actions.length === 1 ? text : undefined);
    }
  }

  const reply = replies.filter(Boolean).join(" ");
  // O histórico do cérebro guarda a RESPOSTA, não o resumo da ação: "e ele?" depois de
  // "quem foi Alan Turing" só funciona se o modelo souber o que ele mesmo disse. O atalho
  // já registrou o próprio turno em `noteFastRouted`.
  if (reply && !shortcut) recordAssistantReply(reply);

  return { actions, reply, atalho: shortcut !== null };
}

/** A ação equivalente a uma ferramenta, para o rótulo "Abrindo o Chrome…" enquanto ela roda. */
function ferramentaComoAcao(nome: string, args: Record<string, unknown>): BrainAction | null {
  return ferramenta(nome)?.acao?.(args) ?? null;
}

/** Só a resposta. É o contrato do `POST /api/command`. */
export async function processCommand(text: string, canal: Canal = "voz"): Promise<string> {
  return (await executarComando(text, { canal })).reply;
}

/** A resposta com os pedaços no caminho — o que o WebSocket do celular usa. */
export async function processCommandStream(text: string, onToken: (token: string) => void, canal: Canal = "voz"): Promise<ResultadoComando> {
  return executarComando(text, { onToken, canal });
}

/**
 * Executa uma ação e devolve o que falar.
 *
 * **Use isto, nunca `routeAction` direto**, em qualquer caminho que responda ao
 * usuário — voz, chat do dashboard, ou celular. Conversa é resolvida em duas etapas: o
 * roteador só identifica que o pedido é papo, e a resposta é escrita depois pelo modelo
 * bom, com um prompt curto. Quem chama `routeAction` sozinho recebe string vazia para
 * conversa, e o assistente fica mudo — foi exatamente o que aconteceu com o dashboard
 * quando as duas etapas foram criadas e só este arquivo foi atualizado.
 */
export async function resolveAction(
  action: BrainAction,
  userText: string,
  onToken?: (token: string) => void,
  canal: Canal = "voz",
): Promise<string> {
  // Segurança (23.2): o roteador clássico também não desliga nem reinicia o PC sem um "sim" —
  // o prompt dele inclui o histórico, que pode trazer o resumo de uma página.
  if (action.action === "power_control" && (action.operation === "shutdown" || action.operation === "restart")) {
    const atraso = Math.max(15, Math.round(action.delay_seconds ?? 30));
    return pedirConfirmacao(`Vou ${action.operation === "shutdown" ? "desligar" : "reiniciar"} o PC em ${atraso} segundos.`, () => routeAction({ ...action, delay_seconds: atraso }));
  }
  if (action.action !== "chat") return routeAction(action);

  const composed = await composeChatReply(userText, onToken, canal);
  if (composed) return composed;

  // A composição falhou (rede, cota). Se o roteador tiver mandado algum texto, ele
  // serve melhor que um erro seco.
  return action.reply?.trim() || "Não consegui responder isso agora.";
}
