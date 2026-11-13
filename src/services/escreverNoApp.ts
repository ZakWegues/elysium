import { getApiKey } from "../main/config";
import { semAcento } from "./texto";
import type { Janela } from "../actions/janelas";

/**
 * "Escreve X no Chrome / pro Claude Code / na barra de pesquisa" (13/11, pedido do dono, o que o
 * Roamies faz): ESCREVE de verdade no programa — não salva um .txt nem se recusa. Quando o texto é um
 * prompt para outra IA (Claude Code, ChatGPT, Cursor…), uma mensagem ou um e-mail, ele sai melhorado
 * (claro, completo, na intenção dele); texto curto ou literal ("bom dia", entre aspas, "exatamente")
 * vai do jeito que ele disse.
 *
 * O modelo só decide O QUE escrever e ONDE; quem escreve é o main (foco na janela, o campo, colar,
 * Enter se ele pediu para mandar/pesquisar).
 */

export type Lugar = "endereco" | "busca" | "campo" | "foco";
export interface Escrita { texto: string; app: string; lugar: Lugar; campo: string; enviar: boolean; melhorou: boolean; fala: string }

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

const SISTEMA = `Você prepara um texto para ser ESCRITO num programa do computador do usuário (ele pediu; você nunca se recusa, nunca pergunta e nunca diz que não pode). Responda SÓ JSON:
{"texto": "exatamente o que vai ser digitado", "app": "programa citado (ex.: chrome, claude code, whatsapp) ou vazio", "lugar": "endereco"|"busca"|"campo"|"foco", "campo": "nome do campo, se citou", "enviar": true|false, "melhorou": true|false, "fala": "frase curta do que vai fazer"}
Regras do texto:
- Prompt para outra IA (Claude Code, ChatGPT, Gemini, Cursor, Codex, Copilot): MELHORE — objetivo claro, contexto, o que fazer passo a passo, restrições e como saber que ficou pronto; na língua que ele falou; sem rodeio e sem explicar que melhorou. "melhorou": true.
- Mensagem, e-mail, post, comentário: escreva bem, natural, no tom dele, corrigindo erros. "melhorou": true.
- Texto curto, busca, endereço, nome, "bom dia", algo entre aspas ou "exatamente/do jeito que eu falei": LITERAL, sem enfeitar. "melhorou": false.
- Nunca inclua aspas em volta, explicação, nem "Aqui está".
Regras do lugar:
- "barra de endereço/pesquisa do navegador", "pesquisa no Google/Chrome" → "endereco". Campo de busca dentro de um site/app → "busca". Campo citado pelo nome → "campo". Sem lugar ("no Claude Code", "aqui", "no WhatsApp") → "foco" (onde o cursor de texto já está).
- "enviar": true só se ele pediu para mandar, enviar, pesquisar, buscar, dar enter ou executar.
Se ele se refere a algo dito antes ("escreve aquilo", "manda o que eu falei"), use a conversa recente.`;

/** Confere o JSON do modelo. null = sem texto. Pura. */
export function validarEscrita(j: unknown): Escrita | null {
  const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  const texto = typeof o.texto === "string" ? o.texto.replace(/^["“”']+|["“”']+$/g, "").trim() : "";
  if (!texto) return null;
  const lugar = (["endereco", "busca", "campo", "foco"] as const).includes(o.lugar as Lugar) ? o.lugar as Lugar : "foco";
  return {
    texto: texto.slice(0, 8000), app: typeof o.app === "string" ? o.app.slice(0, 40) : "", lugar,
    campo: typeof o.campo === "string" ? o.campo.slice(0, 60) : "", enviar: o.enviar === true, melhorou: o.melhorou === true,
    fala: typeof o.fala === "string" && o.fala.trim() ? o.fala.trim().slice(0, 160) : "Escrevendo.",
  };
}

/** Pede o texto ao modelo (Groq, ~0,5–2 s). */
export async function prepararEscrita(pedido: string, contexto: { conversa: string; frente: string; abertos: string }): Promise<Escrita | null> {
  const chave = getApiKey();
  if (!chave) return null;
  const usuario = `Programa na frente: ${contexto.frente || "(nenhum)"}\nProgramas abertos: ${contexto.abertos || "(?)"}\n${contexto.conversa ? `Conversa recente:\n${contexto.conversa.slice(-1500)}\n` : ""}\nPedido: ${pedido.slice(0, 2000)}`;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "system", content: SISTEMA }, { role: "user", content: usuario }], response_format: { type: "json_object" }, temperature: 0.3, max_tokens: 2500 }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      // O 120B às vezes recusa o modo JSON (400): o qwen rápido de reserva.
      const r2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "qwen/qwen3.8-27b", messages: [{ role: "system", content: SISTEMA }, { role: "user", content: usuario }], response_format: { type: "json_object" }, reasoning_effort: "none", temperature: 0.3, max_tokens: 2500 }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!r2.ok) { console.warn(`[escrever] Groq respondeu ${r.status}/${r2.status}`); return null; }
      const j2 = await r2.json() as { choices?: { message?: { content?: string } }[] };
      return validarEscrita(JSON.parse(j2.choices?.[0]?.message?.content ?? "{}"));
    }
    const j = await r.json() as { choices?: { message?: { content?: string } }[] };
    return validarEscrita(JSON.parse(j.choices?.[0]?.message?.content ?? "{}"));
  } catch (e) {
    console.warn("[escrever] falhou:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Atalho sem modelo para o literal curto: "escreve bom dia na barra de pesquisa do Chrome",
 * "digita 'oi' no WhatsApp". Até 6 palavras e nada que peça para melhorar (prompt, mensagem,
 * e-mail). null = vai pelo modelo. Pura.
 */
export function escritaRapida(pedido: string): Escrita | null {
  const t = pedido.trim().replace(/^(ely|eli|ei ely),?\s*/i, "");
  const m = /^(?:escreve|escreva|digita|digite|pesquisa|pesquise|busca|busque)\s+(?:a palavra |a frase |o texto )?["“']?(.+?)["”']?\s+(?:no|na|pro|pra|para o|para a)\s+(.+?)[.!]?$/i.exec(t);
  if (!m) return null;
  const texto = m[1].trim(), destino = norm(m[2]);
  if (!texto || texto.split(/\s+/).length > 6) return null;
  if (/\b(prompt|mensagem|email|e-mail|texto sobre|carta|post|resposta|pedindo|explicando|falando)\b/.test(norm(texto))) return null;
  const pesquisar = /^(pesquisa|pesquise|busca|busque)\b/i.test(t) || /\b(e (pesquisa|busca|manda|envia|da enter|aperta enter))\b/.test(destino);
  const lugar: Lugar = /\b(barra|endereco|pesquisa do (chrome|navegador|google|edge)|chrome|navegador|google|edge|firefox)\b/.test(destino) && !/\b(campo|caixa) de (busca|pesquisa)\b/.test(destino) ? "endereco"
    : /\b(campo|caixa) de (busca|pesquisa)|busca d[oa]|pesquisa d[oa]\b/.test(destino) ? "busca" : "foco";
  const app = /\b(chrome|google)\b/.test(destino) ? "chrome" : /\bedge\b/.test(destino) ? "edge" : /\bfirefox\b/.test(destino) ? "firefox" : destino.replace(/\b(barra|campo|caixa) de (pesquisa|busca|endereco)( d[oa])?\b/g, "").trim();
  return { texto, app, lugar, campo: "", enviar: pesquisar, melhorou: false, fala: pesquisar ? `Pesquisando ${texto}.` : `Escrevendo ${texto}.` };
}
