import { describe, expect, it } from "vitest";
import * as fs from "node:fs";

/**
 * O tsc só leva .ts para o dist; todo o resto é o copy-assets.mjs que copia. Um arquivo
 * esquecido ali não quebra build nem teste — o código que o lê cai no "seguindo sem" e o
 * recurso some em silêncio. Foi o que aconteceu com o gpu-heavy.json do bloco 14 ao 104.
 */
describe("copy-assets", () => {
  const script = fs.readFileSync("scripts/copy-assets.mjs", "utf8");

  it("copia todo JSON de src/config", () => {
    for (const f of fs.readdirSync("src/config").filter(n => n.endsWith(".json"))) {
      expect(script, `faltou src/config/${f}`).toContain(`src/config/${f}`);
    }
  });

  it("copia todo HTML do renderer", () => {
    for (const f of fs.readdirSync("src/renderer").filter(n => n.endsWith(".html"))) {
      expect(script, `faltou src/renderer/${f}`).toContain(`src/renderer/${f}`);
    }
  });
});
