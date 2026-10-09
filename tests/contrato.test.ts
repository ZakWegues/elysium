import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { listRpcMethods } from "../src/services/rpc";

/**
 * O contrato RPC com o celular (fase 20, bloco 204).
 *
 * O `contracts/rpc-methods.json` é a lista de métodos e de quais pedem confirmação. O
 * ELYSIUM-M copia o arquivo e o teste de lá confere os tipos e a trava dele contra esta
 * lista — foi assim que se achou o celular sem `episodios.delete` e `listas.delete` na trava.
 *
 * Mudou método no `rpc.ts`? `ATUALIZAR_CONTRATO=1 npx vitest run tests/contrato.test.ts` e
 * copie o arquivo para `elysium-m/contracts/`.
 */
const ARQUIVO = path.join(__dirname, "..", "contracts", "rpc-methods.json");

describe("contrato RPC (bloco 204)", () => {
  it("o arquivo do contrato está em dia com o rpc.ts", () => {
    const atual = JSON.stringify({ metodos: listRpcMethods() }, null, 2) + "\n";
    if (process.env.ATUALIZAR_CONTRATO === "1") fs.writeFileSync(ARQUIVO, atual);
    expect(fs.existsSync(ARQUIVO), "rode com ATUALIZAR_CONTRATO=1").toBe(true);
    // Sem CRLF: no Windows o checkout do git troca as quebras de linha (core.autocrlf).
    expect(fs.readFileSync(ARQUIVO, "utf8").replace(/\r\n/g, "\n")).toBe(atual);
  });

  it("apagar e matar sempre pedem confirmação", () => {
    for (const m of listRpcMethods()) {
      // `listas.remove` tira UM item da lista (desfaz-se pondo de novo): fica fora da trava.
      if (m.method === "listas.remove") continue;
      if (/\.(delete|remove|killProcess|clean|install)$/.test(m.method)) expect(m.destructive, m.method).toBe(true);
    }
  });
});
