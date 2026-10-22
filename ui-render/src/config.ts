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
