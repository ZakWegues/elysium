// Roda no build (Node): escreve dist/schema.json (para o validador do PC) e dist/prompt.txt (o
// system prompt das telas). Saem da própria biblioteca, então nunca ficam fora de sincronia.
import "./lib/devtools";
import fs from "node:fs";
import path from "node:path";
import { library } from "./lib/library";
import { promptOptionsEly } from "./prompt-ely";

/**
 * 24/10: sem mapas nas telas novas (saíam errados e custavam caro). O componente continua na
 * biblioteca — telas antigas salvas ainda abrem —, mas some do que o modelo enxerga. Pura.
 */
export function semMapas(prompt: string): string {
  return prompt
    .split("\n")
    .filter((l) => !/^(Map|MapMarker)\(/.test(l))
    .join("\n")
    .replace("Map with MapMarker for places and routes", "a timeline List with SearchImage photos for places, days out and trips (there are no maps)");
}

export function gerar(dist: string): { schema: number; prompt: number } {
  const schema = JSON.stringify(library.toJSONSchema());
  const prompt = semMapas(library.prompt(promptOptionsEly));
  fs.writeFileSync(path.join(dist, "schema.json"), schema);
  fs.writeFileSync(path.join(dist, "prompt.txt"), prompt);
  return { schema: schema.length, prompt: prompt.length };
}
