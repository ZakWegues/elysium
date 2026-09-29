import { app } from "electron";
import * as os from "node:os";
import { getApiKey, getConfig, getOverrides } from "../main/config";
import { mascarar, pastaDeLogs, ultimasLinhas } from "../main/logArquivo";
import { ollamaDisponivel } from "./llm";
import { modelosDaGroq } from "./catalogoGroq";
import { listarRotinas } from "./rotinas";
import { palavraDeAtivacaoLigada } from "./palavraAtivacao";
import { estadoAtualizacao } from "./atualizacao";

/**
 * "Copiar diagnóstico" (bloco 97): um texto só, pronto para colar numa conversa, com o que
 * as sessões de conserto sempre precisaram reconstruir — versão, quem decide (local ou
 * nuvem) e com qual modelo, se o Ollama responde, o que a Groq oferece hoje, e as últimas
 * linhas do log. Passa pelo mesmo `mascarar` do log: nada de chave nem token.
 */
export async function montarDiagnostico(): Promise<string> {
  const cfg = getConfig();
  const [ollama, groq] = await Promise.all([
    ollamaDisponivel(cfg.ollamaRouterModel).catch((e: unknown) => ({ erro: String(e) })),
    modelosDaGroq().catch((e: unknown) => [`(falhou: ${String(e)})`]),
  ]);
  const secoes: [string, string[]][] = [
    ["App", [
      `ELYSIUM ${app.getVersion()} · Electron ${process.versions.electron} · Node ${process.versions.node}`,
      `Windows ${os.release()} · ${os.cpus()[0]?.model ?? "?"} · ${Math.round(os.totalmem() / 1e9)} GB`,
      `Ligado há ${Math.round(os.uptime() / 3600)} h · app aberto há ${Math.round(process.uptime() / 60)} min`,
    ]],
    ["Cérebro", [
      `Roteador: ${cfg.routerProvider} (${cfg.routerProvider === "ollama" ? cfg.ollamaRouterModel : cfg.routerModel})`,
      `Conversa: ${cfg.chatProvider} (${cfg.chatProvider === "ollama" ? cfg.ollamaChatModel : cfg.brainModel})`,
      `Com ferramentas: ${cfg.cerebroFerramentas !== false ? "sim" : "não"} · contexto local ${cfg.ollamaNumCtx} · cai na Groq: ${cfg.fallbackToGroq ? "sim" : "não"}`,
      `Ollama: ${JSON.stringify(ollama)}`,
      `Groq: chave ${getApiKey() ? "presente" : "AUSENTE"} · visão ${cfg.visionModel} · busca ${cfg.searchModel} · catálogo: ${Array.isArray(groq) ? groq.join(", ") : "?"}`,
    ]],
    ["Atualização", (() => {
      const a = estadoAtualizacao();
      return [
        `Verificada ${a.verificadoEm ? new Date(a.verificadoEm).toLocaleString("pt-BR") : "nunca"}${a.erro ? ` · erro: ${a.erro}` : ""}${a.semToken ? " · sem token do GitHub" : ""}`,
        `PC: ${a.desktop ? `${a.desktop.versao} ${a.desktop.pronto ? "baixada" : `baixando ${Math.round(a.desktop.progresso * 100)}%`}` : "em dia"} · celular: ${a.celular ? `${a.celular.versao}${a.celular.pronto ? " guardado" : ""}` : "sem release"}`,
      ];
    })()],
    ["Voz", [
      `Voz ${cfg.voice} · atalho ${cfg.shortcut} · palavra de ativação ${palavraDeAtivacaoLigada() ? "ligada" : "desligada"}`,
    ]],
    ["Rotinas", listarRotinas().map(r => `${r.ativa ? "●" : "○"} ${r.nome} — ${r.gatilho?.tipo === "evento" ? r.gatilho.evento : r.hora}${r.condicao ? ` (só se ${r.condicao})` : ""}`)],
    ["Ajustes alterados", Object.keys(getOverrides()).sort().map(k => k)],
    [`Log (${pastaDeLogs() || "sem pasta"})`, ultimasLinhas(60)],
  ];
  const texto = [`ELYSIUM — diagnóstico de ${new Date().toLocaleString("pt-BR")}`, ""]
    .concat(...secoes.map(([t, l]) => [`## ${t}`, ...(l.length ? l : ["(nada)"]), ""]))
    .join("\n");
  return mascarar(texto);
}
