import { getApiKey, getConfig, nomeDoUsuario } from "../main/config";
import { blocoDasConversasAnteriores } from "./episodios";
import { decidirChamada, envelopeExterno, FONTES_EXTERNAS } from "./politicaFerramentas";
import { pedirConfirmacao } from "./confirmacao";
import { isoLocal } from "./hora";
import { blocoDeInstrucoes, Canal, regraDoAgente } from "./estiloResposta";
import { linhaDoAgente, modoAtivo } from "./modos";
import { buildMemoryBlock } from "./memoryStore";
import { callChatComFerramentas, ChatMessage, ChamadaDeFerramenta, Provider } from "./llm";
import { definicoesDeFerramentas, executarFerramenta, ferramenta, normalizarArgs } from "./ferramentas";
import { contextoRecente, provedorDoRoteador, BrainAction } from "./brain";

/**
 * O cérebro com ferramentas (bloco 78) — o laço "olha, age, responde".
 *
 * Antes, o roteador devolvia UMA lista fechada de ações sem enxergar o PC: "fecha o que
 * estiver aberto que não seja o VS Code" era impossível, e "como está o tempo" virou "não
 * tenho acesso" até alguém costurar uma ação à mão. Aqui o modelo recebe as ferramentas
 * de `ferramentas.ts`, chama as que precisar (até `MAX_RODADAS`), lê o resultado de cada
 * uma e só então escreve a resposta.
 *
 * O que NÃO muda: o `fastRoute` continua na frente (barato e certo), os executores são os
 * mesmos da voz, e conversa pura continua saindo pela `composeChatReply` com streaming —
 * o modelo sinaliza conversa respondendo só `CHAT`, e o chamador segue o caminho antigo.
 *
 * Devolve `null` quando o provedor não entregou nada aproveitável (sem ferramentas
 * suportadas, JSON quebrado, rede): quem chama cai no roteador clássico.
 */

const MAX_RODADAS = 4;
const MAX_CHAMADAS = 8;
// Modo tarefa (fase 13, bloco 119): pedido de 3+ partes ganha uma volta por parte.
const MAX_RODADAS_TAREFA = 6;
const MAX_CHAMADAS_TAREFA = 10;

/**
 * Quantas partes tem o pedido: "fecha o Chrome, abre o VS Code e toca lo-fi" = 3. Separa por
 * vírgula e pelos conectivos de sequência. Pura, para teste.
 */
export function contarPassos(texto: string): number {
  return texto
    .toLowerCase()
    .split(/,|;|\s(?:e|depois|então|entao|também|tambem|aí|ai|em seguida)\s/)
    .map(s => s.trim())
    .filter(s => s.length >= 3).length;
}

export interface ResultadoAgente {
  /** "chat" = o modelo disse que é conversa; "ferramentas" = agiu e escreveu a resposta. */
  modo: "chat" | "ferramentas";
  reply: string;
  /** Ações equivalentes às ferramentas chamadas — para o rótulo do dashboard e o histórico de uso. */
  acoes: BrainAction[];
  /** O que foi chamado, na ordem, para o log. */
  chamadas: { nome: string; args: Record<string, unknown>; resultado: string }[];
}

/**
 * O tratamento ("chefe") também no agente (bloco 186) — antes só a conversa o usava. Uma
 * linha só: a persona inteira aqui derrubou a bancada de 24 para 21/27 na fase 16.
 */
function linhaDoTratamento(): string {
  const t = (getConfig().tratamento ?? "chefe").trim();
  return t ? ` Pode chamá-lo de "${t}" de vez em quando, nunca em toda resposta.` : "";
}

/** Exportado para a bancada (`scripts/bench-agente.mjs`) medir com o prompt de produção. */
export function promptDoAgente(pedido = "", canal: Canal = "voz"): string {
  const agora = new Date();
  const data = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const iso = isoLocal(agora);
  return `Você é a Ely, a assistente do ${nomeDoUsuario()} que controla o PC dele (Windows) e fala português do Brasil. O app se chama ELYSIUM; seu nome é Ely, e você fala de si no feminino ("a Ely", "a sua assistente", "pronta", "obrigada").
Tom: confiante e eficiente; ao concluir uma ação, confirme curto ("Pronto, volume em 40.").${linhaDoTratamento()}
Agora é ${data}, ${hora} (ISO local ${iso}).

Como agir
- Se o pedido precisa de algo do PC (abrir, fechar, tocar, volume, energia, lembrete, rotina, memória, clima, estado do PC, o que está aberto, tela, web), use as ferramentas. Pode usar mais de uma, em sequência: primeiro olhe (programas_abertos, estado_do_pc…), depois aja.
- Se o pedido é só conversa, pergunta geral, opinião ou algo que você sabe sem o PC, não use ferramenta: responda exatamente a palavra CHAT e nada mais. Conta é com a ferramenta calcular — nunca de cabeça.
- Depois de olhar (programas_abertos, estado_do_pc, rotinas, lembretes…), decida: se o pedido era para fazer algo, chame a ferramenta de ação; ${regraDoAgente(canal)}
- A resposta diz o que a ferramenta devolveu, e só isso: se ela listou "Bom dia às 07:30", existe a rotina Bom dia às 07:30. Nunca diga que não achou quando a lista tem itens.
- Fazer é chamar a ferramenta: nunca diga que abriu, fechou, criou ou apagou sem tê-la chamado.
- Não mencione "ferramenta", "função" ou "busca": fale em primeira pessoa, como se você mesmo tivesse olhado e feito.
- Fale COM o usuário, na segunda pessoa ("seu PC", "você"), nunca sobre ele em terceira pessoa ("o PC do usuário").
- Em programas_abertos cada item é "processo (título da janela)": "CalculatorApp (Calculadora)" ou "ApplicationFrameHost (Calculadora)" quer dizer que a calculadora está aberta.
- Datas para lembretes: calcule a data absoluta a partir de agora.${linhaDoAgente(modoAtivo())}${blocoDeInstrucoes(getConfig().instrucoesPessoais)}${buildMemoryBlock(pedido)}${blocoDasConversasAnteriores(pedido)}`;
}

/**
 * Chamadas de ferramenta que o modelo escreveu como TEXTO (fase 14). Com ~48 ferramentas o
 * qwen2.5 às vezes devolve as chamadas no conteúdo em vez de tool_calls, em dois formatos:
 * `midia({"operacao": "pause"})` e o abreviado `volume 40` / `tocar_musica Radiohead`.
 * Só vale se TODO o texto for isso (até 6 linhas) e todos os nomes existirem — frase normal
 * que começa com o nome de uma ferramenta não vira ação. No abreviado, o valor vai para o
 * parâmetro principal (o primeiro obrigatório), e ferramenta sem parâmetro não aceita valor.
 * Pura, para teste.
 */
export function chamadasEmTexto(texto: string, ferramentas: Map<string, Record<string, unknown>>): ChamadaDeFerramenta[] {
  const linhas = texto.replace(/```\w*/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  if (!linhas.length || linhas.length > 6) return [];
  const chamadas: ChamadaDeFerramenta[] = [];
  for (const [i, l] of linhas.entries()) {
    const json = /^([a-z_]+)\s*\((\{[\s\S]*\})?\)\s*;?$/.exec(l);
    if (json) {
      if (!ferramentas.has(json[1])) return [];
      let args: Record<string, unknown> = {};
      if (json[2]) { try { args = JSON.parse(json[2]); } catch { return []; } }
      chamadas.push({ id: `texto-${i}`, name: json[1], args });
      continue;
    }
    const curto = /^([a-z_]+)(?:\s+(.{1,80}))?$/.exec(l);
    if (!curto || !ferramentas.has(curto[1]) || /[.!?]$/.test(l)) return [];
    const schema = ferramentas.get(curto[1]) as { properties?: Record<string, { type?: string }>; required?: string[] };
    const props = Object.keys(schema.properties ?? {});
    if (!curto[2]) { chamadas.push({ id: `texto-${i}`, name: curto[1], args: {} }); continue; }
    const principal = schema.required?.[0] ?? props[0];
    if (!principal) return [];
    const tipo = schema.properties?.[principal]?.type;
    const bruto = curto[2].trim();
    const valor = (tipo === "number" || tipo === "integer") && /^-?\d+([.,]\d+)?$/.test(bruto) ? Number(bruto.replace(",", ".")) : tipo === "array" ? [bruto] : bruto;
    chamadas.push({ id: `texto-${i}`, name: curto[1], args: { [principal]: valor } });
  }
  return chamadas;
}

/** Verbos de ação no passado, em primeira pessoa: o sinal de que o modelo NARROU em vez de agir. */
const ALEGA_ACAO = /\b(fechei|abri|toquei|pausei|coloquei|ajustei|aumentei|diminuí|criei|agendei|cancelei|apaguei|esqueci|guardei|mandei|enviei|desliguei|reiniciei|bloqueei|suspendi|tirei|salvei|escrevi|rodei|ativei|maximizei|minimizei)\b|\b(foi|foram|está|estão)\s+(aberto|aberta|abertos|abertas|fechad[oa]s?|criad[oa]s?|apagad[oa]s?|cancelad[oa]s?|agendad[oa]s?|pausad[oa]s?|ativad[oa]s?|enviad[oa]s?|mandad[oa]s?|salv[oa]s?|bloquead[oa]s?|desligad[oa]s?|reiniciad[oa]s?|guardad[oa]s?)\b/i;
function alegaAcao(texto: string): boolean {
  return ALEGA_ACAO.test(texto);
}

/**
 * Depois de só LER, o texto do modelo vale como resposta? Não quando ele nega o que a
 * ferramenta devolveu ("não achei" com a lista cheia), fala de "ferramenta"/"função", ou
 * devolve JSON solto (`{"name": "CHAT"}` do 8B). Fora isso, o texto é dele: "onde minha
 * irmã mora?" depois de ler a memória tem que ser "Em Curitiba", não a lista de fatos.
 */
function textoConfiavel(content: string, leituras: { resultado: string }[]): boolean {
  if (/^\s*[{[]/.test(content)) return false;
  if (/\b(ferramenta|função|function|tool)\b/i.test(content)) return false;
  const nega = /\bn[ãa]o (achei|encontrei|tenho|há|existe|consta|vejo|localizei)\b|\bnenhum[a]?\b|\bnada (aberto|tocando|cadastrad[oa]|registrad[oa])\b/i.test(content);
  const algumaCheia = leituras.some(l => l.resultado && !/^(nenhum|nada|sem |vazi|não há|não tem)/i.test(l.resultado.trim()));
  return !(nega && algumaCheia);
}

/** Ferramentas que só OLHAM. Chamá-las não conta como "ter feito" alguma coisa. */
const LEITURA = new Set(["programas_abertos", "estado_do_pc", "processos_pesados", "clima", "lembretes", "memoria", "rotinas", "presets", "tocando_agora", "area_de_transferencia", "espaco_em_disco", "versao_do_elysium", "resumo_do_dia", "agenda", "ver_lista", "ver_timers", "calcular", "nota_necessaria", "resumir_link", "hora_em", "ver_habitos", "painel_do_dia", "ver_tarefas", "treino_de_hoje", "ver_meta_calorias", "revisao_da_semana", "lembrar_conversa", "janela_em_foco"]);

export async function agir(
  texto: string,
  opcoes: { onChamada?: (nome: string, args: Record<string, unknown>) => void; canal?: Canal } = {},
): Promise<ResultadoAgente | null> {
  const cfg = getConfig();
  const { provider, motivo } = await provedorDoRoteador(cfg);
  if (motivo) console.log(`[agente] ${motivo}`);
  const modelo = provider === "ollama" ? cfg.ollamaRouterModel : cfg.routerModel;

  const contexto = contextoRecente();
  const messages: ChatMessage[] = [
    { role: "system", content: promptDoAgente(texto, opcoes.canal) + (contexto ? "\n\n[CONVERSA RECENTE]\n" + contexto : "") },
    { role: "user", content: texto },
  ];

  const tentar = (prov: Provider, mod: string) => callChatComFerramentas({
    provider: prov, model: mod, messages, tools: definicoesDeFerramentas(),
    temperature: 0.1, maxTokens: 600,
  });

  const chamadas: ResultadoAgente["chamadas"] = [];
  const acoes: BrainAction[] = [];
  let totalChamadas = 0;
  let cutucado = false;
  let continuou = false;
  // " e ", "depois", "também", vírgula: mais de um pedido na mesma frase.
  const pedidoComposto = /\s(e|depois|também|tambem)\s|,/.test(texto.toLowerCase());
  // 3 partes ou mais: modo tarefa — uma volta por parte, com a lembrança do que falta.
  const passos = contarPassos(texto);
  const modoTarefa = passos >= 3;
  const maxRodadas = modoTarefa ? MAX_RODADAS_TAREFA : MAX_RODADAS;
  const maxChamadas = modoTarefa ? MAX_CHAMADAS_TAREFA : MAX_CHAMADAS;
  let rodadasComAcao = 0;
  // Bloco 192: este pedido já leu conteúdo de fora (web, link, tela, área de transferência)?
  let contaminado = false;
  /** Índice em `chamadas` da primeira ação — as leituras anteriores não viram fala. */
  let inicioFala = -1;
  let prov = provider, mod = modelo;

  for (let rodada = 0; rodada < maxRodadas; rodada++) {
    let resposta;
    try {
      resposta = await tentar(prov, mod);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // O local falhou (fora do ar, sem suporte a ferramentas): mesma rede de segurança do
      // roteador clássico — repete na nuvem uma vez, se houver chave.
      if (prov === "ollama" && cfg.fallbackToGroq && getApiKey() && rodada === 0) {
        console.warn(`[agente] o local falhou (${msg}); repetindo na Groq.`);
        prov = "groq"; mod = cfg.routerModel;
        try { resposta = await tentar(prov, mod); }
        catch (e2) { console.error("[agente] a Groq também falhou:", e2); return null; }
      } else {
        console.error(`[agente] falha do provedor "${prov}": ${msg}`);
        return null;
      }
    }

    // Fase 14: com ~48 ferramentas o qwen2.5 às vezes ESCREVE as chamadas em texto
    // (`midia({"operacao": "pause"})` e `volume({...})`, uma por linha) em vez de devolvê-las
    // como tool_calls.
    // Se o texto é só isso, com nomes que existem, vira chamada de verdade.
    if (!resposta.toolCalls.length) {
      const escritas = chamadasEmTexto(resposta.content, new Map(definicoesDeFerramentas().map(d => [d.name, d.parameters])));
      if (escritas.length) {
        console.log(`[agente] ${escritas.length} chamada(s) escrita(s) em texto reconhecida(s)`);
        resposta = { ...resposta, content: "", toolCalls: escritas };
      }
    }

    if (!resposta.toolCalls.length) {
      const content = resposta.content.trim();
      // Só o tamanho, não o texto (08/10): o log em arquivo não guarda o que a pessoa conversa.
      console.log(`[agente] ${prov}/${mod} sem ferramentas (${content.length} caracteres)`);
      // "CHAT" (antes ou depois de olhar alguma coisa) é conversa: o modelo de 8B às vezes
      // consulta uma ferramenta irrelevante e só então percebe que era papo.
      // "CHAT" solto ou embrulhado em JSON (`{"name": "CHAT", "parameters": {}}`, o 8B faz isso).
      // "CHAT" solto, embrulhado em JSON, ou seguido da resposta ("CHAT Alan Turing foi…", o
      // qwen2.5 faz isso): tudo é conversa — quem escreve a resposta é a composeChatReply.
      if (/^\W*chat\b/i.test(content) || /^\s*\{[^}]*"chat"/i.test(content)) return { modo: "chat", reply: "", acoes: [{ action: "chat" }], chamadas };
      // Bloco 130: resposta em texto SEM ter olhado nada é conversa, mesmo sem o "CHAT". O
      // qwen2.5 de 7B costuma responder direto ("Um SSD é…") em vez de dizer CHAT, e esse
      // texto saía como a resposta final — sem o prompt do canal (voz curta / chat escrito),
      // sem streaming e sem as instruções do dono. Quem escreve conversa é a composeChatReply.
      if (!chamadas.length) return content ? { modo: "chat", reply: "", acoes: [{ action: "chat" }], chamadas } : null;
      // 🔴 Já houve leitura e o modelo respondeu em texto. O 8B narra ("fechei a
      // calculadora") sem ter agido, ecoa o prompt ("CHAME rotinas") ou contradiz o que
      // leu ("não achei" com a lista cheia). Se ele alega ação sem ter agido, uma
      // cutucada, uma vez; fora isso, A RESPOSTA É O QUE AS FERRAMENTAS DEVOLVERAM — elas
      // já falam em frases ("Em São Paulo, 17 graus…", "Bom dia às 07:30") e não mentem.
      if (!chamadas.some(c => !LEITURA.has(c.nome)) && !cutucado && alegaAcao(content)) {
        cutucado = true;
        messages.push({ role: "assistant", content });
        messages.push({ role: "user", content: "Você disse que fez isso, mas não chamou nenhuma ferramenta de ação. Se é para fazer, chame a ferramenta agora; se não é, responda o que realmente aconteceu." });
        continue;
      }
      // Só leituras, e o texto não contradiz o que leu: a resposta é dele (bloco 80).
      if (inicioFala < 0 && content && !alegaAcao(content) && textoConfiavel(content, chamadas)) {
        return { modo: "ferramentas", reply: content, acoes, chamadas };
      }
      return { modo: "ferramentas", reply: falasDaTarefa(inicioFala >= 0 ? chamadas.slice(inicioFala) : chamadas, modoTarefa && inicioFala >= 0), acoes, chamadas };
    }

    // Executa as chamadas desta rodada e devolve os resultados ao modelo.
    messages.push({ role: "assistant", content: resposta.content ?? "", tool_calls: resposta.toolCalls });
    for (const c of resposta.toolCalls as ChamadaDeFerramenta[]) {
      if (++totalChamadas > maxChamadas) {
        messages.push({ role: "tool", tool_call_id: c.id, name: c.name, content: "Limite de chamadas atingido; responda com o que já tem." });
        continue;
      }
      opcoes.onChamada?.(c.name, c.args);
      const equivalente = ferramenta(c.name)?.acao?.(c.args);
      if (equivalente) acoes.push(equivalente);
      const { resultado, pergunta } = await executarComPolitica(c.name, c.args, contaminado, texto);
      // Pediu confirmação: o turno para AQUI, com a pergunta. Seguir deixaria o modelo chamar
      // outra ação sem volta, e a segunda pergunta apagava a primeira — o "sim" só valia para
      // a última (a revisão pegou). O que já foi feito antes entra na fala.
      if (pergunta) {
        const antes = falasDasChamadas(chamadas.filter(x => !LEITURA.has(x.nome)));
        return { modo: "ferramentas", reply: antes && antes !== "Feito." ? `${antes} ${resultado}` : resultado, acoes, chamadas: [...chamadas, { nome: c.name, args: c.args, resultado }] };
      }
      chamadas.push({ nome: c.name, args: c.args, resultado });
      // Nome da ferramenta e se deu certo; argumentos e resultado podem ter dado pessoal.
      console.log(`[agente] ${c.name}(${Object.keys(c.args).join(", ")}) → ${resultado.length} caracteres`);
      // Conteúdo de fora vai ao modelo marcado como DADO, e o resto do pedido fica "contaminado".
      const externo = FONTES_EXTERNAS.has(c.name);
      if (externo) contaminado = true;
      messages.push({ role: "tool", tool_call_id: c.id, name: c.name, content: externo ? envelopeExterno(c.name, resultado) : resultado });
    }

    // 🔴 Rodada com AÇÃO: acabou. A resposta é o que os executores disseram ("Abrindo
    // bloco de notas. Em São Paulo, 17 graus…"), sem voltar ao modelo — que, pedido para
    // resumir, dizia "não achei a rotina para apagar" DEPOIS de a ferramenta ter apagado,
    // e ainda custava uma chamada. Rodada só de leitura volta ao modelo: ele pode
    // precisar agir com o que leu ("se estiver aberta, fecha").
    if (resposta.toolCalls.some(c => !LEITURA.has(c.name))) {
      if (inicioFala < 0) inicioFala = chamadas.length - resposta.toolCalls.length;
      rodadasComAcao++;
      // Modo tarefa: enquanto houver parte do pedido sem ação, mais uma volta — com a
      // lembrança explícita do pedido inteiro, porque o 7B esquece o resto depois da 1ª.
      if (modoTarefa && rodadasComAcao < passos) {
        continuou = true;
        messages.push({ role: "user", content: `Continue o MESMO pedido: "${texto}". Faça a próxima parte que ainda não foi feita, chamando a ferramenta. Se todas as partes já foram feitas, responda só "pronto".` });
        continue;
      }
      // Pedido composto ("abre o bloco de notas E me diz o tempo"): o 8B costuma chamar
      // só a primeira parte. Uma volta a mais, uma vez; se ele não chamar nada, acabou.
      if (pedidoComposto && !continuou) { continuou = true; continue; }
      return { modo: "ferramentas", reply: falasDaTarefa(chamadas.slice(inicioFala), modoTarefa), acoes, chamadas };
    }
    if (continuou) {
      // A volta a mais trouxe só leituras: junta tudo desde a ação.
      return { modo: "ferramentas", reply: falasDaTarefa(chamadas.slice(inicioFala), modoTarefa), acoes, chamadas };
    }
  }

  // Estourou as rodadas só lendo: a resposta é o que foi lido.
  return { modo: "ferramentas", reply: modoTarefa && inicioFala >= 0 ? falasDaTarefa(chamadas.slice(inicioFala), true) : falasDasChamadas(chamadas), acoes, chamadas };
}

/**
 * Executa uma ferramenta passando pela política do bloco 192: ação sensível pedida pelo que a
 * Ely LEU (e não pelo pedido dele) é barrada; ação sem volta vira pergunta ("Confirma? Diga
 * sim.") e só roda no "sim" do próximo pedido (`confirmacao.ts`).
 */
export async function executarComPolitica(nome: string, args: Record<string, unknown>, contaminado: boolean, pedido: string): Promise<{ resultado: string; pergunta?: boolean }> {
  const decisao = decidirChamada(nome, contaminado, pedido, args);
  if (decisao.tipo === "bloquear") {
    console.warn(`[agente] ${nome} barrada: veio depois de ler conteúdo de fora e o pedido não pedia isso.`);
    return { resultado: decisao.mensagem };
  }
  const f = ferramenta(nome);
  // Fase 23.2: ação de alto impacto depois de ler conteúdo de fora — pergunta antes, mesmo
  // que a ferramenta não tenha confirmação própria.
  if (decisao.tipo === "confirmar" && !f?.confirmar) {
    const resumo = Object.entries(args ?? {}).filter(([, v]) => typeof v === "string" || typeof v === "number").map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`).join(", ");
    return { resultado: pedirConfirmacao(`Isso veio depois de eu ler conteúdo de fora: ${nome.replace(/_/g, " ")}${resumo ? ` (${resumo})` : ""}.`, () => executarFerramenta(nome, args)), pergunta: true };
  }
  if (f?.confirmar) {
    try {
      const c = await f.confirmar(normalizarArgs(nome, args ?? {}));
      if (c) return { resultado: pedirConfirmacao(c.descricao, c.executar), pergunta: true };
    } catch (e) {
      return { resultado: `Não consegui preparar isso: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  return { resultado: await executarFerramenta(nome, args) };
}

/**
 * Tarefa de vários passos vira lista (o markdown do chat desenha; a voz ignora os marcadores).
 * Com um ou dois passos continua a frase corrida de sempre.
 */
export function falasDaTarefa(lista: ResultadoAgente["chamadas"], modoTarefa: boolean): string {
  if (!modoTarefa) return falasDasChamadas(lista);
  const falas = [...new Set(lista.map(c => c.resultado.trim()).filter(Boolean))];
  if (falas.length < 2) return falas[0] ?? "Feito.";
  return `Feito:\n${falas.map(f => `- ${f}`).join("\n")}`;
}

/** As falas dos executores, sem repetir a mesma frase (duas leituras iguais viram uma). */
function falasDasChamadas(lista: ResultadoAgente["chamadas"]): string {
  const vistas = new Set<string>();
  const falas: string[] = [];
  for (const c of lista) {
    const t = c.resultado.trim();
    if (!t || vistas.has(t)) continue;
    vistas.add(t);
    falas.push(t);
  }
  return falas.join(" ") || "Feito.";
}

/**
 * Avalia uma condição em português (bloco 79): "se o Spotify estiver aberto", "se for
 * chover amanhã", "se a memória estiver acima de 90%". Só ferramentas de LEITURA entram —
 * uma condição nunca age. Devolve `null` quando não deu para decidir (provedor fora, resposta
 * sem sim/não): a rotina executa mesmo assim e registra o aviso.
 */
export async function avaliarCondicao(condicao: string, contexto = ""): Promise<boolean | null> {
  const cfg = getConfig();
  // 🔴 Aqui a nuvem vem PRIMEIRO, ao contrário do resto do cérebro. Medido em bancada
  // (llama3.1:8b, 24 casos): com "SIM ou NÃO" 7/12; com Dado+Veredito 21/24; com
  // Dado+Comparação+Veredito 21/24 de novo, só que errando OUTROS casos ("nada tocando" →
  // VERDADEIRO). É o 8B comparando número e negação — não é prompt. Uma condição roda
  // poucas vezes por dia e um veredito errado pula (ou dispara) uma rotina em silêncio, então
  // vale gastar ~1,5k tokens da Groq. Sem chave, ou com a Groq fora, o local decide.
  const temGroq = Boolean(getApiKey());
  let prov: Provider = temGroq ? "groq" : "ollama";
  let mod = temGroq ? cfg.routerModel : cfg.ollamaRouterModel;
  const tools = definicoesDeFerramentas().filter(t => LEITURA.has(t.name));
  // O estado do PC e os programas abertos já vão no prompt: são leituras locais e baratas, e
  // o 8B pulava a ferramenta e chutava ("Spotify aberto?" → FALSO sem olhar). As ferramentas
  // ficam para o resto (clima, lembretes, o que está tocando). A hora vai na pergunta, não no
  // system: no system ele ignorava.
  const [estado, programas] = await Promise.all([
    executarFerramenta("estado_do_pc", {}).catch(() => ""),
    executarFerramenta("programas_abertos", {}).catch(() => ""),
  ]);
  const agora = new Date().toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const messages: ChatMessage[] = [
    { role: "system", content: `Você verifica se uma condição sobre o PC do ${nomeDoUsuario()} é verdadeira agora.
O que o PC mostra neste momento:
- Estado: ${estado || "(não deu para ler)"}
- Programas abertos: ${programas || "(não deu para ler)"}
Se a condição falar de outra coisa (clima, lembretes, o que está tocando), use as ferramentas. Hora e data já estão na pergunta.${contexto ? `
${contexto}` : ""}
Responda sempre em três linhas, nesta ordem:
Dado: <o valor ou o item exato que você observou>
Comparação: <o dado comparado com o que a condição pede, em uma frase>
Veredito: VERDADEIRO ou FALSO` },
    { role: "user", content: `Agora: ${agora}.
Condição: ${condicao}` },
  ];
  console.log(`[agente] condição "${condicao}" via ${prov}/${mod}`);
  for (let rodada = 0; rodada < 3; rodada++) {
    let resposta;
    try {
      resposta = await callChatComFerramentas({ provider: prov, model: mod, messages, tools, temperature: 0, maxTokens: 200 });
    } catch (e) {
      if (prov === "groq") { console.warn(`[agente] condição: a Groq falhou (${(e as Error).message}); tentando o local.`); prov = "ollama"; mod = cfg.ollamaRouterModel; rodada--; continue; }
      console.warn("[agente] condição sem provedor:", (e as Error).message);
      return null;
    }
    if (!resposta.toolCalls.length) {
      const t = resposta.content.trim().toLowerCase();
      console.log(`[agente] condição "${condicao}" → "${t.slice(0, 120)}"`);
      // O veredito é a ÚLTIMA palavra-chave: a linha "Dado:" pode dizer "não está tocando".
      const vereditos = [...t.matchAll(/\b(verdadeir[oa]|fals[oa]|sim|n[aã]o|true|false)\b/g)].map(m => m[1]);
      const ultimo = vereditos.at(-1);
      if (!ultimo) return null;
      return /^(verdadeir|sim|true)/.test(ultimo);
    }
    messages.push({ role: "assistant", content: resposta.content ?? "", tool_calls: resposta.toolCalls });
    for (const c of resposta.toolCalls) {
      console.log(`[agente] condição olhou ${c.name}(${JSON.stringify(c.args)})`);
      const resultado = LEITURA.has(c.name) ? await executarFerramenta(c.name, c.args) : "Ferramenta não permitida numa condição.";
      messages.push({ role: "tool", tool_call_id: c.id, name: c.name, content: resultado });
    }
  }
  return null;
}
