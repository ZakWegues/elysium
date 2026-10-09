import { BrainAction } from "../services/brain";
import { getAllPresets, findPresetKey, deletePresetByKey } from "../services/presetsStore";
import { openUrl } from "./openUrl";
import { openApp } from "./openApp";
import { closeApp, closeAppIfOpen } from "./closeApp";
import { getRunningApps } from "./systemInfo";
import * as spotifyApi from "../services/spotify";
import { volumeControl } from "./volumeControl";
import { playMusic } from "./playMusic";
import { writeText } from "./writeText";
import { createFile } from "./createFile";
import { clipboardRead } from "./clipboardAction";
import { screenshot } from "./screenshot";
import { systemInfo } from "./systemInfo";
import { runPreset } from "./runPreset";
import { smartMediaControl } from "./spotifyControl";
import { windowManagement } from "./windowManagement";
import { createPreset } from "./createPreset";
import { sendToMobile } from "./sendToMobile";
import { powerControl } from "./powerControl";
import {
  remember, forget, listMemory,
  createReminderAction, listRemindersAction, cancelReminderAction,
} from "./memoryActions";
import { searchWeb } from "../services/webSearch";
import { askAboutScreen } from "../services/vision";
import { climaFalado } from "../services/clima";
import { comecarFoco, focoFalado, pararFoco } from "../services/foco";
import { resumoDoDia } from "../services/resumoDoDia";
import { adicionarNaLista, listaFalada, listarListas, obterLista } from "../services/listas";
import { inputHost } from "../services/inputHost";
import { acharHabito, avancarMeta, listarHabitos, listarMetas, marcarHabito, resumirHabito } from "../services/habitos";
import { marcarTreinoFalado, registrarCorridaFalada, registrarPesoFalado } from "../services/corpoFalado";
import { cancelarTimer, criarTimer, duracaoFalada, timersFalados } from "../services/timers";
import { calcular, formatarNumero } from "../services/calculadora";
import { horaEm } from "../services/horaMundo";
import { definirAnonimo } from "../services/episodios";
import { avancarMetaPorNome, falaDaMeta, falaDoHabito, marcarHabitoPorNome } from "../services/operacoes";
import { fazerComIsso } from "../services/isso";
import { aplicarDespejo, descreverDespejo, interpretarFala } from "../services/despejo";
import { pedirConfirmacao } from "../services/confirmacao";

// "a, b e c" — para a voz não ler a lista como enumeração de vírgulas (texto.ts, fase 20).
import { emFrase } from "../services/texto";
import { definirModo, listarModos, modoAtivo, salvarModoMeu } from "../services/modos";
import { cartoesVencidos, comecarRevisao, criarCartao, listarCartoes } from "../services/cartoes";
import { montarPlano } from "../services/planoEstudo";
import { comecarPomodoro, estadoPomodoro, falaDaFase, falaDoEstado, pararPomodoro, pularFase } from "../services/pomodoro";

export async function routeAction(action: BrainAction): Promise<string> {
  switch (action.action) {
    case "play_music":        return playMusic(action.query);
    case "open_url":          return openUrl(action.url_or_query);
    case "open_app":          return openApp(action.app_name);
    case "close_app":         return closeApp(action.app_name);
    case "volume_control":    return volumeControl(action.level);
    case "media_control":     return smartMediaControl(action.operation);
    case "window_management": return windowManagement(action.target_app, action.operation);
    case "write_text":        return writeText(action.content, action.description);
    case "create_file":       return createFile(action.filename, action.content, action.description);
    case "clipboard_read":    return clipboardRead(action.instruction);
    case "screenshot":        return screenshot(action.filename);
    case "system_info":       return systemInfo(action.query);
    case "weather":           return climaFalado();
    case "daily_summary":     return resumoDoDia();
    case "habit_mark": {
      // "marquei academia" (fase 16): marca hoje e devolve a sequência.
      return falaDoHabito(marcarHabitoPorNome(action.name, true), action.name);
    }
    case "goal_add": {
      return falaDaMeta(avancarMetaPorNome(action.name, action.delta), action.name);
    }
    case "close_if_open":     return closeAppIfOpen(action.app_name, await getRunningApps());
    case "pause_if_playing": {
      // Só com o Spotify dá para SABER se algo toca; a tecla de mídia sozinha é liga/desliga e
      // daria play numa música parada — o contrário do pedido.
      if (!spotifyApi.isConnected()) return "Sem o Spotify conectado não consigo ver se algo está tocando.";
      const agora = await spotifyApi.getNowPlaying().catch(() => null);
      if (!agora?.isPlaying) return "Nada tocando agora.";
      return smartMediaControl("pause");
    }
    case "workout_mark":      return marcarTreinoFalado(action.name);
    case "run_log":           return registrarCorridaFalada(action.minutes, action.km);
    case "weight_log":        return registrarPesoFalado(action.kg);
    case "type_text":
      // Ditado (02/10): digita na janela em foco, como o celular faz pelo `input.type`.
      await inputHost.type(action.text);
      return "Pronto.";
    case "list_add": {
      const r = adicionarNaLista(action.list, action.items);
      if (action.list === "Notas" && r.adicionados.length) return "Anotei.";
      if (!r.adicionados.length) return `${emFrase(r.repetidos)} já ${r.repetidos.length > 1 ? "estão" : "está"} na lista ${r.lista.nome}.`;
      return `Pus ${emFrase(r.adicionados)} na lista ${r.lista.nome}${r.repetidos.length ? ` (${emFrase(r.repetidos)} já estava)` : ""}.`;
    }
    case "list_show": {
      if (action.list) { const l = obterLista(action.list); return l ? listaFalada(l) : `Não tenho uma lista ${action.list}.`; }
      const todas = listarListas();
      if (!todas.length) return "Você ainda não tem nenhuma lista.";
      return todas.slice(0, 3).map(listaFalada).join(" ");
    }
    case "timer_start": {
      const t = criarTimer(action.ms, action.name ?? "");
      return `Timer${t.nome ? ` do ${t.nome}` : ""} de ${duracaoFalada(t.duracaoMs)}, valendo.`;
    }
    case "timer_list":        return timersFalados();
    case "world_time":        return horaEm(action.city) ?? `Não sei o fuso de ${action.city}.`;
    case "calculate": {
      const v = calcular(action.expression);
      return v === null ? "Não consegui fazer essa conta." : `Dá ${formatarNumero(v)}.`;
    }
    case "timer_cancel": {
      const t = cancelarTimer(action.name);
      return t ? `Cancelei o timer${t.nome ? ` do ${t.nome}` : ""}.` : "Não achei esse timer.";
    }
    case "focus": {
      if (action.operation === "stop") { pararFoco(); return "Modo foco desligado."; }
      if (action.operation === "status") return focoFalado();
      const f = await comecarFoco({ minutos: action.minutes ?? 25 });
      return `Modo foco por ${f.minutos} minutos.`;
    }
    case "about_this":        return fazerComIsso(action.comando);
    case "brain_dump": {
      // Nada é gravado antes do "sim": a separação vira pergunta (confirmacao.ts).
      const itens = await interpretarFala(action.texto);
      if (!itens.length) return "Não consegui separar nada nisso. Pode falar de novo, uma coisa de cada vez?";
      return pedirConfirmacao(`Entendi ${descreverDespejo(itens)}.`, async () => aplicarDespejo(itens).mensagem);
    }
    case "mode":              return falaDoModo(action);
    case "cards":             return falaDosCartoes(action);
    case "pomodoro":          return falaDoPomodoro(action);
    case "study_plan": {
      // Nada é gravado antes do "sim" (mesma regra do despejo).
      const p = await montarPlano({ materia: action.materia, assuntos: action.assuntos ?? [], dia: action.dia, hora: action.hora });
      if (!p.itens.length) return p.resumo;
      const assuntos = p.itens.filter(i => /: /.test(i.texto)).map(i => i.texto.replace(/^[^:]*: /, ""));
      return pedirConfirmacao(`Montei ${p.resumo.charAt(0).toLowerCase()}${p.resumo.slice(1)}${assuntos.length ? ` Assuntos: ${emFrase(assuntos)}.` : ""}`, async () => aplicarDespejo(p.itens).mensagem);
    }
    case "anon_mode":
      definirAnonimo(action.ligar);
      return action.ligar
        ? "Modo anônimo ligado. Não vou transformar nada desta conversa em lembrança ou fato até você desligar."
        : "Modo anônimo desligado. Volto a lembrar das conversas.";
    case "run_preset":        return runPreset(action.preset_name);
    case "list_presets":      return listPresetsReply();
    case "delete_preset":     return deletePreset(action.preset_name);
    case "create_preset":     return createPreset(action.preset_name, action.description, action.icon, action.actions);
    case "send_to_mobile":    return sendToMobile(action.content, action.kind);
    case "power_control":     return powerControl(action.operation, action.delay_seconds);
    case "remember":          return remember(action.fact);
    case "forget":            return forget(action.query);
    case "list_memory":       return listMemory();
    case "create_reminder":   return createReminderAction(action.text, action.due_at, action.weekly, action.sem_hora);
    case "list_reminders":    return listRemindersAction();
    case "cancel_reminder":   return cancelReminderAction(action.query);
    case "web_search":        return searchWeb(action.query);
    case "look_at_screen":    return askAboutScreen(action.question);
    // Normalmente a conversa nem chega aqui: `command.ts` intercepta e chama o modelo
    // bom. Este caminho cobre quem invoca `routeAction` direto, como o `runPreset`.
    case "chat":              return action.reply ?? "";
    case "unknown":           return action.motivo ?? "Não entendi o que você pediu. Pode repetir?";
  }
}

function listPresetsReply(): string {
  const presets = getAllPresets();
  const keys = Object.keys(presets);
  if (keys.length === 0) return "Você não tem nenhum preset configurado ainda.";
  const list = keys.map(k => `${presets[k].icon ?? "⚡"} ${presets[k].description ?? k}`).join(", ");
  return `Seus presets: ${list}.`;
}

function deletePreset(presetName: string): string {
  const key = findPresetKey(presetName);
  if (!key) return `Preset "${presetName}" não encontrado.`;
  deletePresetByKey(key);
  return `Preset "${key}" removido.`;
}

/** "Modo matemática", "sai do modo", "cria um modo…" (fase 20). */
function falaDoModo(a: Extract<BrainAction, { action: "mode" }>): string {
  switch (a.operacao) {
    case "ligar": {
      const m = a.id ? definirModo(a.id) : null;
      if (!m) return "Não achei esse modo. Diga \"quais modos tem\" para ouvir a lista.";
      return `Modo ${m.nome} ligado: ${m.resumo} Para sair, diga "sai do modo".`;
    }
    case "desligar": {
      const antes = modoAtivo();
      definirModo(null);
      return antes ? `Saí do modo ${antes.nome}.` : "Nenhum modo estava ligado.";
    }
    case "status": {
      const m = modoAtivo();
      return m ? `Estamos no modo ${m.nome}: ${m.resumo}` : "Nenhum modo ligado — respondo do jeito de sempre.";
    }
    case "listar":
      return `Tenho os modos ${emFrase(listarModos().map(m => m.nome))}. É só dizer "modo" e o nome.`;
    case "criar": {
      const r = salvarModoMeu({ nome: a.nome ?? "", instrucao: a.instrucao ?? "" });
      if (typeof r === "string") {
        return {
          nome: "Faltou o nome do modo.",
          instrucao: "Diga o que o modo deve fazer, com um pouco mais de detalhe.",
          reservado: "Esse nome já é de outra coisa (foco, anônimo ou um preset seu). Escolha outro.",
          existe: "Já existe um modo com esse nome.",
          cheio: "Você já tem 12 modos seus. Apague um em Ajustes → Modos para criar outro.",
        }[r];
      }
      definirModo(r.id);
      return `Criei e liguei o modo ${r.nome}. Para sair, diga "sai do modo".`;
    }
  }
}

/** "Ely, revisão", "quantos cartões", "guarda pra revisar: X é Y" (fase 20). */
function falaDosCartoes(a: Extract<BrainAction, { action: "cards" }>): string {
  if (a.operacao === "revisar") return comecarRevisao();
  if (a.operacao === "status") {
    const hoje = cartoesVencidos().length;
    const total = listarCartoes().length;
    if (!total) return "Você ainda não tem cartões de revisão.";
    return hoje ? `${hoje} ${hoje === 1 ? "cartão" : "cartões"} para revisar hoje, de ${total}. Diga "revisão" para começar.` : `Nada para hoje; você tem ${total} ${total === 1 ? "cartão" : "cartões"} no total.`;
  }
  if (!a.frente || !a.verso) return "Diga no formato \"guarda pra revisar: pergunta é resposta\" — por exemplo, \"mitocôndria é a organela que produz energia\".";
  const c = criarCartao(a.frente, a.verso, "manual");
  return c ? `Guardei: ${c.frente}. Volta amanhã na revisão.` : "Não consegui guardar esse cartão.";
}

/** Pomodoro pela voz (fase 20). */
async function falaDoPomodoro(a: Extract<BrainAction, { action: "pomodoro" }>): Promise<string> {
  const atual = estadoPomodoro();
  if (a.operacao === "status") return falaDoEstado(atual);
  if (a.operacao === "stop") {
    if (!atual.ativo) return "Nenhum pomodoro rodando.";
    pararPomodoro();
    return "Pomodoro encerrado.";
  }
  if (a.operacao === "skip") {
    if (!atual.ativo) return "Nenhum pomodoro rodando.";
    const e = await pularFase();
    return e.ativo ? falaDaFase(e) : "Era a última fase: pomodoro concluído.";
  }
  // "Ely, pomodoro" com um já rodando é pergunta de status, não recomeço.
  if (atual.ativo && a.foco === undefined && a.pausa === undefined && a.ciclos === undefined) return falaDoEstado(atual);
  const e = await comecarPomodoro({ foco: a.foco, pausa: a.pausa, ciclos: a.ciclos });
  const c = e.config;
  return `Pomodoro: ${c.ciclos} ${c.ciclos === 1 ? "ciclo" : "ciclos"} de ${c.foco} minutos com ${c.pausa} de pausa. Modo foco ligado — começando agora.`;
}
