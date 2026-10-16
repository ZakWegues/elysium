import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { montarPs, nomeDeProcessoValido } from "../src/actions/ps";
import { buildScript, processoAlvo } from "../src/actions/windowManagement";
import { nomeDoPrint } from "../src/actions/screenshot";
import { nomeSeguro } from "../src/actions/createFile";
import { nomeDeProgramaAceito } from "../src/actions/openApp";

const MALICIOSOS = ["x'; calc; #", "x’; calc; #", "x‘)-or(&'calc')", "$(calc)", "`calc`", "a\"; calc; \"", "a\0b"];
const decodificar = (args: string[]) => Buffer.from(args[args.length - 1], "base64").toString("utf16le");

describe("PowerShell sem valor dentro do script (bloco 198)", () => {
  it("o valor vai no ambiente, nunca no texto do script", () => {
    for (const v of MALICIOSOS) {
      const { args, env } = montarPs("Write-Output $env:NX_VALOR", { NX_VALOR: v });
      expect(decodificar(args)).not.toContain(v.replace(/\0/g, ""));
      expect(env.NX_VALOR).toBe(v.replace(/\0/g, ""));
    }
    expect(() => montarPs("x", { "NX_A; calc": "1" })).toThrow();
  });

  it("o script das janelas lê o nome do ambiente", () => {
    for (const op of ["maximize", "minimize", "focus", "close"] as const) {
      const s = buildScript(op);
      expect(s).toContain("$env:NX_PROC");
      expect(s).not.toMatch(/-like '\*[^$]/);
    }
    expect(processoAlvo("VS Code")).toBe("code");
    expect(nomeDeProcessoValido("x'; calc")).toBe(false);
    expect(nomeDeProcessoValido("x’; calc")).toBe(false);
    expect(nomeDeProcessoValido("chrome")).toBe(true);
  });

  it("nenhum arquivo volta ao escape antigo nem a valor dentro de script", () => {
    const raiz = path.join(__dirname, "../src");
    const arquivos: string[] = [];
    const andar = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) andar(p); else if (p.endsWith(".ts")) arquivos.push(p); } };
    andar(raiz);
    for (const a of arquivos) {
      const t = fs.readFileSync(a, "utf8");
      expect(t, a).not.toMatch(/replace\(\/'\/g, "''"\)/);
      expect(t, a).not.toMatch(/-like '\*\$\{/);
    }
  });
});

describe("o que a Ely pode criar e abrir (bloco 199)", () => {
  it("print com nome seguro", () => {
    expect(nomeDoPrint("x'); Start-Process calc; #")).toBe("x___ Start-Process calc_ _.png");
    expect(nomeDoPrint("minha tela.png")).toBe("minha tela.png");
    expect(nomeDoPrint(undefined, new Date("2026-10-09T10:00:00Z"))).toMatch(/^screenshot_2026-10-09T10-00-00\.png$/);
  });

  it("arquivo criado é sempre de texto", () => {
    expect(nomeSeguro("setup.bat")).toBe("setup.bat.txt");
    expect(nomeSeguro("x.vbs")).toBe("x.vbs.txt");
    expect(nomeSeguro("..\\..\\Startup\\a.lnk")).toBe("_.._Startup_a.lnk.txt");
    expect(nomeSeguro("notas.md")).toBe("notas.md");
    expect(nomeSeguro("con.txt")).toBe("_con.txt");
    expect(nomeSeguro("fdp\u202Etxt.exe")).toBe("fdp_txt.exe.txt");
  });

  it("abrir programa: nome sim, caminho e link não", () => {
    expect(nomeDeProgramaAceito("Discord")).toBe(true);
    expect(nomeDeProgramaAceito("Epic Games Launcher")).toBe(true);
    expect(nomeDeProgramaAceito("C:\\Users\\usuario\\Downloads\\x.exe")).toBe(false);
    expect(nomeDeProgramaAceito("file:///C:/x.exe")).toBe(false);
    expect(nomeDeProgramaAceito("search-ms:query=x")).toBe(false);
    expect(nomeDeProgramaAceito("x’; calc")).toBe(false);
  });
});

describe("anexo da Caixa (bloco 199)", async () => {
  const { anexoAbreDireto } = await import("../src/services/anexos");
  it("abre foto e pdf; mostra na pasta o que executa", () => {
    expect(anexoAbreDireto("C:/x/foto.JPG")).toBe(true);
    expect(anexoAbreDireto("C:/x/doc.pdf")).toBe(true);
    for (const f of ["a.exe", "a.bat", "a.cmd", "a.js", "a.vbs", "a.hta", "a.lnk", "a.ps1", "a.scr", "a.msi", "a"]) expect(anexoAbreDireto(f)).toBe(false);
  });
});
