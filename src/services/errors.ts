/** Erros tipados para que o main saiba o que falar/notificar ao usuário. */

export type ErrorKind =
  | "api_key"
  | "network"
  | "mic"
  | "app_not_found"
  | "generic";

export class ElysiumError extends Error {
  kind: ErrorKind;
  spoken: string; // frase curta em PT-BR para falar em voz alta

  constructor(kind: ErrorKind, message: string, spoken: string) {
    super(message);
    this.name = "ElysiumError";
    this.kind = kind;
    this.spoken = spoken;
  }
}

export const apiKeyError = () =>
  new ElysiumError(
    "api_key",
    "GROQ_API_KEY ausente ou inválida",
    "Não encontrei uma chave da Groq válida. Configure pelo menu da bandeja."
  );

export const networkError = (detail = "") =>
  new ElysiumError(
    "network",
    `Falha de rede: ${detail}`,
    "Estou sem conexão com o servidor agora. Tente de novo em instantes."
  );

export const appNotFoundError = (name: string) =>
  new ElysiumError(
    "app_not_found",
    `Programa não encontrado: ${name}`,
    `Não encontrei o programa ${name} aqui no computador.`
  );
