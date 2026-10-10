import { spawn } from "node:child_process";

/**
 * Baixar e atualizar programas pelo winget (fase 21, bloco 216).
 *
 * Só o catálogo do winget e da Microsoft Store, sempre por Id EXATO: a Ely diz nome, editora e
 * versão e pergunta "Confirma? Diga sim." antes de instalar (a confirmação cobre os termos de
 * licença, aceitos com `--accept-package-agreements`). O winget baixa para o cache dele — a pasta
 * Downloads não é tocada. O winget roda com os argumentos separados (sem shell): nada que o
 * modelo escreve vira comando.
 *
 * Instalar e atualizar demoram minutos: rodam em segundo plano e avisam no fim
 * (`aoTerminarInstalacao`, ligado pelo main — notificação, fala e celular).
 */

export interface LinhaWinget { nome: string; id: string; versao: string; disponivel?: string; fonte: string }

/**
 * Lê uma tabela do winget (`search`, `upgrade`, `list`): acha a linha de traços, usa o cabeçalho
 * logo acima para saber onde cada coluna começa e corta as linhas por essas posições. O winget
 * escreve a barra de progresso e o "spinner" antes da tabela, então tudo antes do cabeçalho é
 * descartado. Funciona com o cabeçalho em inglês ou português. Pura.
 */
export function lerTabelaWinget(saida: string): LinhaWinget[] {
  // O spinner e a barra reescrevem a linha com "\r": vale o que vem depois do último "\r", que é
  // o que o terminal mostraria. Sem isso o cabeçalho ganhava lixo na frente e as colunas saíam
  // deslocadas.
  const linhas = saida.split("\n").map(l => { const partes = l.split("\r").filter(p => p.length); return partes[partes.length - 1] ?? ""; });
  const iTracos = linhas.findIndex(l => /^-{10,}\s*$/.test(l.trim()));
  if (iTracos < 1) return [];
  const cab = linhas[iTracos - 1];
  const colunas = [...cab.matchAll(/\S+/g)].map(m => ({ nome: m[0].toLowerCase(), ini: m.index ?? 0 }));
  if (colunas.length < 3) return [];
  const pos = (re: RegExp) => colunas.findIndex(c => re.test(c.nome));
  const iNome = 0;
  const iId = pos(/^(id)$/);
  const iVersao = pos(/^(version|vers[aã]o)$/);
  const iDisp = pos(/^(available|dispon[ií]vel)$/);
  const iFonte = pos(/^(source|origem|fonte)$/);
  const corte = (l: string, i: number) => {
    if (i < 0) return "";
    const fim = i + 1 < colunas.length ? colunas[i + 1].ini : l.length;
    return l.slice(colunas[i].ini, fim).trim();
  };
  const out: LinhaWinget[] = [];
  for (const l of linhas.slice(iTracos + 1)) {
    if (!l.trim() || /^\d+ (upgrades?|atualiza)|package\(s\)|pacote|<additional|^\s*-+\s*$/i.test(l.trim())) continue;
    const id = corte(l, iId);
    if (!id || /\s/.test(id)) continue;
    out.push({ nome: corte(l, iNome), id, versao: corte(l, iVersao), ...(iDisp >= 0 ? { disponivel: corte(l, iDisp) } : {}), fonte: corte(l, iFonte) });
  }
  return out;
}

/** Nome, editora e versão do `winget show`. Pura. */
export function lerDetalhesWinget(saida: string): { nome: string; id: string; editora: string; versao: string } | null {
  const m = /Found (.+?) \[([^\]]+)\]|Encontrado (.+?) \[([^\]]+)\]/.exec(saida);
  if (!m) return null;
  const campo = (re: RegExp) => re.exec(saida)?.[1]?.trim() ?? "";
  return {
    nome: (m[1] ?? m[3] ?? "").trim(),
    id: (m[2] ?? m[4] ?? "").trim(),
    editora: campo(/^\s*(?:Publisher|Editor|Fornecedor):\s*(.+)$/im),
    versao: campo(/^\s*(?:Version|Vers[aã]o):\s*(.+)$/im),
  };
}

/** Termo de busca aceitável (sem controle, curto). Pura. */
export function termoValido(t: string): boolean {
  return /^[\p{L}\p{N} .+_&'-]{2,60}$/u.test(t.trim());
}

/** Id do winget/Store aceitável. Pura. */
export function idValido(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._+-]{1,120}$/.test(id);
}

function winget(args: string[], prazoMs = 120_000): Promise<{ codigo: number; saida: string }> {
  return new Promise((ok, erro) => {
    let p;
    try {
      p = spawn("winget", [...args, "--accept-source-agreements", "--disable-interactivity"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) { erro(e); return; }
    let saida = "";
    p.stdout.on("data", (d: Buffer) => { saida += d.toString("utf8"); if (saida.length > 2_000_000) saida = saida.slice(-1_000_000); });
    p.stderr.on("data", (d: Buffer) => { saida += d.toString("utf8"); });
    const t = setTimeout(() => { try { p.kill(); } catch { /* */ } }, prazoMs);
    p.on("error", (e) => { clearTimeout(t); erro(new Error(`winget indisponível: ${e.message}`)); });
    p.on("close", (codigo) => { clearTimeout(t); ok({ codigo: codigo ?? -1, saida }); });
  });
}

let ouvinteFim: (titulo: string, texto: string) => void = () => {};
export function aoTerminarInstalacao(fn: (titulo: string, texto: string) => void): void { ouvinteFim = fn; }
let emAndamento = 0;

export async function buscarApp(termo: string): Promise<LinhaWinget[]> {
  if (!termoValido(termo)) throw new Error("nome de programa inválido");
  const r = await winget(["search", "--query", termo.trim(), "--count", "8"]);
  return lerTabelaWinget(r.saida).filter(l => /^(winget|msstore)$/i.test(l.fonte));
}

/** "VLC media player (VideoLAN.VLC, 3.0.24)…" — para a fala e para o modelo. Pura. */
export function falaDaBusca(termo: string, achados: LinhaWinget[]): string {
  if (!achados.length) return `Não achei "${termo}" no winget nem na Microsoft Store.`;
  const itens = achados.slice(0, 5).map(a => `${a.nome} (${a.id}${a.versao && !/unknown|desconhecid/i.test(a.versao) ? `, ${a.versao}` : ""}${/msstore/i.test(a.fonte) ? ", da Store" : ""})`);
  return `Achei: ${itens.join("; ")}. Qual eu instalo?`;
}

/** Escolhe o pacote para um pedido: o Id exato, o nome igual, ou o único achado. Pura. */
export function escolherPacote(pedido: string, achados: LinhaWinget[]): LinhaWinget | null {
  const p = pedido.trim().toLowerCase();
  return achados.find(a => a.id.toLowerCase() === p)
    ?? achados.find(a => a.nome.toLowerCase() === p)
    ?? (achados.filter(a => /^winget$/i.test(a.fonte)).length === 1 ? achados.find(a => /^winget$/i.test(a.fonte))! : null)
    ?? (achados.length === 1 ? achados[0] : null);
}

export async function detalhesDoPacote(id: string): Promise<{ nome: string; id: string; editora: string; versao: string; fonte: string } | null> {
  if (!idValido(id)) return null;
  for (const fonte of ["winget", "msstore"]) {
    const r = await winget(["show", "--id", id, "--exact", "--source", fonte]);
    const d = lerDetalhesWinget(r.saida);
    if (d) return { ...d, fonte };
  }
  return null;
}

/** Instala em segundo plano; avisa no fim. Devolve a fala de agora. */
export function instalarEmSegundoPlano(p: { nome: string; id: string; fonte: string }): string {
  if (!idValido(p.id)) return "Esse pacote não é válido.";
  if (emAndamento >= 2) return "Já tem instalação em andamento; espere ela terminar.";
  emAndamento++;
  void winget(["install", "--id", p.id, "--exact", "--source", p.fonte, "--silent", "--accept-package-agreements"], 30 * 60_000)
    .then(({ codigo, saida }) => {
      const ok = codigo === 0 || /successfully installed|instalado com êxito|instalado com sucesso/i.test(saida);
      const jaTinha = /already installed|já está instalado|No newer package/i.test(saida);
      ouvinteFim("Instalação", ok ? `${p.nome} instalado.` : jaTinha ? `${p.nome} já estava instalado.` : `Não consegui instalar ${p.nome} (código ${codigo}).`);
    })
    .catch((e) => ouvinteFim("Instalação", `Não consegui instalar ${p.nome}: ${e instanceof Error ? e.message : String(e)}`))
    .finally(() => { emAndamento--; });
  return `Instalando ${p.nome}. Aviso quando terminar.`;
}

export async function atualizacoesDisponiveis(): Promise<LinhaWinget[]> {
  const r = await winget(["upgrade"]);
  return lerTabelaWinget(r.saida).filter(l => l.disponivel);
}

export function atualizarTudoEmSegundoPlano(qtd: number): string {
  if (emAndamento >= 2) return "Já tem instalação em andamento; espere ela terminar.";
  emAndamento++;
  void winget(["upgrade", "--all", "--silent", "--accept-package-agreements"], 90 * 60_000)
    .then(({ codigo }) => ouvinteFim("Atualizações", codigo === 0 ? "Programas atualizados." : `Terminei as atualizações; algumas podem ter falhado (código ${codigo}).`))
    .catch((e) => ouvinteFim("Atualizações", `As atualizações falharam: ${e instanceof Error ? e.message : String(e)}`))
    .finally(() => { emAndamento--; });
  return `Atualizando ${qtd} ${qtd === 1 ? "programa" : "programas"} em segundo plano. Aviso quando terminar.`;
}
