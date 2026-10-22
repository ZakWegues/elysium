// Roda no build (Node): escreve dist/schema.json (para o validador do PC) e dist/prompt.txt (o
// system prompt das telas). Saem da própria biblioteca, então nunca ficam fora de sincronia.
import "./lib/devtools";
import fs from "node:fs";
import path from "node:path";
import { library } from "./lib/library";
import { promptOptionsEly } from "./prompt-ely";

export function gerar(dist: string): { schema: number; prompt: number } {
  const schema = JSON.stringify(library.toJSONSchema());
  const prompt = library.prompt(promptOptionsEly);
  fs.writeFileSync(path.join(dist, "schema.json"), schema);
  fs.writeFileSync(path.join(dist, "prompt.txt"), prompt);
  return { schema: schema.length, prompt: prompt.length };
}
