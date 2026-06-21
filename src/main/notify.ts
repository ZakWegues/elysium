import { Notification } from "electron";

/**
 * Notificações nativas do Windows como apoio visual.
 * A experiência principal é por voz; isto nunca deve travar o app.
 */
export function notify(title: string, body: string): void {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body, silent: true }).show();
    }
  } catch {
    // notificação é best-effort; ignora qualquer falha
  }
}
