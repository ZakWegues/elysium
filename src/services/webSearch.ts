import { getApiKey, getConfig } from "../main/config";
import { apiKeyError, networkError } from "./errors";
import { canalAtual, Fonte, registrarFontes } from "./contextoComando";

/**
 * Busca na web.
 *
 * Não há chave de serviço de busca em lugar nenhum do projeto, e isso é de propósito:
 * a Groq pesquisa sozinha e devolve a resposta já redigida. Uma conta a menos para o
 * usuário criar, um segredo a menos para guardar, e a mesma chave da Groq que já existe.
 *
 * 🔴 Até setembro de 2026 isso era o `groq/compound-mini`, que pesquisava sem precisar de
 * ferramenta. Em 28/09 ele sumiu do catálogo. Hoje a busca é o `gpt-oss` com a ferramenta
 * embutida `browser_search` (declarada em `tools`, executada no servidor da Groq). Se o
 * modelo configurado ainda for um `compound`, ele vai sem a ferramenta, como antes.
 */

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const SEARCH_SYSTEM_PROMPT = `Você responde perguntas pesquisando na web, para um assistente de voz em português do Brasil.

Sua resposta vai ser LIDA EM VOZ ALTA. Portanto:
- Responda em 1 a 3 frases, direto ao ponto, já com a informação encontrada.
- Nada de markdown, listas, títulos, links ou citações de fonte.
- Números e datas por extenso quando ficarem mais naturais falados.
- Se a busca não achar, diga isso em uma frase em vez de inventar.`;

// Bloco 131: no chat escrito a busca pode responder como chat — com as fontes em chips
// embaixo (o que se elogia no Perplexity). Tabela não: o celular não desenha.
const SEARCH_PROMPT_TEXTO = `Você responde perguntas pesquisando na web, para um assistente em português do Brasil. A resposta aparece ESCRITA num chat.
- Comece pela resposta direta (o número, a data, o fato), depois o contexto que importa, em poucas linhas.
- Markdown simples é bem-vindo (negrito, listas curtas). Nada de tabelas, títulos ou marcadores de citação — as fontes aparecem à parte.
- Diga de quando é a informação quando isso importar (cotação, placar, previsão).
- Se a busca não achar, diga isso em uma frase em vez de inventar.`;

type FerramentaExecutada = { type?: string; search_results?: { results?: { title?: string; url?: string }[] } };

/**
 * As fontes de verdade de uma busca (bloco 131). Pura, para teste.
 *
 * O `browser_search` devolve a lista do buscador e, depois, cada página que o modelo
 * ABRIU (`browser.open`). As abertas são as que ele leu — vêm primeiro; o título bom
 * vem da lista do buscador (o da página aberta é "site - viewing lines [0 - 69]").
 */
export function extrairFontes(executadas: FerramentaExecutada[] | undefined, maximo = 4): Fonte[] {
  const lista = executadas ?? [];
  const titulos = new Map<string, string>();
  for (const t of lista) if (t.type === "browser_search") for (const r of t.search_results?.results ?? []) if (r.url && r.title) titulos.set(r.url, r.title);
  const abertas = lista.filter(t => t.type === "browser.open").flatMap(t => t.search_results?.results ?? []).map(r => r.url).filter((u): u is string => Boolean(u));
  const buscadas = [...titulos.keys()];
  const fontes: Fonte[] = [];
  const hosts = new Set<string>();
  for (const url of [...abertas, ...buscadas]) {
    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { continue; }
    if (!/^https?:/.test(url) || hosts.has(host)) continue;
    hosts.add(host);
    fontes.push({ titulo: titulos.get(url) ?? host, url });
    if (fontes.length >= maximo) break;
  }
  return fontes;
}

/** Tira as marcas de citação do gpt-oss ("【0†L6-L11】") — as fontes vão à parte. */
export function limparCitacoes(texto: string): string {
  return texto.replace(/\s*【[^】]*】/g, "").replace(/[ \t]+\n/g, "\n").trim();
}

export async function searchWeb(query: string): Promise<string> {
  const canal = canalAtual();
  const apiKey = getApiKey();
  if (!apiKey) throw apiKeyError();
  const cfg = getConfig();

  let res: Response;
  try {
    res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.searchModel,
        messages: [
          { role: "system", content: canal === "texto" ? SEARCH_PROMPT_TEXTO : SEARCH_SYSTEM_PROMPT },
          { role: "user", content: query },
        ],
        ...(cfg.searchModel.startsWith("groq/compound") ? {} : { tools: [{ type: "browser_search" }], tool_choice: "required" }),
        temperature: 0.3,
        // Folgado: o gpt-oss raciocina antes de responder e o raciocínio conta no teto.
        max_tokens: 2000,
      }),
      // Generoso: o modelo faz buscas de verdade antes de responder, então demora bem
      // mais que uma chamada de texto comum.
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw networkError(String(e));
  }

  if (res.status === 401) throw apiKeyError();
  if (!res.ok) {
    if (res.status === 429) {
      return "Minha ferramenta de pesquisa atingiu o limite de consultas por minuto. Aguarde um pouquinho e pergunte de novo!";
    }
    throw networkError(`Busca HTTP ${res.status} ${await safeText(res)}`);
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string; executed_tools?: (FerramentaExecutada & { type: string })[] } }[];
  };
  const message = data.choices?.[0]?.message;
  let answer = limparCitacoes(message?.content ?? "");
  // Na voz o markdown que escapar seria lido como "asterisco asterisco".
  if (canal === "voz") answer = answer.replace(/\*\*/g, "");

  if (!message?.executed_tools?.some(t => /search/.test(t.type))) {
    console.warn("[busca] o modelo respondeu sem pesquisar — resposta pode estar desatualizada");
  }
  registrarFontes(extrairFontes(message?.executed_tools));

  return answer || "Não achei nada sobre isso.";
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 300); } catch { return ""; }
}

