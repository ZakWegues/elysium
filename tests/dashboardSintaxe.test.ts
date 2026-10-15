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
