import { describe, expect, it } from "vitest";
import { aprovacaoPerigosa } from "../src/services/hermes/aprovacoes";

describe("licença só para o que é sério (14/11)", () => {
  it("o perigoso pergunta", () => {
    for (const command of [
      "Remove-Item -Recurse C:\\Users\\x\\Documents\\velho",
      "del /s /q C:\\temp\\*",
      "rm -rf ./dist",
      "shutdown /s /t 0",
      "winget uninstall Spotify",
      "Stop-Process -Name chrome -Force",
      "reg delete HKCU\\Software\\Teste /f",
      "git push --force origin main",
      "format D:",
    ]) expect(aprovacaoPerigosa({ command }), command).toBe(true);
    expect(aprovacaoPerigosa({ description: "Apagar os arquivos temporários" })).toBe(true);
    expect(aprovacaoPerigosa({ description: "Fazer o pagamento da fatura" })).toBe(true);
  });

  it("o simples roda sem perguntar", () => {
    for (const command of [
      "Get-Process | Sort-Object CPU -Descending | Select-Object -First 5",
      "dir C:\\Users\\x\\Downloads",
      "python -c \"print(2+2)\"",
      "Start-Process https://www.youtube.com",
      "Get-ChildItem -Recurse -Filter *.pdf",
      "git status",
      "ipconfig /all",
    ]) expect(aprovacaoPerigosa({ command }), command).toBe(false);
    expect(aprovacaoPerigosa({ description: "Listar as janelas abertas", command: "Get-Process" })).toBe(false);
  });
});
