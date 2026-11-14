import { semAcento } from "./texto";
import type { ElementoUia, LeituraUia } from "./uiaHost";

/**
 * Marcar na tela (14/11 — o dono: "no Roamies pedi para circular o símbolo do YouTube e ele fez em
 * 12 s; a Ely pediu permissão para rodar um comando e nem conseguiu"). O `draw` do Roamies, com
 * código nosso: "circula / aponta / sublinha / destaca / onde está X" vira uma marca por cima da
 * tela, sem modelo de texto no caminho. O alvo sai do pedido; acha pela acessibilidade da janela
 * (instantâneo) e, se não achar, pela imagem (olhos.ts). Marcar nunca pede permissão.
 */

export type TipoDeMarca = "anel" | "seta" | "sublinhado" | "destaque" | "num";
export interface PedidoDeMarca { alvo: string; tipo: TipoDeMarca; todos: boolean }

const norm = (t: string) => semAcento(String(t ?? "")).toLowerCase().replace(/\s+/g, " ").trim();

// Verbos que só podem ser de marcar (sempre valem) e os que também têm outro sentido ("marca uma
// consulta", "mostra o clima") — esses só valem com uma coisa de tela no pedido.
const VERBO_CLARO = /^(?:circula|circule|circular|faz um circulo (?:em|no|na)|aponta|aponte|apontar|sublinha|sublinhe|sublinhar|realca|realce|destaca|destaque|destacar|numera|numere)\b/;
const VERBO_AMBIGUO = /^(?:marca|marque|marcar|mostra|mostre|indica|indique|seleciona visualmente)\b/;
const COISA_DE_TELA = /\b(simbolo|icone|botao|logo|logotipo|link|campo|aba|guia|menu|opcao|item|imagem|foto|palavra|texto|titulo|barra|caixa|janela|tela|aqui|na tela|nessa tela|nesta tela|onde (fica|esta))\b/;

/** O tipo da marca pelo verbo. Puro. */
function tipoDoVerbo(v: string): TipoDeMarca {
  if (/^(aponta|aponte|apontar)/.test(v)) return "seta";
  if (/^(sublinh)/.test(v)) return "sublinhado";
  if (/^(realc|destac)/.test(v)) return "destaque";
  if (/^(numer)/.test(v)) return "num";
  return "anel";
}

/** O que sobra do pedido depois do verbo: só o nome da coisa ("o símbolo do YouTube" → "youtube"). Pura. */
export function limparAlvo(resto: string): string {
  let t = ` ${norm(resto)} `;
  t = t.replace(/[“”"'.,!?]/g, " ");
  t = t.replace(/\b(pra mim|para mim|por favor|por gentileza|ai|ali|aqui|na tela|nessa tela|nesta tela|nessa janela|nesta janela|nessa pagina|nesta pagina|no chrome|no navegador|no pc|do pc)\b/g, " ");
  t = t.replace(/\b(onde (fica|esta|tem)|cade|em que lugar (fica|esta))\b/g, " ");
  t = t.replace(/\b(todos|todas|cada|tudo)\b/g, " ");
  t = t.replace(/\b(o|a|os|as|um|uma|uns|umas)\b/g, " ");
  t = t.replace(/\b(simbolo|icone|icones|botao|botoes|logo|logotipo|link|links|campo|aba|guia|menu|opcao|item|itens|imagem|foto|palavra|texto|titulo|atalho|bolinha)\b/g, " ");
  t = t.replace(/\b(do|da|de|dos|das|que diz|escrito|chamado|chamada)\b/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

/** "Circula o símbolo do YouTube", "onde está o botão salvar?", "sublinha todos os links". null = não é marcar. Pura. */
export function pedidoDeMarca(texto: string): PedidoDeMarca | null {
  let t = norm(texto).replace(/^(ely|eli|ei ely),?\s*/, "").replace(/^(me|por favor,?)\s+/, "").replace(/[?!.]+$/, "");
  const todos = /\b(todos|todas|cada)\b/.test(t);
  // "Onde está / onde fica / cadê X" → anel.
  const onde = /^(?:onde (?:esta|fica|tem)|cade|em que lugar (?:esta|fica))\s+(.+)$/.exec(t);
  if (onde) {
    // "onde fica a configuração de som" no Windows é pergunta de como fazer; com coisa de tela é marca.
    const alvo = limparAlvo(onde[1]);
    return alvo && alvo.split(" ").length <= 5 ? { alvo, tipo: "anel", todos } : null;
  }
  t = t.replace(/^(mostra|mostre|indica|indique) (pra mim |para mim )?onde (esta|fica|tem) /, "circula ");
  const claro = VERBO_CLARO.exec(t);
  const ambiguo = claro ? null : VERBO_AMBIGUO.exec(t);
  const achado = claro ?? ambiguo;
  if (!achado) return null;
  const verbo = achado[0];
  const resto = t.slice(verbo.length);
  if (ambiguo && !COISA_DE_TELA.test(resto)) return null;
  const alvo = limparAlvo(resto);
  if (!alvo || alvo.split(" ").length > 6) return null;
  return { alvo, tipo: tipoDoVerbo(verbo), todos };
}

/** Quanto o nome do controle combina com o alvo (0 = nada). Pura. */
function pontos(e: ElementoUia, alvo: string): number {
  const n = norm(`${e.n}`), a = norm(e.a);
  if (!n && !a) return 0;
  if (n === alvo) return 100;
  const palavras = alvo.split(" ");
  if (n.startsWith(alvo)) return 80;
  if (new RegExp(`\\b${alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(n)) return 70;
  if (palavras.length > 1 && palavras.every((p) => n.includes(p))) return 55;
  if (n.includes(alvo)) return 45;
  if (alvo.length >= 4 && a.includes(alvo.replace(/\s/g, ""))) return 40;
  return 0;
}

const PESO_TIPO: Record<string, number> = { Hyperlink: 6, Button: 6, ListItem: 5, MenuItem: 5, TabItem: 5, Image: 4, Edit: 3, ComboBox: 3, CheckBox: 3, RadioButton: 3, Text: 1 };

/**
 * Os controles visíveis que são o alvo, do melhor para o pior. `todos` = todos que combinam bem;
 * senão só o melhor. Ignora o que está fora da vista e o que é grande demais (a janela inteira). Pura.
 */
export function acharAlvos(l: LeituraUia, alvo: string, todos: boolean): ElementoUia[] {
  const larguraJanela = l.w || 99999, alturaJanela = l.h || 99999;
  const cands = l.elementos
    .filter((e) => !e.o && e.w > 2 && e.h > 2 && !(e.w > larguraJanela * 0.8 && e.h > alturaJanela * 0.5))
    .map((e) => ({ e, p: pontos(e, alvo) }))
    .filter((x) => x.p > 0)
    .sort((x, y) => y.p - x.p || (PESO_TIPO[y.e.t] ?? 2) - (PESO_TIPO[x.e.t] ?? 2) || x.e.w * x.e.h - y.e.w * y.e.h);
  if (!cands.length) return [];
  if (!todos) return [cands[0].e];
  const corte = Math.max(45, cands[0].p - 35);
  // Sem repetir o mesmo lugar (texto dentro do link que o contém).
  const out: ElementoUia[] = [];
  for (const { e, p } of cands) {
    if (p < corte) break;
    if (out.some((o) => Math.abs(o.x - e.x) < 8 && Math.abs(o.y - e.y) < 8)) continue;
    out.push(e);
    if (out.length >= 12) break;
  }
  return out;
}

/** A frase curta depois de marcar. Pura. */
export function falaDaMarca(p: PedidoDeMarca, quantos: number, pelaImagem: boolean): string {
  if (!quantos) return `Não achei "${p.alvo}" nessa janela.`;
  if (p.todos && quantos > 1) return `Achei ${quantos}.`;
  return pelaImagem ? "Acho que é aqui." : "Aqui.";
}

/**
 * A caixa que a imagem achou é mesmo o alvo? Confere o controle que está no meio dela: com nome
 * que combina, sim; sem nome (ícone, desenho, área solta), aceita; com OUTRO nome (o logo do Google
 * quando pediu o YouTube), o modelo chutou — não marca. Pura.
 */
export function imagemConfere(noPonto: { t: string; n: string } | null, alvo: string): boolean {
  if (!noPonto) return true;
  const n = norm(noPonto.n);
  // Sem nome, ou um contêiner (a página, um painel): a acessibilidade não vê o ícone — vale a imagem.
  if (!n || /^(pane|document|window|custom|group)$/i.test(noPonto.t)) return true;
  const a = norm(alvo);
  return n.includes(a) || a.split(" ").some((p) => p.length >= 3 && n.includes(p));
}
