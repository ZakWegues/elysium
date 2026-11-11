import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Decide se vale carregar o modelo local na GPU agora.
 *
 * O PROBLEMA
 *
 * Esta é a mesma máquina em que o dono joga. São 8 GB de VRAM; o `llama3.2` ocupa ~2,6 GB
 * enquanto está carregado. Um comando de voz durante o jogo carregaria o modelo bem na
 * hora em que a GPU está mais disputada — e o sintoma seria queda de quadros num jogo,
 * culpa que ninguém associaria ao assistente de voz.
 *
 * O `keep_alive` do `llm.ts` já resolve o repouso: sem comando, o modelo sai da VRAM
 * sozinho em um minuto. Isto aqui cobre o outro caso, o de falar com o assistente COM o
 * jogo aberto: em vez de carregar, roteia pela nuvem daquela vez.
 *
 * POR QUE PROCESSO EM EXECUÇÃO E NÃO JANELA EM FOCO
 *
 * Jogo minimizado continua segurando a VRAM inteira. Foco diz respeito a atenção do
 * usuário, não a memória de vídeo — e a pergunta aqui é sobre memória de vídeo.
 *
 * POR QUE UM CACHE CURTO
 *
 * `tasklist` custa ~150 ms de spawn. Isso é irrelevante uma vez por comando de voz, mas
 * o resultado não muda de segundo a segundo: ninguém abre e fecha um jogo em 15 s. O
 * cache mantém o custo fora do caminho quente sem tornar a resposta obsoleta na prática.
 */

const CACHE_MS = 15_000;

let cache: { em: number; ocupada: boolean; porQuem: string | null } | null = null;
let lista: string[] | null = null;

/**
 * A lista fica em `src/config/gpu-heavy.json` (copiado para `dist/config/`) para um
 * programa novo custar uma linha de JSON, não uma alteração de código — mesma ideia do
 * `apps.json`.
 */
function carregarLista(): string[] {
  if (lista) return lista;
  try {
    const arquivo = path.join(__dirname, "..", "config", "gpu-heavy.json");
    const dados = JSON.parse(fs.readFileSync(arquivo, "utf-8")) as { processos?: string[] };
    lista = (dados.processos ?? []).map(normalizar);
  } catch (e) {
    console.warn("[gpuGuard] não consegui ler gpu-heavy.json; seguindo sem lista:", e);
    lista = [];
  }
  return lista;
}

function normalizar(nome: string): string {
  return nome.trim().toLowerCase().replace(/\.exe$/, "");
}

function processosRodando(): Promise<string[]> {
  return new Promise(resolve => {
    // `/fo csv /nh` é o formato mais barato de parsear e não depende do idioma do Windows,
    // ao contrário da tabela formatada, que muda de cabeçalho conforme a instalação.
    execFile("tasklist.exe", ["/fo", "csv", "/nh"], { maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([]);
      const nomes = stdout
        .split(/\r?\n/)
        .map(linha => linha.match(/^"([^"]+)"/)?.[1])
        .filter((n): n is string => !!n)
        .map(normalizar);
      resolve(nomes);
    });
  });
}

/**
 * Devolve o nome do processo pesado encontrado, ou `null` se a GPU está livre.
 *
 * Nunca lança: falhar a checagem não pode impedir um comando de voz de acontecer. Em
 * caso de falha o resultado é "livre", ou seja, o comportamento normal — errar para o
 * lado de responder é melhor que errar para o lado de travar.
 */
export async function quemOcupaGpu(): Promise<string | null> {
  const agora = Date.now();
  if (cache && agora - cache.em < CACHE_MS) return cache.porQuem;

  try {
    const pesados = carregarLista();
    if (pesados.length === 0) {
      cache = { em: agora, ocupada: false, porQuem: null };
      return null;
    }

    const rodando = new Set(await processosRodando());
    const achado = pesados.find(p => rodando.has(p)) ?? null;

    cache = { em: agora, ocupada: !!achado, porQuem: achado };
    return achado;
  } catch (e) {
    console.warn("[gpuGuard] checagem falhou; assumindo GPU livre:", e);
    cache = { em: agora, ocupada: false, porQuem: null };
    return null;
  }
}
