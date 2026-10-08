import Store from "electron-store";
import * as crypto from "node:crypto";

/**
 * Hábitos e metas (fase 16, 07/10). O que mais se elogia em apps de hábito (Streaks,
 * Habitica, Loop): marcar com um toque, ver a sequência (🔥) e não perder o dia por
 * esquecimento. Aqui a Ely faz as três coisas — "marquei academia" pela voz, a sequência na
 * página Hoje dos dois apps, e um lembrete no horário só se ainda não foi feito.
 *
 * Hábito tem DIAS da semana: "academia seg/qua/sex" não quebra a sequência na terça. As
 * contas (sequência, recorde, taxa) são puras e ficam no topo, para teste.
 *
 * Meta é um número a alcançar ("ler 12 livros", "guardar 5000"), com progresso somado.
 */

export interface Habito {
  id: string;
  nome: string;
  icone: string;
  /** 0 = domingo … 6 = sábado. Vazio = todo dia. */
  dias: number[];
  /** "HH:MM" para lembrar, se ainda não foi feito naquele dia. */
  horaLembrete?: string;
  /** Dias feitos, "AAAA-MM-DD" no horário local. */
  marcados: string[];
  criadoEm: number;
  /**
   * Fase 18 (08/10): quantas faltas por semana não quebram a sequência (0 a 2; sem o campo,
   * 1). A pesquisa foi clara: sequência que zera numa falta só gera ansiedade e abandono — o
   * Loop e o Streak Log perdoam; o Habitica, que pune, é o mais citado por cansar.
   */
  folgasPorSemana?: number;
  /** Dias "congelados" (viagem, doença): não contam como feito nem como falta. */
  pausas?: string[];
}

export interface Meta {
  id: string;
  titulo: string;
  alvo: number;
  unidade: string;
  progresso: number;
  /** "AAAA-MM-DD" opcional. */
  prazo?: string;
  criadaEm: number;
  concluidaEm?: number;
}

// ── puras ────────────────────────────────────────────────────────────────────

/** Data local "AAAA-MM-DD" — a chave de um dia, sem fuso no meio. */
export function diaDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function menosDias(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - n);
  return x;
}

/** O hábito vale neste dia da semana? Sem dias marcados = todo dia. */
export function valeNoDia(h: Pick<Habito, "dias">, d: Date): boolean {
  return !h.dias.length || h.dias.includes(d.getDay());
}

/** Vale e não está pausado: é um dia que conta (para sequência, taxa, força). */
export function contaNoDia(h: Pick<Habito, "dias" | "pausas">, d: Date): boolean {
  return valeNoDia(h, d) && !(h.pausas ?? []).includes(diaDe(d));
}

/** A semana de um dia (começa no domingo), como chave — as folgas são por semana. */
function semanaDe(d: Date): string {
  return diaDe(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()));
}

const folgas = (h: Pick<Habito, "folgasPorSemana">) => Math.max(0, Math.min(2, h.folgasPorSemana ?? 1));

export function feitoNoDia(h: Pick<Habito, "marcados">, d: Date): boolean {
  return h.marcados.includes(diaDe(d));
}

/**
 * Sequência atual: dias VÁLIDOS seguidos feitos, contando para trás. Hoje ainda não feito
 * não quebra (o dia não acabou) — a conta começa de ontem nesse caso.
 */
export function sequenciaAtual(h: Pick<Habito, "dias" | "marcados" | "folgasPorSemana" | "pausas">, hoje = new Date()): number {
  let n = 0;
  const usadas = new Map<string, number>();
  for (let i = 0; i < 400; i++) {
    const d = menosDias(hoje, i);
    if (!contaNoDia(h, d)) continue;
    if (feitoNoDia(h, d)) { n++; continue; }
    if (i === 0) continue;
    // Falta: gasta uma folga da semana, se houver (e se já houve algum feito para trás —
    // folga não inventa sequência do nada).
    const s = semanaDe(d);
    const ja = usadas.get(s) ?? 0;
    if (n > 0 && ja < folgas(h)) { usadas.set(s, ja + 1); continue; }
    break;
  }
  return n;
}

/**
 * Força do hábito, de 0 a 100 (o "habit strength" do Loop): uma média que sobe devagar a
 * cada dia feito e desce devagar a cada falta. Uma falta não zera nada — faltar uma vez num
 * hábito forte é um arranhão, não um recomeço. Meia-vida de ~13 dias contados.
 */
export function forca(h: Pick<Habito, "dias" | "marcados" | "pausas" | "criadoEm">, hoje = new Date()): number {
  const alfa = 1 - Math.pow(0.5, 1 / 13);
  const inicio = Math.max(h.criadoEm ?? 0, hoje.getTime() - 180 * 86_400_000);
  let s = 0;
  for (let i = 180; i >= 0; i--) {
    const d = menosDias(hoje, i);
    if (d.getTime() < new Date(new Date(inicio).getFullYear(), new Date(inicio).getMonth(), new Date(inicio).getDate()).getTime()) continue;
    if (!contaNoDia(h, d)) continue;
    const feito = feitoNoDia(h, d);
    if (i === 0 && !feito) continue;
    s += alfa * ((feito ? 1 : 0) - s);
  }
  return Math.round(s * 100);
}

/** Maior sequência já feita. */
export function recorde(h: Pick<Habito, "dias" | "marcados" | "folgasPorSemana" | "pausas">, hoje = new Date()): number {
  if (!h.marcados.length) return 0;
  const primeiro = h.marcados.slice().sort()[0];
  const [a, m, d] = primeiro.split("-").map(Number);
  const inicio = new Date(a, m - 1, d);
  let melhor = 0, atual = 0;
  const usadas = new Map<string, number>();
  for (let x = new Date(inicio); x <= hoje; x.setDate(x.getDate() + 1)) {
    if (!contaNoDia(h, x)) continue;
    if (feitoNoDia(h, x)) { atual++; melhor = Math.max(melhor, atual); continue; }
    if (diaDe(x) === diaDe(hoje)) continue;
    const s = semanaDe(x);
    const ja = usadas.get(s) ?? 0;
    if (atual > 0 && ja < folgas(h)) { usadas.set(s, ja + 1); continue; }
    atual = 0;
  }
  return melhor;
}

/** Fração dos dias válidos dos últimos 30 que foram feitos (hoje só conta se já feito). */
export function taxa30(h: Pick<Habito, "dias" | "marcados" | "pausas">, hoje = new Date()): number {
  let validos = 0, feitos = 0;
  for (let i = 0; i < 30; i++) {
    const d = menosDias(hoje, i);
    if (!contaNoDia(h, d)) continue;
    const feito = feitoNoDia(h, d);
    if (i === 0 && !feito) continue;
    validos++;
    if (feito) feitos++;
  }
  return validos ? feitos / validos : 0;
}

/** Os últimos 30 dias, do mais antigo ao de hoje: true feito, false não feito, null não vale. */
export function mapa30(h: Pick<Habito, "dias" | "marcados" | "pausas">, hoje = new Date()): (boolean | null)[] {
  const out: (boolean | null)[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = menosDias(hoje, i);
    out.push(contaNoDia(h, d) ? feitoNoDia(h, d) : null);
  }
  return out;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "academia", "a academia", "Academia 💪" → o hábito certo. Pura. */
export function acharHabito<T extends Pick<Habito, "nome">>(habitos: T[], nome: string, exato = false): T | undefined {
  const n = semAcento(nome).replace(/^(o|a|os|as|meu|minha)\s+/, "").replace(/[^\p{L}\p{N} ]/gu, "").trim();
  if (!n) return undefined;
  const limpo = (h: T) => semAcento(h.nome).replace(/[^\p{L}\p{N} ]/gu, "").trim();
  // Nome só de emoji vira "" e casaria com qualquer frase — fica de fora.
  const validos = habitos.filter(h => limpo(h).length > 0);
  const igual = validos.find(h => limpo(h) === n);
  if (igual || exato) return igual;
  // Aproximado só no sentido "o nome do hábito contém o que foi dito" e com 3+ letras: o
  // contrário ("a frase contém o nome") marcava "Água" em "marca um lembrete de beber água".
  return n.length >= 3 ? validos.find(h => limpo(h).includes(n)) : undefined;
}

/**
 * "marquei academia", "fiz o hábito leitura", "já fiz a meditação hoje" → nome do hábito.
 * Pura — o fastRoute confere se o nome existe antes de agir.
 */
export function pedidoDeHabito(texto: string): string | null {
  const m = /^\s*(?:marquei|fiz|já fiz|ja fiz|concluí|conclui|completei)\s+(?:o\s+|a\s+)?(?:hábito\s+|habito\s+)?(?:de\s+)?(.{2,40}?)(?:\s+hoje)?\s*[.!]?\s*$/i.exec(texto);
  return m ? m[1].trim() : null;
}

/**
 * "soma 2 na meta leitura", "avança a meta viagem em 200", "mais um na meta livros",
 * "tira 1 da meta X" → { meta, delta }. Pura — o fastRoute confere se a meta existe.
 * O 7B respondia "16 livros" sem chamar a ferramenta (alucinava a conta); o atalho
 * garante a soma de verdade.
 */
export function pedidoDeMeta(texto: string): { meta: string; delta: number } | null {
  const t = texto.trim().replace(/[.!]$/, "");
  const numero = (s: string) => /^(um|uma|mais um|mais uma)$/i.test(s) ? 1 : Number(s.replace(",", "."));
  let m = /^(?:soma|somar|adiciona|acrescenta|põe|poe|coloca|mais)\s+(\d+(?:[.,]\d+)?|um|uma)\s+(?:\w+\s+)?(?:na|à|a)\s+meta\s+(?:de\s+|do\s+|da\s+)?(.{2,60})$/i.exec(t);
  if (m) return { meta: m[2].trim(), delta: numero(m[1]) };
  m = /^(?:avança|avanca|avançar)\s+(?:a\s+)?meta\s+(?:de\s+|do\s+|da\s+)?(.{2,60}?)\s+em\s+(\d+(?:[.,]\d+)?)$/i.exec(t);
  if (m) return { meta: m[1].trim(), delta: numero(m[2]) };
  m = /^(?:tira|tirar|desconta|descontar)\s+(\d+(?:[.,]\d+)?|um|uma)\s+(?:\w+\s+)?da\s+meta\s+(?:de\s+|do\s+|da\s+)?(.{2,60})$/i.exec(t);
  if (m) return { meta: m[2].trim(), delta: -numero(m[1]) };
  return null;
}

/** Soma ao progresso, sem passar do alvo nem ficar negativo. Pura. */
export function somarProgresso(m: Meta, delta: number, agora = Date.now()): Meta {
  const progresso = Math.max(0, Math.min(m.alvo, m.progresso + delta));
  return { ...m, progresso, concluidaEm: progresso >= m.alvo ? (m.concluidaEm ?? agora) : undefined };
}

// ── store ────────────────────────────────────────────────────────────────────

const store = new Store<{ habitos: Habito[]; metas: Meta[]; lembrados: Record<string, string> }>({
  name: "habitos",
  defaults: { habitos: [], metas: [], lembrados: {} },
});

const id = (p: string) => `${p}-${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

export function listarHabitos(): Habito[] { return store.get("habitos", []); }
export function listarMetas(): Meta[] { return store.get("metas", []); }

export interface HabitoResumo extends Habito {
  feitoHoje: boolean;
  valeHoje: boolean;
  sequencia: number;
  recorde: number;
  taxa: number;
  mapa: (boolean | null)[];
  /** Fase 18: força 0–100 e se hoje está pausado. */
  forca: number;
  pausadoHoje: boolean;
}

export function resumirHabito(h: Habito, hoje = new Date()): HabitoResumo {
  return {
    ...h, feitoHoje: feitoNoDia(h, hoje), valeHoje: valeNoDia(h, hoje), sequencia: sequenciaAtual(h, hoje), recorde: recorde(h, hoje), taxa: taxa30(h, hoje), mapa: mapa30(h, hoje),
    forca: forca(h, hoje), pausadoHoje: (h.pausas ?? []).includes(diaDe(hoje)),
  };
}

export function salvarHabito(dados: Partial<Habito> & { nome: string }): Habito {
  const nome = dados.nome.trim().slice(0, 40);
  if (!nome) throw new Error("o hábito precisa de um nome");
  const dias = Array.isArray(dados.dias) ? [...new Set(dados.dias.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  const hora = typeof dados.horaLembrete === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(dados.horaLembrete) ? dados.horaLembrete : undefined;
  const todos = listarHabitos();
  const existente = dados.id ? todos.find(h => h.id === dados.id) : undefined;
  const h: Habito = {
    id: existente?.id ?? id("h"),
    nome,
    icone: (dados.icone ?? existente?.icone ?? "check").slice(0, 24),
    dias,
    horaLembrete: hora,
    marcados: existente?.marcados ?? [],
    criadoEm: existente?.criadoEm ?? Date.now(),
    folgasPorSemana: Number.isInteger(dados.folgasPorSemana) ? Math.max(0, Math.min(2, dados.folgasPorSemana!)) : existente?.folgasPorSemana,
    pausas: existente?.pausas,
  };
  store.set("habitos", existente ? todos.map(x => x.id === h.id ? h : x) : [...todos, h]);
  return h;
}

export function apagarHabito(habitoId: string): boolean {
  const antes = listarHabitos();
  const depois = antes.filter(h => h.id !== habitoId);
  store.set("habitos", depois);
  return depois.length !== antes.length;
}

/** Marca (ou desmarca) um dia. Sem `dia`, hoje. */
export function marcarHabito(habitoId: string, feito = true, dia = diaDe(new Date())): Habito | null {
  const todos = listarHabitos();
  const h = todos.find(x => x.id === habitoId);
  if (!h) return null;
  const marcados = feito ? [...new Set([...h.marcados, dia])].sort() : h.marcados.filter(d => d !== dia);
  // Guarda só o último ano — o mapa e as contas não olham mais longe que isso.
  const novo = { ...h, marcados: marcados.slice(-400) };
  store.set("habitos", todos.map(x => x.id === h.id ? novo : x));
  return novo;
}

/** Congela (ou descongela) um dia: viagem, doença — nem feito nem falta. */
export function pausarHabito(habitoId: string, pausar = true, dia = diaDe(new Date())): Habito | null {
  const todos = listarHabitos();
  const h = todos.find(x => x.id === habitoId);
  if (!h) return null;
  const atuais = h.pausas ?? [];
  const pausas = pausar ? [...new Set([...atuais, dia])].sort().slice(-120) : atuais.filter(d => d !== dia);
  const novo = { ...h, pausas: pausas.length ? pausas : undefined };
  store.set("habitos", todos.map(x => x.id === h.id ? novo : x));
  return novo;
}

export function salvarMeta(dados: Partial<Meta> & { titulo: string; alvo: number }): Meta {
  const titulo = dados.titulo.trim().slice(0, 60);
  if (!titulo) throw new Error("a meta precisa de um título");
  if (!(dados.alvo > 0)) throw new Error("o alvo precisa ser maior que zero");
  const todas = listarMetas();
  const existente = dados.id ? todas.find(m => m.id === dados.id) : undefined;
  // Sem a chave `prazo` (o celular não manda), fica o que já estava; "" apaga de propósito.
  const prazo = typeof dados.prazo === "string" ? (/^\d{4}-\d{2}-\d{2}$/.test(dados.prazo) ? dados.prazo : undefined) : existente?.prazo;
  const m: Meta = somarProgresso({
    id: existente?.id ?? id("m"),
    titulo,
    alvo: dados.alvo,
    unidade: (dados.unidade ?? existente?.unidade ?? "").slice(0, 16),
    progresso: existente?.progresso ?? Math.max(0, dados.progresso ?? 0),
    prazo,
    criadaEm: existente?.criadaEm ?? Date.now(),
    concluidaEm: existente?.concluidaEm,
  }, 0);
  store.set("metas", existente ? todas.map(x => x.id === m.id ? m : x) : [...todas, m]);
  return m;
}

export function apagarMeta(metaId: string): boolean {
  const antes = listarMetas();
  const depois = antes.filter(m => m.id !== metaId);
  store.set("metas", depois);
  return depois.length !== antes.length;
}

export function avancarMeta(metaId: string, delta: number): Meta | null {
  const todas = listarMetas();
  const m = todas.find(x => x.id === metaId);
  if (!m || !Number.isFinite(delta)) return null;
  const nova = somarProgresso(m, delta);
  store.set("metas", todas.map(x => x.id === m.id ? nova : x));
  return nova;
}

/**
 * Hábitos para lembrar AGORA: o horário bate, vale hoje, não foi feito e ainda não foi
 * lembrado hoje. Marca como lembrado — chamar duas vezes no mesmo minuto não repete.
 */
export function habitosParaLembrar(agora = new Date()): Habito[] {
  const hhmm = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  const hoje = diaDe(agora);
  const lembrados = { ...store.get("lembrados", {}) };
  const out = listarHabitos().filter(h => h.horaLembrete === hhmm && valeNoDia(h, agora) && !feitoNoDia(h, agora) && lembrados[h.id] !== hoje);
  for (const h of out) lembrados[h.id] = hoje;
  if (out.length) store.set("lembrados", lembrados);
  return out;
}

/** Backup (bloco 96): junta sem duplicar pelo id. */
export function importarHabitos(habitos: Habito[] = [], metas: Meta[] = []): number {
  const hs = listarHabitos(), ms = listarMetas();
  const novosH = habitos.filter(h => h?.id && h.nome && !hs.some(x => x.id === h.id));
  const novosM = metas.filter(m => m?.id && m.titulo && !ms.some(x => x.id === m.id));
  store.set("habitos", [...hs, ...novosH]);
  store.set("metas", [...ms, ...novosM]);
  return novosH.length + novosM.length;
}
