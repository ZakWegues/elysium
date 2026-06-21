import { shell } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import { spawn } from "node:child_process";
import { appNotFoundError } from "../services/errors";

type AppMap = Record<string, string>;

let appsMap: AppMap | null = null;

function loadAppsMap(): AppMap {
  if (appsMap) return appsMap;
  try {
    appsMap = JSON.parse(fs.readFileSync(path.join(__dirname, "../config/apps.json"), "utf-8")) as AppMap;
  } catch {
    appsMap = {};
  }
  return appsMap;
}

export async function openApp(appName: string): Promise<string> {
  const map = loadAppsMap();
  const key = appName.toLowerCase().trim();

  // Try exact match, then partial match
  const command = map[key] ?? findPartial(map, key) ?? null;

  try {
    await launch(command ?? appName);
    return `Abrindo ${appName}.`;
  } catch {
    throw appNotFoundError(appName);
  }
}

function findPartial(map: AppMap, key: string): string | null {
  for (const [k, v] of Object.entries(map)) {
    if (k.includes(key) || key.includes(k)) return v;
  }
  return null;
}

async function launch(command: string): Promise<void> {
  // Protocol handlers and URLs → shell.openExternal
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(command) || command.startsWith("https://") || command.startsWith("http://")) {
    await shell.openExternal(command);
    return;
  }

  // Single-word protocol like "spotify:" or "discord:"
  if (/^[a-z][a-z0-9+\-.]*:$/i.test(command)) {
    await shell.openExternal(command);
    return;
  }

  // Windows executable or app name → cmd /c start (respects App Paths registry)
  return new Promise<void>((resolve, reject) => {
    const child = spawn("cmd.exe", ["/c", "start", "", command], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", reject);
    child.unref();
    // Give Windows time to process; start exits fast even on success
    setTimeout(resolve, 500);
  });
}
