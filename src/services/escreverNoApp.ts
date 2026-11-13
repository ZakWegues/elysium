import { semAcento } from "./texto";
import type { Janela } from "../actions/janelas";

/**
 * "Escreve X no Chrome / pro Claude Code / na barra de pesquisa" (13/11, pedido do dono, o que o
 * Roamies faz): ESCREVE de verdade no programa — não salva um .txt nem se recusa. Quando o texto é um
 * prompt para outra IA (Claude Code, ChatGPT, Cursor…), uma mensagem ou um e-mail, ele sai melhorado
 * (claro, completo, na intenção dele); texto curto ou literal ("bom dia", entre aspas, "exatamente")
 * vai do jeito que ele disse.
 *
 * Aqui ficam só o reconhecer o pedido e o achar a janela; quem escreve (ler → preencher → conferir)
 * é o agente de tela (agenteDeTela.ts).
 */

const norm = (t: string) => semAcento(t).toLowerCase().replace(/\s+/g, " ").trim();

/** Ele pediu para escrever/digitar algo EM algum lugar (um programa, um campo, "aqui")? Puro. */
export function pediuParaEscrever(texto: string): boolean {
  const t = norm(texto);
  if (!/\b(escreve|escreva|escrever|digita|digite|digitar|cola|cole|colar|redige|redija|preenche|preencha|manda|mande|pesquisa|pesquise|busca|busque)\b/.test(t)) return false;
  // Um destino: programa conhecido, campo/barra, ou "aqui/nessa janela".
  return /\b(no|na|pro|pra|para o|para a|nesse|nessa|neste|nesta)\s+(chrome|google|navegador|edge|firefox|opera|brave|claude|claude code|chatgpt|gpt|gemini|cursor|codex|vs ?code|vscode|terminal|powershell|prompt|cmd|bloco de notas|notepad|word|excel|whatsapp|discord|telegram|slack|teams|outlook|gmail|email|e-mail|youtube|spotify|barra|campo|caixa|busca|pesquisa|endereco|chat|conversa|janela|programa|site|pagina|aba|guia)\b/.test(t)
    || /\b(aqui|onde (eu )?(estou|to))\b/.test(t);
}

/** "Faz de qualquer jeito", "pode fazer", "faz isso": ele insistiu no pedido anterior. Puro. */
export function insistiu(texto: string): boolean {
  const t = norm(texto).replace(/^(ely|eli|ei ely),?\s*/, "");
  return /^(faz|faca|fazer|pode fazer|pode|vai|manda ver|executa|faz isso|faz ai|faz logo|isso mesmo|sim,? faz|sim,? pode|ja falei|eu quero|quero sim|faz de qualquer jeito|faz assim mesmo|faz mesmo assim|so faz|tenta)( (isso|ai|logo|agora|mesmo|de qualquer jeito|assim mesmo|por favor|sim))*[.!]?$/.test(t)
    || /\b(de qualquer jeito|mesmo assim|assim mesmo|so faz|faz logo)\b/.test(t);
}

const APPS: [RegExp, RegExp][] = [
  [/\b(chrome|google chrome)\b/, /^chrome$/i],
  [/\b(edge)\b/, /^msedge$/i],
  [/\b(firefox)\b/, /^firefox$/i],
  [/\b(opera)\b/, /^opera$/i],
  [/\b(brave)\b/, /^brave$/i],
  [/\b(navegador|google|youtube|gmail|site|pagina|aba|guia)\b/, /^(chrome|msedge|firefox|opera|brave)$/i],
  [/\b(claude code|terminal|powershell|prompt de comando|cmd)\b/, /^(windowsterminal|powershell|pwsh|cmd|wt|code|warp|alacritty|wezterm-gui|hyper)$/i],
  [/\b(claude)\b/, /^(claude|windowsterminal|powershell|pwsh|cmd)$/i],
  [/\b(vs ?code|vscode|cursor)\b/, /^(code|cursor)$/i],
  [/\b(bloco de notas|notepad)\b/, /^notepad$/i],
  [/\b(word)\b/, /^winword$/i],
  [/\b(excel)\b/, /^excel$/i],
  [/\b(whatsapp)\b/, /^whatsapp/i],
  [/\b(discord)\b/, /^discord$/i],
  [/\b(telegram)\b/, /^telegram$/i],
  [/\b(slack)\b/, /^slack$/i],
  [/\b(teams)\b/, /^(ms-)?teams$/i],
  [/\b(outlook|email|e-mail)\b/, /^(outlook|olk)$/i],
];

/**
 * A janela onde escrever: o programa que ele citou (no pedido ou no "app" do modelo), a que
 * estava na frente se nenhum, ou null se o citado não está aberto. Pura.
 */
export function janelaAlvo(pedido: string, app: string, janelas: Janela[], daFrente: Janela | null): Janela | null {
  const t = norm(`${pedido} ${app}`);
  const visiveis = janelas.filter((j) => !/^(elysium|electron|roamies)$/i.test(j.processo) && !/notch/i.test(j.processo));
  for (const [citou, processo] of APPS) {
    if (!citou.test(t)) continue;
    // "Claude Code": um terminal cujo título fala em claude primeiro.
    const comTitulo = /claude/.test(t) ? visiveis.find((j) => processo.test(j.processo) && /claude/i.test(j.titulo)) : undefined;
    const achada = comTitulo ?? visiveis.find((j) => processo.test(j.processo) && !j.minimizada) ?? visiveis.find((j) => processo.test(j.processo));
    if (achada) return achada;
    if (daFrente && processo.test(daFrente.processo)) return daFrente;
    return null;
  }
  // Nome solto do modelo ("notion", "obsidian"): pelo processo ou pelo título.
  const n = norm(app);
  if (n.length >= 3) {
    const porNome = visiveis.find((j) => norm(j.processo).includes(n) || norm(j.titulo).includes(n));
    if (porNome) return porNome;
  }
  return daFrente;
}
