import { hhmm } from "./hora";

/**
 * O "momento" da conversa (fase 19, bloco 186). Puro, para teste.
 *
 * Até aqui o prompt de CONVERSA não sabia que dia nem que hora era — só o do agente e o do
 * roteador sabiam. Perguntar "que dia cai sexta?" ou "ainda dá tempo de estudar hoje?" no
 * chat fazia o modelo chutar. E uma pessoa de verdade percebe o contexto sem ninguém dizer:
 * é madrugada, é sábado, faz um dia que vocês não se falam, ele está no modo foco.
 *
 * O texto é escrito como OBSERVAÇÃO para o modelo, não como ordem de comentar: a Ely usa se
 * couber ("ainda acordado?") e ignora no resto. Comentar a hora em toda resposta vira tique.
 */

export interface OpcoesMomento {
  /** Tempo, em ms, desde a conversa anterior a este pedido (0 ou ausente = conversa seguida). */
  ausenciaMs?: number;
  focoAtivo?: boolean;
}

const HORA = 3_600_000;

export function periodoDoDia(h: number): "madrugada" | "manhã" | "tarde" | "noite" {
  if (h < 5) return "madrugada";
  if (h < 12) return "manhã";
  if (h < 18) return "tarde";
  return "noite";
}

/** "6 horas", "2 dias" — a ausência em palavras, arredondada para baixo. */
export function ausenciaEmPalavras(ms: number): string {
  const horas = Math.floor(ms / HORA);
  if (horas < 24) return horas === 1 ? "1 hora" : `${horas} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

export function contextoDoMomento(agora: Date, opcoes: OpcoesMomento = {}): string {
  const data = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hora = hhmm(agora);
  const periodo = periodoDoDia(agora.getHours());
  const linhas = [`[MOMENTO] Agora é ${data}, ${hora} (${periodo}).`];

  if (periodo === "madrugada") linhas.push("É madrugada: prefira respostas curtas e calmas. Se fizer sentido, pode notar com leveza que ele está acordado tarde — uma vez, sem sermão.");
  const dia = agora.getDay();
  if (dia === 0 || dia === 6) linhas.push("É fim de semana.");
  if ((opcoes.ausenciaMs ?? 0) >= 6 * HORA) {
    linhas.push(`Vocês não conversavam havia ${ausenciaEmPalavras(opcoes.ausenciaMs!)}: se a mensagem for um cumprimento, pode cumprimentar de volta com naturalidade; se for um pedido, só atenda.`);
  }
  if (opcoes.focoAtivo) linhas.push("Ele está no modo foco: seja breve e não puxe assunto.");
  return linhas.join("\n");
}
