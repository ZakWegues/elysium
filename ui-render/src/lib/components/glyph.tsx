"use client";

import { ICONES } from "./icones";

/**
 * "MapPin", "map_pin" and "map pin" all mean the lucide icon "map-pin". ELYSIUM: only the
 * curated set in icones.ts (generated) ships; an unknown name falls back to a neutral dot
 * instead of the whole lucide catalogue.
 */
function iconName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
  return name || null;
}

/** A lucide icon from the curated set; unknown names render a small dot. */
export function Glyph({ name, size = 18, className }: { name: unknown; size?: number; className?: string }) {
  const key = iconName(name);
  if (!key) return null;
  const Icone = ICONES[key] ?? ICONES["circle"];
  return <Icone size={size} strokeWidth={1.8} aria-hidden className={className} />;
}

/** Os nomes que existem, para o prompt da Ely listar (Fase 2). */
export const NOMES_DE_ICONES = Object.keys(ICONES);
