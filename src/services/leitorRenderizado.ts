import { BrowserWindow, session } from "electron";
import { resolvePublico, urlPermitida } from "./leitorDeLink";

/**
 * 27/11 (o dono: "o PortWatch tá marcando 91,3%"): muito site de hoje monta o número por
 * JavaScript — o HTML puro do PortWatch diz "0 %". Quando o Gemini não pode abrir a página (cota),
 * a Ely abre num navegador escondido do próprio Electron, espera a página montar e lê o texto.
 *
 * Isolado: sessão em memória só dele, sem Node, em sandbox, sem janelas novas, sem downloads, sem
 * permissões, e nada de endereço da rede local (nem em redirecionamento, nem nos pedidos da página).
 */

const PARTICAO = "leitor-de-site";
let sessaoPronta = false;

function prepararSessao(): Electron.Session {
  const s = session.fromPartition(PARTICAO);
  if (sessaoPronta) return s;
  sessaoPronta = true;
  s.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  s.on("will-download", (e) => e.preventDefault());
  s.webRequest.onBeforeRequest((d, cb) => {
    const ok = !/^https?:/i.test(d.url) || urlPermitida(d.url);
    cb({ cancel: !ok });
  });
  return s;
}

/** "portwatch-vi.xyz", "https://x.com/a" → endereço; só nome ("portwatch") → null. Pura. */
export function enderecoDoSite(site: string): string | null {
  const t = site.trim();
  if (/^https?:\/\//i.test(t)) return t;
  const m = /^(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(\/\S*)?$/i.exec(t);
  return m ? `https://${t}` : null;
}

/**
 * Os primeiros resultados da página de busca do Bing (HTML simples, sem chave), um por domínio, sem
 * o redirecionador (`u=a1` + base64url do endereço). O DuckDuckGo responde com desafio anti-robô. Pura.
 */
export function resultadosDaBusca(html: string, maximo = 3): string[] {
  const vistos = new Set<string>();
  const urls: string[] = [];
  for (const m of html.matchAll(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"/g)) {
    let href = m[1].replace(/&amp;/g, "&");
    const u = /[?&]u=a1([^&]+)/.exec(href);
    if (u) { try { href = Buffer.from(u[1], "base64url").toString("utf8"); } catch { continue; } }
    let dominio: string;
    try { dominio = new URL(href).hostname.replace(/^www\./, ""); } catch { continue; }
    if (!/^https?:$/.test(new URL(href).protocol) || /(^|\.)bing\.com$/.test(dominio) || vistos.has(dominio)) continue;
    vistos.add(dominio);
    urls.push(href);
    if (urls.length >= maximo) break;
  }
  return urls;
}

/**
 * Os endereços para abrir. Com o domínio dito, só ele. Só com o nome, os 3 primeiros da busca —
 * 27/11: há vários clones com o mesmo nome ("PortWatch VI" em .xyz, .online, .com…), e o primeiro
 * resultado nem sempre é o que ele usa; lendo os três, a resposta diz o número de cada um.
 */
export async function acharEnderecos(site: string, pergunta: string): Promise<string[]> {
  const direto = enderecoDoSite(site);
  if (direto) return [direto];
  try {
    const q = encodeURIComponent(`${site} ${pergunta}`.slice(0, 200));
    const r = await fetch(`https://www.bing.com/search?q=${q}&setlang=pt-br`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept-Language": "pt-BR,pt;q=0.9" },
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok ? resultadosDaBusca(await r.text()) : [];
  } catch { return []; }
}

/** O texto que a página mostra depois de montada (até ~20 s), ou erro. */
export async function textoRenderizado(url: string, prazoMs = 20_000): Promise<{ texto: string; url: string; titulo: string }> {
  if (!urlPermitida(url) || !(await resolvePublico(url))) throw new Error("Esse endereço não é uma página pública.");
  const janela = new BrowserWindow({
    show: false, width: 1280, height: 900,
    webPreferences: { session: prepararSessao(), sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true, backgroundThrottling: false },
  });
  janela.webContents.setAudioMuted(true);
  janela.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  janela.webContents.on("will-navigate", (e, destino) => { if (!urlPermitida(destino)) e.preventDefault(); });
  const fim = Date.now() + prazoMs;
  try {
    await Promise.race([
      janela.loadURL(url, { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("a página demorou para abrir")), prazoMs)),
    ]);
    // Espera o texto parar de mudar (o número costuma chegar depois de um "Loading…").
    let anterior = "", estavel = 0, texto = "";
    while (Date.now() < fim) {
      await new Promise((r) => setTimeout(r, 700));
      texto = String(await janela.webContents.executeJavaScript("document.body ? document.body.innerText : ''", true).catch(() => ""));
      const carregando = /\bloading…|\bloading\.\.\.|carregando/i.test(texto.slice(0, 4000));
      estavel = texto === anterior && !carregando ? estavel + 1 : 0;
      anterior = texto;
      if (estavel >= 2) break;
    }
    const limpo = texto.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (limpo.length < 40) throw new Error("a página não mostrou texto");
    return { texto: limpo.slice(0, 15_000), url: janela.webContents.getURL() || url, titulo: janela.webContents.getTitle() };
  } finally {
    if (!janela.isDestroyed()) janela.destroy();
  }
}
