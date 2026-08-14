import Store from "electron-store";

export type AnomalyType = "ram_high" | "cpu_sustained" | "spike";

export interface AnomalyEntry {
  timestamp: number;
  type: AnomalyType;
  value: number;
  topProcess?: string;
  details: string;
}

interface TelemetryLogSchema {
  anomalies: AnomalyEntry[];
}

const store = new Store<TelemetryLogSchema>({
  name: "elysium-telemetry-log",
  defaults: { anomalies: [] },
});

const MAX_ENTRIES = 500;
const MAX_AGE_MS  = 24 * 60 * 60 * 1_000; // 24 h

function prune(entries: AnomalyEntry[]): AnomalyEntry[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  const recent = entries.filter(a => a.timestamp >= cutoff);
  return recent.length > MAX_ENTRIES ? recent.slice(-MAX_ENTRIES) : recent;
}

export function logAnomaly(entry: Omit<AnomalyEntry, "timestamp">): void {
  const current = store.get("anomalies");
  store.set("anomalies", prune([...current, { ...entry, timestamp: Date.now() }]));
}

export function getAnomalyHistory(): AnomalyEntry[] {
  return prune(store.get("anomalies"));
}

export function getInsights(): string[] {
  const history = getAnomalyHistory();
  const insights: string[] = [];

  // RAM culprits: count per process
  const ramMap: Record<string, number> = {};
  history.filter(a => a.type === "ram_high" && a.topProcess).forEach(a => {
    ramMap[a.topProcess!] = (ramMap[a.topProcess!] ?? 0) + 1;
  });
  Object.entries(ramMap)
    .sort((a, b) => b[1] - a[1])
    .forEach(([proc, count]) => {
      if (count >= 2) {
        insights.push(`${proc} causou ${count} pico(s) de RAM hoje. Considere fechar ou reiniciar.`);
      }
    });

  // CPU sustained events
  const cpuCount = history.filter(a => a.type === "cpu_sustained").length;
  if (cpuCount >= 3) {
    insights.push(`CPU em carga alta detectada ${cpuCount}× nas últimas 24 h. Verifique processos em segundo plano.`);
  }

  // Recent spikes (last 10 min)
  const spikes10m = history.filter(a => a.type === "spike" && a.timestamp > Date.now() - 10 * 60_000);
  if (spikes10m.length >= 2) {
    insights.push(`${spikes10m.length} picos de performance nos últimos 10 min. Sistema sob estresse.`);
  }

  return insights;
}
