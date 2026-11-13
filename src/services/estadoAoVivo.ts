/**
 * O que a Ely está fazendo AGORA, em português de gente (13/11, pedido do dono para a Ely
 * flutuante: "Pesquisando…", "Abrindo o Chrome…"). Nunca o comando em si — "cd C:\…" ou o script
 * do PowerShell não interessam; interessa o que vai acontecer no fim.
 *
 * Quem avisa: `executarFerramenta` (as ferramentas do ELYSIUM, pelo agente e pelo Hermes via MCP)
 * e o `tool.start` do Hermes (as ferramentas dele: pesquisa, leitura de página, terminal).
 */

type Ouvinte = (texto: string) => void;
const ouvintes = new Set<Ouvinte>();

export function aoMudarEstadoAoVivo(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

/** Avisa um estado (já traduzido). Vazio não avisa. */
export function avisarEstadoAoVivo(texto: string): void {
  if (!texto) return;
  for (const f of ouvintes) { try { f(texto); } catch { /* quem ouve não derruba quem avisa */ } }
}

const txt = (v: unknown, max = 40): string => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/**
 * A frase de uma ferramenta. `nome` pode vir com prefixo do MCP (`mcp_elysium_abrir_programa`,
 * `elysium.abrir_programa`). Desconhecida: frase genérica, nunca o nome técnico. Pura.
 */
export function estadoDaFerramenta(nomeBruto: string, args: Record<string, unknown> = {}): string {
  const nome = nomeBruto.toLowerCase().replace(/^(mcp[_.-]+)?(elysium[_.-]+)?/, "");
  const alvo = txt(args.nome) || txt(args.programa) || txt(args.app) || txt(args.app_name) || txt(args.nome_do_app);
  const busca = txt(args.busca) || txt(args.query) || txt(args.consulta) || txt(args.termo);
  switch (nome) {
    case "abrir_programa": return alvo ? `Abrindo ${alvo}…` : "Abrindo o programa…";
    case "fechar_programa": return alvo ? `Fechando ${alvo}…` : "Fechando o programa…";
    case "fechar_tudo_menos": return "Fechando as janelas…";
    case "janela": case "organizar_janelas": return "Arrumando as janelas…";
    case "buscar_app": return alvo ? `Procurando ${alvo}…` : "Procurando o app…";
    case "instalar_app": return alvo ? `Instalando ${alvo}…` : "Instalando o app…";
    case "atualizar_apps": return "Atualizando os apps…";
    case "abrir_site": return "Abrindo o site…";
    case "tocar_musica": return busca ? `Tocando ${busca}…` : "Tocando música…";
    case "midia": case "tocando_agora": return "Mexendo na música…";
    case "volume": return "Ajustando o volume…";
    case "energia": return "Cuidando da energia do PC…";
    case "modo_foco": return "Ligando o modo foco…";
    case "clima": return "Vendo o clima…";
    case "agenda": return "Olhando a agenda…";
    case "lembretes": case "criar_timer": case "ver_timers": case "cancelar_timer": return "Cuidando dos lembretes…";
    case "memoria": case "lembrar_conversa": return "Lembrando…";
    case "resumo_do_dia": case "painel_do_dia": case "revisao_da_semana": return "Juntando o resumo…";
    case "area_de_transferencia": return "Lendo o que você copiou…";
    case "resumir_link": return "Lendo a página…";
    case "calcular": case "nota_necessaria": return "Calculando…";
    case "janela_em_foco": case "programas_abertos": case "estado_do_pc": case "processos_pesados": case "espaco_em_disco": return "Olhando o PC…";
    case "ver_tarefas": case "concluir_tarefa": case "adiar_tarefa": case "editar_tarefa": case "anotar_varias": return "Cuidando das tarefas…";
    case "adicionar_na_lista": case "ver_lista": case "marcar_item": case "limpar_feitos": return "Mexendo na lista…";
    case "comando_de_ia": return "Escrevendo…";
    case "plano_de_estudo": case "guardar_cartao": return "Montando o estudo…";
    case "ler_janela": return "Olhando a janela…";
    case "agir_na_janela": return alvo ? `Mexendo no ${alvo}…` : "Mexendo na janela…";
  }
  // As do Hermes (as próprias dele).
  if (/search|pesquis|busca/.test(nome)) return "Pesquisando…";
  if (/extract|browse|navigat|web_read|fetch|scrape|crawl/.test(nome)) return "Lendo a página…";
  if (/vision|image|screenshot/.test(nome)) return "Olhando a imagem…";
  if (/(read|view|list|search)_?files?|file_read|ls$/.test(nome)) return "Lendo os arquivos…";
  if (/(write|edit|patch|create)_?files?|file_write/.test(nome)) return "Salvando o arquivo…";
  if (/terminal|shell|exec|command|powershell|code|python/.test(nome)) return "Fazendo isso no PC…";
  if (/memory|memoria/.test(nome)) return "Lembrando…";
  if (/todo|task|plan/.test(nome)) return "Organizando os passos…";
  return "Trabalhando nisso…";
}

/** O nome da ferramenta no evento `tool.start` do Hermes (o formato varia entre versões). Pura. */
export function nomeNoEventoHermes(payload: Record<string, unknown> | undefined): { nome: string; args: Record<string, unknown> } {
  const p = payload ?? {};
  const f = (p.function && typeof p.function === "object" ? p.function : {}) as Record<string, unknown>;
  const nome = [p.name, p.tool, p.tool_name, f.name].find((v) => typeof v === "string") as string | undefined;
  let args: unknown = p.args ?? p.arguments ?? p.input ?? f.arguments ?? {};
  if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
  return { nome: nome ?? "", args: args && typeof args === "object" ? args as Record<string, unknown> : {} };
}
