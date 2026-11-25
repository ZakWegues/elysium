import { Duplex } from "node:stream";

/**
 * Várias conexões dentro de uma conversa cifrada da ponte (25/11). Quadro: [tipo][u32 fluxo][dados].
 * Cada conexão que o celular abre na ponta dele vira aqui um `Fluxo`, que o servidor HTTP do PC
 * atende como se fosse um socket — nenhuma rota precisou mudar. Crédito dos dois lados: quem manda
 * só manda o que o outro já tem espaço para receber.
 */
export const ABRIR = 1, DADOS = 2, FIM = 3, CORTE = 4, CREDITO = 5;
export const JANELA = 512 * 1024;
export const PEDACO = 60 * 1024;
const MAX_FLUXOS = 64;

export function quadro(tipo: number, id: number, dados: Buffer = Buffer.alloc(0)): Buffer {
  const b = Buffer.allocUnsafe(5 + dados.length);
  b[0] = tipo;
  b.writeUInt32BE(id, 1);
  dados.copy(b, 5);
  return b;
}
export const u32 = (n: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };

export class Fluxo extends Duplex {
  private credito = JANELA;
  private espera: { resto: Buffer; pronto: (e?: Error | null) => void } | null = null;
  private porDevolver = 0;
  private cheio = false;
  private acabouLa = false;
  private acabouAqui = false;

  constructor(readonly id: number, readonly remoteAddress: string, private readonly mandar: (q: Buffer) => void, private readonly aoSumir: () => void) {
    super({ allowHalfOpen: true });
  }

  // ── o que chega do celular ──
  recebeu(dados: Buffer): void {
    this.porDevolver += dados.length;
    this.cheio = !this.push(dados);
    if (!this.cheio) this.devolver();
  }
  fim(): void { if (!this.acabouLa) { this.acabouLa = true; this.push(null); } }
  ganhou(n: number): void {
    this.credito += n;
    if (!this.espera) return;
    const { resto, pronto } = this.espera;
    this.espera = null;
    this.despachar(resto, pronto);
  }
  private devolver(): void {
    if (!this.porDevolver || this.destroyed) return;
    // Em lotes: um crédito por pedaço lido dobraria o número de mensagens.
    if (this.porDevolver < JANELA / 4) return;
    this.mandar(quadro(CREDITO, this.id, u32(this.porDevolver)));
    this.porDevolver = 0;
  }

  // ── o que o PC responde ──
  private despachar(b: Buffer, pronto: (e?: Error | null) => void): void {
    while (b.length) {
      const n = Math.min(PEDACO, this.credito, b.length);
      if (n <= 0) { this.espera = { resto: b, pronto }; return; }
      this.credito -= n;
      this.mandar(quadro(DADOS, this.id, b.subarray(0, n)));
      b = b.subarray(n);
    }
    pronto();
  }
  override _read(): void { if (this.cheio) { this.cheio = false; } this.devolver(); }
  override _write(b: Buffer, _enc: BufferEncoding, pronto: (e?: Error | null) => void): void { this.despachar(b, pronto); }
  override _final(pronto: (e?: Error | null) => void): void {
    this.acabouAqui = true;
    this.mandar(quadro(FIM, this.id));
    pronto();
  }
  override _destroy(e: Error | null, pronto: (e?: Error | null) => void): void {
    if (!(this.acabouAqui && this.acabouLa)) this.mandar(quadro(CORTE, this.id));
    this.espera = null;
    this.aoSumir();
    pronto(e);
  }

  // O que o servidor HTTP espera de um socket e aqui não faz diferença.
  setTimeout(): this { return this; }
  setNoDelay(): this { return this; }
  setKeepAlive(): this { return this; }
  ref(): this { return this; }
  unref(): this { return this; }
}

export class Fluxos {
  private readonly vivos = new Map<number, Fluxo>();
  constructor(private readonly endereco: string, private readonly mandar: (q: Buffer) => void, private readonly atender: (f: Fluxo) => void) {}

  get quantos(): number { return this.vivos.size; }

  recebeu(q: Buffer): void {
    if (q.length < 5) return;
    const tipo = q[0], id = q.readUInt32BE(1), dados = q.subarray(5);
    if (tipo === ABRIR) {
      if (this.vivos.has(id) || this.vivos.size >= MAX_FLUXOS) { this.mandar(quadro(CORTE, id)); return; }
      const f = new Fluxo(id, this.endereco, this.mandar, () => this.vivos.delete(id));
      f.on("error", () => { /* o servidor HTTP trata; sem isto, derrubaria o processo */ });
      this.vivos.set(id, f);
      this.atender(f);
      return;
    }
    const f = this.vivos.get(id);
    if (!f) { if (tipo === DADOS) this.mandar(quadro(CORTE, id)); return; }
    if (tipo === DADOS) f.recebeu(Buffer.from(dados));
    else if (tipo === FIM) f.fim();
    else if (tipo === CORTE) f.destroy();
    else if (tipo === CREDITO && dados.length === 4) f.ganhou(dados.readUInt32BE(0));
  }

  fechar(): void { for (const f of [...this.vivos.values()]) f.destroy(); }
}
