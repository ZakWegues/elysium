import Store from "electron-store";

/**
 * Notificações push para o celular.
 *
 * Vai pelo serviço da Expo (`exp.host`), não pela rede local. Isso é o que faz a
 * notificação chegar com o celular no 4G, longe de casa — o resto do app depende de
 * estar na mesma rede ou no túnel, mas um lembrete precisa alcançar o usuário onde
 * ele estiver. Nenhum relay próprio envolvido.
 *
 * O token do aparelho é registrado pelo app via RPC `push.register`.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** "pc" (08/10): o ELYSIUM fechou, o PC vai desligar ou dormir — o celular sabe por que parou de responder. */
export type PushCategory = "reminder" | "anomaly" | "mailbox" | "pc";

interface PushPrefs {
  /** Tokens de todos os aparelhos pareados. */
  tokens: string[];
  /** Categorias desligadas pelo usuário. */
  muted: PushCategory[];
  /** Janela de silêncio, em hora local (0-23). Iguais = desligada. */
  quietFrom: number;
  quietTo: number;
}

const store = new Store<{ push: PushPrefs }>({
  name: "push",
  defaults: { push: { tokens: [], muted: [], quietFrom: 0, quietTo: 0 } },
});

function prefs(): PushPrefs {
  return store.get("push");
}

export function registerToken(token: string): boolean {
  // Formato dos tokens da Expo. Validar aqui evita acumular lixo vindo de um cliente
  // com bug e só descobrir quando a notificação não chega.
  if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) {
    throw new Error("token de push inválido");
  }

  const current = prefs();
  if (current.tokens.includes(token)) return false;
  store.set("push", { ...current, tokens: [...current.tokens, token] });
  return true;
}

export function unregisterToken(token: string): boolean {
  const current = prefs();
  if (!current.tokens.includes(token)) return false;
  store.set("push", { ...current, tokens: current.tokens.filter(t => t !== token) });
  return true;
}

export function getPushPrefs(): PushPrefs {
  return prefs();
}

export function setPushPrefs(patch: Partial<Omit<PushPrefs, "tokens">>): PushPrefs {
  // Espalhar o patch direto apagaria valores guardados, porque uma chave presente com
  // valor undefined sobrescreve. Quem chama manda só o que o usuário mexeu.
  const next = { ...prefs() };
  if (patch.muted !== undefined) next.muted = patch.muted;
  if (patch.quietFrom !== undefined) next.quietFrom = patch.quietFrom;
  if (patch.quietTo !== undefined) next.quietTo = patch.quietTo;

  store.set("push", next);
  return next;
}

function inQuietHours(now = new Date()): boolean {
  const { quietFrom, quietTo } = prefs();
  if (quietFrom === quietTo) return false;
  const h = now.getHours();
  // Janela que cruza a meia-noite (ex.: 23 → 7) precisa do OU.
  return quietFrom < quietTo ? h >= quietFrom && h < quietTo : h >= quietFrom || h < quietTo;
}

/**
 * Envia para todos os aparelhos registrados. Best-effort: falha de push nunca
 * interrompe a ação que a originou.
 */
export async function sendPush(
  category: PushCategory,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const { tokens, muted } = prefs();
  if (tokens.length === 0) return;
  if (muted.includes(category)) return;
  // Lembrete atravessa a janela de silêncio: foi o usuário que pediu por ele numa
  // hora específica. O resto espera.
  if (category !== "reminder" && inQuietHours()) return;

  const messages = tokens.map(to => ({
    to,
    title,
    body,
    sound: "default",
    priority: "high",
    data: { category, ...data },
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[push] HTTP ${res.status} ao enviar`);
      return;
    }

    // A Expo responde 200 mesmo quando um token individual falha; o motivo vem por
    // item. `DeviceNotRegistered` significa app desinstalado — limpa o token para
    // não seguir tentando para sempre.
    const payload = await res.json() as { data?: { status: string; details?: { error?: string } }[] };
    payload.data?.forEach((entry, i) => {
      if (entry.status === "error" && entry.details?.error === "DeviceNotRegistered") {
        console.warn("[push] token descadastrado, removendo:", tokens[i]?.slice(0, 24));
        unregisterToken(tokens[i]);
      }
    });
  } catch (e) {
    console.error("[push] falha de rede ao enviar:", e);
  }
}
