import { app } from "electron";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";

/**
 * Transcrição local com o Parakeet (13/11, o que deixa o Roamies "instantâneo"): o modelo
 * `parakeet-tdt-0.6b-v3` (NVIDIA, multilíngue, com português), em int8, rodando no PC pelo
 * sherpa-onnx. Dá as palavras ENQUANTO ele fala (a transcrição ao vivo ao lado da bolota) e o texto
 * final sem rede; a Groq (Whisper) fica de reserva.
 *
 * - O modelo (~490 MB compactado, ~670 MB aberto) é baixado uma vez para `userData/modelos`.
 * - Carrega na primeira escuta (ou quando a bolota abre) e solta da memória depois de 15 min parado.
 * - A decodificação roda no pool de threads do sherpa (`decodeAsync`): o processo principal não trava.
 * - Ao vivo: decodifica o áudio acumulado de novo assim que a anterior termina (sem fila), só os
 *   últimos 30 s.
 */

const URL_MODELO = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2";
const NOME = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8";
const ARQUIVOS = ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"];
const TAXA = 16_000;
const SOLTAR_MS = 15 * 60_000;
const JANELA_AO_VIVO = 30 * TAXA;

export function pastaDoModelo(): string { return path.join(app.getPath("userData"), "modelos", NOME); }

export function modeloBaixado(pasta = pastaDoModelo()): boolean {
  return ARQUIVOS.every((a) => { try { return fs.statSync(path.join(pasta, a)).size > 0; } catch { return false; } });
}

// ── download (uma vez) ───────────────────────────────────────────────────────────────────

let baixando: Promise<boolean> | null = null;

/** Baixa e abre o modelo, se faltar. `true` = pronto. Uma vez por vez. */
export function garantirModelo(): Promise<boolean> {
  if (modeloBaixado()) return Promise.resolve(true);
  if (baixando) return baixando;
  baixando = (async () => {
    const destino = path.dirname(pastaDoModelo());
    const tmp = path.join(os.tmpdir(), `parakeet-${Date.now()}.tar.bz2`);
    try {
      fs.mkdirSync(destino, { recursive: true });
      console.log("[parakeet] baixando o modelo (~490 MB, uma vez só)…");
      const t0 = Date.now();
      const r = await fetch(URL_MODELO, { redirect: "follow" });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      const arq = fs.createWriteStream(tmp);
      const leitor = r.body.getReader();
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        if (!arq.write(value)) await new Promise<void>((ok) => arq.once("drain", () => ok()));
      }
      await new Promise<void>((ok, falha) => arq.end((e?: Error | null) => (e ? falha(e) : ok())));
      // O tar do Windows (bsdtar) abre .tar.bz2.
      await new Promise<void>((ok, falha) => {
        const p = spawn(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-xjf", tmp, "-C", destino], { windowsHide: true });
        p.on("error", falha);
        p.on("close", (c) => (c === 0 ? ok() : falha(new Error(`tar saiu com ${c}`))));
      });
      const ok = modeloBaixado();
      console.log(ok ? `[parakeet] modelo pronto em ${Math.round((Date.now() - t0) / 1000)} s` : "[parakeet] o pacote não tinha os arquivos esperados");
      return ok;
    } catch (e) {
      console.warn("[parakeet] não baixei o modelo:", e instanceof Error ? e.message : e);
      return false;
    } finally {
      fs.rm(tmp, { force: true }, () => {});
      baixando = null;
    }
  })();
  return baixando;
}

// ── reconhecedor (carrega sob demanda) ───────────────────────────────────────────────────

type Reconhecedor = {
  createStream(): { acceptWaveform(o: { samples: Float32Array; sampleRate: number }): void };
  decodeAsync(s: unknown): Promise<void>;
  getResult(s: unknown): { text: string };
};

let rec: Reconhecedor | null = null;
let carregando: Promise<Reconhecedor | null> | null = null;
let timerSoltar: NodeJS.Timeout | null = null;

function adiarSoltar(): void {
  if (timerSoltar) clearTimeout(timerSoltar);
  timerSoltar = setTimeout(() => { rec = null; console.log("[parakeet] solto da memória (15 min parado)"); }, SOLTAR_MS);
}

/** O reconhecedor pronto (carrega na primeira vez). null = sem modelo ou sem o sherpa. */
export function carregar(): Promise<Reconhecedor | null> {
  if (rec) { adiarSoltar(); return Promise.resolve(rec); }
  if (carregando) return carregando;
  carregando = (async () => {
    if (!modeloBaixado()) { void garantirModelo(); return null; }
    try {
      const t0 = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sherpa = require("sherpa-onnx-node") as { OfflineRecognizer: new (c: unknown) => Reconhecedor };
      const p = pastaDoModelo();
      rec = new sherpa.OfflineRecognizer({
        featConfig: { sampleRate: TAXA, featureDim: 80 },
        modelConfig: {
          transducer: { encoder: path.join(p, "encoder.int8.onnx"), decoder: path.join(p, "decoder.int8.onnx"), joiner: path.join(p, "joiner.int8.onnx") },
          tokens: path.join(p, "tokens.txt"),
          modelType: "nemo_transducer",
          numThreads: Math.max(2, Math.min(4, os.cpus().length - 2)),
          provider: "cpu",
          debug: 0,
        },
        decodingMethod: "greedy_search",
      });
      console.log(`[parakeet] carregado em ${Date.now() - t0} ms`);
      adiarSoltar();
      return rec;
    } catch (e) {
      console.warn("[parakeet] não carregou:", e instanceof Error ? e.message : e);
      return null;
    } finally {
      carregando = null;
    }
  })();
  return carregando;
}

/** Decodifica um trecho de áudio (16 kHz, float). "" se não deu. */
export async function transcreverPcm(amostras: Float32Array): Promise<string> {
  const r = await carregar();
  if (!r || amostras.length < TAXA / 4) return "";
  const s = r.createStream();
  s.acceptWaveform({ samples: amostras, sampleRate: TAXA });
  await r.decodeAsync(s);
  return limparTexto(r.getResult(s).text);
}

/** O texto do Parakeet arrumado: espaços e as marcas de silêncio que ele às vezes devolve. Pura. */
export function limparTexto(t: string): string {
  return String(t ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    // "Ely" (o nome dela) sai "L", "Eli", "Elie" no Parakeet (medido em 13/11).
    .replace(/^(L|Eli|Elie|Ellie|Éli|Elly)([,.!?]|\s|$)/i, "Ely$2")
    .replace(/\b(Eli|Elie|Ellie|Elly)\b(?=[,.!?]|\s+(me|abre|abra|toca|fecha|liga|desliga|qual|quanto|o que|como|por favor))/gi, "Ely");
}

// ── a escuta corrente: acumula o áudio e solta o texto parcial ───────────────────────────

let pedacos: Float32Array[] = [];
let total = 0;
let decodificando = false;
let pendente = false;
let geracao = 0;
let aoParcial: ((texto: string) => void) | null = null;

/** Junta pedaços num buffer só, pegando os últimos `max` (o ao vivo não precisa do começo de um ditado longo). Pura. */
export function juntar(lista: Float32Array[], max = Infinity): Float32Array {
  const n = lista.reduce((s, p) => s + p.length, 0);
  const tam = Math.min(n, max);
  const out = new Float32Array(tam);
  let fim = tam;
  for (let i = lista.length - 1; i >= 0 && fim > 0; i--) {
    const p = lista[i];
    const k = Math.min(p.length, fim);
    out.set(p.subarray(p.length - k), fim - k);
    fim -= k;
  }
  return out;
}

/** Começa uma escuta nova (zera o áudio). `parcial` recebe o texto ao vivo. */
export function comecarEscuta(parcial: (texto: string) => void): void {
  geracao++;
  pedacos = [];
  total = 0;
  pendente = false;
  aoParcial = parcial;
  void carregar();
}

/** Um pedaço de áudio chegou do gravador. */
export function receberPcm(pcm: Float32Array): void {
  pedacos.push(pcm);
  total += pcm.length;
  if (decodificando) { pendente = true; return; }
  void parcialAgora();
}

async function parcialAgora(): Promise<void> {
  if (!rec || total < TAXA / 2) return;
  const minha = geracao;
  decodificando = true;
  try {
    const texto = await transcreverPcm(juntar(pedacos, JANELA_AO_VIVO));
    if (minha === geracao && texto) aoParcial?.(texto);
  } catch { /* o próximo pedaço tenta de novo */ }
  finally {
    decodificando = false;
    if (pendente && minha === geracao) { pendente = false; void parcialAgora(); }
  }
}

/**
 * O texto final da escuta que acabou, pelo Parakeet. "" = sem modelo, sem áudio ou falhou
 * (quem chama vai pela Groq). Medido no PC do dono: ver o log "[parakeet] final".
 */
export async function textoFinal(): Promise<string> {
  const minha = ++geracao; // nenhum parcial atrasado aparece depois do final
  aoParcial = null;
  if (!rec || total < TAXA / 4) return "";
  const t0 = Date.now();
  const audio = juntar(pedacos);
  pedacos = []; total = 0;
  try {
    const texto = await transcreverPcm(audio);
    if (minha === geracao) console.log(`[parakeet] final em ${Date.now() - t0} ms (${(audio.length / TAXA).toFixed(1)} s de áudio)`);
    return texto;
  } catch (e) {
    console.warn("[parakeet] final falhou:", e instanceof Error ? e.message : e);
    return "";
  }
}
