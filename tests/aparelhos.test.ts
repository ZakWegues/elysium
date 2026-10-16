import { describe, expect, it } from "vitest";
import { ipDe, tipoDeCliente } from "../src/services/aparelhos";

describe("aparelhos que usaram o token (bloco 98)", () => {
  it("dá nome ao cliente pelo user-agent", () => {
    expect(tipoDeCliente("okhttp/4.12.0")).toBe("ELYSIUM-M (Android)");
    expect(tipoDeCliente("node")).toBe("script (Node)");
    expect(tipoDeCliente("curl/8.4.0")).toBe("linha de comando");
    expect(tipoDeCliente(undefined)).toBe("desconhecido");
  });

  it("normaliza o endereço (IPv4 mapeado e loopback IPv6)", () => {
    const req = (ip: string) => ({ socket: { remoteAddress: ip } }) as never;
    expect(ipDe(req("::ffff:192.168.0.29"))).toBe("192.168.0.29");
    expect(ipDe(req("::1"))).toBe("127.0.0.1");
  });
});
