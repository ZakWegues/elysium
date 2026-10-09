import { BrowserWindow, dialog, ipcMain } from "electron";
import { handleRpc, listRpcMethods, RpcError } from "../services/rpc";

/**
 * Ponte entre o dashboard e os 52 métodos RPC.
 *
 * POR QUE EXISTE
 *
 * O desktop tinha serviço e RPC para lembretes, memória, energia, área de transferência e
 * programas — e nenhuma tela para nada disso. Escrever ~20 canais IPC novos, um por
 * operação, duplicaria uma superfície que já está pronta, validada e em uso pelo celular
 * há meses. Com esta ponte, uma tela nova do dashboard chama exatamente o mesmo código que
 * o app chama, então nascem com paridade em vez de precisarem ser mantidas em par.
 *
 * 🔴 POR QUE NÃO É UM `fetch` PARA A PORTA 4200
 *
 * A ideia natural seria o dashboard falar `http://127.0.0.1:4200/api/rpc`, como o celular
 * faz. **Não funcionaria:** o servidor não manda cabeçalho de CORS — removido de propósito
 * (§8 do handoff) para nenhuma página aberta na rede poder chamar uma API que lê clipboard
 * e mata processos — e o renderer é uma página `file://`. O navegador recusaria a resposta,
 * exatamente como aconteceu com o `expo start --web`.
 *
 * O `handleRpc()` é exportado, então o main chama a função direto. Sem HTTP, sem CORS, sem
 * token no renderer, sem depender do servidor estar de pé.
 */

/**
 * 🔴 A confirmação de destrutivo mora AQUI, no main, e não no renderer.
 *
 * No celular a trava dos três métodos destrutivos é a biometria; no desktop é este
 * diálogo. Nos dois casos vale a mesma regra: quem decide se foi confirmado tem que ser
 * quem executa. Se o renderer mandasse `confirmed: true`, a trava seria decorativa — um
 * bug de UI que pulasse o diálogo desligaria a proteção sem ninguém perceber.
 *
 * Não é defesa contra quem já tem acesso à máquina; é trava contra clique acidental em
 * "desligar o PC" ou "matar processo", que é exatamente o mesmo papel que ela tem no app.
 */
async function confirmarDestrutivo(method: string, params: Record<string, unknown>): Promise<boolean> {
  const alvo = descreverAlvo(method, params);
  // Precisa ser uma janela VISÍVEL. O app mantém um recorder invisível aberto o tempo
  // todo (é onde vive o MediaRecorder), e ele costuma ser o primeiro de getAllWindows() —
  // um diálogo modal preso nele ficaria invisível junto, travando o app à espera de um
  // clique em algo que ninguém vê.
  const janela =
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find(w => w.isVisible()) ??
    null;

  const opcoes = {
    type: "warning" as const,
    buttons: ["Cancelar", "Confirmar"],
    defaultId: 0,
    // O Esc cai no Cancelar: fechar o diálogo no susto não pode executar a ação.
    cancelId: 0,
    title: "ELYSIUM — confirmação",
    message: alvo.titulo,
    detail: alvo.detalhe,
    noLink: true,
  };

  const { response } = janela
    ? await dialog.showMessageBox(janela, opcoes)
    : await dialog.showMessageBox(opcoes);

  return response === 1;
}

/** Texto do diálogo por método. Confirmar sem saber o que se confirma não é confirmação. */
function descreverAlvo(method: string, params: Record<string, unknown>): { titulo: string; detalhe: string } {
  switch (method) {
    case "power.control": {
      const op = String(params.operation ?? "");
      const nomes: Record<string, string> = {
        shutdown: "Desligar o computador",
        restart: "Reiniciar o computador",
        sleep: "Suspender o computador",
        lock: "Bloquear a tela",
        cancel: "Cancelar o desligamento agendado",
      };
      return {
        titulo: nomes[op] ?? `Energia: ${op}`,
        detalhe: op === "shutdown" || op === "restart"
          ? "Há uma janela de 30 segundos para cancelar depois de confirmar."
          : "",
      };
    }
    case "chat.delete":
      return { titulo: "Apagar a conversa", detalhe: "Ela some do PC e do celular." };
    case "memory.remove":
      return { titulo: "Esquecer esta lembrança", detalhe: "A Ely deixa de saber isto sobre você." };
    case "tarefas.delete":
      return { titulo: "Apagar a tarefa", detalhe: "Os avisos que ainda faltavam são cancelados." };
    case "comandos.delete":
      return { titulo: "Apagar o comando de IA", detalhe: "" };
    case "presets.delete":
      return { titulo: `Apagar o preset "${String(params.name ?? "")}"`, detalhe: "" };
    case "rotinas.delete":
      return { titulo: "Apagar a rotina", detalhe: "Ela para de rodar e o histórico dela some." };
    case "presets.save":
    case "rotinas.save":
      return { titulo: "Gravar uma ação que desliga, reinicia ou apaga", detalhe: "Depois ela roda sem perguntar de novo — confirme só se foi você que montou." };
    case "apps.close":
      return {
        titulo: `Fechar o programa "${String(params.name ?? "")}"`,
        detalhe: "O processo é encerrado. Trabalho não salvo se perde.",
      };
    case "system.killProcess":
      return {
        titulo: `Encerrar o processo ${String(params.pid ?? "")}`,
        detalhe: "O processo é morto na hora. Trabalho não salvo se perde.",
      };
    default:
      return { titulo: `Executar ${method}`, detalhe: "Esta ação é marcada como destrutiva." };
  }
}

const DESTRUTIVOS = new Set(listRpcMethods().filter(m => m.destructive).map(m => m.method));

/** A URL de quem chamou o IPC é uma tela do próprio app? Pura. */
export function origemDoApp(url: string | undefined): boolean {
  if (typeof url !== "string" || !url.startsWith("file://")) return false;
  let caminho = url;
  try { caminho = decodeURI(url); } catch { return false; }
  return /\/renderer\/[\w-]+\.html(?:[?#].*)?$/.test(caminho.replace(/\\/g, "/"));
}

export function registerRpcBridge(): void {
  ipcMain.handle("rpc:call", async (_e, method: unknown, params: unknown) => {
    // Fase 20 (bloco 200): só as telas do próprio app (file://) chamam o RPC por aqui. Uma
    // página de fora que de algum jeito herdasse o preload não alcança os métodos.
    if (!origemDoApp(_e.senderFrame?.url)) return { error: "origem não autorizada" };
    const safeParams: Record<string, unknown> =
      params && typeof params === "object" && !Array.isArray(params)
        ? (params as Record<string, unknown>)
        : {};

    let confirmed = false;
    if (typeof method === "string" && DESTRUTIVOS.has(method)) {
      confirmed = await confirmarDestrutivo(method, safeParams);
      // Cancelado é caminho normal, não erro. O chamador distingue pelo campo e não
      // precisa tratar exceção para o usuário ter mudado de ideia.
      if (!confirmed) return { cancelado: true };
    }

    try {
      const result = await handleRpc(method, safeParams, { confirmed });
      return { result };
    } catch (e) {
      // 403 de um método comum = destrutivo só pelo CONTEÚDO (preset com desligar, rotina que
      // apaga — 08/10). Pergunta aqui mesmo e tenta de novo confirmado.
      if (e instanceof RpcError && e.status === 403 && !confirmed && typeof method === "string") {
        if (!(await confirmarDestrutivo(method, safeParams))) return { cancelado: true };
        try { return { result: await handleRpc(method, safeParams, { confirmed: true }) }; }
        catch (e2) { if (e2 instanceof RpcError) return { error: e2.message, status: e2.status }; throw e2; }
      }
      // A mensagem do RpcError já é em PT-BR e é a mesma que o celular recebe; traduzir de
      // novo aqui faria os dois lados divergirem no texto do mesmo erro.
      if (e instanceof RpcError) return { error: e.message, status: e.status };
      return { error: e instanceof Error ? e.message : String(e), status: 500 };
    }
  });

  ipcMain.handle("rpc:methods", () => listRpcMethods());
}
