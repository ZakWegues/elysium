import { clipboard } from "electron";

export async function writeText(content: string, description: string): Promise<string> {
  clipboard.writeText(content);
  return `Pronto! O ${description} foi copiado para a área de transferência. Cole com Ctrl+V onde quiser.`;
}
