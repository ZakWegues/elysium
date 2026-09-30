import { getConfig } from "../main/config";
import { callChat } from "./llm";
import { listFacts, sugerirFato, SugestaoDeFato } from "./memoryStore";

/**
 * Memória que aprende, com aprovação (fase 13, bloco 118).
 *
 * Quando uma conversa esfria (o mesmo tempo de inatividade que zera o histórico), uma
 * chamada barata ao modelo lê SÓ as falas do usuário — nunca as respostas do assistente, que
 * podem ter inventado — e propõe até 3 fatos pessoais estáveis ("tem um cachorro chamado
 * Thor"). Viram sugestões no card "Aprendi isto": nada entra na memória sem o Zak aceitar.
 * Antes, só entrava o que ele mandava lembrar explicitamente.
 */

const PROMPT = `Você lê falas de um usuário para o assistente pessoal dele e extrai fatos que valem ser lembrados em conversas futuras.

Extraia SÓ fatos pessoais ESTÁVEIS ditos pelo próprio usuário sobre ele mesmo: preferências, pessoas e bichos da vida dele, lugares, hábitos, coisas que ele tem, trabalho, estudos.
NÃO extraia: pedidos e comandos ("abre o Chrome"), perguntas, coisas passageiras ("hoje estou cansado", "agora"), opiniões sobre o assistente, nem nada que já esteja em JÁ SABIDO.
Cada fato: uma frase curta, em terceira pessoa, começando com "O usuário".
No máximo 3. Sem nada que valha, lista vazia.
Responda só JSON: {"fatos": ["..."]}`;

/** O JSON do modelo → frases aproveitáveis. Pura, para teste. */
export function interpretarFatos(bruto: string): string[] {
  let j: unknown;
  try { j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)); } catch { return []; }
  const fatos = (j as { fatos?: unknown })?.fatos;
  if (!Array.isArray(fatos)) return [];
  return fatos
    .filter((f): f is string => typeof f === "string")
    .map(f => f.trim().replace(/\s+/g, " "))
    // Frase de verdade, não "sim" nem um parágrafo: 12 a 200 caracteres.
    .filter(f => f.length >= 12 && f.length <= 200)
    .slice(0, 3);
}

export async function aprenderDaConversa(falasDoUsuario: string[]): Promise<SugestaoDeFato[]> {
  const falas = falasDoUsuario.map(f => f.trim()).filter(Boolean);
  // Conversa curta demais não tem fato pessoal: poupa a chamada.
  if (falas.join(" ").length < 25) return [];
  const cfg = getConfig();
  const provider = cfg.chatProvider;
  const model = provider === "ollama" ? cfg.ollamaChatModel : cfg.brainModel;
  const sabidos = listFacts().map(f => `- ${f.text}`).join("\n") || "(nada)";
  try {
    const bruto = await callChat({
      provider, model, json: true, temperature: 0.1, maxTokens: 300, timeoutMs: 45_000,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: `JÁ SABIDO:\n${sabidos}\n\nFALAS DO USUÁRIO:\n${falas.map(f => `- ${f}`).join("\n")}` },
      ],
    });
    const novas = interpretarFatos(bruto).map(sugerirFato).filter((s): s is SugestaoDeFato => s !== null);
    if (novas.length) console.log(`[memoria] ${novas.length} sugestão(ões) nova(s) para aprovar.`);
    return novas;
  } catch (e) {
    console.warn("[memoria] não consegui extrair fatos:", e instanceof Error ? e.message : e);
    return [];
  }
}
