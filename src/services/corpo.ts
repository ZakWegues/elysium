import Store from "electron-store";
import * as crypto from "node:crypto";
import { diaDe } from "./habitos";

/**
 * Treino, nutrição e corrida (fase 18, 08/10).
 *
 * O Zak pediu para a Ely ter os treinos da academia (A/B/C, em rotação), a meta de calorias
 * e dicas que se renovam. Ele já conta o que come em outro app — então aqui NÃO há diário
 * alimentar: a Ely dá a meta do dia (com o que a corrida gastou somado), os macros e a dica.
 * E ele faz esteira querendo começar a correr de verdade, sem perder peso: entra um plano
 * de corrida para iniciante que avança a cada sessão marcada.
 *
 * 🔴 Dado pessoal. Os treinos, o perfil corporal e os pesos ficam no `corpo.json` do
 * userData — nunca no código nem no repositório (regra da memória do app). Este arquivo só
 * tem as contas, genéricas, e uma lista de dicas genéricas de reserva.
 *
 * As contas (taxa metabólica, meta, macros, rotação, plano de corrida) são puras e ficam no
 * topo, para teste.
 */

// ── tipos ────────────────────────────────────────────────────────────────────

export type TipoExercicio = "composto" | "isolador";

export interface Exercicio {
  nome: string;
  tipo: TipoExercicio;
  /** Séries de aquecimento antes das válidas (supino: 2). */
  aquecimento: number;
  series: number;
  /** "4–6", "10–12". Texto: faixa é o normal em academia. */
  reps: string;
  /** Carga de trabalho, livre ("40 kg", "placa 7"). */
  carga?: string;
  obs?: string;
}

export interface Treino {
  id: string;
  nome: string;
  exercicios: Exercicio[];
  ordem: number;
}

export type Sexo = "masculino" | "feminino";
export type Atividade = "sedentario" | "leve" | "moderado" | "ativo" | "muito";
export type Objetivo = "ganhar" | "manter" | "perder";

export interface PerfilCorpo {
  sexo?: Sexo;
  idade?: number;
  alturaCm?: number;
  pesoKg?: number;
  atividade: Atividade;
  objetivo: Objetivo;
  /** Onde a pessoa quer foco ("braços") — entra nas dicas. */
  foco?: string;
  /** Ajuste manual da meta (ex.: +150 depois de duas semanas sem ganho). */
  ajusteKcal: number;
}

export interface Corrida {
  id: string;
  data: string;
  minutos: number;
  km?: number;
  /** Sessão do plano (conta para avançar) ou corrida livre. */
  doPlano: boolean;
}

interface Dados {
  treinos: Treino[];
  /** Treinos feitos: a rotação olha o último. */
  feitos: { data: string; treinoId: string }[];
  perfil: PerfilCorpo;
  pesos: { data: string; kg: number }[];
  corridas: Corrida[];
}

// ── puras: exercícios ───────────────────────────────────────────────────────

const COMPOSTO = /supino|puxada|remada|leg ?press|agachamento|terra|stiff|desenvolvimento|barra fixa|paralela|afundo|hack|levantamento/i;

/** Multiarticular (pesado, poucas reps) ou isolador. Pelo nome — o comum em academia. */
export function tipoDoExercicio(nome: string): TipoExercicio {
  return COMPOSTO.test(nome) ? "composto" : "isolador";
}

/**
 * O padrão que o Zak usa: compostos com 2 aquecimentos e 3 válidas de 4–6; isoladores 3×10–12.
 * Editável por exercício depois.
 */
export function seriesPadrao(tipo: TipoExercicio): Pick<Exercicio, "aquecimento" | "series" | "reps"> {
  return tipo === "composto" ? { aquecimento: 2, series: 3, reps: "4–6" } : { aquecimento: 0, series: 3, reps: "10–12" };
}

export function exercicioDe(nome: string, base: Partial<Exercicio> = {}): Exercicio {
  const tipo = base.tipo ?? tipoDoExercicio(nome);
  return { ...seriesPadrao(tipo), ...limparUndefined(base), nome: nome.trim(), tipo } as Exercicio;
}

function limparUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** "2 aquec. + 3×4–6" — como a série aparece na tela e na fala. */
export function descreverSeries(e: Pick<Exercicio, "aquecimento" | "series" | "reps">): string {
  return `${e.aquecimento ? `${e.aquecimento} aquec. + ` : ""}${e.series}×${e.reps}`;
}

// ── puras: rotação ──────────────────────────────────────────────────────────

/**
 * O treino da vez na rotação A→B→C: o seguinte ao último feito. Feito HOJE, o de hoje é
 * esse mesmo (marcado como feito) — senão a tela pularia para o próximo assim que se marca.
 */
export function treinoDaVez(treinos: Treino[], feitos: Dados["feitos"], hoje: string): { treino: Treino; feitoHoje: boolean } | null {
  const ordenados = [...treinos].sort((a, b) => a.ordem - b.ordem);
  if (!ordenados.length) return null;
  const ultimo = [...feitos].reverse().find(f => ordenados.some(t => t.id === f.treinoId));
  if (!ultimo) return { treino: ordenados[0], feitoHoje: false };
  const i = ordenados.findIndex(t => t.id === ultimo.treinoId);
  if (ultimo.data === hoje) return { treino: ordenados[i], feitoHoje: true };
  return { treino: ordenados[(i + 1) % ordenados.length], feitoHoje: false };
}

// ── puras: energia ──────────────────────────────────────────────────────────

export const FATOR_ATIVIDADE: Record<Atividade, number> = { sedentario: 1.2, leve: 1.375, moderado: 1.465, ativo: 1.55, muito: 1.725 };
const AJUSTE_OBJETIVO: Record<Objetivo, number> = { ganhar: 0.15, manter: 0, perder: -0.15 };

/** O que falta no perfil para a conta. Sem chute: sem idade ou sexo, não há meta. */
export function faltaNoPerfil(p: PerfilCorpo): string[] {
  const f: string[] = [];
  if (!p.sexo) f.push("sexo");
  if (!p.idade) f.push("idade");
  if (!p.alturaCm) f.push("altura");
  if (!p.pesoKg) f.push("peso");
  return f;
}

/** Taxa metabólica basal, Mifflin-St Jeor — a fórmula de referência para adultos. */
export function taxaBasal(p: Required<Pick<PerfilCorpo, "sexo" | "idade" | "alturaCm" | "pesoKg">>): number {
  return 10 * p.pesoKg + 6.25 * p.alturaCm - 5 * p.idade + (p.sexo === "masculino" ? 5 : -161);
}

/** MET da corrida pela velocidade média; sem distância, o de intervalo corre/anda. */
export function metDaCorrida(minutos: number, km?: number): number {
  if (!km || minutos <= 0) return 6;
  const kmh = km / (minutos / 60);
  if (kmh < 6.4) return 4.3;
  if (kmh < 8) return 6.5;
  if (kmh < 9.7) return 8.3;
  if (kmh < 11) return 9.8;
  return 11;
}

/** Gasto da corrida (kcal) = MET × peso × horas. Arredondado para 10. */
export function gastoDaCorrida(minutos: number, pesoKg: number, km?: number): number {
  return Math.round((metDaCorrida(minutos, km) * pesoKg * (minutos / 60)) / 10) * 10;
}

export interface MetaDoDia {
  kcal: number;
  /** Gasto estimado (basal × atividade), sem o ajuste do objetivo. */
  gasto: number;
  /** Somado por corrida feita hoje — para a corrida não comer o superávit. */
  corrida: number;
  proteinaG: number;
  gorduraG: number;
  carboG: number;
}

/**
 * Meta de hoje. Ganhar: +15% sobre o gasto (ganho limpo, ~0,25–0,5 kg por semana), proteína
 * 2 g/kg; manter/perder: 1,8 g/kg. Gordura 0,9 g/kg; o resto em carboidrato.
 */
export function metaDoDia(p: PerfilCorpo, kcalCorridaHoje = 0): MetaDoDia | null {
  if (faltaNoPerfil(p).length) return null;
  const gasto = taxaBasal(p as Required<PerfilCorpo>) * FATOR_ATIVIDADE[p.atividade];
  const kcal = Math.round((gasto * (1 + AJUSTE_OBJETIVO[p.objetivo]) + (p.ajusteKcal || 0) + kcalCorridaHoje) / 10) * 10;
  const proteinaG = Math.round(p.pesoKg! * (p.objetivo === "ganhar" ? 2 : 1.8));
  const gorduraG = Math.round(p.pesoKg! * 0.9);
  const carboG = Math.max(0, Math.round((kcal - proteinaG * 4 - gorduraG * 9) / 4));
  return { kcal, gasto: Math.round(gasto / 10) * 10, corrida: kcalCorridaHoje, proteinaG, gorduraG, carboG };
}

/**
 * Acompanhamento do peso (objetivo ganhar): duas semanas ou mais sem subir 0,2 kg → sugere
 * +150 kcal. Ganho acima de 1 kg por semana → sugere segurar (vira mais gordura que massa).
 */
export function sugestaoDoPeso(pesos: Dados["pesos"], objetivo: Objetivo, hoje = new Date()): string | null {
  if (objetivo !== "ganhar" || pesos.length < 2) return null;
  const ordenados = [...pesos].sort((a, b) => a.data.localeCompare(b.data));
  const ultimo = ordenados[ordenados.length - 1];
  const limite = diaDe(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 14));
  const antigo = [...ordenados].reverse().find(p => p.data <= limite);
  if (!antigo) return null;
  const dias = (Date.parse(ultimo.data) - Date.parse(antigo.data)) / 86_400_000;
  const ganho = ultimo.kg - antigo.kg;
  if (ganho < 0.2) return `Duas semanas sem ganho de peso (${antigo.kg} → ${ultimo.kg} kg). Vale somar uns 150 kcal à meta.`;
  if (dias > 0 && ganho / (dias / 7) > 1) return `Subindo mais de 1 kg por semana — dá para segurar um pouco a meta e ganhar mais massa que gordura.`;
  return null;
}

// ── puras: plano de corrida ─────────────────────────────────────────────────

/**
 * Plano para iniciante, na esteira, três sessões por semana (o formato do "0 a 5 km"). Cada
 * sessão: 5 min andando, os blocos, 5 min andando. Repetir uma semana difícil é normal — o
 * avanço é por sessão MARCADA, não pelo calendário.
 */
export const PLANO_CORRIDA: { corre: number; anda: number; vezes: number }[] = [
  { corre: 1, anda: 1.5, vezes: 8 },
  { corre: 1.5, anda: 2, vezes: 6 },
  { corre: 3, anda: 2, vezes: 4 },
  { corre: 5, anda: 2.5, vezes: 3 },
  { corre: 8, anda: 4, vezes: 2 },
  { corre: 10, anda: 3, vezes: 2 },
  { corre: 22, anda: 0, vezes: 1 },
  { corre: 26, anda: 0, vezes: 1 },
  { corre: 30, anda: 0, vezes: 1 },
];
const POR_SEMANA = 3;

const min = (n: number) => `${String(n).replace(".", ",")} min`;

export function sessaoDoPlano(feitasDoPlano: number): { semana: number; sessao: number; texto: string; minutos: number; concluido: boolean } {
  const idx = Math.min(feitasDoPlano, PLANO_CORRIDA.length * POR_SEMANA - 1);
  const concluido = feitasDoPlano >= PLANO_CORRIDA.length * POR_SEMANA;
  const semana = Math.floor(idx / POR_SEMANA) + 1;
  const sessao = (idx % POR_SEMANA) + 1;
  const s = PLANO_CORRIDA[semana - 1];
  const blocos = s.anda ? `${s.vezes}× (corre ${min(s.corre)} + anda ${min(s.anda)})` : `corre ${min(s.corre)} sem parar`;
  const minutos = 10 + s.vezes * (s.corre + s.anda);
  return { semana, sessao, texto: `5 min andando · ${blocos} · 5 min andando`, minutos: Math.round(minutos), concluido };
}

// ── puras: dicas de reserva ─────────────────────────────────────────────────

/** Dicas genéricas, para quando o modelo não responde. Nada pessoal aqui. */
export const DICAS_RESERVA: Record<"manha" | "treino" | "tarde" | "noite", string[]> = {
  manha: [
    "Café da manhã com proteína (ovos, iogurte, leite) ajuda a bater a meta do dia sem sufoco.",
    "Pasta de amendoim no pão ou na fruta soma calorias boas sem encher demais.",
    "Vitamina de banana, aveia e leite é um jeito fácil de beber umas 500 kcal.",
  ],
  treino: [
    "Um carboidrato fácil 1 h antes do treino (banana, pão) dá energia para as séries pesadas.",
    "Depois do treino, proteína e carboidrato juntos ajudam a recuperação.",
    "Nos compostos, o aquecimento é parte do treino: suba a carga aos poucos até a de trabalho.",
  ],
  tarde: [
    "Um lanche a mais (castanhas, sanduíche, iogurte) é o que mais ajuda quem tem dificuldade de comer muito.",
    "Beber água ao longo do dia melhora o rendimento no treino e na esteira.",
    "Para os braços crescerem, progressão de carga nas roscas e no tríceps conta mais que volume infinito.",
  ],
  noite: [
    "Sono de 7–9 h é quando o músculo se reconstrói — conta tanto quanto o treino.",
    "Uma refeição com proteína à noite (leite, queijo, ovos) ajuda a fechar a meta do dia.",
    "Na corrida, ir devagar o bastante para conseguir conversar é o ritmo certo no começo.",
  ],
};

export function momentoDoDia(hora: number, diaDeTreino: boolean): keyof typeof DICAS_RESERVA {
  if (diaDeTreino && hora >= 15 && hora < 21) return "treino";
  if (hora < 11) return "manha";
  if (hora < 18) return "tarde";
  return "noite";
}

// ── store ────────────────────────────────────────────────────────────────────

const PERFIL_PADRAO: PerfilCorpo = { atividade: "ativo", objetivo: "ganhar", ajusteKcal: 0 };
const store = new Store<Dados>({
  name: "corpo",
  defaults: { treinos: [], feitos: [], perfil: PERFIL_PADRAO, pesos: [], corridas: [] },
});

const novoId = () => crypto.randomBytes(5).toString("hex");

export function listarTreinos(): Treino[] {
  return [...store.get("treinos", [])].sort((a, b) => a.ordem - b.ordem);
}

function limparExercicio(e: Partial<Exercicio> & { nome?: unknown }): Exercicio {
  const nome = String(e.nome ?? "").trim().slice(0, 80);
  if (!nome) throw new Error("exercício sem nome");
  const tipo = e.tipo === "composto" || e.tipo === "isolador" ? e.tipo : undefined;
  const int = (v: unknown, ate: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= ate ? v : undefined);
  const txt = (v: unknown, ate: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, ate) : undefined);
  return exercicioDe(nome, { tipo, aquecimento: int(e.aquecimento, 5), series: int(e.series, 10), reps: txt(e.reps, 12), carga: txt(e.carga, 20), obs: txt(e.obs, 120) });
}

export function salvarTreino(t: { id?: string; nome: string; exercicios: unknown[]; ordem?: number }): Treino {
  const nome = t.nome.trim().slice(0, 40);
  if (!nome) throw new Error("treino sem nome");
  if (!Array.isArray(t.exercicios) || t.exercicios.length > 30) throw new Error("lista de exercícios inválida");
  const exercicios = t.exercicios.map(e => limparExercicio(e as Partial<Exercicio>));
  const todos = store.get("treinos", []);
  const existente = t.id ? todos.find(x => x.id === t.id) : undefined;
  const salvo: Treino = { id: existente?.id ?? novoId(), nome, exercicios, ordem: t.ordem ?? existente?.ordem ?? todos.length };
  store.set("treinos", existente ? todos.map(x => (x.id === salvo.id ? salvo : x)) : [...todos, salvo]);
  return salvo;
}

export function apagarTreino(id: string): boolean {
  const todos = store.get("treinos", []);
  if (!todos.some(t => t.id === id)) return false;
  store.set("treinos", todos.filter(t => t.id !== id));
  return true;
}

/** Troca a lista inteira (importação dos treinos que já existiam em outro app). */
export function importarTreinos(lista: { nome: string; exercicios: unknown[] }[]): Treino[] {
  if (!Array.isArray(lista) || !lista.length || lista.length > 14) throw new Error("lista de treinos inválida");
  store.set("treinos", []);
  return lista.map((t, i) => salvarTreino({ nome: t.nome, exercicios: t.exercicios, ordem: i }));
}

/** Marca (ou desmarca) o treino como feito hoje. Sem id: o da vez. */
export function marcarTreino(feito = true, treinoId?: string, hoje = diaDe(new Date())): Treino | null {
  const vez = treinoDaVez(listarTreinos(), store.get("feitos", []), hoje);
  const id = treinoId ?? vez?.treino.id;
  const treino = listarTreinos().find(t => t.id === id);
  if (!treino) return null;
  const feitos = store.get("feitos", []).filter(f => f.data !== hoje);
  if (feito) feitos.push({ data: hoje, treinoId: treino.id });
  // Seis meses de histórico bastam para a rotação e para "quantos treinos este mês".
  store.set("feitos", feitos.slice(-200));
  return treino;
}

export function lerPerfil(): PerfilCorpo {
  return { ...PERFIL_PADRAO, ...store.get("perfil", PERFIL_PADRAO) };
}

export function salvarPerfil(p: Partial<PerfilCorpo>): PerfilCorpo {
  const atual = lerPerfil();
  const num = (v: unknown, de: number, ate: number) => (typeof v === "number" && Number.isFinite(v) && v >= de && v <= ate ? v : undefined);
  const novo: PerfilCorpo = {
    ...atual,
    ...(p.sexo === "masculino" || p.sexo === "feminino" ? { sexo: p.sexo } : {}),
    ...(num(p.idade, 10, 100) !== undefined ? { idade: Math.round(p.idade!) } : {}),
    ...(num(p.alturaCm, 100, 230) !== undefined ? { alturaCm: Math.round(p.alturaCm!) } : {}),
    ...(num(p.pesoKg, 30, 250) !== undefined ? { pesoKg: Math.round(p.pesoKg! * 10) / 10 } : {}),
    ...(p.atividade && p.atividade in FATOR_ATIVIDADE ? { atividade: p.atividade } : {}),
    ...(p.objetivo === "ganhar" || p.objetivo === "manter" || p.objetivo === "perder" ? { objetivo: p.objetivo } : {}),
    ...(typeof p.foco === "string" ? { foco: p.foco.trim().slice(0, 60) || undefined } : {}),
    ...(num(p.ajusteKcal, -1000, 1000) !== undefined ? { ajusteKcal: Math.round(p.ajusteKcal!) } : {}),
  };
  store.set("perfil", novo);
  return novo;
}

/** Pesagem do dia: grava no histórico e atualiza o perfil (a meta muda junto). */
export function registrarPeso(kg: number, hoje = diaDe(new Date())): PerfilCorpo {
  if (!Number.isFinite(kg) || kg < 30 || kg > 250) throw new Error("peso fora da faixa");
  const pesos = store.get("pesos", []).filter(p => p.data !== hoje);
  pesos.push({ data: hoje, kg: Math.round(kg * 10) / 10 });
  store.set("pesos", pesos.slice(-120));
  return salvarPerfil({ pesoKg: kg });
}

export function registrarCorrida(minutos: number, km?: number, doPlano = true, hoje = diaDe(new Date())): Corrida {
  if (!Number.isFinite(minutos) || minutos <= 0 || minutos > 300) throw new Error("minutos inválidos");
  const c: Corrida = { id: novoId(), data: hoje, minutos: Math.round(minutos), ...(km && km > 0 && km < 100 ? { km: Math.round(km * 100) / 100 } : {}), doPlano };
  store.set("corridas", [...store.get("corridas", []), c].slice(-300));
  return c;
}

export function apagarCorrida(id: string): boolean {
  const todas = store.get("corridas", []);
  if (!todas.some(c => c.id === id)) return false;
  store.set("corridas", todas.filter(c => c.id !== id));
  return true;
}

// ── painel ───────────────────────────────────────────────────────────────────

export interface PainelCorpo {
  treinoHoje: { treino: Treino; feitoHoje: boolean; proximo: string | null } | null;
  treinos: Treino[];
  treinosNoMes: number;
  perfil: PerfilCorpo;
  faltaPerfil: string[];
  meta: MetaDoDia | null;
  corrida: ReturnType<typeof sessaoDoPlano> & { feitaHoje: boolean; ultimas: Corrida[] };
  pesos: { data: string; kg: number }[];
  sugestao: string | null;
}

export function montarPainelCorpo(agora = new Date()): PainelCorpo {
  const hoje = diaDe(agora);
  const treinos = listarTreinos();
  const feitos = store.get("feitos", []);
  const vez = treinoDaVez(treinos, feitos, hoje);
  let proximo: string | null = null;
  if (vez && treinos.length > 1) {
    const i = treinos.findIndex(t => t.id === vez.treino.id);
    proximo = treinos[(i + 1) % treinos.length].nome;
  }
  const perfil = lerPerfil();
  const corridas = store.get("corridas", []);
  const deHoje = corridas.filter(c => c.data === hoje);
  const kcalCorrida = perfil.pesoKg ? deHoje.reduce((s, c) => s + gastoDaCorrida(c.minutos, perfil.pesoKg!, c.km), 0) : 0;
  const mes = hoje.slice(0, 7);
  return {
    treinoHoje: vez ? { ...vez, proximo } : null,
    treinos,
    treinosNoMes: feitos.filter(f => f.data.startsWith(mes)).length,
    perfil,
    faltaPerfil: faltaNoPerfil(perfil),
    meta: metaDoDia(perfil, kcalCorrida),
    corrida: { ...sessaoDoPlano(corridas.filter(c => c.doPlano).length), feitaHoje: deHoje.length > 0, ultimas: corridas.slice(-5).reverse() },
    pesos: store.get("pesos", []).slice(-12),
    sugestao: sugestaoDoPeso(store.get("pesos", []), perfil.objetivo, agora),
  };
}

/** Os dados crus, para o backup. */
export function exportarCorpo(): Dados {
  return { treinos: store.get("treinos", []), feitos: store.get("feitos", []), perfil: lerPerfil(), pesos: store.get("pesos", []), corridas: store.get("corridas", []) };
}
export function importarCorpo(d: Partial<Dados>): void {
  if (Array.isArray(d.treinos)) store.set("treinos", d.treinos);
  if (Array.isArray(d.feitos)) store.set("feitos", d.feitos);
  if (d.perfil && typeof d.perfil === "object") store.set("perfil", { ...PERFIL_PADRAO, ...d.perfil });
  if (Array.isArray(d.pesos)) store.set("pesos", d.pesos);
  if (Array.isArray(d.corridas)) store.set("corridas", d.corridas);
}

// ── puras: pedidos falados (atalho sem modelo) ──────────────────────────────

const sem = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.!?]+$/, "").trim();

/** "treinei hoje", "fiz o treino", "terminei o treino B" → `{ nome? }`. */
export function pedidoDeTreino(texto: string): { nome?: string } | null {
  const t = sem(texto);
  if (/^(ja )?treinei( hoje)?$/.test(t) || /^(ja )?(fiz|terminei|acabei|conclui)( o)? treino( de hoje)?$/.test(t)) return {};
  const m = /^(?:ja )?(?:fiz|terminei|acabei|conclui)(?: o)? (treino [a-z0-9]+)$/.exec(t);
  return m ? { nome: m[1] } : null;
}

/** "corri 20 minutos", "corri 3 km em 25 min", "corri 2,5 quilometros em 20 minutos". */
export function pedidoDeCorrida(texto: string): { minutos: number; km?: number } | null {
  const t = sem(texto);
  if (!/^(ja )?(corri|fiz a corrida|fiz (a )?esteira)\b/.test(t)) return null;
  const minutos = /(\d+)\s*(?:min|minutos?)\b/.exec(t);
  if (!minutos) return null;
  const km = /(\d+(?:[.,]\d+)?)\s*(?:km|quilometros?|kilometros?)\b/.exec(t);
  return { minutos: Number(minutos[1]), ...(km ? { km: Number(km[1].replace(",", ".")) } : {}) };
}

/** "pesei 58 quilos", "estou com 58,5 kg", "meu peso hoje é 58". */
export function pedidoDePeso(texto: string): number | null {
  const t = sem(texto);
  const m = /^(?:hoje )?(?:pesei|me pesei e deu|estou pesando|to pesando|estou com|to com|meu peso(?: hoje)? (?:e|esta|ta))\s+(\d{2,3}(?:[.,]\d)?)\s*(?:kg|quilos?|kilos?)?$/.exec(t);
  if (!m) return null;
  const kg = Number(m[1].replace(",", "."));
  if (kg < 30 || kg > 250) return null;
  // "estou com 60" pode ser qualquer coisa; com "estou com" a unidade é obrigatória.
  if (/^(?:hoje )?(?:estou com|to com)/.test(t) && !/kg|quilo|kilo/.test(t)) return null;
  return kg;
}
