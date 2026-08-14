# ULTRA HANDOFF — NEUROAXIS

> **Documento único do ecossistema.** Substitui e absorve o antigo `HANDOFF.md`, o
> `CONTRATO_RPC.md` e o `CONTEXTO_NEUROAXIS.md`. Se alguma coisa aqui divergir de outro
> arquivo do repositório, **este aqui vale**.
>
> Última atualização: **13/08/2026**.

---

## Índice

| § | Seção |
|---|---|
| 1 | [Como usar este documento](#1-como-usar-este-documento) |
| 2 | [O ecossistema em uma página](#2-o-ecossistema-em-uma-página) |
| 3 | [O Zak e as regras de trabalho](#3-o-zak-e-as-regras-de-trabalho) |
| 4 | [Estado atual exato](#4-estado-atual-exato) |
| 5 | [Desktop — arquitetura e mapa de arquivos](#5-desktop--arquitetura-e-mapa-de-arquivos) |
| 6 | [O cérebro — ações, prompt e as duas etapas](#6-o-cérebro--ações-prompt-e-as-duas-etapas) |
| 7 | [Modelos da Groq](#7-modelos-da-groq) |
| 8 | [Servidor da porta 4200](#8-servidor-da-porta-4200) |
| 9 | [Superfície RPC — os 52 métodos](#9-superfície-rpc--os-52-métodos) |
| 10 | [Portal — arquitetura e mapa de arquivos](#10-portal--arquitetura-e-mapa-de-arquivos) |
| 11 | [Contratos entre os dois lados](#11-contratos-entre-os-dois-lados) |
| 12 | [Rede e acesso de fora de casa](#12-rede-e-acesso-de-fora-de-casa) |
| 13 | [Build e distribuição](#13-build-e-distribuição) |
| 14 | [Armadilhas](#14-armadilhas) |
| 15 | [Pendências conhecidas](#15-pendências-conhecidas) |
| 16 | [Catálogo de features futuras](#16-catálogo-de-features-futuras) |
| 17 | [Como validar](#17-como-validar) |

---

## 1. Como usar este documento

Ele foi escrito para duas plateias diferentes.

**Se você é o Claude Desktop** (ou qualquer assistente lendo este texto colado, sem acesso
aos arquivos): este documento é tudo que você tem. Ele é autossuficiente de propósito —
caminhos, números e trechos de código estão inline justamente porque você não pode abrir
nada. Quando precisar responder sobre algo que não está aqui, diga que não está aqui em vez
de deduzir; o projeto tem várias decisões contraintuitivas que a dedução erraria.

**Se você é o Claude Code** aberto na pasta-mãe `ELYSIUM` (ou em um dos dois repositórios):
leia isto primeiro, inteiro, antes de abrir código. Ele existe porque quase todo bug caro
deste projeto foi causado por alguém — humano ou modelo — que resolveu algo do zero sem
saber que já tinha sido resolvido, ou que testou de um jeito que já se sabia perigoso.
Depois de ler, o código é a fonte da verdade para *detalhe*; este documento é a fonte da
verdade para *por quê*.

**Onde este arquivo mora, e por que em dois lugares:**

| caminho | papel |
|---|---|
| `ELYSIUM/ULTRA_HANDOFF.md` | O que uma sessão aberta na pasta-mãe lê primeiro. |
| `neuroaxis/ULTRA_HANDOFF.md` | Cópia idêntica, **versionada no git**. É a que sobrevive a perder a máquina. |

A raiz do `ELYSIUM` não é um repositório git. Um documento que só existisse lá não iria pro
GitHub e sumiria junto com o PC — o que seria contraditório, já que ele existe justamente
para sobreviver à perda de contexto. **Ao atualizar, atualize as duas cópias.**

### Inventário dos outros documentos

Cinco documentos concorrentes já divergiram entre si neste projeto. A tabela abaixo existe
para você não perder tempo lendo — nem confiar em — um deles.

| arquivo | vale ler? |
|---|---|
| `neuroaxis/ULTRA_HANDOFF.md` | ✅ **Este.** A fonte de verdade |
| `neuroaxis/HANDOFF.md` | ↪️ Ponteiro para cá |
| `neuroaxis/CONTRATO_RPC.md` | ↪️ Ponteiro para cá (conteúdo absorvido na §9 e §11) |
| `neuroaxis/README.md` | ✅ Sim, mas só para instalar e para o troubleshooting do usuário final |
| `neuroaxis/CLAUDE.md` | ✅ Sim, como **documento histórico**: é a especificação original ("Jarvis PC"), com as decisões fechadas no início. Algumas seções "fora do escopo" já foram implementadas desde então |
| `neuroaxis-portal/AGENTS.md` | ✅ Sim, 3 linhas: leia a doc versionada do Expo v57 antes de escrever código |
| `neuroaxis-portal/CLAUDE.md` | ↪️ Ponteiro para cá. Era o plano escrito **antes de o app existir** |
| `neuroaxis-portal/README.md` | ✅ Sim, para o passo a passo de build em outra máquina |
| ~~`CONTEXTO_NEUROAXIS.md`~~ | 🗑️ Apagado dos dois repos. Obsoleto |
| ~~`neuroaxis/NEUROAXIS.txt`~~ | 🗑️ Apagado. 582 linhas anteriores ao mobile, com números já errados |

> 🔴 **Regra ao criar documentação nova: não crie.** Adicione a este arquivo. Foi a
> multiplicação de documentos que produziu a situação acima, e o custo é uma sessão inteira
> tomando decisão a partir de um documento errado.

---

## 2. O ecossistema em uma página

Dois aplicativos pessoais, de uso real (não protótipo), que conversam pela rede.

### NEUROAXIS (desktop)

- Pasta: `c:\Users\ZAK\neuroaxis` · repo: `ZakWegues/neuroaxis` · branch `main`
- Electron 31 + TypeScript, Windows 11
- Assistente de voz em português do Brasil que vive na bandeja do sistema
- Atalho global `Ctrl+Shift+J` funciona com qualquer app em foco

### NEUROAXIS Portal (mobile)

- Pasta: `c:\Users\ZAK\neuroaxis-portal` · repo: `ZakWegues/neuroaxis-portal` · branch `main`
- Expo SDK 57 + React Native 0.86 + TypeScript, Android
- App companion: parea por QR code e vira controle remoto completo do PC

> **Os dois repositórios são editados na mesma sessão.** Decisão do Zak em 31/07/2026 —
> antes eram sessões separadas, e os dois lados divergiam no contrato. Toda mudança de
> servidor exige atualizar o cliente no mesmo trabalho.

### Fluxo completo de um comando de voz

```
Ctrl+Shift+J
   ↓
grava o microfone (para com ~2,5 s de silêncio, teto de 120 s)
   ↓
fastRoute — comando fechado? ("pausa", "volume 40")
   ├── sim → ação direta, ZERO chamada de API
   └── não ↓
        Groq Whisper (whisper-large-v3) → texto PT-BR
                 ↓
        Groq Llama roteador (llama-3.3-70b-versatile)
        devolve SEMPRE {"actions":[...]} — array, mesmo com um item só
                 ↓
        resolveAction() por ação  ← NUNCA routeAction() direto, ver §6
           ├── ação real → executor em src/actions/ → efeito no Windows
           └── conversa  → composeChatReply() no modelo bom, prompt curto
                 ↓
        TTS fala a resposta (msedge-tts neural, com fallback SAPI)
                 ↓
        notificação nativa + ícone da bandeja voltam a "ocioso"
```

O celular entra por dois caminhos: **linguagem natural** (`POST /api/command`, cai no mesmo
`processCommand`) ou **RPC tipado** (`POST /api/rpc`, determinístico, sem passar pelo modelo).

---

## 3. O Zak e as regras de trabalho

**zakduwe@gmail.com** · Windows 11 Pro · projeto pessoal de uso real.

Gosta de ver o diagnóstico antes do conserto. Prefere respostas curtas. Quer o desktop com
o mesmo capricho visual do app mobile — a referência estética é o Portal, não o contrário.

### Regras vigentes

1. **Commit e push a cada bloco concluído, sem perguntar.** Vale para os dois repositórios.
   Fechou bloco com build passando → sobe. *(Esta regra substituiu uma anterior, de nunca
   commitar por conta própria.)*
2. **Manter este `ULTRA_HANDOFF.md` atualizado** ao fim de cada bloco — **nas duas cópias**
   (`ELYSIUM/` e `neuroaxis/`).
3. **Diagnosticar com log real antes de aplicar correção às cegas.** Instrumentar, ler o
   log, só então corrigir. Foi assim com o bug de TTS, o de áudio no mobile e o do cleartext.
4. **Caveman mode ativo nas respostas** (curtas e diretas, sem preâmbulo). Código, mensagens
   de commit e avisos de segurança em português normal e completo.
5. Comentário de código explica **por que**, não o que. O padrão do projeto é comentário em
   português, em bloco, acima do trecho não-óbvio.
6. Referência estética: o app mobile.

### O que foi cancelado (não retomar)

**Suporte a múltiplos provedores de IA** (GPT / Gemini / Claude / outros). O Zak pediu, e
depois cancelou explicitamente: *"não precisa, não quero mais fazer"*. O arquivo iniciado
(`src/services/providers/types.ts`) foi removido e nada foi commitado. **Não retomar sem ele
pedir de novo.**

---

## 4. Estado atual exato

> Seção que envelhece mais rápido. Isolada de propósito — se algo aqui contradiz o resto do
> documento, confie no `git log`.

### Git

| Repo | Base antes desta sessão de documentação |
|---|---|
| `neuroaxis` | `3144fff` — *docs: registra a build local do APK e onde vive a chave de assinatura* |
| `neuroaxis-portal` | `ddf0a3f` — *fix: segunda build local não falha mais com arquivo travado* |

Em cima disso, o commit de 13/08/2026 que criou este documento traz também: a correção do
cleartext no Portal (`expo-build-properties`), o `expo-system-ui`, a limpeza dos cinco
documentos concorrentes, e o `Iniciar NEUROAXIS.vbs` deixando de ter caminho fixo.

Verificado antes de subir: `npm run build` no desktop e `npm run typecheck` no Portal, ambos
sem erro.

### Blocos do plano de expansão

Todos os 6 blocos concluídos: RPC tipado e pareamento multi-endereço · central de sistema,
clipboard e energia · espelhamento e trackpad · memória, lembretes e push · visão, busca web
e Spotify · Home, modo escuro, share intent e build do APK.

### O que aconteceu na sessão de 11/08/2026

1. **Build do APK saiu da nuvem e virou local.** A fila do plano gratuito da Expo passou de
   1h30. Toolchain instalado, dois plugins de config criados, script de build escrito.
2. **Causa raiz do APK que nunca funcionou:** faltava `usesCleartextTraffic` no manifesto de
   release. Detalhe completo em §12.
3. Correções de build encadeadas: Metaspace, EBUSY, licenças do SDK, `expo-system-ui`.

### ⚠️ Investigação aberta — pareamento do celular

**O que se sabe, verificado:**

| verificação | resultado |
|---|---|
| servidor ouvindo | `TCP 0.0.0.0:4200 LISTENING` — ok |
| health nos 3 IPs (local) | 200 em `127.0.0.1`, `192.168.15.22`, `100.124.51.14` |
| regra de firewall | ativa, TCP 4200, todos os perfis, faixas privadas + `100.64/10` |
| regra de bloqueio p/ electron | nenhuma |
| navegador do celular em `http://192.168.15.22:4200/api/health` | **`unauthorized` (401) — a rede está boa** |
| manifesto do APK antigo | **sem `usesCleartextTraffic`** ← causa raiz provável |
| Tailscale do celular | `offline, last seen 18m ago` — caiu sozinho, ícone de VPN continuou aparecendo |

**Estado do APK corrigido:** `neuroaxis-portal/dist-apk/neuroaxis-portal.apk`, 97,8 MB,
assinado com a chave própria (`CN=NeuroAxis Portal`), `usesCleartextTraffic=true` confirmado
no manifesto compilado. **Ainda não foi instalado nem testado.**

**Próximo passo, na ordem:**
1. Desinstalar o NEUROAXIS Portal atual (assinatura diferente da do EAS — uma vez só).
2. Instalar o APK de `dist-apk/`.
3. Parear pelo QR, na rede de casa, com o Tailscale desligado nos dois.
4. Funcionou → causa raiz confirmada, marcar aqui. Não funcionou → roteiro de diagnóstico
   da §12, que já descarta rede, firewall e servidor.

### Build obsoleta na nuvem

Há uma build `IN_QUEUE` no EAS desde 11/08 18:28, do commit `fb88c6d`. **Está obsoleta** —
não tem a correção de endereço ativo nem a do cleartext. Vale cancelar
(`npx eas-cli build:cancel`).

---

## 5. Desktop — arquitetura e mapa de arquivos

### Stack

Electron 31 + TypeScript 5.5. **Quatro dependências em produção**, de propósito:
`auto-launch`, `electron-store`, `msedge-tts`, `qrcode`. Tudo mais é Node puro — inclusive o
servidor HTTP e o WebSocket.

### Comandos

```
npm run dev     # build + electron . --dev
npm run build   # clean + tsc + copy-assets
npm start       # build + electron .
npm run dist    # build + electron-builder --win nsis  → release/NEUROAXIS-Setup-1.0.0.exe
```

### Ciclo de vida

- Vive na **bandeja do sistema**, sem janela na barra de tarefas. Fechar janela não encerra;
  só "Sair" no menu da bandeja encerra de verdade.
- **Single-instance lock**: abrir de novo só traz o dashboard da instância existente.
- Inicia com o Windows via `auto-launch` (nome registrado: `NEUROAXIS`, `isHidden: true`).
- Atalho global registrado no `whenReady`; trocável em tempo de execução pelo
  `config:set-all`.
- Três janelas: **dashboard** (principal), **config** (primeira execução / ajustes) e
  **recorder** (invisível — só existe porque `MediaRecorder` é API de renderer).

### Onde ficam os dados

| o quê | onde |
|---|---|
| API key da Groq, token do servidor, overrides | `%APPDATA%\neuroaxis\neuroaxis-config.json` |
| memória, lembretes, presets, conversas, mailbox, tokens de push | mesmo diretório, via `electron-store` |

> ⚠️ **Esse JSON tem a `apiKey` da Groq em texto puro, ao lado do `serverToken`.** Nunca
> jogue o arquivo inteiro no output. Para pegar só o token, leia o campo.

### Mapa de arquivos — `src/`

**`main/` — processo principal**

| arquivo | o que faz |
|---|---|
| `main.ts` (663) | Ciclo de vida, janelas, atalho global, ~40 canais IPC, boot do servidor/scheduler/input host, payload do QR de pareamento |
| `config.ts` (183) | `AppConfig`, defaults, electron-store, API key, token do servidor, `DECOMMISSIONED_MODELS` + `healModel()` |
| `network.ts` (63) | `getAllLocalIPv4()` com detecção de túnel (regex de interface + faixa `100.64/10`), ordenação por alcançabilidade |
| `tray.ts` (114) | Ícone e menu da bandeja, reflexo do estado |
| `state.ts` (40) | Estados do assistente (ocioso / ouvindo / processando) |
| `notify.ts` (15) | Notificações nativas — nunca lança |

**`services/` — lógica**

| arquivo | o que faz |
|---|---|
| `server.ts` (619) | HTTP + WebSocket na 4200. RFC 6455 escrito à mão. Auth, rate limit, rotas |
| `rpc.ts` (581) | Os 52 métodos tipados, whitelist, validação, marcação de destrutivo |
| `brain.ts` (363) | Union `BrainAction` (28 variantes), system prompt de roteamento, `decideBrain()`, `composeChatReply()`, histórico volátil |
| `command.ts` (42) | `processCommand()` e **`resolveAction()`** — o ponto de entrada correto |
| `fastRoute.ts` (113) | Roteamento local por regex, sem API |
| `stt.ts` (91) | Groq Whisper + detecção de formato por magic bytes |
| `tts.ts` (187) | msedge-tts neural com fallback SAPI, fila de fala |
| `spotify.ts` (308) | Web API com OAuth PKCE, rotação de refresh token |
| `vision.ts` (93) | Perguntas sobre imagem, remoção dos blocos `<think>` |
| `webSearch.ts` (72) | Busca via modelo agêntico da Groq |
| `scheduler.ts` (185) | Lembretes persistidos, re-armados no boot |
| `memoryStore.ts` (100) | Fatos de longo prazo (20 máx, 200 chars), injetados no prompt |
| `push.ts` (133) | Push pela nuvem da Expo, limpeza de token morto, horário de silêncio |
| `inputHost.ts` (290) | PowerShell persistente para mouse e teclado |
| `screenCapture.ts` (103) | `desktopCapturer` do Electron → JPEG |
| `chatSessionsStore.ts` (159) | Conversas salvas, retenção, `mergeSession()` |
| `mailboxStore.ts` (203) | Thread assíncrona desktop ↔ celular, com anexos |
| `presetsStore.ts` (63) | Presets de ação |
| `telemetryLog.ts` (70) | Histórico e detecção de anomalia |
| `history.ts` (45) | Histórico de comandos do dashboard |
| `errors.ts` (55) | Erros tipados para o main saber o que falar |

**`actions/` — executores** (roteados por `router.ts`)

`openUrl` · `openApp` · `closeApp` · `playMusic` · `volumeControl` · `mediaControl` ·
`windowManagement` · `writeText` · `createFile` · `clipboardAction` · `screenshot` ·
`systemInfo` (306 linhas — telemetria, processos, discos, matar processo) · `runPreset` ·
`createPreset` · `sendToMobile` · `powerControl` · `memoryActions` · `spotifyControl`

**`renderer/` — interface**

| arquivo | o que faz |
|---|---|
| `dashboard.html` (2818) | Janela principal, JS vanilla. Gaveta esquerda (perf/storage/taskmgr), gaveta direita (config/conversas/presets/mídia/personalização/pareamento), timeline central com chat duplo, 5 temas |
| `config.html` (547) | Primeira execução e ajustes, seletor de modelos com os avisos |
| `recorder.html` (95) | Invisível, só `MediaRecorder` |
| `preload-*.ts` | Pontes IPC das três janelas |

**`config/`** — `apps.json` (mapa de ~75 nomes de programa → comando) · `presets.json`

**Raiz** — `config.json` (defaults empacotados) · `Iniciar NEUROAXIS.vbs` (lançador silencioso,
deriva a própria pasta) · `.env.example` (só `GROQ_API_KEY`, fallback de desenvolvimento) ·
`scripts/` (`clean.mjs`, `copy-assets.mjs`, `liberar-acesso-remoto.ps1`) ·
`build/icon.png` · documentos (ver o inventário na §1)

### Mapa de nomes de programa

`src/config/apps.json` mapeia ~75 nomes falados → comando ou protocolo. Cobre protocolos
(`spotify:`, `steam:`, `ms-settings:`, `ms-clock:`, `microsoft.windows.camera:`), executáveis
(`calc.exe`, `notepad.exe`, `taskmgr.exe`) e nomes de app que o `openApp` resolve pelo
`Get-StartApps` (`Roblox Player`, `Epic Games Launcher`, `BlueStacks`, `NVIDIA App`).

Nomes em português **e** inglês, com e sem acento, porque o Whisper varia. Quando o nome não
está no mapa, o executor tenta abrir pelo nome mesmo. Para adicionar um programa, basta uma
linha nova — não precisa mexer em código.

---

## 6. O cérebro — ações, prompt e as duas etapas

### 🔴 A regra mais importante do repositório

> **Para responder ao usuário, use `resolveAction()` de `services/command.ts`. NUNCA
> `routeAction()` direto.**

Conversa é resolvida em **duas etapas**: o roteador só marca que o pedido é papo
(`{"action":"chat"}`, sem texto), e a resposta é escrita depois por `composeChatReply()`.
Quem chama `routeAction()` sozinho recebe **string vazia** para conversa — e o assistente
fica **mudo, sem erro nenhum**.

Isso já aconteceu: as duas etapas foram criadas atualizando só o caminho do celular, e o
dashboard passou a executar comandos mas ignorar conversas, em silêncio, por dias.

```ts
export async function resolveAction(action: BrainAction, userText: string): Promise<string> {
  if (action.action !== "chat") return routeAction(action);

  const composed = await composeChatReply(userText);
  if (composed) return composed;

  return action.reply?.trim() || "Não consegui responder isso agora.";
}
```

**Por que duas etapas:** decidir a ação é classificação (prompt gigante, modelo qualquer);
escrever a resposta é redação (prompt curto, modelo bom). Juntas numa chamada só, pagava-se
o modelo caro pelo prompt de roteamento inteiro em *todo* pedido.

### As 28 variantes de `BrainAction`

O modelo devolve **sempre** `{"actions":[...]}` — array, mesmo para um pedido único. Pedido
composto ("fecha o Chrome e abre o VS Code") vira dois elementos, na ordem falada.

| ação | campos |
|---|---|
| `play_music` | `query` |
| `open_url` | `url_or_query` |
| `open_app` | `app_name` |
| `close_app` | `app_name` |
| `volume_control` | `level: number \| "up" \| "down" \| "mute" \| "unmute"` |
| `media_control` | `operation: play\|pause\|skip\|previous\|volume_up\|volume_down` |
| `window_management` | `target_app`, `operation: maximize\|minimize\|focus\|close` |
| `write_text` | `content`, `description` |
| `create_file` | `filename`, `content`, `description` |
| `clipboard_read` | `instruction` |
| `screenshot` | `filename?` |
| `system_info` | `query: ram\|cpu\|battery\|disk\|hora\|data\|cpu_temperature` |
| `run_preset` | `preset_name` |
| `list_presets` | — |
| `delete_preset` | `preset_name` |
| `create_preset` | `preset_name`, `description`, `icon?`, `actions[]` |
| `send_to_mobile` | `content`, `kind?: link\|note` |
| `power_control` | `operation: shutdown\|restart\|sleep\|lock\|cancel`, `delay_seconds?` |
| `remember` | `fact` |
| `forget` | `query` |
| `list_memory` | — |
| `create_reminder` | `text`, `due_at` (ISO local), `weekly?` |
| `list_reminders` | — |
| `cancel_reminder` | `query` |
| `web_search` | `query` |
| `look_at_screen` | `question` |
| `chat` | `reply?` (opcional — quem escreve é a 2ª etapa) |
| `unknown` | — |

### As distinções que o prompt precisa carregar

Cada uma existe porque o modelo errava sem ela:

| par | regra |
|---|---|
| `media_control` × `volume_control` | "volume 50" = `volume_control(50)`; "aumenta o som" sem número = `media_control(volume_up)` |
| `close_app` × `window_management.close` | "fecha o Chrome" mata o processo; "fecha a janela do Chrome" manda WM_CLOSE |
| `power_control` × `close_app` | "desliga o PC" × "fecha o Spotify" |
| `remember` × `create_reminder` | fato permanente × aviso agendado |
| `chat` × `web_search` | fato estável ("capital do Brasil") × fato que muda ("cotação do dólar") |
| `look_at_screen` × `screenshot` | lê e responde × só salva a imagem |
| `open_app` × `open_url` | programa instalado × site no navegador |

### O prompt em tempo de execução

`buildSystemPrompt()` = texto fixo + **data e hora atuais** + **bloco de memória**.

A data é obrigatória: `create_reminder` exige ISO absoluto, e sem saber que dia é hoje o
modelo não tem como transformar "amanhã às 9" em data — chutaria. A interpretação de data em
português fica com o Llama de propósito; regex de data em PT-BR é bem menos robusto.

### `fastRoute` — o atalho sem API

`src/services/fastRoute.ts`. Comandos fechados resolvem localmente, com **zero token**:
`pausa`, `continua`, `próxima`, `anterior`, `volume N`, `muta`, `que horas são`, `que dia é
hoje`, `quanta ram`, `bateria`, `espaço no HD`, `temperatura`, `tira um print`.

**Regra ao adicionar**: só padrões inequívocos e ancorados na frase inteira (`^…$`). Um
padrão frouxo sequestra pedidos que precisavam do modelo, e o sintoma é o assistente fazer a
coisa errada com confiança total.

Comandos resolvidos assim são registrados no histórico via `noteFastRouted()` — senão o
cérebro perderia o fio: depois de um "pausa" resolvido no atalho, um "continua" seguido de
"e aumenta" ficaria sem contexto.

---

## 7. Modelos da Groq

### Os quatro em uso

| campo | padrão | papel |
|---|---|---|
| `routerModel` | `llama-3.3-70b-versatile` | Decide **qual** ação. Carrega o prompt grande |
| `brainModel` | `llama-3.3-70b-versatile` | Escreve a resposta de conversa. Prompt curto |
| `visionModel` | `qwen/qwen3.6-27b` | Único da conta que aceita `image_url` |
| `searchModel` | `groq/compound-mini` | Agêntico: pesquisa sozinho e devolve a resposta |
| `sttModel` | `whisper-large-v3` | Transcrição |

### 🔴 Não troque o router pelo modelo pequeno

Contra a intuição, o padrão do roteador é o modelo **grande**.

Medido em 01/08/2026: no plano gratuito da Groq, o `llama-3.1-8b-instant` tem teto de
**6000 tokens por minuto** — **metade** dos 12000 do `llama-3.3-70b-versatile`. Trocar pelo
pequeno "para economizar cota" faz o oposto. O `config.html` avisa disso no próprio seletor.

### Modelos aposentados quebram tudo em silêncio

A escolha do usuário fica guardada para sempre. Quando a Groq aposenta um modelo, **todo
comando passa a devolver HTTP 400** e não há como o usuário adivinhar que a causa é uma
opção marcada meses atrás. Foi assim que o `llama-3.3-70b-specdec` derrubou o chat inteiro.

`config.ts` tem a defesa:

```ts
const DECOMMISSIONED_MODELS = new Set([
  "llama-3.3-70b-specdec",
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
  "mixtral-8x7b-32768",
  "gemma-7b-it",
]);
```

Modelo morto cai no padrão sozinho, com aviso no log.

### 🔴 Pergunte à API antes de escolher qualquer modelo

```bash
curl -H "Authorization: Bearer $GROQ_KEY" https://api.groq.com/openai/v1/models
```

No bloco 5 isso evitou implementar contra um id inventado: a conta **não tem** nenhum
`llama-4`/`scout`/`maverick`. Em compensação tem `groq/compound-mini`, que pesquisa na web
sozinho — o que tornou a chave do Tavily, prevista no plano, completamente desnecessária.
**Nunca fixe um model id de memória.**

### Consumo e o teto de tokens

Cada chamada ao cérebro gasta ~4400 tokens (prompt de roteamento + histórico + memória).
12000 TPM no plano gratuito = **2 a 3 comandos por minuto** antes do 429.

Já atacado: `fastRoute` (comandos fechados não chamam API) e corte de exemplos do prompt (de
52 para 22, −26%). Se voltar a incomodar: cortar mais o prompt, ampliar o `fastRoute`, ou
assinar o Dev Tier.

---

## 8. Servidor da porta 4200

`src/services/server.ts`. HTTP + WebSocket em Node puro — o codec de frame do WebSocket
(RFC 6455) é escrito à mão, **zero dependências extras**. Bind em `0.0.0.0`.

### Rotas

| método | rota | o que faz |
|---|---|---|
| `GET` | `/api/health` | `{status, version, wsClients}` |
| `POST` | `/api/command` | `{text}` → `{reply}`. Mesmo pipeline da voz, sem STT |
| `GET` | `/api/rpc` | Descoberta: `{methods:[{method, destructive}]}` |
| `POST` | `/api/rpc` | `{method, params}` → `{result}` ou `{error}` |
| `POST` | `/api/mailbox/messages` | Enviar mensagem/anexo |
| `GET` | `/api/mailbox/messages` | Listar thread |
| `GET` | `/api/mailbox/messages/:id/content` | Baixar anexo |
| `POST` | `/api/mailbox/messages/:id/ack` | Marcar como lida |
| `GET` | `/api/spotify/callback` | **Única rota sem token** — ver abaixo |
| `WS` | `/api/stream` | Áudio binário → STT → resposta; telemetria a cada 5 s; evento `mailbox_new` |

### Autenticação

`Authorization: Bearer <64 hex chars>`, comparado em **tempo constante**
(`crypto.timingSafeEqual`), para não distinguir um token quase certo de um completamente
errado pelo tempo de resposta.

O token é mutável em runtime (`setActiveToken`): regenerar pelo dashboard invalida
pareamentos antigos **na hora**, sem reiniciar o app.

### A única rota isenta, e por quê

`GET /api/spotify/callback` não tem como exigir token: quem chega nela é o navegador
redirecionado pelo Spotify, que não tem como carregar o nosso token. A proteção equivalente
é o **`state` aleatório** conferido contra o login em andamento — sem ele a troca de código é
recusada. Verificado: `state` inventado devolve erro, e a isenção não vaza (`/api/rpc` sem
token continua dando 401). A rota vem **depois** do rate limit, de propósito.

### Sem CORS, de propósito

`Access-Control-Allow-Origin: *` foi **removido**. O cliente é app nativo, não navegador, e
nunca precisou de preflight. Manter o `*` deixava qualquer página aberta em qualquer máquina
da rede chamar uma API que lê clipboard e mata processos.

**Efeito colateral aceito:** `expo start --web` deixou de falar com o desktop. Android e iOS
não são afetados.

### Rate limit e teto de corpo

- **600 requisições por 10 s por IP** (60/s) → acima disso, 429.
  ⚠️ Era 120/10s. **Subiu no bloco 3**: o trackpad manda um `input.move` por evento de
  arrasto e o primeiro deslizar do dedo já batia no limite. O objetivo é conter laço
  descontrolado, não policiar uso legítimo — quem autentica é o token. O app também acumula
  deslocamento e envia no máximo 25/s.
- **Corpo máximo de 8 MB** → 413. Anexo de 5 MB vira ~6,7 MB em base64, então cabe.

O polling atual do Portal (mailbox 15 s, badge 45 s, telemetria por WS) está muito abaixo do
limite.

---

## 9. Superfície RPC — os 52 métodos

**Por que existe:** até o bloco 1, a única porta de comando do mobile era `POST /api/command`,
que joga o texto no LLM. Isso é ótimo para voz e péssimo para botão — a tela de presets
literalmente montava frases em português ("liste meus presets") para executar ação. RPC é
determinístico, validado e whitelistado.

### Formato

```jsonc
// requisição
{ "method": "system.killProcess", "params": { "pid": 4821 } }
// resposta ok
{ "result": { "ok": true } }
// erro — sempre {"error": "<mensagem em PT-BR>"}
```

| status | quando |
|---|---|
| 400 | params inválidos ou faltando |
| 401 | token errado ou ausente |
| 403 | método destrutivo sem o header de confirmação |
| 404 | método desconhecido |
| 413 | corpo acima de 8 MB |
| 429 | acima de 600 requisições em 10 s |
| 500 | o executor falhou (mensagem original preservada) |

### Confirmação de destrutivos

Os **3 métodos destrutivos** (`system.killProcess`, `apps.close`, `power.control`) exigem:

```
X-Neuroaxis-Confirm: 1
```

Sem ele → **403**. O app só manda esse header depois de validar biometria
(`expo-local-authentication`). É trava contra toque acidental, **não** defesa contra quem já
tem o token — contra esse, a defesa é o token não vazar e a porta não ser exposta.

> Os `input.*` **não** são destrutivos de propósito: pedir biometria a cada movimento de
> cursor tornaria o trackpad inutilizável. A trava fica na entrada da tela, no app.

### Tabela completa

**Sistema**

| método | params | retorno | destr. |
|---|---|---|---|
| `system.telemetry` | — | `DashboardTelemetry` (cpu_pct, ram_pct, battery_pct, battery_charging, cpu_temp, disks[], processes[]) | |
| `system.processes` | — | `{processes: ProcessEntry[]}` | |
| `system.disks` | — | `{disks: DiskEntry[]}` | |
| `system.killProcess` | `{pid}` | `{ok}` | **sim** |

**Programas e energia**

| método | params | retorno | destr. |
|---|---|---|---|
| `apps.list` | — | `{apps:[{key, command}]}` do `apps.json` | |
| `apps.open` | `{name}` | `{ok, message}` | |
| `apps.close` | `{name}` | `{ok, message}` | **sim** |
| `power.control` | `{operation: shutdown\|restart\|sleep\|lock\|cancel, delaySeconds?}` | `{ok, message}` | **sim** |

`power.control` sem `delaySeconds` usa **30 segundos** para shutdown/restart — a janela
existe justamente para dar tempo de cancelar. `cancel` também é destrutivo: um método, uma
regra. `shutdown.exe /a` devolve 1116 quando não há nada agendado; tratado como sucesso.

**Área de transferência, mídia e volume**

| método | params | retorno |
|---|---|---|
| `clipboard.get` | — | `{text}` |
| `clipboard.set` | `{text}` | `{ok, length}` |
| `media.control` | `{operation: play\|pause\|skip\|previous\|volume_up\|volume_down}` | `{ok, message}` |
| `volume.set` | `{level: 0-100 \| up\|down\|mute\|unmute}` | `{ok, message}` |

**Tela**

| método | params | retorno |
|---|---|---|
| `screen.list` | — | `{screens:[{id, name, width, height, isPrimary}]}` |
| `screen.capture` | `{sourceId?, maxWidth?, quality?}` | `{base64, width, height, capturedAt, sourceId, sourceName}` |

**Entrada remota**

| método | params |
|---|---|
| `input.ping` | — (paga o custo de compilação do interop antes do primeiro toque) |
| `input.move` | `{dx, dy}` |
| `input.click` / `input.doubleClick` | `{button?: left\|right\|middle}` |
| `input.buttonDown` / `input.buttonUp` | `{button?}` |
| `input.scroll` | `{notches}` (positivo = pra cima) |
| `input.type` | `{text}` (máx 5000) |
| `input.key` | `{sequence}` (sintaxe SendKeys, máx 200) |

**Memória e lembretes**

| método | params | retorno |
|---|---|---|
| `memory.list` | — | `{facts:[{id, text, createdAt}]}` |
| `memory.add` | `{text}` | `{fact, created}` |
| `memory.remove` | `{id}` | `{removed}` |
| `reminders.list` | — | `{reminders:[{id, text, dueAt, kind, weekday?, createdAt, firedAt?}]}` |
| `reminders.create` | `{text, dueAt: epoch ms, kind?: once\|weekly}` | `{reminder}` |
| `reminders.cancel` | `{id}` | `{cancelled}` |

**Push**

| método | params | retorno |
|---|---|---|
| `push.register` | `{token: ExpoPushToken}` | `{added}` |
| `push.unregister` | `{token}` | `{removed}` |
| `push.getPrefs` | — | `{muted, quietFrom, quietTo, deviceCount}` |
| `push.setPrefs` | `{muted?, quietFrom?, quietTo?}` | mesmo shape do get |

`push.getPrefs` **não** devolve os tokens: são identificadores de aparelho e a tela não
precisa deles. `setPrefs` aplica só as chaves presentes — mandar `{quietFrom}` não apaga
`muted`.

**Visão e busca**

| método | params | retorno |
|---|---|---|
| `vision.ask` | `{imageBase64, question?}` | `{answer}` |
| `vision.screen` | `{question?}` | `{answer}` |
| `web.search` | `{query}` | `{answer}` |

**Spotify**

| método | params | retorno |
|---|---|---|
| `spotify.status` | — | `{connected}` |
| `spotify.login` | — | `{ok, message}` (abre o navegador **no PC**) |
| `spotify.logout` | — | `{ok}` |
| `spotify.nowPlaying` | — | `{nowPlaying: {isPlaying, track, artist, album, albumArt, progressMs, durationMs, device, volumePercent, shuffle, repeat} \| null}` |
| `spotify.command` | `{operation: play\|pause\|next\|previous}` | `{ok}` |
| `spotify.volume` | `{percent: 0-100}` | `{ok}` |
| `spotify.seek` | `{positionMs}` | `{ok}` |
| `spotify.playSearch` | `{query}` | `{playing:{track, artist}}` |
| `spotify.shuffle` | `{on}` | `{ok}` |
| `spotify.repeat` | `{state: off\|track\|context}` | `{ok}` |

**Conversas e pareamento**

| método | params | retorno |
|---|---|---|
| `chat.list` | — | `{sessions: ChatSession[]}` |
| `chat.get` | `{id}` | `{session \| null}` |
| `chat.save` | `{session}` (máx 500 mensagens) | `{session}` |
| `chat.favorite` | `{id}` | `{favorite \| null}` |
| `chat.delete` | `{id}` | `{deleted}` |
| `pairing.endpoints` | — | `{endpoints[], hasTunnel, hostname, port}` |

```ts
ChatSession = {
  id, title, createdAt, updatedAt, favorite,
  messages: [{ id, from: "me" | "reply" | "error", text, ts }]
}
```

`pairing.endpoints` existe porque o celular só aprendia os endereços **no momento do
pareamento**. Instalar o túnel depois não adiantava: o endereço novo nunca chegava ao app,
que continuava preso à rede de casa. Agora o app reconsulta sempre que a conexão está de pé
e absorve endereços novos sozinho — basta abrir uma vez em casa depois de instalar o túnel.
`hasTunnel` deixa o app dizer *por que* está sem acesso, em vez de repetir "PC fora do ar"
com o PC ligado e funcionando.

---

## 10. Portal — arquitetura e mapa de arquivos

### Stack

Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript 6 · **Nova Arquitetura** (padrão do
SDK 57, não declarada no `app.json`) · Hermes · edge-to-edge Android.

`package`: `com.zak.neuroaxis.portal` · `scheme`: `neuroaxis` · projectId EAS
`a9c62871-2d6d-4e05-b458-1e58655449b5` · owner `zakdwr`.

### Comandos

```
npm start           # Expo / Metro
npm run typecheck   # tsc --noEmit
npm run build:local # APK aqui, ~3 min      ← caminho normal
npm run build:apk   # APK na nuvem (EAS)    ← reserva, fila longa
npm run update "msg"  # atualização pelo ar, ~30 s
```

### Navegação

`TabBar` com 6 entradas; `Screen = 'home' | 'chat' | 'mailbox' | 'control' | 'presets' | 'settings' | 'conversations'`.

| aba | tela |
|---|---|
| **Início** | Estado do PC, atalhos, lembretes, energia |
| **Chat** | Texto + push-to-talk por WS, TTS local (`expo-speech`), botão de câmera para visão |
| **Caixa** | Mailbox com anexos |
| **PC** | Espelho da tela **aparente já na entrada** + 8 gavetas |
| Presets · Ajustes | Modais, não abas de pilha |

**Gavetas da guia PC:** Lembretes · Memória · Monitor · Processos e discos · Programas ·
Energia · Área de transferência · Mídia e volume.

O app abria direto no chat, o que fazia sentido quando conversar era quase tudo que ele
fazia. Com controle remoto, lembretes e player, chat virou uma aba entre outras — e nada
mostrava de imediato se o PC estava de pé. Daí a Home.

### Telas — `src/screens/`

`PairingScreen` (QR pela câmera) · `HomeScreen` · `ChatScreen` (414) · `ControlScreen` (812) ·
`ConversationsScreen` · `MailboxScreen` (354) · `TelemetryScreen` (embutível) ·
`TrackpadFullscreen` (279) · `SpotifyPlayer` (342, tela cheia) · `CameraAsk` (193) ·
`PresetsScreen` · `SettingsScreen`

### Bibliotecas — `src/lib/`

| arquivo | o que faz |
|---|---|
| `http.ts` | `fetchWithTimeout` obrigatório. Timeouts: sondagem 2,5 s · normal 8 s · comando 45 s |
| `pairing.ts` (220) | Multi-endpoint, migração v1→v2, `resolveActiveEndpoint()`, `scanSubnet()` |
| `rpc.ts` (285) | `callRpc(pairing, method, params, {confirmed})` + `DESTRUCTIVE_METHODS` |
| `api.ts` | `POST /api/command` |
| `stream.ts` | Voz por WebSocket |
| `telemetry.ts` | WS de telemetria com backoff exponencial |
| `mailbox.ts` / `mailboxStore.ts` | Caixa, remota e local |
| `commandQueue.ts` | Fila offline (validade 30 min, teto 20 itens) |
| `useConnection.ts` (141) | Estado de conexão central, troca de endereço automática |
| `confirm.ts` | `confirmDestructive()` — biometria, com Alert de fallback |
| `chatHistoryStore.ts` / `chatSync.ts` | Conversas locais e sincronização |
| `pushNotifications.ts` | Registro do ExpoPushToken, com detecção de Expo Go |
| `shareIntent.ts` | Compartilhar de outro app do Android |
| `useKeyboard.ts` | Altura do teclado (ver armadilha do edge-to-edge) |
| `ws.ts` · `errors.ts` · `telemetryFormat.ts` | Apoio |

### Tema

Claro / escuro / sistema × 4 temas de cor. `src/theme/` com `tokens.ts`, `palettes.ts` (124) e
`ThemeContext.tsx`.

**O modo escuro não é o claro invertido:** fundo azulado em vez de preto puro (o vidro
precisa ter o que desfocar), bordas em branco translúcido, `primarySoft` translúcido. A tinta
da `BlurView` vem da paleta — fixá-la em `light` clarearia a tela inteira no escuro.

Estética "liquid glass" do iOS. Componentes em `src/components/ui/`: `GlassSurface`,
`GlassModal`, `BlurTarget`, `Drawer`, `Card`, `Button`, `Text`, `MetricBar`, `ScreenHeader`,
`AppBackground`.

Fora de `ui/`: `TabBar.tsx` (navegação), `ConnectionBanner.tsx` (faixa de estado de conexão
acima da TabBar, com "Tentar" e "Procurar") e `ErrorBoundary.tsx` (envolve o app inteiro em
`App.tsx` — uma exceção de render não pode deixar o usuário com tela preta e sem saída).

### 🔴 O Expo mudou; não escreva de memória

`neuroaxis-portal/AGENTS.md` tem três linhas e elas valem:

> **Leia a doc versionada em `https://docs.expo.dev/versions/v57.0.0/` antes de escrever
> qualquer código.**

O SDK 57 mudou coisas que o conhecimento prévio erra: `expo-av` virou `expo-audio`, o push saiu
do Expo Go, `expo-blur` passou a exigir `blurTarget`, edge-to-edge virou padrão. Cada uma
dessas já custou um bug neste projeto.

---

## 11. Contratos entre os dois lados

### QR de pareamento — v2

```json
{
  "v": 2,
  "ip": "192.168.15.22",
  "port": 4200,
  "token": "…64 hex…",
  "hostname": "DESKTOP-0UEMSH5",
  "endpoints": ["192.168.15.22", "100.124.51.14"]
}
```

`endpoints` traz **todos** os IPv4 da máquina, ordenados: Wi-Fi/Ethernet primeiro, túnel
depois, adaptadores virtuais por último. `ip` continua presente só por compatibilidade com um
Portal antigo.

**Motivo:** o IP ficava congelado no momento do QR. Bastava o DHCP redistribuir para o app
perder o PC, sem recuperação além de reparear. E com o túnel na lista, o mesmo pareamento
funciona fora de casa.

No Portal: `Pairing = {endpoints[], activeIp, port, token, hostname?}`, migração automática do
formato v1 no `loadPairing()`, `resolveActiveEndpoint()` correndo todos em paralelo, e
`scanSubnet()` varrendo a /24 como último recurso (só sob pedido explícito — 254 requisições
é barulho que ninguém quer disparado a cada abertura).

### 🔴 O endereço ativo é "grudento" de propósito

`resolveActiveEndpoint()` **sempre prefere o endereço atual quando ele responde**, mesmo que
outro responda antes.

Sem essa preferência, em casa — onde rede local e túnel funcionam ao mesmo tempo — o vencedor
da corrida mudava a cada verificação, e **cada troca derrubava e reabria o WebSocket de
telemetria**, num laço infinito de reconexão. O servidor WS está correto: verificado com
cliente cru nos dois caminhos, handshake 101, telemetria a cada 5 s, conexão estável.

```ts
const currentOk = probe(pairing.activeIp, …).then(() => true, () => false);
const fallback  = firstSuccess(others.map(ip => probe(ip, …)));
if (await currentOk) return pairing;
const winner = await fallback;
```

`firstSuccess()` é escrito à mão porque **`Promise.any` é risco no Hermes** — o suporte varia
por versão do runtime, e uma falha ali derrubaria a conexão inteira.

### Sincronização de conversas

**O PC é a autoridade.** O celular empurra o que mudou, o PC aplica a regra de retenção (5 não
favoritadas + favoritas ilimitadas) e devolve a lista; o celular adota o resultado. Se os dois
lados podassem por conta própria, cada um devolveria ao outro exatamente o que o outro acabou
de apagar.

- **Conflito:** vence quem tem `updatedAt` maior, decidido no PC (`mergeSession`). Para um
  usuário com dois aparelhos isso cobre o caso real, sem relógios vetoriais. O `createdAt`
  guardado é preservado — o celular pode não saber quando a conversa nasceu.
- **Exclusões usam lápides.** Apagar no celular registra o id em `neuroaxis_chat_deleted`; a
  sincronização manda os `chat.delete` **antes** dos `chat.save` e só então limpa o registro.
  Sem isso a conversa apagada voltaria do PC na sincronização seguinte, como se o botão não
  funcionasse.
- **Ids têm sufixo aleatório** nos dois lados: só o carimbo de tempo colidiria se PC e celular
  criassem uma conversa no mesmo milissegundo, e o merge trataria as duas como a mesma.
- **Offline:** a cópia local é a fonte da tela. Sem rede tudo funciona; alterações e exclusões
  esperam a próxima sincronização. Dispara ao abrir Conversas, ao favoritar, ao apagar, e
  quando o PC volta.

> Não confunda com o histórico do `brain.ts`: aquele é o contexto volátil mandado ao modelo
> (6 turnos, apagado por inatividade) e **nunca vai pro disco**.

### Push — chega fora de casa

O PC envia pelo serviço da Expo (`exp.host`), **não** pela rede local. É isso que faz um
lembrete alcançar o celular no 4G, longe de casa, sem relay próprio e sem depender do túnel.
O aparelho registra seu `ExpoPushToken` via `push.register` no pareamento. Quando a Expo
responde `DeviceNotRegistered` (app desinstalado), o token é removido sozinho — senão o PC
tentaria para sempre.

Categorias: `reminder`, `anomaly`, `mailbox`. **Lembrete atravessa a janela de silêncio** de
propósito: foi o usuário que pediu por ele naquela hora. Só a RAM alta vira push entre as
anomalias — pico de CPU é passageiro demais e viraria spam.

### Lembretes

`src/services/scheduler.ts`. Persistidos em disco e **re-armados no boot** — um lembrete só em
memória morreria junto com o app, que reinicia toda vez que o PC liga. Só o próximo disparo
fica agendado por vez; a lista em disco é o estado de verdade.

O que venceu com o PC desligado **dispara na volta**, de propósito: melhor avisar atrasado que
engolir. Um `weekly` atrasado avança em semanas até passar do agora, em vez de disparar uma
vez por semana perdida. Lembrete calculado no passado é recusado com uma pergunta, não
disparado na hora.

### Memória de longo prazo

`src/services/memoryStore.ts`. Fatos curtos injetados no system prompt **a cada pedido** — por
isso o teto de 20 itens e 200 caracteres. Editável pelo app (o usuário precisa poder apagar).

---

## 12. Rede e acesso de fora de casa

### 🔴 A causa raiz do APK que nunca funcionou

**O manifesto de release não tinha `usesCleartextTraffic`.**

O Expo injeta essa permissão apenas no manifesto de *debug*. Com `targetSdk` ≥ 28, o padrão do
Android é **bloquear HTTP puro**. Todo o app fala `http://192.168.x.x:4200` — então o Android
derrubava cada requisição antes de sair do aparelho.

Consequência: **o APK gerado pelo EAS nunca conseguiu falar com o PC, em rede nenhuma**, nem
em casa. Isso reescreve dois diagnósticos anteriores que perseguiram rede à toa: a queixa
original *"ele dá erro pedindo que esteja conectado na mesma rede"* e a investigação do
Tailscale de 11/08.

Corrigido com `expo-build-properties`:

```json
["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]
```

**Nota de segurança:** isso libera HTTP puro no app inteiro. O tráfego para o PC já era sem
TLS de qualquer forma — o token é a única barreira, e isso não mudou. O que muda é que agora
ele efetivamente sai do aparelho. Vale enquanto o caminho for LAN ou túnel. **Não** vale expor
a 4200 na internet.

### Roteiro de diagnóstico de conectividade

Método reaproveitável, na ordem que descarta mais rápido:

**1. Navegador do celular** em `http://<ip>:4200/api/health`

| resultado | conclusão |
|---|---|
| `unauthorized` / 401 | **Rede boa.** O problema é no app |
| timeout / não carrega | Rede bloqueada — roteador ou firewall |
| conexão recusada | Servidor caído |

O navegador é **isento** das regras de rede do app — é justamente isso que separa as duas
camadas.

**2. No PC**

```powershell
netstat -ano | Select-String ":4200"       # espera: TCP 0.0.0.0:4200 LISTENING
Get-NetIPAddress -AddressFamily IPv4       # quais IPs existem
& "C:\Program Files\Tailscale\tailscale.exe" status
& "C:\Program Files\Tailscale\tailscale.exe" ping <ip-do-celular>
```

**3. Firewall** — regra de **bloqueio** vence qualquer regra de permissão:

```powershell
Get-NetFirewallRule -Direction Inbound -Action Block -Enabled True | ForEach-Object {
  $app = ($_ | Get-NetFirewallApplicationFilter).Program
  if ($app -match 'electron|neuroaxis|node') { $_.DisplayName }
}
```

**4. O que o APK realmente declara**

```powershell
& "$env:USERPROFILE\Android\Sdk\build-tools\36.0.0\aapt2.exe" `
  dump xmltree caminho.apk --file AndroidManifest.xml | Select-String "usesCleartextTraffic"
```

### ⚠️ O ícone de VPN do Android mente

No POCO X7 Pro (HyperOS), o Tailscale é morto pelo gerenciamento agressivo de bateria, mas o
**ícone de VPN continua na barra de status**. O sintoma no `tailscale status` do PC é
`offline, last seen Nm ago` com o número crescendo.

Correção no aparelho: Ajustes → Apps → Tailscale → Economia de bateria = "Sem restrições";
Início automático ligado; travar o card nos recentes.

### Túnel — como montar

O servidor escuta em `0.0.0.0`, então funcionar de fora depende só de existir uma interface
alcançável. Na prática, uma VPN mesh.

> 🔴 **Nunca encaminhar a porta 4200 no roteador.** O token é a única barreira e não há TLS.

1. **Tailscale nos dois aparelhos**, mesma conta. O PC ganha um IP `100.x` que o `network.ts`
   já reconhece como túnel.
2. **`scripts/liberar-acesso-remoto.ps1`**, como Administrador. As regras que o Windows criou
   sozinho para o Electron valem só no perfil "Privado"; o adaptador do túnel nem sempre cai
   nesse perfil, e quando cai em "Público" o firewall descarta a conexão **em silêncio** — o
   sintoma é idêntico ao de PC desligado. A regra é estreita de propósito (faixa do Tailscale
   + redes privadas), então o PC segue fechado em Wi-Fi de cafeteria.
3. **Abrir o app uma vez em casa.** Ele reconsulta `pairing.endpoints` e absorve o endereço
   novo sozinho — não precisa reparear.

O painel "Acesso fora de casa" na aba 📱 do dashboard mostra o estado e o passo a passo.

### Estado da máquina do Zak

`Ethernet 192.168.15.22` · `Tailscale 100.124.51.14` · hostname `desktop-0uemsh5` ·
celular `poco-x7-pro` = `100.102.221.39`.

---

## 13. Build e distribuição

### Desktop — instalador NSIS

```
npm run dist   →  release/NEUROAXIS-Setup-1.0.0.exe
```

`appId` `com.zak.neuroaxis`, produto `NEUROAXIS`, não-oneClick, per-user, permite escolher
pasta, cria atalhos. **Não testado depois das mudanças recentes.**

### Portal — APK local (caminho normal)

```
npm run build:local   →  dist-apk/neuroaxis-portal.apk
```

**Por que local e não na nuvem** — medido em 11/08/2026:

| | |
|---|---|
| fila do EAS (plano gratuito) | **1h30+**, e ainda não tinha rodado |
| build no EAS | 8 min |
| build local, primeira vez | ~10 min (baixa Gradle e dependências) |
| **build local, seguintes** | **5m07s** |
| atualização pelo ar | ~30 s |
| APK final | 97,8 MB |

#### Pré-requisitos (já instalados nesta máquina)

| | caminho |
|---|---|
| JDK 17 | `%LOCALAPPDATA%\Programs\Microsoft\jdk-17.0.10.7-hotspot` |
| Android SDK | `%USERPROFILE%\Android\Sdk` |
| pacotes | platform-tools · platforms 35 e 36 · build-tools 36.0.0 · NDK 27.1.12297006 · cmake 3.22.1 |

O JDK 8 que vem com muitos PCs **não serve** — o Gradle do RN 0.86 exige 17. Passo a passo
para outra máquina no `README.md` do Portal.

> **Licenças do SDK:** `sdkmanager --licenses` lê do console e **ignora stdin redirecionado**.
> Automatizar exige escrever os arquivos de hash direto em `$SDK\licenses\`.

#### 🔑 A chave de assinatura

```
%USERPROFILE%\Android\neuroaxis-release.keystore
%USERPROFILE%\Android\neuroaxis-signing.properties
```

**Fora dos dois repositórios, e sem backup.**

O modelo do Expo assina a build de release com a chave de **debug**, que é gerada por máquina.
O Android recusa instalar um APK por cima de outro com assinatura diferente. Sem uma chave
fixa, toda atualização exigiria desinstalar o app e perder pareamento e histórico.

> **Perder essa pasta significa que nenhuma build futura instala por cima da atual.** Fazer
> backup.

A primeira instalação local exige desinstalar o APK que veio do EAS — uma vez só, assinaturas
diferentes. O pareamento se refaz pelo QR e as conversas voltam pela sincronização.

#### Os dois plugins de configuração

Ambos existem como plugin, e **não** como edição do `build.gradle`, porque o `prebuild`
regenera a pasta `android` inteira a cada build. Uma edição manual sumiria em silêncio — e no
caso da assinatura, o APK sairia assinado com debug **sem nenhum erro aparente**.

| plugin | o que faz |
|---|---|
| `plugins/withReleaseSigning.js` | Lê o `.properties` e injeta a assinatura. Não faz nada se o arquivo não existir; **nunca roda dentro do EAS** (guarda por `process.env.EAS_BUILD`) |
| `plugins/withGradleMemory.js` | `org.gradle.jvmargs = -Xmx4096m -XX:MaxMetaspaceSize=1536m …` |

O `withReleaseSigning` troca a **última** ocorrência de `signingConfig signingConfigs.debug` —
ela aparece duas vezes (buildType debug e release), e trocar a primeira deixaria o release
assinado com debug do mesmo jeito, sem erro.

#### Falhas de build já resolvidas

| erro | causa | correção |
|---|---|---|
| `OutOfMemoryError: Metaspace` | Modelo do Expo dá 512 MB; RN 0.86 com 20+ módulos nativos estoura. **`GRADLE_OPTS` não sobrescreve** argumentos do daemon | `withGradleMemory` |
| `EBUSY … unlink classes5.dex` | Daemon do Gradle sobrevive à build e segura os arquivos. Só falha da **segunda** build em diante, o que parece intermitente | script derruba o daemon antes do `--clean` |
| `npm ci` fora de sincronia no EAS | `eas-cli` estava como devDependency e era instalado dentro da build, arrastando outro TypeScript | removido; scripts usam `npx eas-cli` |
| modo escuro sem efeito | `userInterfaceStyle: automatic` sem `expo-system-ui` | pacote adicionado |

Apagar a pasta `android` **não** custa o cache de dependências: ele fica em `~\.gradle` e
sobrevive.

### Atualização pelo ar (OTA)

```
npm run update "descrição da mudança"
```

Mudança que mexe só em JavaScript **não precisa de build**. Chega no aparelho em segundos, sem
reinstalar. `runtimeVersion` usa política de **fingerprint**: muda só quando as dependências
nativas mudam — é isso que garante que uma atualização de JS nunca chegue a um aparelho cujo
lado nativo é incompatível.

**Precisa de APK novo quando:** adicionar ou atualizar biblioteca nativa, mexer em permissões,
ícone, nome, `package`, ou qualquer coisa do `app.json` que gere código nativo.

> Só vale a partir de uma build que já contenha o `expo-updates` — ou seja, da build local em
> diante. O APK antigo do EAS não busca atualização.

Canais: `development` · `preview` · `production`. `npm run update` publica no `preview`.

---

## 14. Armadilhas

### Ambiente e testes

- **`ELECTRON_RUN_AS_NODE=1` vaza do host do VSCode.** Rodar `electron.exe` direto de dentro
  de uma sessão de agente faz ele executar como Node puro e quebrar com
  `Cannot read properties of undefined (reading 'on')`. Limpar a variável antes de lançar.
- **Single-instance lock.** Se o app já estiver rodando (ele inicia com o Windows), lançar de
  novo só abre o dashboard da instância existente — e você acaba **testando build velha sem
  perceber**. Para testar código novo: matar o `electron.exe` cujo CommandLine não tem
  `--type=` e relançar.
- **Screenshot automatizado do Electron não capta `backdrop-filter`/blur** neste ambiente. Não
  julgue vidro/blur por PNG; confirme com o Zak rodando o app.
- **Sem framework de teste em nenhum dos dois repositórios.** Validação é build + typecheck +
  curl contra o app rodando + teste manual do Zak.

### 🔴 Entrada remota — risco real de efeito colateral

**NUNCA testar `input.type` / `input.key` por curl sem controlar o foco.** `SendInput` vai
para a janela em primeiro plano, seja ela qual for.

Já aconteceu: um teste digitou dentro de um documento não salvo do Zak, e a tentativa de
desfazer (`Ctrl+Z`) caiu no VSCode porque o foco tinha mudado. Se precisar validar digitação,
peça pro Zak testar pelo app com o foco onde ele quiser.

Verificação segura, sem efeito colateral: `node` chamando `inputHost.ping()` e `move(0,0)`
direto no `dist/`.

### Desktop

- **`resolveAction()` sempre, `routeAction()` nunca** — ver §6. Sintoma do erro: assistente
  mudo em conversas, sem erro nenhum.
- **`SendKeys` corrompe acentuação** no layout ABNT. Ele traduz o caractere para tecla virtual
  pelo layout ativo (`VkKeyScan`), e acentos exigem dead keys que essa API não expressa —
  "ação" saía como "a▯o". Texto literal só via `SendInput` + `KEYEVENTF_UNICODE`. `SendKeys`
  fica só no `input.key`, onde a sintaxe de combos (`{ENTER}`, `^c`, `%{TAB}`) é o que ele faz
  bem.
- **Todo script PowerShell precisa forçar UTF-8 na saída.** O Node lê o stdout como UTF-8, o
  PowerShell escreve no code page ANSI, e o resultado é "S?o 11:34" no lugar de "São 11:34".
  Já corrigido em `systemInfo.ts`, `windowManagement.ts`, `openApp.ts` e `inputHost.ts`. **Ao
  criar um executor novo que leia stdout do PowerShell, prefixe com**
  `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`. No `openApp` isso não é
  cosmético: o retorno é caminho de arquivo, e acento corrompido quebra o `shell.openPath` de
  qualquer programa sob "Arquivos de Programas".
- **`mouse_event` usa `int`, não `uint`, no `dwData`** — scroll negativo dava 500 até corrigir.
- **Nunca faça `JSON.parse` cego no corpo de uma API externa.** O Spotify responde 2xx com
  corpo não-JSON em alguns comandos de reprodução; estourar ali reportava falha para uma ação
  que **já tinha acontecido** — a música pausava e o app mostrava erro. Ver o `api()` em
  `spotify.ts`: corpo ilegível vira `null` com aviso no log.
- **Como ler um erro de RPC que veio do celular:** se a mensagem no app for um erro de parse de
  JSON, o corpo do servidor era JSON **válido** — quem falhou ao interpretar foi o desktop,
  lendo uma API externa. O cliente engole o erro de parse dele e mostraria `(sem corpo)`.
- **A Groq aposenta modelos** — ver §7.

### Portal

- **Nova Arquitetura do React Native.** `UIManager.setLayoutAnimationEnabledExperimental` é
  no-op e avisa no console — usar `Animated` do core. `useNativeDriver: true` para opacidade e
  transform; `false` só para propriedades de layout como `width` (é o caso legítimo do
  `MetricBar`).
- **Edge-to-edge é padrão no Android** desde o SDK 54: o sistema **não** redimensiona mais a
  janela quando o teclado abre, então `softwareKeyboardLayoutMode: "resize"` e
  `KeyboardAvoidingView` não resolvem. O app reserva o espaço na raiz (`App.tsx`) a partir de
  `useKeyboard()`.
- **`expo-blur` 57 exige `blurTarget`** apontando para uma `BlurTargetView`; sem isso ele avisa
  e cai para o método `none` — **o vidro para de desfocar sem quebrar nada**, o que é fácil de
  não perceber. Ver `src/components/ui/BlurTarget.tsx`. Dentro de um `Modal` do RN o desfoque é
  impossível no Android (janela nativa separada).
- **`Promise.any` é risco no Hermes** — há um `firstSuccess()` escrito à mão em `pairing.ts`.
- **O `Button` do Portal usa prop `title`, não children.**
- **Guarda de carregamento com `useRef` inicializado com valor** — `useRef(sessionId ?? null)`
  fazia a guarda disparar na montagem, e abrir uma conversa antiga mostrava só a mensagem de
  boas-vindas; a primeira mensagem nova **sobrescrevia o histórico inteiro**. Inicializar com
  `null`.
- **Valor de estado vindo do chamador pode estar velho** — `saveSession` confiava no `favorite`
  que o chamador mandava, e favoritar era desfeito pela mensagem seguinte. O valor **guardado**
  é que vence.
- **`expo-notifications` quebra o Expo Go no import** (o SDK 53 removeu push de lá). Resolvido
  com import dinâmico + detecção por `appOwnership === 'expo'`. ⚠️ **Não** use
  `executionEnvironment`: ele devolve `storeClient` tanto para Expo Go quanto para dev build, e
  desligaria o push onde ele funciona.
- **`expo start --web` não fala mais com o desktop** — consequência deliberada de remover o
  CORS.

### Build

- Metaspace, EBUSY, licenças do SDK, `expo-system-ui`, `eas-cli` como devDependency — todos
  detalhados na §13.

### Rede

- **Cleartext HTTP bloqueado em release** — §12. A armadilha mais cara do projeto até agora.
- **O ícone de VPN do Android mente** — §12.
- **`probe()` trata qualquer não-2xx como inalcançável**, então 401 e PC desligado produzem o
  **mesmo alerta**. Está na lista de pendências.
- **Regra de bloqueio do firewall vence regra de permissão.** Clicar "Cancelar" no aviso do
  Windows cria uma regra de bloqueio silenciosa para o programa.

---

## 15. Pendências conhecidas

Ordenadas por impacto.

1. **⚠️ Pareamento não validado depois da correção do cleartext.** O APK corrigido está pronto
   e não foi instalado. É o próximo passo real — ver §4.
2. **🔑 A chave de assinatura não tem backup.** Perder `%USERPROFILE%\Android\` custa o caminho
   de atualização do app.
3. **Limite de tokens da Groq** — ~4400 tokens por chamada, 12000 TPM no gratuito. Já mitigado
   pelo `fastRoute`; ver §7 para as saídas restantes.
4. **`probe()` não distingue 401 de PC inalcançável.** Custou cerca de uma hora de investigação
   em 11/08. Distinguir os dois casos no `pairing.ts` é barato.
5. **`input.type` com acentuação nunca validado em execução.** O código foi corrigido para
   `SendInput`/unicode e compila, mas testar exige controlar o foco da janela — o que não dá
   para fazer com segurança por automação. Pedir pro Zak abrir PC → Trackpad e digitar "ação,
   çedilha, ãõ" num campo de texto.
6. **Instalador `.exe` (NSIS) não testado** depois de nenhuma das mudanças recentes.
7. **Push nunca validado em APK standalone.** Exige credenciais FCM no projeto EAS. Em Expo Go
   e emulador não funciona de jeito nenhum — o app detecta e explica.
8. **Voz "Microsoft Daniel" (pt-BR masculina) não é usada pelo fallback SAPI**: é voz OneCore
   (`HKLM:\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens`), invisível para o
   `System.Speech.Synthesis` clássico que o `tts.ts` usa. Duas saídas identificadas, nenhuma
   aplicada: ponte de registro (precisa de Admin) ou reescrever o fallback para
   `Windows.Media.SpeechSynthesis` (WinRT, não precisa de Admin, mas o interop async via
   PowerShell é frágil).
9. **`msedge-tts` (voz neural) falha com "Connect Error"** nesta máquina/rede — cai sempre no
   fallback SAPI.
10. **`tts.ts` ignora `cfg.voice`** — a voz está fixa em `pt-BR-AntonioNeural` no código.
11. **Quirk do `sleep`**: com hibernação habilitada, `SetSuspendState` hiberna em vez de
    suspender. Resolve com `powercfg /hibernate off` uma vez.
12. **Espelhamento tem teto de ~1,5 quadro/s** por limitação do `desktopCapturer`. Se um dia
    precisar de vídeo de verdade, o caminho é outro (WebRTC / captura por stream), não otimizar
    este.
13. **Build obsoleta na fila do EAS** — vale cancelar.
14. **Checklist de validação manual do `CLAUDE.md`** ainda não confirmado ponta a ponta.

### Números medidos, não estimados

Guardar para não re-medir:

- **Captura de tela: ~640 ms por quadro, custo fixo.** Testado com `maxWidth` 480, 640, 900 e
  1280: a latência não muda, só o tamanho do JPEG (19 KB a 85 KB). O gargalo é o
  `desktopCapturer.getSources()`, não o redimensionamento. **Pedir quadro grande é praticamente
  de graça** — o app usa 1100 px a cada 1200 ms.
- **Host de entrada: 0,08 ms por comando** depois de quente, contra ~480 ms na primeira chamada
  (compilar o interop C#). É por isso que existe `input.ping`: a tela de trackpad chama ao abrir
  para pagar esse custo antes do primeiro toque.
- **Spawnar um PowerShell por evento custa ~200 ms** — inviável para arrasto. Daí o host
  persistente, sem módulo nativo (robotjs/nut-js exigiriam rebuild casado com a versão do
  Electron a cada atualização).

---

## 16. Catálogo de features futuras

Do plano de expansão, não implementadas. Nenhuma está começada.

### Inteligência

| # | feature | nota |
|---|---|---|
| C1 | Agente multi-passo real (teto de 4 iterações) | Depende de um 2º passe de síntese estável |
| C2 | Respostas em streaming (SSE da Groq → dashboard e celular) | Ganho grande de percepção de velocidade |
| C3 | Wake word local (Porcupine / openWakeWord) | Roadmap original; escuta contínua |
| C4 | Interromper a fala falando por cima (barge-in) | Depende de C3 |
| C5 | Google Calendar (device flow) | Roadmap original; OAuth liberado pelo Zak |
| C6 | Clima e trânsito | Chave simples |
| C7 | Perguntar sobre arquivo/PDF | Casa com a Caixa |

### Automação

| # | feature | nota |
|---|---|---|
| C8 | Gravar e resumir reunião | Captura de loopback WASAPI é a parte difícil |
| C9 | Modo foco — bloqueia apps/sites por N minutos | Watcher de processo |
| C10 | Pomodoro com voz e push | Trivial depois do scheduler |
| C11 | Presets agendados e por gatilho (boot, horário, Wi-Fi) | Reusa o scheduler |
| C12 | Watchers ("avisa quando esse download acabar") | Reusa scheduler + push |

### Mobile

| # | feature | nota |
|---|---|---|
| C13 | Multi-PC (parear vários, alternar) | `Pairing[]` em vez de um só |
| C14 | Busca no histórico de chat e na Caixa | Dados já estão locais |
| C15 | Apagar, fixar e marcar não-lida na Caixa | Falta `DELETE` no contrato do mailbox |
| C16 | Onboarding com exemplos de comando | Reduz "não sei o que pedir" |
| C17 | Chips de sugestão no chat | Mesma dor de C16 |
| C18 | Háptica e som de feedback | Polimento |
| C19 | Widget de tela inicial Android | Exige código nativo |

### Desktop

| # | feature | nota |
|---|---|---|
| C20 | Desfazer última ação | Precisa de log de ações reversíveis |
| C21 | Paleta de comandos no dashboard (Ctrl+K) | |
| C22 | Push-to-talk segurando o atalho global | Alternativa ao VAD de silêncio |
| C23 | Screenshot com escolha de monitor/região | Multi-monitor hoje pega só o primário |
| C24 | Modo offline com whisper.cpp local | Roadmap original; pesado |
| C25 | Voz masculina PT-BR via WinRT SpeechSynthesis | Resolve a pendência 8 |
| C26 | Outros idiomas | Roadmap original |

### 🚫 Cancelado

**Suporte a múltiplos provedores de IA** (GPT/Gemini/Claude/qualquer). Pedido e depois
cancelado pelo Zak em 11/08/2026: *"não precisa, não quero mais fazer"*. O arquivo iniciado foi
removido, nada foi commitado. **Não retomar sem pedido explícito.**

---

## 17. Como validar

Não há teste automatizado em nenhum dos dois repositórios.

### Automático

```bash
# desktop
npm run build          # roda tsc

# portal
npm run typecheck      # tsc --noEmit
```

### Servidor, por curl

O token fica em `%APPDATA%\neuroaxis\neuroaxis-config.json`, campo `serverToken`.
⚠️ **Esse arquivo também tem a `apiKey` da Groq em texto puro — não jogue o arquivo inteiro no
output.**

```bash
T=<serverToken>

curl -s -H "Authorization: Bearer $T" http://127.0.0.1:4200/api/health
curl -s -H "Authorization: Bearer $T" http://127.0.0.1:4200/api/rpc      # lista os métodos

curl -s -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
     -d '{"method":"system.disks"}' http://127.0.0.1:4200/api/rpc

# destrutivo exige o header de confirmação
curl -s -X POST -H "Authorization: Bearer $T" -H "X-Neuroaxis-Confirm: 1" \
     -H "Content-Type: application/json" \
     -d '{"method":"power.control","params":{"operation":"cancel"}}' \
     http://127.0.0.1:4200/api/rpc
```

Casos de erro que valem testar: token errado → 401 · método inexistente → 404 · destrutivo sem
o header → 403.

> ⚠️ **Não teste `input.type` nem `input.key` por aqui** — ver §14.

### Manual, só o Zak consegue

- [ ] Colar a `GROQ_API_KEY` na primeira abertura
- [ ] Com outro app em foco, `Ctrl+Shift+J` muda o ícone da bandeja para "ouvindo"
- [ ] Comando de música abre/toca no Spotify certo
- [ ] Comando de site abre o navegador na busca certa
- [ ] Comando de programa abre o app pedido
- [ ] Pergunta livre recebe resposta **falada** (é o teste que pega a regressão do `routeAction`)
- [ ] Reiniciar o PC e o NEUROAXIS aparecer sozinho na bandeja
- [ ] Instalador `.exe` roda limpo em outra pasta/perfil
- [ ] **Parear o celular com o APK novo** ← o item aberto agora
- [ ] Trackpad: mover, clicar, e **digitar com acento** num campo de texto
- [ ] Lembrete de 2 minutos: TTS + notificação no PC + push no celular com o app fechado
- [ ] Foto pela câmera → resposta correta; pergunta que exige web
- [ ] Play/pause e "tocando agora" do Spotify nos dois lados
