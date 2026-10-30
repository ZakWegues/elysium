import { describe, expect, it } from "vitest";
import { conversaParaContinuar, mergeSession, upsertMessages, getSession, type ChatSession } from "../src/services/chatSessionsStore";

const s = (id: string, updatedAt: number, aparelho?: "pc" | "celular"): ChatSession =>
  ({ id, title: id, createdAt: 0, updatedAt, favorite: false, messages: [], ...(aparelho ? { aparelho } : {}) });

describe("continuar no outro aparelho (31/10)", () => {
  it("só a mais recente, só do aparelho certo, só nas últimas 3 horas", () => {
    const agora = 10 * 3_600_000;
    expect(conversaParaContinuar([s("a", agora - 60_000, "celular"), s("b", agora - 120_000, "pc")], "celular", agora)?.id).toBe("a");
    expect(conversaParaContinuar([s("a", agora - 60_000, "pc"), s("b", agora - 30_000, "celular")], "pc", agora)).toBeNull();
    expect(conversaParaContinuar([s("a", agora - 4 * 3_600_000, "celular")], "celular", agora)).toBeNull();
    expect(conversaParaContinuar([s("a", agora - 60_000)], "celular", agora)).toBeNull();
  });

  it("o PC marca 'pc' ao gravar; a do celular que vence o merge fica 'celular'", () => {
    const pc = upsertMessages(null, [{ id: "m1", from: "me", text: "oi", ts: 1 }])!;
    expect(getSession(pc.id)?.aparelho).toBe("pc");
    const cel = mergeSession({ ...pc, updatedAt: pc.updatedAt + 1000, aparelho: "celular", messages: [...pc.messages, { id: "m2", from: "reply", text: "olá", ts: 2 }] });
    expect(cel?.aparelho).toBe("celular");
  });
});
