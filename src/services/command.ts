import { decideBrain } from "./brain";
import { routeAction } from "../actions/router";

/** Pure command processor — no IPC, no window references. Safe to call from server or main. */
export async function processCommand(text: string): Promise<string> {
  const actions = await decideBrain(text);
  const replies: string[] = [];
  for (const action of actions) {
    replies.push(await routeAction(action));
  }
  return replies.filter(Boolean).join(" ");
}
