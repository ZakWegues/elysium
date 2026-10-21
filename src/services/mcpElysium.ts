import type { DefinicaoDeFerramenta } from "./llm";

/**
 * As ferramentas do ELYSIUM para o Hermes, por MCP (fase 21, bloco 213).
 *
 * O Hermes pensa e age com as ferramentas DELE (web, terminal, arquivos…); para mexer no que é
 * do ELYSIUM — tarefas, hábitos, lembretes, listas, música, volume, janelas, clima, estado do PC
 * — ele chama este servidor MCP, servido pela própria porta 4200 em `/mcp/<token>`:
 *  - só do próprio PC (127.0.0.1), com um token só dele (`getOrCreateMcpToken`), nunca o do
 *    celular;
 *  - só a LISTA PERMITIDA abaixo: energia, memória pessoal, área de transferência, apagar rotina,
 *    escrever texto, criar arquivo e ler a tela ficam de fora;
 *  - toda chamada passa pela política da fase 19 como pedido CONTAMINADO (o Hermes pode ter lido
 *    uma página antes): ação sensível só acontece se o PEDIDO do dono pedir aquilo, e ação sem
 *    volta vira "Confirma? Diga sim." — quem executa é o "sim" dele, não o Hermes.
 *
 * Transporte: "Streamable HTTP" do MCP no modo mais simples — cada POST é uma mensagem JSON-RPC
 * e a resposta vem como `application/json` (sem SSE). Puro: o executor vem de fora.
 */

export const FERRAMENTAS_DO_HERMES = new Set([
  // Leitura
  "janela_em_foco", "programas_abertos", "estado_do_pc", "espaco_em_disco", "resumo_do_dia", "versao_do_elysium",
  "processos_pesados", "clima", "lembretes", "rotinas", "presets", "tocando_agora", "ver_lista", "ver_tarefas",
  "ver_habitos", "painel_do_dia", "ver_timers", "hora_em", "calcular", "nota_necessaria", "revisao_da_semana",
  "treino_de_hoje", "ver_meta_calorias",
  // Ação
  "tocar_musica", "midia", "volume", "janela", "modo_foco", "abrir_programa", "fechar_programa",
  "adicionar_na_lista", "concluir_tarefa", "adiar_tarefa", "editar_tarefa", "anotar_varias", "marcar_item",
  "limpar_feitos", "marcar_habito", "avancar_meta", "marcar_treino", "registrar_corrida", "registrar_peso",
  "criar_timer", "cancelar_timer", "criar_lembrete", "cancelar_lembrete", "pomodoro", "guardar_cartao",
  "plano_de_estudo", "rodar_preset", "rodar_rotina", "pausar_rotina", "mandar_para_o_celular", "mandar_arquivo_para_o_celular",
  // Bancada de 10/10: sem estas, o Hermes improvisava — fechava os programas UM POR UM (sem a
  // pergunta do fechar_tudo_menos) e pausava a rotina que era para apagar. As duas pedem "sim".
  "fechar_tudo_menos", "apagar_rotina", "criar_rotina",
  "organizar_janelas", "buscar_app", "instalar_app", "atualizar_apps",
]);

export interface ExecutorMcp {
  definicoes: () => DefinicaoDeFerramenta[];
  /** Roda com a política; `pergunta` = virou "Confirma? Diga sim." e espera o dono. */
  executar: (nome: string, args: Record<string, unknown>) => Promise<{ resultado: string; pergunta?: boolean }>;
}

interface MensagemRpc { jsonrpc?: string; id?: number | string | null; method?: string; params?: Record<string, unknown> }

const VERSOES = ["2025-06-18", "2025-03-26", "2024-11-05"];

/** O que a bancada mostrou que o Hermes erra na escolha (10/10). Vai no `initialize`. */
export const INSTRUCOES_MCP = [
  "Ferramentas do PC do dono (ELYSIUM). Prefira estas às suas para tudo que é do PC dele.",
  "Se uma ferramenta devolver uma pergunta de confirmação, repita-a ao dono exatamente e pare.",
  "Escolhas certas: 'fecha tudo menos X' = fechar_tudo_menos (nunca feche um por um); rotina que repete ('todo dia às 8…') = criar_rotina, não lembrete; apagar rotina = apagar_rotina, nunca pausar;",
  "foco com pausas ('50 minutos com pausa de 10') = pomodoro; 'quero revisar isso depois: X' = guardar_cartao; 'terminei/fiz X' = concluir_tarefa; 'que nota preciso…' = nota_necessaria.",
].join(" ");

function resultado(id: MensagemRpc["id"], result: unknown) { return { jsonrpc: "2.0", id, result }; }
function erro(id: MensagemRpc["id"], code: number, message: string) { return { jsonrpc: "2.0", id: id ?? null, error: { code, message } }; }

/**
 * Responde UMA mensagem MCP. `null` = notificação (o HTTP responde 202 sem corpo).
 */
export async function responderMcp(msg: MensagemRpc, ex: ExecutorMcp): Promise<object | null> {
  const id = msg.id;
  const metodo = msg.method ?? "";
  if (id === undefined || id === null) return null; // notificações: initialized, cancelled…
  switch (metodo) {
    case "initialize": {
      const pedida = String(msg.params?.protocolVersion ?? "");
      return resultado(id, {
        protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "elysium", version: "1" },
        instructions: INSTRUCOES_MCP,
      });
    }
    case "ping":
      return resultado(id, {});
    case "tools/list":
      return resultado(id, {
        tools: ex.definicoes()
          .filter(d => FERRAMENTAS_DO_HERMES.has(d.name))
          .map(d => ({ name: d.name, description: d.description, inputSchema: d.parameters })),
      });
    case "tools/call": {
      const nome = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      if (!FERRAMENTAS_DO_HERMES.has(nome) || !ex.definicoes().some(d => d.name === nome)) {
        return resultado(id, { content: [{ type: "text", text: `A ferramenta ${nome} não está disponível.` }], isError: true });
      }
      try {
        const r = await ex.executar(nome, typeof args === "object" && args ? args : {});
        const texto = r.pergunta
          ? `${r.resultado}\n(Isto precisa da confirmação do dono: repita exatamente a pergunta acima para ele e encerre a resposta. Não chame esta ferramenta de novo.)`
          : r.resultado;
        return resultado(id, { content: [{ type: "text", text: texto }] });
      } catch (e) {
        return resultado(id, { content: [{ type: "text", text: `Falhou: ${e instanceof Error ? e.message : String(e)}` }], isError: true });
      }
    }
    default:
      return erro(id, -32601, `método desconhecido: ${metodo}`);
  }
}

/** O endereço que veio é do próprio PC? Pura. */
export function ehDoProprioPc(endereco: string | undefined): boolean {
  return endereco === "127.0.0.1" || endereco === "::1" || endereco === "::ffff:127.0.0.1";
}
