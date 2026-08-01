/**
 * Captura de tela para o app mobile.
 *
 * Usa o `desktopCapturer` do Electron, não o PowerShell de `src/actions/screenshot.ts`.
 * Aquele caminho abre um processo, carrega System.Drawing, escreve PNG no disco e abre
 * o arquivo — custa centenas de milissegundos e suja a Área de Trabalho. Aqui a captura
 * acontece dentro do processo principal, já redimensionada, e sai como JPEG em memória.
 *
 * É "olhar a tela", não vídeo: cada chamada é um quadro sob demanda. O app pede na
 * cadência que quiser.
 */

import { desktopCapturer, screen } from "electron";

export interface ScreenInfo {
  id:        string;
  name:      string;
  width:     number;
  height:    number;
  isPrimary: boolean;
}

export interface CapturedFrame {
  /** JPEG em base64, sem o prefixo data:. */
  base64:     string;
  width:      number;
  height:     number;
  capturedAt: number;
  sourceId:   string;
  sourceName: string;
}

const DEFAULT_MAX_WIDTH = 1280;
const DEFAULT_QUALITY   = 60;

/** Monitores disponíveis, para o app deixar o usuário escolher qual espelhar. */
export async function listScreens(): Promise<ScreenInfo[]> {
  const displays  = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;

  // thumbnailSize 0x0: só queremos os metadados das fontes, não os bitmaps.
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 0, height: 0 },
  });

  return sources.map((source, index) => {
    // display_id vem vazio em algumas configurações de driver; cair pro índice mantém
    // a lista utilizável em vez de devolver dimensões erradas.
    const display = displays.find(d => String(d.id) === source.display_id) ?? displays[index];
    return {
      id:        source.id,
      name:      source.name,
      width:     display?.size.width  ?? 0,
      height:    display?.size.height ?? 0,
      isPrimary: display ? display.id === primaryId : index === 0,
    };
  });
}

export async function captureScreen(options: {
  sourceId?: string;
  maxWidth?: number;
  quality?:  number;
} = {}): Promise<CapturedFrame> {
  const maxWidth = clamp(options.maxWidth ?? DEFAULT_MAX_WIDTH, 160, 3840);
  const quality  = clamp(options.quality  ?? DEFAULT_QUALITY,     10,  100);

  // Pedir o thumbnail já no tamanho final é o que mantém isto rápido: redimensionar
  // depois significaria trafegar o bitmap inteiro da tela primeiro.
  const primary = screen.getPrimaryDisplay();
  const ratio   = primary.size.height / Math.max(1, primary.size.width);

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: maxWidth, height: Math.round(maxWidth * ratio) },
  });

  if (sources.length === 0) throw new Error("nenhuma tela disponível para captura");

  const source = options.sourceId
    ? sources.find(s => s.id === options.sourceId)
    : sources[0];

  if (!source) throw new Error(`tela não encontrada: ${options.sourceId}`);

  const image = source.thumbnail;
  if (image.isEmpty()) throw new Error("captura devolveu imagem vazia");

  const size = image.getSize();
  return {
    base64:     image.toJPEG(quality).toString("base64"),
    width:      size.width,
    height:     size.height,
    capturedAt: Date.now(),
    sourceId:   source.id,
    sourceName: source.name,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
