import { semAcento } from "./texto";
/**
 * Que horas são em outra cidade (fase 14). Pura — o fuso vem do `Intl` do próprio Node.
 *
 * Era um erro fixo da bancada do agente: "que horas são em Tóquio" virava o CLIMA de
 * Tóquio (o 7B pegava a ferramenta mais parecida). Aqui não há modelo: cidade → fuso.
 */

const semAcentoLocal = (s: string) => semAcento(s).trim();

const FUSOS: [RegExp, string, string][] = [
  [/^(toquio|tokyo|japao)$/, "Asia/Tokyo", "Tóquio"],
  [/^(seul|coreia( do sul)?)$/, "Asia/Seoul", "Seul"],
  [/^(pequim|beijing|xangai|china)$/, "Asia/Shanghai", "Pequim"],
  [/^(hong kong)$/, "Asia/Hong_Kong", "Hong Kong"],
  [/^(singapura|singapore)$/, "Asia/Singapore", "Singapura"],
  [/^(india|nova (deli|delhi)|mumbai|bombaim)$/, "Asia/Kolkata", "Índia"],
  [/^(dubai|emirados( arabes)?)$/, "Asia/Dubai", "Dubai"],
  [/^(moscou|moscow|russia)$/, "Europe/Moscow", "Moscou"],
  [/^(istambul|turquia)$/, "Europe/Istanbul", "Istambul"],
  [/^(cairo|egito)$/, "Africa/Cairo", "Cairo"],
  [/^(joanesburgo|africa do sul)$/, "Africa/Johannesburg", "Joanesburgo"],
  [/^(berlim|alemanha)$/, "Europe/Berlin", "Berlim"],
  [/^(paris|franca)$/, "Europe/Paris", "Paris"],
  [/^(roma|italia)$/, "Europe/Rome", "Roma"],
  [/^(madri|madrid|espanha|barcelona)$/, "Europe/Madrid", "Madri"],
  [/^(londres|london|inglaterra|reino unido)$/, "Europe/London", "Londres"],
  [/^(lisboa|portugal|porto)$/, "Europe/Lisbon", "Lisboa"],
  [/^(nova york|nova iorque|new york|ny|miami|boston|washington)$/, "America/New_York", "Nova York"],
  [/^(toronto|canada)$/, "America/Toronto", "Toronto"],
  [/^(chicago)$/, "America/Chicago", "Chicago"],
  [/^(los angeles|la|california|sao francisco|san francisco|las vegas)$/, "America/Los_Angeles", "Los Angeles"],
  [/^(cidade do mexico|mexico)$/, "America/Mexico_City", "Cidade do México"],
  [/^(buenos aires|argentina)$/, "America/Argentina/Buenos_Aires", "Buenos Aires"],
  [/^(santiago|chile)$/, "America/Santiago", "Santiago"],
  [/^(lima|peru)$/, "America/Lima", "Lima"],
  [/^(bogota|colombia)$/, "America/Bogota", "Bogotá"],
  [/^(manaus|amazonas)$/, "America/Manaus", "Manaus"],
  [/^(rio branco|acre)$/, "America/Rio_Branco", "Rio Branco"],
  [/^(fernando de noronha|noronha)$/, "America/Noronha", "Fernando de Noronha"],
  [/^(sydney|australia)$/, "Australia/Sydney", "Sydney"],
  [/^(auckland|nova zelandia)$/, "Pacific/Auckland", "Auckland"],
  [/^(havai|hawaii|honolulu)$/, "Pacific/Honolulu", "Havaí"],
];

/** "tóquio" → { fuso, nome }, ou null. */
export function fusoDe(cidade: string): { fuso: string; nome: string } | null {
  const c = semAcentoLocal(cidade).replace(/^(o|a|os|as)\s+/, "").replace(/[?.!]+$/, "").trim();
  for (const [re, fuso, nome] of FUSOS) if (re.test(c)) return { fuso, nome };
  return null;
}

/** "Em Tóquio são 07:41 de quinta-feira." */
export function horaEm(cidade: string, agora = new Date()): string | null {
  const f = fusoDe(cidade);
  if (!f) return null;
  const hora = agora.toLocaleTimeString("pt-BR", { timeZone: f.fuso, hour: "2-digit", minute: "2-digit" });
  const dia = agora.toLocaleDateString("pt-BR", { timeZone: f.fuso, weekday: "long" });
  const diaAqui = agora.toLocaleDateString("pt-BR", { weekday: "long" });
  return `Em ${f.nome} são ${hora}${dia !== diaAqui ? ` de ${dia}` : ""}.`;
}

/** "que horas são em Tóquio?" → "Tóquio", ou null. */
export function pedidoDeHora(texto: string): string | null {
  const m = /^\s*(?:que horas? (?:sao|são|é|e)|qual (?:a|é a|e a) hora|hora|horario)\s+(?:agora\s+)?(?:em|na|no|de)\s+(.+?)(?:\s+agora)?\s*\??\s*$/i.exec(texto);
  return m && fusoDe(m[1]) ? m[1] : null;
}
