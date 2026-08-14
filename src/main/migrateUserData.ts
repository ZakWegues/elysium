import { app } from "electron";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Migração de um tiro do perfil NEUROAXIS para o perfil ELYSIUM.
 *
 * POR QUE ISTO EXISTE
 *
 * `app.getPath("userData")` deriva do campo `name` do package.json. Ao renomear o app de
 * "neuroaxis" para "elysium", o diretório de dados passou de %APPDATA%\neuroaxis para
 * %APPDATA%\elysium — e os dez `electron-store` do projeto simplesmente nascem vazios no
 * lugar novo. Sem esta migração o usuário perde de uma vez a API key da Groq, o token do
 * servidor (o que mata todos os pareamentos do celular), a memória de longo prazo, os
 * lembretes agendados, os presets, as conversas, a caixa, os tokens de push e o refresh
 * token do Spotify. E perde em silêncio: nada disso gera erro, o app só abre parecendo
 * recém-instalado.
 *
 * POR QUE ESTE MÓDULO É O PRIMEIRO IMPORT DO main.ts
 *
 * Os stores são construídos em escopo de módulo (`const store = new Store(...)`), então
 * eles rodam no momento do `require`. A ordem dos imports é o que garante que a cópia
 * aconteça antes do primeiro store abrir o arquivo e gravar um default por cima.
 *
 * POR QUE COPIA E NÃO MOVE
 *
 * O perfil antigo fica intacto como rede de segurança. Custa alguns MB e permite voltar
 * atrás sem backup externo. Apagar a pasta antiga é decisão do usuário, depois de
 * confirmar que o app novo está com tudo.
 */

/** Os stores nomeados com o prefixo antigo. O resto tem nome neutro e é copiado como está. */
const RENOMEADOS: Record<string, string> = {
  "neuroaxis-config.json": "elysium-config.json",
  "neuroaxis-telemetry-log.json": "elysium-telemetry-log.json",
};

const NOMES_NEUTROS = [
  "chat-sessions.json",
  "history.json",
  "mailbox.json",
  "memory.json",
  "presets.json",
  "push.json",
  "reminders.json",
  "spotify.json",
];

const PASTA_ANEXOS = "mailbox-attachments";
const MARCA_AUTOLAUNCH = ".legacy-autolaunch-cleared";

function perfilAntigo(): string {
  return path.join(app.getPath("appData"), "neuroaxis");
}

/**
 * Só os arquivos do app são copiados — nada de `Cache`, `Local State`, `Preferences` e
 * companhia. Aquilo é estado do Chromium, não é dado do usuário, e arrastar estado de
 * navegador entre perfis é pedir comportamento estranho por um ganho de zero.
 */
function copiarArquivo(origem: string, destino: string): void {
  if (!fs.existsSync(origem)) return;
  if (fs.existsSync(destino)) return;
  fs.copyFileSync(origem, destino);
}

/**
 * O mailbox guarda o caminho ABSOLUTO de cada anexo dentro do próprio JSON, e o
 * `isKnownAttachmentPath()` do mailboxStore só aceita arquivo cujo diretório seja o
 * `mailbox-attachments` do perfil ATUAL. Copiar o JSON sem reescrever esses caminhos
 * deixaria a Caixa listando anexos que se recusam a baixar — sintoma difícil de ligar
 * ao rename, semanas depois.
 */
function reescreverCaminhosDeAnexo(arquivo: string, dirAntigo: string, dirNovo: string): void {
  try {
    if (!fs.existsSync(arquivo)) return;
    const bruto = fs.readFileSync(arquivo, "utf-8");
    // JSON.stringify escapa a contrabarra do Windows, então o caminho aparece no texto
    // do arquivo como "C:\\Users\\...". A troca é feita nas duas formas por segurança.
    const trocado = bruto
      .split(dirAntigo.replace(/\\/g, "\\\\")).join(dirNovo.replace(/\\/g, "\\\\"))
      .split(dirAntigo).join(dirNovo);
    if (trocado !== bruto) fs.writeFileSync(arquivo, trocado, "utf-8");
  } catch (e) {
    console.warn("[migrate] não consegui reescrever os caminhos de anexo:", e);
  }
}

function copiarAnexos(dirAntigo: string, dirNovo: string): void {
  const origem = path.join(dirAntigo, PASTA_ANEXOS);
  const destino = path.join(dirNovo, PASTA_ANEXOS);
  if (!fs.existsSync(origem)) return;

  fs.mkdirSync(destino, { recursive: true });
  for (const nome of fs.readdirSync(origem)) {
    const de = path.join(origem, nome);
    if (!fs.statSync(de).isFile()) continue;
    copiarArquivo(de, path.join(destino, nome));
  }
}

function migrar(): void {
  const dirNovo = app.getPath("userData");
  const dirAntigo = perfilAntigo();

  // Ainda não renomeamos o app, ou já migramos: nos dois casos não há o que fazer.
  if (dirNovo === dirAntigo) return;
  if (!fs.existsSync(dirAntigo)) return;
  if (fs.existsSync(path.join(dirNovo, "elysium-config.json"))) return;

  fs.mkdirSync(dirNovo, { recursive: true });

  for (const [antigo, novo] of Object.entries(RENOMEADOS)) {
    copiarArquivo(path.join(dirAntigo, antigo), path.join(dirNovo, novo));
  }
  for (const nome of NOMES_NEUTROS) {
    copiarArquivo(path.join(dirAntigo, nome), path.join(dirNovo, nome));
  }

  copiarAnexos(dirAntigo, dirNovo);
  reescreverCaminhosDeAnexo(path.join(dirNovo, "mailbox.json"), dirAntigo, dirNovo);

  console.log(`[migrate] perfil migrado de "${dirAntigo}" para "${dirNovo}". A pasta antiga foi mantida.`);
}

// Falhar aqui não pode impedir o app de abrir: um perfil vazio é ruim, um app que não
// abre é pior — e sem abrir o usuário não tem nem como pedir ajuda.
try {
  migrar();
} catch (e) {
  console.error("[migrate] falhou; o app segue com o perfil novo, vazio:", e);
}

/**
 * Remove a entrada de início automático deixada pela instalação NEUROAXIS.
 *
 * 🔴 POR QUE ISTO NÃO USA O `auto-launch`
 *
 * No Windows a biblioteca IGNORA o `name` que a gente passa. O `fixOpts()` dela
 * sobrescreve o `appName` com o basename do executável antes de tocar no registro:
 *
 *   this.opts.appName = caminho.split('\\').pop()  →  "ELYSIUM.exe" → "ELYSIUM"
 *
 * Ou seja, `new AutoLaunch({name:"NEUROAXIS"}).disable()` não apaga a entrada
 * "NEUROAXIS" — apaga a do executável atual, que é justamente a que queremos manter. O
 * nome registrado sempre foi o do .exe: era "NEUROAXIS" porque o produto se chamava
 * NEUROAXIS.exe, e passa a ser "ELYSIUM" sozinho quando o electron-builder gera o
 * ELYSIUM.exe. Em desenvolvimento é "electron", pelo mesmo motivo.
 *
 * Por isso a limpeza mexe no registro direto, pelo `reg.exe` — que é builtin do Windows
 * e não acrescenta dependência nenhuma.
 *
 * A entrada antiga aponta para o caminho da instalação anterior; deixá-la significa duas
 * tentativas de subir no boot, uma delas quebrada.
 */
export async function clearLegacyAutoLaunch(): Promise<void> {
  if (process.platform !== "win32") return;

  const marca = path.join(app.getPath("userData"), MARCA_AUTOLAUNCH);
  if (fs.existsSync(marca)) return;

  await new Promise<void>((resolve) => {
    execFile(
      "reg.exe",
      ["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "NEUROAXIS", "/f"],
      (err) => {
        // Código 1 é "valor não existe", que é o caso normal em máquina que nunca teve a
        // instalação antiga. Não é erro, e não vale distinguir: o efeito desejado é o
        // mesmo dos dois jeitos — não existir entrada NEUROAXIS.
        if (err) console.log("[migrate] nenhuma entrada de início automático NEUROAXIS para remover.");
        else console.log("[migrate] entrada de início automático NEUROAXIS removida.");
        resolve();
      },
    );
  });

  try { fs.writeFileSync(marca, new Date().toISOString(), "utf-8"); } catch { /* best-effort */ }
}
