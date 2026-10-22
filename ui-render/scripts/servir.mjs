// Serve a pasta dist/ só para a galeria de dev (127.0.0.1:8095). Nada disso entra no app.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "dist");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const PORTA = Number(process.env.PORTA ?? 8095);
http.createServer((req, res) => {
  const nome = path.basename(decodeURIComponent((req.url ?? "/").split("?")[0])) || "galeria.html";
  const arq = path.join(dist, nome);
  if (!arq.startsWith(dist) || !fs.existsSync(arq)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(arq)] ?? "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(arq).pipe(res);
}).listen(PORTA, "127.0.0.1", () => console.log(`galeria em http://127.0.0.1:${PORTA}/galeria.html`));
