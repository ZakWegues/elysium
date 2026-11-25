import * as crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { abrirPacote, fraseDeNotificacoes, importancia, lerNotif, oResto, pedeNotificacoes, pedeResponder, porConversa, resumoSimples, soContagem, type Notif } from "../src/services/notificacoesDoCelular";

const agora = new Date(2026, 10, 25, 20, 0).getTime();
const n = (id: string, quem: string, texto: string, min: number, extra: Partial<Notif> = {}): Notif => ({ id, em: agora - min * 60_000, app: "com.whatsapp", nome: "WhatsApp", titulo: quem, conversa: "", grupo: false, texto, mensagens: [], responde: true, ...extra });

describe("notificações do celular (25/11)", () => {
  it("só abre o pacote com a chave certa, inteiro e recente", () => {
    const chave = crypto.randomBytes(32).toString("base64");
    const pacote = (em: number, k = chave) => {
      const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", Buffer.from(k, "base64"), iv);
      const d = Buffer.concat([c.update(JSON.stringify({ em, itens: [n("a", "Pessoa", "oi", 1), { id: "" }] }), "utf8"), c.final(), c.getAuthTag()]);
      return JSON.stringify({ k: "x", iv: iv.toString("base64"), d: d.toString("base64") });
    };
    expect(abrirPacote(pacote(agora), () => chave, agora)?.length).toBe(1);
    expect(abrirPacote(pacote(agora), () => null, agora)).toBe(null);
    expect(abrirPacote(pacote(agora, crypto.randomBytes(32).toString("base64")), () => chave, agora)).toBe(null);
    expect(abrirPacote(pacote(agora - 3_600_000), () => chave, agora)).toBe(null);
    expect(abrirPacote("lixo", () => chave, agora)).toBe(null);
  });
  it("valida e corta o que chega", () => {
    expect(lerNotif({ id: "a", app: "b", em: agora - 1000, texto: "x".repeat(2000), mensagens: [{ texto: "" }, { texto: "oi", de: "P" }] }, agora)).toMatchObject({ texto: "x".repeat(800), mensagens: [{ de: "P", texto: "oi" }] });
    expect(lerNotif({ id: "a", app: "b", em: agora - 49 * 3_600_000 }, agora)).toBe(null);
    expect(lerNotif({ id: "a", app: "b", em: agora + 3_600_000 }, agora)).toBe(null);
    expect(soContagem("3 novas mensagens")).toBe(true);
    expect(soContagem("3 pães")).toBe(false);
  });
  it("junta por conversa sem repetir a mensagem", () => {
    const cs = porConversa([
      n("k1", "Ana", "oi", 9, { mensagens: [{ de: "Ana", texto: "oi", em: agora - 540_000 }] }),
      n("k1", "Ana (2 mensagens)", "tudo bem?", 8, { mensagens: [{ de: "Ana", texto: "oi", em: agora - 540_000 }, { de: "Ana", texto: "tudo bem?", em: agora - 480_000 }] }),
      n("k2", "Grupo", "bora", 3, { conversa: "Futebol", grupo: true, titulo: "Beto" }),
      n("k3", "WhatsApp", "5 mensagens de 2 conversas", 2),
    ]);
    expect(cs.map((c) => [c.quem, c.mensagens.length])).toEqual([["Futebol", 1], ["Ana", 2]]);
    expect(resumoSimples(cs)).toContain("**Ana** (2), WhatsApp: tudo bem?");
    expect(fraseDeNotificacoes(cs)).toBe("Ana te mandou mensagem no celular.");
  });
  it("o resumo não esconde ninguém", () => {
    const cs = porConversa([n("a", "Ana", "oi", 3), n("b", "Beto", "kkk", 2)]);
    expect(oResto("- **Ana** (WhatsApp): oi", cs)).toBe("\n- E mais: Beto.");
    expect(oResto("Ana e Beto", cs)).toBe("");
  });
  it("o que é importante", () => {
    const c = (texto: string, extra = {}) => porConversa([n("k", "Ana", texto, 1, extra)])[0];
    expect(importancia(c("oi"))).toBeLessThan(4);
    expect(importancia(c("me liga, é urgente"))).toBeGreaterThanOrEqual(4);
    expect(importancia(c("bom dia"), { pessoas: ["Ana"] })).toBeGreaterThanOrEqual(4);
    expect(importancia(c("bom dia", { grupo: true, conversa: "Família" }))).toBeLessThan(1);
  });
  it("percebe o pedido e a resposta", () => {
    for (const t of ["o que eu perdi?", "alguém me mandou mensagem?", "resume minhas notificações", "tem mensagens novas?", "o que tem no whatsapp"]) expect(pedeNotificacoes(t), t).toEqual({ quem: null });
    expect(pedeNotificacoes("o que a Ana me mandou?")).toEqual({ quem: "ana" });
    for (const t of ["abre o whatsapp", "manda no celular", "o que você falou?", "desliga as notificações do Windows", "quem inventou o telefone", "o que eu perdi no jogo"]) expect(pedeNotificacoes(t), t).toBe(null);
    expect(pedeResponder("responde a Ana dizendo que já vou")).toEqual({ quem: "Ana", texto: "já vou" });
    expect(pedeResponder("responde: qual a capital da França")).toBe(null);
  });
});
