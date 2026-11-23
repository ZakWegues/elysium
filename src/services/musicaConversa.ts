import { getApiKey, getConfig } from "../main/config";
import { conversaRecente } from "./brain";
import { acharArtista, acharMusica, maisTocadas, parecidos } from "./deezer";
import { modoAnonimo } from "./episodios";
import { aprender, lerGostos, type Aprendido, type Sugestao } from "./gostos";
import { callChat, type Provider } from "./llm";
import { COMBINA_MINIMO, combina, escolherDaLista, igual, lerMusicas, palavras, type MusicaDita } from "./qualMusica";
import { emFrase, semAcento } from "./texto";

/**
 * Música na conversa (23/11): "músicas parecidas com X" vira uma lista de músicas que existem, o
 * "ela / a segunda / a mais parecida" vira a música certa, e o que ele diz que gosta fica guardado.
 * O modelo entende a fala (que chega com nome em inglês escrito errado) e propõe; a Deezer confere.
 */

const LISTA_VALE_MS = 30 * 60_000;
let ultimaLista: { em: number; itens: Sugestao[] } = { em: 0, itens: [] };
/** Só para os testes e para a lista que acabou de sair. */
export function guardarLista(itens: Sugestao[], agora = Date.now()): void { ultimaLista = { em: agora, itens }; }
export function listaRecente(agora = Date.now()): Sugestao[] { return agora - ultimaLista.em < LISTA_VALE_MS ? ultimaLista.itens : []; }

async function perguntar(system: string, user: string, maxTokens: number, esforco: "low" | "medium" = "low"): Promise<string | null> {
  const cfg = getConfig();
  const ordem: Provider[] = getApiKey() ? ["groq", "ollama"] : ["ollama"];
  for (const provider of ordem) {
    try {
      return await callChat({
        provider, model: provider === "ollama" ? cfg.ollamaChatModel : cfg.brainModel, json: true, esforco,
        temperature: 0.2, maxTokens, timeoutMs: esforco === "low" ? 12_000 : 20_000,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      });
    } catch (e) { console.warn(`[musica] ${provider} não respondeu:`, e instanceof Error ? e.message : e); }
  }
  return null;
}

const OUVIDO = "As falas vêm de transcrição de voz: nomes em inglês saem escritos errado (\"Roll It\" pode ser \"Roulette\", \"System of Fade Down\" é \"System of a Down\"). Use a conversa para achar o nome verdadeiro.";

const PROMPT_QUAL = `Descubra QUAL música o usuário quer tocar agora. ${OUVIDO}
"ela", "essa", "a que você achar", "a segunda" apontam para o que foi dito na conversa. Se ele descrever ("parecida com…"), escolha uma que exista de verdade.
Só uma música, a não ser que ele peça várias. Com MÚSICAS DO ARTISTA, escolha a que SOA como o nome dito, e não a mais famosa. Não dá para saber: lista vazia. Nunca chute uma música sem relação com a conversa.
Responda só JSON: {"musicas":[{"titulo":"...","artista":"..."}]}`;

/** "Roll It do System of a Down": as músicas do System, para achar a que soa como "Roll It". */
async function musicasDoArtistaDito(busca: string): Promise<string> {
  const m = /.{2,}\s+d[aeo]s?\s+(.{2,60}?)[.!?\s]*$/i.exec(busca);
  const a = m ? await acharArtista(m[1]).catch(() => null) : null;
  if (!m || !a || combina(m[1], { track: "", artist: a.nome }) < COMBINA_MINIMO) return "";
  const titulos = [...new Set((await maisTocadas(a.id, 60)).map((x) => x.titulo))];
  return titulos.length ? `MÚSICAS DO ARTISTA ${a.nome}: ${titulos.join(" | ")}` : "";
}

/** A música que ele quis dizer, pela última lista ou pela conversa. [] = não deu para saber. */
export async function resolverPelaConversa(pedido: string, busca: string, errada?: string): Promise<MusicaDita[]> {
  const lista = listaRecente();
  const daLista = errada ? null : escolherDaLista(busca, lista);
  if (daLista) return daLista;
  const doArtista = await musicasDoArtistaDito(busca);
  const bruto = await perguntar(PROMPT_QUAL, [
    `CONVERSA:\n${conversaRecente() || "(vazia)"}`,
    lista.length ? `ÚLTIMA LISTA SUGERIDA:\n${lista.map((m, i) => `${i + 1}. ${m.titulo} — ${m.artista}`).join("\n")}` : "",
    doArtista,
    errada ? `TOCOU ERRADO (não é esta): ${errada}` : "",
    `PEDIDO: ${pedido}`,
  ].filter(Boolean).join("\n\n"), 700);
  return bruto ? lerMusicas(bruto) : [];
}

// ── músicas parecidas ───────────────────────────────────────────────────────────────────────

/** Ele pede sugestão de músicas? Pura. */
export function pedeParecidas(texto: string): boolean {
  const t = semAcento(texto);
  if (!/\b(?:musicas?|sons?|cancoes|bandas?|artistas?|faixas?|playlist)\b/.test(t)) return false;
  if (/\b(?:filmes?|series?|livros?|jogos?|podcasts?|quem (?:canta|toca|fez|e)|letra|traducao)\b/.test(t)) return false;
  return /\b(?:parecid[ao]s?|semelhantes?|mesm[ao] (?:vibe|pegada|linha|energia|estilo)|no estilo|do tipo|tipo (?:as?|os?|de)?|recomend\w+|sugere|sugira|sugestao|sugestoes|indica\w*|mais musicas|lista|listinha)\b/.test(t)
    && /\b(?:quero|queria|gostaria|preciso|acha|ache|procura|procure|busca|busque|me (?:da|de|manda|fala|faz|mostra|recomend\w*|suger\w*|sugira|indi\w*)|faz|faca|fizesse|recomend\w+|sugere|sugira|sugestao|sugestoes|indica|indique|tem|conhece|quais|mostra|monta|monte)\b/.test(t);
}

const PROMPT_PARECIDAS = `Você recomenda músicas. ${OUVIDO} Corrija sempre para o nome verdadeiro.
1. "base": as músicas que o usuário citou como ponto de partida, com título e artista corretos (versão de outra banda fica com o título original e a banda que ele citou).
2. "gosta" / "nao_gosta": só o que ele DISSE que gosta ou não gosta, nada além. {"tipo":"musica"|"artista","nome":"...","artista":"..."}.
3. "clima": em poucas palavras, o que as de base têm em comum (andamento, peso, voz, instrumentos).
4. "musicas": 16 reais com esse MESMO clima, da mais parecida para a menos. Evite sucessos óbvios que não têm esse clima. Respeite o que ele pediu (mais da banda, outras bandas, idioma). Não repita as de base; no máximo 5 do mesmo artista. "porque": até 6 palavras em português, sem ponto.
Responda só JSON: {"base":[{"titulo":"","artista":""}],"gosta":[],"nao_gosta":[],"clima":"","musicas":[{"titulo":"","artista":"","porque":""}]}`;

interface Dito { tipo: "musica" | "artista"; nome: string; artista: string }
/** Pura. */
export function lerDitos(bruto: string, chave: "gosta" | "nao_gosta"): Dito[] {
  let j: Record<string, unknown>;
  try { j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as Record<string, unknown>; } catch { return []; }
  const lista = j?.[chave];
  if (!Array.isArray(lista)) return [];
  const limpo = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 100) : "");
  return (lista as Record<string, unknown>[])
    .map((x): Dito => ({ tipo: x?.tipo === "artista" ? "artista" : "musica", nome: limpo(x?.nome), artista: limpo(x?.artista) }))
    .filter((d) => d.nome.length >= 2).slice(0, 8);
}

function resumoDoGosto(): string {
  const g = lerGostos();
  const de = (v: 1 | -1) => Object.values(g.artistas).filter((a) => a.valor === v).slice(0, 25).map((a) => a.nome).join(", ");
  const sim = de(1), nao = de(-1);
  const musicas = Object.values(g.musicas).filter((m) => m.valor === 1).slice(-15).map((m) => `${m.titulo} (${m.artista})`).join(", ");
  return [sim && `Gosta de: ${sim}`, musicas && `Músicas de que gosta: ${musicas}`, nao && `Não gosta de: ${nao}`].filter(Boolean).join("\n");
}

/** Alguma palavra do nome foi mesmo dita? O modelo às vezes inventa um gosto a mais. Pura. */
export function foiDito(d: { nome: string; artista: string }, texto: string): boolean {
  const ditas = palavras(texto);
  return [...palavras(d.nome), ...palavras(d.artista)].some((p) => p.length >= 3 && ditas.some((x) => igual(x, p)));
}

/** Confere na Deezer e guarda. Devolve o que entrou de novo. */
export async function aprenderDitos(texto: string, gostaBruto: Dito[], naoGostaBruto: Dito[]): Promise<Aprendido[]> {
  if (modoAnonimo()) return [];
  const gosta = gostaBruto.filter((d) => foiDito(d, texto)), naoGosta = naoGostaBruto.filter((d) => foiDito(d, texto));
  const novos: Aprendido[] = [];
  for (const [lista, valor] of [[gosta, 1], [naoGosta, -1]] as const) {
    for (const d of lista) {
      if (d.tipo === "artista") {
        const a = await acharArtista(d.nome).catch(() => null);
        if (!a || combina(d.nome, { track: "", artist: a.nome }) < COMBINA_MINIMO) continue;
        const x = aprender({ tipo: "artista", nome: a.nome }, valor);
        if (x) novos.push(x);
      } else {
        const m = await acharMusica(d.nome, d.artista).catch(() => null);
        if (!m) continue;
        const x = aprender({ tipo: "musica", nome: m.titulo, artista: m.artista, id: m.id }, valor);
        if (x) novos.push(x);
      }
    }
  }
  if (novos.length) console.log(`[musica] aprendi ${novos.length} gosto(s) pela conversa`);
  return novos;
}

/** "Roulette e Spiders, de System Of A Down; Nutshell, de Alice In Chains". Pura. */
export function listaFalada(itens: { titulo: string; artista: string }[]): string {
  const por = new Map<string, string[]>();
  for (const m of itens) por.set(m.artista, [...(por.get(m.artista) ?? []), m.titulo]);
  return [...por].map(([artista, ts]) => `${emFrase(ts)}, de ${artista}`).join("; ");
}

export interface RespostaDeMusicas { fala: string; itens: Sugestao[]; aprendi: string[] }

/** A lista de parecidas. null = o modelo ou a internet não ajudaram: o pedido segue o caminho normal. */
export async function musicasParecidas(texto: string): Promise<RespostaDeMusicas | null> {
  const bruto = await perguntar(PROMPT_PARECIDAS, [`CONVERSA:\n${conversaRecente(6) || "(vazia)"}`, resumoDoGosto(), `PEDIDO: ${texto.slice(0, 2500)}`].filter(Boolean).join("\n\n"), 4000, "medium");
  if (!bruto) return null;
  // O nome da base sai da Deezer; sem achar lá, vale o do modelo só para não repetir.
  const base = await Promise.all(lerMusicas(bruto, "base", 6).map(async (b) => {
    const m = await acharMusica(b.titulo, b.artista).catch(() => null) ?? await acharMusica(b.titulo, "").catch(() => null);
    return { titulo: m?.titulo ?? b.titulo, artista: m?.artista ?? b.artista };
  }));
  const propostas = lerMusicas(bruto);
  if (!propostas.length) return null;
  const g = lerGostos();
  const fora = (titulo: string, artista: string) => base.some((b) => combina(`${b.titulo} ${b.artista}`, { track: titulo, artist: artista }) >= 0.85 && combina(titulo, { track: b.titulo, artist: b.artista }) >= 0.85)
    || g.artistas[semAcento(artista).trim()]?.valor === -1;
  const itens: Sugestao[] = [];
  const por = (id: number, titulo: string, artista: string, capa: string | null, motivo: string) => {
    if (itens.length >= 10 || itens.some((x) => x.id === id || semAcento(x.titulo + x.artista) === semAcento(titulo + artista)) || g.musicas[id]?.valor === -1 || fora(titulo, artista)
      || itens.filter((x) => semAcento(x.artista) === semAcento(artista)).length >= 5) return;
    itens.push({ id, titulo, artista, capa, motivo });
  };
  const achadas = await Promise.all(propostas.map(async (p) => ({ p, m: await acharMusica(p.titulo, p.artista).catch(() => null) })));
  for (const { p, m } of achadas) if (m) por(m.id, m.titulo, m.artista, m.capa, p.porque);
  // Poucas existiam de verdade: completa com os artistas parecidos com os da base.
  if (itens.length < 6) {
    for (const b of base.slice(0, 2)) {
      const a = b.artista ? await acharArtista(b.artista).catch(() => null) : null;
      if (!a) continue;
      for (const p of (await parecidos(a.id)).slice(0, 5)) {
        const m = (await maisTocadas(p.id, 5))[0];
        if (m) por(m.id, m.titulo, m.artista, m.capa, `parecido com ${a.nome}`);
      }
    }
  }
  if (itens.length < 3) return null;
  guardarLista(itens);
  // Pedir parecidas com X é dizer que gosta de X.
  const daBase = base.map((b): Dito => ({ tipo: "musica", nome: b.titulo, artista: b.artista }));
  const gosta = [...daBase, ...lerDitos(bruto, "gosta").filter((d) => !daBase.some((b) => combina(d.nome, { track: b.nome, artist: "" }) >= 0.8))];
  const aprendi = await aprenderDitos(texto, gosta, lerDitos(bruto, "nao_gosta")).catch(() => []);
  const com = base.length ? ` na pegada de ${emFrase(base.slice(0, 3).map((b) => b.titulo))}` : " para você";
  return {
    fala: `Separei ${itens.length}${com}: ${listaFalada(itens)}. Diga "toca a primeira" ou "toca todas" quando quiser.`,
    itens, aprendi: aprendi.filter((x) => x.valor === 1).map((x) => x.nome),
  };
}

// ── aprender pela fala ──────────────────────────────────────────────────────────────────────

/** A fala parece dizer um gosto musical? Só então vale a chamada ao modelo. Pura. */
export function falaDeGosto(texto: string): boolean {
  const t = semAcento(texto);
  return /\b(?:gosto|gostei|gostava|curto|curti|curtia|amo|adoro|adorei|viciad[ao]|escuto|ouco|favorit[ao]s?|preferid[ao]s?|nao suporto|odeio|detesto|enjoei|muito boa|da hora|nao sai da (?:minha )?cabeca)\b/.test(t)
    && /\b(?:musicas?|som|sons|bandas?|cantora?s?|artistas?|albu(?:m|ns)|rap|rock|metal|funk|pagode|samba|sertanejo|mpb|pop|trap|jazz|blues|indie|eletronica|spotify|disco|grupo|dj)\b/.test(t);
}

const PROMPT_GOSTO = `Extraia o gosto musical que o usuário DISSE nesta fala. ${OUVIDO}
Só o que ele afirmou gostar ou não gostar; pergunta, pedido de tocar ou dúvida não conta. Artista e música com o nome verdadeiro.
Responda só JSON: {"gosta":[{"tipo":"musica"|"artista","nome":"...","artista":"..."}],"nao_gosta":[]}`;

let ultimaLeitura = 0;
/** Depois da resposta, sem segurar nada. */
export async function aprenderDaFala(texto: string, agora = Date.now()): Promise<void> {
  if (modoAnonimo() || !falaDeGosto(texto) || agora - ultimaLeitura < 15_000) return;
  ultimaLeitura = agora;
  const bruto = await perguntar(PROMPT_GOSTO, `CONVERSA ANTES:\n${conversaRecente(4) || "(vazia)"}\n\nFALA: ${texto.slice(0, 1500)}`, 700);
  if (bruto) await aprenderDitos(texto, lerDitos(bruto, "gosta"), lerDitos(bruto, "nao_gosta"));
}
