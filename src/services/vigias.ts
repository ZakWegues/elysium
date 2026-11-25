import * as crypto from "node:crypto";
import Store from "electron-store";
import { estadoDoCi } from "./github";
import { semAcento } from "./texto";
import { searchWeb } from "./webSearch";

/**
 * Vigias (25/11): "me avisa quando sair X", "quando o preço de X baixar", "quando o CI do app passar".
 * Ela confere de tempos em tempos e avisa uma vez. Pesquisa é a cada 4 h (não serve para placar ao
 * vivo, e ela diz isso); CI, a cada 5 min.
 */
export interface Vigia { id: string; tipo: "web" | "ci"; pedido: string; alvo: string; criadoEm: number; conferidoEm: number }
const MAXIMO = 8;
const WEB_MS = 4 * 3_600_000, CI_MS = 5 * 60_000, VALIDADE_MS = 60 * 86_400_000;

/** Pura. */
export function pedeVigia(texto: string): { tipo: "web" | "ci"; alvo: string } | null {
  const t = texto.trim().replace(/[.!?]+$/, "").replace(/^(?:ely|elysium)[,\s]+/i, "");
  const m = /^(?:me avis[ae]|avis[ae]-?me|avis[ae]|fica de olho e me avisa|vigia e me avisa|quero saber)\s+(?:quando|assim que|se)\s+(.{4,140})$/i.exec(t);
  if (!m) return null;
  const alvo = m[1].trim(), s = semAcento(alvo);
  const ci = /\b(?:ci|build|actions?)\b.*?\b(?:d[oae]|em)\s+([\w.-]{2,60})\b/i.exec(alvo);
  if (ci && /\b(?:passar|falhar|terminar|acabar|quebrar|ficar verde)\b/.test(s)) return { tipo: "ci", alvo: ci[1] };
  // Só coisa do mundo que se acha pesquisando; o que é do PC (download, CPU, bateria) segue o caminho de sempre.
  if (/\b(?:download|cpu|memoria|ram|bateria|celular|pc|computador|programa|janela|arquivo|chegar|eu|minha|meu)\b/.test(s)) return null;
  return /\b(?:sair|saia|lancar|lancado|lancada|lancarem|for lancad\w|anunciar\w*|anunciad\w|estrear\w*|estreia|baixar|abaixar|cair|voltar\w*|confirmar\w*|confirmad\w|abrir\w* as? (?:inscric|venda|pre)|tiver (?:data|novidade|trailer|promoc))/.test(s) ? { tipo: "web", alvo } : null;
}

/** "SIM — saiu ontem…" → a frase; NÃO ou dúvida → null. Pura. */
export function lerVeredito(r: string): string | null {
  const t = r.trim().replace(/^\*+|\*+$/g, "");
  const m = /^\**sim\**\s*[:.,;—–-]*\s*(.+)$/is.exec(t);
  return m && m[1].trim().length > 8 && !/\b(?:ainda não|não há confirma|rumor|sem confirma)/i.test(m[1]) ? m[1].replace(/\s+/g, " ").trim().slice(0, 300) : null;
}

const store = new Store<{ vigias: Vigia[] }>({ name: "vigias", defaults: { vigias: [] } });
export function listarVigias(agora = Date.now()): Vigia[] { return store.get("vigias").filter((v) => agora - v.criadoEm < VALIDADE_MS); }

export function criarVigia(p: { tipo: "web" | "ci"; alvo: string }, pedido: string, agora = Date.now()): string {
  const l = listarVigias(agora);
  if (l.some((v) => semAcento(v.alvo) === semAcento(p.alvo))) return "Já estou de olho nisso.";
  if (l.length >= MAXIMO) return `Já estou vigiando ${MAXIMO} coisas. Diga "para de vigiar" e o nome de uma.`;
  store.set("vigias", [...l, { id: crypto.randomBytes(4).toString("hex"), ...p, pedido: pedido.slice(0, 200), criadoEm: agora, conferidoEm: 0 }]);
  return p.tipo === "ci" ? `De olho no CI de ${p.alvo}. Aviso assim que mudar.` : `De olho: ${p.alvo}. Confiro algumas vezes por dia e te aviso.`;
}

/** "o que você está vigiando?", "para de vigiar X". null = não é daqui. */
export function comandoDeVigia(texto: string): string | null {
  const t = semAcento(texto).replace(/[?.!]+$/, "").trim();
  if (/^(?:o que|quais) .{0,20}\b(?:vigiando|de olho|vigias)\b/.test(t)) {
    const l = listarVigias();
    return l.length ? `Estou de olho em: ${l.map((v) => (v.tipo === "ci" ? `CI de ${v.alvo}` : v.alvo)).join("; ")}.` : "Não estou vigiando nada.";
  }
  const p = /^(?:para|pare|cancela) (?:de |a )?(?:vigiar|vigia|ficar de olho)(?: (?:em|n[oa]|d[oea]s?|o|a))?\s*(.*)$/.exec(t);
  if (!p) return null;
  const l = listarVigias();
  const alvo = p[1].trim();
  const fica = alvo ? l.filter((v) => !semAcento(v.alvo).includes(alvo)) : [];
  if (alvo && fica.length === l.length) return "Não achei essa vigia.";
  store.set("vigias", fica);
  return alvo ? "Parei de vigiar isso." : "Parei de vigiar tudo.";
}

const ciAntes = new Map<string, string>();
/** Confere as que estão na hora (uma pesquisa por vez). Devolve o que avisar. */
export async function conferirVigias(agora = Date.now()): Promise<{ titulo: string; corpo: string }[]> {
  const avisos: { titulo: string; corpo: string }[] = [];
  const vivos = listarVigias(agora);
  let mudou = vivos.length !== store.get("vigias").length;
  const acabaram = new Set<string>();
  const pendentes = vivos.filter((v) => agora - v.conferidoEm >= (v.tipo === "ci" ? CI_MS : WEB_MS));
  const web = pendentes.filter((v) => v.tipo === "web").sort((a, b) => a.conferidoEm - b.conferidoEm).slice(0, 1);
  for (const v of [...pendentes.filter((x) => x.tipo === "ci"), ...web]) {
    v.conferidoEm = agora; mudou = true;
    try {
      if (v.tipo === "ci") {
        const e = await estadoDoCi(v.alvo), antes = ciAntes.get(v.id);
        if (e) ciAntes.set(v.id, e);
        else { avisos.push({ titulo: `CI de ${v.alvo}`, corpo: "Não achei CI com esse nome nos seus repositórios recentes. Parei de vigiar." }); acabaram.add(v.id); }
        if (e && antes && e !== antes && e !== "PENDING") { avisos.push({ titulo: `CI de ${v.alvo}`, corpo: e === "SUCCESS" ? "Passou." : "Falhou." }); acabaram.add(v.id); }
      } else {
        const r = await searchWeb(`Responda começando com SIM ou NÃO e uma frase com data e nomes. Só SIM com confirmação oficial. Já aconteceu: ${v.alvo}?`);
        const frase = lerVeredito(r);
        if (frase) { avisos.push({ titulo: "Você pediu para avisar", corpo: frase }); acabaram.add(v.id); }
      }
    } catch { /* tenta na próxima */ }
  }
  if (mudou) store.set("vigias", vivos.filter((v) => !acabaram.has(v.id)));
  return avisos;
}
