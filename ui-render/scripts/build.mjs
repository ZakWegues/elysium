// Build do renderer: um `dist/render.html` autocontido (JS e CSS dentro). Num iframe sandbox sem
// allow-same-origin a origem é opaca e o `'self'` do CSP não casa com arquivo nenhum — inline é o
// que funciona igual no PC (file://) e no celular (asset do APK).
//   node scripts/build.mjs            → dist/render.html (+ dist/protocolo.js para os hosts)
//   node scripts/build.mjs --galeria  → também dist/galeria.html (página de dev, sem modelo)
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pathToFileURL } from "node:url";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const dist = path.join(raiz, "dist");
fs.mkdirSync(dist, { recursive: true });
const producao = { "process.env.NODE_ENV": '"production"' };

/** Só o woff2 das fontes do KaTeX (os navegadores do PC e do celular leem), embutido em data:. */
const fontesDoKatex = {
  name: "katex-woff2",
  setup(b) {
    b.onLoad({ filter: /katex\.min\.css$/ }, (a) => ({
      contents: fs.readFileSync(a.path, "utf8").replace(/,url\(fonts\/[^)]+\.(woff|ttf)\) format\("(woff|truetype)"\)/g, ""),
      loader: "css",
      resolveDir: path.dirname(a.path),
    }));
  },
};

const r = await build({
  entryPoints: [path.join(raiz, "src/render.tsx")],
  bundle: true, minify: true, format: "esm", platform: "browser", target: ["chrome110"],
  write: false, outdir: dist, logLevel: "warning", jsx: "automatic", define: producao,
  loader: { ".woff2": "dataurl" },
  plugins: [fontesDoKatex],
});
const js = r.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = r.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";

// O CSP da tela. 'unsafe-inline': o próprio código vem inline, e o HtmlView (srcdoc) herda esta
// política. 26/10: sem o mapa de rua, a tela não fala com ninguém; fotos vêm do host.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' blob:",
  "style-src 'unsafe-inline'",
  "img-src data: blob: https://upload.wikimedia.org https://i.ytimg.com",
  "font-src data:",
  "connect-src 'none'",
  "worker-src blob:",
  "frame-src 'self' about: data:",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

const html = `<!doctype html>
<html lang="pt-BR" data-theme="dark">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Tela da Ely</title>
<style>${css.replace(/<\/style/gi, "<\\/style")}</style>
</head>
<body>
<div id="raiz"></div>
<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>
`;
fs.writeFileSync(path.join(dist, "render.html"), html);
// 26/10: orçamento de tamanho — o renderer vai junto no app do celular (OTA) e abre em cada tela.
const ORCAMENTO = 2.2 * 1024 * 1024;
console.log(`render.html: ${(html.length / 1024 / 1024).toFixed(2)} MB`);
if (html.length > ORCAMENTO) throw new Error(`render.html passou do orçamento (${html.length} > ${ORCAMENTO})`);

// O schema e o prompt das telas, tirados da própria biblioteca (Node, com o mapa/katex em stub).
const stub = path.join(raiz, "scripts", "stub.mjs");
const gen = await build({
  entryPoints: [path.join(raiz, "src/gerar-artefatos.ts")], bundle: true, format: "esm", platform: "node", write: false, logLevel: "warning",
  jsx: "automatic", loader: { ".css": "empty" }, define: producao,
  plugins: [{ name: "stub", setup(b) { b.onResolve({ filter: /^(katex)$/ }, () => ({ path: stub })); } }],
});
const tmp = path.join(dist, ".gerar.mjs");
fs.writeFileSync(tmp, gen.outputFiles[0].text);
const tamanhos = (await import(`${pathToFileURL(tmp).href}?${Date.now()}`)).gerar(dist);
fs.rmSync(tmp);
console.log(`schema.json: ${(tamanhos.schema / 1024).toFixed(0)} KB, prompt.txt: ${(tamanhos.prompt / 1024).toFixed(0)} KB (~${Math.round(tamanhos.prompt / 4 / 1000)}k tokens)`);

// O validador do PC (CommonJS, sem React): parser do lang-core + schema.
await build({
  entryPoints: [path.join(raiz, "src/validador.ts")], bundle: true, minify: true, format: "cjs", platform: "node", target: "node20",
  outfile: path.join(dist, "validador.cjs"), logLevel: "warning",
});

// O protocolo, para os hosts validarem o que vem da tela (o PC importa este arquivo).
await build({
  entryPoints: [path.join(raiz, "src/protocolo.ts")], bundle: true, minify: true, format: "esm", platform: "neutral",
  outfile: path.join(dist, "protocolo.js"), logLevel: "warning",
});

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const bruto = Buffer.byteLength(html);
console.log(`render.html: ${kb(bruto)} (gzip ${kb(zlib.gzipSync(html, { level: 9 }).length)})`);

if (process.argv.includes("--galeria")) {
  await import("./galeria.mjs");
}
