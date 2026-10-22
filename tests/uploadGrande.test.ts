import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const dados = fs.mkdtempSync(path.join(os.tmpdir(), "ely-upload-"));
vi.mock("electron", () => ({ app: { getPath: () => dados } }));

const MB = 1024 * 1024;
async function* pedacos(total: number, quebrarEm?: number): AsyncGenerator<Buffer> {
  const bloco = Buffer.alloc(MB, 7);
  let enviados = 0;
  while (enviados < total) {
    if (quebrarEm !== undefined && enviados >= quebrarEm) throw new Error("aborted");
    const n = Math.min(MB, total - enviados);
    yield n === MB ? bloco : bloco.subarray(0, n);
    enviados += n;
  }
}
const anexos = () => fs.readdirSync(path.join(dados, "mailbox-attachments"));

describe("upload grande do celular para a Caixa (22/10)", async () => {
  const { receberUpload, getAttachmentFile, AttachmentTooLargeError, UploadIncompletoError, MAILBOX_MAX_FILE_BYTES } = await import("../src/services/mailboxStore");

  it("100 MB em stream chegam inteiros, com tipo pelo nome", async () => {
    const r = await receberUpload("mobile", pedacos(100 * MB), "aula.mp4", 100 * MB, { text: "o vídeo" });
    const arq = getAttachmentFile(r.id)!;
    expect(fs.statSync(arq.filePath).size).toBe(100 * MB);
    expect(arq.mimeType).toBe("video/mp4");
    expect(arq.filePath.startsWith(dados)).toBe(true);
    fs.rmSync(arq.filePath);
  }, 60_000);

  it("acima de 500 MB recusa antes de gravar qualquer coisa", async () => {
    const antes = anexos().length;
    await expect(receberUpload("mobile", pedacos(1), "x.bin", MAILBOX_MAX_FILE_BYTES + 1)).rejects.toBeInstanceOf(AttachmentTooLargeError);
    expect(anexos().length).toBe(antes);
  });

  it("nome malicioso vira só um nome dentro da pasta da Caixa", async () => {
    const r = await receberUpload("mobile", pedacos(10), "..\\..\\Windows\\evil<>.exe", 10);
    const arq = getAttachmentFile(r.id)!;
    expect(path.dirname(arq.filePath)).toBe(path.join(dados, "mailbox-attachments"));
    expect(path.basename(arq.filePath)).not.toMatch(/[\\/<>]|\.\./);
    expect(r.nome).toBe("evil__.exe");
  });

  it("a conexão cai no meio: erro e nenhum arquivo parcial", async () => {
    const antes = anexos().length;
    await expect(receberUpload("mobile", pedacos(5 * MB, 2 * MB), "corte.mp4", 5 * MB)).rejects.toThrow("aborted");
    expect(anexos().length).toBe(antes);
  });

  it("veio menos ou mais do que o Content-Length: recusa e apaga", async () => {
    const antes = anexos().length;
    await expect(receberUpload("mobile", pedacos(3 * MB), "curto.bin", 4 * MB)).rejects.toBeInstanceOf(UploadIncompletoError);
    await expect(receberUpload("mobile", pedacos(3 * MB), "longo.bin", 2 * MB)).rejects.toBeInstanceOf(UploadIncompletoError);
    await expect(receberUpload("mobile", pedacos(1), "zero.bin", 0)).rejects.toBeInstanceOf(UploadIncompletoError);
    expect(anexos().length).toBe(antes);
  });
});
