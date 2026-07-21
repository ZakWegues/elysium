import { cpSync, mkdirSync, existsSync } from "node:fs";

// O tsc só compila .ts. Aqui copiamos os assets estáticos (HTML, JSON)
// para dentro de dist/ preservando a estrutura usada em runtime.

mkdirSync("dist/config", { recursive: true });
mkdirSync("dist/renderer", { recursive: true });

// Mapa de programas -> comando/caminho
cpSync("src/config/apps.json", "dist/config/apps.json");

// Presets de comandos encadeados
cpSync("src/config/presets.json", "dist/config/presets.json");

// Config padrão (atalho, autostart, etc.)
if (existsSync("config.json")) {
  cpSync("config.json", "dist/config.json");
}

// HTML das janelas
cpSync("src/renderer/config.html",       "dist/renderer/config.html");
cpSync("src/renderer/recorder.html",     "dist/renderer/recorder.html");
cpSync("src/renderer/dashboard.html",    "dist/renderer/dashboard.html");

console.log("Assets copiados para dist/");
