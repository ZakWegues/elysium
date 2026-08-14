import AutoLaunch from "auto-launch";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Início automático com o Windows.
 *
 * 🔴 DUAS ARMADILHAS DA BIBLIOTECA, DESCOBERTAS NO BLOCO 8
 *
 * 1. **O `auto-launch` ignora o `name` que recebe, no Windows.** O `fixOpts()` dela
 *    sobrescreve o `appName` com o basename do executável antes de tocar no registro:
 *
 *      this.opts.appName = caminho.split('\\').pop()   →  "ELYSIUM.exe" → "ELYSIUM"
 *
 *    Então `new AutoLaunch({name:"X"}).disable()` não apaga a entrada "X" — apaga a do
 *    executável atual. Para mexer numa entrada de outro nome, só no registro direto.
 *    O nome real é "electron" em desenvolvimento e "ELYSIUM" depois do instalador.
 *
 * 2. **`isEnabled()` só confere que o valor EXISTE, não que ele aponta pra algum lugar.**
 *    Com o `if (!enabled) enable()` que havia antes, um caminho obsoleto nunca era
 *    reescrito: a entrada continuava lá apontando pro nada e o app deixava de subir com o
 *    Windows sem erro nenhum. Foi exatamente o que o rename da pasta do repositório
 *    provocaria — a entrada desta máquina apontava para dentro de `ELYSIUM\neuroaxis\`.
 *
 * Daí este módulo: em vez de perguntar "existe?", ele pergunta "o que está gravado ainda
 * existe no disco?".
 */

const CHAVE_RUN = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

/** O mesmo nome que a biblioteca vai usar: basename do executável, sem o `.exe`. */
function nomeRegistrado(): string {
  return path.basename(process.execPath).replace(/\.exe$/i, "");
}

function consultarRegistro(nome: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("reg.exe", ["query", CHAVE_RUN, "/v", nome], (err, stdout) => {
      if (err) return resolve(null);
      // Saída: "    ELYSIUM    REG_SZ    "C:\...\ELYSIUM.exe" --hidden"
      const linha = stdout.split(/\r?\n/).find((l) => l.includes("REG_SZ"));
      if (!linha) return resolve(null);
      resolve(linha.slice(linha.indexOf("REG_SZ") + "REG_SZ".length).trim() || null);
    });
  });
}

/**
 * Extrai o executável de dentro do valor gravado.
 *
 * O formato é `"C:\caminho\app.exe" --hidden`, mas a própria biblioteca grava sem aspas
 * em alguns caminhos, então os dois casos são tratados.
 */
function executavelDoValor(valor: string): string | null {
  const comAspas = valor.match(/^"([^"]+)"/);
  if (comAspas) return comAspas[1];
  const semAspas = valor.match(/^(\S+\.exe)/i);
  return semAspas ? semAspas[1] : null;
}

/** Remove a entrada deixada pela instalação NEUROAXIS, se houver. Ver armadilha 1. */
export async function removerEntradaLegada(): Promise<void> {
  if (process.platform !== "win32") return;

  await new Promise<void>((resolve) => {
    execFile("reg.exe", ["delete", CHAVE_RUN, "/v", "NEUROAXIS", "/f"], (err) => {
      // Código 1 é "valor não existe", o caso normal em máquina que nunca teve a
      // instalação antiga. Não vale distinguir: o efeito desejado é o mesmo.
      if (!err) console.log("[autolaunch] entrada NEUROAXIS removida.");
      resolve();
    });
  });
}

/**
 * Deixa o registro batendo com o que a configuração pede — e conserta caminho obsoleto.
 *
 * `desejado === true` e já habilitado num caminho que ainda existe: não faz nada.
 * Se o caminho gravado sumiu (pasta renomeada, app movido, dev → instalador), reescreve.
 */
export async function sincronizarInicioAutomatico(desejado: boolean): Promise<void> {
  const launcher = new AutoLaunch({ name: "ELYSIUM", isHidden: true });

  try {
    const habilitado = await launcher.isEnabled();

    if (!desejado) {
      if (habilitado) await launcher.disable();
      return;
    }

    if (!habilitado) {
      await launcher.enable();
      return;
    }

    // Habilitado — mas apontando pra onde? Só o Windows tem a resposta.
    if (process.platform !== "win32") return;

    const valor = await consultarRegistro(nomeRegistrado());
    const exe = valor ? executavelDoValor(valor) : null;
    if (exe && fs.existsSync(exe)) return;

    console.warn(`[autolaunch] caminho gravado não existe mais (${exe ?? "ilegível"}); reescrevendo.`);
    await launcher.disable();
    await launcher.enable();
  } catch (e) {
    // Nunca derruba o boot: sem início automático o app ainda funciona quando aberto
    // à mão, e quebrar a inicialização por causa disso seria desproporcional.
    console.warn("[autolaunch] falhou:", e);
  }
}

