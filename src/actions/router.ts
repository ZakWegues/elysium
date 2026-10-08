import { BrainAction } from "../services/brain";
import { getAllPresets, findPresetKey, deletePresetByKey } from "../services/presetsStore";
import { openUrl } from "./openUrl";
import { openApp } from "./openApp";
import { closeApp } from "./closeApp";
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
import { cancelarTimer, criarTimer, duracaoFalada, timersFalados } from "../services/timers";
import { calcular, formatarNumero } from "../services/calculadora";
import { horaEm } from "../services/horaMundo";

/** "a, b e c" — para a voz não ler a lista como enumeração de vírgulas. */
function emFrase(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

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
      const h = acharHabito(listarHabitos(), action.name);
      if (!h) return `Não achei o hábito ${action.name}.`;
      const novo = marcarHabito(h.id, true);
      const seq = novo ? resumirHabito(novo).sequencia : 0;
      return `${h.nome} marcado. Sequência de ${seq} dia${seq === 1 ? "" : "s"}.`;
    }
    case "goal_add": {
      const metas = listarMetas();
      const achada = acharHabito(metas.map(m => ({ ...m, nome: m.titulo })), action.name);
      if (!achada) return `Não achei a meta ${action.name}.`;
      const m = avancarMeta(achada.id, action.delta);
      if (!m) return "Não consegui atualizar a meta.";
      return m.concluidaEm ? `Meta ${m.titulo} concluída: ${m.progresso} de ${m.alvo}.` : `Meta ${m.titulo}: ${m.progresso} de ${m.alvo}${m.unidade ? " " + m.unidade : ""}.`;
    }
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
