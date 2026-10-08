import Store from "electron-store";
import { getApiKey, getConfig } from "../main/config";
import { callChat } from "./llm";
import { DICAS_RESERVA, momentoDoDia, montarPainelCorpo } from "./corpo";
import { diaDe } from "./habitos";

/**
 * O que a Ely sugere sozinha no Hoje (fase 18, 08/10): a DICA de treino/nutrição, que se
 * renova a cada hora (ou ao tocar), e a IDEIA do dia — "algo legal para fazer hoje".
 *
 * As duas passam pelo modelo com os fatos do momento e caem numa lista fixa se ele não
 * responder: a página nunca fica com um buraco. Cache em memória — abrir a aba de novo não
 * chama o modelo; reiniciar o PC gera outra, o que é aceitável.
 *
 * Também guarda o checklist "Para testar" do card ELYSIUM (o que o Zak marcou como testado
 * em cada versão).
 */

async function perguntar(sistema: string, usuario: string): Promise<string | null> {
  const provider = getApiKey() ? "groq" : "ollama";
  const cfg = getConfig();
  try {
    const texto = await callChat({
      provider,
      model: provider === "groq" ? cfg.brainModel : cfg.ollamaChatModel,
      temperature: 0.9,
      // O gpt-oss gasta parte do teto raciocinando — com teto curto a resposta sai vazia.
      maxTokens: 900,
      esforco: "low",
      timeoutMs: 9000,
      messages: [{ role: "system", content: sistema }, { role: "user", content: usuario }],
    });
    const limpo = texto.replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").trim();
    return limpo && limpo.length <= 320 ? limpo : null;
  } catch {
    return null;
  }
}

// ── dica do corpo ────────────────────────────────────────────────────────────

let dica: { chave: string; texto: string; em: number } | null = null;

/** A dica da hora. `nova` força outra (o toque no card), diferente da atual. */
export async function dicaDoCorpo(nova = false, agora = new Date()): Promise<{ texto: string; em: number }> {
  const chave = `${diaDe(agora)}-${agora.getHours()}`;
  if (!nova && dica?.chave === chave) return dica;
  const p = montarPainelCorpo(agora);
  const diaDeTreino = !!p.treinoHoje && !p.treinoHoje.feitoHoje;
  const momento = momentoDoDia(agora.getHours(), diaDeTreino);
  const fatos = [
    `Objetivo: ${p.perfil.objetivo === "ganhar" ? "ganhar peso e massa (a pessoa é bem magra)" : p.perfil.objetivo === "perder" ? "perder gordura" : "manter o peso"}`,
    p.perfil.foco ? `Quer foco em: ${p.perfil.foco}` : "",
    p.perfil.pesoKg && p.perfil.alturaCm ? `Peso ${p.perfil.pesoKg} kg, altura ${p.perfil.alturaCm} cm` : "",
    p.meta ? `Meta de hoje: ${p.meta.kcal} kcal, ${p.meta.proteinaG} g de proteína` : "",
    p.treinoHoje ? `Treino de hoje: ${p.treinoHoje.treino.nome} (${p.treinoHoje.treino.exercicios.slice(0, 4).map(e => e.nome).join(", ")})${p.treinoHoje.feitoHoje ? " — já feito" : ""}` : "",
    `Corrida: está no plano para iniciante, semana ${p.corrida.semana}; corre na esteira para ganhar fôlego, não para emagrecer`,
    "Já conta as calorias em outro app",
    `Momento: ${momento === "manha" ? "manhã" : momento === "treino" ? "perto do treino" : momento === "tarde" ? "tarde" : "noite"}`,
  ].filter(Boolean);
  const texto = await perguntar(
    "Você é a Ely, assistente pessoal com jeito de FRIDAY (Tony Stark): direta e animada sem exagero. Dê UMA dica prática e específica de treino, alimentação, recuperação ou corrida para o momento do dia, em uma ou duas frases curtas (até 200 caracteres), em português do Brasil. Baseie-se nos fatos; nada de promessa milagrosa, nada de suplemento caro, nada de dieta extrema. Sem emoji, sem aspas, sem saudação.",
    `Fatos:\n${fatos.map(f => `- ${f}`).join("\n")}${nova && dica ? `\nNão repita esta dica: ${dica.texto}` : ""}`,
  );
  const reserva = DICAS_RESERVA[momento];
  const indice = (agora.getHours() + (nova ? Math.floor(Math.random() * reserva.length) + 1 : 0)) % reserva.length;
  dica = { chave, texto: texto ?? reserva[indice], em: Date.now() };
  return dica;
}

// ── ideia do dia ─────────────────────────────────────────────────────────────

const IDEIAS_RESERVA = [
  "Que tal 20 minutos de leitura sem celular antes de dormir?",
  "Dia bom para arrumar a mesa e fechar as abas esquecidas do navegador.",
  "Uma caminhada curta depois do almoço ajuda a digestão e a cabeça.",
  "Separe 15 minutos para revisar a semana e escolher a prioridade de amanhã.",
  "Escute um álbum inteiro que você nunca ouviu, do começo ao fim.",
  "Mande uma mensagem para alguém de quem você sente falta.",
];

let ideia: { dia: string; texto: string } | null = null;

/** "Algo legal para fazer hoje" — uma por dia; `nova` sorteia outra. */
export async function ideiaDoDia(fatos: string[], nova = false, agora = new Date()): Promise<string> {
  const dia = diaDe(agora);
  if (!nova && ideia?.dia === dia) return ideia.texto;
  const texto = await perguntar(
    "Você é a Ely, assistente pessoal com jeito de FRIDAY (Tony Stark). Sugira UMA coisa legal, concreta e possível de fazer HOJE — lazer, aprender algo, cuidar de si, um projeto pessoal, algo com amigos — levando em conta os fatos (clima, dia da semana, compromissos). Uma ou duas frases curtas (até 200 caracteres), português do Brasil, tom leve. Não repita o que já está nos compromissos. Sem emoji, sem aspas, sem saudação.",
    `Agora: ${agora.toLocaleString("pt-BR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}.\nFatos:\n${fatos.length ? fatos.map(f => `- ${f}`).join("\n") : "- dia livre"}${nova && ideia ? `\nNão repita esta ideia: ${ideia.texto}` : ""}`,
  );
  const reserva = IDEIAS_RESERVA[(agora.getDate() + (nova ? Math.floor(Math.random() * 5) + 1 : 0)) % IDEIAS_RESERVA.length];
  ideia = { dia, texto: texto ?? reserva };
  return ideia.texto;
}

// ── "Para testar" ────────────────────────────────────────────────────────────

const testes = new Store<{ versao: string; feitos: string[] }>({ name: "hoje-testes", defaults: { versao: "", feitos: [] } });

/** Itens já marcados como testados nesta versão (versão nova zera a lista). */
export function testesFeitos(versao: string): string[] {
  return testes.get("versao", "") === versao ? testes.get("feitos", []) : [];
}

export function marcarTeste(versao: string, item: string, feito: boolean): string[] {
  const atuais = new Set(testesFeitos(versao));
  if (feito) atuais.add(item); else atuais.delete(item);
  const lista = [...atuais].slice(0, 50);
  testes.set("versao", versao);
  testes.set("feitos", lista);
  return lista;
}
