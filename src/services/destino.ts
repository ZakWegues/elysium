import { semAcento } from "./texto";

/**
 * Abrir e tocar no aparelho certo (23/11 — "ele prioriza pelo dispositivo que tá"): o pedido vale
 * no aparelho de onde veio; "no celular" / "no PC" manda para o outro. Tudo puro e testado; quem
 * executa é `tocar.ts`.
 */
export type Aparelho = "pc" | "celular";

export type Pedido =
  | { tipo: "abrir"; nome: string }
  | { tipo: "pesquisar"; busca: string; site: "youtube" | "google" | "spotify" | "maps" }
  | { tipo: "tocar"; busca: string; app: "spotify" | "youtube" | null }
  | { tipo: "passar" };

export interface PedidoComDestino {
  pedido: Pedido;
  /** O aparelho dito ("no celular"), ou null. */
  dito: Aparelho | null;
  /** O pedido sem o "no celular" / "no PC". */
  semAparelho: string;
}

/** O que o celular abre: endereço, pacote Android ou tela do sistema. */
export interface AlvoNoCelular { rotulo: string; url?: string; reserva?: string; pacote?: string; acao?: string }

const APARELHO = /[,\s]+(?:(?:aqui|l[aá]|direto)\s+)?(?:n[oa]|pel[oa]|pr[oa]|para [oa])\s+(?:meu |minha )?(celular|telefone|smartphone|cel|pc|computador|notebook|desktop)(?=[\s.!?,]|$)/i;

/** "abre o YouTube no celular" → { dito: "celular", sem: "abre o YouTube" }. Pura. */
export function tirarAparelho(texto: string): { dito: Aparelho | null; sem: string } {
  const m = APARELHO.exec(texto);
  if (!m) return { dito: null, sem: texto.trim() };
  const dito: Aparelho = /^(celular|telefone|smartphone|cel)$/i.test(m[1]) ? "celular" : "pc";
  return { dito, sem: (texto.slice(0, m.index) + texto.slice(m.index + m[0].length)).replace(/\s+([.!?,])/g, "$1").replace(/\s{2,}/g, " ").trim() };
}

const ENFEITE = /^(?:(?:oi|ei|ely|elysium|por favor|por gentileza|agora|a[íi]|ent[aã]o)[,\s]+|(?:voc[eê] )?(?:pode|poderia|consegue)\s+|(?:eu )?(?:quero|queria|preciso) que (?:voc[eê] )?)+/i;
const OUTRO_PEDIDO = /\s(?:e|depois|a[íi])\s+(?:depois\s+|tamb[eé]m\s+)?(?:abre|abra|abrir|fecha|fechar|toca|tocar|liga|desliga|aumenta|diminui|me |manda|coloca|bota|p[oõ]e|pesquisa|procura|cria|anota|lembra)/i;

/** O pedido é de abrir, tocar, pesquisar num app ou passar a música? Só a frase inteira e simples. Pura. */
export function lerPedido(texto: string): PedidoComDestino | null {
  const { dito, sem } = tirarAparelho(texto);
  const t = sem.replace(ENFEITE, "").replace(/[.!?\s]+$/, "").replace(/[,\s]+(?:por favor|pra mim|para mim|a[íi])$/i, "").trim();
  if (!t || t.length > 140 || OUTRO_PEDIDO.test(t)) return null;
  const feito = (pedido: Pedido): PedidoComDestino => ({ pedido, dito, semAparelho: sem });

  // "continua no celular", "passa a música pro PC" — só com o aparelho dito.
  if (dito && (/^(?:continua|continuar|segue)(?:\s+(?:a tocar|tocando|a m[uú]sica|o som|o spotify|essa m[uú]sica))?$/i.test(t)
    || /^(?:passa|passar|transfere|transferir|joga|leva|manda|muda|toca)\s+(?:a m[uú]sica|o som|o spotify|essa m[uú]sica|esta m[uú]sica)$/i.test(t))) return feito({ tipo: "passar" });

  // Tocar: "toca Angel do Massive Attack", "coloca pra tocar…", "bota a música X", "põe X no Spotify".
  const app = /[,\s]+(?:n[oa]|pel[oa])\s+(spotify|youtube(?: music)?)$/i.exec(t);
  const semApp = app ? t.slice(0, app.index).trim() : t;
  const qualApp = app ? (/spotify/i.test(app[1]) ? "spotify" as const : "youtube" as const) : null;
  const toca = /^(?:toca|toque|tocar|reproduz|reproduza|(?:coloca|coloque|bota|bote|p[oõ]e|ponha)\s+(?:pra|para|a)\s+tocar)\s+(.+)$/i.exec(semApp);
  const poe = /^(?:coloca|coloque|colocar|bota|bote|botar|p[oõ]e|ponha|p[oô]r)\s+(.+)$/i.exec(semApp);
  const bruto = toca?.[1] ?? (poe && (qualApp || /^(?:a |o |uma |um )?(?:m[uú]sica|som|faixa|can[cç][aã]o|[aá]lbum|playlist)\b/i.test(poe[1])) ? poe[1] : null);
  if (bruto) {
    // "toca a próxima", "toca de novo" são controle do player, não busca.
    if (/^(?:a |o )?(?:pr[oó]xima|anterior|de novo|outra vez|alarme|sino|campainha|minha|meu)\b/i.test(bruto)) return null;
    const busca = bruto
      .replace(/^(?:a |o |uma |um |as )?(?:m[uú]sica|som|faixa|can[cç][aã]o)s?\s+(?:chamada |que chama )?/i, "")
      .replace(/["'“”]/g, "").replace(/[,\s]+d[aeo]s?\s+(?:banda|grupo|cantora?|dupla|artista|dj)\s+/i, " ").trim();
    return busca.length >= 2 ? feito({ tipo: "tocar", busca, app: qualApp }) : null;
  }

  // Pesquisar dentro de um app.
  const pesq = /^(?:pesquisa|pesquise|pesquisar|procura|procure|procurar|busca|busque|buscar)\s+(?:por\s+)?(.+?)\s+(?:n[oa]|pel[oa])\s+(youtube|google maps|maps|google|spotify)$/i.exec(t);
  if (pesq) {
    const s = semAcento(pesq[2]);
    return feito({ tipo: "pesquisar", busca: pesq[1].trim(), site: s.includes("maps") ? "maps" : s as "youtube" | "google" | "spotify" });
  }

  const abre = /^(?:abre|abra|abrir|abri|inicia|inicie|entra n[oa]|executa)\s+(?:(?:o|a|os|as|meu|minha)\s+)?(?:(?:app|aplicativo|site)\s+(?:d[oae]\s+)?)?(.+)$/i.exec(t);
  if (abre) return feito({ tipo: "abrir", nome: abre[1].trim() });
  return null;
}

// ── o que o celular sabe abrir ──────────────────────────────────────────────────────────────

const site = (rotulo: string, url: string, pacote?: string): AlvoNoCelular => ({ rotulo, reserva: url, ...(pacote ? { pacote } : { url }) });
const sistema = (rotulo: string, acao: string): AlvoNoCelular => ({ rotulo, acao });

const APPS: [RegExp, AlvoNoCelular][] = [
  [/^youtube music$|^yt music$/, site("YouTube Music", "https://music.youtube.com", "com.google.android.apps.youtube.music")],
  [/^(you ?tube|yt)$/, site("YouTube", "https://www.youtube.com", "com.google.android.youtube")],
  [/^spotify$/, site("Spotify", "https://open.spotify.com", "com.spotify.music")],
  [/^(whats ?app|zap|whats|wpp)$/, site("WhatsApp", "https://wa.me", "com.whatsapp")],
  [/^whats ?app business$/, site("WhatsApp Business", "https://wa.me", "com.whatsapp.w4b")],
  [/^(instagram|insta)$/, site("Instagram", "https://www.instagram.com", "com.instagram.android")],
  [/^threads$/, site("Threads", "https://www.threads.net", "com.instagram.barcelona")],
  [/^(facebook|face)$/, site("Facebook", "https://www.facebook.com", "com.facebook.katana")],
  [/^messenger$/, site("Messenger", "https://www.messenger.com", "com.facebook.orca")],
  [/^(twitter|x)$/, site("X", "https://x.com", "com.twitter.android")],
  [/^(tik ?tok)$/, site("TikTok", "https://www.tiktok.com", "com.zhiliaoapp.musically")],
  [/^kwai$/, site("Kwai", "https://www.kwai.com", "com.kwai.video")],
  [/^telegram$/, site("Telegram", "https://web.telegram.org", "org.telegram.messenger")],
  [/^discord$/, site("Discord", "https://discord.com/app", "com.discord")],
  [/^reddit$/, site("Reddit", "https://www.reddit.com", "com.reddit.frontpage")],
  [/^pinterest$/, site("Pinterest", "https://www.pinterest.com", "com.pinterest")],
  [/^snapchat$/, site("Snapchat", "https://www.snapchat.com", "com.snapchat.android")],
  [/^linked ?in$/, site("LinkedIn", "https://www.linkedin.com", "com.linkedin.android")],
  [/^netflix$/, site("Netflix", "https://www.netflix.com", "com.netflix.mediaclient")],
  [/^(prime video|amazon prime)$/, site("Prime Video", "https://www.primevideo.com", "com.amazon.avod.thirdpartyclient")],
  [/^disney( plus|\+)?$/, site("Disney+", "https://www.disneyplus.com", "com.disney.disneyplus")],
  [/^(max|hbo max|hbo)$/, site("Max", "https://www.max.com", "com.wbd.stream")],
  [/^globoplay$/, site("Globoplay", "https://globoplay.globo.com", "com.globo.globotv")],
  [/^crunchyroll$/, site("Crunchyroll", "https://www.crunchyroll.com", "com.crunchyroll.crunchyroid")],
  [/^twitch$/, site("Twitch", "https://www.twitch.tv", "tv.twitch.android.app")],
  [/^deezer$/, site("Deezer", "https://www.deezer.com", "deezer.android.app")],
  [/^(gmail|e-?mail|email)$/, site("Gmail", "https://mail.google.com", "com.google.android.gm")],
  [/^outlook$/, site("Outlook", "https://outlook.live.com", "com.microsoft.office.outlook")],
  [/^(google )?(maps|mapas|mapa)$/, site("Google Maps", "https://maps.google.com", "com.google.android.apps.maps")],
  [/^waze$/, site("Waze", "https://www.waze.com", "com.waze")],
  [/^uber$/, site("Uber", "https://m.uber.com", "com.ubercab")],
  [/^(99|99 ?pop|99 ?app)$/, site("99", "https://99app.com", "com.taxis99")],
  [/^ifood$/, site("iFood", "https://www.ifood.com.br", "br.com.brainweb.ifood")],
  [/^mercado livre$/, site("Mercado Livre", "https://www.mercadolivre.com.br", "com.mercadolibre")],
  [/^amazon$/, site("Amazon", "https://www.amazon.com.br", "com.amazon.mShop.android.shopping")],
  [/^shopee$/, site("Shopee", "https://shopee.com.br", "com.shopee.br")],
  [/^shein$/, site("Shein", "https://br.shein.com", "com.zzkko")],
  [/^ali ?express$/, site("AliExpress", "https://pt.aliexpress.com", "com.alibaba.aliexpresshd")],
  [/^olx$/, site("OLX", "https://www.olx.com.br", "com.schibsted.bomnegocio.androidApp")],
  [/^(google )?drive$/, site("Google Drive", "https://drive.google.com", "com.google.android.apps.docs")],
  [/^(google )?(fotos|photos)$/, site("Google Fotos", "https://photos.google.com", "com.google.android.apps.photos")],
  [/^(google )?(agenda|calendario|calendar)$/, site("Google Agenda", "https://calendar.google.com", "com.google.android.calendar")],
  [/^google keep$|^keep$/, site("Google Keep", "https://keep.google.com", "com.google.android.keep")],
  [/^(google )?meet$/, site("Google Meet", "https://meet.google.com", "com.google.android.apps.tachyon")],
  [/^zoom$/, site("Zoom", "https://zoom.us", "us.zoom.videomeetings")],
  [/^teams$/, site("Teams", "https://teams.microsoft.com", "com.microsoft.teams")],
  [/^notion$/, site("Notion", "https://www.notion.so", "notion.id")],
  [/^(chat ?gpt)$/, site("ChatGPT", "https://chatgpt.com", "com.openai.chatgpt")],
  [/^gemini$/, site("Gemini", "https://gemini.google.com", "com.google.android.apps.bard")],
  [/^claude$/, site("Claude", "https://claude.ai", "com.anthropic.claude")],
  [/^(google )?chrome$|^navegador$/, site("Chrome", "https://www.google.com", "com.android.chrome")],
  [/^google$/, site("Google", "https://www.google.com", "com.google.android.googlequicksearchbox")],
  [/^(play store|loja|google play)$/, site("Play Store", "https://play.google.com/store", "com.android.vending")],
  [/^duolingo$/, site("Duolingo", "https://www.duolingo.com", "com.duolingo")],
  [/^strava$/, site("Strava", "https://www.strava.com", "com.strava")],
  [/^steam$/, site("Steam", "https://store.steampowered.com", "com.valvesoftware.android.steam.community")],
  [/^roblox$/, site("Roblox", "https://www.roblox.com", "com.roblox.client")],
  [/^github$/, site("GitHub", "https://github.com", "com.github.android")],
  [/^wikipedia$/, site("Wikipédia", "https://pt.wikipedia.org", "org.wikipedia")],
  [/^(camera|camara)$/, sistema("a câmera", "android.media.action.STILL_IMAGE_CAMERA")],
  [/^(configuracoes|config|ajustes|definicoes)( do celular)?$/, sistema("as configurações", "android.settings.SETTINGS")],
  [/^(wi-?fi|configuracoes de wi-?fi)$/, sistema("o Wi-Fi", "android.settings.WIFI_SETTINGS")],
  [/^(bluetooth|configuracoes de bluetooth)$/, sistema("o Bluetooth", "android.settings.BLUETOOTH_SETTINGS")],
  [/^(alarmes?|despertador|relogio)$/, sistema("os alarmes", "android.intent.action.SHOW_ALARMS")],
  [/^(telefone|discador|teclado do telefone)$/, sistema("o telefone", "android.intent.action.DIAL")],
];

/** "o Insta" → Instagram no celular; domínio ou link → o site; desconhecido → null. Pura. */
export function alvoDoApp(nome: string): AlvoNoCelular | null {
  const limpo = nome.trim().replace(/^(?:o|a|os|as|meu|minha)\s+/i, "");
  const n = semAcento(limpo).trim();
  for (const [re, alvo] of APPS) if (re.test(n)) return { ...alvo };
  if (/^https?:\/\/\S+$/i.test(limpo)) return { rotulo: limpo.replace(/^https?:\/\//i, "").split("/")[0], url: limpo };
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(limpo)) return { rotulo: limpo.split("/")[0], url: `https://${limpo}` };
  return null;
}

/** A busca dentro do app, como endereço (o Android abre no app, se ele existir). Pura. */
export function urlDaBusca(siteDaBusca: "youtube" | "google" | "spotify" | "maps", busca: string): string {
  const q = encodeURIComponent(busca);
  if (siteDaBusca === "youtube") return `https://www.youtube.com/results?search_query=${q}`;
  if (siteDaBusca === "spotify") return `https://open.spotify.com/search/${q}`;
  if (siteDaBusca === "maps") return `https://www.google.com/maps/search/?api=1&query=${q}`;
  return `https://www.google.com/search?q=${q}`;
}

/** O alvo vira `ref` de uma entrega (a notificação do celular). Pura. */
export function refDoAlvo(a: AlvoNoCelular): string {
  return `abrir:${Buffer.from(JSON.stringify(a), "utf8").toString("base64url")}`;
}
