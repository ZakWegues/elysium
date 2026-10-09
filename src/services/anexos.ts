import * as path from "node:path";

/**
 * Tipos de anexo que abrem com um clique (fase 20, bloco 199). Pura.
 *
 * A Caixa recebe arquivo do celular — e o celular pode ter recebido de qualquer lugar. Abrir
 * com `shell.openPath` um ".exe", ".bat", ".js", ".hta" ou ".lnk" é executar. Lista BRANCA:
 * o que não está aqui só é mostrado na pasta.
 */
const ABREM = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".heic",
  ".pdf", ".txt", ".md", ".csv", ".json", ".rtf",
  ".mp3", ".m4a", ".ogg", ".wav", ".opus", ".aac",
  ".mp4", ".mov", ".webm", ".mkv",
  ".docx", ".xlsx", ".pptx", ".odt", ".ods",
]);

export function anexoAbreDireto(arquivo: string): boolean {
  return ABREM.has(path.extname(arquivo).toLowerCase());
}
