/**
 * Clima pela Open-Meteo.
 *
 * POR QUE ESTA API
 *
 * Não exige chave, não exige cadastro e não exige SDK — é um GET e um JSON. O projeto
 * inteiro tem quatro dependências de produção (§1 do handoff) e essa regra não vale a
 * pena quebrar por uma temperatura na tela.
 *
 * PRIVACIDADE
 *
 * A cidade fica gravada no config, escolhida pelo usuário. Não há geolocalização do
 * sistema nem descoberta por IP: a única coisa que sai daqui é um par de coordenadas
 * arredondadas, e só quando o card ou uma bolha de sugestão pede.
 *
 * FALHA
 *
 * Sem rede, sem cidade configurada ou com a API fora do ar, isto devolve `null` e quem
 * chamou some com o card. Clima é enfeite: não pode segurar a tela Início, que é a
 * primeira coisa que aparece quando a janela abre.
 */

import { getConfig } from "../main/config";

export interface Clima {
  cidade: string;
  temperatura: number;
  max: number;
  min: number;
  descricao: string;
  /** Nome de ícone do sprite do dashboard, já resolvido aqui. */
  icone: string;
  chuvaHoje: boolean;
  /** Sensação térmica, umidade e vento — o card da Início ganhou espaço para eles (bloco 67). */
  sensacao?: number;
  umidade?: number;
  ventoKmh?: number;
  /** As próximas 6 horas cheias: hora local (0–23), temperatura e ícone. */
  horas?: { hora: number; temp: number; icone: string; chuva: boolean }[];
  /** Amanhã, só o resumo: máxima, mínima e ícone do dia. */
  amanha?: { max: number; min: number; icone: string };
}

/**
 * Tabela WMO reduzida ao que muda a decisão de quem lê. "Nuvens quebradas" e "nublado"
 * viram a mesma coisa de propósito: ninguém muda de plano por causa dessa diferença.
 */
function descreverWmo(codigo: number): { descricao: string; icone: string; chuva: boolean } {
  if (codigo === 0) return { descricao: "céu limpo", icone: "sun", chuva: false };
  if (codigo <= 3) return { descricao: "nublado", icone: "cloud", chuva: false };
  if (codigo <= 48) return { descricao: "neblina", icone: "cloud", chuva: false };
  if (codigo <= 57) return { descricao: "garoa", icone: "droplet", chuva: true };
  if (codigo <= 67) return { descricao: "chuva", icone: "droplet", chuva: true };
  if (codigo <= 77) return { descricao: "neve", icone: "cloud", chuva: true };
  if (codigo <= 82) return { descricao: "pancadas de chuva", icone: "droplet", chuva: true };
  if (codigo <= 86) return { descricao: "pancadas de neve", icone: "cloud", chuva: true };
  return { descricao: "tempestade", icone: "zap", chuva: true };
}

/** Uma leitura por hora basta: a previsão da Open-Meteo não muda mais rápido que isso. */
const VALIDADE_MS = 60 * 60 * 1000;
/**
 * Falha vale bem menos tempo. Guardar "não deu" por uma hora significa que tirar o cabo da
 * rede por um minuto deixa o card mudo pelo resto da manhã.
 */
const VALIDADE_FALHA_MS = 60 * 1000;
let cache: { em: number; dado: Clima | null } | null = null;

/**
 * O clima em uma frase, para a ação `weather` (fastRoute e roteador). Antes disto o modelo
 * respondia "não tenho acesso à previsão do tempo" enquanto a Início mostrava o tempo ao
 * lado — a rotina "Bom dia" do bloco 68 foi quem denunciou.
 */
export async function climaFalado(): Promise<string> {
  const c = await climaAgora();
  if (!c) {
    return motivoDaFalha() === "sem-cidade"
      ? "Ainda não sei a sua cidade — defina em Ajustes, Clima."
      : "Não consegui consultar o tempo agora; parece que estou sem internet.";
  }
  const partes = [`Em ${c.cidade}, ${Math.round(c.temperatura)} graus e ${c.descricao}`];
  if (typeof c.sensacao === "number" && Math.abs(c.sensacao - c.temperatura) >= 2) partes[0] += `, sensação de ${Math.round(c.sensacao)}`;
  partes.push(`Máxima de ${Math.round(c.max)}, mínima de ${Math.round(c.min)}`);
  const chuvaEmBreve = (c.horas ?? []).find(h => h.chuva);
  if (chuvaEmBreve) partes.push(`Chuva por volta das ${chuvaEmBreve.hora} horas`);
  else if (c.chuvaHoje) partes.push("Pode chover hoje");
  else partes.push("Sem chuva à vista");
  if (c.amanha) partes.push(`Amanhã, ${Math.round(c.amanha.max)} de máxima e ${Math.round(c.amanha.min)} de mínima`);
  return partes.join(". ") + ".";
}

/** Último motivo de falha, para o card dizer "sem conexão" em vez de "defina a cidade". */
let ultimaFalha: string | null = null;

export function motivoDaFalha(): string | null { return ultimaFalha; }

export async function climaAgora(): Promise<Clima | null> {
  const validade = cache?.dado ? VALIDADE_MS : VALIDADE_FALHA_MS;
  if (cache && Date.now() - cache.em < validade) return cache.dado;

  const cfg = getConfig();
  const { climaLat: lat, climaLon: lon, climaCidade: cidade } = cfg;
  if (typeof lat !== "number" || typeof lon !== "number" || !cidade) {
    ultimaFalha = "sem-cidade";
    cache = { em: Date.now(), dado: null };
    return null;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m` +
    `&hourly=temperature_2m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&timezone=auto&forecast_days=2`;

  try {
    // Timeout curto e explícito: o `fetch` do Node espera indefinidamente por padrão, e
    // uma rede que aceita a conexão mas não responde travaria a Início.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const j = await r.json() as {
      current?: { temperature_2m?: number; weather_code?: number; apparent_temperature?: number; relative_humidity_2m?: number; wind_speed_10m?: number };
      hourly?: { time?: string[]; temperature_2m?: number[]; weather_code?: number[] };
      daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; weather_code?: number[] };
    };

    const temp = j.current?.temperature_2m;
    if (typeof temp !== "number") throw new Error("resposta sem temperatura");

    const { descricao, icone, chuva } = descreverWmo(j.current?.weather_code ?? 3);
    const dado: Clima = {
      cidade,
      temperatura: temp,
      max: j.daily?.temperature_2m_max?.[0] ?? temp,
      min: j.daily?.temperature_2m_min?.[0] ?? temp,
      descricao,
      icone,
      chuvaHoje: chuva,
      sensacao: j.current?.apparent_temperature,
      umidade: j.current?.relative_humidity_2m,
      ventoKmh: j.current?.wind_speed_10m,
    };

    // As próximas 6 horas a partir da hora cheia atual. A API devolve 48 entradas em hora
    // local ("2026-09-18T14:00"); a comparação é por string, sem fuso para errar.
    const agora = new Date();
    const chaveAgora = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}T${String(agora.getHours()).padStart(2, "0")}:00`;
    const tempos = j.hourly?.time ?? [];
    const ini = Math.max(0, tempos.indexOf(chaveAgora));
    dado.horas = tempos.slice(ini + 1, ini + 7).map((t, k) => {
      const i = ini + 1 + k;
      const w = descreverWmo(j.hourly?.weather_code?.[i] ?? 3);
      return { hora: Number(t.slice(11, 13)), temp: j.hourly?.temperature_2m?.[i] ?? temp, icone: w.icone, chuva: w.chuva };
    });
    if (j.daily?.temperature_2m_max?.[1] !== undefined) {
      dado.amanha = {
        max: j.daily.temperature_2m_max[1],
        min: j.daily.temperature_2m_min?.[1] ?? j.daily.temperature_2m_max[1],
        icone: descreverWmo(j.daily.weather_code?.[1] ?? 3).icone,
      };
    }
    ultimaFalha = null;
    cache = { em: Date.now(), dado };
    return dado;
  } catch (e) {
    console.warn("[clima] não consegui consultar a Open-Meteo:", (e as Error).message);
    // Guarda a falha no cache também: sem rede, isto seria uma tentativa a cada
    // atualização da Início, cada uma esperando o timeout inteiro — mas por um minuto só.
    ultimaFalha = "sem-rede";
    cache = { em: Date.now(), dado: null };
    return null;
  }
}

/**
 * Chamado quando a cidade muda em Ajustes.
 *
 * 🔴 Sem isto o clima simplesmente NÃO FUNCIONA, e foi o bug relatado: antes de a cidade
 * existir, `climaAgora()` cacheia `dado: null`. Definir a cidade não invalidava nada, então
 * o card continuava dizendo "defina a cidade em Ajustes" por até uma hora depois de ela ter
 * sido definida. A função existia desde o começo e ninguém a chamava.
 */
export function limparCacheClima(): void {
  cache = null;
  ultimaFalha = null;
}
