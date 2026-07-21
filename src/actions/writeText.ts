import * as fs from "node:fs";
import * as path from "node:path";
import { app, clipboard, shell } from "electron";

export async function writeText(content: string, description: string): Promise<string> {
  clipboard.writeText(content);

  const safe = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 40)
    .replace(/^_+|_+$/g, "") || "texto";

  const filePath = path.join(app.getPath("desktop"), `${safe}.txt`);
  fs.writeFileSync(filePath, content, "utf-8");
  shell.openPath(filePath);

  return `Pronto! ${description} salvo na Área de Trabalho e copiado para a área de transferência.`;
}
