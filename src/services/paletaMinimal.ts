/**
 * Tema Minimal (20/10, pedido do Zak: "100% minimalista, seguindo a cor padrão do dispositivo").
 *
 * Claro ou escuro conforme o Windows, superfícies neutras e um acento só: a cor de destaque do
 * sistema (Configurações → Personalização → Cores). Sem vidro, manchas, feixes ou ornamentos — o
 * CSS disso fica em `css/minimal.css`. Aqui só a conta das cores, para o dashboard aplicar com
 * `applyTheme`. Pura.
 */

export interface PaletaMinimal {
  family: "lg" | "ely";
  purple: string;
  purpleBright: string;
  cyan: string;
  cyanDark: string;
  bg: string;
  surface: string;
  surface2: string;
  glassInk: string;
}

/** "0078d4ff" (o formato do `getAccentColor`) ou "#0078d4" → "#0078d4"; inválido → null. Pura. */
export function hexDoDestaque(bruto: unknown): string | null {
  const m = /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(String(bruto ?? "").trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

function canais(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function paraHex(c: number[]): string {
  return `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** Mistura `a` com `b` (0 = só a, 1 = só b). Pura. */
export function misturar(a: string, b: string, t: number): string {
  const x = canais(a), y = canais(b);
  return paraHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** Luminância relativa (WCAG). Pura. */
export function luminancia(hex: string): number {
  const [r, g, b] = canais(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre duas cores. Pura. */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Azul padrão do Windows, para quando o sistema não informa a cor. */
export const DESTAQUE_PADRAO = "#0078d4";

/**
 * A paleta do Minimal. O destaque é empurrado para clarear (fundo escuro) ou escurecer (fundo
 * claro) até ler bem sobre o fundo — um amarelo de destaque num fundo branco sumiria. Pura.
 */
export function paletaMinimal(escuro: boolean, destaqueBruto?: unknown): PaletaMinimal {
  const destaque = hexDoDestaque(destaqueBruto) ?? DESTAQUE_PADRAO;
  const bg = escuro ? "#101012" : "#ffffff";
  let acento = destaque;
  for (let i = 0; i < 10 && contraste(acento, bg) < 3; i++) acento = misturar(acento, escuro ? "#ffffff" : "#000000", 0.15);
  return {
    family: escuro ? "ely" : "lg",
    purple: acento,
    purpleBright: misturar(acento, escuro ? "#ffffff" : "#000000", 0.18),
    cyan: escuro ? "#a1a1aa" : "#52525b",
    cyanDark: escuro ? "#71717a" : "#3f3f46",
    bg,
    surface: escuro ? "#18181b" : "#f6f6f7",
    surface2: escuro ? "#141416" : "#efeff1",
    glassInk: escuro ? "24,24,27" : "246,246,247",
  };
}
