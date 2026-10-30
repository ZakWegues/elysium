import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Script } from "node:vm";
import { describe, expect, it } from "vitest";

// Os scripts do dashboard são clássicos e não passam pelo tsc: um erro de sintaxe derruba o
// arquivo inteiro em silêncio (e tudo que ele declara some). Aqui cada um é só compilado.
const DIR = join(__dirname, "../src/renderer/dashboard/js");

describe("sintaxe dos scripts do dashboard", () => {
  for (const f of readdirSync(DIR).filter(n => n.endsWith(".js"))) {
    it(f, () => {
      expect(() => new Script(readFileSync(join(DIR, f), "utf8"), { filename: f })).not.toThrow();
    });
  }
});

// 31/10: os scripts dividem o mesmo escopo global — um `const` de topo com o nome de outro
// arquivo derruba o segundo inteiro ("already been declared"). Foi o `GRUPOS` de temas.js,
// que desligou a paleta (Ctrl+K) da 2.23.0 à 2.28.0.
describe("nomes de topo dos scripts do dashboard", () => {
  it("nenhum const/let/class/function repetido entre arquivos", () => {
    const vistos = new Map<string, string>();
    const repetidos: string[] = [];
    for (const f of readdirSync(DIR).filter(n => n.endsWith(".js"))) {
      const s = readFileSync(join(DIR, f), "utf8");
      for (const m of s.matchAll(/^(?:const|let|class|function\*?|async function)\s+([A-Za-z_$][\w$]*)/gm)) {
        const outro = vistos.get(m[1]);
        if (outro && outro !== f) repetidos.push(`${m[1]} (${outro} e ${f})`);
        else vistos.set(m[1], f);
      }
    }
    expect(repetidos).toEqual([]);
  });
});
