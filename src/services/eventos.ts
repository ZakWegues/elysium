import { EventEmitter } from "node:events";

/**
 * O barramento de eventos do PC (bloco 79) — o que as rotinas por gatilho escutam.
 *
 * Quem EMITE mora no `main.ts` (é lá que estão o `powerMonitor`, a telemetria e a lista
 * de janelas) e no `server.ts` (o celular conectou). Quem ESCUTA é o `rotinas.ts`. Este
 * arquivo só existe para os dois não se importarem: `rotinas` não pode importar do
 * `main`, e o `main` já importa `rotinas`.
 *
 * Cada evento carrega `dados` para a rotina filtrar (o nome do app que abriu, o valor da
 * CPU) e para a condição em português ter contexto.
 */

export type NomeEvento =
  | "celular.conectou"   // um ELYSIUM-M abriu o WebSocket
  | "pc.ocioso"          // sem mouse/teclado há N minutos (dados: { minutos })
  | "pc.voltou"          // voltou da suspensão ou destravou a tela
  | "app.abriu"          // uma janela nova apareceu (dados: { app, titulo })
  | "app.fechou"         // uma janela sumiu (dados: { app })
  | "cpu.alta"           // CPU acima do limite por 2 minutos (dados: { valor })
  | "ram.alta";          // RAM acima do limite por 2 minutos (dados: { valor })

export interface EventoPc {
  nome: NomeEvento;
  em: number;
  dados: Record<string, unknown>;
}

/** Rótulo para a tela e para a condição em português. */
export const ROTULO_EVENTO: Record<NomeEvento, string> = {
  "celular.conectou": "quando o celular conectar",
  "pc.ocioso": "quando o PC ficar ocioso",
  "pc.voltou": "quando o PC voltar da suspensão",
  "app.abriu": "quando um programa abrir",
  "app.fechou": "quando um programa fechar",
  "cpu.alta": "quando a CPU ficar alta",
  "ram.alta": "quando a memória ficar alta",
};

/** Marcos de ociosidade emitidos pelo main, em minutos. A rotina escolhe o menor ≥ o dela. */
export const MARCOS_OCIOSO = [5, 15, 30, 60, 120] as const;

const barramento = new EventEmitter();
barramento.setMaxListeners(20);

export function emitirEvento(nome: NomeEvento, dados: Record<string, unknown> = {}): void {
  const evento: EventoPc = { nome, em: Date.now(), dados };
  console.log(`[eventos] ${nome} ${Object.keys(dados).length ? JSON.stringify(dados) : ""}`);
  barramento.emit("evento", evento);
}

export function ouvirEventos(fn: (e: EventoPc) => void): () => void {
  barramento.on("evento", fn);
  return () => barramento.off("evento", fn);
}
