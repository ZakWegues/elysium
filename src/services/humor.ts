/**
 * Como ele parece estar, pelo jeito que escreveu ou falou (fase 19, bloco 187). Puro.
 *
 * Gemini Live e Pi são elogiados por isto: o tom da resposta acompanha o de quem fala. Aqui
 * é léxico PT-BR + sinais de escrita (caixa alta, "!!!"), sem chamar modelo nenhum — cada
 * pedido já espera o cérebro uma vez, e uma segunda chamada só para medir humor dobraria a
 * espera na voz.
 *
 * Regras que vieram de caso real ou óbvio de errar:
 *  - "cansei de esperar" é irritação, não cansaço — "cansei" fica fora do léxico de cansaço;
 *  - "toca de novo" é pedido, não frustração — "de novo" só conta com "isso"/"?!"/"não";
 *  - "passei mal" não é comemoração; "boa noite" não é "boa!";
 *  - "que saco"/"que droga" sim, "saco de lixo" não.
 *
 * 🔴 O humor vive só no pedido atual. Nunca vai para a memória: a extração de fatos
 * (`aprendizado.ts`) já descarta estados passageiros, e guardar "o Zak estava triste dia 8"
 * seria exatamente o tipo de coisa que ninguém quer ver lembrado depois.
 */

export type Humor = "neutro" | "frustrado" | "triste" | "cansado" | "apressado" | "animado";

function sem(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const FRUSTRADO = /\b(aff+|af{2,}|pqp|porra|caralho|merda|que saco|que droga|que odio|odeio isso|nao funciona|nao ta funcionando|nao esta funcionando|nao deu certo|parou de funcionar|tu e burra|voce e burra|que burra|inutil|ta errado|esta errado|de novo isso|outra vez isso|que raiva|irritad[oa]|estressad[oa]|pelo amor de deus)\b/;
const TRISTE = /\b(to triste|tou triste|estou triste|fiquei triste|ando triste|chatead[oa]|desanimad[oa]|deprimid[oa]|depre|(?:to|tou|estou|me sinto|me sentindo|ando) sozinh[oa]|chorando|chorei|dia (pessimo|horrivel|ruim|de merda)|to mal|tou mal|estou mal|me sentindo mal|tudo da errado|nada da certo)\b/;
const CANSADO = /\b(cansad[oa]|exaust[oa]|esgotad[oa]|morto de sono|morta de sono|morrendo de sono|com sono|to morto|to morta|tou morto|destruid[oa] hoje|sem energia|moid[oa])\b/;
const APRESSADO = /\b(rapidinho|(?:seja|responde|responda|fala|fale) rapido|^rapido|depressa|urgente|to atrasad[oa]|tou atrasad[oa]|estou atrasad[oa]|atrasadissim[oa]|sem tempo|to correndo|tou correndo|estou correndo|agora mesmo|anda logo)\b/;
const ANIMADO = /\b(consegui|passei na|passei no|fui aprovad[oa]|uhu+l?|eba+|que massa|to feliz|tou feliz|estou feliz|que alegria|ganhei)\b/;

// Com pontuação no fim: o `\b` depois de "!" não casa no fim da frase, então ficam à parte.
const FRUSTRADO_PONTUADO = /\b(droga!|de novo\?!)/;
const ANIMADO_PONTUADO = /\b(aprovad[oa]|boa+|incrivel|demais|finalmente)!/;

/** Mais de 70% das letras em maiúscula, com pelo menos 8 letras: gritando. */
function gritando(texto: string): boolean {
  const letras = texto.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letras.length < 8) return false;
  const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, "").length;
  return maiusculas / letras.length > 0.7;
}

export function lerHumor(texto: string): Humor {
  const t = sem(texto ?? "");
  if (!t.trim()) return "neutro";
  // A ordem decide o empate: irritação e tristeza pedem mais cuidado que pressa ou festa.
  if (FRUSTRADO.test(t) || FRUSTRADO_PONTUADO.test(t) || gritando(texto) || (/[?!]{3,}/.test(texto) && /\bnao\b/.test(t))) return "frustrado";
  if (TRISTE.test(t)) return "triste";
  if (CANSADO.test(t)) return "cansado";
  if (APRESSADO.test(t)) return "apressado";
  // "não consegui", "nem passei" são o contrário de festa.
  if ((ANIMADO.test(t) && !/\b(nao|nem|nunca) (consegui|passei|ganhei|fui aprovad)/.test(t)) || ANIMADO_PONTUADO.test(t)) return "animado";
  return "neutro";
}

/** A linha que entra no prompt da conversa, ou "" quando neutro. */
export function linhaDoHumor(humor: Humor): string {
  switch (humor) {
    case "frustrado": return "[TOM] Ele parece irritado ou frustrado: seja breve e prática, vá direto à solução, sem piada e sem se justificar.";
    case "triste":    return "[TOM] Ele parece desanimado: seja gentil e humana, sem humor seco. Uma frase de apoio cabe, sem exagero e sem virar terapeuta.";
    case "cansado":   return "[TOM] Ele parece cansado: tom calmo, resposta curta e sem enrolação.";
    case "apressado": return "[TOM] Ele está com pressa: responda com o mínimo de palavras.";
    case "animado":   return "[TOM] Ele está animado: pode acompanhar a energia, com leveza.";
    default:          return "";
  }
}
