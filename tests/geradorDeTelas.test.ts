import { describe, expect, it, vi } from "vitest";

const abertas: string[] = [];
const fechadas: string[] = [];
let semResposta = new Set<string>();
vi.mock("../src/main/config", () => ({ getConfig: () => ({ cerebro: "hermes" }), getGeminiKey: () => "" }));
vi.mock("../src/services/llm", () => ({ callChat: async () => "" }));
vi.mock("../src/services/hermes/cerebro", () => ({
  hermesPronto: () => true,
  abrirSessaoDeTela: async ({ modelo }: { modelo: string }) => {
    abertas.push(modelo);
    return {
      turno: async (texto: string) => (semResposta.has(modelo) ? null : { texto: texto.includes("---") ? "com-sistema" : "sem-sistema", modelo }),
      fechar: () => { fechadas.push(modelo); },
    };
  },
}));

describe("troca de modelo das telas pelo nosso lado (22/10)", async () => {
  const { geradorDeTelas, MODELOS_HERMES_TELAS } = await import("../src/services/geradorDeTelas");

  it("1º modelo sem resposta → o próximo da lista, com o prompt das telas de novo", async () => {
    abertas.length = 0; fechadas.length = 0;
    semResposta = new Set([MODELOS_HERMES_TELAS[0]]);
    const c = (await geradorDeTelas()!("SISTEMA"))!;
    const r = await c.enviar("pedido");
    expect(abertas).toEqual([MODELOS_HERMES_TELAS[0], MODELOS_HERMES_TELAS[1]]);
    expect(r).toEqual({ texto: "com-sistema", provedor: "hermes", modelo: MODELOS_HERMES_TELAS[1] });
    // A correção segue na mesma sessão, sem o prompt das telas.
    expect((await c.enviar("corrige"))?.texto).toBe("sem-sistema");
    c.fechar();
    expect(fechadas).toEqual([MODELOS_HERMES_TELAS[0], MODELOS_HERMES_TELAS[1]]);
  });

  it("todos sem resposta → null; modelo fixado pela bancada não troca", async () => {
    semResposta = new Set(MODELOS_HERMES_TELAS);
    expect(await (await geradorDeTelas()!("S"))!.enviar("p")).toBeNull();
    abertas.length = 0;
    semResposta = new Set(["x/y:free"]);
    expect(await (await geradorDeTelas("hermes", "x/y:free")!("S"))!.enviar("p")).toBeNull();
    expect(abertas).toEqual(["x/y:free"]);
  });
});
