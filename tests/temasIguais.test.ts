import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// 31/10: a janela de configuração tem a própria cópia da tabela de temas (é autocontida). Este
// teste é o que impede as duas de divergirem: mesmos ids, mesmas cores, mesmos aposentados.
const raiz = path.join(__dirname, "..", "src", "renderer");
const ler = (f: string) => fs.readFileSync(path.join(raiz, f), "utf8").replace(/\r\n/g, "\n");

function temas(fonte: string): Record<string, { purple: string; bg: string; surface: string }> {
  const bloco = fonte.slice(fonte.indexOf("const THEMES = {"), fonte.indexOf("};", fonte.indexOf("const THEMES = {")));
  const r: Record<string, { purple: string; bg: string; surface: string }> = {};
  for (const m of bloco.matchAll(/^\s*"?([\w-]+)"?:\s*\{[^\n]*?purple: "(#\w+)"[^\n]*?bg: "(#\w+)", surface: "(#\w+)"/gm)) {
    r[m[1]] = { purple: m[2], bg: m[3], surface: m[4] };
  }
  return r;
}

function aposentados(fonte: string): string {
  const i = fonte.indexOf("const TEMAS_APOSENTADOS = {");
  return fonte.slice(i, fonte.indexOf("};", i)).replace(/\s+/g, " ");
}

describe("temas: dashboard e janela de configuração iguais", () => {
  const dash = ler("dashboard/js/temas.js");
  const cfg = ler("config.html");

  it("mesmos temas com as mesmas cores", () => {
    const a = temas(dash), b = temas(cfg);
    expect(Object.keys(a)).toHaveLength(9);
    expect(b).toEqual(a);
  });

  it("mesmos temas aposentados", () => {
    expect(aposentados(cfg)).toBe(aposentados(dash));
  });
});
