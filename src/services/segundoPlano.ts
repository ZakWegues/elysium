import * as crypto from "node:crypto";
import { semAcento } from "./texto";

/**
 * Tarefas em segundo plano (25/11): "pesquisa isso em segundo plano" — a conversa continua e ela avisa
 * quando terminar (e no celular, se ele saiu). Rodam no agente do PC, uma por vez, com as mesmas
 * confirmações de sempre. Puro, menos a fila.
 */
export interface TarefaDeFundo { id: string; pedido: string; em: number; estado: "fila" | "fazendo" | "pronta" | "falhou"; resultado: string }

/** Tira o "em segundo plano" do pedido. null = não é disso. Pura. */
export function pedeSegundoPlano(texto: string): string | null {
  const re = /[,\s]*\b(?:em segundo plano|em background|por tr[aá]s|enquanto isso|e (?:me )?avisa (?:quando|assim que) (?:terminar|acabar|ficar pronto))\b[,\s]*/i;
  if (!re.test(texto)) return null;
  const resto = texto.replace(re, " ").replace(/\s+/g, " ").replace(/\s+([.!?])/g, "$1").trim().replace(/^(?:vai|v[aá])\s+(?=\w+(?:ndo|r)\b)/i, "");
  return resto.split(/\s+/).length >= 3 && resto.length <= 1500 ? resto : null;
}

/** "o que está fazendo em segundo plano?" Pura. */
export function perguntaDoFundo(texto: string): boolean {
  const t = semAcento(texto);
  return t.length < 80 && /\b(?:segundo plano|fundo)\b/.test(t) && /^(?:o que|quais|como (?:esta|vai|ta)|tem)\b/.test(t);
}

const tarefas: TarefaDeFundo[] = [];
let rodando = false;
let rodar: ((pedido: string) => Promise<string>) | null = null;
let avisar: ((t: TarefaDeFundo) => void) | null = null;
export function ligarSegundoPlano(executar: (pedido: string) => Promise<string>, aoTerminar: (t: TarefaDeFundo) => void): void { rodar = executar; avisar = aoTerminar; }

export function porEmSegundoPlano(pedido: string, agora = Date.now()): string {
  if (!rodar) return "";
  const vivas = tarefas.filter((t) => t.estado === "fila" || t.estado === "fazendo").length;
  if (vivas >= 5) return "Já tenho cinco coisas na fila. Espera uma terminar.";
  tarefas.push({ id: crypto.randomBytes(4).toString("hex"), pedido, em: agora, estado: "fila", resultado: "" });
  while (tarefas.length > 20) tarefas.shift();
  void andar();
  return vivas ? `Pus na fila, atrás de ${vivas}. Te aviso quando terminar.` : "Vou fazendo. Te aviso quando terminar.";
}

async function andar(): Promise<void> {
  if (rodando || !rodar) return;
  const t = tarefas.find((x) => x.estado === "fila");
  if (!t) return;
  rodando = true;
  t.estado = "fazendo";
  try { t.resultado = await rodar(t.pedido); t.estado = "pronta"; }
  catch (e) { t.resultado = e instanceof Error ? e.message : "não deu certo"; t.estado = "falhou"; }
  rodando = false;
  avisar?.(t);
  void andar();
}

export function situacaoDoFundo(): string {
  const vivas = tarefas.filter((t) => t.estado === "fila" || t.estado === "fazendo");
  if (!vivas.length) {
    const u = [...tarefas].reverse().find((t) => t.estado === "pronta");
    return u ? `Nada rodando. A última foi “${u.pedido.slice(0, 80)}”, pronta.` : "Nada rodando em segundo plano.";
  }
  return `${vivas.map((t) => `“${t.pedido.slice(0, 70)}” (${t.estado === "fila" ? "na fila" : "fazendo"})`).join("; ")}.`;
}
