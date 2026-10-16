import * as fs from "node:fs";
import * as path from "node:path";
import { semSobrescrever } from "./writeText";
import { app, shell } from "electron";

/** Extensões que a Ely pode criar (bloco 199). Tudo de texto, nada que o Windows execute. */
export const EXTENSOES_PERMITIDAS = new Set([".txt", ".md", ".csv", ".json"]);

/**
 * O nome final do arquivo: sem caractere de caminho, sem nome reservado do Windows, e com uma
 * extensão de TEXTO — "setup.bat" vira "setup.bat.txt". Antes o nome vinha do modelo e o
 * arquivo era aberto em seguida: um ".bat" ou ".vbs" criado a pedido de uma página injetada
 * rodava na hora. Pura.
 */
export function nomeSeguro(filename: string): string {
  let nome = String(filename ?? "")
    .replace(/[<>:"/\\|?*\x00-\x1f‪-‮⁦-⁩]/g, "_")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 100) || "arquivo";
  const ext = path.extname(nome).toLowerCase();
  if (!EXTENSOES_PERMITIDAS.has(ext)) nome = `${nome}.txt`;
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(nome)) nome = `_${nome}`;
  return nome;
}

export async function createFile(
  filename: string,
  content: string,
  description: string
): Promise<string> {
  const safe = nomeSeguro(filename);
  const filePath = semSobrescrever(path.join(app.getPath("desktop"), safe));

  fs.writeFileSync(filePath, content, "utf-8");
  // Texto abre no editor padrão; a extensão já foi garantida acima.
  void shell.openPath(filePath);

  return `Pronto! ${description} salvo como "${path.basename(filePath)}" na Área de Trabalho.`;
}
