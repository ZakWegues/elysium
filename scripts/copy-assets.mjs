import { cpSync, mkdirSync, existsSync } from "node:fs";

// O tsc só compila .ts. Aqui copiamos os assets estáticos (HTML, JSON)
// para dentro de dist/ preservando a estrutura usada em runtime.

mkdirSync("dist/config", { recursive: true });
mkdirSync("dist/renderer", { recursive: true });

// Mapa de programas -> comando/caminho
cpSync("src/config/apps.json", "dist/config/apps.json");

// Presets de comandos encadeados
cpSync("src/config/presets.json", "dist/config/presets.json");

// Jogos e programas que disputam VRAM com o modelo local (gpuGuard.ts). Faltou aqui desde o
// bloco 14: nenhum build tinha a lista, e o guarda seguia "sem lista" em silêncio — o modelo
// local carregava na GPU com jogo aberto. Descoberto no log em 29/09/2026.
cpSync("src/config/gpu-heavy.json", "dist/config/gpu-heavy.json");

// Config padrão (atalho, autostart, etc.)
if (existsSync("config.json")) {
  cpSync("config.json", "dist/config.json");
}

// HTML das janelas
cpSync("src/renderer/config.html",       "dist/renderer/config.html");
cpSync("src/renderer/recorder.html",     "dist/renderer/recorder.html");
cpSync("src/renderer/dashboard.html",    "dist/renderer/dashboard.html");
// O CSS e o JS do dashboard moram em pasta própria desde o bloco 76.
cpSync("src/renderer/dashboard", "dist/renderer/dashboard", { recursive: true });

console.log("Assets copiados para dist/");
