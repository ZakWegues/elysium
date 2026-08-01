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
| `power.control` | `{ operation: "shutdown"\|"restart"\|"sleep"\|"lock"\|"cancel", delaySeconds?: number }` | `{ ok: true, message }` | **sim** |
| `media.control` | `{ operation: "play"\|"pause"\|"skip"\|"previous"\|"volume_up"\|"volume_down" }` | `{ ok: true, message }` | não |
| `volume.set` | `{ level: number 0-100 \| "up"\|"down"\|"mute"\|"unmute" }` | `{ ok: true, message }` | não |
| `screen.list` | — | `{ screens: [{ id, name, width, height, isPrimary }] }` | não |
| `screen.capture` | `{ sourceId?, maxWidth?, quality? }` | `{ base64, width, height, capturedAt, sourceId, sourceName }` | não |
| `input.ping` | — | `{ ok: true }` | não |
| `input.move` | `{ dx: number, dy: number }` | `{ ok: true }` | não |
| `input.click` | `{ button?: "left"\|"right"\|"middle" }` | `{ ok: true }` | não |
| `input.doubleClick` | `{ button? }` | `{ ok: true }` | não |
| `input.buttonDown` / `input.buttonUp` | `{ button? }` | `{ ok: true }` | não |
| `input.scroll` | `{ notches: number }` (positivo = pra cima) | `{ ok: true }` | não |
| `input.type` | `{ text: string }` (máx 5000) | `{ ok: true }` | não |
| `input.key` | `{ sequence: string }` (sintaxe SendKeys, máx 200) | `{ ok: true }` | não |
| `memory.list` | — | `{ facts: [{ id, text, createdAt }] }` | não |
| `memory.add` | `{ text: string }` | `{ fact, created: boolean }` | não |
| `memory.remove` | `{ id: string }` | `{ removed: boolean }` | não |
| `reminders.list` | — | `{ reminders: [{ id, text, dueAt, kind, weekday?, createdAt, firedAt? }] }` | não |
| `reminders.create` | `{ text, dueAt: epoch ms, kind?: "once"\|"weekly" }` | `{ reminder }` | não |
| `reminders.cancel` | `{ id: string }` | `{ cancelled: boolean }` | não |
| `push.register` | `{ token: ExpoPushToken }` | `{ added: boolean }` | não |
| `push.unregister` | `{ token }` | `{ removed: boolean }` | não |
| `push.getPrefs` | — | `{ muted, quietFrom, quietTo, deviceCount }` | não |
| `push.setPrefs` | `{ muted?, quietFrom?, quietTo? }` | mesmo shape do get | não |
| `vision.ask` | `{ imageBase64: string, question?: string }` | `{ answer: string }` | não |
| `vision.screen` | `{ question?: string }` | `{ answer: string }` | não |
| `web.search` | `{ query: string }` | `{ answer: string }` | não |
| `spotify.status` | — | `{ connected: boolean }` | não |
| `spotify.login` | — | `{ ok: true, message }` (abre o navegador **no PC**) | não |
| `spotify.logout` | — | `{ ok: true }` | não |
| `spotify.nowPlaying` | — | `{ nowPlaying: { isPlaying, track, artist, album, albumArt, progressMs, durationMs, device } \| null }` | não |
| `spotify.command` | `{ operation: "play"\|"pause"\|"next"\|"previous" }` | `{ ok: true }` | não |
| `spotify.volume` | `{ percent: 0-100 }` | `{ ok: true }` | não |
| `spotify.seek` | `{ positionMs: number }` | `{ ok: true }` | não |
| `spotify.playSearch` | `{ query: string }` | `{ playing: { track, artist } }` | não |

`push.getPrefs` **não** devolve os tokens: são identificadores de aparelho e o app não
precisa deles para desenhar a tela. `push.setPrefs` aplica só as chaves presentes —
mandar `{quietFrom}` não apaga `muted`.

`power.control` sem `delaySeconds` usa 30 segundos para shutdown/restart — a janela existe
justamente pra dar tempo de cancelar. `cancel` também é destrutivo: um método, uma regra.
`shutdown.exe /a` devolve 1116 quando não há nada agendado; isso é tratado como sucesso.

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

- **600 requisições por 10 s por IP de origem** (60/s) → acima disso, 429.
  ⚠️ Era 120/10s no bloco 1 e **foi elevado no bloco 3**: o trackpad remoto manda um
  `input.move` por evento de arrasto e o primeiro deslizar do dedo já batia no 429. O
  objetivo do limite é conter laço descontrolado, não policiar uso legítimo — quem
  autentica é o token. O app também acumula deslocamento e envia no máximo 25/s.
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

## 6. Bloco 2 — o que mudou no app

- Aba **Telemetria virou Sistema** (`SystemScreen.tsx`), com quatro seções: Monitor (a
  telemetria por WS de antes, agora embutida), Processos (lista + discos + encerrar),
  Apps (abrir/fechar do `apps.json`) e Controle (energia, área de transferência, mídia,
  volume). `Screen` mudou de `'telemetry'` para `'system'`.
- `TelemetryScreen` ganhou a prop `embedded` para não repetir cabeçalho dentro de Sistema.
- **Guarda biométrica** (`src/lib/confirm.ts`): toda chamada destrutiva passa por
  `confirmDestructive()` antes de mandar `X-Neuroaxis-Confirm`. Sem hardware biométrico
  cadastrado, cai num Alert de confirmação explícita.
- `DESTRUCTIVE_METHODS` em `src/lib/rpc.ts` espelha a marcação do desktop.

Nova voz no cérebro: `power_control`, com exemplos para "desliga o PC", "reinicia",
"bloqueia a tela" e "cancela o desligamento". Distinção explícita no prompt entre
`power_control` (desliga a máquina) e `close_app` (fecha um programa) — verificado.

## 7. Bloco 3 — espelhamento e entrada remota

**Nova aba "Remoto"** no app (`RemoteScreen.tsx`), com duas seções: Espelho e Trackpad.
`Screen` ganhou `'remote'`.

### Números medidos, não estimados
- **Captura de tela: ~640 ms por quadro, e esse custo é fixo.** Testado com `maxWidth`
  de 480, 640, 900 e 1280: a latência não muda, só o tamanho do JPEG (19 KB a 85 KB). O
  gargalo é o `desktopCapturer.getSources()` do Electron, não o redimensionamento.
  Consequência de projeto: teto de ~1,5 quadro/s, e pedir quadro grande é praticamente
  de graça. O app usa 1100 px a cada 1200 ms.
- **Host de entrada: 0,08 ms por comando** depois de quente, contra ~480 ms na primeira
  chamada (compilar o interop C#). É por isso que existe `input.ping`: a tela de
  trackpad chama ao abrir para pagar esse custo antes do primeiro toque, não durante.

### Decisões que valem conhecer
- A captura usa `desktopCapturer` do Electron, **não** o PowerShell de
  `src/actions/screenshot.ts` — aquele abre processo, carrega System.Drawing e escreve
  no disco.
- A entrada usa um **PowerShell persistente** (`src/services/inputHost.ts`) que lê
  comandos linha a linha do stdin. Um processo por evento custaria ~200 ms, inviável
  para arrasto. Sem módulo nativo: robotjs/nut-js exigiriam rebuild casado com a versão
  do Electron a cada atualização.
- **Digitação usa `SendInput` com `KEYEVENTF_UNICODE`, não `SendKeys`.** Descoberto em
  teste real: `SendKeys` traduz o caractere para tecla virtual pelo layout ativo
  (`VkKeyScan`), e no ABNT brasileiro acentos exigem dead keys que essa API não
  expressa — texto com acento saía corrompido. `SendKeys` continua sendo usado só no
  `input.key`, onde a sintaxe de combos (`{ENTER}`, `^c`, `%{TAB}`) é exatamente o
  que ele faz bem.
- Os `input.*` **não** são marcados como destrutivos: pedir biometria a cada movimento
  de cursor tornaria o trackpad inutilizável. A trava fica na entrada da tela, no app.

## 8. Bloco 4 — memória, lembretes e push

**Novas gavetas** na guia de controle: Lembretes e Memória. **Nova seção nos Ajustes:**
Notificações, com registro do aparelho e chaves por categoria.

### Push chega fora de casa
O PC envia pelo serviço da Expo (`exp.host`), **não** pela rede local. É isso que faz um
lembrete alcançar o celular no 4G, longe de casa, sem relay próprio e sem depender do
túnel. O aparelho registra seu `ExpoPushToken` via `push.register` no pareamento.
Quando a Expo responde `DeviceNotRegistered` (app desinstalado), o token é removido
sozinho — senão o PC tentaria para sempre.

Categorias: `reminder`, `anomaly`, `mailbox`. Lembrete atravessa a janela de silêncio de
propósito: foi o usuário que pediu por ele naquela hora. Só a RAM alta vira push entre as
anomalias — pico de CPU é passageiro demais e viraria spam.

⚠️ Em build standalone o push exige credenciais FCM no projeto EAS. Em Expo Go e em
emulador não funciona; o app detecta e explica em vez de falhar em silêncio.

### Lembretes
`src/services/scheduler.ts`. Persistidos em disco e re-armados no boot — um lembrete só
em memória morreria junto com o app, que reinicia toda vez que o PC liga. Só o próximo
disparo fica agendado por vez; a lista em disco é o estado de verdade.

O que venceu com o PC desligado **dispara na volta**, de propósito: melhor avisar
atrasado que engolir. Um `weekly` atrasado avança em semanas até passar do agora, em vez
de disparar uma vez por semana perdida.

A interpretação de "amanhã às 9" fica com o Llama, que devolve ISO — mais robusto que
regex de data em português. Para isso o system prompt passou a carregar a data e a hora
atuais. Lembrete calculado no passado é recusado com uma pergunta, não disparado na hora.

### Memória
`src/services/memoryStore.ts`. Fatos curtos injetados no system prompt a cada pedido —
por isso o teto de 20 itens e 200 caracteres. O histórico de conversa do `brain.ts` é
volátil e some por inatividade; nada dito ontem sobrevive sem isto.

### ⚠️ Limite de tokens da Groq
O system prompt cresceu a cada bloco e chegou a ~4000 tokens, levando as chamadas a
~5400 tokens. O nível gratuito da Groq permite 12000 tokens/minuto — ou seja, cerca de
**dois comandos por minuto** antes do 429. Os exemplos foram enxugados de 52 para 22
(−26% no prompt), mantendo os que resolvem ambiguidade. Ainda é apertado: ver as opções
no `HANDOFF.md`.

## 9. Bloco 5 — visão e busca na web

**Nenhuma conta nova, nenhuma chave nova.** O plano previa Tavily para busca e um
modelo de visão a confirmar; a API da Groq foi consultada antes de escrever qualquer
código e resolveu as duas coisas com a chave que já existia.

### O que a conta realmente oferece (levantado em 01/08/2026)
- **Visão: `qwen/qwen3.6-27b`.** É o único modelo da conta que aceita `image_url` —
  nenhum `llama-4`/`scout`/`maverick` aparece na lista. É modelo de raciocínio e emite
  blocos `<think>` antes da resposta; `vision.ts` os remove, inclusive o caso do bloco
  não fechado por corte de tokens, senão o assistente falaria o próprio pensamento em
  voz alta.
- **Busca: `groq/compound-mini`.** Sistema agêntico que pesquisa sozinho e devolve a
  resposta redigida (`executed_tools: search` na resposta). Por isso não existe chave de
  serviço de busca em lugar nenhum do projeto. Aceita **só texto** — mandar conteúdo
  multimodal devolve `messages[0].content must be a string`.

### No app
- Botão de câmera no chat → foto → pergunta → resposta falada (`CameraAsk.tsx`). Foto
  vai em qualidade 0,5 de propósito: quem lê é um modelo, não o olho.
- Botão "Perguntar sobre a tela" no espelho. Ele **não** reaproveita o quadro já
  baixado: o do espelho é comprimido para caber na rede, e texto pequeno — justo o que
  se costuma querer ler — não sobrevive a isso. O PC captura de novo em qualidade maior.

### Ações de voz novas
`web_search` e `look_at_screen`. O prompt ganhou duas distinções: fato estável é `chat`
e fato que muda é `web_search`; `look_at_screen` lê e responde, `screenshot` só salva.

## 10. Spotify

### A rota sem autenticação
`GET /api/spotify/callback` é **a única rota do servidor sem bearer token**, e não há
como ser diferente: quem chega nela é o navegador redirecionado pelo Spotify, que não
tem como carregar o nosso token. A proteção equivalente é o `state` aleatório conferido
contra o login em andamento — sem ele a troca de código é recusada. Verificado: `state`
inventado devolve erro, e a isenção não vaza (o `/api/rpc` sem token segue dando 401).

### PKCE, sem client secret
O app roda na máquina do usuário, então um "segredo" embutido não é segredo. O
`spotifyClientId` fica versionado no `config.ts` de propósito: no PKCE ele é público por
natureza, aparece na própria URL de login. **O refresh token nunca é versionado** — vive
no perfil do usuário via electron-store.

Redirect URI cadastrado: `http://127.0.0.1:4200/api/spotify/callback`. Tem que ser
loopback explícito; o Spotify passou a rejeitar `localhost`.

### Spotify na frente, teclas de mídia atrás
`media_control` tenta o Spotify quando há sessão e **cai nas teclas virtuais em qualquer
falha** — sem Premium, sem dispositivo ativo, ou tocando em outro player. O usuário não
precisa saber qual caminho foi usado, só que a música pausou. `volume_up`/`volume_down`
vão sempre pelas teclas: a API só aceita volume absoluto, e ler o atual para somar
custaria uma chamada a mais e sairia dessincronizado.

`play_music` agora toca de verdade no dispositivo ativo; antes o melhor possível era
abrir o app já na busca certa.

## 11. Ainda não implementado

Bloco 6: Home de atalhos, modo escuro, compartilhar do Android, e o build do APK.
