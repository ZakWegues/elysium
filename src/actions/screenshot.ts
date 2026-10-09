import { app, shell } from "electron";
import * as path from "node:path";
import { rodarPs } from "./ps";

/**
 * Nome do arquivo do print: só letras, números, espaço, ponto, hífen e sublinhado (bloco 198).
 * O nome vinha do modelo e do RPC, e o escape antigo (`\'`, que não existe no PowerShell)
 * deixava um nome com aspas virar comando. Pura.
 */
export function nomeDoPrint(filename: string | undefined, agora = new Date()): string {
  const base = (filename ?? "")
    .replace(/\.png$/i, "")
    .replace(/[^\p{L}\p{N} ._-]/gu, "_")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80);
  if (base) return `${base}.png`;
  const timestamp = agora.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `screenshot_${timestamp}.png`;
}

export async function screenshot(filename?: string): Promise<string> {
  const fname = nomeDoPrint(filename);
  const filePath = path.join(app.getPath("desktop"), fname);

  // O caminho vai em $env:NX_CAMINHO, nunca no texto do script.
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds",
    "$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)",
    "$g = [System.Drawing.Graphics]::FromImage($bmp)",
    "$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)",
    "$bmp.Save($env:NX_CAMINHO)",
    "$g.Dispose()",
    "$bmp.Dispose()",
  ].join("; ");

  const r = await rodarPs(script, { NX_CAMINHO: filePath });
  if (r.codigo !== 0) return "Não consegui capturar a tela.";
  await shell.openPath(filePath);
  return `Screenshot "${fname}" salvo na Área de Trabalho.`;
}
