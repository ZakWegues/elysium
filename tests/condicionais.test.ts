import { describe, expect, it } from "vitest";
import { pedidoFecharSeAberto, pedidoPausarSeTocando } from "../src/services/condicionais";
import { closeAppIfOpen } from "../src/actions/closeApp";

describe("condicionais sem modelo (fase 18)", () => {
  it("se X estiver aberto, fecha", () => {
    expect(pedidoFecharSeAberto("se o chrome estiver aberto, fecha ele")).toBe("chrome");
    expect(pedidoFecharSeAberto("Se a calculadora estiver aberta, fecha ela.")).toBe("calculadora");
    expect(pedidoFecharSeAberto("se o vs code tiver aberto fecha")).toBe("vs code");
    expect(pedidoFecharSeAberto("fecha o chrome")).toBeNull();
    expect(pedidoFecharSeAberto("se chover amanhã, me avisa")).toBeNull();
  });
  it("se estiver tocando, pausa", () => {
    expect(pedidoPausarSeTocando("se estiver tocando alguma coisa, pausa")).toBe("pause");
    expect(pedidoPausarSeTocando("se tiver tocando música, para")).toBe("pause");
    expect(pedidoPausarSeTocando("pausa a música")).toBeNull();
  });
  it("fechar só se aberto: não aberto não faz nada", async () => {
    expect(await closeAppIfOpen("calculadora", [{ name: "chrome" }])).toMatch(/não está aberto/);
  });
});
