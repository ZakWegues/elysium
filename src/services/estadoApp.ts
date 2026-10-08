import os from "node:os";
import Store from "electron-store";

/**
 * Em que pé está o ELYSIUM no PC, para o celular mostrar (08/10): janela na tela, minimizada
 * ou só na bandeja; tela do PC bloqueada; PC suspenso, desligando ou o app fechado de vez.
 *
 * O celular só fala com o PC enquanto o app está no ar — então o "fechado" e o "desligando"
 * vão de três jeitos: pelo WebSocket aberto na hora, pelo push (que chega no 4G e com o app
 * do celular fechado) e, na volta, pelo `anterior`: o PC lembra como foi o último
 * encerramento. Se o app morreu sem avisar (queda de energia, processo morto), o batimento
 * gravado a cada minuto diz até quando ele esteve vivo.
 */

export type Janela = "foco" | "aberta" | "minimizada" | "bandeja";
export type MotivoEncerramento = "fechado" | "atualizando" | "desligando" | "suspenso" | "interrompido";

export interface EstadoApp {
  janela: Janela;
  janelaDesde: number;
  bloqueado: boolean;
  bloqueadoDesde: number | null;
  /** Minutos sem mouse/teclado. */
  ociosoMin: number;
  iniciadoEm: number;
  pcLigadoDesde: number;
  versao: string;
  /** Como terminou a sessão anterior do app — o celular mostra "ficou fechado de X a Y". */
  anterior: { motivo: MotivoEncerramento; em: number } | null;
  /** Para onde vai o som do PC (a voz da Ely): virtual ou no mudo = ninguém ouve. */
  som: { nome: string; volume: number; mudo: boolean; virtual: boolean } | null;
}

interface Gravado {
  /** Último batimento: até quando o app esteve vivo. */
  vivoEm: number;
  /** Encerramento avisado (Sair, atualização, desligar). Sem ele, a sessão morreu sem avisar. */
  encerramento: { motivo: MotivoEncerramento; em: number } | null;
}

let store: Store<{ estado: Gravado }> | null = null;
function loja(): Store<{ estado: Gravado }> {
  // Preguiçosa: os testes importam o módulo sem Electron de pé.
  store ??= new Store<{ estado: Gravado }>({ name: "estado-app", defaults: { estado: { vivoEm: 0, encerramento: null } } });
  return store;
}

let estado: Omit<EstadoApp, "ociosoMin"> | null = null;
let lerJanela: () => Janela = () => "bandeja";
let lerOcioso: () => number = () => 0;
const ouvintes = new Set<(e: EstadoApp) => void>();

/** Como a sessão anterior terminou, a partir do que ficou gravado. Pura. */
export function sessaoAnterior(g: Gravado): { motivo: MotivoEncerramento; em: number } | null {
  if (g.encerramento && g.encerramento.em >= g.vivoEm - 120_000) return g.encerramento;
  // Batimento depois do último aviso (ou nenhum aviso): caiu sem avisar.
  if (g.vivoEm > 0) return { motivo: "interrompido", em: g.vivoEm };
  return null;
}

/** Chamado uma vez, na partida do app. */
export function iniciarEstadoApp(opcoes: { versao: string; janela: () => Janela; ociosoMin: () => number }): void {
  const g = loja().get("estado");
  lerJanela = opcoes.janela;
  lerOcioso = opcoes.ociosoMin;
  const agora = Date.now();
  estado = {
    janela: lerJanela(),
    janelaDesde: agora,
    bloqueado: false,
    bloqueadoDesde: null,
    iniciadoEm: agora,
    pcLigadoDesde: agora - Math.round(os.uptime() * 1000),
    versao: opcoes.versao,
    anterior: sessaoAnterior(g),
    som: null,
  };
  loja().set("estado", { vivoEm: agora, encerramento: null });
  setInterval(() => { try { loja().set("estado", { ...loja().get("estado"), vivoEm: Date.now() }); } catch { /* disco cheio etc. */ } }, 60_000).unref();
}

export function estadoDoApp(): EstadoApp | null {
  if (!estado) return null;
  let ociosoMin = 0;
  try { ociosoMin = lerOcioso(); } catch { /* sem powerMonitor */ }
  return { ...estado, ociosoMin };
}

export function aoMudarEstadoApp(fn: (e: EstadoApp) => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

function avisar(): void {
  const e = estadoDoApp();
  if (!e) return;
  for (const fn of ouvintes) { try { fn(e); } catch { /* ouvinte com defeito não derruba os outros */ } }
}

/** A janela do dashboard mudou (mostrou, escondeu, minimizou, ganhou ou perdeu o foco). */
export function janelaMudou(): void {
  if (!estado) return;
  const j = lerJanela();
  if (j === estado.janela) return;
  estado = { ...estado, janela: j, janelaDesde: Date.now() };
  avisar();
}

/** A saída de som foi lida de novo; avisa só se mudou algo que importa. */
export function definirSom(som: EstadoApp["som"]): void {
  if (!estado) return;
  const a = estado.som;
  estado = { ...estado, som };
  if (!a || !som || a.nome !== som.nome || a.mudo !== som.mudo || a.virtual !== som.virtual || Math.abs(a.volume - som.volume) >= 10) avisar();
}

export function telaBloqueada(bloqueada: boolean): void {
  if (!estado || estado.bloqueado === bloqueada) return;
  estado = { ...estado, bloqueado: bloqueada, bloqueadoDesde: bloqueada ? Date.now() : null };
  avisar();
}

/**
 * O app vai parar (ou o PC vai dormir): grava o motivo para a próxima sessão contar. Suspender
 * não encerra o app, mas para o celular é o mesmo silêncio — e a volta zera o aviso.
 */
export function registrarEncerramento(motivo: MotivoEncerramento): void {
  try { loja().set("estado", { vivoEm: Date.now(), encerramento: { motivo, em: Date.now() } }); } catch { /* segue saindo */ }
}

/** Voltou da suspensão: o app nunca saiu, então o aviso de suspensão não vale mais. */
export function voltouDaSuspensao(): void {
  try { loja().set("estado", { vivoEm: Date.now(), encerramento: null }); } catch { /* ok */ }
}
