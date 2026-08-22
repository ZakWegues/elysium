# ULTRA HANDOFF — ELYSIUM

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
| 18 | [Plano ELYSIUM — rename, redesign, cérebro local](#18-plano-elysium--rename-redesign-cérebro-local) |
| 19 | [Plano fase 2 — vidro, paridade e conteúdo](#19-plano-fase-2--vidro-paridade-e-conteúdo-blocos-15-a-22) |
| 22 | [Fase 5 — a IA morta, e os seis pedidos do celular](#22-fase-5--a-ia-morta-e-os-seis-pedidos-do-celular-blocos-41-a-50) |

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
| `elysium/ULTRA_HANDOFF.md` | Cópia idêntica, **versionada no git**. É a que sobrevive a perder a máquina. |

A raiz do `ELYSIUM` não é um repositório git. Um documento que só existisse lá não iria pro
GitHub e sumiria junto com o PC — o que seria contraditório, já que ele existe justamente
para sobreviver à perda de contexto. **Ao atualizar, atualize as duas cópias.**

### Inventário dos outros documentos

Cinco documentos concorrentes já divergiram entre si neste projeto. A tabela abaixo existe
para você não perder tempo lendo — nem confiar em — um deles.

| arquivo | vale ler? |
|---|---|
| `elysium/ULTRA_HANDOFF.md` | ✅ **Este.** A fonte de verdade |
| `elysium/HANDOFF.md` | ↪️ Ponteiro para cá |
| `elysium/CONTRATO_RPC.md` | ↪️ Ponteiro para cá (conteúdo absorvido na §9 e §11) |
| `elysium/README.md` | ✅ Sim, mas só para instalar e para o troubleshooting do usuário final |
| `elysium/CLAUDE.md` | ✅ Sim, como **documento histórico**: é a especificação original ("Jarvis PC"), com as decisões fechadas no início. Algumas seções "fora do escopo" já foram implementadas desde então |
| `elysium-m/AGENTS.md` | ✅ Sim, 3 linhas: leia a doc versionada do Expo v57 antes de escrever código |
| `elysium-m/CLAUDE.md` | ↪️ Ponteiro para cá. Era o plano escrito **antes de o app existir** |
| `elysium-m/README.md` | ✅ Sim, para o passo a passo de build em outra máquina |
| ~~`CONTEXTO_NEUROAXIS.md`~~ | 🗑️ Apagado dos dois repos. Obsoleto |
| ~~`elysium/NEUROAXIS.txt`~~ | 🗑️ Apagado. 582 linhas anteriores ao mobile, com números já errados |

> 🔴 **Regra ao criar documentação nova: não crie.** Adicione a este arquivo. Foi a
> multiplicação de documentos que produziu a situação acima, e o custo é uma sessão inteira
> tomando decisão a partir de um documento errado.

---

## 2. O ecossistema em uma página

Dois aplicativos pessoais, de uso real (não protótipo), que conversam pela rede.

> ✅ **Rename concluído em 14/08/2026** (§18). Marca, identidade dos dois apps, perfil de
> dados, pastas locais e repositórios são ELYSIUM / ELYSIUM-M. Onde este documento ainda
> escrever `neuroaxis`, é referência histórica ou compatibilidade proposital — não caminho.

### ELYSIUM (desktop)

- Pasta: `c:\Users\ZAK\ELYSIUM\elysium` · repo: `ZakWegues/elysium` · branch `main`
- Electron 31 + TypeScript, Windows 11
- Assistente de voz em português do Brasil que vive na bandeja do sistema
- Atalho global `Ctrl+Shift+J` funciona com qualquer app em foco

### ELYSIUM-M (mobile)

- Pasta: `c:\Users\ZAK\ELYSIUM\elysium-m` · repo: `ZakWegues/elysium-m` · branch `main`
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
   (`ELYSIUM/` e `elysium/`).
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

| Repo | HEAD (21/08/2026) | Estado |
|---|---|---|
| `elysium` | `4fc902c` — *docs: bloco 49* | limpo, pusheado |
| `elysium-m` | `e4d4dca` — *fix: redimensionar gravava a cada quadro* | limpo, pusheado |

A fase 5 inteira (§22) está nesses dois. Verificado antes de subir: `npm run build` no
desktop, `npm run typecheck` **e** `npx expo export --platform android` no Portal — o
typecheck sozinho não pega import quebrado em tempo de execução, o bundle pega.

> 🔴 **O que está commitado NÃO é o que está rodando.** O desktop em uso é o instalador
> (`elysium baixadoELYSIUM.exe`) e o celular roda um APK anterior. Ver blocos 48 e 49 —
> é a armadilha mais cara desta fase.

### Blocos do plano de expansão

Todos os 6 blocos concluídos: RPC tipado e pareamento multi-endereço · central de sistema,
clipboard e energia · espelhamento e trackpad · memória, lembretes e push · visão, busca web
e Spotify · Home, modo escuro, share intent e build do APK.

### Blocos do plano ELYSIUM (§18)

| bloco | estado |
|---|---|
| 7 (A1) — branding visível nos dois lados | ✅ concluído |
| 8 (A2) — identidade do desktop + migração do userData | ✅ concluído e verificado em execução |
| 9 (A3) — identidade do mobile (APK novo) | ✅ concluído — APK instalado e pareado |
| 10 (A4) — repositórios e pastas | ✅ concluído |
| 11 (B) — motor de temas por família + 3 variações do Vidro Líquido | ✅ concluído |
| 12 (B) — os 3 temas ELYSIUM | ✅ concluído |
| 13 (C1) — bancada de medição do roteador | ✅ concluído |
| 14 (C2) — cérebro local + fallback + VRAM | ✅ concluído |

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

**Estado do APK corrigido:** `elysium-m/dist-apk/elysium-m.apk`, 97,8 MB,
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
npm run dist    # build + electron-builder --win nsis  → release/ELYSIUM-Setup-1.0.0.exe
```

### Ciclo de vida

- Vive na **bandeja do sistema**, sem janela na barra de tarefas. Fechar janela não encerra;
  só "Sair" no menu da bandeja encerra de verdade.
- **Single-instance lock**: abrir de novo só traz o dashboard da instância existente.
- Inicia com o Windows via `auto-launch`, `isHidden: true`. ⚠️ O nome registrado **não** é o
  que o código passa: a biblioteca usa o basename do executável. Ver a armadilha na §14.
- Atalho global registrado no `whenReady`; trocável em tempo de execução pelo
  `config:set-all`.
- Três janelas: **dashboard** (principal), **config** (primeira execução / ajustes) e
  **recorder** (invisível — só existe porque `MediaRecorder` é API de renderer).

### Onde ficam os dados

| o quê | onde |
|---|---|
| API key da Groq, token do servidor, overrides | `%APPDATA%\elysium\elysium-config.json` |
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
| `dashboard.html` (3017) | Janela principal, JS vanilla. Gaveta esquerda (perf/storage/taskmgr), gaveta direita (config/conversas/presets/mídia/personalização/pareamento), timeline central com chat duplo, 6 temas em 2 famílias (ver §18) |
| `config.html` (547) | Primeira execução e ajustes, seletor de modelos com os avisos |
| `recorder.html` (95) | Invisível, só `MediaRecorder` |
| `preload-*.ts` | Pontes IPC das três janelas |

**`config/`** — `apps.json` (mapa de ~75 nomes de programa → comando) · `presets.json`

**Raiz** — `config.json` (defaults empacotados) · `Iniciar ELYSIUM.vbs` (lançador silencioso,
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
| `chat` × `write_text`/`create_file` | **par novo, criado pelo modelo local** (§18). Perguntar é `chat`, mesmo com "me explica", "quem foi", "o que é"; só é `write_text` quando o texto em si é o produto pedido. O 70B nunca errou isso; o `llama3.2` de 3B **criava arquivo na Área de Trabalho para perguntas** |

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

> ⚠️ **Desde 14/08/2026 o cérebro é local.** `routerProvider` e `chatProvider` vêm como
> `ollama` (`llama3.1:8b` desde 21/08), e os dois modelos abaixo passaram a ser **só o fallback** — ver
> §18. Visão, busca web e STT continuam na Groq de verdade, então a API key segue
> obrigatória.

> 🔴 **Atualizado em 21/08/2026 (§22): a família Llama INTEIRA saiu do catálogo da Groq**, e
> com ela os dois padrões antigos (`llama-3.3-70b-versatile`). O local mudou de `llama3.2`
> para `llama3.1:8b`, que não estava mais baixado. Os dois 404 juntos derrubaram todo comando.

| campo | padrão | papel |
|---|---|---|
| `routerModel` | `openai/gpt-oss-120b` | Decide **qual** ação. Hoje só entra como fallback |
| `brainModel` | `openai/gpt-oss-120b` | Escreve a resposta de conversa. Hoje só entra como fallback |
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

> ⚠️ **São 59, não 52, desde 21/08/2026** — conferido em `GET /api/rpc` contra o app
> rodando. Os `presets.*` do bloco 29 e os que vieram depois nunca foram somados aqui. O
> título e a tabela abaixo ficam com o número antigo até alguém recontar item a item; o
> valor confiável é o que a rota de descoberta devolve.

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
X-Elysium-Confirm: 1
```

> **O servidor também aceita o `X-Neuroaxis-Confirm` antigo**, de propósito (bloco 7).
> Desktop e celular não atualizam ao mesmo tempo — o desktop é build local, o celular é
> APK/OTA — e sem o aceite duplo existiria uma janela em que todo destrutivo devolveria 403
> para um app ainda não atualizado, com "falhou" no celular e nenhuma pista da causa. O nome
> antigo sai depois que o APK do bloco 9 estiver instalado e confirmado.

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

`package`: `com.zak.elysium.m` · `scheme`: `elysium` · projectId EAS (antigo, ver §18)
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

`elysium-m/AGENTS.md` tem três linhas e elas valem:

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
  if ($app -match 'electron|elysium|neuroaxis|node') { $_.DisplayName }
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
npm run dist   →  release/ELYSIUM-Setup-1.0.0.exe
```

`appId` `com.zak.elysium`, produto `ELYSIUM`, não-oneClick, per-user, permite escolher
pasta, cria atalhos. **Não testado depois das mudanças recentes.**

### Portal — APK local (caminho normal)

```
npm run build:local   →  dist-apk/elysium-m.apk
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
- 🔴 **O `auto-launch` ignora o `name` no Windows.** O `fixOpts()` da biblioteca sobrescreve
  o `appName` com o basename do executável antes de tocar no registro:
  `this.opts.appName = caminho.split('\\').pop()` → `ELYSIUM.exe` → `ELYSIUM`. Duas
  consequências que já custaram tempo aqui:
  1. `new AutoLaunch({name:"NEUROAXIS"}).disable()` **não** apaga a entrada `NEUROAXIS` —
     apaga a do executável atual, que é justamente a que se quer manter. Para remover uma
     entrada de nome antigo, mexa no registro direto (`reg.exe`, builtin). Ver
     `src/main/migrateUserData.ts`.
  2. O nome real da entrada é `electron` em desenvolvimento e `ELYSIUM` só depois do
     instalador. Nesta máquina **não há instalação NSIS** — o app sempre subiu em modo dev,
     então a entrada em `HKCU\...\Run` é `electron` apontando para
     `ELYSIUM\neuroaxis\node_modules\electron\dist\electron.exe`.
- 🔴 **`autoLauncher.isEnabled()` só confere que o valor existe, não que o caminho é
  válido.** Como o `main.ts` faz `if (cfg.autoLaunch && !enabled) enable()`, um caminho que
  ficou obsoleto (pasta renomeada, app movido) **nunca é reescrito**: a entrada continua lá,
  apontando para o nada, e o app simplesmente deixa de subir com o Windows sem erro nenhum.
  É o que vai acontecer no bloco 10, quando a pasta for renomeada — ver §18.
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

> **Revisada em 21/08/2026** ao fim da fase 5 (§22). Os itens riscados foram resolvidos ou
> deixaram de ser verdade; ficam visíveis porque a informação de que já foram problema tem
> valor, e apagar faria a próxima sessão reinvestigar.

0. **🔴 O que está commitado não é o que está rodando.** O desktop em uso é o instalador em
   `elysium baixado`, e o celular roda um APK anterior ao fingerprint atual. Enquanto os
   dois não forem atualizados, todo conserto da fase 5 existe só no git. **É a pendência de
   maior impacto agora** — ver blocos 48 e 49.
1. ~~**⚠️ Pareamento não validado depois da correção do cleartext.**~~ **Resolvido**: o APK
   com `usesCleartextTraffic` foi instalado e pareado em 14/08 (§18, bloco 9).
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
6. ~~**Instalador `.exe` (NSIS) não testado**~~ — **ele existe e roda**: é justamente a build
   que serve a porta 4200 nesta máquina (bloco 48). Um instalador novo foi gerado em
   21/08/2026 às 16h06 (`release/ELYSIUM-Setup-1.0.0.exe`, 75,9 MB) e **verificado por
   dentro** — o `app.asar` contém `gpt-oss-120b`, `llama3.1:8b`, `marcarModeloMorto` e
   `home-card-resize`. Falta instalar.
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
13. ~~**Build obsoleta na fila do EAS**~~ — irrelevante desde que o build virou local (§13).
    O caminho normal não passa mais pelo EAS; só o `eas update` passa.
14. **Checklist de validação manual do `CLAUDE.md`** ainda não confirmado ponta a ponta.
15. **⚠️ Config corrompido derruba a inicialização em vez de cair no padrão.** Descoberto sem
    querer em 14/08/2026: um `elysium-config.json` gravado com **BOM** (é o que o
    `Set-Content -Encoding utf8` do PowerShell 5.1 faz) fez `JSON.parse` estourar e **o app
    não abriu** — sem janela, sem notificação, sem nada que dissesse o motivo. Contraria o
    requisito do `CLAUDE.md` de que o app nunca trava por erro de arquivo. Saída barata:
    ligar o `clearInvalidConfig` do `electron-store` ou envolver a construção do store num
    try/catch que recomeça do padrão, avisando no log.
    ⚠️ Ao editar esse arquivo por script, use `[System.IO.File]::WriteAllText` com
    `UTF8Encoding($false)` — nunca `Set-Content -Encoding utf8`.

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

O token fica em `%APPDATA%\elysium\elysium-config.json`, campo `serverToken`.
⚠️ **Esse arquivo também tem a `apiKey` da Groq em texto puro — não jogue o arquivo inteiro no
output.**

```bash
T=<serverToken>

curl -s -H "Authorization: Bearer $T" http://127.0.0.1:4200/api/health
curl -s -H "Authorization: Bearer $T" http://127.0.0.1:4200/api/rpc      # lista os métodos

curl -s -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
     -d '{"method":"system.disks"}' http://127.0.0.1:4200/api/rpc

# destrutivo exige o header de confirmação
curl -s -X POST -H "Authorization: Bearer $T" -H "X-Elysium-Confirm: 1" \
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

---

## 18. Plano ELYSIUM — rename, redesign, cérebro local

Aprovado pelo Zak em 13/08/2026. Substitui qualquer plano solto: os blocos de trabalho do
projeto continuam a partir do 7.

### Por que este plano existe

O ecossistema já se chamava ELYSIUM na pasta-mãe e na documentação, mas o rename nunca tinha
tocado código, identidade de app nem nome de repositório. Junto vieram dois pedidos que
dependem de nomes estáveis: dar ao desktop identidade visual própria (o tema padrão era uma
paleta roxo/ciano genérica) e tirar o cérebro da nuvem, movendo roteamento e conversa da Groq
para o Ollama local.

🔴 **A armadilha central do rename:** a maior parte das ocorrências de "neuroaxis" é texto de
tela, mas um punhado é **caminho de dado** (`%APPDATA%\neuroaxis`, de onde saem os 10
arquivos do `electron-store`; as chaves do `AsyncStorage` do Portal) ou **contrato de rede**
(o header de confirmação). Um find/replace geral apagaria API key, token do servidor,
memória, lembretes e pareamento — sem erro nenhum, parecendo reset de fábrica.

### Decisões fechadas com o Zak

| decisão | escolha |
|---|---|
| Escopo do rename | Tudo: branding, identidade desktop, identidade mobile, repos e pastas |
| Nome de exibição do mobile | **ELYSIUM-M** |
| Temas | 6 no total: 3 variações de cor do Vidro Líquido + 3 variações ELYSIUM |
| Direção visual ELYSIUM | Campos Elísios noturnos — azul-noite com luz dourada |
| Cérebro local | Medir antes de trocar; `keep_alive` curto + detecção de jogo |
| Peças que vão para o local | Roteador e conversa. **Visão, STT e busca web ficam na Groq** |

### Ambiente levantado em 13/08/2026 (para o bloco C)

- **Ollama já instalado** em `%LOCALAPPDATA%\Programs\Ollama\ollama.exe`, com `llama3.1:8b` e
  `llama3.2` (3B) já baixados — 6,7 GB em `~\.ollama\models`. O daemon fica parado.
- GPU real: **8151 MiB**, ~6,9 GB livres com o PC ocioso. ⚠️ O `Win32_VideoController`
  reporta 4 GB — campo de 32 bits, mentira conhecida. **Use o `nvidia-smi`.**

---

### Bloco 7 (A1) — Branding visível ✅

Só o que aparece na tela; nenhuma identidade de app, nenhum caminho de dado.

- **Desktop:** títulos de janela e de `notify()`, bandeja, logo do topbar (badge `NA` → `EL`),
  texto de pareamento, prompts do `brain.ts`, alertas do `systemInfo.ts`, páginas do callback
  do Spotify, prefixo `[ELYSIUM server]`, `NeuroaxisError` → `ElysiumError`, README, `.vbs`.
- **Portal:** strings das 7 telas e o rótulo do canal de notificação (o **id** do canal
  continua `'default'` — mudar o id criaria canal novo e as preferências do usuário no Android
  ficariam órfãs).
- **Pontes IPC** renomeadas junto (`window.neuroaxisConfig` → `elysiumConfig`,
  `window.neuroaxis` → `window.elysium`): preload e HTML viajam no mesmo `dist`, sem skew.
- **Firewall:** o `liberar-acesso-remoto.ps1` agora remove também a regra de nome antigo. Uma
  regra de porta órfã não some sozinha nem dá sinal de que existe.
- **Header de confirmação:** `X-Elysium-Confirm`, com o servidor **aceitando os dois nomes**
  (ver §9).

### Bloco 8 (A2) — Identidade do desktop, com migração dos dados ✅

`package.json` (`name` `neuroaxis`→`elysium`, `appId` `com.zak.elysium`, `productName`/
`shortcutName`/`artifactName` ELYSIUM) · `app.setAppUserModelId` · `AutoLaunch({name:"ELYSIUM"})` ·
stores `neuroaxis-config`→`elysium-config` e `neuroaxis-telemetry-log`→`elysium-telemetry-log`.

🔴 **Por que isso apaga os dados se feito sem cuidado:** `app.getPath("userData")` deriva do
`name` do `package.json`. Trocar o nome move o diretório de `%APPDATA%\neuroaxis` para
`%APPDATA%\elysium`, e os **10 `electron-store`** (`neuroaxis-config`, `chat-sessions`,
`history`, `mailbox`, `memory`, `presets`, `push`, `reminders`, `spotify`,
`neuroaxis-telemetry-log`) nascem vazios lá. Some de uma vez: API key, token do servidor
(**todos os pareamentos morrem**), memória, lembretes, presets, conversas, caixa, tokens de
push e o refresh do Spotify.

**Migração de um tiro** — `src/main/migrateUserData.ts`: se o diretório novo ainda não tem
`elysium-config.json` e o antigo existe, **copia** (não move) os `.json`, renomeando os dois
prefixados. Precisa rodar **antes de qualquer `new Store()`** — os stores são construídos em
escopo de módulo, então a garantia é ser o **primeiro `import` do `main.ts`**. Idempotente e
silenciosa em erro: falhar a migração não pode impedir o app de abrir.

**Auto-launch:** o nome novo cria uma entrada nova em `HKCU\...\Run` e **deixa a `NEUROAXIS`
apontando pro caminho antigo** — dois lançamentos no boot, um quebrado. A migração faz um
`disable()` no nome antigo, uma vez.

**Instalador:** `appId` novo = produto diferente pro NSIS. O `ELYSIUM-Setup` **não** substitui
a instalação NEUROAXIS; desinstalar a antiga é manual, depois de confirmar a migração.
Descoberto ao validar: **não existe instalação NSIS nesta máquina** — nada em
`%LOCALAPPDATA%\Programs`. O app sempre subiu em modo desenvolvimento, então não há nada a
desinstalar e o item "instalador não testado" da §15 nunca foi exercitado de verdade.

> 🔴 **VENCIDO desde 21/08/2026 — ver o bloco 48 (§22).** Passou a existir instalação, em
> `ELYSIUMelysium baixado`, e é ela que roda no dia a dia. Ela pega o single-instance
> lock, então toda instância de desenvolvimento encerra em silêncio enquanto ela estiver de
> pé. Quem ler só este parágrafo vai testar a build errada achando que testou a certa.

**Verificado em execução (13/08/2026), não deduzido:**

| verificação | resultado |
|---|---|
| perfil criado em `%APPDATA%\elysium` | 10 stores + 28 anexos copiados |
| `serverToken` idêntico ao do perfil antigo | ✅ — nenhum pareamento morreu |
| `apiKey` da Groq idêntica | ✅ |
| lembretes e memória preservados | 1 e 1, iguais |
| caminhos de anexo no `mailbox.json` | 28 reescritos, 0 apontando pro perfil velho |
| servidor lendo o token migrado (`/api/health` + `/api/rpc`) | 200, 52 métodos, sem token → 401 |
| destrutivo sem header / com header novo / com header antigo | 403 / OK / OK |
| segunda abertura (idempotência) | sem re-cópia, dados intactos |
| perfil antigo | intacto, mais backup em `C:\Users\ZAK\ELYSIUM-backup\` |

**A armadilha que apareceu no caminho:** o `auto-launch` ignora o `name` no Windows. A
primeira versão do `clearLegacyAutoLaunch()` usava a biblioteca e por isso não removia
nada — removeria a entrada certa. Corrigido para `reg.exe` direto. Detalhe completo na §14.

### Bloco 9 (A3) — Identidade do mobile: ELYSIUM-M ✅

**Exige APK novo. Não vai por OTA.** `app.json` (`name`, `slug`, `scheme` `elysium`,
`android.package`, `ios.bundleIdentifier`, textos de permissão) · `shareIntent.ts`
(`elysium://`, tem que casar com o `scheme`) · `withReleaseSigning.js` (prefixo `NEUROAXIS_*`,
config gradle `neuroaxisRelease`) · `build-local.ps1` (saída `elysium-m.apk`).

**As chaves do `AsyncStorage`** (`neuroaxis_pairing`, `neuroaxis_chat_sessions`,
`neuroaxis_chat_deleted`, `neuroaxis_command_queue`, `neuroaxis_mailbox_*`, `neuroaxis_theme`,
`neuroaxis_color_scheme`) podem ser renomeadas **de graça neste bloco e só neste**: trocar o
`android.package` já cria instalação nova, com armazenamento vazio.

> 🔴 **Essas chaves nunca podem ser renomeadas por `npm run update`.** Um OTA que mude uma
> delas chega num app instalado e o deixa despareado, sem erro visível.

**Chave de assinatura:** renomear os **arquivos** é seguro; **gerar chave nova não é** (mata o
caminho de atualização por cima, §13). Renomeando o `.keystore`, a linha `STORE_FILE` de
dentro do `.properties` acompanha.

**Escolhas fechadas:** `android.package` = `com.zak.elysium.m` · `scheme` = `elysium` ·
`slug` = `elysium-m` · `expo.name` = `ELYSIUM-M`.

**A chave de assinatura NÃO foi tocada.** Ela mora fora do repositório e não tem backup
(pendência 2 da §15), então em vez de renomear arquivo de credencial sem rede de segurança, o
`withReleaseSigning.js` passou a **aceitar os dois nomes de arquivo e os dois prefixos de
chave** (`ELYSIUM_*` e `NEUROAXIS_*`). Renomear no disco virou opcional; o que continua
proibido é gerar chave nova. Só o nome da config do gradle mudou
(`neuroaxisRelease` → `elysiumRelease`), que é interno.

> 🔴 **ESTE PARÁGRAFO ESTÁ ERRADO. Não rode `eas init`. Ver o bloco 49 (§22).**
>
> Conferido em 21/08/2026 no arquivo: o `slug` **nunca** foi trocado — continua
> `neuroaxis-portal`, e só o `expo.name` virou ELYSIUM-M. Slug, `projectId` e `updates.url`
> sempre apontaram para o mesmo projeto, `npx eas-cli project:info` resolve limpo, e o
> `eas update` funciona sem nada a consertar. Rodar `eas init` aqui seria o erro: ele
> re-vincula, e um `projectId` novo invalida o `updates.url` compilado dentro do APK já
> instalado — o aparelho pararia de buscar atualização, sem erro visível.

**Ícones:** eram o placeholder padrão do Expo (a seta azul do template). **Refeitos em
14/08/2026** — ver a seção de ícones abaixo.

**Concluído em 14/08/2026:** `npm run build:local` gerou o `dist-apk/elysium-m.apk` (97,8 MB),
o Portal antigo foi desinstalado, o ELYSIUM-M instalado e pareado pelo QR.

> ⚠️ **Continua pendente:** `npx eas-cli init`. O `extra.eas.projectId` e o `updates.url`
> ainda apontam para `a9c62871-2d6d-4e05-b458-1e58655449b5`, o projeto do slug antigo. Não
> atrapalha nada hoje — o build é local e não passa pelo EAS — mas **o próximo
> `npm run update` pode ser recusado por divergência de slug**. É um comando, quando der.

**Custo:** desinstalar o Portal → instalar o `elysium-m.apk` → reparear pelo QR → re-registrar
o push. **As conversas voltam sozinhas** pela sincronização (o PC é a autoridade, §11).
Pareamento e tema local, não.

> Este bloco só faz sentido depois do 8 validado em uso: parear o app novo contra um desktop
> cujo `serverToken` ainda não se confirmou que sobreviveu mistura duas investigações.

### Bloco 10 (A4) — Repositórios e pastas ✅

GitHub `neuroaxis`→`elysium` e `neuroaxis-portal`→`elysium-m`, com `git remote set-url` nos
dois (redirect do GitHub não é contrato) · pastas locais `ELYSIUM\elysium` e
`ELYSIUM\elysium-m` (exige nada segurando: app da bandeja, Metro, janelas do VSCode) ·
`Iniciar ELYSIUM.vbs` (ele deriva a própria pasta, mas um **atalho** pro nome antigo quebra) ·
os caminhos citados na §1 e §2 deste documento.

> 🔴 **Achado no bloco 8 que este bloco precisa tratar.** A entrada de início automático
> desta máquina é `electron`, apontando para
> `C:\Users\ZAK\ELYSIUM\neuroaxis\node_modules\electron\dist\electron.exe`. Renomear a pasta
> deixa esse caminho obsoleto — e o `isEnabled()` do `auto-launch` só confere que o valor
> **existe**, não que ele aponta pra algum lugar válido (§14). Resultado: a entrada continua
> lá apontando pro nada e o app **para de subir com o Windows, em silêncio**.
>
> A correção pertence a este bloco: em vez de `if (!enabled) enable()`, ler o valor gravado
> e re-registrar quando ele não contiver o `process.execPath` atual. Assim o conserto vale
> também para o dia em que a pasta mudar de novo, ou para a troca de dev → instalador.

**Feito:**

- Repositórios renomeados no GitHub via `gh repo rename` (os dois são privados, sem colisão
  de nome) e `git remote set-url` nos dois, confirmado com `fetch`.
- `Iniciar NEUROAXIS.vbs` → `Iniciar ELYSIUM.vbs`.
- Caminhos e nomes de repo atualizados neste documento e nos `README`/`CLAUDE.md`.
- **`src/main/autoLaunch.ts`, novo.** Concentra o início automático e conserta a armadilha 2
  da §14: em vez de perguntar "a entrada existe?", pergunta "**o executável gravado ainda
  existe no disco?**" — e reescreve quando não existe. Critério melhor que comparar com o
  `process.execPath`, porque cobre de uma vez pasta renomeada, app movido e a troca
  desenvolvimento → instalador. A remoção da entrada NEUROAXIS legada mudou-se pra cá
  também: é assunto de registro do Windows, não de perfil de dados, e o `migrateUserData.ts`
  voltou a ser só sobre o perfil.

**O rename físico das pastas precisou do Zak.** O Windows recusa renomear um diretório
enquanto qualquer processo tem handle aberto lá dentro, e o VSCode mantinha os dois projetos
indexados (um TS server por projeto). Verificado que não era permissão: criar e renomear uma
pasta vazia dentro de `ELYSIUM` funcionava. Feito com o editor fechado, por um script
descartável que já foi apagado.

**O conserto do início automático se provou no cenário real, não só no simulado:** depois do
rename, a entrada em `HKCU\...\Run` apontava para `ELYSIUM\neuroaxis\...`; a primeira
abertura do app detectou que o executável não existia mais e reescreveu para
`ELYSIUM\elysium\...`. Sem isso, o app teria parado de subir com o Windows em silêncio.

### Bloco 11 (B) — Motor de temas: famílias, e as 3 variações do Vidro Líquido ✅

Levantamento: o `lg` **não é uma paleta**. São **125 seletores `.theme-lg`** no
`dashboard.html` (raios, sombras, blur, camada de blobs, molas de `cubic-bezier`,
`prefers-reduced-motion`) mais um bloco próprio no `config.html`. O `applyTheme()` troca só
**7 variáveis CSS**. Um tema com o mesmo capricho precisa do bloco de CSS dele, não de uma
linha no objeto `THEMES`.

1. `THEMES` ganha `family: "lg" | "ely"`; `applyTheme` alterna as duas classes pela família.
2. 🔴 **Compatibilidade do tema guardado.** O `config.theme` em disco é `default` (ou
   `ocean`/`ember`/`forest`) e essas chaves deixam de existir. `applyTheme` faz
   `THEMES[id] ? id : "default"` — com `default` fora do objeto, `p` vira `undefined` e **o JS
   do dashboard morre inteiro na abertura**. Precisa de mapa `{default,ocean,ember,forest} →
   ely`, fallback constante novo, e `DEFAULTS.theme` do `config.ts` junto.
3. As 3 variações de cor do Vidro Líquido só funcionam se os `rgba(109,74,255,…)` do bloco
   `lg` (19 no `dashboard.html`, 4 no `config.html`) virarem `--purple-soft`/`--purple-glow`.
   Para o `lg` atual o valor calculado fica **idêntico**. Os `rgba(255,255,255,…)` e
   `rgba(17,17,26,…)` (36 e 29) são o que **faz** o vidro ser claro: ficam.
4. `config.html:405` hardcoda `cfg.theme === "lg"` e **não aplica paleta nenhuma** — passa a
   aplicar família + as 7 variáveis, senão a janela de config ignora a variação escolhida.

**As 3 variações do Vidro Líquido** — mesmo CSS, só a paleta muda:

| id | nome | roxo / ciano |
|---|---|---|
| `lg` | Vidro Líquido | `#6d4aff` / `#22b8cf` — **inalterado** |
| `lg-tide` | Vidro — Maré | `#1e7fd4` / `#17b8a6` |
| `lg-amber` | Vidro — Âmbar | `#c2602c` / `#c9971f` |

**Como ficou, e o que mudou em relação ao previsto:**

- `--purple-rgb` / `--cyan-rgb` são **derivadas do hex da paleta** por `hexToRgbList()`, e
  não guardadas junto no `THEMES`. Dois formatos da mesma cor lado a lado saem de sincronia
  no primeiro tema novo. Conferido que a derivação reproduz os literais antigos exatamente
  (`#6d4aff` → `109,74,255`, `#22b8cf` → `34,184,207`), então o `lg` não mudou um pixel.
  Valor não-hex (o `surface` do `lg` é `rgba()`) devolve `null` e a variável fica como está.
- **Os blobs do fundo também precisaram virar variáveis** — não estava previsto. Em literal,
  "Maré" e "Âmbar" ficariam com a camada de fundo roxa do `lg`. Tema sem `blobs` próprios
  limpa os do anterior, senão o fundo guardaria a cor de um tema já trocado.
- 🔴 **Conflito de cascata no `config.html`, achado ao codar.** O bloco `body.theme-lg` de lá
  declara `--purple`, `--bg` e `--surface`, e **variável declarada no `body` vence a do
  `html`** para tudo que está dentro dele. Aplicar a paleta em `document.documentElement`
  não teria efeito nenhum: as variações sairiam sempre com o roxo do `lg`. Por isso a janela
  de config aplica no **próprio `body`**, onde estilo inline passa por cima da classe. O
  dashboard não tem esse problema porque o `body.theme-lg` dele não declara cor de paleta.
- Os 4 temas clássicos continuam presentes por ora, marcados `family: "classic"` — que não
  liga classe nenhuma, ou seja, é o visual de sempre. Saem no bloco 12, quando os ELYSIUM
  entram no lugar; assim cada bloco fecha num estado testável em vez de deixar o seletor
  quebrado no meio.

### Bloco 12 (B) — Os 3 temas ELYSIUM ✅

Bloco `body.theme-ely` novo. **Nada do `lg` é reescrito.** Os seletores de *movimento*
(molas nos botões, `lg-modal-in`, `lg-bubble-in`, o brilho que atravessa os botões, o
`prefers-reduced-motion`) **não têm cor** — basta acrescentar `.theme-ely` às listas que já
existem: aditivo, e o `lg` fica intacto. As regras *de cor* do `lg` são claras por natureza e
não servem.

**Os 6 temas finais, em 2 famílias:**

| id | nome | família |
|---|---|---|
| `ely` | Campos Elísios — ouro sobre azul-noite | `ely` · **padrão** |
| `ely-dusk` | Crepúsculo — âmbar e rosa sobre índigo | `ely` |
| `ely-ether` | Éter — prata-ciano frio | `ely` |
| `lg` | Vidro Líquido | `lg` |
| `lg-tide` | Vidro — Maré | `lg` |
| `lg-amber` | Vidro — Âmbar | `lg` |

**Como ficou:**

- **`.theme-rich`** é a classe comum às duas famílias e carrega **só o movimento** — molas
  de `cubic-bezier`, entrada de modal e de bolha, o brilho que atravessa os botões, a camada
  de blobs. É `transform`/`transition`/`@keyframes`, sem uma cor: por isso as duas famílias
  compartilham em vez de duplicar 30 listas de seletores. As regras **de cor** seguem
  separadas em `.theme-lg` e `.theme-ely`, porque aí cada uma quer coisa diferente.
- **O bloco `.theme-ely` é curto (~40 regras) contra ~100 do `.theme-lg`**, e isso não é
  descuido: o dashboard já nasceu escuro, então o `lg` gasta quase tudo convertendo escuro
  em claro. O ELYSIUM herda a base e só mexe no que é identidade.
- **Feixes de luz** (`#ely-shafts`): dois gradientes diagonais a 6% de opacidade, deriva de
  44 s e 58 s — bem mais lenta que a dos blobs, para o fundo nunca competir com a leitura. É
  o elemento que o `lg` não tem. Respeita `prefers-reduced-motion`.

**🔴 Dois achados que não estavam previstos:**

1. **A base do dashboard tinha 28 usos de `rgba(123,94,167,…)`** — o roxo do tema `default`
   **fixo no CSS** — e 9 do ciano dele. Ou seja, `ocean`, `ember` e `forest` **nunca**
   pintaram bolha de chat, botão de enviar ou microfone com a cor deles: ficavam roxos.
   Ninguém tinha percebido em meses. Os 37 foram variabilizados; sem isso o ELYSIUM herdaria
   o mesmo defeito.
2. **`isLightTheme()` comparava com o id `"lg"` direto.** Com variações na família, "Maré" e
   "Âmbar" desenhariam a grade e o texto dos gráficos como se o fundo fosse escuro. Passou a
   perguntar pela **família**, que é quem de fato define o fundo.

**Compatibilidade validada em execução:** gravado `theme: "ocean"` (aposentado) no disco e
aberto o app. Foi traduzido para `ely-ether`, **regravado** para o disco parar de carregar um
id morto, e o app seguiu vivo. Sem o mapa `TEMAS_APOSENTADOS`, `THEMES["ocean"]` devolveria
`undefined`, `p.purple` estouraria e **o JS do dashboard inteiro morreria na abertura** —
janela em branco, sem erro visível.

> **As variáveis continuam se chamando `--purple` e `--cyan` mesmo valendo ouro e éter.**
> Renomear atingiria centenas de usos em 2818 linhas sem ganho funcional. Não "consertar".

### Bloco 13 (C1) — Bancada de medição do roteador ✅

**Nenhuma linha do app muda.** É a regra 3 da §3 aplicada. `scripts/bench-router.mjs` +
`bench-cases.json`: ~40 frases reais com gabarito, cobrindo de propósito os 7 pares difíceis
da §6 e ≥5 pedidos compostos, rodadas com o **mesmo `buildSystemPrompt()`** contra Groq 70B
(linha de base), `llama3.1:8b` e `llama3.2` (3B). Saída: acerto global, por ação, pares
difíceis isolados, taxa de JSON inválido, latência p50/p95.

**O que foi confirmado em execução (14/08/2026), e não presumido:**

| pergunta | resposta medida |
|---|---|
| `/v1/chat/completions` honra `response_format: json_object`? | **Sim** |
| `/v1` honra `keep_alive` no corpo? | **Não** — o `ollama ps` seguiu marcando o padrão de 5 min |
| `/api/chat` (nativo) honra `format:"json"` e `keep_alive`? | **Sim** — o prazo caiu para 59 s como pedido |

Por isso o `llm.ts` fala com o **endpoint nativo**: é o único que permite tirar o modelo da
VRAM sozinho.

**Resultado, 53 casos × 3 execuções:**

| alvo | acerto | JSON inválido | p50 | p95 |
|---|---|---|---|---|
| Groq `llama-3.3-70b` | **não completou** | — | ~30 ms | — |
| Ollama `llama3.1:8b` | 92% | 0 | 552 ms | 1963 ms |
| Ollama `llama3.2` (3B) | **94%** | 0 | 416 ms | 1732 ms |

🔴 **A referência da Groq não pôde ser medida, e isso é dado.** Na primeira rodada, 44 das
46 chamadas bateram 429. Com espaçamento de 16 s a Groq passou a responder, mas na chamada
27 devolveu `retry-after: 2853` — 47 minutos, ou seja, a **cota diária** do plano gratuito,
não o teto por minuto. Uma bancada de roteamento consome a cota de um dia inteiro. Isso
reforça o próprio motivo de migrar: ~11 mil caracteres de prompt por comando é caro demais
para o plano gratuito sustentar.

**⚠️ Limitação conhecida da bancada:** ela manda `system` + a frase, **sem histórico de
conversa e sem o bloco de memória**, que é o que a torna reprodutível. O app manda os dois.
Na prática isso significa que a bancada **não prevê perfeitamente** o comportamento real —
uma frase deu 3/3 na bancada e mesmo assim errou no app. Use-a para comparar modelos entre
si, não como garantia de comportamento.

### Bloco 14 (C2) — Cérebro local, Groq como rede de segurança ✅

**Decisão do Zak em 14/08/2026: o roteador e a conversa passam para o `llama3.2` local.**
Feito com a ressalva medida abaixo dita antes de codar.

**Como ficou:** `llm.ts` novo concentra a chamada dos dois provedores (antes eram dois
`fetch` quase idênticos no `brain.ts`, que com dois provedores virariam quatro).
`gpuGuard.ts` decide se vale carregar o modelo agora. `config.ts` ganhou
`routerProvider`/`chatProvider`/`ollama*`/`fallbackToGroq`/`evitarGpuOcupada`, e o
`config.html` uma seção "Cérebro" com verificação ao vivo do Ollama.

**🔴 O que o modelo local erra, medido e não estimado:**

1. **Pedido composto: 14 de 18.** "Fecha o Chrome e abre o VS Code" sai pela metade com
   alguma frequência. **O fallback não cobre isso** — ação faltando é um JSON perfeitamente
   válido, e nada tem como saber que faltou coisa. É o preço da troca.
2. **`chat` virando `write_text`.** No primeiro teste com o app real, 2 de 6 perguntas do
   tipo "quem foi X" e "me explica Y" **criaram arquivo na Área de Trabalho** em vez de
   responder. Corrigido com uma distinção nova no prompt e três few-shot; a bancada foi de
   2 erros em 6 para **21/21**, e 6 repetições pelo caminho real do app deram 0 erro. Mas
   **não está eliminado**: o erro é intermitente e depende dos turnos anteriores.

**Por que a detecção olha processo em execução, não janela em foco:** jogo minimizado
continua segurando a VRAM inteira. Foco é sobre atenção do usuário; a pergunta aqui é sobre
memória de vídeo. A lista fica em `src/config/gpu-heavy.json`, uma linha por programa.

**Continua na Groq:** STT (Whisper), visão e busca web. **A API key segue obrigatória** — o
`stt.ts` é o caminho da voz, e sem chave o atalho global não transcreve nada.

**Correção que apareceu no caminho:** o servidor mandava `Content-Type: application/json`
**sem `charset=utf-8`** nas 15 respostas. JSON é UTF-8 por padrão e o `fetch` do celular
decodifica certo, mas cliente mais estrito cai para Latin-1 — e acento corrompido é tema
recorrente aqui (§14). Corrigido.

`routerProvider`/`chatProvider` (`groq`|`ollama`), `ollamaBaseUrl`, modelos e `keep_alive` no
`config.ts` + seção nova no `config.html`. Os dois `fetch` quase idênticos do `brain.ts`
(`decideBrain`, `composeChatReply`) viram um `callChat({provider, model, messages, …})`.
`stt.ts`, `vision.ts` e `webSearch.ts` **não são tocados**.

**Fallback:** local primeiro; cai pra Groq com JSON inválido, `unknown`, ação fora da união
`BrainAction`, HTTP de erro ou timeout — cada queda com o motivo no log, pra dar pra medir
depois se o fallback virou regra.

**VRAM:** `keep_alive: "60s"` tira o modelo da GPU sozinho um minuto depois do último comando
(custo: ~2-4 s de recarga na volta). Mais detecção de jogo — processo em primeiro plano contra
uma lista editável (`src/config/games.json`, no espírito do `apps.json`); casou → vai direto
pra Groq sem tocar na GPU. O `inputHost.ts` já mantém um PowerShell persistente, onde a
consulta de janela cabe sem custo de spawn (§15: 0,08 ms quente contra ~200 ms por spawn).

**Fica na Groq, e por quê** — para não ser re-decidido: `webSearch.ts` usa `groq/compound-mini`,
agente que pesquisa sozinho no servidor deles, **sem equivalente local** (o substituto seria
API de busca + RAG, outro projeto). `vision.ts` disputaria a mesma VRAM apertada por um uso
pouco frequente. `stt.ts` exigiria whisper.cpp, outra toolchain (C24, marcado como pesado).

---

### Ícones — `scripts/gerar-icone.mjs`

Os ícones dos dois lados são **gerados por código**, não são arquivos soltos. Rodar:

```
cd elysium && node scripts/gerar-icone.mjs
```

**O que ele escreve**

| destino | arquivo | papel |
|---|---|---|
| `elysium/build/` | `icon.ico` | Bandeja e janelas. **Multi-tamanho**: 16, 24, 32, 48, 64, 128, 256 |
| `elysium/build/` | `icon.png` | 256, usado pelo electron-builder e como reserva |
| `elysium-m/assets/` | `android-icon-foreground.png` | A marca, dentro da zona segura de 66% |
| `elysium-m/assets/` | `android-icon-background.png` | Noite do tema com halo dourado |
| `elysium-m/assets/` | `android-icon-monochrome.png` | Só o "E", para o tema dinâmico do Android 13+ |
| `elysium-m/assets/` | `icon.png`, `favicon.png` | Quadrado cheio, sem alfa (o iOS recusa alfa) |

**Por que por código, e num gerador só**

O projeto tem quatro dependências em produção de propósito e nenhuma biblioteca de imagem —
mas PNG é fácil de escrever à mão com o `zlib` que já vem no Node. E manter a marca em um
lugar só evita o que aconteceria com dois arquivos versionados à mão: divergirem na primeira
correção de cor, sem ninguém notar até os dois ícones já estarem diferentes. Por isso o
gerador do desktop escreve também no repositório do mobile.

**Decisões que valem saber antes de mexer**

- **Cada tamanho do `.ico` é renderizado no próprio tamanho**, com supersampling — não é
  redução do 256. A bandeja desenha em **16px**, e é exatamente ali que encolher o grande
  borra.
- **Zona segura de 66% no Android.** O ícone adaptativo é desenhado em 108dp mas só os 72dp
  centrais são garantidos; o resto o launcher recorta em círculo ou squircle. Marca fora
  disso perde as pontas em metade dos aparelhos.
- **A camada monocromática leva só o "E".** O sistema pinta com a cor do tema do usuário e
  só o alfa importa — mandar o disco inteiro viraria um borrão chapado.

**🔴 Duas armadilhas**

1. **Ícone novo no Android exige APK novo.** Não vai por `npm run update`: é recurso nativo
   e entra no manifesto.
2. **`build/` precisa estar no `files` do `package.json`.** Ele não estava — o `build` do
   electron-builder é `buildResources`, que serve ao instalador e ao `.exe`, e **não** é
   empacotado no app. No app instalado a bandeja cairia no quadrado transparente do
   fallback. Nunca apareceu porque nunca houve instalação NSIS nesta máquina. Corrigido em
   14/08/2026.

> Curiosidade que diz muito sobre documentação: o ícone era um **"J" roxo do "Jarvis PC"**,
> o nome original do projeto. Sobreviveu ao rename para NEUROAXIS e ao rename para ELYSIUM
> sem ninguém notar, até o Zak reparar na bandeja.

---

## 19. Plano fase 2 — vidro, paridade e conteúdo (blocos 15 a 22)

Aprovado pelo Zak em 14/08/2026. **Nada aqui foi executado** — ele pediu explicitamente
"planejar agora, codar depois". Os blocos 7 a 14 da §18 estão concluídos.

### O que motivou

1. **O modo escuro do ELYSIUM-M está feio.** Não é gosto: são três defeitos objetivos,
   localizados no código e descritos no bloco 15.
2. **O desktop deve ganhar a cara do mobile** — meta antiga (§3), que o bloco 12 atendeu só
   na cor. O mobile navega por abas com uma tela Início; o desktop segue com duas gavetas.
3. **O desktop tem serviço e RPC para lembretes, memória, energia, área de transferência e
   programas — e nenhuma tela para nada disso.** Zero ocorrências de "lembrete", "memória" ou
   "clipboard" no `dashboard.html`. Hoje só dá para usar por voz ou pelo celular.

### Decisões fechadas com o Zak

| decisão | escolha |
|---|---|
| Cara do mobile no desktop | Tela Início + navegação por abas |
| Temas | **3 cores × claro/escuro** nos dois lados; "seguir o sistema" continua valendo |
| Funções novas | Todas: telas que faltam · Ctrl+K e busca · automação · streaming |
| Streaming | Texto palavra a palavra; **a voz espera a resposta fechar** |
| Backend das telas novas | Reusar os 52 métodos RPC — uma implementação só |

### 🔴 Correção de rota: o RPC do desktop NÃO passa por HTTP

A escolha inicial era o dashboard chamar `http://127.0.0.1:4200/api/rpc`, como o celular
faz. **Não funcionaria:** o servidor não manda cabeçalho de CORS (removido de propósito,
§8) e o renderer é uma página `file://` — o navegador recusaria a resposta, exatamente como
aconteceu com o `expo start --web`.

A intenção é honrada sem HTTP: **`handleRpc()` já é exportado** pelo `rpc.ts`, então o main
chama a função direto e o renderer fala com ele por um canal IPC genérico. Sem CORS, sem
token no renderer, sem porta.

---

### Bloco 15 — O modo escuro do ELYSIUM-M ✅

Três defeitos verificados no código:

1. **O "brilho de borda" é um véu branco sobre a superfície inteira.**
   `GlassSurface.tsx:51` desenha `rgba(255,255,255,0.55) → 0.08 → 0.22` em
   **`StyleSheet.absoluteFill`** — cobrindo o card todo, não a aresta — e em branco fixo, sem
   olhar o modo. No claro passa despercebido; no escuro **todo `Card` e `Button` de vidro
   ganha uma névoa leitosa**. É a causa principal do "feio".
   → Gradiente só na aresta de cima (como o `GlassModal` já faz certo em `styles.topSheen`),
   com alfa vindo da paleta.
2. **Os blobs do fundo são discos de borda dura.** `AppBackground.tsx` cria círculos de 340px
   com `borderRadius: 170` e **nenhum desfoque** — o React Native não tem equivalente ao
   `filter: blur()` que a versão do desktop usa. A 26% sobre fundo quase preto, viram dois
   discos chapados.
   → Empilhar ~6 círculos concêntricos com opacidade decrescente (gaussiana barata), ou
   `LinearGradient` com paradas transparentes. Sem dependência nova.
3. **O vidro escuro fica invisível assim que o véu sair** — `glassSurface` no escuro é
   `rgba(255,255,255,0.06)`. Hoje é o defeito 1 que dá corpo aos cards.

Vai por `npm run update` (é só JS). Julgamento visual do Zak — blur não sai em screenshot.

### Bloco 16 — Temas alinhados: 3 cores × claro/escuro ✅

Os dois lados divergiram no bloco 12: o desktop tem seis temas em duas famílias, o mobile
tem as quatro cores antigas. A tela de Ajustes do app diz *"Espelha os temas do ELYSIUM
desktop"* — **virou mentira**.

Modelo novo, igual dos dois lados — sem inventar cor nenhuma, só reagrupando as seis:

| tema | claro (vidro) | escuro (noite) |
|---|---|---|
| **Elísio** | Vidro — Âmbar `#c2602c` | Campos Elísios — ouro `#d9b168` |
| **Maré** | Vidro — Maré `#1e7fd4` | Éter — prata-ciano `#a8c4d8` |
| **Crepúsculo** | Vidro Líquido `#6d4aff` | Crepúsculo — âmbar/rosa `#f0a850` |

No mobile só `palettes.ts` muda de verdade: os componentes consomem `palette.*` e não sabem
de nome de tema.

> ⚠️ `elysium_theme` no `AsyncStorage` guarda `default`, `ocean`… Sem mapa de aposentados o
> app abre com tema indefinido — a mesma falha silenciosa que o bloco 12 tratou no desktop.

### Bloco 17 — Ponte RPC única para o desktop ✅

`ipcMain.handle("rpc:call", …)` chamando `handleRpc()` direto; `preload-dashboard.ts` expõe
`nx.rpc(method, params)`. **Destrutivos** ganham `dialog.showMessageBox` no main — a trava
não pode morar no renderer, quem decide se confirmou tem que ser quem executa.

### Bloco 18 — Abas e tela Início no desktop ✅

**Não é reescrita.** O `dashboard.html` tem 3000 linhas com chat, gráficos, Spotify,
pareamento e telemetria funcionando. O caminho é envolver os blocos existentes em
`<section data-view>`, trocar as gavetas por uma barra de abas espelhando o app, e
mostrar/esconder por view.

Abas: **Início** (nova — estado do PC, atalhos, próximos lembretes, energia) · **Chat** (o
`#center` intacto) · **PC** · **Caixa** · **Presets** · **Ajustes**.

### Como ficou (blocos 15 a 18)

**O modo escuro** teve os três defeitos corrigidos e o principal era mesmo o véu: o brilho
saiu de `absoluteFill` e virou aresta de cima com **altura fixa** — reflexo não cresce junto
com o card, e uma fração da altura viraria véu de novo num card alto. As manchas do fundo
viraram soma de sete círculos concêntricos, com queda medida de 6% na borda a 35% no centro.

**Os temas** viraram três cores × claro/escuro nos dois lados. As amostras do seletor do app
mostram as cores do **modo atual**: as duas caras de um tema são bem diferentes, e mostrar a
clara no escuro faria a amostra mentir sobre o que acontece ao tocar nela.

**A ponte RPC** (`src/main/rpcBridge.ts`) chama `handleRpc()` direto do main. Duas coisas que
valem para quem for mexer:

- O diálogo de confirmação é preso a uma janela **visível**. O app mantém o recorder
  invisível aberto o tempo todo e ele costuma ser o primeiro de `getAllWindows()` — um modal
  preso nele travaria o app à espera de clique em algo que ninguém vê.
- Cancelar devolve `{cancelado:true}`, não exceção: mudar de ideia é caminho normal.

**As abas** (bloco 18) não moveram markup nenhum. Com `data-view` no `#layout`, as gavetas
deixam de ser `position:absolute` com translateX e viram painel de largura cheia. As 3000
linhas de chat, gráficos, Spotify, pareamento e telemetria continuam exatamente onde estavam.

- Ficaram no **topo**, não no rodapé como no celular: barra inferior existe em telefone por
  alcance do polegar, razão que não vale para mouse.
- **Chat e Caixa são a mesma tela** em modos diferentes, reusando o `switchChatMode()` que já
  existia. Presets e Ajustes dividem a mesma gaveta.
- ⚠️ Armadilha que apareceu: `#layout` é flex, e um painel sem `flex` encolhe até o conteúdo
  — a Início nasceu numa coluna estreita com meia janela vazia à direita. A regra
  `#layout[data-view] > * { flex: 1 1 auto }` resolve para todas as views.

**Ferramenta nova:** `scripts/eval-no-dashboard.mjs` executa expressões dentro do renderer
pela porta de depuração (`electron . --remote-debugging-port=9222`). Sem ela não dá para
provar que uma ponte foi ligada — nome de canal errado no preload dá exatamente o mesmo
sintoma que serviço funcionando, com a tela quebrada em silêncio.

### Bloco 19 — As telas que faltam no desktop ⬜

Maior ganho por menor risco: **o backend já faz tudo**, e há RPC para tudo. Lembretes
(`reminders.*`), memória (`memory.*`), energia (`power.control`), área de transferência
(`clipboard.*`) e programas (`apps.*`). Nenhum serviço novo, nenhum método RPC novo.

### Bloco 20 — Paleta de comandos (Ctrl+K) e busca ⬜

C21 + C14. Atalho **local** no dashboard — o global é o `Ctrl+Shift+J` e não se mexe. Índice
montado do que já existe: `apps.json` (~75), presets, lembretes, conversas, memória, ações.
Executa pela ponte do bloco 17, sem passar pelo modelo — mesmo argumento que criou o RPC na
§9. Mais busca no histórico de chat e na Caixa, nos dois lados.

### Bloco 21 — Respostas em streaming ⬜

`llm.ts` ganha modo `stream`: o Ollama nativo devolve **NDJSON**, a Groq devolve **SSE** —
dois parsers, uma interface (`onToken`). Canal `chat:reply-chunk` para o dashboard, e o
WebSocket que já existe para o celular. **A voz só fala quando a resposta fecha**; a fila do
`tts.ts` não é tocada.

> ⚠️ `processCommand` devolve `Promise<string>` e é o que o `POST /api/command` usa. O
> streaming **não pode quebrar esse contrato**: o caminho HTTP continua devolvendo a resposta
> inteira, e o streaming vai pelo WebSocket.

### Bloco 22 — Automação: foco, pomodoro, presets agendados ⬜

Tudo reaproveita o `scheduler.ts`, que já persiste e re-arma no boot. Modo foco (C9) reusa a
leitura de processos com cache do `gpuGuard.ts`. Pomodoro (C10). Presets por horário e no
boot (C11) — o gatilho por Wi-Fi fica de fora, exige detecção de rede que não existe.

### Ordem, e por quê

```
15 escuro do mobile   → bug, rápido, visível no mesmo dia
16 temas alinhados    → mexe nas mesmas paletas do 15
17 ponte RPC          → fundação dos dois seguintes
18 abas + Início      → estrutura, antes de encher de tela
19 telas que faltam   → preenche as abas
20 Ctrl+K e busca     → precisa das telas e da ponte
21 streaming          → mexe no cérebro; depois do visual estável
22 automação          → o maior, e o único que inventa serviço novo
```

### O que ainda precisa de decisão

| bloco | pergunta |
|---|---|
| 18 | Seis abas cabem numa janela de 1024×720? Talvez Ajustes siga como janela separada |
| 20 | O Ctrl+K pode rodar ação destrutiva, ou só as seguras? |
| 22 | "Bloquear app" no modo foco: fechar o processo ou só avisar? Fechar mata trabalho não salvo |

---

## 20. Plano fase 3 — tirar a cara de IA, Início por cards, movimento (blocos 23 a 31)

> **Status: concluída.** Desktop no commit `d7b362e`, celular no `c4b1c52`, OTA publicado
> no fingerprint `066f2ab6…`. Os blocos 19 a 22 da §19 (telas que faltam, Ctrl+K, streaming,
> automação) continuam válidos e são a fila seguinte.

### Por que esta fase existiu

O bloco 18 entregou a estrutura certa (abas + Início) e um acabamento errado. O veredito do
Zak ao ver a tela foi *"não gostei do design no geral"*, com treze correções. Quase todas
tinham causa concreta no código — não eram gosto solto:

1. **O desenho entregava que foi feito por IA.** Pedido explícito de pesquisar os sinais e
   removê-los, *"tipo o neon na logo"*.
2. **A aba Ajustes quebrou ao virar aba.** A gaveta foi desenhada para 262 px
   (`dashboard.html:487`); o bloco 18 trocou por `width:100%` **sem `max-width`**. Passaram a
   conviver três estratégias de largura: `100%` esticava pela janela toda, px fixo continuava
   minúsculo, `auto` encolhia. É a causa mecânica do "comprimento esquisito dos botões".
3. **Sobrava estrutura e faltava conteúdo.** A Caixa era uma aba repetindo o que o switch do
   chat já fazia; presets, player e insights estavam enterrados em Ajustes.

### Decisões fechadas

| decisão | escolha |
|---|---|
| Clima | **Open-Meteo**, sem chave; cidade escolhida pelo usuário |
| Caixa no celular | Some da TabBar; vira o lado direito do switch dentro do Chat |
| Presets | Bolinha no canto superior direito do chat, popover estilo iOS. Sem aba |
| Escopo no celular | **Só o necessário.** O que já estava bom não se tocou |
| Movimento | Muita animação, sob uma escala única |

### Bloco 23 — os sinais de design gerado por IA

A pesquisa (fontes no fim desta seção) nomeia 16 vícios. O dashboard tinha **6**:

| vício | onde estava | o que virou |
|---|---|---|
| Gradiente roxo→ciano + glow neon — *o sinal nº 1 de 2026* | `.logo-badge`, gradiente e `box-shadow: 0 0 8px` | Cor chapada + borda de 1 px. É o "neon na logo" que o Zak apontou |
| Emoji como ícone de navegação | abas, sub-abas, chat, atalhos | **Sprite de 40 símbolos SVG**, traço em `currentColor`, com os **mesmos nomes do Feather** que o celular já usa |
| Rótulos ALL-CAPS com `letter-spacing: 0.14em` | 8 lugares | Caixa de frase, 11 px, sem tracking |
| Glow colorido em hover | `.media-btn:hover` | Realce neutro |
| Orbes de gradiente flutuando | `#lg-blob-bg`, `#ely-shafts` | **Mantidos** — é a identidade Liquid Glass. Só opacidade menor |
| N cards idênticos em grade | `.home-grid` | Resolvido pelo bloco 25: `span` diferente por card |

> **A fonte NÃO mudou, e isso é deliberado.** O vício apontado é *Inter*. O desktop usa
> `"Segoe UI", system-ui` e o celular a fonte do sistema — zero `fontFamily` em
> `elysium-m/src`. Fonte nativa em app nativo é acerto, não vício. Seguir a receita aqui
> teria sido aplicar a regra sem ler o caso.
>
> O `drop-shadow` colorido das `.vbar` **fica**: a própria recomendação abre exceção para
> "estado interativo específico", e aquilo é o indicador de voz.

### Bloco 24 — movimento

> ⚠️ **A tensão que este bloco resolve.** A mesma pesquisa lista **"um bounce em todo
> hover"** como sinal de IA. Muita animação e pouca cara de IA só convivem com uma **escala
> compartilhada**, aplicada em tudo, em vez de um efeito inventado por elemento.

| papel | duração | curva |
|---|---|---|
| micro (hover, foco, toggle) | 120 ms | `cubic-bezier(0.2, 0, 0.2, 1)` |
| padrão (troca de aba, card entrando) | 220 ms | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| entrada com peso (popover) | mola | rigidez 380 |
| saída | 140 ms | sempre mais rápida que a entrada |

Regras: nada passa de 300 ms; nada faz bounce exceto o popover; **só `transform` e
`opacity`** — animar `width`/`height`/`top` força layout a cada quadro.

- **Desktop:** o Chromium 126 do Electron 31 dá de graça — **View Transitions API**
  (`document.startViewTransition`) na troca de aba, e **`@starting-style`** para entradas em
  CSS puro. Mais FLIP no arrasto, polegar deslizante nas abas e no switch, números que
  interpolam, barras por `scaleX`.
- **Celular:** `src/lib/motion.ts` com a mesma escala. `Animated` + `LayoutAnimation` +
  `PanResponder`, **tudo do core**.
- `prefers-reduced-motion` e `AccessibilityInfo.isReduceMotionEnabled()` zeram tudo.

> 🔴 **Nenhuma dependência nova, e não é detalhe.** `react-native-reanimated` e
> `react-native-gesture-handler` são **nativas**: mudariam o fingerprint do `expo-updates` e
> obrigariam a gerar um APK novo. Todo este trabalho precisava viajar por OTA.

### Blocos 25 a 27 — Início por cards, sugestões, clima

A Início virou **catálogo**: cada card se declara num registro, sabe o que precisa buscar, e
liga/desliga/arrasta. **Só o que os cards visíveis pedem é buscado** — desligar "Programas"
para de chamar `apps.list` de verdade.

Saiu a memória de longo prazo. Entraram player, sugestões, insights do sistema, clima,
processos, programas e área de transferência.

- **Arrasto:** desktop com `draggable` nativo do HTML5 + FLIP; celular com `PanResponder`.
  O `dashboard.html` continua sem carregar **uma única** biblioteca externa.
- **Persistência:** desktop em `config.homeCards`; celular na chave **nova**
  `elysium_home_cards`. Criar chave é seguro; **renomear continua proibido por OTA**.
- **`sugestoes.ts`** — 4 bolhas sorteadas por peso entre candidatas derivadas de estado que
  o app já tem. Re-sorteia a cada volta para a janela. Cada bolha executa por RPC direto,
  nunca pelo modelo — mesmo argumento da §9.
- **`clima.ts`** — Open-Meteo, sem chave, sem SDK, `fetch` puro. Cache de 1 h, timeout de
  6 s explícito (o `fetch` do Node espera para sempre por padrão), e **falha em silêncio**:
  sem rede o card some, nunca segura a Início.

### Bloco 28 — switch IA ↔ Celular

"Eu mesmo" virou "Celular". Dois botões colados no canto viraram um switch centralizado com
polegar deslizante. **A aba Caixa morreu**: repetia o que o switch já fazia.

No celular, `MailboxScreen` deixou de ser destino da TabBar e virou modo do Chat — a TabBar
caiu de 6 para **4**. O conteúdo e o composer da Caixa não mudaram, só onde ela mora.

> ⚠️ `shareIntent.ts` apontava para a tela `mailbox`. Agora abre o Chat já no lado do PC.
> Sem isso, compartilhar do Android cairia num destino que não existe mais.

### Bloco 29 — presets em popover, e o achado do bloco

Bolinha no canto superior direito do chat; popover que escala a partir do canto de origem,
com careta apontando para o botão. É o **único** lugar do app que usa mola.

> 🔴 **NÃO EXISTIAM métodos `presets.*` no RPC.** O `presetsStore.ts` estava lá desde o
> começo com `getAllPresets`, `getPreset`, `savePreset` e `deletePresetByKey` — e nada disso
> exposto. Dos 52 métodos, **zero** eram de preset. Era por isso que o `PresetsScreen.tsx`
> do celular montava a frase `"executa o preset ${name}"` e mandava para o LLM em
> `/api/command`: era o único caminho que existia.

Entraram `presets.list` / `presets.run` / `presets.save` / `presets.delete`. O popover agora
lista, roda num toque, apaga, e **cria a partir dos programas abertos agora** — cruzando
`apps.list` (catálogo do que o ELYSIUM sabe abrir) com `system.processes` (o que está
rodando). Só o cruzamento dá uma lista que faz sentido oferecer; senão o preset nasceria com
uma ação que falha.

### Bloco 30 — aba PC

- **Os canvas borravam.** Tinham `width` fixo no atributo HTML (`220`) e `width:100%` no
  CSS: o navegador esticava um no outro. Agora `ajustarCanvas()` acompanha a caixa real com
  `devicePixelRatio`, e remede ao entrar na aba — elemento em `display:none` mede zero.
- Quatro blocos empilhados viraram uma fileira `auto-fit`. Top-5 de processos virou top-10.
- **Bateria e temperatura somem quando não há sensor.**
  > O `hidden` sozinho não bastou: o `display:flex` da regra do card é do autor e **ganha**
  > do `display:none` que o navegador aplica ao atributo. Precisou de
  > `.chart-wrap[hidden] { display: none; }`.
- **Celular:** o `MonitorDrawer` mostrava duas barras num card alto e vazio (o broadcast só
  traz CPU, RAM e bateria, que é `null` em desktop). Entraram discos e processos por RPC ao
  abrir a gaveta.

### Bloco 31 — Ajustes completos numa tela

Sub-abas de **6 para 2**: Geral e Celular.

O formulário é **gerado a partir de um esquema** (`AJUSTES` no `dashboard.html`), não
copiado das ~400 linhas do `config.html` — duplicar criaria duas telas para manter em par, e
a primeira mudança de nome as faria divergir em silêncio. `config.html` continua existindo
como janela avulsa da bandeja.

Grava campo a campo no `change`, **sem botão Salvar**: com botão, sair da tela perderia o
que foi mexido, e esta tela agora é uma aba, de onde se sai o tempo todo.

Conserto das larguras:

```css
#layout[data-view="ajustes"] #rtab-panels { max-width: 760px; margin: 0 auto; }
.cfg-row { display: grid; grid-template-columns: 200px minmax(0, 1fr); }
.cfg-controle input, .cfg-controle select { max-width: 340px; }
```

Player e presets saíram; Conversas virou popover no topo do chat, como o celular já fazia.

### O que ficou de fora, e por quê

**No celular, deliberadamente intocados:** `AppBackground` (as `Mancha` foram refeitas no
bloco 15), `GlassSurface`, `GlassModal`, `Card`, `Button`, `Drawer`, `MetricBar`,
`palettes.ts`, `ThemeContext`, `SettingsScreen`, `ConversationsScreen`, `PairingScreen`,
`CameraAsk`, `TrackpadFullscreen`, e todo o `ControlScreen` fora do `MonitorDrawer`.

**Apagados:** `PresetsScreen.tsx` (substituída pelo popover) e `TelemetryScreen.tsx`, que não
era importada em lugar nenhum desde que o `MonitorDrawer` a substituiu.

### Armadilhas que este bloco descobriu

- **`ELECTRON_RUN_AS_NODE=1` no ambiente.** Quem roda dentro do VS Code / Claude Code herda
  essa variável, e o `electron.exe` executa o main como **Node puro** — `app.getPath` e
  `ipcMain` vêm `undefined` e o app morre no boot. Para lançar de um script, remova a
  variável do ambiente do processo filho.
- **`Page.captureScreenshot` fica pendurado PARA SEMPRE** com a janela oculta: o compositor
  não produz quadro, e o comando não responde nem dá erro. Foi o que travou o `shot.mjs` no
  bloco 18 — a causa nunca foi o script. O dashboard se esconde ao perder o foco; abrir uma
  segunda instância chama `dashWin.show()`. O script agora **falha claro** em vez de travar.
- **Ordem de declaração numa regra CSS.** `display: none` escrito **antes** de `display:
  flex` na mesma regra não faz nada — na mesma especificidade, a última declaração vence.
- **Remover markup mata JS silenciosamente.** Ao tirar o painel de mídia, sobraram ~20
  `getElementById` apontando para elementos que não existiam mais. A **primeira** linha a
  falhar derruba o script inteiro, e a tela abre em branco. Vale varrer:
  ```bash
  node -e 'const t=require("fs").readFileSync("src/renderer/dashboard.html","utf8");
    const m=t.slice(t.indexOf("<body>"),t.indexOf("<script>"));
    const ids=new Set([...m.matchAll(/id="([^"]+)"/g)].map(x=>x[1]));
    console.log([...new Set([...t.matchAll(/getElementById\("([^"]+)"\)/g)].map(x=>x[1]))]
      .filter(u=>!ids.has(u)).join(", "));'
  ```

### Como validar

Obrigatório antes de cada commit: `npm run build` (desktop) e `npm run typecheck` (celular).
No celular vale também `npx expo export --platform android`: **o typecheck não pega import
quebrado em tempo de execução, o bundle pega.**

- **23:** capturar nos 3 temas × claro/escuro; conferir que um tema antigo gravado ainda abre.
- **24:** trocar de aba 20× e ver se engasga. Ligar "reduzir movimento" nos dois sistemas e
  conferir que **tudo** para.
- **25:** arrastar, fechar, reabrir — a ordem tem que voltar. Desligar todos os cards.
- **26 e 27:** minimizar e restaurar 5×, ver bolhas diferentes. **Puxar o cabo de rede** e
  confirmar que a Início abre igual, só sem clima.
- **28:** **compartilhar um link do Android** — é a regressão fácil aqui.
- **29:** rodar um preset pelo popover e por voz, comparar.
- **30:** redimensionar a janela e olhar se o canvas está nítido.
- Matar `electron.exe` antes de testar build nova (§14).

### Fontes da pesquisa

- [AI Design Slop: 16 Patterns That Out Your App as Vibe-Coded — Developers Digest](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it)
- [AI Slop Fonts and Gradients — 925 Studios](https://www.925studios.co/blog/ai-slop-design-tells)
- [Why Your AI Keeps Building the Same Purple Gradient Website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)
- [How To Spot AI-Generated Design — UX Planet](https://uxplanet.org/how-to-spot-ai-generated-design-697aaabe76c8)

---

## 21. Fase 4 — o movimento que não acontecia, e o resto (blocos 32 a 40)

> **Status: concluída.** Desktop em `139f5a4` · `28985c0` · `9216a99`; celular em `c0ac014`.
> OTA publicado no fingerprint `066f2ab6…`. Instalador em
> `release/ELYSIUM-Setup-1.0.0.exe`.

### Por que esta fase existiu

A §20 declarou uma camada de movimento inteira e o Zak não via **nenhuma** animação:
popover pulando para o estado final, troca de aba sem transição, switch do chat
teleportando. Eram **quatro causas somadas**, e a principal não era código.

#### 🔴 A causa raiz: o Windows estava com animação desligada

`SPI_GETCLIENTAREAANIMATION` retorna **False** neste PC — *Configurações → Acessibilidade →
Efeitos visuais → Efeitos de animação* está **desligado**. O Chromium reporta
`prefers-reduced-motion: reduce` e o interruptor global da §20 zerava tudo, corretamente.

> ⚠️ **Não leia isso pelo registro.** A primeira tentativa consultou
> `HKCU\Control Panel\Desktop\UserPreferencesMask` e concluiu o oposto — o bit lido estava
> errado. Para checar de verdade:
> ```powershell
> Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;
>   public class SPI { [DllImport("user32.dll")] public static extern bool
>   SystemParametersInfo(uint a, uint b, ref bool c, uint d); }'
> $v=$false; [SPI]::SystemParametersInfo(0x1042,0,[ref]$v,0); $v   # False = desligado
> ```
> Ou, mais simples: `matchMedia("(prefers-reduced-motion: reduce)").matches` no renderer.

Entrou `config.movimento`: **`auto`** (segue o Windows, padrão) · **`sempre`** · **`nunca`**.
Quem desliga animação do sistema por causa de jogo ou desempenho pode manter o app animado.
Está em Ajustes → Aparência. **O do Zak está em `sempre`.**

#### Os três bugs de código

**1. Popover com um `requestAnimationFrame` só.** O callback do rAF roda *antes* da etapa de
recálculo de estilo do mesmo quadro: `hidden = false` e `classList.add("aberto")` fundiam num
recalc só, sem *before-change style*, e nenhuma transição disparava. O comentário no código
afirmava justamente o contrário. **Trocado por `@starting-style` +
`transition-behavior: allow-discrete`** — animar a partir de `display:none` vira CSS puro, sem
rAF e sem `setTimeout` adivinhando o fim da saída.

**2. O polegar do switch IA↔Celular nascia com largura zero.** Ele não declarava `width`; quem
escrevia era o JS medindo o botão ativo, e o bootstrap rodava **depois** do `switchView` que
restaura a aba Início — com `#center` em `display:none`, `offsetWidth` é 0. **O switch nascia
invisível em toda sessão** e só ganhava corpo se você clicasse em "Celular". Em vez de remendar
a ordem de inicialização, **a medição foi eliminada**: lados de largura igual e `width: 50%` em
CSS, com `translateX` comandado por um `data-modo`. Não tem como quebrar de novo.

**3. A View Transitions API escondia a própria animação.** Ela tira um snapshot da página e o
sobrepõe ao DOM vivo — a barrinha deslizava **por baixo** dele, invisível, e sobrava um
cross-fade de dois painéis escuros quase iguais. **Removida.** A API serve para morph entre
estados, não para navegação, onde o que importa é ver o indicador percorrer o caminho.

> ⚠️ **Os painéis agora se SOBREPÕEM** (`position: absolute; inset: 0`), não dividem espaço de
> flex. Durante a troca os dois ficam visíveis por ~220 ms por causa do `allow-discrete`; como
> itens de flex, nesse intervalo partiriam a janela ao meio.

### O que mudou, bloco a bloco

| bloco | o quê |
|---|---|
| **32** | Os três consertos acima + a preferência de movimento. Saiu também o overshoot com `scale(1.05)` no hover que a §20 prometeu remover — iOS responde ao toque, não ao cursor |
| **33** | **Orbe de conexão** na Início e cards **fixáveis** |
| **34** | **Bolhas de pergunta** acima da barra de escrita |
| **35** | A aba PC virou **"Programas"** |
| **36** | **Ajustes à direita** da barra, sem sub-navbar |
| **37** | Clima que funciona |
| **38** | Player do Spotify completo |
| **39** | Minimizar minimiza; instalador |
| **40** | Paridade curta no celular |

### Bloco 33 — orbe e cards fixáveis

O orbe fica ao lado da saudação. **O sinal não é "tem token gravado"** — isso continua
verdade com o celular desligado do outro lado da cidade. É `wsClients.size`, exposto agora
como `conectados` em `pairing.endpoints`: o app mantém o WebSocket aberto enquanto está em
uso, e ele cai quando sai de alcance.

Clicar abre o QR, endereço, token e o acesso de fora de casa — o conteúdo da antiga sub-aba
"Celular", **movido**, com os três desalinhamentos consertados (`margin: 0 auto`, um eixo de
alinhamento só, botão acompanhando).

> 🔴 **O token nasce coberto.** Ele é a **única** barreira do servidor da porta 4200 e não há
> TLS. Saindo de uma sub-aba enterrada para um clique da tela inicial, deixá-lo à mostra
> exporia o controle do PC em qualquer compartilhamento de tela. Clique revela.

`homeCards` ganhou `fixos`: desenhados antes de todos e imunes ao arrasto. Clima nasce fixo.
"Personalizar" virou uma linha por card com ligar, fixar e mover **por botão** — arrasto exige
mira, botão não — mais "voltar ao padrão".

### Bloco 34 — bolhas de pergunta

Até 4 chips centralizados entre o switch e a barra de escrita, só no lado IA. Rotacionam a
cada abertura e a cada entrada na aba.

> 🔴 **A frequência não existia.** `history.ts` devolve `null` para tudo que não seja abrir
> app/URL/música/preset — **conversa nunca foi registrada em lugar nenhum**. Entrou
> `src/services/perguntas.ts`, store próprio. Alargar o `history.ts` seria pior: ele alimenta
> o menu da bandeja, e a bandeja passaria a oferecer "que horas são?" como atalho de sistema.
>
> Como o registro começa agora, **as bolhas só mostram curadas até você repetir uma pergunta**
> (mínimo 2 vezes para entrar).

Clicar faz `addBubble` + `recordMessage` + `chatSend`, **os três**. As pílulas de histórico
faziam só dois — a mensagem aparecia na tela mas não entrava na conversa salva.

### Bloco 35 — a aba PC virou "Programas"

Saíram gráficos de CPU/RAM, estabilidade de 24 h, cards de disco e a tabela de processos com
o modal. Entrou o acionável: abertos agora com botão de fechar (cruzando `apps.list` com
`system.processes`), catálogo com busca, área de transferência, energia e teclas de mídia.
Quem quiser os números liga os cards `computador`, `processos` e `discos` na Início.

Junto saíram ~400 linhas de JS órfão. **Remover markup mata o JS em silêncio**: a primeira
linha que falha derruba o script inteiro e a tela abre em branco. A varredura da §20 vale:

```bash
node -e 'const t=require("fs").readFileSync("src/renderer/dashboard.html","utf8");
  const m=t.slice(t.indexOf("<body>"),t.indexOf("<script>"));
  const ids=new Set([...m.matchAll(/id="([^"]+)"/g)].map(x=>x[1]));
  console.log([...new Set([...t.matchAll(/getElementById\("([^"]+)"\)/g)].map(x=>x[1]))]
    .filter(u=>!ids.has(u)).join(", "));'
```

### Bloco 36 — Ajustes à direita, sem sub-navbar

Com o pareamento no orbe sobrou **uma página só**, então `#rtabs` inteiro morreu — e com ele
a faixa `rgba(255,255,255,0.5)` do tema claro e o `border-bottom` truncado que davam o aspecto
esbranquiçado e torto. O pedido "arruma a cor feia" se resolveu removendo o elemento.

### Bloco 37 — clima

> 🔴 `limparCacheClima()` existia desde o começo e **ninguém chamava**. Antes de a cidade
> existir, `climaAgora()` cacheia `dado: null`; definir a cidade não invalidava nada, e o card
> pedia para você definir uma cidade que você acabara de definir, **por até uma hora**.

Agora `config:set-all` invalida quando qualquer chave `clima*` muda. Falha vale 1 min, não
1 h, e o motivo (`sem-cidade` / `sem-rede`) volta junto para o card dizer a coisa certa.

**Junto: a notificação do Windows a cada gravação de config foi calada.** Ela disparava em
*toda* chamada de `config:set-all` — inclusive ao arrastar um card da Início ou trocar de tema.

### Bloco 38 — player

O card usava **3 das 8** operações que a ponte IPC já suportava e descartava **6 dos 11**
campos de `NowPlaying`. Agora tem capa maior, álbum, dispositivo, progresso arrastável,
volume, aleatório e repetir com estado aceso, e avanço local de 1 s entre consultas.

> Contrato divergente que fica registrado: `spotify.command` do **RPC** aceita 4 operações;
> `spotify:command` do **IPC** aceita 8. O celular alcança seek/volume/shuffle/repeat pelos
> métodos separados (`spotify.seek` etc.), então não é bloqueio — mas são duas superfícies com
> o mesmo nome e contratos diferentes.

### Bloco 39 — barra de tarefas

`btnMin` chamava `window.close()`, que o handler de `close` transforma em `hide()`:
**minimizar fazia a janela sumir para a bandeja** em vez de ir para a barra de tarefas. Agora
minimiza. Fechar continua indo para a bandeja de propósito — o atalho global, o servidor do
celular e os lembretes vivem no processo principal. Mais: `show: false` + `ready-to-show` (sem
lampejo branco) e clique esquerdo na bandeja abrindo o dashboard.

### Armadilhas novas

- **`captureScreenshot` e transições precisam de janela VISÍVEL.** Com a janela oculta,
  `getAnimations()` devolve animações com `playState: "running"` e `currentTime: 0` **para
  sempre** — o relógio não anda porque não há quadros. Medir animação numa janela escondida dá
  falso negativo; foi o que quase me fez "consertar" um CSS que já estava certo.
- **Ordem importa em remoção por regex de CSS.** `/#rtabs \{[\s\S]*?\}/` casa primeiro com
  `.theme-ely #rtabs {`. Remova as variantes de tema **antes** da regra base, ou ancore em
  início de linha (`/\n#rtabs \{/`).
- **Crase dentro de template literal em script de patch.** Um comentário HTML contendo
  `` `spotify:command` `` fechou a string e quebrou o `<script>` inteiro. Escreva sem crase.
- **`apps.list` devolve `{ key, command }`, não strings.** Passar isso para `escHtml` dá
  `s.replace is not a function` e derruba a tela inteira.

### O QUE AINDA FALTA

**Da §19, nunca feito (continua válido e é a fila natural):**

| bloco | o quê |
|---|---|
| **20** | **Ctrl+K** — paleta de comandos e busca no histórico de chat e na Caixa |
| **21** | **Streaming** de resposta (NDJSON no Ollama, SSE na Groq; a voz espera fechar) |
| **22** | **Automação** — modo foco, pomodoro, presets agendados e por gatilho |

**Verificação humana pendente desta fase:**

- **Instalar o `release/ELYSIUM-Setup-1.0.0.exe`** e fixar na barra de tarefas. Só depois de
  instalado o atalho carrega o `AppUserModelId` certo — fixar o `electron.exe` de
  desenvolvimento fixa o Electron, não o ELYSIUM.
- **Instalar o APK do celular.** Ele fica em `elysium-m/dist-apk/elysium-m.apk`, gerado
  por `npm run build:local`.

  > 🔴 **O APK NÃO ESTÁ NO PAINEL DO EXPO, e o que está lá não serve.** O último build de
  > nuvem é de 11/08/2026 com fingerprint `7597e3f4…`; os OTAs saem em `066f2ab6…`, então
  > nenhum jamais chegaria nele. E o projeto no painel ainda se chama `neuroaxis-portal` —
  > o slug foi revertido de propósito quando o rename quebrou o OTA (§18) —, o que faz o
  > lugar errado parecer o certo. **Baixar de lá é perda de tempo garantida.**
  >
  > Renomear o slug resolveria a confusão, mas muda o fingerprint e invalida todo OTA
  > publicado: só vale a pena junto com um APK novo, nunca isolado.

  Depois de instalar: abrir → esperar uns 10 s com internet → **fechar de verdade**, tirando
  das recentes → abrir de novo. O `expo-updates` baixa numa abertura e aplica na seguinte;
  só voltar do segundo plano não basta.
- Fechar um programa pela aba Programas — o diálogo de confirmação precisa de clique humano, e
  **recusar tem que cancelar de verdade**.
- Arrastar a barra de progresso e o volume do Spotify com música tocando.
- Minimizar (barra de tarefas) e fechar (bandeja), e clicar no ícone da bandeja.

**Dívidas conhecidas, sem urgência:**

- `release/Jarvis-PC-Setup-1.0.0.exe` é do tempo do nome antigo. Instalador velho, some quando
  quiser (`release/` é ignorado pelo git).
- `UiLayout` no `AppConfig` virou legado inerte: os widgets que ela ordenava não existem mais.
  Config gravado com a chave continua carregando sem erro; remover exige migração.
- ~~O ponto fraco medido do llama3.2 3B em **pedido composto** (12 de 18)~~ — **resolvido na
  §22**: o `llama3.1:8b` acertou os pedidos compostos na medição de 21/08/2026. A ressalva
  geral continua valendo: ação faltando é um JSON válido, então o `fallbackToGroq` nunca vai
  cobrir esse caso, qualquer que seja o modelo.

---

## 22. Fase 5 — a IA morta, e os seis pedidos do celular (blocos 41 a 50)

> **Status: concluída em 21/08/2026.**
>
> | repo | commits |
> |---|---|
> | `elysium` | `2bbcef1` (IA) · `c3607cb` (redimensionar) · `6ade51a` (revisão) |
> | `elysium-m` | `44d916b` (4 pedidos) · `35f68ea` (temas) · `e4d4dca` (revisão) |
>
> **OTA publicado** no canal `preview`. **Falta instalar** o APK no celular e o instalador
> novo no PC — sem isso nada disto chega ao uso real. Ver blocos 48 e 49.

### 🔴 Bloco 41 — a IA parou de responder, nos dois lados

**Sintoma:** qualquer comando, no desktop ou no celular, respondia *"Não entendi o que você
pediu. Pode repetir?"* e nada acontecia.

**Causa: os dois provedores caídos ao mesmo tempo, por motivos independentes.**

| provedor | modelo padrão | resultado real, reproduzido |
|---|---|---|
| Groq | `llama-3.3-70b-versatile` | **HTTP 404** `model_not_found` |
| Ollama | `llama3.2` | **HTTP 404** `model 'llama3.2' not found` |

A família Llama **inteira** saiu do catálogo da Groq. Conferido em `GET /v1/models`:
sobraram `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.6-27b`, `groq/compound`,
`groq/compound-mini` e os dois Whisper. E o `llama3.2` não está mais baixado nesta máquina —
o Ollama tem `llama3.1:8b` e `gpt-oss:120b-cloud`.

O local falhava, o fallback da nuvem falhava, e `decideBrain` caía em `[{action:"unknown"}]`,
que é exatamente aquela frase.

> 🔴 **Por que a defesa existente não protegeu.** O `DECOMMISSIONED_MODELS` cobre o modelo
> escolhido pelo usuário e o troca **pelo padrão** — mas desta vez o id morto *era* o padrão.
> A rede de segurança apontava para o mesmo buraco. Pior: o `config.json` da raiz reinjeta
> `brainModel` por cima do `DEFAULTS` no `loadDefaults()`, então corrigir só o TypeScript
> deixaria o modelo morto de pé.

**Substitutos, escolhidos por medição com o prompt real de 11.800 chars (~3.371 tokens):**

| alvo | 5 casos difíceis | latência |
|---|---|---|
| **Ollama `llama3.1:8b`** | **5/5**, incluindo pedido composto e `chat` × `write_text` | 207 ms – 2 s quente, **18,3 s a frio** |
| **Groq `openai/gpt-oss-120b`** | correto | 659 ms, mas **429 na 2ª chamada seguida** |
| Groq `gpt-oss-20b` / `qwen3.6-27b` | devolvem o nome da ação **malformado** (`"open_app(bloco de notas)"`) | — |

O local segue sendo o padrão e a Groq continua só como rede de segurança — o 429 imediato
confirma de novo o achado do bloco 13: o plano gratuito não sustenta este prompt.

**O `llama3.1:8b` acerta o pedido composto que o `llama3.2` errava (12-14 de 18).** A troca é
ganho, não remendo — e resolve a última dívida listada na §21.

**`ollamaKeepAlive` subiu de `60s` para `10m`.** O `llama3.2` tinha ~2 GB e recarregava em
2-4 s; o `llama3.1:8b` tem ~4,9 GB e mediu **18,3 s**. Com 60 s, uma pausa de um minuto na
conversa custava 18 segundos no comando seguinte, sem explicação nenhuma na tela. A GPU
disputada continua protegida pelo `evitarGpuOcupada`, que desvia para a nuvem sem tocar na VRAM.

**Para não haver uma quarta vez:** `marcarModeloMorto(provider, modelo)` no `config.ts`, e o
`llm.ts` chama quando o provedor responde 404. O próprio erro vira a fonte da verdade, em vez
de depender de alguém auditar o catálogo da Groq de tempos em tempos.

> **Verificado em execução, não deduzido.** Pelo servidor real, depois de reiniciar o app:
> *"quem foi Alan Turing"* → resposta correta em 1278 ms (`chat`, sem criar arquivo);
> *"que horas são"* → 368 ms; *"abre a calculadora"* → abriu, 2208 ms.

### Bloco 42 — as conversas abriam no meio

Nos dois lados do switch. O `scrollToEnd` estava num efeito disparado por `messages.length`:

1. Na abertura o comprimento vai de 0 para N quando o cache chega, mas a `FlatList` ainda não
   mediu as linhas. Como as bolhas têm alturas muito diferentes, o erro acumulado para no meio.
2. Se o servidor devolve a mesma quantidade que já estava em cache, o comprimento **não muda**,
   o efeito não roda de novo, e a âncora errada fica de pé.

Agora a âncora escuta `onContentSizeChange` — cresceu de verdade, inclusive quando uma imagem
termina de carregar — e só acompanha se o dedo estava a menos de 80 px do fim. O mesmo defeito
existia no `ChatScreen`: abrir uma conversa antiga caía no meio dela.

### Bloco 43 — histórico separado por lado

O botão de relógio abria as Conversas da **IA** mesmo estando nos recados do PC. Os stores
sempre foram separados (`elysium_chat_sessions` × `elysium_mailbox_cache`); era o botão que
não sabia disso. Entrou `MailboxHistorico` — recados por dia, com busca e filtro de favoritos,
lendo do **cache local** de propósito: quem abre o histórico quer achar algo que já viu, e isso
tem que funcionar com o PC desligado.

### Bloco 44 — agendar o desligamento pelo celular

**Nenhum serviço novo.** `power.control` já aceitava `delaySeconds` (0 a 86400) e só o caminho
da voz passava o campo. O card de Energia ganhou atalhos de 15 min / 30 min / 1 h / 2 h, escolha
de hora livre (hora já passada vira amanhã), o aviso do que está marcado e o botão de cancelar.

Quem segura o prazo é o `shutdown.exe /t`, então o agendamento sobrevive ao app fechado e ao
celular sair de alcance.

> ⚠️ `elysium_desligamento_agendado` é memória do **celular**, não do PC: o Windows não expõe
> "há desligamento agendado?" de forma barata. Por isso o registro expira sozinho quando o
> horário passa — senão um agendamento cancelado no próprio PC ficaria fantasma na tela.

### 🔴 Bloco 45 — personalizar a Início era impossível

Uma linha: **`scrollEnabled={!editando}`**. O `PanResponder` cobria o card inteiro, então a
edição precisava matar a rolagem para os dois gestos não brigarem pelo mesmo dedo — e sem
rolagem **não dava para chegar nos cards de baixo**. Abrir a personalização travava você nos
primeiros dois ou três.

- O arrasto passou para a **alça ☰**; a rolagem só para enquanto um arrasto está de fato em
  curso (`arrastando`, não `editando`).
- A ordem também muda **por botão** — arrasto exige mira, botão não. É o mesmo desenho que o
  desktop adotou no bloco 33, pelo mesmo motivo.
- Os chips viraram **uma linha por card** com alvos separados: antes ligar e fixar eram dois
  toques no mesmo chip, um deles num ícone aninhado **dentro** do outro.

### Bloco 46 — cards redimensionáveis, nos dois lados

Arrastar a quina, como uma janela do Windows. Duplo clique (desktop) devolve o automático.

| | largura | altura |
|---|---|---|
| **desktop** | em **colunas** (1 a N), medidas da grade viva a cada gesto | livre, mínimo 90 px |
| **celular** | duas posições: inteiro ou metade | livre, mínimo 72 px |

**A largura não é livre em nenhum dos dois, e isso é decisão, não limitação.** No desktop a
Início é uma grade `auto-fill`: card de largura livre não alinha com o vizinho e a grade abre
buracos irregulares a cada ajuste. No celular, larguras arbitrárias nunca casam com o card ao
lado. Duas (ou N) posições encaixam sempre.

> ⚠️ **A altura travada vira a variável `--alt`, não um `height` inline.** Quem precisa da
> medida é o **corpo** do card, não a moldura: travar só a moldura deixa o conteúdo
> transbordando por cima do card seguinte. Com a variável, a moldura ganha altura e o corpo
> ganha `overflow: auto`. No celular o equivalente é `overflow: 'hidden'` no envelope.

O desktop usa **Pointer Events com `setPointerCapture`**, não `mousemove` no documento: com a
captura o gesto continua chegando ao puxador quando o ponteiro sai do card — que é o caso
normal ao aumentar — e não sobra ouvinte global para vazar se o `pointerup` se perder.

`homeCards.tamanhos` é opcional na leitura, como `fixos` já era.

> **Verificado no renderer vivo** (`scripts/eval-no-dashboard.mjs`): arrastar 400 px na
> horizontal e 120 na vertical levou o card `computador` de span 1 / 168 px para span 2 /
> 288 px, gravado em disco; o duplo clique devolveu span 1 / automático e limpou o registro.

### Bloco 47 — as duas famílias de tema no celular

O app tinha as seis combinações certas, mas as apresentava como "três cores + interruptor de
claro/escuro". O nome escondia a escolha real: `lg` e `ely` não são o mesmo desenho com o
brilho trocado.

| cor | família `lg` | família `ely` |
|---|---|---|
| crepusculo | **Vidro Líquido** | **Crepúsculo** |
| mare | **Vidro — Maré** | **Éter** |
| elisio | **Vidro — Âmbar** | **Campos Elísios** |

Nenhuma cor inventada — conferido hex a hex contra o `THEMES` do `dashboard.html`: as seis
batem em `primary`, `accent` e `background`. A família ELYSIUM ganhou os **feixes de luz**,
o elemento que o desktop tinha e o mobile não (contrapartida do `#ely-shafts`). Ficam parados,
ao contrário do desktop: animar dois gradientes em tela cheia custa quadro no telefone, e o
valor do elemento está na profundidade, não no movimento.

> 🔴 **A chave `elysium_color_scheme` NÃO foi renomeada, de propósito.** O que ela guarda não
> mudou de significado — `light` sempre foi o vidro e `dark` sempre foi a noite. Renomear só
> criaria a chance de um aparelho atualizado por OTA acordar sem preferência.
> `resolverFamiliaEscolhida()` traduz os valores antigos e devolve `null` para lixo, que cai
> no padrão.

### 🔴 Bloco 48 — a build instalada não é a build que você testa

Descoberto em 21/08/2026, ao tentar validar o conserto da IA e não achar a porta de
depuração: **quem estava servindo a porta 4200 era `ELYSIUM\elysium baixado\ELYSIUM.exe`** —
a build do instalador NSIS — e não a instância de desenvolvimento.

Isso corrige duas coisas escritas em outros pontos deste documento:

- A §18 (bloco 8) afirma *"não existe instalação NSIS nesta máquina"*. **Existe.** O Zak
  instalou em algum momento, e a pasta `ELYSIUM\elysium baixado\` é a saída desse
  instalador. **Não é fonte e não se edita** — o fonte continua sendo `elysium\` e
  `elysium-m\`.
- A §15 lista *"instalador não testado"*. Ele foi instalado e roda.

**Por que isto é uma armadilha, e não uma curiosidade:**

A build instalada sobe sozinha com o Windows e **pega o single-instance lock**. A partir
daí, qualquer `electron .` lançado da pasta de desenvolvimento **encerra em silêncio** — o
lock manda a segunda instância só mostrar o dashboard da primeira e sair. O sintoma é
exatamente o de um app que "fecha sozinho", e foi o que aconteceu duas vezes nesta sessão.

Pior: a porta 4200 continua respondendo o tempo todo, então `curl` no `/api/health` e no
`/api/command` **passa** — só que quem responde é o código antigo. Uma correção de fonte
pode ser dada como validada sem nunca ter rodado.

**Como saber qual das duas está no ar:**

```powershell
Get-CimInstance Win32_Process -Filter "Name='ELYSIUM.exe' OR Name='electron.exe'" |
  Where-Object { $_.CommandLine -notmatch '--type=' } |
  Select-Object ProcessId, Name, CommandLine
```

`ELYSIUM.exe` em `elysium baixado\` = instalada. `electron.exe` em
`elysium\node_modules\` = desenvolvimento.

**Regra prática:** para testar código novo, encerre a instalada primeiro. Para entregar
código novo ao uso real, `npm run dist` e instalar — commitar no fonte **não** muda o que
o Zak usa.

> ⚠️ **Saída rápida quando só o modelo mudou.** O `getConfig()` põe os `overrides` do
> usuário por cima dos padrões compilados, então dá para consertar uma build instalada
> antiga sem reinstalar: Ajustes → Cérebro → "Modelo local" aceita texto livre. Foi o que
> tornou o conserto de 21/08 aplicável na hora, sem esperar instalador.

### Bloco 49 — o `eas init` pendente não era pendência, e o slug nunca mudou

A §18 (bloco 9) e a §21 mandavam rodar `npx eas-cli init` antes do próximo `npm run update`,
sob o argumento de que o `slug` teria mudado para `elysium-m` enquanto o `projectId` ficou no
projeto antigo, e que o `eas update` seria recusado por divergência.

**Conferido em 21/08/2026: a premissa é falsa.** O `app.json` real diz:

```json
"slug": "neuroaxis-portal",
"updates": { "url": "https://u.expo.dev/a9c62871-2d6d-4e05-b458-1e58655449b5" },
"extra": { "eas": { "projectId": "a9c62871-2d6d-4e05-b458-1e58655449b5" } }
```

O `slug` **nunca foi trocado** — só o `expo.name` virou ELYSIUM-M. Slug, `projectId` e
`updates.url` sempre apontaram para o mesmo projeto, e `npx eas-cli project:info` resolve
limpo em `@zakdwr/neuroaxis-portal`. Não havia divergência para consertar.

> 🔴 **Rodar `eas init` aqui seria o erro, não a correção.** Ele re-vincula o projeto. Um
> `projectId` novo invalida o `updates.url` que está compilado **dentro do APK instalado**,
> e o aparelho pararia de buscar atualização — sem erro visível, só nunca mais receber OTA.

**O que de fato atrapalhava:** existe um `C:\Users\ZAK\app.json` de 124 bytes, criado por um
`eas init` rodado da pasta pessoal em 14/08/2026. Ele contém só um `projectId` órfão
(`73a89816-81a7-4339-be67-c9b7fcd111b4`), de um projeto EAS que não corresponde a nada. Todo
comando `eas` disparado de `C:\Users\ZAK` lê esse arquivo e responde
*"Project already linked (ID: 73a89816…)"* seguido de *"Cannot determine which native SDK
version your project uses because the module `expo` is not installed"* — que é o sintoma de
estar na pasta errada, não de configuração quebrada.

**Regra:** comando `eas` só roda de dentro de `elysium-m\`.

### OTA publicado

`npm run update` publica no canal **preview**. Em 21/08/2026, do commit `e4d4dca`:

| | |
|---|---|
| runtime version (android) | `066f2ab6953cc9074a2ff593e64960e5b7367aaf` |
| fingerprint de `dist-apk/elysium-m.apk` | **o mesmo** |

⚠️ **O `--non-interactive` agora exige `--environment`.** O `eas-cli` mudou: sem a flag ele
recusa com *"The `--environment` flag must be set when running in `--non-interactive` mode"*.
O script `npm run update` do `package.json` não passa nenhuma das duas, então funciona no uso
interativo normal; automatizar exige
`npx eas-cli update --channel preview --message "..." --environment preview --non-interactive`.

**Como saber o runtime de um APK já construído** — o manifesto guarda `file:fingerprint`, uma
indireção, não o valor:

```bash
unzip -o -j caminho.apk "assets/fingerprint" -d /tmp && cat /tmp/fingerprint
```

Se esse valor não bater com o runtime do OTA, a atualização **não chega** ao aparelho, e o
sintoma é o app simplesmente continuar velho.

### Bloco 50 — o que a revisão do diff pegou

Os blocos 41 a 47 foram revisados por subagentes de revisão, um por repositório, depois de
já estarem pushados. Quatro achados sobreviveram à verificação; três eram reais e um estava
subdimensionado. **Nenhum foi aceito sem conferir no código.**

**1. 🔴 A cura de modelo morto era inerte no caso que causou a pane.**

`healModel(value, DEFAULTS[key])` troca o modelo morto pelo padrão da mesma chave. Isso
cobre *"o usuário escolheu um modelo que morreu"* e **não cobre nada** quando o id morto
**é** o padrão — que foi exatamente 21/08. `healModel(x, x)` devolve `x`. O
`marcarModeloMorto` acrescentado no bloco 41 herdou o mesmo defeito: marcava o padrão como
morto e continuava devolvendo o padrão morto.

Agora cada papel tem uma **fila de candidatos** (`CANDIDATOS_GROQ`, `CANDIDATOS_OLLAMA`) e a
cura pega o primeiro vivo. Fila inteira morta agora diz isso no log em vez de fingir que
curou.

**2. Redesenho da Início no meio de um redimensionamento matava o gesto.**

A Início se redesenha sozinha por temporizador — tique do Spotify (400 ms), re-sorteio das
bolhas (120 ms) e volta do foco da janela. Disparando durante um arrasto de quina, o
`innerHTML` da grade era trocado, o puxador saía do DOM levando junto a captura do ponteiro,
e o `pointerup` nunca chegava. O card voltava sozinho ao tamanho antigo **e o
`body.redimensionando` ficava para sempre**: dashboard inteiro com cursor de resize e texto
inselecionável, sem nada na tela explicando.

`desenharInicio()` agora ignora o pedido enquanto `redimensionandoAgora` está de pé, e o
encerramento também escuta `pointerup` e `blur` na janela como rede de segurança.

**3. Parsing de `gridTemplateColumns` aceitava lixo.**

Num grid renderizado o Chromium devolve o valor usado (`"284.5px 284.5px …"`), que é o que o
código quer. Em elemento **não renderizado** devolve o declarado,
`"repeat(auto-fill, minmax(280px, 1fr))"` — e aí contar as partes daria 3 colunas inventadas
e o `parseFloat` da primeira daria `NaN`. Agora só entram as partes que são de fato um
comprimento, e sem lista utilizável o teto vem da largura real da grade.

> ⚠️ Este não foi medido em execução: a build instalada segurava o lock e impedia subir uma
> instância com porta de depuração (bloco 48). O código foi robustecido de forma que o
> resultado da medição não importa — mas fica registrado que é raciocínio, não medição.

**4. Redimensionar card no celular gravava no disco a cada quadro.**

A revisão apontou o efeito colateral dentro do atualizador do `setTamanhos` — atualizador do
React tem que ser puro. O problema maior era outro: o gesto chama `redimensionar()` a cada
movimento do dedo, então cada arrasto virava **dezenas de escritas no `AsyncStorage` por
segundo**. Agora o gesto só mexe na tela e quem persiste é `fimDoRedimensionamento`, ao
soltar — o mesmo desenho do desktop, onde a gravação sempre morou no `aoSoltar`. Entrou junto
um `tamanhosRef`, porque ler `tamanhos` do fechamento durante um gesto por quadro daria o
valor de antes de o arrasto começar.

**O que a revisão descartou, com análise específica** — vale registrar para não ser
re-investigado: a âncora de scroll dos dois chats (`jaAncorou` reseta certo por `sessionId`,
sem corrida com o carregamento assíncrono da sessão), o `PanResponder` da alça contra a
`ScrollView`, as closures do `gravar` (as dependências cobrem), o tique do desligamento
(dependência e limpeza corretas), o `segundosAte()` e o teto de 86400, o layout de 48% com a
quina absoluta, e os consumidores restantes da API antiga de tema (não sobrou nenhum).

### O que esta fase deixou pendente

- ~~Publicar o OTA~~ — **feito em 21/08/2026**, canal `preview`, runtime `066f2ab6…`.
  ⚠️ O `eas init` que a §18 pedia era desnecessário e perigoso — ver o bloco 49.
- **Instalar `dist-apk/elysium-m.apk` no celular.** O OTA só alcança um aparelho cujo
  fingerprint bata, e o APK de 20/08 é o que bate. Mesma chave de assinatura da build
  anterior, então instala por cima sem perder pareamento.
- **Instalar o `release/ELYSIUM-Setup-1.0.0.exe` gerado em 21/08/2026 às 16h06.** Enquanto
  isso não acontecer, o conserto da IA **não chega ao uso real** — ver o bloco 48. A saída
  imediata é Ajustes → Cérebro → "Modelo local" = `llama3.1:8b` na build instalada.
- **Julgamento visual do Zak** nos itens que screenshot não resolve: os feixes de luz da
  família ELYSIUM, o canto de redimensionar e o tamanho dos cards nos dois lados.
- **Reinstalar/atualizar o desktop** — o `release/ELYSIUM-Setup-1.0.0.exe` é anterior a esta fase.


---

## 23. Fase 6 — o movimento saiu da thread de JS (bloco 51)

### Bloco 51 — Reanimated e gesture-handler, com a proibição do bloco 24 revogada

O bloco 24 barrou as duas por serem nativas — mudam o fingerprint e obrigam a APK novo, e tudo precisava viajar por OTA. Com o APK novo já obrigatório o motivo caiu: entraram `reanimated` 4.5.1, `worklets` 0.10.1 e `gesture-handler` 2.32.0 (o plugin de Babel vem no `babel-preset-expo`).

**A escala do bloco 24 não mudou** (120/220/140 ms, mola 380 só no popover); mudou onde ela roda. O `motion.ts` ganhou a camada de worklet (`tempo`, `mola`, `LAYOUT`, `ENTRA`, `SAI`, `reduzirUI`) e mantém a de `Animated` do core para o que ainda não foi migrado.

🔴 **As 7 chamadas de `animarProximoLayout()` nunca rodaram** — `LayoutAnimation` é no-op na Nova Arquitetura (§14). Viraram `layout={LAYOUT}` na própria view.

**TabBar:** indicador contínuo com arrasto — o dedo leva o polegar, as abas acendem por proximidade, o destino sai do mais próximo com projeção de velocidade (0,12 s) e as pontas resistem a 35%. Migrados junto os dois `PanResponder` da Início, o Drawer, o Popover e a transição de tela. No redimensionamento a altura virou shared value: o React só sabe ao soltar, que é onde a gravação já morava (§22, bloco 50, item 4).

⚠️ **Medição não foi feita: `adb devices` vazio nesta máquina.** Por análise, o travão ao ROLAR a Início não é a thread de JS — são 8 `BlurView` empilhadas (6 cards + header + TabBar) recapturando o mesmo `blurTarget` por quadro. Migrar animação não conserta isso; o primeiro corte a medir é vidro chapado nos cards.

**Fingerprint novo: `93fe52f5…`** (era `066f2ab6…`). O OTA do canal `preview` não alcança mais o aparelho — instalar `dist-apk/elysium-m.apk` por cabo.

🔴 **Valor padrão em parâmetro de worklet não existe na thread de UI.** `tempo(para, ms = MOV.base, easing = SUAVE_UI)` matava o app com `ReferenceError: Property 'SUAVE_UI' doesn't exist` ao soltar o dedo na barra e ao arrastar card. O plugin do Babel monta o closure a partir do que o **corpo** referencia; a assinatura fica de fora. Mesmo identificador no corpo funciona — a regra é a posição. Corrigido resolvendo os padrões no corpo, com literais e o `Easing` do próprio Reanimated. `PROJECAO`, `MAX_INDICE`, resistência e mola também saíram de dentro dos worklets; duas conferências de tipo amarram os literais à escala. Verificação: os closures gerados pelo Babel foram lidos um a um — nenhum worklet referencia mais constante de módulo.

Publicado por OTA (canal `preview`, runtime `93fe52f5…`, grupo `d0a31164…`) — o APK instalado já tinha o `expo-channel-name` no manifesto, então não precisou rebuildar.

**O que este bloco deixa como regra, em quatro linhas:**

1. 🔴 **`build:local` não injeta `expo-channel-name`** — quem injeta é o EAS, a partir do `channel` do `eas.json`, e a build local não passa por lá. Sem o header o servidor de update responde "sem atualização" **em silêncio**, e foi por isso que o APK gerado aqui nunca atualizava. Corrigido com `updates.requestHeaders` no `app.json`, que entra no `AndroidManifest` do prebuild (`UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY`). Confirmar ali sempre que um APK local não pegar OTA.
2. **`LayoutAnimation` é no-op na Nova Arquitetura** — as 7 animações da Início e do PresetsPopover nunca rodaram, apesar de o código estar lá. Substituto: `layout` / `entering` / `exiting` na própria view.
3. **Worklet não enxerga escopo de módulo**, e valor padrão de parâmetro nem sequer é varrido pelo plugin. Constante usada em worklet vive DENTRO dele ou entra como argumento — `tempo()` lia `SUAVE_UI` do módulo e derrubava o app ao soltar o gesto.
4. **A Início monta 8 `BlurView` sobre 14 manchas + 3 gradientes** — suspeita dominante do engasgo ao rolar, **ainda não medida** (nenhum aparelho no `adb` desta máquina).

### Bloco 52 — vidro translúcido de verdade, e Ajustes fora da barra

**Alfa do branco caiu em TODOS os temas** (`glassSurface` 0,18→0,10 e 0,10→0,06; `glassSurfaceStrong` 0,34→0,20 e 0,16→0,11; `glassBorder` 0,55→0,38 e 0,20→0,14; `glassSheen` 0,55→0,30 e 0,11→0,07). 🔴 **Transparência e borrão são alavancas OPOSTAS:** "leitoso" é alfa de branco alto, não raio de blur, e alfa alto com blur alto só deixa o borrão mais claro. Por isso o raio caiu junto — `ScreenHeader` 60→26, `TabBar` 65→28, `Card` 45→22, popover 70→20.

**Blur REAL só no `ScreenHeader`, na `TabBar`, na gaveta, no popover e nos botões redondos do composer.** `GlassFill` ganhou `blur` (padrão `true`) e `tintColor`; `Card` ganhou `blur`, **padrão `false`** — as 6 `BlurView` da Início viraram tinta chapada, que é o corte que o achado do P4 pedia.

**A gaveta é a exceção declarada:** token novo `glassSheet` (0,46 no vidro, 0,16 na noite) e raio 85. Card e popover querem revelar o fundo; a gaveta quer esconder a tela de trás sem apagá-la.

🔴 **`GlassModal` e `Popover` deixaram de ser `Modal` do RN.** Dentro de `Modal` o Android abre janela nativa própria e nenhuma `BlurView` amostra o app de trás (§14) — a gaveta estava com desfoque ZERO, que é a origem da queixa "quase transparente demais". Agora são camadas absolutas dentro da árvore (`zIndex` 30 e 20), com `BackHandler` no lugar do `onRequestClose`. Auditado: existe **uma** `BlurView` no app inteiro (em `GlassFill`) e ela sempre recebe `blurTarget`.

**Ajustes saiu da navegação inferior** (bloco 36 do desktop): a barra ficou com Início, Chat e PC, o acionador virou engrenagem de vidro no canto superior direito de todo `ScreenHeader` (contexto `AjustesProvider`, `semAjustes` nas telas empilhadas), e `Screen` perdeu `'settings'` junto com toda a maquinaria de "aba que não é aba".

**Chat:** os dois cantos do topo são círculos de vidro irmãos (`GlassCircle`) — histórico à esquerda, presets à direita — e os botões do composer viram vidro de verdade **nos dois lados do switch**, sobre barra de tinta chapada.

**Fundo:** 4 manchas (2 novas no meio da tela, onde ficam os cards), 2 traços diagonais finos e 15 partículas — **todos estáticos**, com posições em constante de módulo. Mais elementos, menos movimento: o bloco 47 já mediu que gradiente animado em tela cheia custa quadro. Os feixes da família ELYSIUM continuam parados.

**Temas conferidos hex a hex contra o `THEMES` do `dashboard.html`:** as 6 combinações batem; só a ORDEM das cores estava invertida (agora Vidro Líquido, Maré, Âmbar, como no desktop). `elysium_color_scheme` não foi renomeada. Auditoria do escuro (§19 bloco 15): nada inverte cor — as duas famílias trocam de paleta, e a única cor fixa que restava (`middle` do gradiente) é neutra de propósito.

Validado com `npm run typecheck` e `npx expo export --platform android`. Tudo JS: vai por `npm run update` (canal `preview`).
