import AutoLaunch from "auto-launch";
import { app } from "electron";
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
 *
 * 🔴 3. **Existir não basta: tem de ser ESTE executável** (fase 12, 29/09/2026). Nesta
 *    máquina a entrada "ELYSIUM" apontava para a cópia antiga em `elysium baixado`
 *    (1.0.2), enquanto o instalador 1.3.0 morava em `%LOCALAPPDATA%\Programs\ELYSIUM`.
 *    As duas se chamam ELYSIUM.exe, a antiga ainda existia no disco — então a regra 2 nunca
 *    reescrevia, e **o Windows subia a versão velha a cada boot**. Agora o app empacotado
 *    reivindica a entrada para si sempre que ela aponta para outro lugar. E a instância de
 *    desenvolvimento não registra nada: ela gravava uma entrada "electron" que subia o
 *    código do repositório junto com o instalado, disputando o single-instance lock.
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

/**
 * A entrada do Registro aponta para ESTE executável? Para o card "Saúde" (fase 12) — foi
 * apontando para a cópia velha que o Windows subiu a 1.0.2 a cada boot, sem ninguém ver.
 */
export async function inicioAutomaticoConfere(): Promise<{ ok: boolean; detalhe: string }> {
  if (process.platform !== "win32") return { ok: true, detalhe: "fora do Windows" };
  if (!app.isPackaged) return { ok: true, detalhe: "desenvolvimento: não sobe com o Windows" };
  const valor = await consultarRegistro(nomeRegistrado());
  const exe = valor ? executavelDoValor(valor) : null;
  if (!exe) return { ok: false, detalhe: "não está registrado para subir com o Windows" };
  if (path.resolve(exe).toLowerCase() !== path.resolve(process.execPath).toLowerCase()) {
    return { ok: false, detalhe: `o Windows sobe outra cópia: ${exe}` };
  }
  return { ok: true, detalhe: "sobe com o Windows, esta versão" };
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
  // Desenvolvimento nunca sobe com o Windows; e limpa a entrada que versões anteriores
  // deste módulo deixaram (só se ela aponta para o electron do node_modules — nunca apaga
  // uma entrada "electron" de outro programa).
  if (!app.isPackaged) {
    if (process.platform !== "win32") return;
    const valor = await consultarRegistro(nomeRegistrado());
    if (valor && /node_modules[\\/]electron[\\/]/i.test(valor)) {
      await new Promise<void>((resolve) => {
        execFile("reg.exe", ["delete", CHAVE_RUN, "/v", nomeRegistrado(), "/f"], (err) => {
          if (!err) console.log("[autolaunch] entrada da instância de desenvolvimento removida.");
          resolve();
        });
      });
    }
    return;
  }

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
    if (exe && fs.existsSync(exe) && path.resolve(exe).toLowerCase() === path.resolve(process.execPath).toLowerCase()) return;

    console.warn(`[autolaunch] a entrada aponta para ${exe ?? "(ilegível)"}, não para este executável; reescrevendo.`);
    await launcher.disable();
    await launcher.enable();
  } catch (e) {
    // Nunca derruba o boot: sem início automático o app ainda funciona quando aberto
    // à mão, e quebrar a inicialização por causa disso seria desproporcional.
    console.warn("[autolaunch] falhou:", e);
  }
}

