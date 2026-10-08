/**
 * As falas fixas da Ely, com variação (fase 19, bloco 188).
 *
 * O "Um instante." de toda espera, o "Lembrete: …" de todo lembrete e o "Sistemas no ar" de
 * todo arranque são o que mais denuncia o robô: a mesma frase, no mesmo tom, sempre. A
 * pesquisa sobre "presença de voz" (Sesame) e os elogios ao modo de voz do ChatGPT apontam
 * o mesmo — o que soa humano é a frase que combina com o pedido e não se repete.
 *
 * Regras:
 *  - a espera diz o que ela está FAZENDO (pesquisar, olhar a tela), nunca que terminou;
 *  - nenhum grupo repete a última frase dita dele;
 *  - o conteúdo (o texto do lembrete, o nome do timer) nunca muda — só a moldura.
 * O sorteio é injetável para os testes.
 */

type Sorteio = () => number;

const ultimas = new Map<string, string>();

/** Uma frase do grupo, diferente da última que saiu desse mesmo grupo. */
export function escolher(chave: string, opcoes: string[], sorteio: Sorteio = Math.random): string {
  if (opcoes.length === 0) return "";
  const anterior = ultimas.get(chave);
  const livres = opcoes.length > 1 ? opcoes.filter(o => o !== anterior) : opcoes;
  const frase = livres[Math.min(livres.length - 1, Math.floor(sorteio() * livres.length))];
  ultimas.set(chave, frase);
  return frase;
}

/** Para os testes começarem do zero. */
export function esquecerUltimas(): void {
  ultimas.clear();
}

function sem(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** O tipo de espera, pelo pedido. Puro. */
export function tipoDeEspera(pedido: string): "busca" | "tela" | "leitura" | "varias" | "geral" {
  const t = sem(pedido);
  if (/\b(tela|na minha frente|aparecendo|esse erro|essa janela)\b/.test(t) || /\bo que (tem|aparece|esta) (aqui|ai|na tela)\b/.test(t)) return "tela";
  if (/\b(link|artigo|resume|resumir|resumo d[ao]s?)\b/.test(t)) return "leitura";
  if (/\b(pesquisa|pesquise|procura|procure|busca|busque|noticia|noticias|cotacao|quanto custa|preco d|na internet|no google|lancamento)\b/.test(t)) return "busca";
  if (/\s(e|depois|tambem)\s|,/.test(t) && t.split(/\s+/).length >= 6) return "varias";
  return "geral";
}

const ESPERAS: Record<ReturnType<typeof tipoDeEspera>, string[]> = {
  busca:   ["Vou pesquisar.", "Deixa eu procurar.", "Pesquisando aqui."],
  tela:    ["Deixa eu olhar.", "Olhando a tela.", "Deixa eu ver o que tem aí."],
  leitura: ["Lendo aqui.", "Deixa eu ler.", "Só um instante, lendo."],
  varias:  ["Deixa comigo.", "Já vou fazendo.", "Uma coisa de cada vez, já vai."],
  geral:   ["Um instante.", "Só um segundo.", "Já te respondo.", "Deixa eu ver."],
};

/** A frase que cobre o silêncio de um pedido demorado. */
export function fraseDeEspera(pedido: string, sorteio?: Sorteio): string {
  const tipo = tipoDeEspera(pedido);
  return escolher(`espera`, ESPERAS[tipo], sorteio);
}

export function fraseDeLembrete(texto: string, sorteio?: Sorteio): string {
  const t = texto.trim().replace(/[.!]+$/, "");
  return escolher("lembrete", [`Lembrete: ${t}.`, `Passando para lembrar: ${t}.`, `Não esquece: ${t}.`], sorteio);
}

export function fraseDeTimer(nome: string | undefined, sorteio?: Sorteio): string {
  const n = nome?.trim();
  return n
    ? escolher("timer", [`Acabou o timer do ${n}.`, `Deu o tempo do ${n}.`, `O timer do ${n} terminou.`], sorteio)
    : escolher("timer", ["Acabou o timer.", "Deu o tempo.", "O timer terminou."], sorteio);
}

export function fraseDeHabito(nome: string, sorteio?: Sorteio): string {
  return escolher("habito", [
    `Hora do ${nome}. Ainda não está marcado hoje.`,
    `Ainda falta o ${nome} hoje.`,
    `Lembrete do ${nome}: ainda não marcado hoje.`,
  ], sorteio);
}

/** A fala de arranque (fase 16), com o período do dia. */
export function fraseDeArranque(tratamento: string, hora: number, sorteio?: Sorteio): string {
  const t = tratamento.trim();
  const voc = t ? `, ${t}` : "";
  const saud = hora >= 5 && hora < 12 ? "Bom dia" : hora >= 12 && hora < 18 ? "Boa tarde" : "Boa noite";
  return escolher("arranque", [
    `Sistemas no ar${voc}.`,
    `${saud}${voc}. Tudo pronto.`,
    `Online${voc}.`,
  ], sorteio);
}
