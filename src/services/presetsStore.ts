import Store from "electron-store";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BrainAction } from "./brain";

export interface PresetEntry {
  description: string;
  icon?: string;
  actions: BrainAction[];
}

export type PresetsMap = Record<string, PresetEntry>;

const store = new Store<{ presets: PresetsMap }>({
  name: "presets",
  defaults: { presets: {} },
});

function seedFromStaticFile(): PresetsMap {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, "../config/presets.json"), "utf-8")
    ) as PresetsMap;
  } catch {
    return {};
  }
}

// First run: seed the store from the versioned presets.json once.
// After this, the static file is never touched again — surviving `npm run build`.
if (Object.keys(store.get("presets")).length === 0) {
  const seed = seedFromStaticFile();
  if (Object.keys(seed).length > 0) store.set("presets", seed);
}

export function getAllPresets(): PresetsMap {
  return store.get("presets");
}

export function findPresetKey(nameOrQuery: string): string | undefined {
  const name = nameOrQuery.toLowerCase().trim();
  const presets = getAllPresets();
  return Object.keys(presets).find(
    (k) => k === name || k.includes(name) || name.includes(k)
  );
}

export function getPreset(nameOrQuery: string): PresetEntry | undefined {
  const key = findPresetKey(nameOrQuery);
  return key ? getAllPresets()[key] : undefined;
}

export function savePreset(key: string, entry: PresetEntry): void {
  const presets = getAllPresets();
  presets[key] = entry;
  store.set("presets", presets);
}

export function deletePresetByKey(key: string): void {
  const presets = getAllPresets();
  delete presets[key];
  store.set("presets", presets);
}
