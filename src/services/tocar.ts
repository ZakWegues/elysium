import { shell } from "electron";
import { playMusic } from "../actions/playMusic";
import { abrirNoCelularAtual, aparelhoDoPedido } from "./contextoComando";
import { alvoDoApp, lerPedido, urlDaBusca, type AlvoNoCelular, type Aparelho, type Pedido } from "./destino";
import { corrigeMusica, type MusicaDita } from "./qualMusica";
import { musicasParecidas, resolverPelaConversa } from "./musicaConversa";
import * as spotify from "./spotify";

/**
 * Executa o que `destino.ts` leu (23/11). Para o celular, o alvo vai junto da resposta (o pedido
 * veio dele) ou como entrega com `ref abrir:` (o pedido veio do PC).
 */

type Mandar = (alvo: AlvoNoCelular) => void;
let mandarAoCelular: Mandar = () => {};
/** O main liga a entrega ao celular aqui. */
export function definirAberturaNoCelular(fn: Mandar): void { mandarAoCelular = fn; }

/** Entrega o alvo ao celular. Devolve true se abre na hora (o pedido veio dele). */
function noCelular(alvo: AlvoNoCelular): boolean {
  if (abrirNoCelularAtual(alvo)) return true;
  mandarAoCelular(alvo);
  return false;
}

/** O primeiro vídeo da busca no YouTube (null sem rede ou se a página mudar). */
async function acharVideo(busca: string): Promise<string | null> {
  try {
    const res = await fetch(`${urlDaBusca("youtube", busca)}&hl=pt`, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-BR" }, signal: AbortSignal.timeout(6_000) });
    return /"videoId":"([\w-]{11})"/.exec(await res.text())?.[1] ?? null;
  } catch { return null; }
}
async function urlDoVideo(busca: string): Promise<string> {
  const id = await acharVideo(busca);
  return id ? `https://www.youtube.com/watch?v=${id}` : urlDaBusca("youtube", busca);
}

const onde = (a: Aparelho) => (a === "celular" ? "no celular" : "no PC");

/**
 * 27/11: o Spotify daquele aparelho estava fechado e acabou de ser aberto na faixa/playlist. Ele
 * só vira "aparelho" da API alguns segundos depois de acordar: tenta dar o play por ~20 s, em
 * segundo plano (a resposta não espera — é ela que leva o "abrir" ao celular).
 */
let acordando = 0;
export function tocarQuandoAcordar(aparelho: Aparelho, uri: string | { contexto: string }, esperaMs = 1500, vezes = 14): void {
  const minha = ++acordando;
  void (async () => {
    for (let i = 0; i < vezes && minha === acordando; i++) {
      await new Promise((r) => setTimeout(r, esperaMs));
      if (minha !== acordando) return;
      if (await spotify.tocarNo(aparelho, uri).catch(() => false)) { console.log(`[spotify] tocou ${onde(aparelho)} depois de abrir o app`); return; }
    }
  })();
}

/** A última que tocou a pedido: "não, nada a ver" logo depois é a correção dela. */
let ultimaTocada: { em: number; nome: string; app: "spotify" | "youtube" | null; aparelho: Aparelho } | null = null;
const CORRECAO_MS = 3 * 60_000;

/**
 * `exata` = título e artista já sabidos. `pedido` = a frase dele: sem nada que combine no Spotify,
 * a conversa diz que música era (a transcrição erra nome em inglês).
 */
export async function tocarMusica(busca: string, app: "spotify" | "youtube" | null, aparelho: Aparelho, exata?: MusicaDita, pedido?: string): Promise<string> {
  if (app !== "youtube" && spotify.isConnected()) {
    let faixa: Awaited<ReturnType<typeof spotify.acharFaixa>> = null, semRede = false;
    // 25/11: "o podcast do Clóvis", "o álbum Toxicity", "a playlist Foco": não é uma faixa.
    const colecao = !exata && /\b(?:podcasts?|epis[oó]dios?|[aá]lbum|disco|playlist)\b/i.test(`${pedido ?? ""} ${busca}`);
    if (colecao) {
      const c = await tocarColecao(`${/podcast|epis[oó]dio/i.test(pedido ?? "") && !/podcast/i.test(busca) ? "podcast " : ""}${busca}`, aparelho);
      if (c) return c;
    }
    try { faixa = await spotify.acharFaixa(busca, exata); } catch { semRede = true; }
    if (!faixa && !semRede && pedido) {
      const [m] = await resolverPelaConversa(pedido, busca);
      if (m) faixa = await spotify.acharFaixa("", m).catch(() => null);
    }
    if (!faixa && !semRede && !exata) {
      const c = await tocarColecao(busca, aparelho);
      if (c) return c;
    }
    if (!faixa && !semRede) return `Não achei "${busca}" no Spotify. Me diz o nome e o artista de novo?`;
    if (faixa) {
      ultimaTocada = { em: Date.now(), nome: `${faixa.track}, de ${faixa.artist}`, app, aparelho };
      const nome = faixa.artist ? `${faixa.track}, de ${faixa.artist}` : faixa.track;
      if (await spotify.tocarNo(aparelho, faixa.uri)) return `Tocando ${nome}, ${onde(aparelho)}.`;
      // O Spotify daquele aparelho está fechado: abre direto na faixa.
      const id = faixa.uri.split(":")[2];
      if (aparelho === "celular") {
        const ja = noCelular({ rotulo: faixa.track, url: faixa.uri, reserva: `https://open.spotify.com/track/${id}` });
        tocarQuandoAcordar("celular", faixa.uri);
        return ja ? `Abri ${nome} no Spotify do celular.` : `Mandei ${nome} para o Spotify do celular.`;
      }
      await shell.openExternal(faixa.uri).catch(() => {});
      // O app acorda em alguns segundos; aí a API dá o play.
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        if (await spotify.tocarNo("pc", faixa.uri)) return `Tocando ${nome}, no PC.`;
      }
      return `Abri ${nome} no Spotify do PC. É só dar play.`;
    }
  }
  if (aparelho === "celular") {
    const alvo: AlvoNoCelular = app === "spotify"
      ? { rotulo: busca, url: `spotify:search:${encodeURIComponent(busca)}`, reserva: urlDaBusca("spotify", busca) }
      : { rotulo: busca, url: await urlDoVideo(busca) };
    const ja = noCelular(alvo);
    const lugar = app === "spotify" ? "Spotify" : "YouTube";
    return ja ? `Abri ${busca} no ${lugar} do celular.` : `Mandei ${busca} para o ${lugar} do celular.`;
  }
  if (app === "youtube") {
    await shell.openExternal(await urlDoVideo(busca));
    return `Tocando ${busca} no YouTube.`;
  }
  return playMusic(busca);
}

/** Podcast, álbum ou playlist. null = nenhum combina. */
async function tocarColecao(busca: string, aparelho: Aparelho): Promise<string | null> {
  const c = await spotify.acharColecao(busca).catch(() => null);
  if (!c) return null;
  const o = c.tipo === "show" ? "o podcast" : c.tipo === "album" ? "o álbum" : "a playlist";
  if (await spotify.tocarNo(aparelho, { contexto: c.uri })) return `Tocando ${o} ${c.nome}, ${onde(aparelho)}.`;
  const [, tipo, id] = c.uri.split(":");
  if (aparelho === "celular") {
    const ja = noCelular({ rotulo: c.nome, url: c.uri, reserva: `https://open.spotify.com/${tipo}/${id}` });
    tocarQuandoAcordar("celular", { contexto: c.uri });
    return ja ? `Abri ${o} ${c.nome} no Spotify do celular.` : `Mandei ${o} ${c.nome} para o celular.`;
  }
  await shell.openExternal(c.uri).catch(() => {});
  tocarQuandoAcordar("pc", { contexto: c.uri });
  return `Abri ${o} ${c.nome} no Spotify do PC.`;
}

/**
 * 27/11: "gera uma playlist pra eu me concentrar". As músicas saem da mesma conta das parecidas
 * (o clima do pedido, conferidas na Deezer), viram uma playlist na conta dele e já tocam no
 * aparelho certo. Sem modelo ou sem permissão de playlist: toca uma playlist pronta do Spotify.
 */
export async function gerarPlaylist(pedido: string, nome: string, aparelho: Aparelho): Promise<string> {
  if (!spotify.isConnected()) return "Para eu montar playlist, conecte o Spotify no PC (Ajustes → Spotify).";
  const m = await musicasParecidas(`Monte uma playlist: ${pedido}`).catch(() => null);
  let falha = "";
  if (m) {
    try {
      const p = await spotify.criarPlaylist((nome || `Ely · ${pedido}`).slice(0, 80), m.itens);
      if (await spotify.tocarNo(aparelho, { contexto: p.uri })) return `Montei a playlist ${p.nome}, com ${p.total} músicas, e já está tocando ${onde(aparelho)}.`;
      const id = p.uri.split(":")[2];
      if (aparelho === "celular") {
        const ja = noCelular({ rotulo: p.nome, url: p.uri, reserva: `https://open.spotify.com/playlist/${id}` });
        tocarQuandoAcordar("celular", { contexto: p.uri });
        return `Montei a playlist ${p.nome}, com ${p.total} músicas, e ${ja ? "abri" : "mandei"} no Spotify do celular.`;
      }
      await shell.openExternal(p.uri).catch(() => {});
      tocarQuandoAcordar("pc", { contexto: p.uri });
      return `Montei a playlist ${p.nome}, com ${p.total} músicas, e abri no Spotify do PC.`;
    } catch (e) {
      falha = e instanceof Error ? e.message : String(e);
      console.warn("[spotify] playlist nova falhou:", falha);
    }
  }
  const pronta = await tocarColecao(`playlist ${pedido}`, aparelho);
  if (pronta) return /conecte o Spotify de novo/i.test(falha) ? `${pronta} Para eu criar playlists suas, saia e conecte o Spotify de novo no PC.` : pronta;
  return `Não consegui montar a playlist agora${falha ? ` (${falha})` : ""}. Me diz um artista ou estilo que eu toco.`;
}

/** Várias seguidas, na ordem. Com o Spotify do aparelho fechado, abre na primeira. */
async function tocarVarias(musicas: MusicaDita[], app: "spotify" | "youtube" | null, aparelho: Aparelho): Promise<string> {
  const [primeira] = musicas;
  if (app !== "youtube" && spotify.isConnected() && musicas.length > 1) {
    const uris = await spotify.uris(musicas).catch(() => []);
    if (uris.length && await spotify.tocarNo(aparelho, uris)) return `Tocando ${uris.length} músicas, começando por ${primeira.titulo}, ${onde(aparelho)}.`;
  }
  return tocarMusica(`${primeira.titulo} ${primeira.artista}`.trim(), app, aparelho, primeira);
}

/** "Continua no celular": leva o que está tocando para o outro aparelho. */
export async function passarMusica(para: Aparelho): Promise<string> {
  if (!spotify.isConnected()) return "Para passar a música de um aparelho para o outro, conecte o Spotify no PC.";
  const foi = await spotify.transferirPara(para).catch(() => false);
  if (foi) return `Pronto, continua ${onde(para)}.`;
  if (para === "celular") {
    const ja = noCelular({ rotulo: "Spotify", pacote: "com.spotify.music", reserva: "https://open.spotify.com" });
    return ja ? "Abri o Spotify do celular. Peça de novo daqui a um instante que eu passo a música." : "O Spotify do celular está fechado. Mandei abrir; peça de novo daqui a um instante.";
  }
  return "O Spotify do PC está fechado. Abra e peça de novo.";
}

/**
 * Cuida do pedido de abrir/tocar com destino. null = não é daqui: segue o caminho normal, com o
 * texto que voltou em `seguir` (o pedido sem "no PC", que já é o padrão do resto).
 */
export async function cuidarDoDestino(texto: string): Promise<{ fala: string } | { seguir: string } | null> {
  const p = lerPedido(texto);
  // "Não, é Roulette, do System of a Down": corrige a que acabou de tocar, no mesmo aparelho.
  if (!p && ultimaTocada && Date.now() - ultimaTocada.em < CORRECAO_MS && corrigeMusica(texto)) {
    const u = ultimaTocada;
    const certas = await resolverPelaConversa(texto, texto, u.nome);
    if (certas.length) { ultimaTocada = null; return { fala: await tocarVarias(certas, u.app, u.aparelho) }; }
  }
  if (!p) return null;
  const origem = aparelhoDoPedido();
  const destino = p.dito ?? origem;
  const pedido: Pedido = p.pedido;
  if (pedido.tipo === "passar") return { fala: await passarMusica(destino) };
  if (pedido.tipo === "tocar") {
    if (!pedido.referencia) return { fala: await tocarMusica(pedido.busca, pedido.app, destino, undefined, texto) };
    const quais = await resolverPelaConversa(texto, pedido.busca);
    // Não deu para saber qual é: a conversa segue e ela pergunta.
    return quais.length ? { fala: await tocarVarias(quais, pedido.app, destino) } : null;
  }
  if (destino === "pc") return p.dito ? { seguir: p.semAparelho } : null;

  if (pedido.tipo === "pesquisar") {
    const ja = noCelular({ rotulo: pedido.busca, url: urlDaBusca(pedido.site, pedido.busca) });
    return { fala: ja ? `Abrindo a busca por ${pedido.busca}.` : `Mandei a busca por ${pedido.busca} para o celular.` };
  }
  const alvo = alvoDoApp(pedido.nome);
  if (!alvo) {
    // Pediu do celular sem dizer onde, e o celular não conhece: o PC tenta (um programa do Windows).
    return p.dito ? { fala: `Não sei abrir "${pedido.nome}" no celular.` } : null;
  }
  const ja = noCelular(alvo);
  return { fala: ja ? `Abrindo ${alvo.rotulo}.` : `Mandei abrir ${alvo.rotulo} no celular.` };
}
