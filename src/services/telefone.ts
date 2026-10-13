import { getBlandKey, getConfig, nomeDoUsuario } from "../main/config";

/**
 * O telefone da Ely (13/10, pedido do Zak): ela LIGA para o celular dele pela Bland AI
 * (api.bland.ai) — "Ely, me liga", "me liga daqui a 20 minutos e me lembra de tirar o bolo".
 *
 * A chave da Bland e o número dele moram só no app (a chave cifrada pelo safeStorage, ao lado
 * da chave da Groq; o número no config): ele cola em Ajustes → Telefone. Nada disso vai para o
 * código, o git ou o handoff.
 *
 * Quem fala na ligação é o agente de voz da própria Bland, com o roteiro (`task`) montado aqui
 * na persona da Ely: português, curto, dá o recado, responde o que ele perguntar sobre isso e
 * desliga. Cada minuto custa crédito na conta da Bland — por isso a ligação só sai de pedido
 * dele (ou de uma ligação que ele agendou), e tem teto de duração.
 *
 * Fora daqui (fica para depois): atender ligação (precisa comprar um número na Bland e um
 * webhook público) e agendamento que sobrevive a reiniciar o PC.
 */

const API = "https://api.bland.ai/v1/calls";
const MAX_MINUTOS = 5;

/** "(55) 12 9 8161-5938", "12981615938", "+55 12 98161 5938" → "+5512981615938". Pura. */
export function normalizarTelefone(bruto: string): string | null {
  const d = String(bruto ?? "").replace(/\D/g, "");
  // Com "+", o código do país veio junto: vale como está.
  if (String(bruto ?? "").trim().startsWith("+")) return d.length >= 10 && d.length <= 15 ? `+${d}` : null;
  if (d.length === 10 || d.length === 11) return `+55${d}`; // DDD + número, sem o país
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `+${d}`;
  return null;
}

/** "+55 •• •••••-5938" — o que a tela mostra. Pura. */
export function telefoneMascarado(e164: string): string {
  return e164.length > 4 ? `${e164.slice(0, 3)} •• •••••-${e164.slice(-4)}` : "";
}

/** O roteiro da ligação, na persona da Ely. Pura. */
export function roteiroDaLigacao(mensagem: string, dados: { nome: string; tratamento: string }): { task: string; first_sentence: string } {
  const t = dados.tratamento.trim();
  const quem = dados.nome.trim() || "o dono do PC";
  const msg = mensagem.trim();
  const oi = `Oi${t ? `, ${t}` : ""}! Aqui é a Ely.`;
  return {
    first_sentence: msg ? `${oi} ${msg.length > 160 ? "Tenho um recado para você." : msg}` : `${oi} Você pediu para eu ligar.`,
    task: [
      `Você é a Ely, a assistente de voz do ELYSIUM, ligando para ${quem} no celular dele. Fale sempre em português do Brasil, no feminino, com o jeito da FRIDAY do Tony Stark: confiante, calorosa, humor seco na medida, frases curtas.`,
      msg ? `O motivo da ligação, que você precisa dar: "${msg}".` : "Ele pediu para você ligar; pergunte em que pode ajudar.",
      t ? `Pode chamá-lo de "${t}" de vez em quando.` : "",
      "Depois de dar o recado, responda o que ele perguntar sobre isso. Se ele pedir algo que só dá para fazer no PC, diga que vai deixar anotado no ELYSIUM.",
      "Não invente informação. Quando ele se despedir ou o assunto acabar, despeça-se rapidinho e desligue.",
    ].filter(Boolean).join(" "),
  };
}

export function estadoTelefone(): { configurado: boolean; temChave: boolean; numero: string } {
  const numero = normalizarTelefone(getConfig().telefoneDono ?? "");
  const temChave = Boolean(getBlandKey());
  return { configurado: temChave && !!numero, temChave, numero: numero ? telefoneMascarado(numero) : "" };
}

/** Liga agora. Devolve a fala para a Ely ("Ligando para você."). */
export async function ligarParaDono(mensagem = ""): Promise<string> {
  const cfg = getConfig();
  const chave = getBlandKey();
  const numero = normalizarTelefone(cfg.telefoneDono ?? "");
  if (!chave || !numero) return "O telefone ainda não está configurado: cole a chave da Bland e o seu número em Ajustes → Telefone.";
  const roteiro = roteiroDaLigacao(mensagem, { nome: nomeDoUsuario(), tratamento: cfg.tratamento ?? "" });
  const corpo: Record<string, unknown> = {
    phone_number: numero,
    task: roteiro.task,
    first_sentence: roteiro.first_sentence,
    language: "pt-BR",
    max_duration: MAX_MINUTOS,
    wait_for_greeting: true,
  };
  if (cfg.telefoneVoz?.trim()) corpo.voice = cfg.telefoneVoz.trim();
  let r: Response;
  try {
    r = await fetch(API, { method: "POST", headers: { authorization: chave, "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    return `Não consegui falar com a Bland: ${e instanceof Error ? e.message : String(e)}`;
  }
  let j: { status?: string; message?: string; call_id?: string; errors?: unknown } = {};
  try { j = await r.json(); } catch { /* corpo vazio */ }
  if (!r.ok || j.status !== "success") {
    console.warn(`[telefone] a Bland recusou (${r.status})`);
    if (r.status === 401 || r.status === 403) return "A Bland recusou a chave. Confira em Ajustes → Telefone.";
    if (r.status === 402 || /credit|balance|saldo/i.test(String(j.message))) return "A conta da Bland está sem crédito para ligar.";
    return `A Bland não ligou: ${String(j.message ?? `erro ${r.status}`).slice(0, 160)}`;
  }
  console.log("[telefone] ligação na fila");
  return "Ligando para o seu celular.";
}

// Ligações agendadas ("me liga daqui a 20 minutos"): em memória — reiniciar o PC perde.
const agendadas = new Map<number, NodeJS.Timeout>();
let proximoId = 1;

export function agendarLigacao(minutos: number, mensagem: string, aoLigar: (fala: string) => void): string {
  const m = Math.round(Number(minutos));
  if (!Number.isFinite(m) || m < 1 || m > 24 * 60) return "Consigo agendar a ligação de 1 minuto a 24 horas.";
  const id = proximoId++;
  agendadas.set(id, setTimeout(() => { agendadas.delete(id); void ligarParaDono(mensagem).then(aoLigar); }, m * 60_000));
  const quando = m < 60 ? `${m} ${m === 1 ? "minuto" : "minutos"}` : `${Math.floor(m / 60)} h${m % 60 ? ` e ${m % 60} min` : ""}`;
  return `Combinado: te ligo daqui a ${quando}. Se o PC desligar antes, a ligação se perde.`;
}

export function cancelarLigacoesAgendadas(): number {
  const n = agendadas.size;
  for (const t of agendadas.values()) clearTimeout(t);
  agendadas.clear();
  return n;
}

const NUMEROS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, cinco: 5, dez: 10, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50 };

/**
 * "me liga", "Ely, me liga agora", "me liga daqui a 20 minutos", "me liga em meia hora pra me
 * lembrar de tirar o bolo", "me liga e me lembra de X". Frase que começa assim; o resto vira o
 * recado. Pura.
 */
export function pedidoDeLigacao(texto: string): { mensagem: string; minutos?: number } | null {
  const t = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.!?]+$/, "").replace(/^(ely|elysium)[, ]+/, "").trim();
  const m = /^(?:me liga|liga pra mim|liga para mim|me ligue)(?: agora)?(?: (?:daqui a|daqui|em|dentro de) (meia hora|\d{1,4}|[a-z]+) ?(minutos?|min|horas?|h)?)?(?:[, ]+(?:e |pra |para |que )?(?:me )?(?:lembra(?:r)? (?:de |que )?|avisa(?:r)? (?:que |de )?|diz(?:er)? (?:que )?|fala(?:r)? (?:que |de )?)?(.+))?$/.exec(t);
  if (!m) return null;
  let minutos: number | undefined;
  if (m[1]) {
    if (m[1] === "meia hora") minutos = 30;
    else {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMEROS[m[1]];
      if (!n) return null;
      minutos = /^h/.test(m[2] ?? "") ? n * 60 : n;
    }
  }
  // O recado com a grafia original (acentos), do mesmo ponto em diante.
  let mensagem = "";
  if (m[3]) {
    const i = t.lastIndexOf(m[3]);
    mensagem = i >= 0 ? texto.trim().replace(/[.!?]+$/, "").slice(texto.trim().length - (t.length - i)) : m[3];
    mensagem = mensagem.charAt(0).toUpperCase() + mensagem.slice(1);
  }
  return { mensagem, ...(minutos ? { minutos } : {}) };
}
