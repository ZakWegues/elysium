/**
 * O que o host liga e desliga na tela. "Telas com fotos e mapas da internet" (Ajustes) desligado:
 * as fotos viram marcador e o mapa mostra só os lugares, sem tiles. Padrão ligado.
 */
let internet = true;

export function internetLigada(): boolean {
  return internet;
}

export function definirInternet(ligada: boolean): void {
  internet = ligada;
}

/**
 * Prévia (dentro do chat, altura limitada, sem rolagem própria: a roda do mouse vai para o chat)
 * ou tela cheia (rolagem própria, conteúdo centrado). Fica em `<html data-modo>` para o CSS.
 */
export type Modo = "previa" | "cheia";
let modo: Modo = "previa";

export function modoAtual(): Modo {
  return modo;
}

export function definirModo(m: Modo): void {
  modo = m;
  document.documentElement.dataset.modo = m;
}
