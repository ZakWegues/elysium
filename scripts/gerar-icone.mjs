/**
 * Gera o ícone do ELYSIUM: `build/icon.png` (256) e `build/icon.ico` (multi-tamanho).
 *
 * POR QUE POR CÓDIGO, E NÃO UM ARQUIVO SOLTO
 *
 * O projeto tem quatro dependências em produção, de propósito, e nenhuma biblioteca de
 * imagem. Um PNG é fácil de escrever à mão com o `zlib` que já vem no Node, e um gerador
 * versionado deixa o ícone reproduzível: mudar a cor da marca é editar uma constante e
 * rodar de novo, em vez de caçar o arquivo original num editor qualquer.
 *
 * POR QUE UM .ICO MULTI-TAMANHO
 *
 * A bandeja do Windows desenha em 16px. Entregar só um PNG de 256 faz o Windows encolher
 * na hora, e o resultado fica borrado justamente no tamanho em que o ícone mais aparece.
 * Cada tamanho aqui é RENDERIZADO no seu tamanho, com supersampling — não é redução do
 * maior.
 *
 * USO
 *   node scripts/gerar-icone.mjs
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Paleta do tema "Campos Elísios". Ouro sobre azul-noite.
const OURO_CLARO = [242, 212, 155];
const OURO       = [217, 177, 104];
const OURO_FUNDO = [166, 126, 58];
const NOITE      = [10, 12, 20];

const TAMANHOS = [16, 24, 32, 48, 64, 128, 256];
const SS = 4; // supersampling por eixo

// ── desenho ───────────────────────────────────────────────────────────────────

function mistura(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * A marca é um "E" geométrico: três barras horizontais e a haste.
 *
 * Letra em vez de símbolo abstrato porque em 16px o que sobra de um símbolo é um borrão.
 * As proporções são frações do lado para o desenho ser idêntico em qualquer tamanho.
 */
function dentroDoE(x, y) {
  const haste = x >= 0.30 && x <= 0.40;
  const nasBarras = x >= 0.30 && x <= 0.68;
  const barraTopo = nasBarras && y >= 0.26 && y <= 0.355;
  const barraMeio = x >= 0.30 && x <= 0.60 && y >= 0.452 && y <= 0.547;
  const barraBase = nasBarras && y >= 0.645 && y <= 0.74;
  return (haste && y >= 0.26 && y <= 0.74) || barraTopo || barraMeio || barraBase;
}

/** O gradiente dourado, na diagonal: mais claro no topo à esquerda, como luz vinda de cima. */
function ouroEm(u, v) {
  const t = Math.min(1, Math.max(0, (u + v) / 2));
  return t < 0.5
    ? mistura(OURO_CLARO, OURO, t * 2)
    : mistura(OURO, OURO_FUNDO, (t - 0.5) * 2);
}

/** Um pixel do ícone, já com alfa. Recebe coordenadas normalizadas de 0 a 1. */
function amostra(u, v) {
  const r = Math.hypot(u - 0.5, v - 0.5);
  if (r > 0.5) return [0, 0, 0, 0];
  if (dentroDoE(u, v)) return [...NOITE, 255];
  return [...ouroEm(u, v), 255];
}

// ── variantes para o Android ──────────────────────────────────────────────────

/**
 * O ícone adaptativo do Android é desenhado em 108dp mas só os 72dp centrais são
 * garantidos: o launcher recorta o resto em círculo, squircle ou o que for. Isso dá uma
 * zona segura de 66% do lado — a marca precisa caber aí dentro, senão o "E" perde as
 * pontas em metade dos aparelhos.
 */
const ZONA_SEGURA = 0.66;

/** Camada da frente: a MESMA marca do desktop, encolhida para a zona segura. */
function amostraFrente(u, v) {
  const cu = (u - 0.5) / ZONA_SEGURA + 0.5;
  const cv = (v - 0.5) / ZONA_SEGURA + 0.5;
  if (cu < 0 || cu > 1 || cv < 0 || cv > 1) return [0, 0, 0, 0];
  return amostra(cu, cv);
}

/** Camada de trás: a noite do tema, com um halo dourado atrás da marca. */
function amostraFundo(u, v) {
  const r = Math.hypot(u - 0.5, v - 0.5);
  const halo = Math.max(0, 1 - r / 0.62) ** 2 * 0.22;
  return [...mistura(NOITE, OURO, halo), 255];
}

/**
 * Camada monocromática do Android 13+: o sistema pinta com a cor do tema do usuário e só
 * o alfa importa. Por isso vai só o "E" — mandar o disco inteiro viraria um borrão
 * chapado, sem marca nenhuma reconhecível.
 */
function amostraMono(u, v) {
  const cu = (u - 0.5) / ZONA_SEGURA + 0.5;
  const cv = (v - 0.5) / ZONA_SEGURA + 0.5;
  if (cu < 0 || cu > 1 || cv < 0 || cv > 1) return [0, 0, 0, 0];
  return dentroDoE(cu, cv) ? [255, 255, 255, 255] : [0, 0, 0, 0];
}

/** Ícone do iOS e fallback: quadrado cheio, sem transparência — a Apple recusa alfa. */
function amostraCheia(u, v) {
  const r = Math.hypot(u - 0.5, v - 0.5);
  const fundo = mistura(NOITE, OURO, Math.max(0, 1 - r / 0.62) ** 2 * 0.18);
  const cu = (u - 0.5) / 0.78 + 0.5;
  const cv = (v - 0.5) / 0.78 + 0.5;
  if (cu < 0 || cu > 1 || cv < 0 || cv > 1) return [...fundo, 255];
  const [cr, cg, cb, ca] = amostra(cu, cv);
  return ca > 0 ? [cr, cg, cb, 255] : [...fundo, 255];
}

function renderizar(tamanho, fn = amostra) {
  const px = Buffer.alloc(tamanho * tamanho * 4);

  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      // Supersampling: a borda do disco e as quinas do "E" ficam serrilhadas sem isto,
      // e serrilhado em 16px é o que faz um ícone parecer amador.
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / tamanho;
          const v = (y + (sy + 0.5) / SS) / tamanho;
          const [sr, sg, sb, sa] = fn(u, v);
          const peso = sa / 255;
          r += sr * peso; g += sg * peso; b += sb * peso; a += sa;
        }
      }

      const n = SS * SS;
      const alfa = a / n;
      const soma = a / 255 || 1; // evita divisão por zero em pixel totalmente transparente
      const i = (y * tamanho + x) * 4;
      px[i]     = Math.round(r / soma);
      px[i + 1] = Math.round(g / soma);
      px[i + 2] = Math.round(b / soma);
      px[i + 3] = Math.round(alfa);
    }
  }

  return px;
}

// ── PNG ───────────────────────────────────────────────────────────────────────

const TABELA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pedaco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

function paraPng(px, tamanho) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8;   // 8 bits por canal
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Cada linha começa com o byte de filtro. Zero (sem filtro) basta: o ganho de um
  // filtro melhor seria de bytes num arquivo que já é pequeno.
  const linhas = Buffer.alloc(tamanho * (tamanho * 4 + 1));
  for (let y = 0; y < tamanho; y++) {
    const destino = y * (tamanho * 4 + 1);
    linhas[destino] = 0;
    px.copy(linhas, destino + 1, y * tamanho * 4, (y + 1) * tamanho * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco("IHDR", ihdr),
    pedaco("IDAT", zlib.deflateSync(linhas, { level: 9 })),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
}

// ── ICO ───────────────────────────────────────────────────────────────────────

/**
 * ICO com os quadros em PNG — aceito do Windows Vista em diante, e bem mais simples que
 * o formato DIB antigo, que exigiria máscara AND e linhas de baixo para cima.
 */
function paraIco(quadros) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0); // reservado
  cabecalho.writeUInt16LE(1, 2); // 1 = ícone
  cabecalho.writeUInt16LE(quadros.length, 4);

  const entradas = Buffer.alloc(16 * quadros.length);
  let deslocamento = 6 + entradas.length;

  quadros.forEach((q, i) => {
    const e = i * 16;
    // 256 é gravado como 0: o campo tem um byte só.
    entradas[e]     = q.tamanho >= 256 ? 0 : q.tamanho;
    entradas[e + 1] = q.tamanho >= 256 ? 0 : q.tamanho;
    entradas[e + 2] = 0; // paleta
    entradas[e + 3] = 0; // reservado
    entradas.writeUInt16LE(1, e + 4);   // planos
    entradas.writeUInt16LE(32, e + 6);  // bits por pixel
    entradas.writeUInt32LE(q.png.length, e + 8);
    entradas.writeUInt32LE(deslocamento, e + 12);
    deslocamento += q.png.length;
  });

  return Buffer.concat([cabecalho, entradas, ...quadros.map(q => q.png)]);
}

// ── principal ─────────────────────────────────────────────────────────────────

const quadros = TAMANHOS.map(tamanho => ({
  tamanho,
  png: paraPng(renderizar(tamanho), tamanho),
}));

const destino = path.join(raiz, "build");
fs.mkdirSync(destino, { recursive: true });

const png256 = quadros.find(q => q.tamanho === 256).png;
fs.writeFileSync(path.join(destino, "icon.png"), png256);
fs.writeFileSync(path.join(destino, "icon.ico"), paraIco(quadros));

console.log("desktop:");
console.log(`  icon.png  ${png256.length} bytes (256x256)`);
console.log(`  icon.ico  ${fs.statSync(path.join(destino, "icon.ico")).size} bytes — ${TAMANHOS.join(", ")}`);

/**
 * O ELYSIUM-M também sai daqui, de propósito, apesar de ser outro repositório.
 *
 * A alternativa seria duplicar o desenho da marca nos dois lados — e marca duplicada
 * diverge na primeira correção de cor, sem ninguém perceber até os dois ícones já estarem
 * diferentes. Um gerador só, dois destinos.
 *
 * ⚠️ Trocar ícone no Android exige APK NOVO. Não vai por `npm run update`: é recurso
 * nativo e entra no manifesto.
 */
const argMobile = process.argv.indexOf("--mobile");
const destinoMobile = argMobile !== -1
  ? process.argv[argMobile + 1]
  : path.join(raiz, "..", "elysium-m", "assets");

if (fs.existsSync(destinoMobile)) {
  const mobile = [
    ["android-icon-foreground.png", amostraFrente],
    ["android-icon-background.png", amostraFundo],
    ["android-icon-monochrome.png", amostraMono],
    ["icon.png",                    amostraCheia],
    ["favicon.png",                 amostraCheia],
  ];

  console.log(`\nELYSIUM-M (${path.relative(raiz, destinoMobile)}):`);
  for (const [nome, fn] of mobile) {
    // 1024 é o que o Expo pede para o ícone adaptativo.
    const png = paraPng(renderizar(1024, fn), 1024);
    fs.writeFileSync(path.join(destinoMobile, nome), png);
    console.log(`  ${nome.padEnd(30)} ${png.length} bytes`);
  }
  console.log("\n  Lembre: ícone novo no Android só chega com APK novo (npm run build:local).");
} else {
  console.log(`\nELYSIUM-M: pasta não encontrada (${destinoMobile}) — pulando.`);
}
