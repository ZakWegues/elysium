import { EventEmitter } from "node:events";

/** Estados possíveis do assistente, refletidos no ícone/menu da bandeja. */
export type AssistantState = "idle" | "listening" | "processing" | "speaking" | "error";

class StateManager extends EventEmitter {
  private current: AssistantState = "idle";

  get(): AssistantState {
    return this.current;
  }

  set(next: AssistantState): void {
    if (next === this.current) return;
    this.current = next;
    this.emit("change", next);
  }

  is(s: AssistantState): boolean {
    return this.current === s;
  }
}

export const state = new StateManager();

/** Rótulo humano (PT-BR) usado no menu da bandeja. */
export function stateLabel(s: AssistantState): string {
  switch (s) {
    case "idle":
      return "Ocioso";
    case "listening":
      return "Ouvindo…";
    case "processing":
      return "Processando…";
    case "speaking":
      return "Falando…";
    case "error":
      return "Erro";
  }
}
