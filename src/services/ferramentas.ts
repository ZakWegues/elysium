import { cancelReminder } from "./scheduler";
import { acharTarefa, concluirTarefa, criarTarefa, editarTarefa, listarTarefas } from "./tarefas";
import { criarLembreteComTarefa, reagendarTarefa } from "../actions/memoryActions";
import { adiarPara, interpretarTexto, type Adiamento } from "./planoDeLembrete";
import { acharHabito, avancarMeta, listarHabitos, listarMetas, marcarHabito, resumirHabito } from "./habitos";
import { montarPainelHoje } from "./hoje";
import { revisaoDaSemana } from "./revisaoSemana";
import { marcarTreinoFalado, metaFalada, registrarCorridaFalada, registrarPesoFalado, treinoDeHojeFalado } from "./corpoFalado";
import { clipboard } from "electron";
import { limparFeitos, marcarItem, normalizarNomeLista } from "./listas";
import { calcular, formatarNumero } from "./calculadora";
import { falaDaNota, notaNecessaria } from "./notas";
import { montarPlano, type PedidoPlano } from "./planoEstudo";
import { aplicarDespejo, dataValida } from "./despejo";
import { comecarPomodoro, estadoPomodoro, falaDaFase, falaDoEstado, pararPomodoro, pularFase } from "./pomodoro";
import { criarCartao } from "./cartoes";

/** Os argumentos do modelo para o plano, conferidos (data e hora só no formato certo). */
function argsDoPlano(a: Record<string, unknown>): PedidoPlano {
  const dia = typeof a["dia"] === "string" && dataValida(a["dia"]) ? a["dia"] : undefined;
  const hora = typeof a["hora"] === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(a["hora"]) ? a["hora"] : undefined;
  const assuntos = Array.isArray(a["assuntos"]) ? (a["assuntos"] as unknown[]).filter((x): x is string => typeof x === "string").map(x => x.trim().slice(0, 60)).filter(Boolean).slice(0, 14) : [];
  return { materia: String(a["materia"] ?? "").trim().slice(0, 60), assuntos, ...(dia ? { dia } : {}), ...(hora ? { hora } : {}) };
}
import { horaEm } from "./horaMundo";
import { rodarComando } from "./comandosIa";
import { resumirLink } from "./leitorDeLink";
import type { DefinicaoDeFerramenta } from "./llm";
import type { BrainAction } from "./brain";
import { routeAction } from "../actions/router";
import { getRunningApps, getTopProcesses, getDashboardTelemetry } from "../actions/systemInfo";
import { climaFalado } from "./clima";
import { listPending } from "./scheduler";
import { listFacts, removeFactById } from "./memoryStore";
import { getAllPresets } from "./presetsStore";
import { alternarRotina, apagarRotina, executarRotina, listarRotinas, proximoDisparo, salvarRotina } from "./rotinas";
import { getNowPlaying } from "./spotify";
import { formatarBytes, lerArmazenamento } from "../actions/armazenamento";
import { estadoAtualizacao } from "./atualizacao";
import { comecarFoco, focoFalado, pararFoco } from "./foco";
import { resumoDoDia } from "./resumoDoDia";
import { agendaFalada } from "./agenda";
import { escolherEpisodios, linhaDoEpisodio, listarEpisodios } from "./episodios";
import { adiarTarefaPor, avancarMetaPorNome, concluirTarefaCompleta, falaDaConclusao, falaDaMeta, falaDoHabito, marcarHabitoPorNome } from "./operacoes";
import { controlarJanela, listarJanelas } from "../actions/janelas";
import { agendarLigacao, ligarParaDono } from "./telefone";
import { notify } from "../main/notify";
import { aplicarLayout, organizarJanelas, salvarLayout } from "../actions/organizarJanelas";
import type { ModoOrganizar } from "./layoutJanelas";
import { atualizacoesDisponiveis, atualizarTudoEmSegundoPlano, buscarApp, detalhesDoPacote, escolherPacote, falaDaBusca, idValido, instalarEmSegundoPlano } from "../actions/instalarApp";
import { janelaDaFrente } from "./isso";
import { deriveProcessNames } from "../actions/closeApp";
import { buscarNasConversas } from "./buscaConversas";
import { listSessions } from "./chatSessionsStore";
import { semAcento } from "./texto";

/**
 * As ferramentas do cérebro (bloco 78).
 *
 * Não é a superfície RPC inteira: é o que faz sentido pedir em português. `input.*`
 * (mouse e teclado) fica FORA de propósito — nada de modelo mexendo no mouse —, e o que
 * é do celular (mailbox.sessions, chat.*, pairing, push) não tem por que o modelo ver.
 *
 * Cada ferramenta de AÇÃO delega ao mesmo executor que a voz sempre usou (`routeAction`
 * com uma `BrainAction`): abrir programa, tocar música, energia, lembrete — nada de
 * caminho novo, nada de permissão nova. As de LEITURA são o que faltava: o modelo passa a
 * poder OLHAR o PC antes de agir ("fecha o que estiver aberto que não seja o VS Code").
 *
 * A descrição é o contrato com o modelo: curta, em português, dizendo QUANDO usar. Um
 * modelo de 8B lê a descrição, não o nome.
 */

export interface Ferramenta extends DefinicaoDeFerramenta {
  /** Executa e devolve o texto que o modelo vai ler como resultado. */
  executar: (args: Record<string, unknown>) => Promise<string>;
  /** A ação equivalente, para o rótulo "Abrindo o Chrome…" do dashboard e o histórico. */
  acao?: (args: Record<string, unknown>) => BrainAction | null;
  /**
   * Fase 19 (bloco 192): ação sem volta pergunta antes. Devolve a frase do que vai acontecer
   * e a execução já amarrada ao alvo achado agora; `null` = não há o que confirmar (alvo não
   * achado — aí o `executar` normal responde "não achei").
   */
  confirmar?: (args: Record<string, unknown>) => Promise<{ descricao: string; executar: () => Promise<string> } | null>;
}

const str = (a: Record<string, unknown>, k: string, padrao = ""): string => (typeof a[k] === "string" ? (a[k] as string).trim() : padrao);
const num = (a: Record<string, unknown>, k: string): number | undefined => (typeof a[k] === "number" && Number.isFinite(a[k] as number) ? (a[k] as number) : undefined);
/** Lista de strings de um argumento — aceita também uma string com vírgulas (o 7B às vezes manda assim). */
const arr = (a: Record<string, unknown>, k: string): string[] => {
  const v = a[k];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map(x => x.trim());
  return typeof v === "string" ? v.split(/\s*,\s*|\s+e\s+/).map(x => x.trim()).filter(Boolean) : [];
};
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required });
const s = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });

/** Executa uma BrainAction pelo executor de sempre e devolve a fala dele. */
async function acao(a: BrainAction): Promise<string> {
  const r = await routeAction(a);
  return r || "Feito.";
}

export const FERRAMENTAS: Ferramenta[] = [
  // ── leitura ──
  {
    // Bloco 193: "o que é isso aqui?", "em que programa eu estou?".
    name: "janela_em_foco",
    description: "A janela que o usuário está olhando agora (a da frente): título e programa. Use para 'isso aqui', 'essa janela', 'o que estou fazendo'.",
    parameters: obj({}),
    executar: async () => {
      const j = janelaDaFrente(await listarJanelas());
      return j ? `Na frente agora: "${j.titulo}" (${j.processo}).` : "Não achei nenhuma janela na frente.";
    },
  },
  {
    name: "programas_abertos",
    description: "Lista os programas com janela aberta agora no PC. Use antes de fechar, focar ou decidir algo que dependa do que está aberto.",
    parameters: obj({}),
    executar: async () => {
      const apps = await getRunningApps();
      // Nome do processo + título da janela: apps da loja (calculadora, fotos, configurações)
      // aparecem como "ApplicationFrameHost", e só o título diz o que são.
      const vistos = new Map<string, string>();
      for (const a of apps) {
        const nome = a.name.replace(/#\d+$/, "");
        const titulo = (a.title ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
        if (!vistos.has(nome) || (!vistos.get(nome) && titulo)) vistos.set(nome, titulo);
      }
      const lista = [...vistos.entries()].map(([n, t]) => (t && t.toLowerCase() !== n.toLowerCase() ? `${n} (${t})` : n));
      return lista.length ? `Abertos: ${lista.join("; ")}.` : "Nenhum programa com janela aberta.";
    },
  },
  {
    name: "estado_do_pc",
    description: "CPU, memória RAM em uso, discos, temperatura, bateria e há quanto tempo o PC está ligado. Use para 'como está o PC', 'quanto de RAM', 'quanto de memória o PC está usando', 'está pesado?'.",
    parameters: obj({}),
    executar: async () => {
      const t = await getDashboardTelemetry();
      const disco = t.disks.find(d => /^c/i.test(d.name)) ?? t.disks[0];
      const top = t.processes.slice(0, 3).map(p => `${p.name.replace(/#\d+$/, "")} ${Math.min(100, Math.round(p.cpu))}%`).join(", ");
      const h = Math.floor(t.uptime_sec / 3600), m = Math.floor((t.uptime_sec % 3600) / 60);
      return [
        `CPU ${Math.round(t.cpu_pct)}%`,
        `RAM ${Math.round(t.ram_pct)}% (${t.ram_used_gb} de ${t.ram_total_gb} GB)`,
        disco ? `disco ${disco.name} com ${disco.freeGB} GB livres de ${disco.totalGB}` : "",
        typeof t.cpu_temp === "number" ? `${t.cpu_temp}°C` : "",
        typeof t.battery_pct === "number" ? `bateria ${t.battery_pct}%` : "",
        t.uptime_sec ? `ligado há ${h} h ${m} min` : "",
        top ? `maiores consumos: ${top}` : "",
      ].filter(Boolean).join("; ") + ".";
    },
  },
  {
    name: "espaco_em_disco",
    description: "O que está ocupando o disco: Downloads, temporários, Lixeira e os maiores arquivos de Downloads. Use para 'o que está enchendo o disco', 'onde libero espaço'.",
    parameters: obj({}),
    executar: async () => {
      const a = await lerArmazenamento();
      const d = a.discos.find(x => /^c/i.test(x.name)) ?? a.discos[0];
      const grandes = a.grandes.slice(0, 3).map(g => `${g.nome.split(/[\\/]/).pop()} (${formatarBytes(g.bytes)})`).join(", ");
      return [
        d ? `Disco ${d.name}: ${d.freeGB} GB livres de ${d.totalGB} (${d.usedPct}% usado)` : "",
        `Downloads ${formatarBytes(a.downloads)}, temporários ${formatarBytes(a.temp)}, Lixeira ${formatarBytes(a.lixeira)}`,
        grandes ? `maiores em Downloads: ${grandes}` : "",
        "limpar é pela aba PC → Armazenamento",
      ].filter(Boolean).join("; ") + ".";
    },
  },
  {
    name: "agenda",
    description: "Os compromissos da agenda do Google do usuário: hoje, amanhã ou nos próximos 7 dias. Use para 'o que tenho amanhã', 'tenho reunião hoje?', 'minha agenda da semana'.",
    parameters: obj({ quando: s("hoje, amanha ou semana", { enum: ["hoje", "amanha", "semana"] }) }, ["quando"]),
    executar: async (a) => agendaFalada((["hoje", "amanha", "semana"].includes(str(a, "quando")) ? str(a, "quando") : "hoje") as "hoje" | "amanha" | "semana"),
  },
  {
    name: "resumo_do_dia",
    description: "Resumo do dia: clima, lembretes e rotinas de hoje, recados novos do celular e o que precisa de atenção no PC. Use para 'bom dia', 'como está meu dia', 'o que tenho hoje'.",
    parameters: obj({}),
    executar: () => resumoDoDia(),
  },
  {
    name: "versao_do_elysium",
    description: "A versão do ELYSIUM instalada e se há versão nova baixada. Use para 'tem atualização', 'qual a versão'.",
    parameters: obj({}),
    executar: async () => {
      const e = estadoAtualizacao();
      const pc = e.desktop?.pronto ? `a ${e.desktop.versao} já está baixada e instala em Ajustes → Sobre` : e.desktop ? `a ${e.desktop.versao} está baixando` : "é a mais nova publicada";
      return `O ELYSIUM do PC está na versão ${e.atual}; ${pc}.${e.celular ? ` O APK mais novo do celular é o ${e.celular.versao}.` : ""}`;
    },
  },
  {
    name: "processos_pesados",
    description: "Os processos que mais consomem CPU e memória agora, com PID. Use para 'o que está pesando', 'quem está usando a CPU'.",
    parameters: obj({}),
    executar: async () => {
      const p = await getTopProcesses();
      if (!p.length) return "Sem leitura de processos.";
      // Frase falável: os três primeiros com CPU e memória; o resto só o nome. O resultado
      // vira a resposta quando o modelo não acrescenta nada (agente.ts).
      const top = p.slice(0, 3).map(x => `${x.name.replace(/#\d+$/, "")} com ${Math.min(100, Math.round(x.cpu))}% de CPU e ${Math.round(x.ramMB)} MB`);
      const resto = p.slice(3, 8).map(x => x.name.replace(/#\d+$/, ""));
      return `Os mais pesados: ${top.join("; ")}.${resto.length ? ` Depois vêm ${resto.join(", ")}.` : ""}`;
    },
  },
  {
    name: "clima",
    description: "O tempo agora e a previsão de hoje e amanhã na cidade do usuário. Use para qualquer pergunta sobre clima, chuva, temperatura lá fora, se leva casaco.",
    parameters: obj({}),
    executar: () => climaFalado(),
    acao: () => ({ action: "weather" }),
  },
  {
    name: "lembretes",
    description: "Os lembretes e alarmes agendados. Use para 'o que tenho hoje', 'meus lembretes', antes de cancelar um.",
    parameters: obj({}),
    executar: async () => {
      const l = listPending();
      if (!l.length) return "Nenhum lembrete agendado.";
      return l.map(r => `"${r.text}" em ${new Date(r.dueAt).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}${r.kind === "weekly" ? " (semanal)" : ""}`).join("; ") + ".";
    },
    acao: () => ({ action: "list_reminders" }),
  },
  {
    name: "memoria",
    description: "Os FATOS que o ELYSIUM guardou sobre o usuário (ditos com 'lembre que…'): nome, gostos, onde mora. NÃO é a memória RAM do PC — para RAM use estado_do_pc. Use quando a pergunta depender de algo pessoal.",
    parameters: obj({}),
    executar: async () => {
      const f = listFacts();
      return f.length ? f.map(x => x.text).join("; ") + "." : "Nada guardado ainda.";
    },
    acao: () => ({ action: "list_memory" }),
  },
  {
    // Bloco 190: "do que a gente falou sobre a prova?", "o que eu tinha dito do SSD?".
    name: "lembrar_conversa",
    description: "Procura nas conversas ANTERIORES com o usuário (dias ou semanas atrás) o que foi dito sobre um assunto. Use quando ele perguntar 'do que a gente falou', 'o que eu te disse sobre', 'lembra quando'.",
    parameters: obj({ assunto: s("O assunto, em poucas palavras") }, ["assunto"]),
    executar: async (a) => {
      const assunto = str(a, "assunto");
      const agora = Date.now();
      const eps = escolherEpisodios(listarEpisodios(), assunto, agora, 3, 1).map(e => linhaDoEpisodio(e, agora));
      const sessoes = listSessions().map(x => ({ id: x.id, title: x.title, updatedAt: x.updatedAt, messages: x.messages }));
      const achados = buscarNasConversas(sessoes, assunto, 3).map(c => `- no chat "${c.titulo}" (${c.deQuem === "eu" ? "ele disse" : "você disse"}): ${c.trecho}`);
      const tudo = [...eps, ...achados];
      return tudo.length ? `Conversas anteriores sobre "${assunto}":\n${tudo.join("\n")}` : `Não achei conversa anterior sobre "${assunto}".`;
    },
  },
  {
    name: "rotinas",
    description: "As rotinas automáticas (o que o ELYSIUM faz sozinho em certas horas) e quando é a próxima.",
    parameters: obj({}),
    executar: async () => {
      const r = listarRotinas();
      if (!r.length) return "Nenhuma rotina criada.";
      return r.map(x => { const p = proximoDisparo(x); return `"${x.nome}" às ${x.hora}${x.ativa ? (p ? `, próxima ${new Date(p).toLocaleString("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : "") : " (pausada)"}`; }).join("; ") + ".";
    },
  },
  {
    name: "presets",
    description: "Os presets (modos de um clique, ex.: 'modo trabalho') disponíveis para rodar.",
    parameters: obj({}),
    executar: async () => {
      const p = Object.entries(getAllPresets());
      return p.length ? p.map(([n, x]) => `${n}: ${x.description}`).join("; ") + "." : "Nenhum preset.";
    },
    acao: () => ({ action: "list_presets" }),
  },
  {
    name: "tocando_agora",
    description: "O que está tocando no Spotify agora (faixa, artista, se está pausado).",
    parameters: obj({}),
    executar: async () => {
      const n = await getNowPlaying().catch(() => null);
      if (!n?.track) return "Nada tocando no Spotify.";
      return `${n.isPlaying ? "Tocando" : "Pausado"}: ${n.track} — ${n.artist}${n.album ? ` (${n.album})` : ""}.`;
    },
  },
  {
    name: "area_de_transferencia",
    description: "O texto copiado agora (Ctrl+C) no PC. Use quando o pedido falar em 'o que copiei', 'o clipboard', 'traduz isso'.",
    parameters: obj({}),
    executar: async () => {
      const t = clipboard.readText().trim();
      return t ? `Copiado: ${t.slice(0, 1500)}` : "A área de transferência está vazia ou não é texto.";
    },
  },

  // ── ações (os mesmos executores da voz) ──
  {
    name: "abrir_programa",
    description: "Abre um programa pelo nome (chrome, spotify, vs code, calculadora, bloco de notas…).",
    parameters: obj({ nome: s("Nome do programa como o usuário falou") }, ["nome"]),
    executar: a => acao({ action: "open_app", app_name: str(a, "nome") }),
    acao: a => ({ action: "open_app", app_name: str(a, "nome") }),
  },
  {
    name: "fechar_programa",
    description: "Fecha um programa aberto pelo nome. Confira em programas_abertos antes se houver dúvida.",
    parameters: obj({ nome: s("Nome do programa") }, ["nome"]),
    executar: a => acao({ action: "close_app", app_name: str(a, "nome") }),
    acao: a => ({ action: "close_app", app_name: str(a, "nome") }),
  },
  {
    // Bloco 192: o caso que a bancada sempre errava — o 7B inventava a lista de programas. A
    // lista agora vem de quem está aberto DE VERDADE, é lida em voz alta e só fecha com "sim".
    // Fecha a JANELA (como o X), não mata o processo: quem tiver algo sem salvar pergunta.
    name: "fechar_tudo_menos",
    description: "Fecha TODOS os programas abertos, menos os que o usuário quer manter ('fecha tudo menos o VS Code', 'fecha tudo exceto o Spotify'). Pergunta antes, dizendo o que vai fechar.",
    parameters: obj({ manter: { type: "array", items: s("Programa que fica aberto"), description: "Os programas que NÃO devem ser fechados" } }, ["manter"]),
    // Só chega aqui sem confirmação quando não há nada para fechar (o `confirmar` devolveu null).
    executar: async (a) => (programasParaFechar(await listarJanelas(), arr(a, "manter")).length
      ? "Isso precisa de confirmação: peça de novo."
      : "Não tem nada aberto além do que você quer manter."),
    confirmar: async (a) => {
      const fechar = programasParaFechar(await listarJanelas(), arr(a, "manter"));
      if (!fechar.length) return null;
      return {
        descricao: `Vou fechar ${fechar.length === 1 ? fechar[0].rotulo : `${fechar.slice(0, -1).map(f => f.rotulo).join(", ")} e ${fechar[fechar.length - 1].rotulo}`}.`,
        executar: async () => {
          // WM_CLOSE em cada janela (o X): quem tiver algo sem salvar pergunta, nada é morto.
          const r = await Promise.all(fechar.flatMap(f => f.hwnds.map(h => controlarJanela(h, "fechar").then(() => true, () => false))));
          const falhas = r.filter(ok => !ok).length;
          return falhas ? `Pedi para fechar; ${falhas} janela(s) não responderam — podem estar pedindo para salvar.` : "Pronto, pedi para fechar tudo menos o que você quer. Quem tiver algo sem salvar vai perguntar.";
        },
      };
    },
  },
  {
    name: "janela",
    description: "Maximiza, minimiza, foca ou fecha a janela de um programa aberto.",
    parameters: obj({ programa: s("Nome do programa"), operacao: s("O que fazer", { enum: ["maximize", "minimize", "focus", "close"] }) }, ["programa", "operacao"]),
    executar: a => acao({ action: "window_management", target_app: str(a, "programa"), operation: str(a, "operacao") as never }),
    acao: a => ({ action: "window_management", target_app: str(a, "programa"), operation: str(a, "operacao") as never }),
  },
  {
    // Fase 21 (bloco 216): posição das janelas e layouts salvos.
    name: "organizar_janelas",
    description: "Organiza as janelas na tela: lado_a_lado, quadrantes, cascata, um programa na esquerda/direita/cima/baixo/centro/maximizar, ou outro_monitor; e salva/aplica um layout com nome ('salva o layout estudo', 'layout estudo').",
    parameters: obj({
      modo: s("O que fazer", { enum: ["lado_a_lado", "quadrantes", "cascata", "esquerda", "direita", "cima", "baixo", "centro", "maximizar", "outro_monitor", "salvar_layout", "aplicar_layout"] }),
      programa: s("Programa (para esquerda/direita/outro_monitor…); vazio = a janela em foco"),
      layout: s("Nome do layout (para salvar_layout/aplicar_layout)"),
    }, ["modo"]),
    executar: async (a) => {
      const modo = str(a, "modo");
      if (modo === "salvar_layout") return salvarLayout(str(a, "layout") || "padrão");
      if (modo === "aplicar_layout") return aplicarLayout(str(a, "layout") || "padrão");
      return organizarJanelas(modo as ModoOrganizar, str(a, "programa") || undefined);
    },
  },
  {
    name: "buscar_app",
    description: "Procura um programa para baixar no winget e na Microsoft Store e diz os achados (nome, Id, versão). Não instala.",
    parameters: obj({ nome: s("O programa, como ele falou") }, ["nome"]),
    executar: async (a) => falaDaBusca(str(a, "nome"), await buscarApp(str(a, "nome"))),
  },
  {
    // Instalar sempre pergunta: a Ely diz nome, editora e versão, e só instala com "sim".
    name: "instalar_app",
    description: "Baixa e instala um programa pelo winget/Microsoft Store. Pergunta antes, dizendo nome, editora e versão. Use o Id exato que o buscar_app achou, ou o nome.",
    parameters: obj({ pacote: s("Id exato do winget (ex.: VideoLAN.VLC) ou o nome do programa") }, ["pacote"]),
    executar: async (a) => {
      const achados = await buscarApp(str(a, "pacote")).catch(() => []);
      return achados.length ? falaDaBusca(str(a, "pacote"), achados) : `Não achei "${str(a, "pacote")}" para instalar.`;
    },
    confirmar: async (a) => {
      const pedido = str(a, "pacote").trim();
      let id = idValido(pedido) && /\./.test(pedido) ? pedido : "";
      if (!id) {
        const escolhido = escolherPacote(pedido, await buscarApp(pedido).catch(() => []));
        if (!escolhido) return null; // ambíguo ou nada: o `executar` lista as opções
        id = escolhido.id;
      }
      const d = await detalhesDoPacote(id);
      if (!d) return null;
      return {
        descricao: `Vou instalar ${d.nome}${d.editora ? `, da ${d.editora}` : ""}${d.versao ? `, versão ${d.versao}` : ""}, pelo ${d.fonte === "msstore" ? "Microsoft Store" : "winget"}, aceitando os termos dele.`,
        executar: async () => instalarEmSegundoPlano(d),
      };
    },
  },
  {
    name: "atualizar_apps",
    description: "Vê quais programas instalados têm versão nova (winget) e, com o sim dele, atualiza todos.",
    parameters: obj({}, []),
    executar: async () => "Nenhum programa com atualização pelo winget.",
    confirmar: async () => {
      const lista = await atualizacoesDisponiveis().catch(() => []);
      if (!lista.length) return null;
      const nomes = lista.slice(0, 6).map(l => l.nome).join(", ");
      return {
        descricao: `Tem ${lista.length} ${lista.length === 1 ? "atualização" : "atualizações"}: ${nomes}${lista.length > 6 ? " e outros" : ""}. Vou atualizar tudo em segundo plano.`,
        executar: async () => atualizarTudoEmSegundoPlano(lista.length),
      };
    },
  },
  {
    // 13/10: o telefone da Ely (Bland AI) — ela liga para o celular dele, agora ou daqui a N minutos.
    name: "ligar_para_mim",
    description: "Liga para o celular do dono ('me liga', 'me liga daqui a 20 minutos e me lembra de X'). A Ely fala o recado na ligação.",
    parameters: obj({ mensagem: s("O recado para dar na ligação (vazio = só ligar)"), em_minutos: { type: "number", description: "Daqui a quantos minutos ligar (vazio = agora)" } }, []),
    executar: async (a) => {
      const min = Number(a.em_minutos);
      if (Number.isFinite(min) && min >= 1) return agendarLigacao(min, str(a, "mensagem"), (fala) => notify("ELYSIUM — Telefone", fala));
      return ligarParaDono(str(a, "mensagem"));
    },
  },
  {
    name: "abrir_site",
    description: "Abre um site ou faz uma busca no navegador. Aceita URL ou termo de busca.",
    parameters: obj({ url_ou_busca: s("URL completa ou o que buscar") }, ["url_ou_busca"]),
    executar: a => acao({ action: "open_url", url_or_query: str(a, "url_ou_busca") }),
    acao: a => ({ action: "open_url", url_or_query: str(a, "url_ou_busca") }),
  },
  {
    name: "tocar_musica",
    description: "Toca uma música, artista ou playlist no Spotify.",
    parameters: obj({ busca: s("Música, artista, álbum ou estilo") }, ["busca"]),
    executar: a => acao({ action: "play_music", query: str(a, "busca") }),
    acao: a => ({ action: "play_music", query: str(a, "busca") }),
  },
  {
    name: "midia",
    description: "Controla o que está tocando: pausar, continuar, próxima, anterior.",
    parameters: obj({ operacao: s("Operação", { enum: ["play", "pause", "skip", "previous"] }) }, ["operacao"]),
    executar: a => acao({ action: "media_control", operation: str(a, "operacao") as never }),
    acao: a => ({ action: "media_control", operation: str(a, "operacao") as never }),
  },
  {
    name: "volume",
    description: "Ajusta o volume do PC: um número de 0 a 100, ou up/down/mute/unmute.",
    parameters: obj({ nivel: s("0-100, ou up, down, mute, unmute") }, ["nivel"]),
    executar: a => acao({ action: "volume_control", level: nivelVolume(a) }),
    acao: a => ({ action: "volume_control", level: nivelVolume(a) }),
  },
  {
    name: "energia",
    description: "Bloqueia a tela, suspende, reinicia ou desliga o PC, ou cancela um desligamento agendado. Desligar e reiniciar dão 30 s para cancelar.",
    parameters: obj({ operacao: s("Operação", { enum: ["lock", "sleep", "restart", "shutdown", "cancel"] }), atraso_segundos: { type: "integer", description: "Só para shutdown/restart: daqui a quantos segundos" } }, ["operacao"]),
    executar: a => acao({ action: "power_control", operation: str(a, "operacao") as never, delay_seconds: num(a, "atraso_segundos") }),
    acao: a => ({ action: "power_control", operation: str(a, "operacao") as never, delay_seconds: num(a, "atraso_segundos") }),
  },
  {
    name: "modo_foco",
    // "Para o modo foco" é PARAR (o verbo), não "para" preposição — o 7B religava o foco.
    description: "Liga ou desliga o modo foco: por N minutos, abrir Discord, Steam, WhatsApp e afins vira aviso. comecar: 'modo foco', 'preciso me concentrar por 1 hora', 'foco por 30 minutos'. parar: 'para o foco', 'para o modo foco', 'desliga o foco', 'encerra o foco', 'chega de foco'. status: 'quanto falta do foco'.",
    parameters: obj({
      acao: s("comecar, parar ou status. Frase que começa com 'para o foco' ou 'desliga o foco' é parar", { enum: ["comecar", "parar", "status"] }),
      minutos: { type: "integer", description: "Duração ao começar; padrão 25" },
    }, ["acao"]),
    executar: async a => {
      const op = str(a, "acao");
      if (op === "parar") { pararFoco(); return "Modo foco desligado."; }
      if (op === "status") return focoFalado();
      const f = await comecarFoco({ minutos: num(a, "minutos") ?? 25 });
      return `Modo foco por ${f.minutos} minutos. Aviso se abrirem ${f.apps.slice(0, 3).join(", ")}${f.apps.length > 3 ? " e outros" : ""}.`;
    },
  },
  // Listas compartilhadas com o celular (bloco 135).
  {
    name: "adicionar_na_lista",
    description: "Põe um ou mais itens numa lista (compras, tarefas ou outra que o usuário nomear). Use para 'põe leite e ovo na lista do mercado', 'anota comprar presente nas tarefas'. Sem nome de lista, é Compras.",
    parameters: obj({ itens: { type: "array", items: { type: "string" }, description: "Cada item separado" }, lista: s("Nome da lista: compras, tarefas, ou outro") }, ["itens"]),
    executar: a => acao({ action: "list_add", items: arr(a, "itens"), list: normalizarNomeLista(str(a, "lista")) }),
    acao: a => ({ action: "list_add", items: arr(a, "itens"), list: normalizarNomeLista(str(a, "lista")) }),
  },
  {
    name: "ver_lista",
    description: "Lê uma lista (o que falta comprar, as tarefas). Sem nome, as listas mais recentes.",
    parameters: obj({ lista: s("Nome da lista, opcional") }),
    executar: a => acao({ action: "list_show", list: str(a, "lista") || undefined }),
  },
  // ── tarefas (fase 17): os lembretes como lista de afazeres ──
  {
    name: "ver_tarefas",
    description: "Lê a lista de tarefas (os lembretes pendentes e o que já foi feito hoje, com ressalvas). Use para 'o que tenho pra fazer', 'minhas tarefas', 'o que falta'.",
    parameters: obj({}),
    executar: async () => {
      const ts = listarTarefas();
      if (!ts.length) return "A lista de tarefas está vazia.";
      const quando = (ms?: number) => ms ? new Date(ms).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "sem data";
      return ts.map(t => t.feita ? `[feita] ${t.texto}${t.ressalva ? ` (ressalva: ${t.ressalva})` : ""}` : `[pendente] ${t.texto} — ${quando(t.prazo)}`).join("; ");
    },
  },
  {
    name: "concluir_tarefa",
    description: "Marca uma tarefa/lembrete como feito, com uma ressalva opcional ('terminei o relatório, mas faltou o gráfico'). Cancela os avisos que ainda não tocaram.",
    parameters: obj({ tarefa: s("Trecho do texto da tarefa"), ressalva: s("O que ficou de fora ou observação, se o usuário disse") }, ["tarefa"]),
    executar: async a => {
      const t = acharTarefa(listarTarefas(), str(a, "tarefa"));
      if (!t) return "Não achei essa tarefa na lista.";
      // Fase 20: a regra única — pela voz, a tarefa que repete agora cria a próxima também.
      const r = concluirTarefaCompleta(t.id, str(a, "ressalva") || undefined);
      return r ? falaDaConclusao(r) : "Não achei essa tarefa na lista.";
    },
  },
  // ── tarefas: mudar, adiar e anotar várias (fase 18) ──
  {
    name: "adiar_tarefa",
    description: "Adia uma tarefa da lista: 'adia a prova para amanhã', 'joga o relatório para semana que vem', 'me lembra disso daqui a uma hora'.",
    parameters: obj({ tarefa: s("Trecho do texto da tarefa"), para: { type: "string", enum: ["1h", "hoje16", "amanha", "semana"], description: "1h = daqui a uma hora; hoje16 = hoje às 16h; amanha; semana = daqui a 7 dias" } }, ["tarefa", "para"]),
    executar: async a => {
      const t = acharTarefa(listarTarefas(), str(a, "tarefa"));
      if (!t) return "Não achei essa tarefa na lista.";
      const para = (["1h", "hoje16", "amanha", "semana"].includes(str(a, "para")) ? str(a, "para") : "amanha") as Adiamento;
      const r = adiarTarefaPor(t.id, para);
      return r.ok ? `${t.texto}: ${r.mensagem}` : r.mensagem;
    },
  },
  {
    name: "editar_tarefa",
    description: "Muda o texto ou a data de uma tarefa que já está na lista ('muda a prova para dia 20', 'a reunião passou para as 15h'). Para criar uma nova, use criar_lembrete.",
    parameters: obj({ tarefa: s("Trecho do texto da tarefa"), novo_texto: s("Texto novo, se mudou"), quando: s("Data nova: AAAA-MM-DD sem hora, AAAA-MM-DDTHH:MM com hora") }, ["tarefa"]),
    executar: async a => {
      const t = acharTarefa(listarTarefas(), str(a, "tarefa"));
      if (!t) return "Não achei essa tarefa na lista.";
      const quando = str(a, "quando");
      const novoTexto = str(a, "novo_texto") || undefined;
      if (quando) {
        const r = reagendarTarefa(t.id, quando, /^\d{4}-\d{2}-\d{2}$/.test(quando), novoTexto);
        return r.ok ? `${r.tarefa?.texto ?? t.texto}: ${r.mensagem}` : r.mensagem;
      }
      if (!novoTexto) return "O que muda na tarefa? Diga o texto novo ou a data nova.";
      // Só o texto: a data e os avisos ficam como estavam.
      editarTarefa(t.id, { texto: novoTexto });
      return `Atualizei: ${novoTexto}.`;
    },
  },
  {
    name: "anotar_varias",
    description: "Anota VÁRIAS tarefas de uma vez, quando o usuário despeja uma lista: 'anota: comprar pão, ligar pro dentista sexta e prova de física dia 20'. Cada item com a data dita junto, se houver.",
    parameters: obj({ itens: { type: "array", items: { type: "string" }, description: "Cada tarefa, com o dia/hora falados junto (ex.: 'ligar pro dentista sexta')" } }, ["itens"]),
    executar: async a => {
      const itens = arr(a, "itens").slice(0, 15);
      if (!itens.length) return "Não entendi os itens.";
      const feitos: string[] = [];
      const falhas: string[] = [];
      for (const item of itens) {
        const i = interpretarTexto(item);
        if (i.quando) {
          const r = criarLembreteComTarefa(i.texto, i.quando, false, i.semHora, { usarPedido: false });
          if (r.ok) feitos.push(`${i.texto} (${r.mensagem.replace(/^Combinado[,:]?\s*/, "").replace(/\s*[—:].*$/, "")})`); else falhas.push(`${i.texto}: ${r.mensagem}`);
        } else {
          try { criarTarefa({ texto: i.texto }); feitos.push(i.texto); } catch { falhas.push(i.texto); }
        }
      }
      return `Anotei ${feitos.length}: ${feitos.join("; ")}.${falhas.length ? ` Não deu: ${falhas.join("; ")}.` : ""}`;
    },
  },
  // ── hábitos, metas e o painel do dia (fase 16) ──
  {
    name: "ver_habitos",
    description: "Lê os hábitos de hoje (feito ou não, sequência 🔥) e as metas com o progresso. Use para 'como estão meus hábitos', 'o que falta hoje', 'quanto falta da meta'.",
    parameters: obj({}),
    executar: async () => {
      const hs = listarHabitos().map(h => resumirHabito(h));
      const ms = listarMetas();
      if (!hs.length && !ms.length) return "Nenhum hábito nem meta cadastrados ainda.";
      const linhas = hs.filter(h => h.valeHoje).map(h => `${h.nome}: ${h.feitoHoje ? "feito hoje" : "falta hoje"}, sequência de ${h.sequencia} dia(s)`);
      for (const m of ms) linhas.push(`Meta ${m.titulo}: já tem ${m.progresso} de ${m.alvo}${m.unidade ? " " + m.unidade : ""}${m.concluidaEm ? " (concluída)" : `, faltam ${m.alvo - m.progresso}`}`);
      return linhas.join("; ") || "Nenhum hábito vale para hoje.";
    },
  },
  {
    name: "marcar_habito",
    description: "Marca um hábito como feito hoje (ou desmarca). Use para 'marquei academia', 'fiz a leitura', 'já meditei hoje'.",
    parameters: obj({ habito: s("Nome do hábito"), feito: { type: "boolean", description: "true = feito (padrão)" } }, ["habito"]),
    executar: async a => {
      return falaDoHabito(marcarHabitoPorNome(str(a, "habito"), a["feito"] !== false), str(a, "habito"));
    },
    acao: a => ({ action: "habit_mark", name: str(a, "habito") }),
  },
  {
    name: "avancar_meta",
    description: "Soma progresso a uma meta ('li mais um livro', 'guardei 200 na meta da viagem'). Número negativo desconta.",
    parameters: obj({ meta: s("Título da meta"), quanto: { type: "number", description: "Quanto somar (padrão 1)" } }, ["meta"]),
    executar: async a => {
      // O 7B às vezes manda número como texto ("200"); sem isto virava +1.
      const bruto = num(a, "quanto") ?? Number(String(a["quanto"] ?? "").replace(",", "."));
      return falaDaMeta(avancarMetaPorNome(str(a, "meta"), bruto), str(a, "meta"));
    },
  },
  {
    name: "treino_de_hoje",
    description: "O treino da academia de hoje (rotação A/B/C) com os exercícios, séries e cargas. Use para 'qual é o treino hoje', 'o que eu treino hoje', 'quais exercícios do treino B'.",
    parameters: obj({}),
    executar: async () => treinoDeHojeFalado(),
  },
  {
    name: "ver_meta_calorias",
    description: "A meta de calorias e macros de hoje (proteína, gordura, carboidrato), já somando a corrida. Use para 'quantas calorias eu como hoje', 'quanto de proteína', 'minha meta'.",
    parameters: obj({}),
    executar: async () => metaFalada(),
  },
  {
    name: "marcar_treino",
    description: "Marca o treino da academia de hoje como feito (o da vez na rotação, ou o citado). Use para 'treinei', 'fiz o treino B', 'terminei a academia'.",
    parameters: obj({ treino: s("Nome do treino, se citado (ex.: 'Treino B')") }),
    executar: async a => marcarTreinoFalado(str(a, "treino") || undefined),
    acao: a => ({ action: "workout_mark", name: str(a, "treino") || undefined }),
  },
  {
    name: "registrar_corrida",
    description: "Anota uma corrida/esteira feita hoje (minutos e, se dito, km) e avança o plano de corrida. Use para 'corri 20 minutos', 'fiz 3 km na esteira em 25 min'.",
    parameters: obj({ minutos: { type: "number", description: "Duração em minutos" }, km: { type: "number", description: "Distância em km, se dita" } }, ["minutos"]),
    executar: async a => {
      const minutos = num(a, "minutos") ?? Number(String(a["minutos"] ?? "").replace(",", "."));
      if (!Number.isFinite(minutos) || minutos <= 0) return "Preciso dos minutos da corrida.";
      const km = num(a, "km") ?? (a["km"] !== undefined ? Number(String(a["km"]).replace(",", ".")) : undefined);
      return registrarCorridaFalada(minutos, km && Number.isFinite(km) ? km : undefined);
    },
    acao: a => ({ action: "run_log", minutes: Number(a["minutos"]) || 0 }),
  },
  {
    name: "registrar_peso",
    description: "Anota o peso de hoje em kg (a meta de calorias se ajusta). Use para 'pesei 58 quilos', 'estou com 58,5 kg'.",
    parameters: obj({ kg: { type: "number", description: "Peso em kg" } }, ["kg"]),
    executar: async a => {
      const kg = num(a, "kg") ?? Number(String(a["kg"] ?? "").replace(",", "."));
      return Number.isFinite(kg) ? registrarPesoFalado(kg) : "Preciso do peso em quilos.";
    },
    acao: a => ({ action: "weight_log", kg: Number(a["kg"]) || 0 }),
  },
  {
    name: "revisao_da_semana",
    description: "A revisão da semana: tarefas concluídas e atrasadas, hábitos (quantos dias de cada), metas, academia e corrida. Use para 'como foi minha semana', 'faz a revisão da semana'.",
    parameters: obj({}),
    executar: async () => revisaoDaSemana().texto,
  },
  {
    name: "painel_do_dia",
    description: "O briefing de hoje: clima, lembretes, timers, listas pendentes, hábitos, metas, próxima rotina e alertas do PC. Use para 'como está meu dia', 'o que tenho hoje', 'me dá o status'.",
    parameters: obj({}),
    executar: async () => {
      const p = await montarPainelHoje();
      const partes = [p.frase];
      if (p.clima) partes.push(`Clima: ${p.clima.temperatura}° em ${p.clima.cidade}, ${p.clima.descricao}`);
      if (p.lembretes.length) partes.push(`Lembretes: ${p.lembretes.map(l => l.texto).join(", ")}`);
      if (p.habitos.length) partes.push(`Hábitos: ${p.habitos.map(h => `${h.nome} ${h.feitoHoje ? "feito" : "pendente"}`).join(", ")}`);
      if (p.proximaRotina) partes.push(`Próxima rotina: ${p.proximaRotina.nome}`);
      if (p.alertas.length) partes.push(`Alertas: ${p.alertas.map(x => x.titulo).join(", ")}`);
      return partes.join(". ");
    },
  },
  {
    name: "marcar_item",
    description: "Marca um item de lista como feito/comprado (ou desmarca). Use para 'já comprei o leite', 'tira o ovo da lista'.",
    parameters: obj({ item: s("O item"), lista: s("Nome da lista; padrão compras"), feito: { type: "boolean", description: "true = feito (padrão)" } }, ["item"]),
    executar: async a => {
      const i = marcarItem(str(a, "lista") || "compras", str(a, "item"), a["feito"] !== false);
      return i ? `Marquei ${i.texto} como ${i.feito ? "feito" : "pendente"}.` : "Não achei esse item na lista.";
    },
  },
  {
    name: "limpar_feitos",
    description: "Tira da lista os itens já marcados como feitos.",
    parameters: obj({ lista: s("Nome da lista; padrão compras") }),
    executar: async a => { const n = limparFeitos(str(a, "lista") || "compras"); return n ? `Tirei ${n} ${n === 1 ? "item feito" : "itens feitos"} da lista.` : "Não havia nada marcado como feito."; },
  },
  // Conta exata, comandos de IA e "resume este link" (blocos 137/138).
  {
    name: "calcular",
    description: "Faz uma conta exata: + − × ÷, potência, raiz, porcentagem ('15% de 230', '200 mais 10%'). Use SEMPRE para conta, em vez de calcular de cabeça.",
    parameters: obj({ expressao: s("A conta, ex.: '15% de 230', '(12+3)*4'") }, ["expressao"]),
    executar: async a => {
      const e = str(a, "expressao");
      const v = calcular(e);
      return v === null ? "Essa expressão não é uma conta que eu consiga fazer." : `${e} = ${formatarNumero(v)}`;
    },
  },
  // Estudo (fase 20): o fastRoute pega as frases fechadas; estas cobrem o resto.
  {
    name: "plano_de_estudo",
    description: "Monta um plano de estudo para uma prova: divide os assuntos em sessões até a véspera (revisão na véspera) e cria as tarefas com aviso. Use para 'me ajuda a estudar pra prova de X', 'organiza meu estudo de X até sexta'. Pede confirmação antes de gravar.",
    parameters: obj({
      materia: s("A matéria da prova, ex.: 'física'"),
      dia: s("Dia da prova em AAAA-MM-DD, se ele disse; vazio = procura nas tarefas"),
      hora: s("Horário das sessões em HH:MM (padrão 19:00)"),
      assuntos: { type: "array", items: { type: "string" }, description: "Os assuntos, se ele disse" },
    }, ["materia"]),
    executar: async a => (await montarPlano(argsDoPlano(a))).resumo,
    confirmar: async (a) => {
      const p = await montarPlano(argsDoPlano(a));
      if (!p.itens.length) return null;
      return { descricao: `Vou criar ${p.resumo.charAt(0).toLowerCase()}${p.resumo.slice(1)}`, executar: async () => aplicarDespejo(p.itens).mensagem };
    },
  },
  {
    name: "pomodoro",
    description: "Pomodoro: blocos de foco com pausa (padrão 25+5, 4 ciclos), com o modo foco ligado nos blocos. Use para 'quero focar 50 minutos com pausa de 10', 'começa um pomodoro', 'para o pomodoro', 'quanto falta do pomodoro', 'pula a pausa'.",
    parameters: obj({
      operacao: s("start, stop, status ou skip", { enum: ["start", "stop", "status", "skip"] }),
      foco: { type: "integer", description: "Minutos de foco por bloco" },
      pausa: { type: "integer", description: "Minutos de pausa" },
      ciclos: { type: "integer", description: "Quantos blocos de foco" },
    }, ["operacao"]),
    executar: async a => {
      const op = str(a, "operacao");
      if (op === "stop") { const e = estadoPomodoro(); pararPomodoro(); return e.ativo ? "Pomodoro encerrado." : "Nenhum pomodoro rodando."; }
      if (op === "status") return falaDoEstado(estadoPomodoro());
      if (op === "skip") { if (!estadoPomodoro().ativo) return "Nenhum pomodoro rodando."; const e = await pularFase(); return e.ativo ? falaDaFase(e) : "Era a última fase: pomodoro concluído."; }
      const e = await comecarPomodoro({ foco: num(a, "foco"), pausa: num(a, "pausa"), ciclos: num(a, "ciclos") });
      return `Pomodoro: ${e.config.ciclos} ciclos de ${e.config.foco} minutos com ${e.config.pausa} de pausa, começando agora.`;
    },
  },
  {
    name: "guardar_cartao",
    description: "Guarda um cartão de revisão (pergunta e resposta) para a repetição espaçada — volta amanhã e depois em 3, 7, 14 e 30 dias. Use para 'quero revisar isso depois', 'cria um cartão sobre X'.",
    parameters: obj({ frente: s("A pergunta"), verso: s("A resposta") }, ["frente", "verso"]),
    executar: async a => { const c = criarCartao(str(a, "frente"), str(a, "verso"), "manual"); return c ? `Guardei o cartão: ${c.frente}. Volta amanhã na revisão.` : "Faltou a pergunta ou a resposta."; },
  },
  {
    name: "nota_necessaria",
    description: "Quanto ele precisa tirar na(s) próxima(s) prova(s) para fechar a média escolar, com pesos. Use para 'quanto preciso tirar', 'que nota preciso pra passar'. Conta exata — nunca de cabeça.",
    parameters: obj({
      notas: { type: "array", items: { type: "number" }, description: "As notas que ele já tirou" },
      pesos: { type: "array", items: { type: "number" }, description: "O peso de cada nota, na mesma ordem (vazio = todos 1)" },
      media: { type: "number", description: "A média para passar" },
      peso_faltante: { type: "number", description: "O peso da prova que falta (padrão 1)" },
      faltam: { type: "integer", description: "Quantas provas faltam (padrão 1)" },
    }, ["notas", "media"]),
    executar: async a => {
      const nums = (k: string) => (Array.isArray(a[k]) ? (a[k] as unknown[]).map(Number).filter(Number.isFinite) : []);
      const e = { notas: nums("notas"), pesos: nums("pesos"), media: Number(a["media"]), pesoFaltante: Number(a["peso_faltante"]) || undefined, faltam: Number(a["faltam"]) || undefined };
      if (!e.notas.length) return "Faltaram as notas que ele já tirou.";
      const r = notaNecessaria(e);
      return r ? falaDaNota(r, e) : "Faltou a média para passar.";
    },
  },
  {
    name: "hora_em",
    description: "Que horas são em outra cidade ou país (Tóquio, Nova York, Londres…). Use para 'que horas são em X', 'qual o horário no Japão'. NÃO é o clima.",
    parameters: obj({ cidade: s("A cidade ou o país") }, ["cidade"]),
    executar: async a => horaEm(str(a, "cidade")) ?? `Não sei o fuso de ${str(a, "cidade")}.`,
  },
  {
    name: "comando_de_ia",
    description: "Transforma um texto com um comando: corrigir português, traduzir para inglês, traduzir para português, resumir, deixar mais formal, deixar mais curto, explicar (ou um comando criado pelo usuário). Sem 'texto', usa o que está copiado. O resultado vai para a área de transferência. Use para 'corrige o texto que eu copiei', 'traduz isso pro inglês'.",
    parameters: obj({ comando: s("Qual comando: corrigir, ingles, portugues, resumir, formal, curto, explicar, ou o nome de um criado"), texto: s("O texto; vazio = o copiado") }, ["comando"]),
    executar: async a => {
      const texto = str(a, "texto") || clipboard.readText();
      if (!texto.trim()) return "Não tem texto copiado para transformar.";
      const { comando, resultado } = await rodarComando(str(a, "comando"), texto);
      clipboard.writeText(resultado);
      return `Pronto (${comando.nome}). O resultado está na área de transferência, é só colar:\n\n${resultado}`;
    },
  },
  {
    name: "resumir_link",
    description: "Lê uma página da web pelo endereço e resume. Use para 'resume esse link', 'do que fala essa matéria' com uma URL.",
    parameters: obj({ url: s("O endereço completo, com http(s)") }, ["url"]),
    executar: async a => {
      try { return await resumirLink(str(a, "url")); }
      catch (e) { return `Não consegui ler a página: ${e instanceof Error ? e.message : String(e)}`; }
    },
  },
  // Timers com nome (bloco 136).
  {
    name: "criar_timer",
    description: "Liga um timer (contagem regressiva) com nome opcional: 'timer de 10 minutos do miojo', 'cronômetro de meia hora'. Para hora marcada ou dia, use criar_lembrete.",
    parameters: obj({ minutos: { type: "number", description: "Duração em minutos (pode ter fração: 0.5 = 30 s)" }, nome: s("Para quê, opcional: miojo, forno, chá") }, ["minutos"]),
    executar: a => acao({ action: "timer_start", ms: Math.round((num(a, "minutos") ?? 0) * 60_000), name: str(a, "nome") || undefined }),
    acao: a => ({ action: "timer_start", ms: Math.round((num(a, "minutos") ?? 0) * 60_000), name: str(a, "nome") || undefined }),
  },
  {
    name: "ver_timers",
    description: "Quanto falta em cada timer correndo.",
    parameters: obj({}),
    executar: () => acao({ action: "timer_list" }),
  },
  {
    name: "cancelar_timer",
    description: "Cancela um timer (pelo nome; sem nome, o único que existir).",
    parameters: obj({ nome: s("Nome do timer, opcional") }),
    executar: a => acao({ action: "timer_cancel", name: str(a, "nome") || undefined }),
    acao: a => ({ action: "timer_cancel", name: str(a, "nome") || undefined }),
  },
  {
    name: "tirar_print",
    description: "Tira um print da tela e salva na Área de Trabalho.",
    parameters: obj({}),
    executar: () => acao({ action: "screenshot" }),
    acao: () => ({ action: "screenshot" }),
  },
  {
    name: "olhar_a_tela",
    description: "Olha a tela do PC agora e responde uma pergunta sobre o que está nela (erro, texto, imagem).",
    parameters: obj({ pergunta: s("O que o usuário quer saber sobre a tela") }, ["pergunta"]),
    executar: a => acao({ action: "look_at_screen", question: str(a, "pergunta") }),
    acao: a => ({ action: "look_at_screen", question: str(a, "pergunta") }),
  },
  {
    name: "buscar_na_web",
    description: "Pesquisa na internet e resume. Use para notícias, preços, fatos recentes que você não sabe.",
    parameters: obj({ busca: s("O que pesquisar") }, ["busca"]),
    executar: a => acao({ action: "web_search", query: str(a, "busca") }),
    acao: a => ({ action: "web_search", query: str(a, "busca") }),
  },
  {
    name: "criar_lembrete",
    description: "Cria um lembrete (vira também item da lista de tarefas). Use SEMPRE que o usuário mencionar algo futuro com data para não esquecer — 'tenho prova sexta', 'consulta dia 12', 'entregar o relatório amanhã' — mesmo sem ele dizer 'me lembra'. Para 'daqui a N minutos' use em_minutos; com dia, use quando. Sem hora dita, mande só a data (AAAA-MM-DD): o PC põe 16h e, para prova/consulta/viagem, avisa também na véspera.",
    parameters: obj({
      texto: s("O que lembrar, curto (ex.: 'prova de cálculo')"),
      em_minutos: { type: "integer", description: "Daqui a quantos minutos (2 h = 120). Prefira isto a calcular a hora." },
      quando: s("Data local: AAAA-MM-DD sem hora dita, ou AAAA-MM-DDTHH:MM com hora"),
      semanal: { type: "boolean", description: "Repetir toda semana" },
    }, ["texto"]),
    executar: a => acao({ action: "create_reminder", text: str(a, "texto"), due_at: quandoDoLembrete(a), weekly: a.semanal === true, sem_hora: semHoraDita(a) }),
    acao: a => ({ action: "create_reminder", text: str(a, "texto"), due_at: quandoDoLembrete(a), weekly: a.semanal === true, sem_hora: semHoraDita(a) }),
  },
  {
    name: "cancelar_lembrete",
    description: "Cancela um lembrete pelo texto (ou parte dele).",
    parameters: obj({ texto: s("Trecho do lembrete") }, ["texto"]),
    executar: a => acao({ action: "cancel_reminder", query: str(a, "texto") }),
    acao: a => ({ action: "cancel_reminder", query: str(a, "texto") }),
  },
  {
    name: "lembrar_fato",
    description: "Guarda um fato sobre o usuário para sempre ('lembre que meu carro é um Civic').",
    parameters: obj({ fato: s("O fato, em uma frase") }, ["fato"]),
    executar: a => acao({ action: "remember", fact: str(a, "fato") }),
    acao: a => ({ action: "remember", fact: str(a, "fato") }),
  },
  {
    name: "esquecer_fato",
    description: "Apaga um fato guardado, pelo texto.",
    parameters: obj({ texto: s("Trecho do fato") }, ["texto"]),
    executar: a => acao({ action: "forget", query: str(a, "texto") }),
    acao: a => ({ action: "forget", query: str(a, "texto") }),
    // O trecho casa por substring: "esquece o carro" podia apagar o fato errado sem ninguém ver.
    confirmar: async (a) => {
      const q = str(a, "texto").toLowerCase();
      const f = q ? listFacts().find(x => x.text.toLowerCase().includes(q) || q.includes(x.text.toLowerCase())) : undefined;
      if (!f) return null;
      return { descricao: `Vou esquecer: "${f.text}".`, executar: async () => (removeFactById(f.id) ? "Esquecido." : "Esse fato já não estava mais lá.") };
    },
  },
  {
    name: "rodar_preset",
    description: "Roda um preset (modo) pelo nome, ex.: 'modo trabalho'.",
    parameters: obj({ nome: s("Nome do preset") }, ["nome"]),
    executar: a => acao({ action: "run_preset", preset_name: str(a, "nome") }),
    acao: a => ({ action: "run_preset", preset_name: str(a, "nome") }),
  },
  {
    name: "criar_rotina",
    description: "Cria uma rotina: um pedido que o ELYSIUM executa sozinho numa hora, em certos dias, e entrega no PC e/ou no celular. Ex.: 'todo dia às 7h me manda o clima'.",
    parameters: obj({
      nome: s("Nome curto"),
      texto: s("O pedido, como o usuário falaria (ex.: 'como está o tempo hoje')"),
      hora: s("HH:MM"),
      dias: { type: "array", items: { type: "integer" }, description: "0=domingo … 6=sábado; vazio = todos os dias" },
      celular: { type: "boolean", description: "Entregar também no celular" },
      falar: { type: "boolean", description: "Falar a resposta no PC" },
    }, ["nome", "texto", "hora"]),
    executar: async (a) => {
      const r = salvarRotina({
        nome: str(a, "nome"), texto: str(a, "texto"), hora: str(a, "hora"),
        dias: Array.isArray(a.dias) ? (a.dias as unknown[]).map(Number) : [],
        entregar: a.celular === false ? ["pc"] : ["pc", "celular"],
        falar: a.falar === true,
      });
      const p = proximoDisparo(r);
      return `Rotina "${r.nome}" criada para as ${r.hora}${p ? `, primeira vez ${new Date(p).toLocaleString("pt-BR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}` : ""}.`;
    },
  },
  {
    name: "apagar_rotina",
    description: "Apaga uma rotina pelo nome.",
    parameters: obj({ nome: s("Nome (ou parte) da rotina") }, ["nome"]),
    executar: async (a) => {
      const r = acharRotina(str(a, "nome"));
      if (!r) return `Não achei rotina com "${str(a, "nome")}".`;
      apagarRotina(r.id);
      return `Rotina "${r.nome}" apagada.`;
    },
    confirmar: async (a) => {
      const r = acharRotina(str(a, "nome"));
      if (!r) return null;
      return { descricao: `Vou apagar a rotina "${r.nome}".`, executar: async () => { apagarRotina(r.id); return `Rotina "${r.nome}" apagada.`; } };
    },
  },
  {
    name: "pausar_rotina",
    description: "Pausa ou reativa uma rotina pelo nome, sem apagar.",
    parameters: obj({ nome: s("Nome (ou parte) da rotina"), ativa: { type: "boolean", description: "true = ativar, false = pausar" } }, ["nome", "ativa"]),
    executar: async (a) => {
      const r = acharRotina(str(a, "nome"));
      if (!r) return `Não achei rotina com "${str(a, "nome")}".`;
      const x = alternarRotina(r.id, a.ativa === true);
      return `Rotina "${r.nome}" ${x?.ativa ? "ativada" : "pausada"}.`;
    },
  },
  {
    name: "rodar_rotina",
    description: "Executa uma rotina agora, fora da hora, e devolve o resultado dela.",
    parameters: obj({ nome: s("Nome (ou parte) da rotina") }, ["nome"]),
    executar: async (a) => {
      const r = acharRotina(str(a, "nome"));
      if (!r) return `Não achei rotina com "${str(a, "nome")}".`;
      return await executarRotina(r.id);
    },
  },
  {
    name: "mandar_para_o_celular",
    description: "Manda um texto ou link para o celular do usuário (aparece na Caixa do app).",
    parameters: obj({ conteudo: s("Texto ou link") }, ["conteudo"]),
    executar: a => acao({ action: "send_to_mobile", content: str(a, "conteudo") }),
    acao: a => ({ action: "send_to_mobile", content: str(a, "conteudo") }),
  },
  {
    name: "escrever_texto",
    description: "Escreve um texto pedido (e-mail, mensagem, lista) e digita/cola onde o usuário está.",
    parameters: obj({ conteudo: s("O texto completo"), descricao: s("O que é") }, ["conteudo", "descricao"]),
    executar: a => acao({ action: "write_text", content: str(a, "conteudo"), description: str(a, "descricao") }),
    acao: a => ({ action: "write_text", content: str(a, "conteudo"), description: str(a, "descricao") }),
  },
  {
    name: "criar_arquivo",
    description: "Salva um arquivo de texto na Área de Trabalho.",
    parameters: obj({ nome: s("nome.txt"), conteudo: s("Conteúdo"), descricao: s("O que é") }, ["nome", "conteudo", "descricao"]),
    executar: a => acao({ action: "create_file", filename: str(a, "nome"), content: str(a, "conteudo"), description: str(a, "descricao") }),
    acao: a => ({ action: "create_file", filename: str(a, "nome"), content: str(a, "conteudo"), description: str(a, "descricao") }),
  },
];

/** Rotina por nome, tolerante: caixa, acento e parte do nome. */
/**
 * O que "fecha tudo menos X" fecharia: os programas com janela, tirando o que ele quer manter
 * e o que é do próprio Windows ou do ELYSIUM (fechar o Explorer some com a barra de tarefas).
 * Um item por processo. Pura, para teste.
 */
const NUNCA_FECHAR = new Set(["explorer", "electron", "elysium", "applicationframehost", "systemsettings", "textinputhost", "shellexperiencehost", "startmenuexperiencehost", "searchhost", "searchapp", "lockapp", "widgets", "gamebar", "nvidia overlay", "rtkuwp"]);
export function programasParaFechar(abertos: { processo: string; titulo?: string; hwnd: string }[], manter: string[]): { processo: string; rotulo: string; hwnds: string[] }[] {
  const semAc = (x: string) => semAcento(x).replace(/\s+/g, "");
  const alvosManter = manter.flatMap(m => [semAc(m), ...deriveProcessNames(m).map(semAc)]).filter(Boolean);
  const porProcesso = new Map<string, { processo: string; rotulo: string; hwnds: string[] }>();
  for (const a of abertos) {
    const proc = semAc(a.processo);
    if (!proc || NUNCA_FECHAR.has(a.processo.toLowerCase())) continue;
    const titulo = semAc(a.titulo ?? "");
    if (alvosManter.some(m => proc === m || proc.includes(m) || m.includes(proc) || (m.length >= 4 && titulo.includes(m)))) continue;
    const item = porProcesso.get(proc);
    if (item) item.hwnds.push(a.hwnd);
    else porProcesso.set(proc, { processo: a.processo, rotulo: a.processo, hwnds: [a.hwnd] });
  }
  return [...porProcesso.values()];
}

function acharRotina(nome: string) {
  const alvo = semAcento(nome);
  if (!alvo) return undefined;
  const todas = listarRotinas();
  const norm = (x: string) => semAcento(x);
  return todas.find(r => norm(r.nome) === alvo) ?? todas.find(r => norm(r.nome).includes(alvo));
}

/**
 * "Daqui a 20 minutos" é conta que o 8B erra (devolveu a hora de agora). Com `em_minutos`
 * a conta é do PC; `quando` fica para hora dita pelo usuário.
 */
/** Só data, sem hora (AAAA-MM-DD): o planejador põe as 16h. em_minutos sempre tem hora. */
function semHoraDita(a: Record<string, unknown>): boolean {
  if (num(a, "em_minutos")) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(str(a, "quando"));
}

function quandoDoLembrete(a: Record<string, unknown>): string {
  const min = num(a, "em_minutos");
  if (min !== undefined && min > 0) {
    const d = new Date(Date.now() + min * 60_000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
  }
  return str(a, "quando");
}

function nivelVolume(a: Record<string, unknown>): number | "up" | "down" | "mute" | "unmute" {
  const v = a.nivel;
  if (typeof v === "number") return Math.max(0, Math.min(100, Math.round(v)));
  const t = String(v ?? "").trim().toLowerCase();
  if (/^\d+$/.test(t)) return Math.max(0, Math.min(100, Number(t)));
  if (t === "up" || t === "down" || t === "mute" || t === "unmute") return t;
  return "up";
}

const porNome = new Map(FERRAMENTAS.map(f => [f.name, f]));

/** As definições, sem o `executar` — é o que vai para o modelo. */
export function definicoesDeFerramentas(): DefinicaoDeFerramenta[] {
  return FERRAMENTAS.map(({ name, description, parameters }) => ({ name, description, parameters }));
}

export function ferramenta(nome: string): Ferramenta | undefined {
  return porNome.get(nome);
}

/**
 * Argumentos como o esquema pede.
 *
 * O llama3.1:8b pelo Ollama manda TUDO como string: `"celular":"true"`, `"dias":"[1, 2, 3]"`,
 * `"atraso_segundos":"30"`. Sem isto, `Array.isArray("[1,2,3]")` é falso e a rotina de
 * dias úteis nasce "todos os dias" — foi o que aconteceu no primeiro teste do bloco 78.
 */
export function normalizarArgs(nome: string, args: Record<string, unknown>): Record<string, unknown> {
  const f = porNome.get(nome);
  const props = (f?.parameters as { properties?: Record<string, { type?: string }> } | undefined)?.properties ?? {};
  const saida: Record<string, unknown> = { ...args };
  for (const [k, def] of Object.entries(props)) {
    const v = saida[k];
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (def.type === "boolean") saida[k] = /^(true|sim|yes|1)$/i.test(t);
    else if (def.type === "integer" || def.type === "number") { const n = Number(t); if (Number.isFinite(n)) saida[k] = n; }
    else if (def.type === "array") { try { const j = JSON.parse(t); if (Array.isArray(j)) saida[k] = j; } catch { saida[k] = t.split(/[\s,;]+/).filter(Boolean); } }
  }
  return saida;
}

/** Executa pelo nome. Erro vira texto: o modelo precisa saber que falhou, não a chamada morrer. */
export async function executarFerramenta(nome: string, args: Record<string, unknown>): Promise<string> {
  const f = porNome.get(nome);
  if (!f) return `Ferramenta desconhecida: ${nome}.`;
  try {
    return (await f.executar(normalizarArgs(nome, args ?? {}))).trim() || "Feito.";
  } catch (e) {
    return `Não consegui (${nome}): ${e instanceof Error ? e.message : String(e)}`;
  }
}
