import { describe, expect, it } from "vitest";
import { mascarar } from "../src/main/logArquivo";

describe("log em arquivo — mascarar segredos (bloco 97)", () => {
  it("esconde chave da Groq, tokens de 64 hex e Bearer", () => {
    const token = "a".repeat(32) + "0123456789abcdef0123456789abcdef";
    const s = mascarar(`chave gsk_AbCdEf1234567890XYZ token ${token} header Bearer abcdefghijklmnop.qrs`);
    expect(s).not.toMatch(/gsk_AbCd/);
    expect(s).not.toContain(token);
    expect(s).not.toMatch(/abcdefghijklmnop/);
    expect(s).toContain("gsk_[oculto]");
    expect(s).toContain("[token oculto]");
  });

  it("não mexe em texto comum nem em números curtos", () => {
    expect(mascarar("RAM 65% (10.3 de 15.9 GB) · pid 4821")).toBe("RAM 65% (10.3 de 15.9 GB) · pid 4821");
  });
});
