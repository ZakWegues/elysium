import Store from "electron-store";
import { ouvirEventos } from "./eventos";

/**
 * Modo foco (C9 do catálogo, fase 12).
 *
 * N minutos em que os programas de distração da lista viram aviso — "Discord aberto, faltam
 * 18 min" — e, se o Zak pediu, são fechados. A decisão que ficou aberta no plano da §19
 * ("fechar o processo ou só avisar?") foi: **avisar por padrão**. Fechar à força perde
 * trabalho não salvo; quem quer o rigor liga "fechar" ao começar.
 *
 * O fim é guardado em disco: reiniciar o PC no meio não cancela o foco. A detecção usa o
 * evento `app.abriu` que o main já emite a cada 15 s (bloco 79), e ao começar confere o que
 * JÁ estava aberto — senão o Discord aberto antes do foco passaria o tempo todo sem aviso.
 */

export interface EstadoFoco {
  ativo: boolean;
  /** Epoch ms do fim. */
  ate?: number;
  comecouEm?: number;
  minutos?: number;
  apps: string[];
  fechar: boolean;
  /** Quantas vezes um app da lista apareceu durante o foco. */
  distracoes: number;
}

export interface DependenciasFoco {
  avisar: (titulo: string, corpo: string) => void;
  fecharApp: (nome: string) => Promise<string>;
  abertosAgora: () => Promise<{ name: string; title?: string }[]>;
}

export const APPS_PADRAO = ["discord", "steam", "whatsapp", "telegram", "roblox", "epicgameslauncher", "riotclient"];

const store = new Store<{ foco: EstadoFoco; focoApps: string[] }>({
  name: "foco",
  defaults: { foco: { ativo: false, apps: [], fechar: false, distracoes: 0 }, focoApps: APPS_PADRAO },
});

let deps: DependenciasFoco | null = null;
let fimTimer: NodeJS.Timeout | null = null;
let pararDeOuvir: (() => void) | null = null;
/** Um aviso por app por foco: o main pode ver o mesmo app "abrir" de novo a cada troca de janela. */
const avisados = new Set<string>();

/** "Epic Games Launcher" e "EpicGamesLauncher.exe" são o mesmo programa. */
export function normalizar(x: unknown): string {
  return String(x ?? "").toLowerCase().replace(/\.exe$/, "").replace(/[^a-z0-9]/g, "");
}

/** O app (nome do processo ou título da janela) é da lista? Pura, para teste. */
export function ehDistracao(app: string, titulo: string, lista: string[]): string | null {
  const a = normalizar(app), t = normalizar(titulo);
  for (const item of lista) {
    const alvo = normalizar(item);
    if (alvo && (a.includes(alvo) || (alvo.length >= 5 && t.includes(alvo)))) return item;
  }
  return null;
}

function faltam(ate: number): string {
  const min = Math.max(0, Math.ceil((ate - Date.now()) / 60000));
  return min === 1 ? "falta 1 min" : `faltam ${min} min`;
}

export function estadoFoco(): EstadoFoco & { listaPadrao: string[] } {
  return { ...store.get("foco"), listaPadrao: store.get("focoApps") };
}

async function flagrar(app: string, titulo: string): Promise<void> {
  const f = store.get("foco");
  if (!f.ativo || !f.ate || !deps) return;
  const item = ehDistracao(app, titulo, f.apps);
  if (!item || avisados.has(normalizar(app))) return;
  avisados.add(normalizar(app));
  store.set("foco", { ...f, distracoes: f.distracoes + 1 });
  if (f.fechar) {
    const r = await deps.fecharApp(app).catch((e: unknown) => String(e));
    deps.avisar("Modo foco", `${app} fechado — ${faltam(f.ate)}. (${r})`);
    // Fechado: se abrir de novo, avisa de novo.
    avisados.delete(normalizar(app));
  } else {
    deps.avisar("Modo foco", `${app} aberto — ${faltam(f.ate)}.`);
  }
}

function armar(): void {
  const f = store.get("foco");
  if (fimTimer) { clearTimeout(fimTimer); fimTimer = null; }
  if (!f.ativo || !f.ate) return;
  fimTimer = setTimeout(() => terminar("fim"), Math.max(0, f.ate - Date.now()));
  if (!pararDeOuvir) {
    pararDeOuvir = ouvirEventos((e) => {
      if (e.nome === "app.abriu") void flagrar(String(e.dados.app ?? ""), String(e.dados.titulo ?? ""));
    });
  }
}

function terminar(motivo: "fim" | "parado"): EstadoFoco {
  const f = store.get("foco");
  if (fimTimer) { clearTimeout(fimTimer); fimTimer = null; }
  pararDeOuvir?.(); pararDeOuvir = null;
  avisados.clear();
  const fim: EstadoFoco = { ativo: false, apps: f.apps, fechar: f.fechar, distracoes: f.distracoes, minutos: f.minutos };
  store.set("foco", fim);
  if (f.ativo && deps) {
    const feito = f.comecouEm ? Math.round((Date.now() - f.comecouEm) / 60000) : f.minutos ?? 0;
    const dist = f.distracoes === 0 ? "sem nenhuma distração" : f.distracoes === 1 ? "1 distração" : `${f.distracoes} distrações`;
    deps.avisar(motivo === "fim" ? "Foco concluído" : "Foco encerrado", `${feito} min, ${dist}.`);
  }
  return fim;
}

export async function comecarFoco(opcoes: { minutos: number; apps?: string[]; fechar?: boolean }): Promise<EstadoFoco> {
  const minutos = Math.round(opcoes.minutos);
  if (!Number.isFinite(minutos) || minutos < 1 || minutos > 480) throw new Error("minutos deve ficar entre 1 e 480");
  const apps = (opcoes.apps?.length ? opcoes.apps : store.get("focoApps")).map(a => a.trim()).filter(Boolean).slice(0, 30);
  if (opcoes.apps?.length) store.set("focoApps", apps);
  const agora = Date.now();
  const f: EstadoFoco = { ativo: true, ate: agora + minutos * 60000, comecouEm: agora, minutos, apps, fechar: Boolean(opcoes.fechar), distracoes: 0 };
  store.set("foco", f);
  avisados.clear();
  armar();
  // O que já estava aberto antes do foco também conta.
  if (deps) {
    for (const a of await deps.abertosAgora().catch(() => [])) await flagrar(a.name.replace(/#\d+$/, ""), a.title ?? "");
  }
  return store.get("foco");
}

/** Troca a lista sem começar um foco (o card deixa editar antes). */
export function salvarListaFoco(apps: string[]): string[] {
  const limpa = apps.map(a => a.trim()).filter(Boolean).slice(0, 30);
  store.set("focoApps", limpa.length ? limpa : APPS_PADRAO);
  return store.get("focoApps");
}

export function pararFoco(): EstadoFoco {
  return terminar("parado");
}

/** No boot: liga os avisos e, se havia um foco em curso, retoma (ou encerra, se já venceu). */
export function iniciarFoco(d: DependenciasFoco): void {
  deps = d;
  const f = store.get("foco");
  if (f.ativo && f.ate && f.ate <= Date.now()) terminar("fim");
  else armar();
}

/** Frase para a voz e para a ferramenta do cérebro. */
export function focoFalado(): string {
  const f = store.get("foco");
  if (!f.ativo || !f.ate) return "O modo foco está desligado.";
  return `Modo foco ligado, ${faltam(f.ate)}. ${f.fechar ? "Fechando" : "Avisando sobre"} ${f.apps.slice(0, 4).join(", ")}${f.apps.length > 4 ? " e outros" : ""}.`;
}
