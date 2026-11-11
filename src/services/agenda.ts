import { shell } from "electron";
import Store from "electron-store";
import * as crypto from "node:crypto";
import * as http from "node:http";
import { cifrarTexto, decifrarTexto, getGoogleCliente } from "../main/config";

/**
 * Google Agenda, só leitura (fase 13, bloco 120).
 *
 * OAuth de "app para computador" com redirecionamento em loopback: um servidor HTTP
 * temporário em 127.0.0.1 numa porta livre recebe o código, com PKCE (S256) e `state`
 * aleatório. Não passa pelo servidor da porta 4200 — aquele atende o celular pela rede e
 * não precisa de mais uma rota sem token. Escopo `calendar.readonly`: o ELYSIUM lê, nunca
 * cria nem apaga evento.
 *
 * O cliente OAuth (ID + segredo) é do dono, criado no Google Cloud dele; mora no
 * `elysium-config.json` ao lado da chave da Groq, fora dos `overrides` (não vai no backup).
 * O refresh token mora em `agenda.json`. Sem cliente configurado, tudo aqui fica quieto.
 */

const ESCOPO = "https://www.googleapis.com/auth/calendar.readonly";
const store = new Store<{ refreshToken: string; conta: string }>({ name: "agenda", defaults: { refreshToken: "", conta: "" } });
let acesso: { token: string; ate: number } | null = null;

export interface Evento { id: string; titulo: string; inicio: number; fim: number; diaInteiro: boolean; local?: string }

export function estadoAgenda(): { configurado: boolean; conectado: boolean; conta: string } {
  const c = getGoogleCliente();
  return { configurado: Boolean(c.id && c.segredo), conectado: Boolean(store.get("refreshToken")), conta: store.get("conta") };
}

export function desconectarAgenda(): void {
  store.set("refreshToken", "");
  store.set("conta", "");
  acesso = null;
}

function base64url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Abre o navegador para o dono autorizar; resolve quando o Google devolver o código (ou em 5 min). */
export async function conectarAgenda(): Promise<{ ok: boolean; mensagem: string }> {
  const { id, segredo } = getGoogleCliente();
  if (!id || !segredo) return { ok: false, mensagem: "Falta o cliente OAuth do Google (Ajustes → Google Agenda)." };
  const verificador = base64url(crypto.randomBytes(32));
  const desafio = base64url(crypto.createHash("sha256").update(verificador).digest());
  const estado = base64url(crypto.randomBytes(16));

  return new Promise((resolve) => {
    let redirect = "";
    const servidor = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", redirect);
      if (url.pathname !== "/") { res.writeHead(404).end(); return; }
      const fim = (ok: boolean, mensagem: string) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!doctype html><meta charset="utf-8"><title>ELYSIUM</title><body style="font-family:system-ui;padding:40px"><h2>${ok ? "Pronto" : "Não deu certo"}</h2><p>${mensagem}</p><p>Pode fechar esta aba.</p>`);
        clearTimeout(prazo);
        servidor.close();
        resolve({ ok, mensagem });
      };
      if (url.searchParams.get("state") !== estado) { fim(false, "Resposta inesperada do Google (state não confere)."); return; }
      const codigo = url.searchParams.get("code");
      if (!codigo) { fim(false, `O Google recusou: ${url.searchParams.get("error") ?? "sem código"}.`); return; }
      try {
        const r = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ code: codigo, client_id: id, client_secret: segredo, redirect_uri: redirect, grant_type: "authorization_code", code_verifier: verificador }),
          signal: AbortSignal.timeout(15000),
        });
        const j = await r.json() as { refresh_token?: string; access_token?: string; expires_in?: number; id_token?: string; error?: string };
        if (!r.ok || !j.refresh_token || !j.access_token) { fim(false, `Troca do código falhou (${j.error ?? r.status}).`); return; }
        store.set("refreshToken", cifrarTexto(j.refresh_token));
        acesso = { token: j.access_token, ate: Date.now() + (j.expires_in ?? 3000) * 1000 - 60_000 };
        // O e-mail da conta só para a tela dizer "conectado como…"; vem no id_token (JWT).
        try { store.set("conta", String(JSON.parse(Buffer.from((j.id_token ?? "").split(".")[1] ?? "", "base64").toString()).email ?? "")); } catch { /* sem e-mail */ }
        fim(true, "A agenda do Google está ligada ao ELYSIUM (só leitura).");
      } catch (e) { fim(false, `Erro ao falar com o Google: ${e instanceof Error ? e.message : String(e)}`); }
    });
    const prazo = setTimeout(() => { servidor.close(); resolve({ ok: false, mensagem: "Passaram 5 minutos sem autorizar." }); }, 5 * 60_000);
    servidor.listen(0, "127.0.0.1", () => {
      const porta = (servidor.address() as { port: number }).port;
      redirect = `http://127.0.0.1:${porta}`;
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.search = new URLSearchParams({
        client_id: id, redirect_uri: redirect, response_type: "code", scope: `${ESCOPO} openid email`,
        code_challenge: desafio, code_challenge_method: "S256", state: estado, access_type: "offline", prompt: "consent",
      }).toString();
      void shell.openExternal(auth.toString());
    });
  });
}

async function tokenDeAcesso(): Promise<string | null> {
  if (acesso && acesso.ate > Date.now()) return acesso.token;
  const { id, segredo } = getGoogleCliente();
  const refreshGravado = store.get("refreshToken");
  const refresh = decifrarTexto(refreshGravado);
  // Fase 23.2: token antigo em texto puro vira cifrado na primeira leitura.
  if (refresh && !refreshGravado.startsWith("enc:")) store.set("refreshToken", cifrarTexto(refresh));
  if (!id || !segredo || !refresh) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: segredo, refresh_token: refresh, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json() as { access_token?: string; expires_in?: number; error?: string };
  if (j.error === "invalid_grant") { desconectarAgenda(); throw new Error("a autorização do Google venceu — conecte de novo em Ajustes"); }
  if (!r.ok || !j.access_token) throw new Error(`Google respondeu ${r.status}`);
  acesso = { token: j.access_token, ate: Date.now() + (j.expires_in ?? 3000) * 1000 - 60_000 };
  return acesso.token;
}

/** Converte o formato da API em Evento. Pura, para teste. */
export function interpretarEventos(itens: unknown[]): Evento[] {
  return itens.flatMap((x) => {
    const e = x as { id?: string; summary?: string; status?: string; location?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };
    if (!e.id || e.status === "cancelled" || !e.start) return [];
    const diaInteiro = !e.start.dateTime;
    // Dia inteiro vem como "2026-10-01": meia-noite LOCAL, não UTC.
    const quando = (d?: { dateTime?: string; date?: string }) => d?.dateTime ? Date.parse(d.dateTime) : d?.date ? new Date(`${d.date}T00:00:00`).getTime() : NaN;
    const inicio = quando(e.start), fim = quando(e.end);
    if (Number.isNaN(inicio)) return [];
    return [{ id: e.id, titulo: (e.summary ?? "(sem título)").trim(), inicio, fim: Number.isNaN(fim) ? inicio : fim, diaInteiro, local: e.location }];
  });
}

export async function eventosEntre(inicio: number, fim: number): Promise<Evento[]> {
  const token = await tokenDeAcesso();
  if (!token) return [];
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.search = new URLSearchParams({ timeMin: new Date(inicio).toISOString(), timeMax: new Date(fim).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "25" }).toString();
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`a agenda respondeu ${r.status}`);
  return interpretarEventos(((await r.json()) as { items?: unknown[] }).items ?? []);
}

function limitesDoDia(deslocamento: number): [number, number] {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + deslocamento);
  const ini = d.getTime();
  d.setDate(d.getDate() + 1);
  return [ini, d.getTime()];
}

export async function eventosDoDia(deslocamento = 0): Promise<Evento[]> {
  if (!estadoAgenda().conectado) return [];
  const [a, b] = limitesDoDia(deslocamento);
  return eventosEntre(a, b);
}

/** Frase para a voz e para a ferramenta do cérebro. */
export async function agendaFalada(quando: "hoje" | "amanha" | "semana"): Promise<string> {
  const est = estadoAgenda();
  if (!est.configurado) return "A agenda do Google ainda não foi ligada (Ajustes → Google Agenda).";
  if (!est.conectado) return "A agenda do Google está configurada, mas falta conectar a conta em Ajustes → Google Agenda.";
  const hora = (ms: number) => { const d = new Date(ms); return `${d.getHours()}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, "0") : ""}`; };
  if (quando === "semana") {
    const [ini] = limitesDoDia(0);
    const ev = await eventosEntre(ini, ini + 7 * 86_400_000);
    if (!ev.length) return "Nada na agenda nos próximos 7 dias.";
    return ev.slice(0, 8).map(e => `${new Date(e.inicio).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" })}: ${e.titulo}${e.diaInteiro ? "" : ` às ${hora(e.inicio)}`}`).join("; ") + ".";
  }
  const ev = await eventosDoDia(quando === "hoje" ? 0 : 1);
  const dia = quando === "hoje" ? "hoje" : "amanhã";
  if (!ev.length) return `Nada na agenda ${dia}.`;
  return `Na agenda ${dia}: ` + ev.map(e => e.diaInteiro ? `${e.titulo} (o dia todo)` : `${e.titulo} às ${hora(e.inicio)}`).join("; ") + ".";
}

// ── Aviso 10 min antes (bloco 120) ───────────────────────────────────────────

const avisados = new Set<string>();
let vigia: NodeJS.Timeout | null = null;

export function vigiarAgenda(avisar: (titulo: string, corpo: string) => void): void {
  if (vigia) return;
  const conferir = async () => {
    try {
      if (!estadoAgenda().conectado) return;
      const agora = Date.now();
      for (const e of await eventosEntre(agora, agora + 15 * 60_000)) {
        if (e.diaInteiro || avisados.has(e.id) || e.inicio < agora) continue;
        avisados.add(e.id);
        const min = Math.max(1, Math.round((e.inicio - agora) / 60_000));
        avisar(e.titulo, `Começa em ${min} min${e.local ? ` — ${e.local}` : ""}.`);
      }
    } catch (err) { console.warn("[agenda] vigia falhou:", err instanceof Error ? err.message : err); }
  };
  vigia = setInterval(() => { void conferir(); }, 5 * 60_000);
  setTimeout(() => { void conferir(); }, 60_000);
}
