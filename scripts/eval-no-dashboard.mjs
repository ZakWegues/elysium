/**
 * Executa uma expressão dentro do renderer do dashboard e imprime o resultado.
 *
 * POR QUE ISTO EXISTE
 *
 * Parte do que o desktop faz só existe no renderer — a ponte RPC, o sistema de temas, as
 * telas. Testar isso "por curl" é impossível, e testar só o serviço por baixo não prova que
 * a ponte foi ligada: nome de canal errado no preload dá exatamente o mesmo resultado que
 * um serviço funcionando, com a tela quebrada em silêncio.
 *
 * O app precisa estar rodando com a porta de depuração aberta:
 *
 *   electron . --remote-debugging-port=9222
 *
 * USO
 *   node scripts/eval-no-dashboard.mjs "typeof window.nx.rpc"
 *   node scripts/eval-no-dashboard.mjs "await window.nx.rpc('memory.list')"
 *
 * ⚠️ Ferramenta de desenvolvimento. A porta de depuração dá controle total sobre a janela,
 * então não é para ficar ligada no uso normal.
 */

const PORTA = Number(process.env.ELYSIUM_DEBUG_PORT || 9222);
const expressao = process.argv[2];

if (!expressao) {
  console.error('uso: node scripts/eval-no-dashboard.mjs "<expressão>"');
  process.exit(1);
}

const alvos = await fetch(`http://127.0.0.1:${PORTA}/json`).then(r => r.json()).catch(() => null);
if (!alvos) {
  console.error(`Não achei a porta de depuração em ${PORTA}. Abra o app com --remote-debugging-port=${PORTA}.`);
  process.exit(1);
}

// O app tem três janelas; a do dashboard é a que interessa. O recorder é invisível e a de
// configuração não tem a ponte.
const alvo = alvos.find(t => t.type === 'page' && /dashboard\.html/.test(t.url));
if (!alvo) {
  console.error('Dashboard não encontrado. Janelas abertas:');
  for (const t of alvos) console.error(`  [${t.type}] ${t.url}`);
  process.exit(1);
}

const ws = new WebSocket(alvo.webSocketDebuggerUrl);

const pronto = new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve);
  ws.addEventListener('error', () => reject(new Error('falha ao abrir o WebSocket de depuração')));
});
await pronto;

const resposta = new Promise(resolve => {
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id === 1) resolve(msg.result);
  });
});

ws.send(JSON.stringify({
  id: 1,
  method: 'Runtime.evaluate',
  params: {
    // `await` na expressão exige os dois: sem awaitPromise o retorno seria uma Promise
    // pendente, e sem returnByValue viria só um handle de objeto remoto.
    expression: `(async () => (${expressao}))()`,
    awaitPromise: true,
    returnByValue: true,
  },
}));

const r = await resposta;
ws.close();

if (r.exceptionDetails) {
  console.error('exceção no renderer:', r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  process.exit(1);
}
console.log(JSON.stringify(r.result?.value, null, 2));
