import * as fs from "node:fs";
import * as path from "node:path";
import { app, clipboard, shell } from "electron";

/** Segurança (23.2): nunca apaga um arquivo que já existe — "lista.txt" vira "lista (2).txt". */
export function semSobrescrever(caminho: string, existe: (p: string) => boolean = fs.existsSync): string {
  if (!existe(caminho)) return caminho;
  const ext = path.extname(caminho), base = caminho.slice(0, caminho.length - ext.length);
  for (let i = 2; i < 1000; i++) { const c = `${base} (${i})${ext}`; if (!existe(c)) return c; }
  return `${base} (${Date.now()})${ext}`;
}

export async function writeText(content: string, description: string): Promise<string> {
  clipboard.writeText(content);

  const safe = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 40)
    .replace(/^_+|_+$/g, "") || "texto";

  const filePath = semSobrescrever(path.join(app.getPath("desktop"), `${safe}.txt`));
  fs.writeFileSync(filePath, content, "utf-8");
  shell.openPath(filePath);

  return `Pronto! ${description} salvo na Área de Trabalho e copiado para a área de transferência.`;
}
