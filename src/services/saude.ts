import { getApiKey, getConfig } from "../main/config";
import { inicioAutomaticoConfere, sincronizarInicioAutomatico } from "../main/autoLaunch";
import { baseDoOllama, momentoDoUltimoLimiteGroq, ollamaDisponivel } from "./llm";
import { garantirOllama } from "./ollamaVivo";
import { estadoAtualizacao, EstadoAtualizacao } from "./atualizacao";
import { discoCritico } from "../actions/armazenamento";
import { DiskEntry, getDashboardTelemetry } from "../actions/systemInfo";
import { listarAparelhos } from "./aparelhos";
import { clientesConectados } from "./server";

/**
 * "Saúde do ELYSIUM" (fase 12) — um card que diz o que está quebrado antes de o Zak
 * descobrir falando com o assistente.
 *
 * Nasceu de três falhas silenciosas achadas numa noite só: o Ollama parado (todo pedido caía
 * na Groq e batia no limite → "não entendi"), a lista de jogos que nunca entrou no build, e
 * o Windows subindo uma cópia velha no boot. Nenhuma aparecia na tela. Cada item diz o que
 * viu e, quando dá, oferece o conserto num clique.
 *
 * `avaliarSaude` é pura (fatos → itens) para ser testada; `verificarSaude` junta os fatos.
 */

export type Nivel = "ok" | "aviso" | "erro";

export interface ItemSaude {
  id: string;
  titulo: string;
  nivel: Nivel;
  detalhe: string;
  /** "consertar" chama `consertarSaude(valor)`; "painel" abre um painel da aba PC; "rpc" chama o método. */
  conserto?: { rotulo: string; tipo: "consertar" | "painel" | "rpc"; valor: string };
}

export interface FatosSaude {
  cerebroLocal: boolean;
  ollama: { ok: boolean; detalhe: string };
  modeloLocal: string;
  groqChave: boolean;
  /** Minutos desde o último 429 da Groq, ou null se não houve nesta sessão. */
  groqLimiteHaMin: number | null;
  inicioDesejado: boolean;
  inicio: { ok: boolean; detalhe: string };
  atualizacao: EstadoAtualizacao;
  discos: DiskEntry[];
  celularConectado: boolean;
  /** Última vez que o app do celular falou com o PC (ms), ou null se nunca. */
  celularVistoEm: number | null;
  agora: number;
}

/** Número à brasileira: 24,8 e não 24.8. */
const br = (n: number) => String(n).replace(".", ",");

function haQuanto(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} dias`;
}

export function avaliarSaude(f: FatosSaude): ItemSaude[] {
  const itens: ItemSaude[] = [];

  // Cérebro local
  if (f.cerebroLocal) {
    if (f.ollama.ok) itens.push({ id: "cerebro", titulo: "Cérebro local", nivel: "ok", detalhe: `${f.modeloLocal} pronto no Ollama` });
    else if (/não foi baixado/.test(f.ollama.detalhe)) itens.push({ id: "cerebro", titulo: "Cérebro local", nivel: "erro", detalhe: f.ollama.detalhe });
    else itens.push({ id: "cerebro", titulo: "Cérebro local", nivel: "erro", detalhe: "o Ollama não está rodando — tudo vai para a Groq, que tem limite por minuto", conserto: { rotulo: "Subir o Ollama", tipo: "consertar", valor: "ollama" } });
  } else {
    itens.push({ id: "cerebro", titulo: "Cérebro", nivel: "ok", detalhe: "na nuvem (Groq), por escolha em Ajustes" });
  }

  // Groq: visão, busca e transcrição dependem dela mesmo com o cérebro local.
  if (!f.groqChave) itens.push({ id: "groq", titulo: "Groq", nivel: "erro", detalhe: "sem chave — voz, visão e busca na web param" });
  else if (f.groqLimiteHaMin !== null && f.groqLimiteHaMin < 10) itens.push({ id: "groq", titulo: "Groq", nivel: "aviso", detalhe: `bateu no limite por minuto há ${Math.max(1, Math.round(f.groqLimiteHaMin))} min` });
  else itens.push({ id: "groq", titulo: "Groq", nivel: "ok", detalhe: "chave presente" });

  // Início com o Windows
  if (f.inicioDesejado) {
    itens.push(f.inicio.ok
      ? { id: "inicio", titulo: "Início com o Windows", nivel: "ok", detalhe: f.inicio.detalhe }
      : { id: "inicio", titulo: "Início com o Windows", nivel: "erro", detalhe: f.inicio.detalhe, conserto: { rotulo: "Corrigir", tipo: "consertar", valor: "inicio" } });
  }

  // Versão
  const a = f.atualizacao;
  if (a.desktop?.pronto) itens.push({ id: "versao", titulo: "Versão", nivel: "aviso", detalhe: `a ${a.desktop.versao} está baixada (você está na ${a.atual})`, conserto: { rotulo: "Instalar", tipo: "rpc", valor: "update.install" } });
  else if (a.desktop) itens.push({ id: "versao", titulo: "Versão", nivel: "ok", detalhe: `baixando a ${a.desktop.versao}… ${Math.round(a.desktop.progresso * 100)}%` });
  else if (a.semToken) itens.push({ id: "versao", titulo: "Versão", nivel: "aviso", detalhe: `${a.atual}; sem acesso às releases (token do GitHub em Ajustes → Sobre)` });
  else if (a.erro) itens.push({ id: "versao", titulo: "Versão", nivel: "aviso", detalhe: `${a.atual}; a última verificação falhou: ${a.erro}` });
  else itens.push({ id: "versao", titulo: "Versão", nivel: "ok", detalhe: `${a.atual}, a mais nova` });

  // Disco: crítico (≥ 95% ou < 10 GB, o mesmo do vigia) é erro; a partir de 88% (o limite
  // da sugestão da Início) é aviso. "Espaço de sobra" com o C: em 94% seria mentira.
  const critico = discoCritico(f.discos);
  const cheio = critico ?? f.discos.find(x => x.totalGB > 0 && x.usedPct >= 88) ?? null;
  const verDisco = { rotulo: "Ver o que ocupa", tipo: "painel" as const, valor: "armazenamento" };
  if (cheio) itens.push({ id: "disco", titulo: `Disco ${cheio.name}`, nivel: critico ? "erro" : "aviso", detalhe: `${br(cheio.freeGB)} GB livres (${br(cheio.usedPct)}% usado)`, conserto: verDisco });
  else if (f.discos.length) {
    const c = f.discos.find(x => /^c/i.test(x.name)) ?? f.discos[0];
    itens.push({ id: "disco", titulo: "Discos", nivel: "ok", detalhe: `${c.name}: ${br(c.freeGB)} GB livres` });
  }

  // Celular
  if (f.celularConectado) itens.push({ id: "celular", titulo: "Celular", nivel: "ok", detalhe: "conectado agora" });
  else if (f.celularVistoEm === null) itens.push({ id: "celular", titulo: "Celular", nivel: "aviso", detalhe: "nunca falou com este PC — pareie pelo QR (orbe da Início)" });
  else {
    const ha = f.agora - f.celularVistoEm;
    itens.push({ id: "celular", titulo: "Celular", nivel: ha > 3 * 86_400_000 ? "aviso" : "ok", detalhe: `visto há ${haQuanto(ha)}` });
  }

  return itens;
}

export async function verificarSaude(): Promise<ItemSaude[]> {
  const cfg = getConfig();
  const cerebroLocal = cfg.routerProvider === "ollama" || cfg.chatProvider === "ollama";
  const [ollama, inicio, discos] = await Promise.all([
    cerebroLocal ? ollamaDisponivel(cfg.ollamaRouterModel) : Promise.resolve({ ok: true, detalhe: "" }),
    inicioAutomaticoConfere().catch(() => ({ ok: true, detalhe: "não consegui ler o Registro" })),
    getDashboardTelemetry().then(t => t.disks ?? []).catch(() => [] as DiskEntry[]),
  ]);
  const limite = momentoDoUltimoLimiteGroq();
  const celular = listarAparelhos().filter(a => /ELYSIUM-M/.test(a.cliente) && a.pedidos > 0);
  return avaliarSaude({
    cerebroLocal,
    ollama,
    modeloLocal: cfg.ollamaRouterModel,
    groqChave: Boolean(getApiKey()),
    groqLimiteHaMin: limite ? (Date.now() - limite) / 60000 : null,
    inicioDesejado: cfg.autoLaunch !== false,
    inicio,
    atualizacao: estadoAtualizacao(),
    discos,
    celularConectado: clientesConectados() > 0,
    celularVistoEm: celular.length ? Math.max(...celular.map(a => a.ultimaVez)) : null,
    agora: Date.now(),
  });
}

/** Os consertos de um clique. Devolve a frase do que aconteceu. */
export async function consertarSaude(item: string): Promise<string> {
  if (item === "ollama") {
    return (await garantirOllama(baseDoOllama(), true)) ? "O Ollama está de pé." : "Não consegui subir o Ollama — abra-o pelo menu Iniciar.";
  }
  if (item === "inicio") {
    await sincronizarInicioAutomatico(true);
    const r = await inicioAutomaticoConfere();
    return r.ok ? "Pronto: o Windows vai subir esta versão." : `Não consegui corrigir: ${r.detalhe}`;
  }
  throw new Error(`não sei consertar "${item}"`);
}
