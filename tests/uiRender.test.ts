import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Telas inteligentes (Fase 1, 22/10): o renderer pronto vai versionado em ui-render/dist e é
 * copiado no build. Os testes dele moram no próprio pacote (`cd ui-render && npm test`); aqui só
 * a guarda do que entra no app: o arquivo existe e o CSP continua fechado.
 */
const html = fs.readFileSync(path.join(__dirname, "..", "ui-render", "dist", "render.html"), "utf8");
const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1] ?? "";

describe("renderer das telas (ui-render/dist/render.html)", () => {
  it("tem CSP: nada além dos tiles do OpenFreeMap na rede", () => {
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src https://tiles.openfreemap.org;");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toMatch(/jsdelivr|unpkg|cdnjs|esm\.sh|googleapis|thesys|posthog|cloudfront/);
    expect(csp).not.toMatch(/unsafe-eval/);
  });

  it("é autocontido: nenhum script ou folha de estilo de fora", () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html.length).toBeLessThan(6 * 1024 * 1024);
  });

  it("o protocolo vai junto para o host validar", () => {
    expect(fs.existsSync(path.join(__dirname, "..", "ui-render", "dist", "protocolo.js"))).toBe(true);
  });
});
