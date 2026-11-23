/**
 * O tempo MEDIDO (23/11). A previsão errava a temperatura do dia em 2° ("máxima 29" com 31 medidos
 * a 14 km dali): ela é só conta de modelo. As estações dos aeroportos publicam o que está acontecendo
 * (METAR, de hora em hora ou a cada mudança), sem chave. A previsão continua para o futuro, corrigida
 * pelo que foi medido agora. Para fora vai só um quadrado de ~120 km em volta da cidade.
 */

export interface Leitura { em: number; temp: number; orvalho?: number; ventoKmh?: number; tempo: string; nuvens: string }
export interface Estacao { id: string; km: number; leituras: Leitura[] }
export interface Medido { temp: number; max: number; min: number; umidade?: number; ventoKmh?: number; ceu?: { descricao: string; icone: string; chuva: boolean } }

const RAIO_KM = 45;
/** Dentro disto a estação mais perto fala sozinha; mais longe, as de em volta se misturam. */
const PERTO_KM = 20;
const VELHA_MS = 90 * 60_000;

/** Distância em km (a Terra plana de um quarteirão serve). Pura. */
export function distanciaKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const x = (bLon - aLon) * Math.cos(((aLat + bLat) / 2) * Math.PI / 180), y = bLat - aLat;
  return Math.hypot(x, y) * 111.2;
}

/** O céu da estação em português: o fenômeno manda; sem ele, as nuvens. Pura. */
export function ceuDe(tempo: string, nuvens: string): { descricao: string; icone: string; chuva: boolean } | undefined {
  const w = ` ${tempo.toUpperCase()} `;
  if (/TS/.test(w)) return { descricao: "tempestade", icone: "zap", chuva: true };
  if (/SN|SG|PL/.test(w)) return { descricao: "neve", icone: "cloud", chuva: true };
  if (/SHRA/.test(w)) return { descricao: "pancadas de chuva", icone: "droplet", chuva: true };
  if (/RA/.test(w)) return { descricao: /-\w*RA/.test(w) ? "chuva fraca" : /\+\w*RA/.test(w) ? "chuva forte" : "chuva", icone: "droplet", chuva: true };
  if (/DZ/.test(w)) return { descricao: "garoa", icone: "droplet", chuva: true };
  if (/FG|BR|HZ|FU/.test(w)) return { descricao: "neblina", icone: "cloud", chuva: false };
  if (/^(CLR|SKC|NSC|NCD|CAVOK)$/.test(nuvens)) return { descricao: "céu limpo", icone: "sun", chuva: false };
  if (nuvens === "FEW") return { descricao: "poucas nuvens", icone: "sun", chuva: false };
  if (/^(SCT|BKN|OVC|OVX)$/.test(nuvens)) return { descricao: "nublado", icone: "cloud", chuva: false };
  return undefined;
}

/** Umidade relativa (%) pela temperatura e o ponto de orvalho (Magnus). Pura. */
export function umidadeDe(temp: number, orvalho: number): number {
  const e = (t: number) => Math.exp((17.625 * t) / (243.04 + t));
  return Math.round(Math.max(0, Math.min(100, (100 * e(orvalho)) / e(temp))));
}

type Cru = Record<string, unknown>;
/** As estações em volta, com as leituras da mais nova à mais velha. Pura. */
export function lerEstacoes(linhas: Cru[], lat: number, lon: number): Estacao[] {
  const por = new Map<string, Estacao>();
  for (const m of linhas) {
    const id = String(m.icaoId ?? ""), temp = m.temp, em = Number(m.obsTime) * 1000;
    if (!id || typeof temp !== "number" || !(em > 0) || typeof m.lat !== "number" || typeof m.lon !== "number") continue;
    const km = distanciaKm(lat, lon, m.lat, m.lon);
    if (km > RAIO_KM) continue;
    const est = por.get(id) ?? { id, km, leituras: [] };
    est.leituras.push({
      em, temp, tempo: String(m.wxString ?? ""), nuvens: String(m.cover ?? ""),
      ...(typeof m.dewp === "number" ? { orvalho: m.dewp } : {}),
      ...(typeof m.wspd === "number" ? { ventoKmh: Math.round(m.wspd * 1.852) } : {}),
    });
    por.set(id, est);
  }
  for (const est of por.values()) est.leituras.sort((a, b) => b.em - a.em);
  return [...por.values()].sort((a, b) => a.km - b.km);
}

/** O que foi medido: agora, e a máxima e a mínima desde `inicioDoDia`. null = nenhuma estação fresca. Pura. */
export function medir(estacoes: Estacao[], inicioDoDia: number, agora: number): Medido | null {
  const frescas = estacoes.filter((e) => e.leituras.length && agora - e.leituras[0].em <= VELHA_MS);
  if (!frescas.length) return null;
  const usadas = frescas[0].km <= PERTO_KM ? [frescas[0]] : frescas.slice(0, 4);
  const media = (valor: (e: Estacao) => number) => {
    let soma = 0, pesos = 0;
    for (const e of usadas) { const p = 1 / (e.km ** 2 + 25); soma += valor(e) * p; pesos += p; }
    return soma / pesos;
  };
  const deHoje = (e: Estacao) => e.leituras.filter((l) => l.em >= inicioDoDia).map((l) => l.temp).concat(e.leituras[0].temp);
  const nova = usadas[0].leituras[0];
  return {
    temp: media((e) => e.leituras[0].temp),
    max: media((e) => Math.max(...deHoje(e))),
    min: media((e) => Math.min(...deHoje(e))),
    ...(nova.orvalho !== undefined ? { umidade: umidadeDe(nova.temp, nova.orvalho) } : {}),
    ...(nova.ventoKmh !== undefined ? { ventoKmh: nova.ventoKmh } : {}),
    ...(usadas[0].km <= 30 ? { ceu: ceuDe(nova.tempo, nova.nuvens) } : {}),
  };
}

/** Quanto do erro de agora ainda vale daqui a `horas`: metade em 3 h. Pura. */
export function correcaoEm(erro: number, horas: number): number {
  return erro * 0.5 ** (Math.max(0, horas) / 3);
}

/** Busca as leituras das últimas 24 h em volta. Falhou: lista vazia (fica só a previsão). */
export async function buscarEstacoes(lat: number, lon: number): Promise<Estacao[]> {
  const a = (v: number) => v.toFixed(1), folga = 0.55;
  const url = `https://aviationweather.gov/api/data/metar?format=json&hours=24&bbox=${a(lat - folga)},${a(lon - folga)},${a(lat + folga)},${a(lon + folga)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    // Sem estação por perto a API responde 204, sem corpo.
    if (!r.ok || r.status === 204) return [];
    const j = await r.json() as unknown;
    return Array.isArray(j) ? lerEstacoes(j as Cru[], lat, lon) : [];
  } catch { return []; }
}
