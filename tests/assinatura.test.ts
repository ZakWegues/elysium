import { describe, expect, it, vi } from "vitest";
import { assinar, JANELA_S, NoncesVistos, verificarAssinatura } from "../src/services/assinatura";

vi.mock("electron-store", () => ({ default: class { get() { return false; } set() {} } }));

const TOKEN = "a".repeat(64);
const agora = 1_900_000_000;
const cab = (s: number, n: string, metodo = "POST", caminho = "/api/rpc") => `v1:${s}:${n}:${assinar(TOKEN, metodo, caminho, s, n)}`;

describe("pedido assinado (31/10)", () => {
  it("aceita a assinatura certa e recusa o mesmo nonce de novo", () => {
    const v = new NoncesVistos();
    expect(verificarAssinatura(cab(agora, "abcdef123456"), "POST", "/api/rpc", TOKEN, agora, v)).toEqual({ ok: true });
    expect(verificarAssinatura(cab(agora, "abcdef123456"), "POST", "/api/rpc", TOKEN, agora, v)).toEqual({ ok: false, motivo: "repetido" });
  });
  it("recusa outro caminho, outro método, outro token e relógio fora da janela", () => {
    const v = new NoncesVistos();
    expect(verificarAssinatura(cab(agora, "nonce0001"), "POST", "/api/command", TOKEN, agora, v).ok).toBe(false);
    expect(verificarAssinatura(cab(agora, "nonce0002"), "GET", "/api/rpc", TOKEN, agora, v).ok).toBe(false);
    expect(verificarAssinatura(cab(agora, "nonce0003"), "POST", "/api/rpc", "b".repeat(64), agora, v).ok).toBe(false);
    expect(verificarAssinatura(cab(agora - JANELA_S - 5, "nonce0004"), "POST", "/api/rpc", TOKEN, agora, v)).toEqual({ ok: false, motivo: "relógio" });
  });
  it("recusa formato quebrado e cabeçalho vazio sem lançar", () => {
    const v = new NoncesVistos();
    for (const c of [undefined, "", "v1:abc", `v2:${agora}:nonce0005:${"0".repeat(64)}`, `v1:${agora}:x:${"0".repeat(64)}`]) {
      expect(verificarAssinatura(c, "GET", "/", TOKEN, agora, v).ok).toBe(false);
    }
  });
  it("nonces têm teto e os antigos expiram", () => {
    const v = new NoncesVistos(3);
    for (const n of ["n1aaaaaa", "n2aaaaaa", "n3aaaaaa", "n4aaaaaa"]) expect(v.registrar(n, agora)).toBe(true);
    expect(v.registrar("n1aaaaaa", agora)).toBe(true); // saiu pelo teto
    expect(v.registrar("n4aaaaaa", agora + JANELA_S * 3)).toBe(true); // expirou
  });
});

describe("Bearer só onde o caminho é protegido", async () => {
  const { bearerPermitido } = await import("../src/services/server");
  it("antes do celular novo, vale em qualquer lugar; depois, só local e Tailscale", () => {
    expect(bearerPermitido("192.168.0.10", false)).toBe(true);
    expect(bearerPermitido("192.168.0.10", true)).toBe(false);
    expect(bearerPermitido("::ffff:192.168.0.10", true)).toBe(false);
    expect(bearerPermitido("127.0.0.1", true)).toBe(true);
    expect(bearerPermitido("::1", true)).toBe(true);
    expect(bearerPermitido("100.101.5.7", true)).toBe(true);
    expect(bearerPermitido("100.20.5.7", true)).toBe(false);
    expect(bearerPermitido("fd7a:115c:a1e0::1", true)).toBe(true);
  });
});
