import { isoLocal } from "../hora";
import { blocoDeInstrucoes, Canal, estiloValido, regrasDaConversa } from "../estiloResposta";
import { linhaDoHumor, lerHumor } from "../humor";
import { blocoDoModo, Modo } from "../modos";

/**
 * O rosto da Ely por cima do Hermes (fase 21, bloco 213).
 *
 * O `SOUL.md` do perfil `ely` fixa QUEM ela é (nome, feminino, tom FRIDAY, regras de
 * ferramenta). O que muda a cada pedido vai aqui, num bloco `[CONTEXTO DO ELYSIUM]` antes do
 * texto dele: a hora, o canal (voz = curto e sem markdown), o humor percebido, o modo ligado e
 * as instruções do dono. A persona inteira vai só no primeiro turno da sessão; depois, só o que
 * muda — cada turno a mais custa tokens no OpenRouter.
 *
 * Memória pessoal NÃO entra por padrão (`hermesContextoPessoal` desligado): o Hermes manda o
 * texto para um modelo de terceiros. Pura, para teste.
 */

export interface DadosDaPersona {
  nome: string;
  tratamento: string;
  estilo: string;
  instrucoes: string;
  modo: Modo | null;
  /** Memória pessoal, só quando o dono ligou `hermesContextoPessoal`. */
  memoria?: string;
}

export function contextoDoTurno(pedido: string, canal: Canal, d: DadosDaPersona, primeiro: boolean, agora = new Date()): string {
  const data = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const linhas: string[] = [];
  if (primeiro) {
    const dono = d.nome.trim() ? `o ${d.nome.trim()}` : "o dono do PC";
    linhas.push(`Você é a Ely, a assistente de ${dono}, falando pelo ELYSIUM.`);
    const t = d.tratamento.trim();
    if (t) linhas.push(`Pode chamá-lo de "${t}" de vez em quando, nunca em toda resposta.`);
  }
  linhas.push(`Agora: ${data}, ${hora} (ISO local ${isoLocal(agora)}).`);
  linhas.push(canal === "voz" ? "Canal: VOZ." : "Canal: TEXTO (chat).");
  linhas.push(regrasDaConversa(canal, estiloValido(d.estilo)));
  const humor = linhaDoHumor(lerHumor(pedido));
  if (humor) linhas.push(humor.trim());
  const modo = blocoDoModo(d.modo, canal).trim();
  if (modo) linhas.push(modo);
  const instr = blocoDeInstrucoes(d.instrucoes).trim();
  if (instr && primeiro) linhas.push(instr);
  if (d.memoria?.trim()) linhas.push(d.memoria.trim());
  return `[CONTEXTO DO ELYSIUM — não responda a isto nem o repita]\n${linhas.join("\n")}\n[FIM DO CONTEXTO]\n\n${pedido}`;
}
