import { defineConfig } from "vitest/config";

// Datas formatam no fuso de quem vê; os testes fixam UTC.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts", "tests/**/*.test.ts"], env: { TZ: "UTC" }, css: false },
});
