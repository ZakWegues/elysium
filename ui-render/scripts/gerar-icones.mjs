// Gera src/lib/components/icones.ts: só os ícones que as telas usam de verdade, importados um a
// um (o DynamicIcon do lucide puxava os ~1900 para o bundle). Rodar quando a lista mudar:
//   node scripts/gerar-icones.mjs
import fs from "node:fs";
import { createRequire } from "node:module";

const lucide = createRequire(import.meta.url)("lucide-react");
const LISTA = `
alert-triangle alert-circle arrow-left arrow-right arrow-up arrow-down at-sign award baby backpack bed bean bell bike bold book book-open
bookmark bot brain briefcase bus cake calculator calendar calendar-check calendar-days calendar-plus camera car carrot chart-bar chart-line
chart-pie check check-circle chef-hat chevron-down chevron-left chevron-right chevron-up circle clipboard-list clock cloud cloud-rain
coffee coins compass copy cpu credit-card currency dices dollar-sign donut download droplet dumbbell egg equal external-link eye file
file-text film filter flag flame flask-conical flower folder footprints fuel gamepad-2 ghost gift glasses globe graduation-cap hand
hard-drive headphones heart heart-pulse home hospital hotel hourglass image images info key landmark languages laptop layout leaf
leafy-green library lightbulb link list list-checks lock mail map map-pin medal message-circle mic minus monitor moon mountain
mouse-pointer-click music navigation newspaper notebook-pen origami package palette paw-print party-popper pause pen-line percent phone
piggy-bank pill pizza plane play plus receipt route rotate-ccw ruler salad save school scissors search send settings share shield
shield-check ship shirt shopping-bag shopping-cart shuffle smile snowflake sparkles sprout star stethoscope store sun sunrise sunset
table tag target tent text thermometer thumbs-up ticket timer train trash-2 tree-pine trending-down trending-up trophy truck tv umbrella
user user-plus users utensils video wallet watch waves wifi wind wine wrench x zap
`.trim().split(/\s+/);

const pascal = (n) => n.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const ok = [], faltam = [];
for (const n of [...new Set(LISTA)].sort()) (lucide[pascal(n)] ? ok : faltam).push(n);
if (faltam.length) console.warn("sem ícone no lucide:", faltam.join(", "));

const linhas = [
  "// Gerado por scripts/gerar-icones.mjs — não editar à mão.",
  `import { ${ok.map(pascal).join(", ")} } from "lucide-react";`,
  'import type { LucideIcon } from "lucide-react";',
  "",
  "export const ICONES: Record<string, LucideIcon> = {",
  ...ok.map((n) => `  "${n}": ${pascal(n)},`),
  "};",
  "",
];
fs.writeFileSync(new URL("../src/lib/components/icones.ts", import.meta.url), linhas.join("\n"));
console.log(`${ok.length} ícones`);
