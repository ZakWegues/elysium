// dashboard/js/temas-paleta.js — a tabela THEMES (saiu de temas.js em 12/11).
//
// Script clássico, sem DOM: carregado pelo dashboard (antes de temas.js) e pela Ely flutuante
// (flutuante.html), que pinta a bolinha e os cartões com as cores do tema ativo.

/**
 * 30/10 — três estilos, cada um em três cores, iguais aos do celular:
 *
 *   Dark  → a noite do ELYSIUM (vidro escuro, aurora, manchas, feixes de luz)
 *   Glass → a mesma base com vidro de verdade sobre manchas fortes (`theme-gl`, css/design.css)
 *   Stark → o HUD (`theme-stark`, css/stark.css)
 *
 * Todos são da família "ely" (a base escura de base.css/rich.css). Vidro Líquido claro,
 * Renascença e Minimal saíram com o CSS deles; quem tinha um deles gravado cai no Dark.
 *
 * As variáveis continuam se chamando `--purple` e `--cyan` mesmo valendo ouro e éter.
 * `shaft` é a cor dos feixes de luz; `blobs`, as três manchas do fundo.
 */
const THEMES = {
  "dark-elisio":     { name: "Campos Elísios", grupo: "dark", family: "ely", purple: "#d9b168", purpleBright: "#f2d49b", cyan: "#9fd8cf", cyanDark: "#6fb3a9", bg: "#0a0c14", surface: "#131726", surface2: "#0e1220", glassInk: "16,21,36", blobs: ["#8a6a2e", "#2f5d57", "#4a3f6b"], shaft: "#d9b168" },
  "dark-mare":       { name: "Éter",           grupo: "dark", family: "ely", purple: "#a8c4d8", purpleBright: "#d3e4f0", cyan: "#7fd4c8", cyanDark: "#4fa89c", bg: "#080b12", surface: "#111624", surface2: "#0c101c", glassInk: "15,21,34", blobs: ["#33506b", "#2b5f59", "#3a4560"], shaft: "#a8c4d8" },
  "dark-crepusculo": { name: "Crepúsculo",     grupo: "dark", family: "ely", purple: "#f0a850", purpleBright: "#ffc47a", cyan: "#e07a9b", cyanDark: "#b85e7c", bg: "#0b0818", surface: "#171232", surface2: "#110d26", glassInk: "26,18,48", blobs: ["#7a4520", "#6b2f47", "#3b2a6b"], shaft: "#f0a850" },

  "glass-elisio":     { name: "Âmbar",      grupo: "glass", family: "ely", gl: true, purple: "#f0a060", purpleBright: "#ffc08a", cyan: "#f2c14e", cyanDark: "#c99a2e", bg: "#120905", surface: "#22140c", surface2: "#1a0f09", glassInk: "34,20,12", blobs: ["#d2692e", "#c9971f", "#a8326e"] },
  "glass-mare":       { name: "Maré",       grupo: "glass", family: "ely", gl: true, purple: "#6cb6ff", purpleBright: "#a5d2ff", cyan: "#3fe0c8", cyanDark: "#25b39f", bg: "#040d1a", surface: "#0c1a2e", surface2: "#081424", glassInk: "12,26,46", blobs: ["#1e7fd4", "#17b8a6", "#4b4bd8"] },
  "glass-crepusculo": { name: "Crepúsculo", grupo: "glass", family: "ely", gl: true, purple: "#a58cff", purpleBright: "#c9baff", cyan: "#4fd6e8", cyanDark: "#2fb0c2", bg: "#0a0720", surface: "#171236", surface2: "#110d2a", glassInk: "23,18,54", blobs: ["#6d4aff", "#22b8cf", "#c04bd8"] },

  // Stark (fase 16): "purple" é o acento principal (o azul do reator); "cyan", o âmbar dos detalhes.
  stark:         { name: "Reator", grupo: "stark", family: "ely", stark: true, purple: "#3cc8f0", purpleBright: "#8ee6ff", cyan: "#ffb547", cyanDark: "#d98f2b", bg: "#05080f", surface: "#0b1220", surface2: "#08101b", glassInk: "10,18,32", blobs: ["#0f3a52", "#123047", "#3a2a12"], shaft: "#3cc8f0" },
  "stark-mark":  { name: "Mark",   grupo: "stark", family: "ely", stark: true, purple: "#ff5a4e", purpleBright: "#ff9183", cyan: "#ffc857", cyanDark: "#d9a43a", bg: "#0b0607", surface: "#170c0e", surface2: "#120909", glassInk: "28,12,14", blobs: ["#5a1414", "#5a4214", "#2a1010"], shaft: "#ff5a4e" },
  "stark-noite": { name: "Noite",  grupo: "stark", family: "ely", stark: true, purple: "#7fb8d8", purpleBright: "#cfeaff", cyan: "#64ffda", cyanDark: "#3fcfae", bg: "#03050a", surface: "#0a0f18", surface2: "#070b12", glassInk: "8,13,22", blobs: ["#1a2a3a", "#123a35", "#20283a"], shaft: "#7fb8d8" },
};
