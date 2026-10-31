import { describe, expect, it } from "vitest";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as https from "node:https";
import * as os from "node:os";
import * as path from "node:path";

/**
 * 31/10: TLS entre celular e PC. Certificado próprio, impressão assinada com o token, e o servidor
 * de verdade respondendo em https na porta seguinte — um cliente que só aceita AQUELE certificado
 * (como o módulo `confianca` do celular) conversa; com outra impressão, recusa.
 */

const TOKEN = "token-de-teste";
const PORTA = 49_000 + Math.floor(Math.random() * 2000);
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "ely-tls-"));

const { assinarImpressao, certificadoDoServidor, impressaoDoCertificado } = await import("../src/services/tlsCert");

function pedir(caminho: string, aceitar: (sha: string) => boolean): Promise<{ status: number; corpo: string }> {
  return new Promise((ok, falha) => {
    const req = https.request({
      host: "127.0.0.1", port: PORTA + 1, path: caminho, method: "GET",
      headers: { Authorization: `Bearer ${TOKEN}`, Host: `127.0.0.1:${PORTA + 1}` },
      // Sem cadeia de autoridade: quem decide é a fixação, conferida logo no aperto de mão.
      rejectUnauthorized: false, agent: false,
    }, (res) => {
      let corpo = "";
      res.on("data", (d) => { corpo += d; });
      res.on("end", () => ok({ status: res.statusCode ?? 0, corpo }));
    });
    req.on("socket", (sock) => sock.on("secureConnect", () => {
      const sha = (sock as import("node:tls").TLSSocket).getPeerCertificate().fingerprint256.replace(/:/g, "").toLowerCase();
      if (!aceitar(sha)) req.destroy(new Error("certificado não é o fixado"));
    }));
    req.on("error", falha);
    req.end();
  });
}

describe("TLS do servidor", () => {
  it("gera uma vez, guarda e reaproveita; impressão bate com a do X509", async () => {
    const c = await certificadoDoServidor(pasta);
    expect(c.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(c.sha256).toBe(impressaoDoCertificado(c.cert));
    expect(fs.existsSync(path.join(pasta, "elysium-tls.json"))).toBe(true);
    expect((await certificadoDoServidor(pasta)).sha256).toBe(c.sha256);
  });

  it("a assinatura da impressão depende do token, da porta e da impressão", () => {
    const a = assinarImpressao(TOKEN, "ab".repeat(32), 4201);
    expect(a).toBe(crypto.createHmac("sha256", TOKEN).update(`tls:4201:${"ab".repeat(32)}`).digest("hex"));
    expect(assinarImpressao("outro", "ab".repeat(32), 4201)).not.toBe(a);
    expect(assinarImpressao(TOKEN, "cd".repeat(32), 4201)).not.toBe(a);
  });

  it("o servidor responde em https com o certificado fixado, e tls.info traz a impressão assinada", async () => {
    const c = await certificadoDoServidor(pasta);
    const { startServer, infoTls } = await import("../src/services/server");
    startServer(TOKEN, async () => "ok", PORTA);
    for (let i = 0; i < 50 && !infoTls(); i++) await new Promise((r) => setTimeout(r, 100));
    const info = infoTls();
    expect(info).toEqual({ porta: PORTA + 1, sha256: c.sha256, assinatura: assinarImpressao(TOKEN, c.sha256, PORTA + 1) });

    const r = await pedir("/api/health", (sha) => sha === c.sha256);
    expect(r.status).toBe(200);
    await expect(pedir("/api/health", () => false)).rejects.toThrow(/fixado/);
  });
});
