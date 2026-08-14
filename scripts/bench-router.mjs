/**
 * Bancada de medição do roteador — Groq contra modelos locais do Ollama.
 *
 * POR QUE ESTA BANCADA EXISTE ANTES DE QUALQUER TROCA
 *
 * O roteador é a espinha dorsal do assistente: ele decide QUAL das 28 ações executar. O
 * padrão hoje é um modelo de 70B, que não roda nos 8 GB de VRAM desta máquina. Antes de
 * apontar o cérebro para um modelo local muito menor, é preciso saber quanto se perde —
 * medindo, não supondo. Os sete pares difíceis da §6 do ULTRA_HANDOFF estão no prompt
 * justamente porque o modelo já errava neles COM o 70B; se um modelo pequeno desmoronar
 * ali, a troca total está descartada e o caminho é híbrido com rede de segurança.
 *
 * Nada do app é modificado por este script. Ele lê o MESMO prompt de produção
 * (src/services/routerPrompt.ts) e fala direto com as APIs.
 *
 * USO
 *   node scripts/bench-router.mjs                      # todos os alvos disponíveis
 *   node scripts/bench-router.mjs --alvos ollama       # só os locais
 *   node scripts/bench-router.mjs --repeticoes 3       # cada caso N vezes
 *
 * A chave da Groq é lida do mesmo lugar que o app usa. Se não houver, os alvos da Groq
 * são pulados e os locais rodam mesmo assim.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// O prompt de produção. Se este require falhar, rode `npm run build` antes.
const { buildRouterPromptBase } = require(path.join(raiz, "dist/services/routerPrompt.js"));

const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
const OLLAMA_URL = "http://127.0.0.1:11434/v1/chat/completions";

const ALVOS = [
  { id: "groq-70b",  rotulo: "Groq llama-3.3-70b (referência)", provedor: "groq",   modelo: "llama-3.3-70b-versatile" },
  { id: "ollama-8b", rotulo: "Ollama llama3.1:8b",              provedor: "ollama", modelo: "llama3.1:8b" },
  { id: "ollama-3b", rotulo: "Ollama llama3.2 (3B)",            provedor: "ollama", modelo: "llama3.2" },
];

// ── argumentos ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
function arg(nome, padrao) {
  const i = argv.indexOf(`--${nome}`);
  return i === -1 ? padrao : argv[i + 1];
}
const filtroAlvos = arg("alvos", null);
const repeticoes  = Number(arg("repeticoes", 1));
/**
 * Pausa entre chamadas à Groq. O padrão de 16 s vem da conta do teto do plano gratuito:
 * ~3 mil tokens por roteamento contra 12000 por minuto dá 4 chamadas por minuto.
 * O alvo local ignora isto.
 */
const pausaGroq = Number(arg("pausa", 16000));
/** Nome do relatório. Separar permite rodar nuvem e local ao mesmo tempo sem se atropelar. */
const nomeSaida = arg("saida", `bench-resultado-${new Date().toISOString().slice(0, 10)}.txt`);

// ── credenciais ───────────────────────────────────────────────────────────────

/**
 * Lê a chave da Groq do perfil do app, o mesmo arquivo que o `config.ts` usa.
 *
 * ⚠️ Esse JSON também guarda o `serverToken`. Nunca imprima o arquivo inteiro.
 */
function chaveGroq() {
  if (process.env.GROQ_API_KEY?.trim()) return process.env.GROQ_API_KEY.trim();
  const arquivo = path.join(os.homedir(), "AppData", "Roaming", "elysium", "elysium-config.json");
  try {
    const bruto = fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "");
    return JSON.parse(bruto).apiKey?.trim() || null;
  } catch {
    return null;
  }
}

// ── chamada ───────────────────────────────────────────────────────────────────

/**
 * O Ollama não recebe `keep_alive` pelo endpoint compatível com OpenAI, e o suporte a
 * `response_format: json_object` varia por versão. Por isso o pedido vai com o formato
 * JSON solicitado, mas a leitura da resposta NUNCA confia nele — ver extrairAcoes().
 */
const dormir = ms => new Promise(r => setTimeout(r, ms));

/**
 * 🔴 O 429 da Groq precisa ser respeitado, não contado como erro do modelo.
 *
 * Medido na primeira execução desta bancada: 44 das 46 chamadas ao 70B bateram no teto de
 * 12000 tokens por minuto do plano gratuito, porque cada roteamento carrega ~11 mil
 * caracteres de prompt. Sem esta espera, o relatório mostraria "4% de acerto" para o
 * modelo de referência — número que não diz nada sobre a qualidade dele e envenenaria a
 * comparação inteira.
 *
 * A espera usa o `retry-after` quando a Groq manda, senão 20 s. O alvo local não passa
 * por nada disso: não tem teto.
 */
async function chamar(alvo, prompt, texto, chave, tentativas = 4) {
  const url  = alvo.provedor === "groq" ? GROQ_URL : OLLAMA_URL;
  const cabs = { "Content-Type": "application/json" };
  if (alvo.provedor === "groq") cabs.Authorization = `Bearer ${chave}`;

  const corpo = JSON.stringify({
    model: alvo.modelo,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: texto },
    ],
    temperature: 0.1,
    max_tokens: 1500,
    response_format: { type: "json_object" },
    stream: false,
  });

  for (let tentativa = 1; ; tentativa++) {
    const t0 = performance.now();
    const res = await fetch(url, {
      method: "POST", headers: cabs, body: corpo,
      signal: AbortSignal.timeout(120_000),
    });
    const ms = performance.now() - t0;

    if (res.status === 429 && tentativa < tentativas) {
      const espera = Math.ceil(Number(res.headers.get("retry-after")) || 20);
      process.stdout.write(`(429, esperando ${espera}s) `);
      await dormir(espera * 1000);
      continue;
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { erro: `HTTP ${res.status} ${txt.slice(0, 160)}`, ms };
    }

    const dados = await res.json();
    return { conteudo: dados.choices?.[0]?.message?.content ?? "", ms };
  }
}

/**
 * Extrai a lista de ações do que o modelo devolveu.
 *
 * Modelo pequeno costuma embrulhar o JSON em markdown ou escrever uma frase antes dele.
 * Isso é falha de FORMATO, não de classificação, e contar as duas juntas esconderia o
 * que interessa: o relatório separa `json_invalido` de erro de roteamento. Em produção o
 * `decideBrain` cai em `unknown` nesses casos, que é o comportamento seguro.
 */
function extrairAcoes(conteudo) {
  if (!conteudo) return null;

  let texto = conteudo.trim();
  const cerca = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca) texto = cerca[1].trim();
  else {
    const abre = texto.indexOf("{");
    const fecha = texto.lastIndexOf("}");
    if (abre !== -1 && fecha > abre) texto = texto.slice(abre, fecha + 1);
  }

  try {
    const obj = JSON.parse(texto);
    if (Array.isArray(obj.actions)) return obj.actions.filter(a => typeof a?.action === "string");
    if (typeof obj.action === "string") return [obj];
    return null;
  } catch {
    return null;
  }
}

// ── execução ──────────────────────────────────────────────────────────────────

async function alvoDisponivel(alvo, chave) {
  if (alvo.provedor === "groq") return chave ? true : "sem GROQ_API_KEY";
  try {
    const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return "daemon do Ollama não respondeu";
    const nomes = (await r.json()).models?.map(m => m.name) ?? [];
    const achou = nomes.some(n => n === alvo.modelo || n.startsWith(`${alvo.modelo}:`));
    return achou ? true : `modelo não baixado (ollama pull ${alvo.modelo})`;
  } catch {
    return "Ollama parado (rode `ollama serve`)";
  }
}

function percentil(valores, p) {
  if (valores.length === 0) return 0;
  const ord = [...valores].sort((a, b) => a - b);
  return ord[Math.min(ord.length - 1, Math.floor((p / 100) * ord.length))];
}

async function rodarAlvo(alvo, casos, prompt, chave) {
  const resultados = [];

  for (const caso of casos) {
    for (let r = 0; r < repeticoes; r++) {
      // Espaçamento entre chamadas à nuvem, para não provocar o 429 de propósito. O local
      // não precisa: dorme zero e roda no ritmo que a GPU aguentar.
      if (alvo.provedor === "groq" && resultados.length > 0) await dormir(pausaGroq);

      const { conteudo, erro, ms } = await chamar(alvo, prompt, caso.texto, chave);

      if (erro) {
        resultados.push({ caso, ms, status: "erro_http", detalhe: erro });
        process.stdout.write("E");
        continue;
      }

      const acoes = extrairAcoes(conteudo);
      if (!acoes) {
        resultados.push({ caso, ms, status: "json_invalido", obtido: conteudo.slice(0, 120) });
        process.stdout.write("J");
        continue;
      }

      const obtido = acoes.map(a => a.action);
      const acertou = obtido.length === caso.esperado.length &&
                      obtido.every((a, i) => a === caso.esperado[i]);
      resultados.push({ caso, ms, status: acertou ? "ok" : "errado", obtido });
      process.stdout.write(acertou ? "." : "x");
    }
  }

  process.stdout.write("\n");
  return resultados;
}

// ── relatório ─────────────────────────────────────────────────────────────────

function relatorio(porAlvo, casos) {
  const linhas = [];
  const p = s => { linhas.push(s); console.log(s); };

  p("");
  p("=".repeat(78));
  p("  BANCADA DO ROTEADOR — " + new Date().toLocaleString("pt-BR"));
  p(`  ${casos.length} casos x ${repeticoes} repetição(ões)`);
  p("=".repeat(78));

  p("");
  p("GERAL");
  p("");
  p("  alvo                                 acerto   json inv.   erro   p50      p95");
  p("  " + "-".repeat(74));
  for (const [alvo, res] of porAlvo) {
    const n = res.length;
    const ok = res.filter(r => r.status === "ok").length;
    const ji = res.filter(r => r.status === "json_invalido").length;
    const er = res.filter(r => r.status === "erro_http").length;
    const ms = res.map(r => r.ms);
    p(`  ${alvo.rotulo.padEnd(36)} ${String(Math.round(100 * ok / n) + "%").padStart(6)} ` +
      `${String(ji).padStart(10)} ${String(er).padStart(6)} ` +
      `${(Math.round(percentil(ms, 50)) + "ms").padStart(8)} ${(Math.round(percentil(ms, 95)) + "ms").padStart(8)}`);
  }

  const grupos = [...new Set(casos.map(c => c.grupo))];
  p("");
  p("POR GRUPO  (os sete pares difíceis da §6 são o que decide a troca)");
  p("");
  p("  grupo                  " + porAlvo.map(([a]) => a.id.padEnd(12)).join(""));
  p("  " + "-".repeat(74));
  for (const g of grupos) {
    const cels = porAlvo.map(([, res]) => {
      const doGrupo = res.filter(r => r.caso.grupo === g);
      const ok = doGrupo.filter(r => r.status === "ok").length;
      return `${ok}/${doGrupo.length}`.padEnd(12);
    });
    p(`  ${g.padEnd(22)} ${cels.join("")}`);
  }

  p("");
  p("ERROS, CASO A CASO");
  for (const [alvo, res] of porAlvo) {
    const ruins = res.filter(r => r.status !== "ok");
    p("");
    p(`  ${alvo.rotulo} — ${ruins.length} de ${res.length}`);
    if (ruins.length === 0) { p("    (nenhum)"); continue; }
    const vistos = new Set();
    for (const r of ruins) {
      const chave = r.caso.texto + r.status + (r.obtido ?? []).join(",");
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const esperado = r.caso.esperado.join(" + ");
      const obtido = r.status === "ok" || r.status === "errado"
        ? (r.obtido ?? []).join(" + ") || "(vazio)"
        : `[${r.status}] ${r.detalhe ?? r.obtido ?? ""}`;
      p(`    "${r.caso.texto}"`);
      p(`        esperado: ${esperado}`);
      p(`        obtido:   ${obtido}`);
    }
  }

  p("");
  return linhas.join("\n");
}

// ── principal ─────────────────────────────────────────────────────────────────

async function main() {
  const { casos } = JSON.parse(fs.readFileSync(path.join(raiz, "scripts/bench-cases.json"), "utf8"));
  const prompt = buildRouterPromptBase();
  const chave = chaveGroq();

  console.log(`prompt de roteamento: ${prompt.length} caracteres (o mesmo que o app usa)`);
  console.log(`casos: ${casos.length} | repetições: ${repeticoes}`);
  console.log("legenda: . acerto | x classificação errada | J json inválido | E erro HTTP\n");

  const porAlvo = [];
  for (const alvo of ALVOS) {
    if (filtroAlvos && !alvo.id.includes(filtroAlvos) && alvo.provedor !== filtroAlvos) continue;

    const disp = await alvoDisponivel(alvo, chave);
    if (disp !== true) {
      console.log(`${alvo.rotulo}: PULADO — ${disp}`);
      continue;
    }

    console.log(`${alvo.rotulo}:`);
    porAlvo.push([alvo, await rodarAlvo(alvo, casos, prompt, chave)]);
  }

  if (porAlvo.length === 0) {
    console.log("\nNenhum alvo disponível. Suba o Ollama (`ollama serve`) ou defina GROQ_API_KEY.");
    process.exit(1);
  }

  const texto = relatorio(porAlvo, casos);
  const saida = path.join(raiz, "scripts", nomeSaida);
  fs.writeFileSync(saida, texto, "utf8");
  console.log(`relatório salvo em ${path.relative(raiz, saida)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
