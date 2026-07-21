import * as fs from "node:fs";
import * as path from "node:path";
import { app, shell } from "electron";

export async function createFile(
  filename: string,
  content: string,
  description: string
): Promise<string> {
  const safe = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "arquivo.txt";
  const filePath = path.join(app.getPath("desktop"), safe);

  fs.writeFileSync(filePath, content, "utf-8");
  shell.openPath(filePath);

  return `Pronto! ${description} salvo como "${safe}" na Área de Trabalho.`;
}
