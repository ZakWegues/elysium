import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const dados = fs.mkdtempSync(path.join(os.tmpdir(), "ely-caixa-"));
vi.mock("electron", () => ({ app: { getPath: () => dados } }));

import { abrirPedido, idValido, parar, pedaco, retomar, soltarDestino, terminar, zerarPedidos } from "../src/services/retomada";
import { caminhoProibido, escolherArquivo, nomeCasa, procurarArquivos } from "../src/services/acharArquivo";

describe("retomada da resposta (21/10)", () => {
  beforeEach(() => zerarPedidos());

  it("o socket cai no meio e outro socket pega o que veio e o resto", () => {
    const a: string[] = [];
    const envioA = (t: string) => a.push(t);
    const p = abrirPedido("pedido-0001", "oi", envioA)!;
    pedaco(p, "Olá, ");
    soltarDestino(envioA); // caiu
    pedaco(p, "tudo ");
    const b: string[] = [];
    expect(retomar("pedido-0001", (t) => b.push(t))).toBe(true);
    pedaco(p, "bem.");
    terminar(p, { type: "reply", reply: "Olá, tudo bem." });
    expect(a.length).toBe(1);
    expect(JSON.parse(b[0])).toEqual({ type: "retomada", id: "pedido-0001", text: "Olá, tudo " });
    expect(JSON.parse(b[1])).toMatchObject({ type: "chunk", text: "bem." });
    expect(JSON.parse(b[2])).toMatchObject({ type: "reply", reply: "Olá, tudo bem.", id: "pedido-0001" });
  });

  it("retomar depois de terminar entrega o final; id desconhecido ou parado falha", () => {
    const p = abrirPedido("pedido-0002", "oi", () => {})!;
    terminar(p, { type: "reply", reply: "ok" });
    const b: string[] = [];
    expect(retomar("pedido-0002", (t) => b.push(t))).toBe(true);
    expect(b.map(x => JSON.parse(x).type)).toEqual(["retomada", "reply"]);
    expect(retomar("nao-existe-00", () => {})).toBe(false);
    parar("pedido-0002");
    expect(retomar("pedido-0002", () => {})).toBe(false);
  });

  it("o mesmo pedido chegando duas vezes não roda duas vezes", () => {
    expect(abrirPedido("pedido-0003", "x", () => {})).not.toBeNull();
    expect(abrirPedido("pedido-0003", "x", () => {})).toBeNull();
  });

  it("id só com o formato esperado", () => {
    expect(idValido("a1b2c3d4-e5f6")).toBe(true);
    expect(idValido("curto")).toBe(false);
    expect(idValido("../../etc/passwd")).toBe(false);
    expect(idValido(42)).toBe(false);
  });

  it("vence em 10 minutos", () => {
    abrirPedido("pedido-0004", "x", () => {}, 0);
    expect(retomar("pedido-0004", () => {}, 11 * 60_000)).toBe(false);
  });
});

describe("achar o arquivo para mandar ao celular (21/10)", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "ely-pastas-"));
  const docs = path.join(raiz, "Documentos");
  fs.mkdirSync(path.join(docs, "Faculdade"), { recursive: true });
  fs.mkdirSync(path.join(docs, "node_modules"), { recursive: true });
  fs.writeFileSync(path.join(docs, "Faculdade", "Relatório Final.pdf"), "x");
  fs.writeFileSync(path.join(docs, "relatorio-rascunho.docx"), "x");
  fs.writeFileSync(path.join(docs, "node_modules", "relatorio.pdf"), "x");

  it("acha pelo nome sem acento, sem entrar em node_modules", () => {
    const r = procurarArquivos("relatorio final", [docs], []);
    expect(r.map(a => a.nome)).toEqual(["Relatório Final.pdf"]);
    expect(procurarArquivos("relatorio", [docs], []).length).toBe(2);
  });

  it("um só manda; vários perguntam; caminho por extenso vale; sistema e ELYSIUM nunca", () => {
    expect(escolherArquivo("relatorio final", procurarArquivos("relatorio final", [docs], []), []).tipo).toBe("um");
    expect(escolherArquivo("relatorio", procurarArquivos("relatorio", [docs], []), []).tipo).toBe("varios");
    expect(escolherArquivo("nada-disso", [], []).tipo).toBe("nenhum");
    expect(escolherArquivo("D:\\Fotos\\praia.jpg", [], [], () => true)).toEqual({ tipo: "um", caminho: path.resolve("D:\\Fotos\\praia.jpg") });
    expect(escolherArquivo("D:\\Fotos\\nao-existe.jpg", [], [], () => false).tipo).toBe("nenhum");
    expect(escolherArquivo("C:\\Windows\\System32\\config\\SAM", [], []).tipo).toBe("proibido");
    expect(escolherArquivo(path.join(dados, "elysium-config.json"), [], [dados]).tipo).toBe("proibido");
  });

  it("regras puras", () => {
    expect(nomeCasa("Foto da praia.jpg", "foto praia")).toBe(true);
    expect(nomeCasa("Foto.jpg", "o arquivo")).toBe(false);
    expect(caminhoProibido("C:\\Users\\x\\AppData\\Roaming\\elysium\\a.json", [])).toBe(true);
    expect(caminhoProibido("C:\\Program Files\\App\\x.exe", [])).toBe(true);
  });
});

describe("Caixa: arquivo por caminho e tipo pelo nome (21/10)", async () => {
  const { addFileMessage, getAttachmentFile, getMessageContent, mimePorNome, MAILBOX_MAX_ATTACHMENT_BYTES } = await import("../src/services/mailboxStore");

  it("o tipo sai da extensão", () => {
    expect(mimePorNome("aula.MKV")).toBe("video/x-matroska");
    expect(mimePorNome("nota.pdf")).toBe("application/pdf");
    expect(mimePorNome("foto.heic")).toBe("image/heic");
    expect(mimePorNome("x.desconhecido")).toBe("application/octet-stream");
  });

  it("copia o arquivo, serve pela rota crua e não manda arquivo grande em base64", async () => {
    const grande = path.join(os.tmpdir(), "ely-video-teste.mp4");
    fs.writeFileSync(grande, Buffer.alloc(MAILBOX_MAX_ATTACHMENT_BYTES + 10));
    const r = await addFileMessage("pc", grande, { text: "o vídeo" });
    const arq = getAttachmentFile(r.id)!;
    expect(arq.mimeType).toBe("video/mp4");
    expect(fs.statSync(arq.filePath).size).toBe(MAILBOX_MAX_ATTACHMENT_BYTES + 10);
    expect(arq.filePath.startsWith(dados)).toBe(true);
    expect(getMessageContent(r.id)!.attachment!.base64).toBe("");
    await expect(addFileMessage("pc", path.dirname(grande))).rejects.toThrow();
  });
});
