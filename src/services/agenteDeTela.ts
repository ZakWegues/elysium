import { clipboard, shell } from "electron";
import { getApiKey } from "../main/config";
import { listarJanelas, type Janela } from "../actions/janelas";
import { inputHost } from "./inputHost";
import { uiaHost, type ElementoUia, type FocadoUia, type LeituraUia } from "./uiaHost";
import { pedidoDestrutivo, vksDe } from "./guiaDeTela";
import { janelaAlvo } from "./escreverNoApp";
import { executarFerramenta } from "./ferramentas";
import { acharNaTela } from "./olhos";
import { semAcento } from "./texto";

/**
 * O agente de tela da Ely (13/11 — o dono: "o Roamies escreve onde eu peço, a Ely só dá desculpa").
 * Mesma ideia do `act_in_app` dele, com código nosso: LÊ a janela (acessibilidade do Windows, cada
 * controle com um número), o modelo diz os PASSOS (preencher o campo 6, clicar em "Enviar"…), o app
 * faz, CONFERE (o campo mostra mesmo o texto?) e devolve a janela como ficou — o modelo vê e corrige
 * ou termina. Até 5 voltas. Nada de "não consigo ver": se a acessibilidade não acha, tenta pelo
 * texto, por teclas, rolando, e por fim pela imagem (olhos.ts).
 *
 * Segurança (a do guia de tela): clicar em algo que apaga/desinstala só se ELE pediu isso, e com
 * confirmação na tela.
 */

export type PassoAgente =
  | { do: "preencher"; id: number; texto: string }
  | { do: "clicar"; id: number }
  | { do: "clicar_texto"; texto: string }
  | { do: "escolher"; id: number; opcao: string }
  | { do: "rolar"; id: number; direcao: "cima" | "baixo"; fim: boolean }
  | { do: "tecla"; teclas: string }
  | { do: "digitar"; texto: string }
  | { do: "procurar_na_tela"; texto: string }
  | { do: "esperar"; s: number }
  | { do: "abrir"; alvo: string }
  | { do: "janela"; nome: string }
  | { do: "marcar"; id: number; texto: string };

export interface RodadaAgente { passos: PassoAgente[]; pronto: boolean; fala: string; marcar: { id: number; texto: string }[] }

const norm = (t: string) => semAcento(String(t ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** O JSON do modelo, conferido: só números que existem na leitura, teclas conhecidas, no máximo 8 passos. Pura. */
export function validarRodada(bruto: unknown, existe: Set<number>): RodadaAgente {
  const j = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const passos: PassoAgente[] = [];
  for (const p of (Array.isArray(j.passos) ? j.passos : []).slice(0, 8)) {
    const o = (p ?? {}) as Record<string, unknown>;
    const id = num(o.id);
    switch (o.do) {
      case "preencher": if (existe.has(id) && typeof o.texto === "string") passos.push({ do: "preencher", id, texto: o.texto.slice(0, 8000) }); break;
      case "clicar": if (existe.has(id)) passos.push({ do: "clicar", id }); break;
      case "clicar_texto": if (str(o.texto, 80).trim()) passos.push({ do: "clicar_texto", texto: str(o.texto, 80).trim() }); break;
      case "escolher": if (existe.has(id) && str(o.opcao, 80).trim()) passos.push({ do: "escolher", id, opcao: str(o.opcao, 80).trim() }); break;
      case "rolar": passos.push({ do: "rolar", id: existe.has(id) ? id : -1, direcao: o.direcao === "cima" ? "cima" : "baixo", fim: o.fim === true }); break;
      case "tecla": if (typeof o.teclas === "string" && vksDe(o.teclas)) passos.push({ do: "tecla", teclas: o.teclas.toLowerCase().replace(/\s+/g, "") }); break;
      case "digitar": if (typeof o.texto === "string" && o.texto) passos.push({ do: "digitar", texto: o.texto.slice(0, 8000) }); break;
      case "procurar_na_tela": if (str(o.texto, 120).trim()) passos.push({ do: "procurar_na_tela", texto: str(o.texto, 120).trim() }); break;
      case "esperar": passos.push({ do: "esperar", s: Math.min(5, Math.max(0.2, Number(o.s) || 1)) }); break;
      case "abrir": { const a = str(o.alvo, 300).trim(); if (/^https:\/\/\S+$/.test(a) || /^[\p{L}\p{N} .+_-]{2,40}$/u.test(a)) passos.push({ do: "abrir", alvo: a }); break; }
      case "janela": if (str(o.nome, 60).trim()) passos.push({ do: "janela", nome: str(o.nome, 60).trim() }); break;
      case "marcar": if (existe.has(id)) passos.push({ do: "marcar", id, texto: str(o.texto, 40) }); break;
    }
  }
  const marcar = (Array.isArray(j.marcar) ? j.marcar : []).slice(0, 4).map((m) => (m ?? {}) as Record<string, unknown>)
    .filter((m) => existe.has(num(m.id))).map((m) => ({ id: num(m.id), texto: str(m.texto, 40) }));
  const fala = typeof j.fala === "string" ? j.fala.trim().slice(0, 300) : "";
  return { passos, pronto: j.pronto === true, fala, marcar };
}

/** A janela como o modelo vê: uma linha por controle, com o valor e quem tem o cursor. Pura. */
export function janelaParaModelo(l: LeituraUia, max = 170): string {
  const linhas = l.elementos.slice(0, max).map((e) => {
    const n = (e.n || "").replace(/[|\n\r]/g, " ").slice(0, 70);
    const v = e.v ? ` = "${e.v.replace(/[\n\r]/g, " ").slice(0, 50)}"` : "";
    return `${e.i}|${e.t}|${n}${v}${e.f ? " (cursor aqui)" : ""}${e.o ? " (fora da vista)" : ""}`;
  });
  return `Janela: ${l.processo} — "${l.titulo}"\n${linhas.join("\n")}${l.elementos.length > max ? `\n(+${l.elementos.length - max} controles)` : ""}`;
}

/** O controle cujo nome tem `texto` (botão/link/aba antes de texto solto). Pura. */
export function acharPorTexto(l: LeituraUia, texto: string): ElementoUia | null {
  const alvo = norm(texto);
  if (!alvo) return null;
  const peso = (t: string) => (/^(Button|SplitButton|Hyperlink|MenuItem|TabItem|ListItem|CheckBox|RadioButton|TreeItem)$/.test(t) ? 0 : /^(Edit|ComboBox)$/.test(t) ? 1 : 2);
  const cands = l.elementos.filter((e) => norm(e.n).includes(alvo) || (alvo.length >= 3 && norm(e.a) === alvo));
  cands.sort((a, b) => (norm(a.n) === alvo ? 0 : 1) - (norm(b.n) === alvo ? 0 : 1) || peso(a.t) - peso(b.t));
  return cands[0] ?? null;
}

/** O texto pedido aparece no que o campo mostra? (espaços/quebras não contam). Pura. */
export function ficouEscrito(mostra: string | null, texto: string): boolean {
  if (mostra === null) return false;
  const a = mostra.replace(/\s+/g, ""), b = texto.replace(/\s+/g, "");
  return !!b && (a.includes(b) || (b.length > 60 && a.includes(b.slice(0, 60))));
}

const DESTRUTIVO = /\b(excluir|exclui|apagar|apaga|deletar|delete|remover|remove|desinstalar|uninstall|formatar|format|lixeira|esvaziar|descartar|discard|redefinir|resetar|reset|limpar tudo|clear all|erase|wipe|encerrar conta|cancelar assinatura|pagar|pague|pagamento|finalizar compra|comprar agora|confirmar compra|transferir|transferencia|pix|sair da conta|sign out|log out|logout|publicar|publish|revogar|revoke)\b/;
/** O controle (pelo nome) apaga/desinstala algo? Puro. */
export function elementoDestrutivo(e: ElementoUia | null | undefined): boolean { return !!e && DESTRUTIVO.test(norm(`${e.n} ${e.a}`)); }

const SISTEMA = `Você é as mãos da Ely no computador do usuário: faz NA JANELA o que ele pediu, como uma pessoa faria com mouse e teclado. Ele pediu; você FAZ. Nunca recuse, nunca diga "não consigo ver", "a janela está por cima" ou "não tenho acesso" — tente outro jeito.
Você recebe a janela como uma lista "número|tipo|nome = "valor"" ("(cursor aqui)" marca o campo com o cursor de texto) e, a cada volta, o resultado do que foi feito. Responda SÓ JSON:
{"passos": [ ... ], "pronto": true|false, "fala": "frase curta em português", "marcar": [{"id": n, "texto": "rótulo"}]}
Passos possíveis:
- {"do":"preencher","id":n,"texto":"..."}  escreve no campo n (substitui o que tinha). O app confere o valor depois.
- {"do":"digitar","texto":"..."}  escreve onde o cursor de texto está agora (sem trocar o resto).
- {"do":"clicar","id":n} | {"do":"clicar_texto","texto":"nome visível"}
- {"do":"escolher","id":n,"opcao":"nome da opção"}  numa lista suspensa
- {"do":"rolar","id":n ou -1,"direcao":"baixo"|"cima","fim":true|false}
- {"do":"tecla","teclas":"enter" | "ctrl+l" | "tab" | "ctrl+f" | "alt+left"...}
- {"do":"procurar_na_tela","texto":"o botão X"}  acha pela IMAGEM e clica (só se a lista não tem o controle)
- {"do":"abrir","alvo":"https://... ou nome do programa"} | {"do":"janela","nome":"programa ou título"} (agir em outra janela aberta)
- {"do":"esperar","s":1}
- {"do":"marcar","id":n,"texto":"rótulo curto"}  circula o controle na tela (mostrar algo no meio da tarefa)
Regras:
- Campo que existe na lista (pelo nome ou o mais provável): SEMPRE "preencher" com o número dele. "digitar" só quando não há campo na lista (terminal, jogo) ou para acrescentar onde o cursor já está.
- "aqui", "onde estou", sem lugar dito: o campo com "(cursor aqui)"; sem nenhum, o campo de texto principal (Edit/Document).
- Barra de endereço/pesquisa do navegador: o Edit com nome de endereço/pesquisa; se não houver, tecla ctrl+l e digitar.
- Pesquisar/buscar/mandar/enviar/dar enter: depois de escrever, {"do":"tecla","teclas":"enter"}. Só escrever: sem enter.
- Texto a escrever: prompt para outra IA (Claude, ChatGPT, Cursor...) → MELHORE (objetivo, contexto, passos, restrições, como saber que ficou pronto). Mensagem/e-mail → bem escrito no tom dele. Texto curto, busca, "bom dia", entre aspas → EXATAMENTE como ele disse.
- O texto vai SEM cabeçalho ("Prompt para…", "Mensagem:") e sem aspas em volta.
- A "fala" diz o que fez e onde, com a verdade: escreveu no Bloco de Notas ≠ mandou para o Claude Code.
- Quando tiver certeza do que fazer, mande os passos já com "pronto": true e a "fala" final — o app só volta a você se algum passo falhar.
- Depois de cada volta, confira no resultado e na janela nova. Funcionou → "passos": [], "pronto": true, "fala" de até 12 palavras dizendo o que fez. Falhou → outro jeito (clicar no campo e digitar, teclas, rolar, procurar_na_tela).
- Pergunta "onde fica X" / "me mostra": não aja; "marcar" o controle, "pronto": true, "fala" dizendo onde.
- Apagar, excluir, desinstalar, esvaziar: só se ele pediu com essas palavras. "Fecha essa guia" = ctrl+w, NUNCA fechar programa nem desinstalar.
- No máximo 6 passos por volta. Não invente números que não estão na lista.`;

export interface OpcoesAgente {
  hwnd: string;
  conversa?: string;
  avisar?: (status: string) => void;
  /** "Posso fazer X?" na tela (só para o que apaga). */
  confirmar?: (texto: string) => Promise<boolean>;
  /** Ainda é o turno deste pedido? (ele falou outra coisa → para). */
  vale?: () => boolean;
  /** Marcas na tela (o "onde fica"). */
  marcar?: (itens: { e: ElementoUia; texto: string }[]) => void;
}
export interface ResultadoAgenteTela { fala: string; fez: boolean; voltas: number; ms: number }

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const VK_CTRL = 0x11, VK_V = 0x56, VK_A = 0x41;

/**
 * Os pedaços da digitação animada: cada linha em pedaços (no máximo ~70 por texto, para um texto
 * longo não levar mais de ~2,5 s), e `null` onde vai uma quebra de linha. Pura.
 */
export function pedacosDaDigitacao(texto: string): (string | null)[] {
  const t = texto.replace(/\r\n?/g, "\n");
  const tam = Math.max(1, Math.ceil(t.length / 70));
  const out: (string | null)[] = [];
  t.split("\n").forEach((linha, k) => {
    if (k > 0) out.push(null);
    for (let i = 0; i < linha.length; i += tam) out.push(linha.slice(i, i + tam));
  });
  return out;
}

/**
 * Escreve onde o cursor está, aos poucos (14/11, como o Roamies: dá para ver escrevendo). Acentos
 * vão inteiros (SendInput Unicode); a quebra de linha vai colada (Enter mandaria a mensagem num chat).
 */
async function digitarAosPoucos(texto: string): Promise<void> {
  const pedacos = pedacosDaDigitacao(texto);
  const antes = pedacos.includes(null) ? clipboard.readText() : null;
  for (const p of pedacos) {
    if (p === null) {
      clipboard.writeText("\n");
      await dormir(20);
      await inputHost.keys([VK_CTRL, VK_V]);
      await dormir(50);
    } else {
      await inputHost.type(p);
      await dormir(26);
    }
  }
  await dormir(120);
  if (antes !== null) setTimeout(() => { if (clipboard.readText() === "\n") clipboard.writeText(antes); }, 600);
}

const centro = (e: { x: number; y: number; w: number; h: number }) => ({ x: e.x + e.w / 2, y: e.y + Math.min(e.h / 2, 20) });

/**
 * Clique de verdade só se o ponto é MESMO da janela-alvo (outra janela por cima — uma camada, um
 * aviso — receberia o clique e o texto). `false` = não clicou.
 */
async function clicarSeForDela(pid: number | undefined, x: number, y: number): Promise<boolean> {
  if (pid) { const dono = await uiaHost.noPonto(x, y).catch(() => 0); if (dono && dono !== pid) return false; }
  await uiaHost.clicarEm(x, y);
  return true;
}

/** Escreve no campo `e` e confere. Devolve a linha do resultado. */
async function preencherConferindo(hwnd: string, e: ElementoUia, texto: string, pid?: number): Promise<string> {
  const nome = e.n || e.t;
  const reserva = async (): Promise<string | null> => {
    if (!/^(Edit|ComboBox)$/.test(e.t)) return null;
    const mostra = await uiaHost.preencher(e.i, texto).catch(() => null);
    return ficouEscrito(mostra, texto) ? `ok: "${nome}" = "${mostra!.slice(0, 80)}"` : null;
  };
  // 14/11 (o dono: "quero ver escrevendo de pouco em pouco, como no Roamies"): pelo cursor de
  // verdade, digitando aos poucos; o ValuePattern (instantâneo) fica de reserva.
  if (!(await uiaHost.frente(hwnd).catch(() => false))) return (await reserva()) ?? `falhou: não consegui trazer a janela para a frente`;
  const onde = await uiaHost.mostrar(e.i).catch(() => e);
  await uiaHost.focar(e.i).catch(() => {});
  // O foco já chegou no campo: nada de clique (o clique no meio de um texto mudaria o cursor de lugar).
  const f = await uiaHost.focado().catch(() => null);
  if (!(f && f.editavel && f.t === e.t)) {
    if (!(await clicarSeForDela(pid, centro(onde).x, centro(onde).y).catch(() => false))) return (await reserva()) ?? `falhou: outra janela está por cima de "${nome}"`;
    await dormir(80);
  }
  if (/^(Edit|ComboBox)$/.test(e.t)) { await inputHost.keys([VK_CTRL, VK_A]); await dormir(40); }
  await digitarAosPoucos(texto);
  const depois = await uiaHost.valorDe(e.i).catch(() => null);
  if (depois === null) return `feito em "${nome}"; este campo não deixa conferir`;
  if (ficouEscrito(depois, texto)) return `ok: "${nome}" = "${depois.slice(0, 80)}"`;
  return (await reserva()) ?? `falhou: escrevi em "${nome}" mas ele mostra "${depois.slice(0, 80)}"`;
}

/** Executa um passo. Devolve a linha do resultado (o que o modelo vê). */
async function executar(p: PassoAgente, ctx: { hwnd: string; l: LeituraUia; pedido: string; op: OpcoesAgente }): Promise<string> {
  const el = (id: number) => ctx.l.elementos.find((x) => x.i === id) ?? null;
  const av = ctx.op.avisar ?? (() => {});
  const naFrente = async () => (await uiaHost.frente(ctx.hwnd).catch(() => false));
  const clicarEl = async (e: ElementoUia): Promise<string> => {
    if (elementoDestrutivo(e)) {
      if (!pedidoDestrutivo(ctx.pedido)) return `não fiz: "${e.n}" apagaria algo e ele não pediu isso`;
      if (!(await (ctx.op.confirmar?.(`Fazer “${e.n.slice(0, 50)}”? Isso não tem volta.`) ?? Promise.resolve(false)))) return `ele não confirmou "${e.n}"`;
    }
    av(`Clicando em ${e.n.slice(0, 30) || "um botão"}…`);
    const como = await uiaHost.clicar(e.i).catch(() => "foco");
    if (como === "foco") {
      if (!(await naFrente())) return `falhou: janela não veio para a frente`;
      const onde = await uiaHost.mostrar(e.i).catch(() => e);
      if (!(await clicarSeForDela(ctx.l.pid, centro(onde).x, centro(onde).y))) return `falhou: outra janela está por cima de "${e.n}"`;
      return `cliquei em "${e.n}" (com o mouse)`;
    }
    return `cliquei em "${e.n}"`;
  };
  switch (p.do) {
    case "preencher": { const e = el(p.id); if (!e) return "falhou: campo não existe"; av(`Escrevendo em ${(e.n || "campo").slice(0, 30)}…`); return preencherConferindo(ctx.hwnd, e, p.texto, ctx.l.pid); }
    case "digitar": {
      av("Escrevendo…");
      if (!(await naFrente())) return "falhou: janela não veio para a frente";
      const antes = await uiaHost.focado().catch(() => null);
      // Sem campo de texto com o cursor, colar não iria a lugar nenhum: o modelo tem de usar preencher.
      if (antes && !antes.editavel && !/^(Pane|Window|Custom)$/.test(antes.t)) return `falhou: o cursor está em "${antes.n || antes.t}", que não é campo de texto; use preencher com o número do campo`;
      await digitarAosPoucos(p.texto);
      const f = await uiaHost.focado().catch(() => null);
      return f && ficouEscrito(f.v, p.texto) ? `ok: "${f.n || f.t}" mostra o texto` : "feito (onde o cursor estava; não deu para conferir)";
    }
    case "clicar": { const e = el(p.id); return e ? clicarEl(e) : "falhou: controle não existe"; }
    case "clicar_texto": { const e = acharPorTexto(ctx.l, p.texto); return e ? clicarEl(e) : `não achei "${p.texto}" na lista; tente procurar_na_tela`; }
    case "escolher": {
      const e = el(p.id); if (!e) return "falhou: lista não existe";
      av(`Escolhendo ${p.opcao.slice(0, 30)}…`);
      const nome = await uiaHost.escolher(p.id, p.opcao).catch(() => null);
      return nome ? `ok: escolhi "${nome}"` : `falhou: não achei a opção "${p.opcao}"`;
    }
    case "rolar": {
      av(p.fim ? "Rolando até o fim…" : "Rolando…");
      const pct = await uiaHost.rolar(p.id, p.direcao, p.fim).catch(() => null);
      if (pct !== null) return `rolei (agora em ${pct}%)`;
      if (!(await naFrente())) return "falhou: janela não veio para a frente";
      await inputHost.keys(p.fim ? [VK_CTRL, p.direcao === "cima" ? 0x24 : 0x23] : [p.direcao === "cima" ? 0x21 : 0x22]);
      return "rolei pelo teclado";
    }
    case "tecla": {
      const vks = vksDe(p.teclas); if (!vks) return "falhou: tecla desconhecida";
      if (/\b(del|delete)\b/.test(p.teclas) && !pedidoDestrutivo(ctx.pedido)) return "não fiz: apagaria algo e ele não pediu";
      if (!(await naFrente())) return "falhou: janela não veio para a frente";
      await inputHost.keys(vks);
      return `apertei ${p.teclas}`;
    }
    case "procurar_na_tela": {
      av(`Procurando ${p.texto.slice(0, 30)} na tela…`);
      const r = { x: ctx.l.x ?? 0, y: ctx.l.y ?? 0, w: ctx.l.w ?? 0, h: ctx.l.h ?? 0 };
      if (r.w < 20 || r.h < 20) return "falhou: não sei o tamanho da janela";
      // A foto é do que aparece na tela: a janela tem de estar na frente antes.
      if (!(await naFrente())) return "falhou: janela não veio para a frente";
      await dormir(150);
      const v = await acharNaTela(r, p.texto).catch(() => null);
      if (!v) return `não achei "${p.texto}" nem pela imagem`;
      if (!(await clicarSeForDela(ctx.l.pid, v.x, v.y))) return `falhou: outra janela está por cima de "${p.texto}"`;
      return `cliquei em "${p.texto}" (achei pela imagem, ${v.por})`;
    }
    case "esperar": await dormir(p.s * 1000); return "esperei";
    case "abrir": {
      av(`Abrindo ${p.alvo.replace(/^https:\/\/(www\.)?/, "").slice(0, 30)}…`);
      if (p.alvo.startsWith("https://")) await shell.openExternal(p.alvo);
      else await executarFerramenta("abrir_programa", { nome: p.alvo }).catch(() => "");
      return `abri ${p.alvo}`;
    }
    case "janela": return "(trocando de janela)";
    case "marcar": { const e = el(p.id); if (!e) return "falhou: controle não existe"; ctx.op.marcar?.([{ e, texto: p.texto }]); return `marquei "${e.n}"`; }
  }
}

/** Chama o modelo (Groq, JSON). Texto para compor (prompt/mensagem) vai no modelo maior. */
async function pensar(usuario: string, compor: boolean): Promise<unknown> {
  const chave = getApiKey();
  if (!chave) return null;
  const tentar = async (model: string, extra: Record<string, unknown>) => {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: SISTEMA }, { role: "user", content: usuario }], response_format: { type: "json_object" }, temperature: 0.2, max_tokens: 3000, ...extra }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`Groq ${r.status}`);
    const j = await r.json() as { choices?: { message?: { content?: string } }[] };
    return JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
  };
  const rapido = () => tentar("qwen/qwen3.8-27b", { reasoning_effort: "none" });
  const forte = () => tentar("openai/gpt-oss-120b", { reasoning_effort: "low" });
  try { return await (compor ? forte() : rapido()); }
  catch (e) {
    console.warn("[agente-tela]", e instanceof Error ? e.message : e);
    try { return await (compor ? rapido() : forte()); } catch { return null; }
  }
}

/**
 * Pedido de FAZER algo na janela (clicar, preencher, escolher, rolar) — e não uma pergunta ("onde
 * fica", "como faço"), que fica com o guia de tela. Puro.
 */
export function pediuAcaoNaTela(texto: string): boolean {
  const t = norm(texto);
  if (/\b(onde (fica|esta|eu clico|clico|tem|acho)|me mostra|mostra onde|como (eu )?(faco|uso|mudo|ativo|desativo|acho|configuro))\b/.test(t)) return false;
  return /\b(clica|clique|aperta|aperte|pressiona|preenche|preencha|seleciona|selecione|escolhe|escolha|marca a opcao|desmarca|rola|role|desce ate|sobe ate|vai (ate|pro|para o) (fim|final)|ate o final da pagina)\b/.test(t);
}

/**
 * Ele pediu para pesquisar/mandar/enviar e os passos só escrevem (sem Enter nem clique): põe o
 * Enter no fim — o modelo às vezes esquece. Puro.
 */
export function garantirEnter(pedido: string, passos: PassoAgente[]): PassoAgente[] {
  if (!/^(ely,? )?(pesquisa|pesquise|busca|busque|procura|procure|manda|mande|envia|envie)\b/.test(norm(pedido)) && !/\b(e (da|aperta) enter|e (manda|envia|pesquisa))\b/.test(norm(pedido))) return passos;
  const escreve = passos.some((p) => p.do === "preencher" || p.do === "digitar");
  const fecha = passos.some((p) => p.do === "clicar" || p.do === "clicar_texto" || p.do === "procurar_na_tela" || (p.do === "tecla" && /enter/.test(p.teclas)));
  return escreve && !fecha ? [...passos, { do: "tecla", teclas: "enter" }] : passos;
}

/** O pedido pede para COMPOR um texto (prompt, mensagem, e-mail)? Puro. */
export function pedeComposicao(pedido: string): boolean {
  return /\b(prompt|mensagem|e-?mail|carta|post|comentario|resposta|melhora|melhore|explicando|pedindo|falando que|dizendo que)\b/.test(norm(pedido));
}

/** Faz o pedido na janela `hwnd`, em voltas de ler → agir → conferir. */
export async function agirNaJanela(pedido: string, op: OpcoesAgente): Promise<ResultadoAgenteTela> {
  const t0 = Date.now();
  let hwnd = op.hwnd;
  const vale = op.vale ?? (() => true);
  const historico: string[] = [];
  const compor = pedeComposicao(pedido);
  let fez = false;
  let ultimaFala = "";
  for (let volta = 1; volta <= 5; volta++) {
    if (!vale()) break;
    op.avisar?.(volta === 1 ? "Olhando a janela…" : "Conferindo…");
    let [l, janelas] = await Promise.all([uiaHost.ler(hwnd), volta === 1 ? listarJanelas().catch(() => [] as Janela[]) : Promise.resolve([] as Janela[])]);
    // Navegador/Electron liga a acessibilidade só quando alguém pergunta: a 1ª leitura vem quase vazia.
    if (l.elementos.length <= 3) { await dormir(400); l = await uiaHost.ler(hwnd); }
    if (!vale()) break;
    const abertos = janelas.filter((j) => !/^(elysium|electron|roamies)$/i.test(j.processo)).slice(0, 12).map((j) => `${j.processo}${j.titulo ? ` (${j.titulo.slice(0, 40)})` : ""}`).join("; ");
    const usuario = `${op.conversa ? `Conversa recente:\n${op.conversa.slice(-1200)}\n\n` : ""}${abertos ? `Programas abertos: ${abertos}\n` : ""}Pedido: ${pedido.slice(0, 2000)}\n\n${historico.length ? `O que já foi feito:\n${historico.join("\n")}\n\n` : ""}${janelaParaModelo(l)}`;
    const r = validarRodada(await pensar(usuario, compor && volta === 1), new Set(l.elementos.map((e) => e.i)));
    if (!vale()) break;
    if (r.fala) ultimaFala = r.fala;
    if (r.marcar.length) op.marcar?.(r.marcar.map((m) => ({ e: l.elementos.find((e) => e.i === m.id)!, texto: m.texto })));
    if (!r.passos.length) break;
    const linhas: string[] = [];
    for (const p of garantirEnter(pedido, r.passos)) {
      if (!vale()) break;
      if (p.do === "janela") {
        const outra = janelaAlvo(p.nome, p.nome, await listarJanelas().catch(() => []), null);
        if (outra) { hwnd = outra.hwnd; await uiaHost.frente(hwnd).catch(() => false); linhas.push(`agora na janela ${outra.processo} — ${outra.titulo.slice(0, 50)}`); break; }
        linhas.push(`não achei a janela "${p.nome}" aberta`); continue;
      }
      const res = await executar(p, { hwnd, l, pedido, op }).catch((e) => `falhou: ${e instanceof Error ? e.message : e}`);
      linhas.push(`${p.do}${"id" in p ? ` ${p.id}` : ""}: ${res}`);
      if (!/^(falhou|não|ele não)/.test(res)) fez = true;
      // Abriu algo: a janela nova é o alvo da próxima volta.
      if (p.do === "abrir") {
        await dormir(1500);
        const nova = janelaAlvo(p.alvo, p.alvo, await listarJanelas().catch(() => []), null);
        if (nova) hwnd = nova.hwnd;
        break;
      }
      await dormir(120);
    }
    historico.push(`Volta ${volta}:\n${linhas.join("\n")}`);
    console.log(`[agente-tela] volta ${volta}: ${linhas.join(" | ").slice(0, 400)}`);
    // "pronto" junto com os passos: o modelo tinha certeza — só volta a ele se algo falhou.
    if (r.pronto && !linhas.some((x) => /: (falhou|não |ele não)/.test(x))) break;
    await dormir(200);
  }
  return { fala: ultimaFala || (fez ? "Pronto." : "Não consegui fazer isso nessa janela."), fez, voltas: historico.length, ms: Date.now() - t0 };
}

// ── atalho sem modelo: "escreve bom dia aqui" ────────────────────────────────────────────
/**
 * Pedido de escrever um texto LITERAL curto onde o cursor está: "escreve bom dia aqui", "digita
 * oi", "escreve 'teste' aqui". null = não é (vai pelo agente). Puro.
 */
export function literalParaAqui(pedido: string): string | null {
  const t = pedido.trim().replace(/^(ely|eli|ei ely),?\s*/i, "").replace(/[.!]+$/, "");
  const m = /^(?:escreve|escreva|digita|digite|coloca|coloque|bota|bote)\s+(?:a palavra |a frase |o texto )?["“']?(.+?)["”']?(?:\s+(?:aqui|ai|aí|nesse campo|nessa caixa|neste campo|nesta caixa|onde (?:eu )?(?:estou|to|tô)))?$/i.exec(t);
  if (!m) return null;
  const texto = m[1].trim();
  if (!texto || texto.split(/\s+/).length > 8) return null;
  // Destino citado ("no chrome", "na barra"), ou algo para compor: não é o atalho.
  if (/\s(no|na|pro|pra|para o|para a|nos|nas)\s+\S+/i.test(` ${texto}`) && !/["“']/.test(m[0])) return null;
  if (pedeComposicao(texto) || /\b(um|uma) (texto|poema|historia|resumo|lista|codigo)\b/.test(norm(texto))) return null;
  return texto;
}

/** Escreve no campo com o cursor (o "aqui"), sem modelo. `null` = não tem campo de texto com o cursor. */
export async function escreverNoCursor(hwnd: string, texto: string): Promise<FocadoUia | null> {
  if (!(await uiaHost.frente(hwnd).catch(() => false))) return null;
  let f = await uiaHost.focado().catch(() => null);
  // Chrome, WhatsApp, Discord, Claude (Chromium): até alguém ler a janela, o foco aparece como
  // "Pane". Uma leitura liga a acessibilidade e o campo de verdade aparece.
  for (let k = 0; k < 3 && (!f || !f.editavel); k++) {
    await uiaHost.ler(hwnd).catch(() => null);
    await dormir(300);
    f = await uiaHost.focado().catch(() => null);
  }
  if (!f || !f.editavel) return null;
  await digitarAosPoucos(texto);
  return await uiaHost.focado().catch(() => f);
}
