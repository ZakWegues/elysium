import { getConfig, getGeminiKey } from "../main/config";
import { gerarGemini, type Mensagem } from "./gemini";
import { abrirSessaoDeTela, hermesPronto } from "./hermes/cerebro";
import { callChat, type ChatMessage } from "./llm";
import type { Gerador } from "./telaInteligente";

/**
 * Quem escreve a tela (Fase 2, 22/10): o Hermes (sessão oculta e descartável, modelo do fallback
 * dele ou o fixado), senão a Groq. Nunca o local de 7B — sem os dois, `null` (sem tela e sem oferta).
 *
 * Groq: o modelo da conversa (gpt-oss-120b) tem teto de 8 mil tokens/min na conta gratuita e o
 * prompt das telas sozinho passa disso (413 medido em 22/10). Vai o Llama 4 Scout, que tem cota
 * maior; troca pelo `modelo` do pedido (bancada).
 */
export type Provedor = "gemini" | "hermes" | "groq";
/**
 * Ordem medida na bancada de 22/10 (4 pedidos cada, válida na 1ª / mediana até a tela):
 * nemotron-3-super 100% / 12 s, laguna-s-2.1 100% / 14 s, gemma-4-31b 100% / 19 s,
 * inkling 50% (100% com a 2ª) / 23 s. O padrão do Hermes (nemotron-3-ultra) ficou com 50% / 68 s.
 */
export const MODELOS_HERMES_TELAS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "poolside/laguna-s-2.1:free",
  "google/gemma-4-31b-it:free",
  "thinkingmachines/inkling:free",
] as const;
export const MODELO_GROQ_TELAS ="meta-llama/llama-4-scout-17b-16e-instruct";

/**
 * Medido em 22/10: a conta gratuita da Groq só tem gpt-oss-120b/20b e qwen3.8-27b, com teto de
 * 7–8 mil tokens POR MINUTO — e o prompt das telas pede ~11 mil de entrada (413 nos três). Então,
 * por padrão, só o Hermes gera; a Groq fica para a bancada (`forcar`) e para uma conta com cota maior.
 */
export function provedorDeTelas(): Provedor | null {
  // 24/10: com a chave do Gemini, ele escreve as telas (rápido; o Hermes fica de reserva).
  if (getGeminiKey()) return "gemini";
  if (getConfig().cerebro === "hermes" && hermesPronto()) return "hermes";
  return null;
}

export function geradorDeTelas(forcar?: Provedor, modelo?: string): Gerador | null {
  const provedor = forcar ?? provedorDeTelas();
  if (provedor === "gemini") {
    return async (sistema) => {
      const mensagens: Mensagem[] = [];
      // Gemini não respondeu (cota, rede): o resto da conversa vai pelo Hermes, se estiver de pé.
      let reserva: Awaited<ReturnType<Gerador>> = null;
      return {
        enviar: async (usuario) => {
          if (reserva) return reserva.enviar(usuario);
          mensagens.push({ papel: "user", texto: usuario });
          // 26/10: os dados de uma tela pronta (prompt curto, JSON pequeno) saem em 2–5 s; uma chamada
          // presa 45 s (medido) vale mais como nova tentativa no próximo modelo. O gerador livre segue com 45 s.
          const prazoMs = sistema.length < 6000 ? 15_000 : 45_000;
          const r = await gerarGemini({ sistema, mensagens, temperatura: 0.3, maxTokens: 8192, prazoMs });
          if (r) { mensagens.push({ papel: "model", texto: r.texto }); return { texto: r.texto, provedor: "gemini", modelo: r.modelo }; }
          const hermes = getConfig().cerebro === "hermes" && hermesPronto() ? geradorDeTelas("hermes") : null;
          if (!hermes) return null;
          console.warn("[UI] Gemini sem resposta; a tela vai pelo Hermes");
          reserva = await hermes(sistema);
          return reserva ? reserva.enviar(usuario) : null;
        },
        fechar: () => reserva?.fechar(),
        trocar: () => reserva?.trocar?.() ?? false,
      };
    };
  }
  if (provedor === "hermes") {
    return async (sistema) => {
      // A troca de modelo é NOSSA: com o modelo fixo na sessão, não dá para contar com o fallback
      // do Hermes. Se o 1º pedido não tiver resposta (sem crédito, 429, caiu), a próxima da lista.
      const fila = modelo ? [modelo] : [...MODELOS_HERMES_TELAS];
      let sessao: Awaited<ReturnType<typeof abrirSessaoDeTela>> = null;
      let primeiro = true;
      return {
        enviar: async (usuario) => {
          while (true) {
            if (!sessao) {
              const m = fila.shift();
              if (!m) return null;
              sessao = await abrirSessaoDeTela({ modelo: m });
              if (!sessao) return null; // Hermes fora do ar: trocar de modelo não ajuda
              primeiro = true;
            }
            // O Hermes não recebe system prompt por turno: as regras do OpenUI vão no 1º texto.
            const r = await sessao.turno(primeiro ? `${sistema}\n\n---\n\n${usuario}` : usuario);
            if (r) { primeiro = false; return { texto: r.texto, provedor: "hermes", modelo: r.modelo }; }
            sessao.fechar();
            sessao = null;
            if (!primeiro) return null; // a correção falhou: a tela já não sai
            console.warn("[UI] modelo sem resposta; tentando o próximo da lista");
          }
        },
        fechar: () => sessao?.fechar(),
        trocar: () => {
          sessao?.fechar();
          sessao = null;
          return fila.length > 0;
        },
      };
    };
  }
  if (provedor === "groq") {
    return async (sistema) => {
      const m = modelo ?? MODELO_GROQ_TELAS;
      const mensagens: ChatMessage[] = [{ role: "system", content: sistema }];
      return {
        enviar: async (usuario) => {
          mensagens.push({ role: "user", content: usuario });
          const texto = await callChat({ provider: "groq", model: m, temperature: 0.3, maxTokens: 6000, timeoutMs: 90_000, messages: mensagens });
          if (!texto) return null;
          mensagens.push({ role: "assistant", content: texto });
          return { texto, provedor: "groq", modelo: m };
        },
        fechar: () => {},
      };
    };
  }
  return null;
}
