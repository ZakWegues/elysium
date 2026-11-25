import { getConfig, setOverride } from "../main/config";
import { emFrase, semAcento } from "./texto";

/** Os assuntos do briefing (25/11): do dono, pela voz ou em Ajustes. Antes eram três, fixos. */
export const ASSUNTOS_PADRAO = ["IA", "Cinema", "Em alta", "Jogos", "GitHub"];
const MAXIMO = 10;

export function assuntosDoBriefing(): string[] {
  const l = getConfig().assuntosBriefing;
  return Array.isArray(l) ? limparAssuntos(l) : ASSUNTOS_PADRAO;
}
/** Pura. */
export function limparAssuntos(l: unknown[]): string[] {
  const vistos = new Set<string>();
  return l.filter((x): x is string => typeof x === "string").map((x) => x.replace(/\s+/g, " ").trim().slice(0, 60)).filter((x) => x.length >= 2 && !vistos.has(semAcento(x)) && !!vistos.add(semAcento(x))).slice(0, MAXIMO);
}

export type TipoDeAssunto = "github" | "ports" | "jogos" | "pesquisa";
/** De onde vem cada assunto. Pura. */
export function tipoDoAssunto(a: string): TipoDeAssunto {
  const t = semAcento(a);
  if (/\bgit ?hub\b/.test(t)) return "github";
  if (/\bports?\b/.test(t) && /\bgta|portwatch\b/.test(t) || /portwatch/.test(t)) return "ports";
  if (/\b(?:jogos?|games?)\b/.test(t)) return "jogos";
  return "pesquisa";
}

/** "põe os ports do GTA 6 no briefing", "tira cinema do briefing", "o que tem no briefing?". Pura. */
export function pedidoDeAssunto(texto: string): { acao: "por" | "tirar"; assunto: string } | { acao: "listar" } | null {
  const t = texto.trim().replace(/[.!?]+$/, "").replace(/^(?:ely|elysium)[,\s]+/i, "");
  const por = /^(?:p[oõ]e|ponha|coloca|coloque|bota|inclui|inclua|adiciona|adicione)\s+(?:tamb[eé]m\s+)?(?:o assunto\s+|a parte d[eo]\s+)?(.{2,60}?)\s+(?:no|ao|nos?)\s+(?:meu\s+)?(?:briefing|resumo do dia)$/i.exec(t);
  if (por) return { acao: "por", assunto: por[1].replace(/^(?:os|as|o|a|sobre)\s+/i, "").trim() };
  const tirar = /^(?:tira|tire|remove|remova|exclui)\s+(?:o assunto\s+)?(.{2,60}?)\s+d[oe]\s+(?:meu\s+)?(?:briefing|resumo do dia)$/i.exec(t);
  if (tirar) return { acao: "tirar", assunto: tirar[1].replace(/^(?:os|as|o|a)\s+/i, "").trim() };
  if (t.length < 60 && /^(?:o que|quais)\b.*\bbriefing$/i.test(t)) return { acao: "listar" };
  return null;
}

/** Muda a lista e devolve a fala. */
export function aplicarPedidoDeAssunto(p: NonNullable<ReturnType<typeof pedidoDeAssunto>>): string {
  const atual = assuntosDoBriefing();
  if (p.acao === "listar") return `No briefing: ${emFrase(atual)}.`;
  if (p.acao === "tirar") {
    const fica = atual.filter((a) => !semAcento(a).includes(semAcento(p.assunto)));
    if (fica.length === atual.length) return `Não achei ${p.assunto} no briefing. Hoje tem ${emFrase(atual)}.`;
    setOverride({ assuntosBriefing: fica });
    return `Tirei ${p.assunto} do briefing.`;
  }
  if (atual.some((a) => semAcento(a) === semAcento(p.assunto))) return `${p.assunto} já está no briefing.`;
  if (atual.length >= MAXIMO) return `O briefing já tem ${MAXIMO} assuntos. Tire um antes.`;
  setOverride({ assuntosBriefing: [...atual, p.assunto[0].toLocaleUpperCase("pt-BR") + p.assunto.slice(1)] });
  return `Pronto, ${p.assunto} entra no briefing. Já estou buscando o de hoje.`;
}
