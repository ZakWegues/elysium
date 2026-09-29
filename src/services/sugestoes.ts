/**
 * As bolhas de sugestão da tela Início.
 *
 * O QUE É
 *
 * Quatro sugestões curtas, sorteadas entre as que fazem sentido AGORA, e trocadas toda
 * vez que a janela abre ou volta do minimizado. A ideia é a tela ter algo diferente para
 * dizer a cada vez que você olha, em vez de repetir o mesmo painel.
 *
 * DE ONDE VEM O DADO
 *
 * Nada aqui é inventado nem inferido por modelo: tudo sai de estado que o app já tem —
 * lembretes, telemetria, processos, área de transferência, presets, Spotify, tempo ligado
 * — mais o clima do `clima.ts`. Cada candidata carrega a ação que executa, e a ação é uma
 * chamada RPC direta.
 *
 * POR QUE NÃO PASSA PELO MODELO
 *
 * Mesmo argumento que criou o RPC (§9 do handoff): para um comando que já se sabe qual é,
 * montar uma frase em português e pedir para o Llama interpretá-la é mais lento e pode
 * errar. A bolha "Pular faixa" chama `spotify.command`, ponto.
 */

import * as os from "node:os";
import { clipboard } from "electron";
import { listAll } from "./scheduler";
import { getDashboardTelemetry, getTopProcesses } from "../actions/systemInfo";
import { getAllPresets } from "./presetsStore";
import { listSessions } from "./chatSessionsStore";
import { getConfig } from "../main/config";
import * as spotify from "./spotify";
import { climaAgora } from "./clima";

export interface Sugestao {
  texto: string;
  /** Nome de ícone do sprite do dashboard. */
  icone: string;
  /** Texto longo, mostrado no title. */
  detalhe?: string;
  /**
   * Peso do sorteio. Urgente ganha de curiosidade — um lembrete daqui a 10 minutos tem
   * que aparecer, "PC ligado há 3 dias" pode esperar a próxima abertura.
   */
  peso: number;
  acao?: {
    metodo?: string;
    params?: Record<string, unknown>;
    /** Aviso mostrado depois de executar. */
    aviso?: string;
    /** Em vez de executar, leva para uma aba. */
    aba?: string;
    /** Com `aba: "pc"`, abre também um dos painéis dela. */
    painel?: string;
  };
}

const QUANTAS = 4;

function minutosAte(ts: number): number {
  return Math.round((ts - Date.now()) / 60000);
}

function textoDeEspera(min: number): string {
  if (min < 60) return `em ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `em ${h} h` : `em ${Math.round(h / 24)} dias`;
}

/**
 * Monta o conjunto de candidatas. Cada fonte é isolada num try: uma leitura que falha —
 * Spotify deslogado, Ollama fora, disco não enumerado — não pode zerar a lista inteira.
 */
async function candidatas(): Promise<Sugestao[]> {
  const c: Sugestao[] = [];
  const tentar = async (fn: () => Promise<void> | void) => { try { await fn(); } catch { /* fonte muda */ } };

  await tentar(async () => {
    const proximos = listAll()
      .filter(r => !r.firedAt && r.dueAt > Date.now())
      .sort((a, b) => a.dueAt - b.dueAt);
    const p = proximos[0];
    if (!p) return;
    const min = minutosAte(p.dueAt);
    c.push({
      texto: `${p.text} ${textoDeEspera(min)}`,
      icone: "clock",
      detalhe: "Ver os lembretes",
      // Quanto mais perto, mais alto: um lembrete daqui a 5 minutos é a coisa mais
      // relevante que esta tela pode mostrar.
      peso: min <= 30 ? 10 : min <= 180 ? 6 : 3,
      acao: { aba: "inicio" },
    });
  });

  await tentar(async () => {
    const t = await getDashboardTelemetry();
    const disco = (t.disks ?? [])[0];
    if (disco && (disco.usedPct ?? 0) >= 88) {
      c.push({
        texto: `Disco ${disco.name} com ${disco.freeGB} GB livres`,
        icone: "hard-drive",
        detalhe: "Ver o que dá para liberar",
        peso: 8,
        acao: { aba: "pc", painel: "armazenamento" },
      });
    }
    if (typeof t.cpu_temp === "number" && t.cpu_temp >= 82) {
      c.push({
        texto: `CPU a ${t.cpu_temp}°C`,
        icone: "thermometer",
        detalhe: "Temperatura acima do normal",
        peso: 9,
        acao: { aba: "pc" },
      });
    }
    if ((t.ram_pct ?? 0) >= 85) {
      c.push({
        texto: `Memória em ${Math.round(t.ram_pct)}%`,
        icone: "activity",
        detalhe: "Ver o que está consumindo",
        peso: 6,
        acao: { aba: "pc" },
      });
    }
    if (typeof t.battery_pct === "number" && t.battery_pct <= 20 && !t.battery_charging) {
      c.push({
        texto: `Bateria em ${t.battery_pct}%`,
        icone: "battery",
        detalhe: "Sem estar carregando",
        peso: 9,
      });
    }
  });

  await tentar(async () => {
    const procs = await getTopProcesses();
    const pesado = procs.slice().sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))[0];
    if (pesado && (pesado.cpu ?? 0) >= 35) {
      c.push({
        // "chrome#2" é o sufixo de instância dos contadores de desempenho; ninguém fala assim.
        texto: `${pesado.name.replace(/#\d+$/, "")} em ${Math.min(100, Math.round(pesado.cpu ?? 0))}% de CPU`,
        icone: "cpu",
        detalhe: "Ver os processos",
        peso: 5,
        acao: { aba: "pc" },
      });
    }
  });

  await tentar(() => {
    const texto = clipboard.readText().trim();
    if (!texto) return;
    const ehLink = /^https?:\/\/\S+$/i.test(texto);
    c.push({
      texto: ehLink ? "Mandar o link copiado pro celular" : "Mandar o texto copiado pro celular",
      icone: "smartphone",
      detalhe: texto.slice(0, 120),
      peso: ehLink ? 6 : 3,
      // Não há RPC de caixa de recados; a Início trata este caso pelo IPC do mailbox.
      acao: { metodo: "__mailbox", params: { texto }, aviso: "Mandado para o celular." },
    });
  });

  await tentar(() => {
    const presets = Object.entries(getAllPresets());
    if (!presets.length) return;
    const [chave, entrada] = presets[Math.floor(Math.random() * presets.length)];
    c.push({
      texto: `Rodar “${entrada.description || chave}”`,
      icone: "sliders",
      detalhe: `${entrada.actions.length} ação(ões)`,
      peso: 4,
      acao: { metodo: "presets.run", params: { name: chave }, aviso: `Rodando ${chave}…` },
    });
  });

  await tentar(async () => {
    const now = await spotify.getNowPlaying();
    if (!now?.track) return;
    c.push({
      texto: now.isPlaying ? "Pular faixa" : `Retomar ${now.track}`,
      icone: now.isPlaying ? "skip-forward" : "play",
      detalhe: `${now.track} — ${now.artist ?? ""}`,
      peso: 4,
      acao: {
        metodo: "spotify.command",
        params: { operation: now.isPlaying ? "next" : "play" },
        aviso: now.isPlaying ? "Pulando…" : "Tocando…",
      },
    });
  });

  await tentar(async () => {
    const cl = await climaAgora();
    if (!cl) return;
    c.push({
      texto: `${Math.round(cl.temperatura)}°, ${cl.descricao}`,
      icone: cl.icone,
      detalhe: `${cl.cidade} · máx ${Math.round(cl.max)}° / mín ${Math.round(cl.min)}°`,
      // Chuva prevista muda o que você faz hoje; céu limpo é só informação.
      peso: cl.chuvaHoje ? 7 : 2,
    });
  });

  // Sem lembrete nenhum, o convite a criar um vale mais que a lista vazia.
  await tentar(() => {
    if (listAll().some(r => !r.firedAt && r.dueAt > Date.now())) return;
    c.push({
      texto: "Criar um lembrete",
      icone: "clock",
      detalhe: "Nada agendado por enquanto",
      peso: 3,
      acao: { aba: "inicio" },
    });
  });

  // Nudge de configuração: aparece só enquanto a cidade não estiver definida, então some
  // sozinho depois de resolvido em vez de virar ruído permanente.
  await tentar(() => {
    if (getConfig().climaCidade) return;
    c.push({
      texto: "Definir a sua cidade",
      icone: "cloud",
      detalhe: "Para ver a previsão aqui",
      peso: 3,
      acao: { aba: "ajustes" },
    });
  });

  await tentar(() => {
    const sessoes = listSessions();
    const ultima = sessoes.filter(x => x.favorite)[0] ?? sessoes[0];
    if (!ultima) return;
    c.push({
      texto: `Retomar “${ultima.title}”`,
      icone: "message-circle",
      detalhe: "Conversa salva",
      peso: 3,
      acao: { aba: "chat" },
    });
  });

  await tentar(() => {
    const dias = Math.floor(os.uptime() / 86400);
    if (dias < 3) return;
    c.push({
      texto: `PC ligado há ${dias} dias`,
      icone: "activity",
      detalhe: "Reiniciar de vez em quando ajuda",
      peso: 2,
    });
  });

  return c;
}

/**
 * Sorteio ponderado sem reposição. Peso alto aparece com mais frequência, mas nada é
 * garantido: se as quatro primeiras fossem sempre as mesmas, a tela voltaria a ser fixa,
 * que é justamente o que estas bolhas existem para evitar.
 */
function sortear(pool: Sugestao[], quantas: number): Sugestao[] {
  const restantes = pool.slice();
  const saida: Sugestao[] = [];
  while (saida.length < quantas && restantes.length) {
    const total = restantes.reduce((s, x) => s + x.peso, 0);
    let r = Math.random() * total;
    let i = 0;
    while (i < restantes.length - 1 && (r -= restantes[i].peso) > 0) i++;
    saida.push(restantes.splice(i, 1)[0]);
  }
  return saida;
}

/** Nunca lança: sem candidata nenhuma, devolve lista vazia e o card mostra o estado vazio. */
export async function listarSugestoes(): Promise<Sugestao[]> {
  try {
    return sortear(await candidatas(), QUANTAS);
  } catch (e) {
    console.warn("[sugestoes] falhou:", (e as Error).message);
    return [];
  }
}
