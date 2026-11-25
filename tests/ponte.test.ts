import { afterAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import http from "node:http";
import { comecarOla, responderOla, segredosDoToken } from "../src/services/ponteCripto";
import { ABRIR, CORTE, CREDITO, DADOS, FIM, Fluxos, quadro, u32 } from "../src/services/ponteFluxos";
import { enderecoDaPonte } from "../src/services/ponte";
import { enderecoPermitido } from "../src/services/redeSegura";
import { ehDoProprioPc } from "../src/services/mcpElysium";
import { bearerPermitido } from "../src/services/server";
import { adotar, esquecerPareados, idDoQr, listarPareados, mestreVale, revogar, tokenDoAparelho, tokensVivos, vistoAgora } from "../src/services/aparelhosTokens";

const TOKEN = crypto.randomBytes(32).toString("hex");

describe("a cifra da ponte (25/11)", () => {
  const { psk } = segredosDoToken(TOKEN);
  const conversar = () => {
    const cel = comecarOla(psk);
    const pc = responderOla(psk, cel.ola)!;
    return { pc: pc.chaves, cel: cel.terminar(pc.resposta)! };
  };

  it("os dois lados se entendem, e o que passa no meio não é legível", () => {
    const { pc, cel } = conversar();
    const claro = Buffer.from("liga o modo filme");
    const no = cel.envia.fechar(claro);
    expect(no.includes(claro)).toBe(false);
    expect(pc.recebe.abrir(no).equals(claro)).toBe(true);
    expect(cel.recebe.abrir(pc.envia.fechar(Buffer.from("ok"))).toString()).toBe("ok");
  });

  it("chave errada, pacote mexido, repetido ou fora de ordem não passam", () => {
    expect(responderOla(segredosDoToken("outro").psk, comecarOla(psk).ola)).toBeNull();
    const cel = comecarOla(psk);
    const falso = comecarOla(segredosDoToken("outro").psk);
    expect(cel.terminar(responderOla(segredosDoToken("outro").psk, falso.ola)!.resposta)).toBeNull();
    const { pc, cel: c } = conversar();
    const a = c.envia.fechar(Buffer.from("a"));
    const b = c.envia.fechar(Buffer.from("b"));
    const mexido = Buffer.from(a); mexido[5] ^= 1;
    expect(() => pc.recebe.abrir(mexido)).toThrow();
    const { pc: pc2, cel: c2 } = conversar();
    const x = c2.envia.fechar(Buffer.from("x"));
    expect(() => pc2.recebe.abrir(Buffer.from(b))).toThrow();
    expect(() => pc2.recebe.abrir(x)).toThrow(); // o contador andou: a conversa já era
    const { pc: pc3, cel: c3 } = conversar();
    const y = c3.envia.fechar(Buffer.from("y"));
    expect(pc3.recebe.abrir(y).toString()).toBe("y");
    expect(() => pc3.recebe.abrir(y)).toThrow();
  });

  it("o token não aparece na credencial, e cada conexão tem chaves novas", () => {
    const s = segredosDoToken(TOKEN);
    expect(s.credencial).toMatch(/^[0-9a-f]{64}$/);
    expect(s.credencial.includes(TOKEN.slice(0, 16))).toBe(false);
    expect(comecarOla(psk).ola.equals(comecarOla(psk).ola)).toBe(false);
  });

  it("ponto fora da curva é recusado, não derruba o PC", () => {
    const ola = Buffer.alloc(114); ola[0] = 1;
    ola.fill(7, 1, 82);
    crypto.createHmac("sha256", psk).update("ponte1-c").update(ola.subarray(1, 82)).digest().copy(ola, 82);
    expect(responderOla(psk, ola)).toBeNull();
  });
});

describe("as conexões dentro da ponte", () => {
  const servidor = http.createServer((req, res) => {
    if (req.url === "/quem") { res.end(String(req.socket.remoteAddress)); return; }
    let n = 0;
    req.on("data", (d: Buffer) => { n += d.length; });
    req.on("end", () => { if (req.url === "/grande") res.end(Buffer.alloc(3_000_000, 65)); else res.end(`recebi ${n}`); });
  });
  afterAll(() => servidor.close());

  /** Um "celular" de mentira que obedece ao crédito. */
  function ligar(devolve = true) {
    const recebido = new Map<number, Buffer[]>();
    const fim = new Set<number>();
    let credito = 512 * 1024;
    const f = new Fluxos("fde1:e:1111:2222::1", (q) => {
      const id = q.readUInt32BE(1);
      if (q[0] === DADOS) {
        recebido.set(id, [...(recebido.get(id) ?? []), Buffer.from(q.subarray(5))]);
        if (devolve) setImmediate(() => f.recebeu(quadro(CREDITO, id, u32(q.length - 5))));
      } else if (q[0] === FIM || q[0] === CORTE) fim.add(id);
      else if (q[0] === CREDITO) credito += q.readUInt32BE(5);
    }, (x) => { servidor.emit("connection", x); });
    return { f, recebido, fim, credito: () => credito, texto: (id: number) => Buffer.concat(recebido.get(id) ?? []).toString() };
  }
  const ate = async (c: () => boolean) => { for (let i = 0; i < 300 && !c(); i++) await new Promise((r) => setTimeout(r, 10)); expect(c()).toBe(true); };

  it("um pedido HTTP entra e a resposta volta, com o endereço da ponte", async () => {
    const t = ligar();
    t.f.recebeu(quadro(ABRIR, 1));
    t.f.recebeu(quadro(DADOS, 1, Buffer.from("GET /quem HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")));
    await ate(() => t.texto(1).includes("fde1:e:1111:2222::1"));
    expect(t.f.quantos).toBe(1);
    t.f.recebeu(quadro(CORTE, 1));
    await ate(() => t.f.quantos === 0);
  });

  it("resposta grande respeita o crédito: sem devolver, para em 512 KB", async () => {
    const preso = ligar(false);
    preso.f.recebeu(quadro(ABRIR, 2));
    preso.f.recebeu(quadro(DADOS, 2, Buffer.from("GET /grande HTTP/1.1\r\nHost: a\r\n\r\n")));
    await new Promise((r) => setTimeout(r, 300));
    expect(preso.texto(2).length).toBe(512 * 1024);
    const solto = ligar();
    solto.f.recebeu(quadro(ABRIR, 3));
    solto.f.recebeu(quadro(DADOS, 3, Buffer.from("GET /grande HTTP/1.1\r\nHost: a\r\nConnection: close\r\n\r\n")));
    await ate(() => solto.texto(3).length > 3_000_000);
    preso.f.fechar(); solto.f.fechar();
  });

  it("envio grande: o PC devolve crédito", async () => {
    const t = ligar();
    t.f.recebeu(quadro(ABRIR, 4));
    const corpo = Buffer.alloc(400_000, 66);
    t.f.recebeu(quadro(DADOS, 4, Buffer.from(`POST / HTTP/1.1\r\nHost: a\r\nContent-Length: ${corpo.length}\r\n\r\n`)));
    for (let i = 0; i < corpo.length; i += 50_000) t.f.recebeu(quadro(DADOS, 4, corpo.subarray(i, i + 50_000)));
    await ate(() => t.texto(4).includes("recebi 400000"));
    expect(t.credito()).toBeGreaterThan(512 * 1024);
    t.f.fechar();
  });

  it("id repetido e conexões demais levam corte; fechar derruba todas", () => {
    const t = ligar();
    for (let i = 1; i <= 70; i++) t.f.recebeu(quadro(ABRIR, i));
    expect(t.f.quantos).toBe(64);
    expect(t.fim.has(65)).toBe(true);
    t.f.fechar();
    expect(t.f.quantos).toBe(0);
  });

  it("quem vem pela ponte é rede privada, mas nunca 'o próprio PC' nem Bearer solto", () => {
    const e = enderecoDaPonte("abcdef0123456789");
    expect(enderecoPermitido(e)).toBe(true);
    expect(ehDoProprioPc(e)).toBe(false);
    expect(bearerPermitido(e, true)).toBe(false);
  });
});

describe("um token por aparelho", () => {
  it("adotar, revogar e o fim do token do PC para quem vem de fora", () => {
    esquecerPareados();
    expect(tokensVivos(TOKEN).map((t) => t.id)).toEqual(["mestre"]);
    const { id } = adotar("mestre", "Meu <celular>");
    expect(listarPareados()[0]).toMatchObject({ id, nome: "Meu celular" });
    expect(tokensVivos(TOKEN).map((t) => t.token)).toContain(tokenDoAparelho(TOKEN, id));
    expect(mestreVale()).toBe(true);
    expect(mestreVale(Date.now() + 8 * 86_400_000)).toBe(false);
    expect(adotar(id, "Outro nome").id).toBe(id);
    revogar(id);
    expect(tokensVivos(TOKEN)).toEqual([]);
    esquecerPareados();
  });

  it("o QR reserva um aparelho; usado, vira da lista e o próximo QR é outro", () => {
    esquecerPareados();
    const id = idDoQr();
    expect(idDoQr()).toBe(id);
    expect(tokensVivos(TOKEN).map((t) => t.id)).toContain(id);
    vistoAgora(id);
    expect(listarPareados().map((a) => a.id)).toEqual([id]);
    expect(idDoQr()).not.toBe(id);
    esquecerPareados();
  });

  it("mesma conta do celular (assinatura.ts): HMAC em hex", () => {
    expect(tokenDoAparelho("a".repeat(64), "0011223344556677")).toBe(crypto.createHmac("sha256", "a".repeat(64)).update("aparelho:0011223344556677").digest("hex"));
  });
});
