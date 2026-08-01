import { spawn } from "node:child_process";

export type PowerOperation = "shutdown" | "restart" | "sleep" | "lock" | "cancel";

/**
 * Ações de energia do Windows.
 *
 * Tudo aqui é irreversível do ponto de vista de quem está usando o PC — por isso o
 * agendamento com atraso é o caminho padrão para desligar/reiniciar: dá janela pro
 * usuário cancelar ("cancela o desligamento") antes de perder trabalho aberto.
 */

const DEFAULT_DELAY_SECONDS = 30;

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
    child.on("error", reject);
    child.on("close", code => {
      // shutdown.exe devolve 1116 quando não há desligamento agendado pra cancelar;
      // isso não é falha do ponto de vista do usuário.
      if (code === 0 || code === 1116) resolve();
      else reject(new Error(`comando de energia falhou (código ${code})`));
    });
  });
}

export async function powerControl(
  operation: PowerOperation,
  delaySeconds?: number,
): Promise<string> {
  const delay = Number.isInteger(delaySeconds) && delaySeconds! >= 0
    ? delaySeconds!
    : DEFAULT_DELAY_SECONDS;

  switch (operation) {
    case "shutdown":
      await run("shutdown.exe", ["/s", "/t", String(delay)]);
      return delay > 0
        ? `Desligando o PC em ${delay} segundos. Diga "cancela o desligamento" se mudar de ideia.`
        : "Desligando o PC agora.";

    case "restart":
      await run("shutdown.exe", ["/r", "/t", String(delay)]);
      return delay > 0
        ? `Reiniciando o PC em ${delay} segundos. Diga "cancela o desligamento" se mudar de ideia.`
        : "Reiniciando o PC agora.";

    case "cancel":
      await run("shutdown.exe", ["/a"]);
      return "Desligamento cancelado.";

    case "lock":
      await run("rundll32.exe", ["user32.dll,LockWorkStation"]);
      return "PC bloqueado.";

    case "sleep":
      // Quirk conhecido do Windows: se a hibernação estiver habilitada, SetSuspendState
      // hiberna em vez de suspender, independente do primeiro parâmetro. Quem quiser
      // suspensão garantida precisa rodar `powercfg /hibernate off` uma vez.
      await run("rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]);
      return "Suspendendo o PC.";

    default:
      return "Operação de energia desconhecida.";
  }
}
