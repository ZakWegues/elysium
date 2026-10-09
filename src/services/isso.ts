import { clipboard } from "electron";
import { rodarComando } from "./comandosIa";
import { askAboutScreen } from "./vision";
import { listarJanelas, type Janela } from "../actions/janelas";
import { semAcento } from "./texto";
import { modoAtivo, type Modo } from "./modos";

/**
 * "Resume isso", "traduz isso", "explica isso", "corrige isso" (fase 19, bloco 193).
 *
 * O "isso" é o que está na frente dele. O Siri novo e o Gemini são elogiados por entender a
 * tela sem a pessoa explicar; a Ely já tinha as peças (comandos de IA sobre o texto copiado,
 * a visão da tela) mas precisava de o pedido dizer qual usar. Agora:
 *  1. texto copiado (de pelo menos uma frase) → o comando roda sobre ele;
 *  2. senão → ela olha a tela, com o título da janela da frente como pista.
 * E sempre diz o que usou ("o texto que você copiou, que começa com…") — o copiado pode ser
 * de horas atrás, e assim ele percebe na hora se não era aquilo.
 */

export type ComandoIsso = "resumir" | "ingles" | "portugues" | "explicar" | "corrigir";

function sem(t: string): string {
  return semAcento(t).replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** "resume isso", "traduz isso pro inglês"… → o comando. Frase inteira. Pura. */
export function pedidoComIsso(texto: string): ComandoIsso | null {
  const t = sem(texto).replace(/^ely /, "");
  const m = /^(resume|resuma|resumir|faz um resumo d|traduz|traduza|traduzir|explica|explique|explicar|me explica|corrige|corrija|corrigir|revisa|revise)\w*(?: (?:isso|isto|esse texto|este texto|esse trecho|o que eu copiei|o que copiei|o que ta na tela|o que esta na tela|essa tela|aqui|ai))(?: (?:pra|para|pro) (?:o )?(ingles|portugues))?$/.exec(t);
  if (!m) return null;
  const verbo = m[1];
  if (/^(traduz)/.test(verbo)) return m[2] === "portugues" ? "portugues" : "ingles";
  if (/explic/.test(verbo)) return "explicar";
  if (/corrig|revis/.test(verbo)) return "corrigir";
  return "resumir";
}

/** A janela que ele está olhando: a da frente, ou a primeira atrás do próprio ELYSIUM. Pura. */
export function janelaDaFrente(janelas: Janela[]): Janela | null {
  const deFora = janelas.filter(j => !/^(elysium|electron)$/i.test(j.processo));
  return deFora.find(j => j.emFoco) ?? deFora.find(j => !j.minimizada) ?? null;
}

/** As primeiras palavras do texto, para dizer o que foi usado. Pura. */
export function comecoDe(texto: string, palavras = 6): string {
  const p = texto.replace(/\s+/g, " ").trim().split(" ");
  return p.slice(0, palavras).join(" ") + (p.length > palavras ? "…" : "");
}

const PERGUNTA_DA_TELA: Record<ComandoIsso, string> = {
  resumir: "Resuma em poucas frases o conteúdo principal que está nesta tela.",
  ingles: "Traduza para o inglês o texto principal desta tela.",
  portugues: "Traduza para o português do Brasil o texto principal desta tela.",
  explicar: "Explique de forma simples o que está nesta tela (se for um erro, o que significa e como resolver).",
  corrigir: "Aponte os erros de português do texto principal desta tela e mostre a versão corrigida.",
};

export const SEPARADOR_REGRAS = "---REGRAS---";

/** Separa o texto corrigido das regras (modo português). Sem o separador, tudo é texto. Pura. */
export function separarRegras(resultado: string): { texto: string; regras: string } {
  const i = resultado.indexOf(SEPARADOR_REGRAS);
  if (i < 0) return { texto: resultado.trim(), regras: "" };
  return { texto: resultado.slice(0, i).trim(), regras: resultado.slice(i + SEPARADOR_REGRAS.length).trim() };
}

function modoAgora(): Modo | null {
  try { return modoAtivo(); } catch { return null; }
}

export async function fazerComIsso(comando: ComandoIsso): Promise<string> {
  const copiado = clipboard.readText().trim();
  // Uma palavra solta copiada (um nome, um número) não é "isso": vai para a tela.
  if (copiado.length >= 20 && copiado.split(/\s+/).length >= 4) {
    const modo = modoAgora();
    // Fase 20: "corrige isso" no modo português corrige E ensina; a área de transferência
    // continua recebendo só o texto corrigido (é o que ele vai colar).
    if (comando === "corrigir" && modo?.id === "portugues") {
      const { resultado } = await rodarComando(comando, copiado, `Depois do texto corrigido, escreva uma linha só com ${SEPARADOR_REGRAS} e, abaixo, cada correção com a regra em uma linha.`);
      const { texto, regras } = separarRegras(resultado);
      clipboard.writeText(texto);
      return `Corrigi o texto que você copiou ("${comecoDe(copiado)}") e deixei na área de transferência.${regras ? `\n\n${regras}` : ""}\n\n${texto}`;
    }
    const acrescimo = comando === "explicar" && modo && modo.id !== "estudo" ? `Modo ${modo.nome} ligado: ${modo.instrucao}` : "";
    const { resultado } = await rodarComando(comando, copiado, acrescimo);
    const origem = `o texto que você copiou ("${comecoDe(copiado)}")`;
    if (comando === "corrigir" || comando === "ingles" || comando === "portugues") {
      clipboard.writeText(resultado);
      const feito = comando === "corrigir" ? "Corrigi" : "Traduzi";
      return `${feito} ${origem} e deixei na área de transferência, é só colar:\n\n${resultado}`;
    }
    return `Sobre ${origem}: ${resultado}`;
  }
  let janela: Janela | null = null;
  try { janela = janelaDaFrente(await listarJanelas()); } catch { /* segue sem a pista */ }
  const pista = janela ? ` A janela da frente é "${janela.titulo}" (${janela.processo}).` : "";
  const resposta = await askAboutScreen(PERGUNTA_DA_TELA[comando] + pista);
  return janela ? `Pela tela (${janela.titulo}): ${resposta}` : `Pela tela: ${resposta}`;
}
