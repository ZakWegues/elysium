import { spawn } from "node:child_process";

/**
 * PowerShell com valores SEPARADOS do script (fase 20, bloco 198).
 *
 * Até aqui cada executor montava o script com o valor dentro (o nome no filtro `-like`,
 * `$bmp.Save('${caminho}')`, `$s.Speak('${texto}')`. O escape era `'` → `''`, e falhava de três
 * jeitos que a auditoria mostrou: um executor não escapava nada (janelas), outro escapava com
 * `\'` (que não existe no PowerShell — print), e TODOS esqueciam que o PowerShell também aceita
 * as aspas curvas ‘ ’ ‚ ‛ como aspas simples. Como o nome vem do modelo, uma página ou um título
 * de janela que enganasse o modelo virava comando rodando no PC.
 *
 * Agora o valor vai numa variável de ambiente (`$env:NX_NOME`) e o script só a LÊ: o
 * PowerShell nunca interpreta o conteúdo como código, seja qual for. Regra do projeto: **nenhum
 * valor externo concatenado em script** — o teste `ps.test.ts` varre `src/` atrás de recaída.
 */

export interface ResultadoPs { codigo: number | null; saida: string; erro: string }

/** Nomes de variável aceitos: `NX_` + letras/dígitos. Pura. */
export function nomeValido(nome: string): boolean {
  return /^NX_[A-Z0-9_]{1,30}$/.test(nome);
}

/**
 * O que vai para o `spawn`: o script em Base64 (UTF-16LE, com a saída forçada em UTF-8) e o
 * ambiente com os valores. Pura, para teste: o script devolvido nunca contém os valores.
 */
export function montarPs(script: string, valores: Record<string, string> = {}): { args: string[]; env: Record<string, string> } {
  const env: Record<string, string> = {};
  for (const [nome, valor] of Object.entries(valores)) {
    if (!nomeValido(nome)) throw new Error(`variável de PowerShell inválida: ${nome}`);
    // NUL não cabe numa variável de ambiente; o resto vai como está.
    env[nome] = String(valor ?? "").replace(/\0/g, "");
  }
  const completo = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n" + script;
  const encoded = Buffer.from(completo, "utf16le").toString("base64");
  return {
    args: ["-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-NonInteractive", "-NoProfile", "-EncodedCommand", encoded],
    env,
  };
}

/** Roda e devolve código, saída e erro. Nunca rejeita: falha vira `codigo` diferente de 0. */
export function rodarPs(script: string, valores: Record<string, string> = {}, opcoes: { timeoutMs?: number } = {}): Promise<ResultadoPs> {
  return new Promise((resolve) => {
    let montado: ReturnType<typeof montarPs>;
    try { montado = montarPs(script, valores); }
    catch (e) { resolve({ codigo: -1, saida: "", erro: e instanceof Error ? e.message : String(e) }); return; }
    let saida = "", erro = "", feito = false;
    const fim = (r: ResultadoPs) => { if (!feito) { feito = true; clearTimeout(t); resolve(r); } };
    const ps = spawn("powershell.exe", montado.args, { stdio: "pipe", env: { ...process.env, ...montado.env }, windowsHide: true });
    const t = setTimeout(() => { try { ps.kill(); } catch { /* já saiu */ } fim({ codigo: null, saida, erro: erro || "tempo esgotado" }); }, opcoes.timeoutMs ?? 30_000);
    ps.stdout?.on("data", (d: Buffer) => { saida += d.toString("utf8"); });
    ps.stderr?.on("data", (d: Buffer) => { erro += d.toString("utf8"); });
    ps.on("close", (codigo) => fim({ codigo, saida: saida.trim(), erro: erro.trim() }));
    ps.on("error", (e) => fim({ codigo: -1, saida, erro: e.message }));
  });
}

/** Processo spawnado com os valores no ambiente — para quem precisa do `ChildProcess` (matar no meio). */
export function spawnPs(script: string, valores: Record<string, string> = {}) {
  const montado = montarPs(script, valores);
  return spawn("powershell.exe", montado.args, { stdio: "pipe", env: { ...process.env, ...montado.env }, windowsHide: true });
}

/** Nome de processo aceitável para filtros (`-like`). Pura. */
export function nomeDeProcessoValido(nome: string): boolean {
  return /^[\p{L}\p{N} ._-]{1,64}$/u.test(nome);
}
