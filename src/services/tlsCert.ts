import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { app } from "electron";

/**
 * O certificado próprio do servidor (31/10, TLS entre celular e PC).
 *
 * Gerado uma vez e guardado na pasta de dados do app (`elysium-tls.json`, chave privada junto —
 * não sai do PC). Não é de autoridade nenhuma: o celular confia nele por FIXAÇÃO (pinning) — guarda
 * a impressão SHA-256 do certificado, recebida por um pedido assinado com o token (ver
 * `tls.info` no rpc.ts), e o módulo nativo `confianca` só aceita este certificado neste endereço.
 * Assim nem o conteúdo das conversas nem o token passam em claro pelo Wi-Fi.
 */

export interface CertificadoTls { cert: string; key: string; sha256: string }

const ARQUIVO = "elysium-tls.json";

/** SHA-256 do certificado (DER), em hex minúsculo — o mesmo cálculo do lado Android. */
export function impressaoDoCertificado(certPem: string): string {
  return new crypto.X509Certificate(certPem).fingerprint256.replace(/:/g, "").toLowerCase();
}

let emMemoria: CertificadoTls | null = null;

export async function certificadoDoServidor(pasta = app.getPath("userData")): Promise<CertificadoTls> {
  if (emMemoria) return emMemoria;
  const arq = path.join(pasta, ARQUIVO);
  try {
    const salvo = JSON.parse(fs.readFileSync(arq, "utf8")) as { cert?: string; key?: string };
    if (salvo.cert && salvo.key) {
      const x = new crypto.X509Certificate(salvo.cert);
      // Válido por mais 30 dias pelo menos; senão, gera outro (o celular repega a impressão).
      if (new Date(x.validTo).getTime() - Date.now() > 30 * 86_400_000) {
        emMemoria = { cert: salvo.cert, key: salvo.key, sha256: impressaoDoCertificado(salvo.cert) };
        return emMemoria;
      }
    }
  } catch { /* não existe ou está corrompido: gera */ }
  const { generate } = await import("selfsigned");
  const gerado = await generate([{ name: "commonName", value: "ELYSIUM" }], { keySize: 2048, algorithm: "sha256", notAfterDate: new Date(Date.now() + 3650 * 86_400_000) });
  fs.writeFileSync(arq, JSON.stringify({ cert: gerado.cert, key: gerado.private }), { mode: 0o600 });
  emMemoria = { cert: gerado.cert, key: gerado.private, sha256: impressaoDoCertificado(gerado.cert) };
  return emMemoria;
}

/**
 * A prova de que a impressão veio do PC: HMAC-SHA256 com o token. Quem está no meio do caminho não
 * tem o token (o celular novo só manda pedidos assinados), então não consegue trocar a impressão. Puro.
 */
export function assinarImpressao(token: string, sha256: string, porta: number): string {
  return crypto.createHmac("sha256", token).update(`tls:${porta}:${sha256}`).digest("hex");
}
