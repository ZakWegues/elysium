import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Sobe o Ollama quando ele está instalado mas parado (fase 12).
 *
 * O cérebro é local desde a §18, e tudo depende do servidor do Ollama estar de pé. Nesta
 * máquina ele sobe pelo atalho da pasta Inicializar — mas quando cai (atualização dele,
 * alguém fechou pela bandeja, crash) nada o levanta de novo, e todo pedido passa a cair na
 * Groq, que no plano gratuito bate no teto de tokens por minuto em dois ou três comandos.
 * O sintoma era "Não entendi o que você pediu", sem pista nenhuma da causa.
 *
 * Só age com endereço local (127.0.0.1/localhost): Ollama em outra máquina não é nosso para
 * ligar. Prefere o "ollama app.exe" — o mesmo que o atalho de inicialização abre, com ícone
 * na bandeja —, e cai no `ollama serve` se ele não existir. No máximo uma tentativa por
 * minuto: se o Ollama não sobe, repetir a cada pedido só atrasaria a resposta da Groq.
 */

const INTERVALO_TENTATIVAS_MS = 60_000;
const PRAZO_SUBIDA_MS = 15_000;
let ultimaTentativa = 0;
let subindo: Promise<boolean> | null = null;

export function enderecoLocal(base: string): boolean {
  try {
    const h = new URL(base).hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
  } catch { return false; }
}

async function responde(base: string, ms: number): Promise<boolean> {
  try { return (await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(ms) })).ok; } catch { return false; }
}

function executaveis(): { exe: string; args: string[] }[] {
  const pasta = path.join(process.env["LOCALAPPDATA"] ?? "", "Programs", "Ollama");
  const lista: { exe: string; args: string[] }[] = [];
  if (fs.existsSync(path.join(pasta, "ollama app.exe"))) lista.push({ exe: path.join(pasta, "ollama app.exe"), args: [] });
  if (fs.existsSync(path.join(pasta, "ollama.exe"))) lista.push({ exe: path.join(pasta, "ollama.exe"), args: ["serve"] });
  lista.push({ exe: "ollama", args: ["serve"] });
  return lista;
}

/**
 * `true` se o Ollama estiver respondendo (já estava, ou acabou de subir). `forcar` fura a
 * trava de uma tentativa por minuto: é o clique do Zak em "Subir o Ollama", não um pedido
 * automático repetido.
 */
export function garantirOllama(base: string, forcar = false): Promise<boolean> {
  if (!enderecoLocal(base)) return responde(base, 1500);
  if (subindo) return subindo;
  subindo = (async () => {
    if (await responde(base, 1500)) return true;
    if (!forcar && Date.now() - ultimaTentativa < INTERVALO_TENTATIVAS_MS) return false;
    ultimaTentativa = Date.now();
    for (const { exe, args } of executaveis()) {
      try {
        const filho = spawn(exe, args, { detached: true, stdio: "ignore", windowsHide: true });
        // Sem ouvinte de erro, um ENOENT derrubaria o processo principal.
        const falhou = await new Promise<boolean>(res => {
          filho.once("error", () => res(true));
          setTimeout(() => res(false), 300);
        });
        if (falhou) continue;
        filho.unref();
        console.log(`[ollama] estava parado; subindo por ${path.basename(exe)}.`);
        const limite = Date.now() + PRAZO_SUBIDA_MS;
        while (Date.now() < limite) {
          if (await responde(base, 1000)) { console.log("[ollama] de pé."); return true; }
          await new Promise(r => setTimeout(r, 500));
        }
        console.warn("[ollama] subiu o processo, mas o servidor não respondeu a tempo.");
        return false;
      } catch { /* tenta o próximo */ }
    }
    console.warn("[ollama] não achei o executável para subir.");
    return false;
  })();
  return subindo.finally(() => { subindo = null; });
}

/** Erro de conexão (servidor fora do ar), não um HTTP de erro do Ollama. */
export function falhaDeConexao(e: unknown): boolean {
  const txt = `${String(e)} ${String((e as { cause?: unknown })?.cause ?? "")}`;
  return /fetch failed|ECONNREFUSED|ECONNRESET|connect/i.test(txt);
}
