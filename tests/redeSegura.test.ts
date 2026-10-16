import { describe, expect, it } from "vitest";
import { enderecoPermitido, hostPermitido } from "../src/services/redeSegura";

describe("origem do socket (fase 23.2)", () => {
  it("aceita loopback, rede privada, CGNAT e link-local", () => {
    for (const ok of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "10.1.2.3", "172.16.0.9", "172.31.255.1", "192.168.0.10", "::ffff:192.168.1.5", "100.64.0.1", "100.127.9.9", "169.254.1.1", "fe80::1", "fd7a:115c:a1e0::1"]) {
      expect(enderecoPermitido(ok), ok).toBe(true);
    }
  });
  it("recusa a internet", () => {
    for (const ruim of ["8.8.8.8", "172.32.0.1", "100.128.0.1", "192.169.0.1", "::ffff:1.1.1.1", "2001:4860::8888", undefined, "", "999.1.1.1"]) {
      expect(enderecoPermitido(ruim as string), String(ruim)).toBe(false);
    }
  });
});

describe("cabeçalho Host contra DNS rebinding", () => {
  it("aceita IP, localhost, o nome do PC e Tailscale", () => {
    for (const ok of ["127.0.0.1:4200", "192.168.0.10:4200", "localhost:4200", "[::1]:4200", "MEU-PC:4200", "meu-pc.local", "pc.tail1234.ts.net"]) {
      expect(hostPermitido(ok, "meu-pc"), ok).toBe(true);
    }
  });
  it("recusa domínio de fora e Host vazio", () => {
    for (const ruim of ["mal.example:4200", "127.0.0.1.mal.example", "localhost.mal.example", "", undefined, "[zz]:1"]) {
      expect(hostPermitido(ruim as string, "meu-pc"), String(ruim)).toBe(false);
    }
  });
});

describe("token do MCP fora dos logs", () => {
  it("mascara /mcp/<token> em qualquer texto", async () => {
    const { mascararTokenMcp } = await import("../src/services/hermes/processo");
    expect(mascararTokenMcp('config set mcp_servers.elysium.url http://127.0.0.1:4200/mcp/abcDEF_123-x falhou')).toBe("config set mcp_servers.elysium.url http://127.0.0.1:4200/mcp/*** falhou");
  });
});
