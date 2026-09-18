import { defineConfig } from "vitest/config";

// Só a lógica pura entra aqui: rotas, agendamento, parse, clima. Nada de janela.
// `tests/` fica fora do `include` do tsconfig de propósito — o tsc do build não compila
// testes, o vitest compila por conta própria (esbuild).
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    environment: "node",
    clearMocks: true,
  },
});
