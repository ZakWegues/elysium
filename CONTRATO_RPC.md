# Contrato desktop ↔ Portal — mudanças do Bloco 1

> Cole isto na sessão do `neuroaxis-portal` quando ela for retomada. Descreve tudo que
> mudou no servidor da porta 4200 e no formato do QR de pareamento.

Implementado em `c:\Users\ZAK\neuroaxis`, build passando, testado por curl contra o app rodando.

---

## 1. Nova superfície RPC — `/api/rpc`

Motivo: até agora a única porta de comando era `POST /api/command`, que joga o texto no
cérebro Llama. Isso é certo pra voz e errado pra botão — a `PresetsScreen` montava frases
em português ("liste meus presets") pra executar ação. RPC é determinístico e validado.

### `GET /api/rpc` — descoberta
```json
{ "methods": [ { "method": "apps.list", "destructive": false }, … ] }
```
Serve pra detectar divergência de versão entre celular e PC.

### `POST /api/rpc` — chamada
Requisição:
```json
{ "method": "system.killProcess", "params": { "pid": 4821 } }
```
Resposta OK (200):
```json
{ "result": { "ok": true } }
```
Resposta de erro — sempre `{ "error": "<mensagem em PT-BR>" }` com status:

| status | quando |
|---|---|
| 400 | params inválidos ou faltando |
| 401 | token errado/ausente |
| 403 | método destrutivo sem o header de confirmação |
| 404 | método desconhecido |
| 413 | corpo acima de 8 MB |
| 429 | mais de 120 requisições em 10 s pelo mesmo IP |
| 500 | o executor falhou (mensagem original preservada) |

### Métodos disponíveis

| método | params | retorno | destrutivo |
|---|---|---|---|
| `system.telemetry` | — | `DashboardTelemetry` (cpu_pct, ram_pct, battery_pct, battery_charging, cpu_temp, disks[], processes[]) | não |
| `system.processes` | — | `{ processes: ProcessEntry[] }` | não |
| `system.disks` | — | `{ disks: DiskEntry[] }` | não |
| `system.killProcess` | `{ pid: number }` | `{ ok: true }` | **sim** |
| `apps.list` | — | `{ apps: [{ key, command }] }` (do `apps.json`) | não |
| `apps.open` | `{ name: string }` | `{ ok: true, message }` | não |
| `apps.close` | `{ name: string }` | `{ ok: true, message }` | **sim** |
| `clipboard.get` | — | `{ text: string }` | não |
| `clipboard.set` | `{ text: string }` | `{ ok: true, length }` | não |

### Confirmação de métodos destrutivos
Métodos marcados `destructive` exigem o header:
```
X-Neuroaxis-Confirm: 1
```
Sem ele → **403**. A intenção é o app só mandar esse header depois de validar biometria
(`expo-local-authentication`), como trava contra toque acidental. Não é defesa contra quem
já tem o token — contra esse, a defesa é o token não vazar.

O cliente já está escrito no Portal: `src/lib/rpc.ts`, função `callRpc(pairing, method, params, { confirmed })`.

---

## 2. ⚠️ Breaking — CORS removido

`Access-Control-Allow-Origin: *` **saiu** do servidor. O cliente é app nativo, não browser,
e nunca precisou de preflight. Manter o `*` deixava qualquer página aberta em qualquer
máquina da rede chamar uma API que agora lê clipboard e mata processos.

**Efeito:** `expo start --web` deixa de conseguir falar com o desktop. Android e iOS não são
afetados. Se o alvo web voltar a importar, a decisão precisa ser revisitada.

---

## 3. Rate limit e teto de corpo

- **120 requisições por 10 s por IP de origem** → acima disso, 429. Verificado: 120 passam, o resto barra.
- **Corpo máximo de 8 MB** em qualquer POST → 413. Anexo de mailbox de 5 MB vira ~6,7 MB em
  base64, então cabe com folga.
- Comparação de token agora é de tempo constante (`crypto.timingSafeEqual`).

O polling atual do Portal (mailbox 15 s, badge 45 s, telemetria por WS) está muito abaixo do
limite. Só vale atenção se alguma tela nova começar a poll agressivo.

---

## 4. ⚠️ Breaking — QR de pareamento v2

Antes: `{ "ip", "port", "token" }`
Agora:
```json
{
  "v": 2,
  "ip": "192.168.15.22",
  "port": 4200,
  "token": "…",
  "hostname": "DESKTOP-ZAK",
  "endpoints": ["192.168.15.22", "100.x.y.z"]
}
```

`endpoints` traz **todos** os IPv4 da máquina, ordenados: Wi-Fi/Ethernet primeiro, túnel
(Tailscale/ZeroTier) depois, adaptadores virtuais por último. `ip` continua presente só por
compatibilidade com um Portal antigo.

Motivo: o IP ficava congelado no momento do QR. Bastava o DHCP redistribuir pro app perder o
PC, sem recuperação além de reparear. E com o túnel na lista, o mesmo pareamento funciona
fora de casa.

**Já implementado no Portal** (`src/lib/pairing.ts`):
- `Pairing` virou `{ endpoints[], activeIp, port, token, hostname? }`
- migração automática do formato v1 no `loadPairing()`
- `resolveActiveEndpoint()` corre todos os candidatos em paralelo e fixa o vencedor
- `scanSubnet()` varre a /24 como último recurso (só sob pedido do usuário)

---

## 5. O que o Portal ganhou junto (já feito)

- `src/lib/http.ts` — `fetchWithTimeout` obrigatório; **nenhum fetch tinha timeout antes**,
  então PC fora do ar = spinner eterno. Timeouts: sondagem 2,5 s · normal 8 s · comando 45 s ·
  anexo 60 s.
- `src/lib/commandQueue.ts` — comando digitado offline entra na fila e é reenviado sozinho
  quando o PC volta (validade de 30 min, teto de 20 itens).
- `src/lib/useConnection.ts` + `src/components/ConnectionBanner.tsx` — estado de conexão
  central, troca de endereço automática, faixa acima da TabBar com "Tentar" e "Procurar".
- `Promise.any` **evitado de propósito** no caminho de conexão: suporte varia por versão do
  Hermes. Há um `firstSuccess()` escrito à mão em `pairing.ts`.
- Script `npm run typecheck` adicionado (não existia).

---

## 6. Ainda não implementado (próximos blocos do plano)

Métodos RPC que virão e que o app vai consumir: `screen.capture`, `input.*` (trackpad e
teclado), `power.*`, `media.*` (Spotify Web API), `reminders.*`, `memory.*`, `push.register`,
`vision.ask`.
