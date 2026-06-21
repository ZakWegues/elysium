import { rmSync } from "node:fs";

// Limpa a pasta de build antes de recompilar.
try {
  rmSync("dist", { recursive: true, force: true });
} catch {
  // ignora se já não existir
}
