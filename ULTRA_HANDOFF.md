# ULTRA HANDOFF — ELYSIUM

> **Documento único do ecossistema.** Substitui e absorve o antigo `HANDOFF.md`, o
> `CONTRATO_RPC.md` e o `CONTEXTO_NEUROAXIS.md`. Se alguma coisa aqui divergir de outro
> arquivo do repositório, **este aqui vale**.
>
> Última atualização: **29/09/2026**.

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
| 9 | [Superfície RPC — os 60 métodos](#9-superfície-rpc--os-52-métodos) |
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
| 23 | [Fase 6 — o movimento saiu da thread de JS](#23-fase-6--o-movimento-saiu-da-thread-de-js-bloco-51) |
| 24 | [Fase 7 — depois do Antigravity: triagem e polimento](#24-fase-7--depois-do-antigravity-triagem-e-o-polimento-dos-dois-lados-blocos-55) |
| 25 | [Fase 8 — Início cheia, Ajustes em gavetas, temas do celular e rotinas](#25-fase-8--a-início-cheia-ajustes-em-gavetas-temas-do-celular-e-rotinas-blocos-64) |
| 26 | [O plano do que falta — fases 9, 10 e 11](#26-o-plano-do-que-falta--fases-9-10-e-11-blocos-76) |
| 27 | [Fase 9 — o cérebro com ferramentas, e a base que aguenta](#27-fase-9--o-cérebro-com-ferramentas-e-a-base-que-aguenta-blocos-76) |
| 28 | [Fase 10 — a experiência diária](#28-fase-10--a-experiência-diária-blocos-84) |
| 29 | [Fase 11 — fora de casa e para sempre](#29-fase-11--fora-de-casa-e-para-sempre-blocos-94) |
| 30 | [Fase 12 — atualização automática e o que veio depois](#30-fase-12--atualização-automática-e-o-que-veio-depois-blocos-95-100) |
| 31 | [Fase 13 — blindar, mais inteligente, mais alcance](#31-fase-13--blindar-mais-inteligente-mais-alcance-blocos-113125) |

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

Windows 11 Pro · projeto pessoal de uso real. (Dados pessoais do Zak ficam só na memória do app — §31.)

Gosta de ver o diagnóstico antes do conserto. Prefere respostas curtas. Quer o desktop com
o mesmo capricho visual do app mobile — a referência estética é o Portal, não o contrário.

### Regras vigentes

1. **Commit e push a cada bloco concluído, sem perguntar.** Vale para os dois repositórios.
   **Antes do commit, `npm run check` verde** (tsc + vitest; no celular também `expo export`) — desde o bloco 77.
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

| Repo | HEAD (29/09/2026) | Estado |
|---|---|---|
| `elysium` | fase 13 (§31) — desktop **1.6.1**, instalado aqui | limpo, pusheado, CI verde, releases assinadas desde `v1.6.0` |
| `elysium-m` | fase 12 (§30) — celular **1.5.2** (`versionCode` 16) | limpo, pusheado, releases `v1.4.0`…`v1.5.2` |

> **Desde 29/09/2026 as versões saem como releases do GitHub e se atualizam sozinhas**
> (§30, bloco 95). O desktop **instalado nesta máquina já é o 1.5.2**, em
> `%LOCALAPPDATA%\Programs\ELYSIUM` — atualizado pelo próprio atualizador, 1.5.0 → 1.5.1 →
> 1.5.2. O celular precisa de **um** salto manual para o APK 1.5.2 (o vc13 não tem o
> atualizador); dali em diante o cartão "versão nova" da Início cuida. ⚠️ A pasta
> `elysium baixado` é uma cópia **1.0.2 antiga** que o Windows subia no boot até a 1.5.1
> (§30); não é mais usada por nada.
>
> Histórico: a 1.4.0 (vc13) foi gerada em 29/09/2026 com os widgets de Clima e Rotinas e o
> Firebase, que mudam o manifesto. O push agora tem FCM (projeto `elysium-ac53f`, §29 bloco 94); o
> `google-services.json` fica só em `elysium-m/` (fora do git). Cérebro local padrão:
> `qwen2.5:7b` com `num_ctx` 8192. Na Groq: visão `qwen/qwen3.8-27b`, busca
> `openai/gpt-oss-120b` + `browser_search`.

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
> `ollama` (`llama3.1:8b` desde 21/08, **`qwen2.5:7b` desde 20/09 — bloco 82, §27**), e os dois modelos abaixo passaram a ser **só o fallback** — ver
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

Os **5 métodos destrutivos** (`system.killProcess`, `apps.close`, `power.control`,
`mailbox.sessions.delete`, `mailbox.messages.delete`) exigem:

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
| `volume.get` | — | `{nivel: 0-100, mudo}` — Core Audio, bloco 86 |
| `system.diagnostico` | — | `{texto}` — versão, modelos, Ollama, catálogo da Groq, rotinas, log; sem segredos (bloco 97) |
| `window.list` | — | `{janelas:[{hwnd, pid, processo, titulo, minimizada, maximizada, emFoco}]}` — EnumWindows, bloco 87 |
| `window.control` | `{hwnd, operacao: focar\|minimizar\|maximizar\|restaurar\|fechar\|so_esta}` | `{ok, message}` — fechar é WM_CLOSE |
| `update.status` | `{verificar?: true}` | `{pc, verificadoEm, erro, desktop, celular}` — cada pacote `{versao, notas, publicadaEm, tamanho, pronto, progresso}` ou `null` (§30, bloco 95) |
| `update.install` | — | `{ok, mensagem}` — **destrutivo**: instala no PC a versão já baixada; o app fecha e volta sozinho |
| `storage.info` | `{forcar?: true}` | `{discos, downloads, temp, lixeira, grandes:[{nome, bytes, em}], medidoEm}` — cache de 5 min (§30) |
| `storage.clean` | `{alvo: lixeira\|temp}` | `{liberado, message}` — **destrutivo**; temp só apaga o que tem mais de 2 dias |
| `storage.open` | `{alvo: downloads\|temp\|limpeza\|configuracoes\|arquivo, nome?}` | `{ok, message}` — `arquivo` só dentro de Downloads |
| `system.saude` | — | `{itens:[{id, titulo, nivel: ok\|aviso\|erro, detalhe, conserto?}]}` — card "Saúde" (§30, bloco 107) |
| `system.saude.consertar` | `{item: ollama\|inicio}` | `{message}` |
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

**Rotinas e entregas** (bloco 68, `src/services/rotinas.ts`)

| método | params | retorno |
|---|---|---|
| `rotinas.list` | — | `{rotinas:[{id, nome, texto, hora "HH:MM", dias[0-6], entregar["pc"\|"celular"], falar, ativa, gatilho?, condicao?, quando, criadaEm, ultimaExecucao?, ultimoResultado?, proxima: epoch\|null}], eventos:[{id, rotulo}]}` — `gatilho`, `condicao`, `quando` e `eventos` do bloco 79 |
| `rotinas.save` | `{id?, nome, texto, hora, dias?, entregar?, falar?, ativa?, gatilho?, condicao?}` | `{rotina}` — sem `id` cria; `gatilho` = `{tipo:"evento", evento, app?, minutos?, limite?, cada?}` |
| `rotinas.delete` | `{id}` | `{deleted}` |
| `rotinas.toggle` | `{id, ativa?}` | `{rotina}` — sem `ativa` inverte |
| `rotinas.run` | `{id}` | `{resultado}` — executa agora pelo pipeline de comando |
| `notify.pending` | — | `{entregas:[{id, tipo rotina\|lembrete\|aviso, titulo, corpo, em, ref?}]}` — o que o celular ainda não confirmou |
| `notify.history` | — | `{entregas}` — as 40 últimas, com `entregueEm?` |
| `notify.ack` | `{ids: string[]}` | `{acked}` |

O WebSocket também manda `{type:"notify", ...entrega}` a quem estiver conectado na hora
da execução (`broadcastNotify` em `server.ts`).

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
- **Exclusões usam lápides, nos DOIS sentidos.** Apagar no celular registra o id em
  `elysium_chat_deleted` (`elysium_mailbox_deleted` do lado da Caixa); a sincronização manda
  os `chat.delete` **antes** dos `chat.save` e só então limpa o registro. Sem isso a conversa
  apagada voltaria do PC na sincronização seguinte, como se o botão não funcionasse.

  🔴 **O sentido PC → celular faltava até 22/08/2026, e era o bug do "some da tela e volta".**
  O PC apagava de verdade — o disco confirmava —, mas o celular ainda tinha a cópia e o passo
  de `save` a reempurrava um passo ANTES de descobrir a exclusão no `list`; o `merge`
  recriava, e a lista devolvida trazia a conversa viva. Agora o PC também guarda lápide
  (chave `deleted` em `chat-sessions.json` e `mailbox.json`, com teto de 200 e validade de
  180 dias), o `merge` **recusa** qualquer id com lápide, o `chat.list` /
  `mailbox.sessions.list` devolvem `deleted: string[]` junto da lista, e a lápide do PC só sai
  no `chat.ackDeleted` / `mailbox.sessions.ackDeleted` — depois que o celular confirma ter
  apagado a cópia dele. As duas metades vão na MESMA resposta de propósito: em duas chamadas
  haveria uma janela em que o celular adotaria a lista sem saber das exclusões.

- **Lista vazia é um estado legítimo.** O `garantirSessoes` da Caixa recriava a conversa
  `mailbox-inicial` sempre que a lista ficava vazia, então apagar a última conversa fazia
  "Recados" renascer na leitura seguinte — não havia como apagar a última. O gatilho da
  migração passou a ser a **mensagem órfã**, nunca "a lista está vazia". Pelo mesmo motivo
  `getActiveMailboxSessionId` devolve `""` em vez de criar uma conversa: ler qual está ativa
  não pode escrever.
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

No celular do Zak (HyperOS), o Tailscale é morto pelo gerenciamento agressivo de bateria, mas o
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

Endereços, hostname e IPs do Tailscale: veja `ipconfig` e `tailscale status` na hora — dado
da máquina não fica escrito aqui (decisão da fase 13: dado pessoal só na memória do app).

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

0. ~~**🔴 O que está commitado não é o que está rodando.**~~ **Regerado em 17/09/2026** (fase
   7): `release/ELYSIUM-Setup-1.1.0.exe` e `dist-apk/elysium-m.apk` (versionCode 10). Falta
   só o Zak instalar os dois. O texto original fica como histórico: o desktop em uso é o instalador em
   `elysium baixado`, e o celular roda um APK anterior ao fingerprint atual. Enquanto os
   dois não forem atualizados, todo conserto da fase 5 existe só no git. **É a pendência de
   maior impacto agora** — ver blocos 48 e 49.
1. ~~**⚠️ Pareamento não validado depois da correção do cleartext.**~~ **Resolvido**: o APK
   com `usesCleartextTraffic` foi instalado e pareado em 14/08 (§18, bloco 9).
2. **🔑 A chave de assinatura não tem backup.** Perder `%USERPROFILE%\Android\` custa o caminho
   de atualização do app.
3. **Limite de tokens da Groq** — ~4400 tokens por chamada, 12000 TPM no gratuito. Já mitigado
   pelo `fastRoute`; ver §7 para as saídas restantes.
4. ~~**`probe()` não distingue 401 de PC inalcançável.**~~ **Resolvido no bloco 55** (§24):
   401 vira `UnauthorizedError` → estado `unauthorized` → alerta "Pareamento inválido". O
   texto original: custou cerca de uma hora de investigação
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
9. ~~**`msedge-tts` (voz neural) falha com "Connect Error"**~~ **Resolvido no bloco 62**
   (§24): era a versão 1.3.4 contra o endpoint novo do Edge; a 2.0.7 fala. Original: nesta máquina/rede — cai sempre no
   fallback SAPI.
10. ~~**`tts.ts` ignora `cfg.voice`**~~ **Resolvido no bloco 62**: lê a chave, seletor em
    Ajustes → Voz, padrão Antonio (o que sempre tocou).
11. **Quirk do `sleep`**: com hibernação habilitada, `SetSuspendState` hiberna em vez de
    suspender. Resolve com `powercfg /hibernate off` uma vez.
12. **Espelhamento tem teto de ~1,5 quadro/s** por limitação do `desktopCapturer`. Se um dia
    precisar de vídeo de verdade, o caminho é outro (WebRTC / captura por stream), não otimizar
    este.
13. ~~**Build obsoleta na fila do EAS**~~ — irrelevante desde que o build virou local (§13).
    O caminho normal não passa mais pelo EAS; só o `eas update` passa.
14. **Checklist de validação manual do `CLAUDE.md`** ainda não confirmado ponta a ponta.
15. ~~**⚠️ Config corrompido derruba a inicialização em vez de cair no padrão.**~~ **Resolvido
    no bloco 63**: `sanearBom()` regrava sem os três bytes antes de qualquer store abrir.
    Original: descoberto sem
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
| ~~C2~~ | ~~Respostas em streaming~~ | ✅ **Bloco 59** — NDJSON e SSE, dashboard e celular |
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
| C10 | ~~Pomodoro com voz e push~~ | **Feito no bloco 67**: card Timer da Início, o aviso é um lembrete real |
| C11 | Presets agendados e por gatilho (boot, horário, Wi-Fi) | Reusa o scheduler |
| C12 | Watchers ("avisa quando esse download acabar") | Reusa scheduler + push |

### Mobile

| # | feature | nota |
|---|---|---|
| C13 | Multi-PC (parear vários, alternar) | `Pairing[]` em vez de um só |
| ~~C14~~ | ~~Busca no histórico de chat e na Caixa~~ | ✅ **Bloco 60** — a lupa da Início busca conversas, programas, presets, lembretes, memória e ações. A Caixa ainda não |
| ~~C15~~ | ~~Apagar, fixar e marcar não-lida na Caixa~~ | ✅ Bloco 54 — apagar; fixar = favoritar |
| ~~C16~~ | ~~Onboarding com exemplos de comando~~ | ✅ **Bloco 61** — três telas depois do pareamento |
| ~~C17~~ | ~~Chips de sugestão no chat~~ | ✅ Bloco 34 (desktop) e `chat.starters` (celular) |
| ~~C18~~ | ~~Háptica e som de feedback~~ | ✅ **Bloco 56** — háptica (`expo-haptics`). Som, não |
| C19 | ~~Widget de tela inicial Android~~ | **Feito no bloco 73**: Busca, Ações e Estado |

### Desktop

| # | feature | nota |
|---|---|---|
| C20 | Desfazer última ação | Precisa de log de ações reversíveis |
| ~~C21~~ | ~~Paleta de comandos no dashboard (Ctrl+K)~~ | ✅ **Bloco 58** |
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

### Bloco 53 — correção de rota: painel HyperOS/One UI, não iOS

**A direção do bloco 52 estava meio certa e meio errada.** Baixar o alfa serve para *card* sobre fundo; para *painel com texto* ele deixa o conteúdo ilegível. O alvo passou a ser o painel do One UI: **alfa ALTO com raio ALTO**, mostrando cor e luz difusa em vez das formas do fundo. Isso NÃO é o "leitoso" de antes — leitoso era alfa alto de **branco puro** com raio baixo.

🔴 **A tinta do vidro agora vem da PALETA, não do branco.** `palettes.ts` ganhou `misturar()`/`comAlfa()` e monta as quatro tintas por face: base = branco + 10% da primária no Vidro, `surface` + 14% da primária na noite. Escada de alfa conforme a superfície precise ser LIDA: card 0,34/0,26 → barra 0,52/0,42 → gaveta 0,86/0,88 → painel 0,92/0,90 (`glassPanel`, token novo). Raios: popover e gaveta 100, cabeçalho/TabBar/botões 45, cards seguem sem desfoque (custo por quadro do achado do P4).

**Composer:** o botão de **anexar** passou a existir nos dois lados do switch, à esquerda junto da câmera. No lado da IA ele manda pelo caminho da `mailbox` — `sendCommand` leva texto e devolve texto, anexo não tem onde chegar por ali — e a bolha diz para onde o arquivo foi. Os quatro botões da IA caíram para 40 px.

🔴 **`GlassModal` e `Popover` estavam dentro de `Modal` do RN, com desfoque ZERO no Android.** Janela nativa separada não amostra o app de trás (§14), e a lib não reclama: o vidro simplesmente não desfoca. Era a causa real do "quase transparente demais" da gaveta. Ao tirar o `Modal` vem junto uma armadilha fácil de esquecer — **o botão físico de voltar era dele** (`onRequestClose`). Sem substituto, voltar com painel aberto SAI DO APP. Os dois têm `BackHandler` próprio agora; confira isto em qualquer sobreposição nova.

🔴 **`packageJson:scripts` É FONTE DE FINGERPRINT.** O `npm run update` tem um `--message` sem valor e falha; corrigir o script mudou o runtime de `93fe52f5…` para `3aa6da32…`, ou seja, **o OTA deixaria de alcançar o APK instalado por causa de uma linha de script**. A correção foi revertida e o OTA republicado no runtime certo. O comando que funciona, até o próximo APK: `npx eas-cli update --channel preview --environment preview --message "..."` (o `--environment` virou obrigatório em modo não interativo). Arrumar o script só junto de um rebuild.

### Bloco 54 — vidro real no desktop, faixa do switch e conversas separadas na Caixa

🔴 **Metade do "vidro" do desktop nunca desfocou nada.** `.pop` (pareamento, Conversas, Presets) e `#preset-btn` declaravam `backdrop-filter` sobre `var(--surface2)`/`var(--surface)` — **hex OPACO** nos três temas ELYSIUM. Mesmo defeito do `GlassModal` dentro do `Modal` do RN (bloco 52): a declaração existe, não reclama e não faz nada. Entrou a escada `--vidro-card/barra/gaveta/painel` (0,34 · 0,52 · 0,86 · 0,92) com `--glass-ink` **vindo da paleta** (campo `glassInk` por tema, aplicado no `applyTheme`), nunca de branco puro. Topbar, gavetas, modal e `#input-bar` das duas famílias passaram a usá-la. **Exceção obrigatória: `#pairing-qr` é chapado** (`background:#fff !important` + `isolation:isolate`) — QR translúcido com blob derivando por baixo para de ser lido pela câmera.

**Fundo com o que revelar:** dois blobs extras, terceiro feixe, camada `#bg-tracos` (3 linhas de 1px) e `#bg-poeira` (8 pontos, posição/duração/alfa em estilo inline). Tudo `.theme-rich`, opacidade baixíssima, coberto pelo `prefers-reduced-motion`.

**Barrinha da navbar virou pílula de vidro, sem tocar no movimento.** O `#vtab-thumb` continua 1px levado por `translateX + scaleX`. Desenhar a pílula nele não funciona: o raio é calculado ANTES do transform, num box de 1px vira 0,5px e o `scaleX` estica isso em dezenas de pixels — pílula vira lente pontuda. O desenho foi para um `::after` com a largura real da aba (`--w`) e contra-escala `1/--w`. Única linha nova no JS é o `setProperty("--w", …)`, fora da transição.

**Switch IA ↔ Celular saiu do `#center`** e virou faixa própria de 52px, absoluta no topo do `#layout`, entre a barra de abas e os painéis — ele não pode morar no contêiner absoluto (`inset:0`) que os painéis usam. `#layout[data-view="chat"] > #center { top: 52px }` reserva o espaço; sem isso o fim da conversa cai fora da janela. **A medição continua eliminada** (bloco 32): `width:50%` em CSS e `translateX` por `data-modo`. Os dois botões redondos (Conversas e Presets) agora ancoram nessa faixa.

🔴 **`mailbox:get-thread` devolvia um array e o renderer lia `{ items }`.** A Caixa do desktop **nunca carregou o histórico do disco** — só o que chegava por evento na sessão. Corrigido junto.

**A Caixa ganhou o modelo de sessões do lado da IA.** Cada recado tem `sessionId`; `mailbox.json` ganhou as chaves `sessions` e `activeSessionId` (**nome do store inalterado**). Migração carimba tudo que existia numa conversa "Recados" **nascida favoritada** — sem isso a primeira poda apagaria o histórico inteiro. Retenção, merge por `updatedAt` maior e `createdAt` preservado são os mesmos do `chatSessionsStore`. **Apagar limpa o anexo do disco** (poda, sessão e mensagem), senão `mailbox-attachments` só cresceria.

**RPC:** `mailbox.sessions.list/create/rename/favorite/open/save` e, marcados **destrutivos** (header `X-Elysium-Confirm`), `mailbox.sessions.delete` e `mailbox.messages.delete` — o `DELETE` que o §16 registrava como faltando (C15). `POST /api/mailbox/messages` aceita `sessionId` e o `GET` aceita `?sessionId=`; **sem o parâmetro devolvem tudo, como antes**, que é o que mantém um app antigo funcionando contra um PC novo.

**Celular:** `mailboxSync.ts` é cópia deliberada do `chatSync.ts` — lápides primeiro (`elysium_mailbox_deleted`), depois os `save`, depois adota a lista do PC. Chaves novas (`elysium_mailbox_sessions`, `_deleted`, `_active`); nenhuma antiga renomeada. As conversas ficam **dentro do `MailboxHistorico`** (bloco 43), não numa segunda tela. Criar conversa **espera a sincronização** antes de abrir: se o primeiro recado sair antes de o PC conhecer o id, o servidor não acha a sessão e joga a mensagem na conversa ativa dele. Segurar um recado abre favoritar/apagar.

🔴 **A âncora do bloco 42 ainda abria no meio, e conversa curta só mascarava.** O primeiro `onContentSizeChange` não é a lista inteira: a `FlatList` mede a janela inicial (~10 linhas), dispara o evento com a altura DELAS, e o `scrollToEnd` daquele instante vai para o fim de 10 linhas. Depois disso a decisão passava a depender do `onScroll`, que chega com o `contentSize` do quadro anterior — mais linhas montaram, `faltando` vem grande, `coladoNoFim` vira false e a âncora desiste parada no meio. **Correção: posição não decide nada enquanto o dedo não tocou.** Só `onScrollBeginDrag` solta a âncora, e voltar a menos de 8px do fim a prende de novo. Log de diagnóstico sob `__DEV__`.


---

## 24. Fase 7 — depois do Antigravity: triagem, e o polimento dos dois lados (blocos 55+)

> **Contexto.** Entre 11 e 16/09/2026 o Zak testou o **Google Antigravity** (Gemini) nos
> dois repositórios. Veredito dele em 17/09: *"não deu muito certo, foi melhor quando eu
> usava o Claude"*. Nada do que o Antigravity fez foi commitado — ficou como diff solto nos
> dois repos, com um apêndice de handoff em mojibake ("eact-native-reanimated", "pp.json").
> Esta fase começa pela triagem desse diff e segue com o que o Zak pediu em 17/09:
> *"quero os dois apps 100% funcionais e perfeitinhos, mais bonitos, funcionais, sempre
> levando em conta UI e UX"*.
>
> **Backup integral do que o Antigravity deixou:** `ELYSIUM/_antigravity-backup/`
> (`elysium.diff`, `elysium-m.diff`, `CockpitScreen.tsx`, `widgets/`, `splash.*`, `fix.js`
> e os 20 scripts de patch que estavam soltos na raiz `ELYSIUM/`). Fora do git de
> propósito: é lixo com valor de consulta, não fonte.

### Bloco 55 — triagem do diff do Antigravity ✅

**Regra usada:** manter só o que corrige um problema real E respeita as decisões deste
documento. Cada item abaixo foi lido no diff, não deduzido do resumo dele.

**Mantido (mobile):**

| o quê | por quê |
|---|---|
| `UnauthorizedError` em `pairing.ts` + estado `unauthorized` no `useConnection.ts` | Resolve a **pendência 4 da §15**: `probe()` tratava 401 como PC fora do ar. Agora 401 para o polling e o `App.tsx` abre um Alert "Pareamento inválido → Ler QR". A faixa de conexão mostra ícone de chave, não de Wi-Fi |
| `stream.ts` lendo o áudio com `new File(uri).bytes()` (API v2 do `expo-file-system`) | Tira o roundtrip base64 da API legada |
| `GlassCircle` com `pulsando` (mic pulsa enquanto grava), `SwitchModo` e `BolhaEntrando` em Reanimated, `ConversationsScreen` com `layout={LAYOUT}` | Continuação natural do bloco 51 |
| `PairingScreen` tratando 401 no QR | Mas o `catch` conferia `AuthError` (classe do `api.ts`) e a sonda lança `UnauthorizedError` — nunca casaria. Corrigido |

**Mantido (desktop):**

| o quê | por quê |
|---|---|
| `recordAssistantReply()` no `brain.ts` | 🔴 **Bug antigo de verdade.** O histórico do cérebro só recebia o RESUMO da ação e, para conversa, o `reply` do roteador — vazio desde as duas etapas (§6). O modelo nunca via a própria resposta; "e ele?" depois de "quem foi Alan Turing" perdia o fio |
| Histórico como bloco de texto no system do roteador, e só o pedido atual como turno `user` | Em modo JSON o modelo local tendia a responder ao último turno do histórico em vez de classificar o novo |
| `webSearch.ts` devolvendo frase amigável no 429 | Antes virava exceção genérica |
| Exemplo de endereço (`remember`) no `routerPrompt.ts` | Inofensivo (na §31 virou um endereço genérico) |
| Prompt de conversa com personalidade | **Reescrito**: o do Antigravity tirou o teto "1 a 3 frases" e o TTS leria parágrafos. Ficou solto e direto, mas curto |

**Descartado, com o motivo (para não voltar):**

| o quê | problema |
|---|---|
| `HomeScreen.tsx`, `SettingsScreen.tsx` | **150 ocorrências de mojibake**, inclusive em strings visíveis (`Alert('SessÃ£o expirada')`, "O PC vai desligar Ã s…"). Arquivo regravado em encoding errado, com BOM. Restaurados do HEAD |
| `AppBackground.tsx` | Fundo do tema (manchas, feixes, traços, partículas, tudo ligado à paleta e à família) substituído por 4 "bolhas de sabão" com cor hardcoded e `#0f131a` fixo — a família Vidro (clara) ganhava meio escuro. 4 loops `Animated` infinitos na thread de JS, `setTimeout` sem cleanup. Contradiz o bloco 47/52 |
| `palettes.ts` | Alfa da gaveta 0,86→0,45 e do painel 0,90→0,60, `glassSheen` zerado. O bloco 53 mediu que painel com texto precisa alfa ALTO |
| `GlassModal.tsx` | `if (!visible) return null` desmonta a árvore inteira: o `exiting` do Reanimated nunca roda, a gaveta some sem animação |
| `TabBar.tsx` + `CockpitScreen.tsx` | Aba "Cockpit" repetindo o MonitorDrawer e a Início, com cores hardcoded fora do vidro, "Status Túnel" deduzido de `endpoints.length > 1` (falso) e "Revogar Acesso" sem biometria |
| `src/widgets/` + `react-native-android-widget` | 5 widgets com **dado fixo no código** ("CPU 12% · RAM 44% · Conectado & Seguro"). Dependência nativa → fingerprint novo. Ideia boa (C19 da §16), execução fake |
| `App.tsx` | `import * as Notifications` estático (quebra Expo Go, §14), `shouldShowAlert` descontinuado silenciado com `as`, notificação local a cada poll da Caixa duplicando o push que o PC já manda, "Modo Orbital" gravando chave que ninguém lia |
| `app.json`, `package.json` (os dois) | Regravados pelo `ConvertTo-Json` do PowerShell (17 espaços de indentação). `splash` legado (SDK 57 quer o plugin). `versionCode` 1→5 sem nada por trás |
| `assets/icon.png`, `android-icon-foreground.png` | Trocados pela MESMA imagem de 1,5 MB — ignora a zona segura de 66% e o gerador `gerar-icone.mjs` |
| `scripts/build-local.ps1` | 🔴 **Pulava o `prebuild` se `android/` existisse.** Os plugins de assinatura e memória do Gradle só rodam no prebuild — APK sairia assinado com debug sem erro nenhum (§13) |
| `dashboard.html` | Aba **Programas removida** (abertos/fechar, catálogo, clipboard, energia, mídia — bloco 35) e trocada por "Cérebro" (textarea em `localStorage` que **o main nunca lê**) e "Cockpit" (repete cards da Início) |
| `config.html`, `recorder.html` | `#bg-manchas` sem CSS nenhum; toggle "Modo Orbital (Bolhas Levamitando)" com "f�sico" no texto |

**Junto com a triagem — `executarComando()` em `command.ts`:**

🔴 O `main.ts` tinha o pipeline de comando **copiado inline** nos dois handlers (voz e chat
do dashboard), chamando `decideBrain` direto. Consequência que ninguém tinha notado: **o
`fastRoute` só valia para o celular.** "Pausa" dito ao microfone pagava uma chamada de
modelo que o mesmo "pausa" mandado pelo app não pagava. Agora `executarComando(text,
onActions)` é o único pipeline (fastRoute → cérebro → executores → `recordAssistantReply`
→ `trackUsage`), `processCommand` é só a casca que devolve a string para o servidor, e o
`main.ts` ficou com o que é dele: janela, bandeja, voz, rótulo na tela.

Validado: `tsc --noEmit` limpo nos dois repositórios.

### Bloco 56 — a aba PC em painéis, teclas de mídia à vista, e o toque que responde ✅

**Aba PC.** Era o espelho mais **oito `Drawer` recolhíveis em coluna**: oito cabeçalhos
iguais, e chegar em "Energia" exigia rolar por todos os outros fechados. Virou:

1. espelho (intocado);
2. **faixa de mídia sempre visível** — anterior · tocar · pausar · próxima | mudo · vol− ·
   vol+ — em `GlassCircle` de 38 px sobre um card. É a ação mais frequente de um controle
   remoto e não merecia gaveta. Usa `media.control` e `volume.set` com `up`/`down`/`mute`,
   que o servidor já aceitava (`rpc.ts:729`) e o app nunca usava;
3. linha-herói do trackpad, com ícone em bloco;
4. **grade 2 × 4 de azulejos** (Lembretes · Memória · Monitor · Processos · Programas ·
   Energia · Transferência · Spotify), cada um com ícone, título e um resumo de uma linha.
   Entram escalonados em 30 ms (`FadeInDown.delay`), 240 ms no último — dentro do teto.

Tocar um azulejo abre **um único `GlassModal`** com o painel escolhido por id. O corpo monta
ao abrir e desmonta ao fechar, então cada painel carrega os dados dele só sob demanda —
exatamente o que as gavetas faziam, sem o custo de oito cabeçalhos. O `Drawer.tsx` ficou
sem uso e **foi apagado**.

Nos painéis, o que mudou além da moldura: **busca por nome** em Processos e Programas
(a lista de processos passa de 50 linhas); estado vazio com ícone (`Vazio`) em vez de uma
linha cinza; Desligar e Reiniciar em `errorSoft`, Bloquear e Suspender em `primarySoft` —
a cor diz o risco antes do texto; ponto verde "Ao vivo · a cada 5 s" no Monitor.

**Háptica — `src/lib/haptica.ts`** (`expo-haptics`, dependência nativa; o APK novo já
era obrigatório desde o bloco 51). Escala curta como a de movimento: `leve` para toque
em item, `medio` para ação que mexe no PC, `aviso` antes de destrutivo, `sucesso`/`erro`
ao fechar uma ação demorada, `tique` na troca de aba. Nunca lança. Está na TabBar, nos
azulejos, nas teclas de mídia, no início/fim da gravação de voz e nos painéis.

**`Toque` — `src/components/ui/Toque.tsx`.** Um `Pressable` que encolhe 3 % ao apertar
(120 ms, thread de UI) e dispara a háptica. Sem isso um card de vidro parece imagem — o
dedo aperta e nada acontece até a próxima tela abrir. É a assinatura única de "recebi" do
app; escala e tempo iguais em todo lugar, como o bloco 24 manda.

**Chat: "digitando…" no lugar do spinner.** O `ActivityIndicator` com "Pensando..." ficava
solto no rodapé, fora da conversa. Agora é `BolhaPensando`: bolha do lado da resposta com
três pontos subindo em sequência (Reanimated, `withDelay` de 160 ms entre eles). Depois de
**6 s** a bolha diz "acordando o cérebro…" — o `llama3.1:8b` recarrega em ~18 s a frio
(bloco 41), e sem uma palavra na tela esse intervalo parece travamento.

Validado: `tsc --noEmit` e `npx expo export --platform android` limpos. **Julgamento
visual do Zak pendente** (sem aparelho no `adb` desta máquina): tamanho dos azulejos,
espaçamento da faixa de mídia, intensidade da háptica.

### Bloco 57 — desktop olhado de verdade: aba, Programas, chat vazio, e falar por cima ✅

Primeira vez que o dashboard foi **capturado em execução nesta fase** (dev instance com
`--remote-debugging-port=9333 --disable-features=CalculateNativeWinOcclusion`; ver a
armadilha nova no fim). Cinco defeitos apareceram na primeira captura:

1. 🔴 **A aba ativa mostrava uma pílula VAZIA.** O `#vtab-thumb` é o último filho da
   barra e é absoluto: pintava por cima do botão e a pílula de vidro do bloco 54 cobria o
   rótulo. "Início" sumia exatamente quando você estava nela. `.vtab { z-index: 1 }` e
   `#vtab-thumb { z-index: 0 }`.
2. 🔴 **A aba Programas abria EM BRANCO por 2 a 5 s.** `carregarProgramas` esperava
   `apps.list` (instantâneo) e `system.processes` (PowerShell) num `Promise.all` antes de
   desenhar qualquer coisa. Agora desenha em duas fases: catálogo e área de transferência
   na hora, "Abertos agora" com um ícone girando até a lista chegar.
3. 🔴 **"Abertos agora" quase sempre dizia "nenhum".** Duas causas somadas:
   `system.processes` é o **top-15 por CPU** (um Chrome parado fica fora e o `MsMpEng`
   entra), e os nomes vêm com sufixo de instância (`chrome#2`) que o `normalizarApp`
   não tirava. Entrou o RPC **`apps.running`** (`getRunningApps()` em `systemInfo.ts`:
   `Get-Process` com `MainWindowHandle`, ou seja, **processos com janela** — o que
   "aberto" significa para quem olha a tela) e o cruzamento com o catálogo passou a
   considerar também o executável do comando ("bloco de notas" ↔ `notepad`).
4. **O catálogo mostrava 3 pílulas para a calculadora** (`calc`, `calculadora`,
   `calculator`) e 2 para o 7-Zip. São apelidos para o Whisper (§5), não programas.
   `agruparCatalogo()` agrupa por comando e mostra o apelido mais descritivo; a busca
   continua achando por qualquer apelido, e o `title` da pílula lista todos.
5. 🔴 **"Tirar print" não tirava print.** Chamava `screen.capture`, que devolve o quadro
   do espelho em base64 — e o botão jogava a imagem fora. Entrou o RPC
   **`screen.screenshot`**, que chama o executor `screenshot()` (PNG na Área de Trabalho,
   abre ao terminar), e os dois botões (aba Programas e card Atalhos da Início) passaram a
   usá-lo, com o retorno no toast.

**Também na aba Programas:** Energia ganhou Reiniciar, Desligar (vermelhos, com a
confirmação do `rpcBridge`) e Cancelar desligamento; Mídia ganhou mudo / vol− / vol+ por
`volume.set`. **`Bloquear` e `Suspender` deixaram de ser vermelhos**: vermelho é para o
que perde trabalho, e esses dois não perdem.

**Chat vazio.** Abria com um selo de 11 px no topo e ~500 px de nada até a barra de
escrita — parecia carregamento que não terminou. Agora `#chat-vazio` no centro
(`margin:auto` no flex de coluna): marca, "Boa noite, Zak.", e o atalho gravado num
`<kbd>`. Some na primeira mensagem de verdade (`addBubble` com classe ≠ `system`).

**Dois log-cards iguais por comando.** `onActionLabel` e `onActionLog` chamavam `addLog`
para o mesmo rótulo. O primeiro só alimenta a zona de voz agora.

**Escrever por cima da fala interrompe a fala.** `chat:send` recusava com "Aguarde o
assistente terminar…" enquanto o TTS lia a resposta anterior — e o modelo local gosta de
um parágrafo. Agora, em `speaking`, o handler chama `interruptAll()` e segue; `processing`
e `listening` continuam bloqueando. 🔴 O handler ganhou o mesmo **token** do `audio-data`:
sem ele, o handler interrompido devolvia o estado a "ocioso" no meio do pedido novo.
Verificado no renderer vivo: curiosidade longa → "que horas são" no meio da fala → "São
19:47." e o selo volta a "Ocioso".

**Notificação nativa só com a janela fora de vista.** Quem digita no dashboard e está
olhando para ele não precisa de um balão do Windows repetindo a resposta.

**Celular acompanhou o contrato** (regra da §2): `apps.running` e `screen.screenshot`
nos tipos do `rpc.ts`; o painel Programas ganhou "Abertos agora" com fechar por chip, e
a barra do espelho um botão **Print**.

**Armadilha nova — a janela "oculta" que está na tela.** `Page.captureScreenshot` ficava
pendurado e `document.visibilityState` dizia `hidden` com o dashboard visível. É o
**rastreio de oclusão do Chromium no Windows**: outra janela por cima (o próprio Claude
Desktop) faz o compositor parar de produzir quadros. `--disable-features=
CalculateNativeWinOcclusion` na instância de desenvolvimento resolve. E a **porta 9222
estava ocupada pelo Chrome** do Zak — usar 9333 (`ELYSIUM_DEBUG_PORT`).

### Bloco 58 — Ctrl+K: a paleta de comandos do desktop ✅

O bloco 20 da §19, três fases depois. `Ctrl+K` **local** (o global segue `Ctrl+Shift+J`)
abre um painel de vidro no centro-alto com um campo e uma lista. O índice é montado ao
abrir, do que o app já tem:

| grupo | fonte | executa |
|---|---|---|
| Ir para | as abas + "Nova conversa" | `switchView` / `switchChatMode` / `startNewConversation` |
| Ações | print, bloquear, suspender, reiniciar, desligar, cancelar, tocar/pausar, faixas, mudo, vol±, mandar clipboard pro celular, personalizar a Início | RPC pela ponte (destrutivos passam pelo diálogo do `rpcBridge`) |
| Abrir programa | `apps.list` agrupado por comando (bloco 57) | `apps.open` — a busca aceita qualquer apelido ("calc" → calculadora) |
| Presets | `presets.list` | `presets.run` |
| Lembretes | `reminders.list` (não disparados) | `reminders.cancel` |
| Memória | `memory.list` | `memory.remove` |
| Conversas | `chatSessionsList()` (30 mais recentes) | `openConversation` |
| Perguntar | o que você digitou, se nada casou | `chatSend` — o ÚNICO item que passa pelo modelo |

Sem consulta mostra só navegação e ações (o catálogo inteiro seria uma parede de 40
programas). Cada fonte falha por conta própria: PC ocupado não segura a paleta.

**Busca:** substring com acentos dobrados primeiro; subsequência depois ("lmbr" acha
"lembrete"). 🔴 A subsequência tem **teto de distância** (`ultimo − primeiro ≤ 2·len+1`):
sem ele "calc" casava com "prin**c**ip**al** projeto de Isa**ac**" e a paleta devolvia
lixo de memória para qualquer consulta de quatro letras. Realce do trecho casado em
`<mark>`, grupos na ordem nav → ação → preset → app → lembrete → memória → conversa.

**Teclado:** ↑↓ navega, ↵ executa, Esc fecha, mouse acompanha. O ouvinte de `Ctrl+K` é na
captura para vencer o Escape dos popovers e o Enter do campo de comando.

Entraram no sprite `i-grid` e `edit` no `ICONES_SPRITE` (o `ico()` caía no `zap` para os
dois). O convite do chat vazio cita o `Ctrl+K`.

Verificado no renderer vivo: "calc" → calculadora; "desl" → Desligar / Cancelar
desligamento; "notas" → bloco de notas; "oi tudo bem" → só "Perguntar ao ELYSIUM".

### Bloco 59 — resposta em pedaços, nos dois lados ✅

O bloco 21 da §19. A conversa passa a aparecer **palavra a palavra** enquanto o modelo
escreve; a voz continua esperando a resposta fechar (a fila do `tts.ts` não foi tocada).

**`llm.ts`:** `ChatPedido.onToken?`. Presente → `stream: true` nos dois provedores e o
retorno continua sendo o texto inteiro, então quem não liga para pedaços não muda nada.
Dois parsers, uma interface: **NDJSON** no Ollama (`message.content` por linha) e **SSE**
na Groq (`data: {...}` com `choices[0].delta.content`, `[DONE]` no fim), os dois lidos por
`lerLinhas()`.

🔴 **Dois timeouts, e o motivo.** `AbortSignal.timeout` cobre cabeçalhos E corpo — sem
stream é o que se quer, com stream mataria uma resposta longa no meio por ser longa.
Então `sinalDeConexao()` dá o `AbortSignal.timeout` de sempre sem stream, e com stream um
`AbortController` que só vale até os cabeçalhos (`liberar()` depois do `fetch`); o corpo
fica com o **timeout de inatividade** do `lerLinhas` (recomeça a cada byte). Cancelar o
leitor aborta a conexão — o modelo local para de gerar em vez de terminar para ninguém.

**`brain.ts`:** `composeChatReply(userText, onToken?)`. Se o provedor cair DEPOIS de
começar a responder, o fallback **não recomeça**: o cliente veria a resposta do primeiro
seguida da do segundo. O `parcial` acumulado vira a resposta.

**`command.ts`:** `executarComando(text, { onActions, onToken })` (era posicional) e
`processCommandStream(text, onToken)` para o servidor. Só a ação `chat` emite pedaços.

**Desktop:** canal `chat:chunk` (preload `onChatChunk`). O primeiro pedaço cria uma
`.bubble.assistant.escrevendo` com cursor piscando; os seguintes só trocam o `textContent`
(sem markdown, para não fechar um asterisco pela metade a cada quadro); o `chat:reply`
final substitui pela versão renderizada e grava na conversa — **a bolha é a mesma**, nada
pula. Erro no meio remove a bolha em curso. `onReply` e `onChatReply` viraram um
`finalizarResposta` só. Medido no renderer vivo: bolha em 70 → 149 → 217 → 288 caracteres
a cada 400 ms, depois final renderizado.

**Servidor:** `startServer(token, processCommand, port, processStream?)`. No WebSocket os
pedaços viajam como `{type:"chunk", text}` antes do `{type:"reply"}` final, que continua
trazendo a resposta inteira — **app antigo que não conhece `chunk` ignora e segue lendo o
reply**. O `POST /api/command` não muda. Medido com cliente cru: 1º pedaço em 692 ms, 56
pedaços, reply em 1,8 s.

**Celular:** `stream.ts` ganhou `sendText(text, onChunk)` pelo mesmo WS da voz,
`onTranscript` (a transcrição chega ANTES do primeiro pedaço, então a bolha "me" entra na
ordem certa) e **timeout de inatividade de 45 s** no lugar dos 20 s totais — o 8b recarrega
em ~18 s a frio e depois escreve por vários segundos; o teto fixo matava resposta boa. O
`onChunk` recebe o texto **acumulado**, não o pedaço: a bolha só troca o texto.
`ChatScreen.handleSend` vai pelo WS primeiro (5 s para abrir) e cai no HTTP de sempre se
ele não abrir — a fila offline continua funcionando. `BolhaPensando` some no primeiro
pedaço (`sending && !escrevendoId`).

Validado: `tsc` nos dois, `npx expo export`, e o stream pelo WS medido de fora. **Não
testado no aparelho** (sem `adb`).

### Bloco 60 — a busca do celular (a lupa da Início) ✅

O Ctrl+K do desktop (bloco 58) no telefone, onde ele vale ainda mais: digitar um comando
inteiro é lento e a voz nem sempre cabe. Uma **lupa de vidro no cabeçalho da Início** abre
um `GlassModal` com campo (`autoFocus`, Enter executa o primeiro) e a mesma lista por
grupos — Ir para · Ações · Presets · Abrir programa · Lembretes · Memória · Conversas ·
Perguntar. `src/screens/BuscaPanel.tsx`.

Mesma pontuação do desktop (substring, depois subsequência com teto de distância), mesmo
agrupamento do catálogo por comando, apelidos entram na busca. Diferenças que são do
celular: os destrutivos passam pela **biometria** (`confirmDestructive`) e as conversas
vêm do **cache local** (`listSessions`), para a busca funcionar com o PC desligado.

**"Perguntar ao ELYSIUM"** precisou de um caminho novo: `App.perguntaPendente` →
`ChatHub` → `ChatScreen`, que envia ao montar e limpa ANTES de enviar (se o envio falhar
e o componente remontar, a pergunta não pode disparar de novo sozinha). `HomeScreen`
ganhou `onOpenConversation` e `onPerguntar`.

**A gaveta esconde a TabBar.** O `GlassModal` da busca (e os dos painéis da aba PC,
bloco 56) vive dentro da tela, não no `App`: a camada absoluta cobre o conteúdo mas não
tinha como cobrir a barra, que ficava visível e clicável por baixo do véu. Entrou o
`SobreposicaoContext` (`mais()`/`menos()` no `GlassModal` enquanto `visible`) e o `App`
tira a TabBar com qualquer gaveta de pé — a tela cresce até o rodapé e o véu cobre tudo.
Mesmo mecanismo que o teclado já usava.

### Bloco 61 — boas-vindas e a saudação da Início ✅

**Onboarding (C16 da §16).** Três telas depois do primeiro pareamento, uma vez: *Fale com
o PC* (mic) · *Controle de longe* (monitor) · *Fora de casa também* (wifi, com o lembrete
de ativar as notificações). `src/screens/OnboardingScreen.tsx`: camada absoluta por cima
de tudo (`zIndex` 40), páginas por `ScrollView` com `pagingEnabled`, pontos que esticam,
"Pular" sempre à vista. A marca (`elysium_onboarding_v1`) é gravada ao terminar OU ao
pular — quem pulou não quer ver de novo. ⚠️ **O Zak vai ver uma vez** ao atualizar,
porque a chave não existia; é o preço de não ter uma "versão anterior" para comparar.

**Saudação na Início.** O título do cabeçalho virou "Boa noite, Zak" (mesma função do
desktop, bloco 33) e a primeira linha do corpo diz o estado numa frase: "PC online · 2
lembretes pendentes · 15° lá fora". O texto "PC online" saiu do cabeçalho — com o título
maior não sobrava largura — e ficou só o ponto colorido ao lado da lupa e do ajuste dos
cards.

### Bloco 62 — a voz neural voltou, e a voz virou escolha ✅

**Pendência 9 da §15 resolvida.** O `msedge-tts` 1.3.4 dava `Connect Error: [object
Object]` em TODA chamada — o endpoint do Edge mudou o handshake — e a voz vivia no
fallback SAPI, robótica, desde antes de agosto. Testado num projeto de rascunho: a 2.0.7
sintetiza (17,8 kB de MP3 para "Olá, teste de voz neural."). Atualizado; na 2.x o
`toStream` devolve `{ audioStream, metadataStream }` em vez do stream direto.

🔴 **Armadilha da 2.0.7:** `setMetadata(voz, formato, metadataOptions?)` declara o
terceiro parâmetro opcional e lê `metadataOptions.voiceLocale` sem conferir a partir da
**segunda** chamada na mesma instância. Sintoma: a primeira fala saía neural, todas as
seguintes caíam no SAPI com `Cannot read properties of undefined (reading 'voiceLocale')`.
Passar `{}` resolve. Verificado com duas falas seguidas e zero "fallback offline" no log.

**Pendência 10 resolvida.** A chave `voice` do config existia e o `tts.ts` fixava
`pt-BR-AntonioNeural`. Agora ele lê `getConfig().voice`, e Ajustes → Voz ganhou o seletor:
Antonio (masculina), Francisca, Thalita, Macerio (multilíngue). O padrão — `DEFAULTS` e o
`config.json` da raiz, que reinjeta por cima — passou de Francisca para **Antonio**, que é
o que sempre tocou: honrar a chave sem mudar o padrão foi o que evitou a voz trocar
sozinha na primeira abertura.

**Como ver o log da instância de desenvolvimento:** `Start-Process … -RedirectStandardOutput
… -RedirectStandardError …` no PowerShell. Sem isso o `console.error` do main vai para
lugar nenhum, e foi assim que o `voiceLocale` apareceu.

### Bloco 63 — config com BOM não derruba mais o app ✅

**Pendência 15 da §15.** `sanearBom()` em `migrateUserData.ts` (roda antes de qualquer
`new Store()`, como a migração): para cada `*.json` do `userData` que comece com
`EF BB BF`, confere que o resto é JSON válido e regrava sem os três bytes. Não usa o
`clearInvalidConfig` do electron-store de propósito — ele **apaga** o arquivo, e no
`elysium-config.json` isso é a API key e o token do servidor. Verificado em execução com
um `teste-bom.json` plantado: `[migrate] "teste-bom.json" estava com BOM; regravado sem
ele.`

### Fim da fase 7 — o que foi entregue, e o que só o Zak consegue validar

**Gerado em 17/09/2026:**

| artefato | onde | como instalar |
|---|---|---|
| Desktop **1.1.0** | `elysium/release/ELYSIUM-Setup-1.1.0.exe` (75,6 MB) | Rodar. Instala por cima da versão em `elysium baixado`; o `app.asar` foi conferido por dentro (`abrirPaleta`, `screen.screenshot`, `sanearBom`, `chat:chunk`, `voiceLocale`) |
| Celular **1.1.0**, `versionCode` 10 | `elysium-m/dist-apk/elysium-m.apk` (114 MB) | `adb install -r` ou copiar pro celular. Mesma chave de assinatura — instala por cima sem perder pareamento. **Fingerprint novo `2ca67726…`** (entrou `expo-haptics`): o OTA do canal `preview` não alcança o APK antigo; este APK já traz tudo. Conferido por dentro: `versionCode=10`, `usesCleartextTraffic=true`, assinado com `CN=NeuroAxis Portal` (a chave própria) |

⚠️ O `versionCode` pulou de 1 para **10** de propósito: o Antigravity gerou APKs com 2 e 5
e não se sabe qual está no aparelho. Um número menor que o instalado é recusado pelo
Android ("downgrade").

**Verificado nesta fase sem o Zak:** `tsc` nos dois repos a cada bloco; `expo export`;
build do desktop com captura de tela das 4 abas, da paleta e do tema claro; pipeline de
comando no renderer vivo (fastRoute "que horas são", conversa com contexto "e onde ele
nasceu?", digitar por cima da fala); streaming medido no dashboard (bolha crescendo) e
pelo WebSocket com cliente cru (1º pedaço em 692 ms); voz neural em duas falas seguidas
sem fallback; BOM saneado com arquivo plantado.

**Só o Zak consegue (sem aparelho no `adb`):**

- [ ] Instalar os dois e parear se pedir (não deve pedir: token não mudou).
- [ ] Celular: aba PC — os 8 azulejos, a faixa de mídia, abrir cada painel e voltar com o
      botão físico; a TabBar tem que sumir com a gaveta aberta.
- [ ] Celular: lupa da Início — "calc" abre calculadora, "desl" oferece desligar (biometria).
- [ ] Celular: chat — a resposta aparece palavra a palavra; "acordando o cérebro…" só
      depois de 6 s parado; mic vibra ao começar a gravar.
- [ ] Celular: as três telas de boas-vindas aparecem UMA vez; "Pular" funciona.
- [ ] Celular: intensidade da háptica (se incomodar, `haptica.ts` é o único lugar).
- [ ] Desktop: Ctrl+K de qualquer aba; Programas → "Abertos agora" lista o que está na tela.
- [ ] Desktop: a voz é a neural (Antonio) — se soar robótica, ver o log com
      `-RedirectStandardError` (bloco 62).
- [ ] Desktop: Ajustes → Voz → trocar para Francisca e ouvir.

**Ideias que ficaram para a próxima fase** (§16 continua valendo para o resto):

- Busca na Caixa (recados) — a lupa ainda não indexa `mailbox`.
- Subir os `GlassModal` da aba PC e da busca para o `App.tsx` se a saída animada da
  gaveta com a TabBar reaparecendo incomodar.
- Skeletons de vidro nos cards da Início no primeiro carregamento (hoje "Esperando o PC…").
- ~~Widget Android de verdade (C19)~~ (feito, bloco 73): a lib `react-native-android-widget` que o Antigravity
  tentou serve, mas o `widgetTaskHandler` precisa ler telemetria por RPC — casar com um
  rebuild do APK.
- ~~Bloco 22 da §19~~ (feito, blocos 67/68: timer, rotinas com presets agendados) — era o último grande
  item do plano original que segue sem código.
- `HomeScreen.tsx` tem 1.300 linhas: cada card num arquivo, antes da próxima rodada de
  cards.

---

## 25. Fase 8 — a Início cheia, Ajustes em gavetas, temas do celular e rotinas (blocos 64+)

> **O pedido do Zak, 18/09/2026** (dois áudios transcritos + texto), na ordem em que ele
> falou, porque a ordem diz a prioridade:
>
> 1. **Desktop, tela Início** — "muito simples, só com aqueles widgets, muito vazia e bem
>    xoxa, mesmo eu podendo alterar bastante coisa". Mais conteúdo.
> 2. **Desktop, Ajustes** — "tudo com base em gavetas": clica em Aparência e abre uma
>    gavetinha com os temas; Atalhos, Clima, Cérebro, idem.
> 3. **Desktop, a lupa** — não na aba Chat: "no mesmo lugar onde existem as abas, no canto
>    superior, sempre a lupinha, como uma barrinha de pesquisa que seria o atalho real do
>    Ctrl+K, para eu não precisar ficar clicando no atalho toda hora".
> 4. **Desktop, Programas** — "coisas realmente úteis, ou trocar de nome e colocar tudo o
>    que tem no mobile no desktop".
> 5. **Celular, temas** — "o tema Liquid Glass do mobile simplesmente não tem Liquid Glass,
>    é só um blur; os temas do ELYSIUM no PC sim têm um certo Liquid Glass, mas no celular
>    está muito zoado. **Zere o Liquid Glass e deixe no máximo um blur extremamente
>    levinho nos temas do ELYSIUM do celular**, está feio demais desse jeito".
> 6. **Animações** mais bonitas; **mais funcionalidades e mais abinhas** nos dois.
> 7. **Celular, widgets do Android** de verdade — "tipo busca e coisas relacionadas".
> 8. **Celular, notificações** de tarefas automatizadas — "todo dia me mandar tal coisa".
> 9. **O fundo das páginas** — "de extrema importância: muito parado e muito esquisito,
>    tanto no mobile quanto no PC, principalmente no mobile".
> 10. Sugestões minhas são bem-vindas, avisando.
>
> **Como a fase está organizada** (um bloco = um commit; ✅ quando entregue):
>
> | bloco | lado | o quê |
> |---|---|---|
> | 64 | desktop | lupa na barra de navegação (pedido 3) + 35 ícones novos no sprite |
> | 65 | desktop | Ajustes em gavetas (pedido 2) |
> | 66 | desktop | Programas vira **PC**, com os painéis do celular (pedido 4) |
> | 67 | desktop | Início cheia (pedido 1) |
> | 68 | desktop | **Rotinas**: automações agendadas + entregas para o celular (pedido 8, lado do PC) |
> | 69 | desktop | fundo vivo e animações (pedidos 6 e 9) |
> | 70 | celular | temas: ELYSIUM quase sem blur, Vidro Líquido com cara de vidro (pedido 5) |
> | 71 | celular | fundo vivo (pedido 9) |
> | 72 | celular | notificações locais, rotinas e lembretes no aparelho (pedido 8) |
> | 73 | celular | widgets Android (pedido 7) |
> | 74 | celular | aba Rotinas, animações e polimento (pedido 6) |
> | 75 | os dois | instalador + APK, checklist |

### Bloco 64 — a lupa na barra de navegação ✅

`#nav-busca` entre as abas e Ajustes: pílula fosca com lupa, "Buscar ou comandar…" e o
`kbd` Ctrl K. **Não é um campo de texto** — é um botão que abre a paleta do bloco 58. Um
segundo campo com busca própria seria a mesma paleta escrita duas vezes; e como a paleta
já limpa, foca e desenha no trecho síncrono de `abrirPaleta()`, digitar com a pílula focada
abre a paleta **já com a letra** (o índice chega depois e não apaga o campo). Abaixo de
880px a pílula vira só a lupa, como as abas viram só ícone.

De quebra, o sprite ganhou 35 símbolos (`search`, `bell`, `calendar`, `wifi`, `power`,
`lock`, `moon`, `sun`, `terminal`, `list`, `trash`, `plus`, `chevron-right/left`,
`arrow-left`, `globe`, `key`, `bookmark`, `layers`, `camera`, `file-text`, `send`, `image`,
`eye`, `info`, `alert`, `mouse`, `type`, `external`, `cpu-chip`, `sparkles`, `rotate`,
`tag`, `phone-call`) — os blocos seguintes usam quase todos, e o `ico()` só aceita o que
está em `ICONES_SPRITE`.

### Bloco 65 — Ajustes em gavetas ✅

A aba virou um **hub de dez azulejos** (Aparência, Atalho e conta, Cérebro, Voz, Clima,
Conversa, Celular, Sistema, Comandos recentes, Sobre), cada um com o valor que está valendo
como resumo ("Vidro — Maré", "Ctrl+Shift+J", "Local · responde local", "São Paulo"…).
Clicar abre `#aj-gaveta`, uma gaveta de vidro que desliza da direita por cima do hub, com
véu, Esc e clique fora fechando.

**O truque que evita duplicar markup:** as seções continuam todas no DOM, escondidas em
`#aj-secoes` (as estáticas com `id="sec-…"`, as geradas pelo esquema `AJUSTES` com
`data-secao="<slug do grupo>"`). `abrirSecao(id)` **move** os nós listados em
`SECOES_AJUSTES[].nos` para dentro de `#aj-corpo` e `fecharSecao()` devolve cada um ao
pai e à posição exata de onde saiu. Os ids (`#theme-swatches`, `#shortcut-input`,
`#clima-busca`) e os ouvintes delegados seguem vivos — os delegados subiram de
`#tab-config` para `#drawer-right`, porque a gaveta é filha direta do `#drawer-right`
(véu absoluto sobre a aba inteira; `fixed` ficaria preso pelo `backdrop-filter` dos temas
ELYSIUM). O azulejo **Celular** move o `.pop-corpo` do popover do orbe — o mesmo QR nos
dois lugares, sem cópia; `switchView` fecha a gaveta ao sair da aba para o QR voltar ao
popover.

Também: amostras de tema viraram **cartões com prévia** (fundo do tema + as duas cores em
manchas + um "card" por cima), agrupadas em "ELYSIUM — noite" e "Vidro Líquido — dia";
seção **Sobre** (versão via IPC novo `app:version`, porta, endereços, caminho da config,
atalhos); campos de formulário brancos no tema claro (o `select` de Animações era um bloco
cinza-chumbo). Verificado: abrir/fechar cada gaveta, QR presente na gaveta e de volta no
popover, tema ELYSIUM e Vidro.

### Bloco 66 — Programas vira PC, com os painéis do celular ✅

A aba `programas` virou `pc` (`#view-pc`; a aba salva em `localStorage` com o nome antigo é
traduzida). É a terceira encarnação: nasceu "PC" com gráficos inúteis (bloco 35 tirou),
virou "Programas", e agora é "PC" com **o que o celular tem** (pedido 4):

| faixa | o quê |
|---|---|
| **Sinais vitais** (4 azulejos, sempre à vista) | CPU com faísca (SVG dos últimos 40 pulsos de `dash:telemetry`, guardados mesmo fora da aba), RAM com "8,6 de 15,9 GB", disco C com barra, "ligado há 29 min" |
| **Mídia e volume** (faixa sempre à vista) | capa/faixa do Spotify se houver, teclas de mídia do sistema, mudo/−/+ e presets 25/50/75/100 (`volume.set` numérico; não há leitura de volume, por isso chips e não slider) |
| **Grade de 8 painéis** → gaveta | Programas (abertos + abrir com busca), Processos (top 15 por CPU ou RAM, filtro, encerrar), Energia (6 ações + "desligar daqui a 15/30/60/120 min" via `delaySeconds`), Área de transferência (ler, escrever no PC, mandar pro celular, limpar), Lembretes (lista, cancelar, criar com data/hora/semanal), Memória (fatos, esquecer, guardar), Presets (rodar, apagar), Rede e celular (IPs por interface com "túnel", porta, abrir o QR, mandar "oi") |

`system.telemetry` ganhou `uptime_sec`, `ram_total_gb`, `ram_used_gb` (mesmo script
PowerShell, três linhas a mais). Cada painel é um objeto em `PAINEIS_PC` com
`render(filtro)`, `clique(e)`, `input(e)`, `submit(e)` e `resumo()`; os ouvintes são
delegados em `#gaveta-corpo` e roteados pelo `painelPcAberto`.

**A gaveta virou genérica** (`abrirGaveta({titulo, icone, nos?, html?, aoAbrir?, aoFechar?,
classe?})` / `fecharGaveta()`), filha do `#layout`, e Ajustes passou a ser cliente dela
(`abrirSecao` só move os `nos`). Armadilha que apareceu: abrir um painel com outro aberto
roda o `aoFechar` do anterior **depois** de o novo id ter sido gravado — por isso
`painelPcAberto` é gravado depois do `abrirGaveta` e o `aoFechar` só zera se ainda for o
dono. `%` de CPU de processo vem somado por núcleo (121%) e é mostrado com teto de 100.

Verificado no app: os 4 vitais com valores reais, faísca crescendo, os 8 painéis
renderizando, criar e cancelar lembrete pelo formulário, filtro de processos.

### Bloco 67 — a Início cheia ✅

O pedido 1 ("muito vazia e bem xoxa"). O que entrou:

**Cabeçalho:** a saudação ganhou a data por extenso embaixo ("Sexta-feira, 18 de setembro");
à direita, o **relógio grande** (anda a cada 20 s enquanto a aba está aberta) e um **chip do
clima** (ícone, temperatura, descrição — mesmo dado do card, sem consulta extra; clicar
rola até o card).

**Cards novos** (`CARDS`): `discos` (todos os discos com barra), `conversas` (5 recentes,
clicar abre), `caixa` (últimos 4 recados do celular/PC, "novo" quando não lido),
`memoria` (fatos em chips + "ver e editar tudo" → aba PC), `notas` (textarea que grava em
`homeNotas` da config 800 ms depois da última tecla; copiar e mandar pro celular; o
redesenho periódico da Início é pulado enquanto a textarea tem foco), `timer` (5/15/25/50
min, iniciar/pausar/zerar — **o aviso é um lembrete de verdade** criado ao iniciar e
cancelado ao pausar, para o PC falar na hora mesmo com o dashboard na bandeja), `rede`
(celular conectado?, IPs por interface, túnel, porta).

**Cards que cresceram:** `clima` agora ocupa 2 colunas com temperatura grande, sensação,
chips (máx/mín, umidade, vento, chuva hoje, amanhã) e **as próximas 6 horas** —
`clima.ts` passou a pedir `hourly`, `apparent_temperature`, `relative_humidity_2m`,
`wind_speed_10m` e 2 dias de `daily`, e os ícones WMO viraram `sun`/`droplet`/`cloud`/`zap`;
`computador` ganhou a faísca da aba PC (mesmo histórico), RAM em GB e "ligado há";
`atalhos` virou grade de 6 (print, bloquear, suspender, mudo, nova conversa, buscar);
`programas` mostra os nomes agrupados (não as 75 chaves) e "todos os programas →";
`processos` sem "#2" e com teto de 100%. A sugestão "electron#1 em 118% de CPU" foi
corrigida na origem (`sugestoes.ts`).

**Ordem de fábrica** (`CARDS_PADRAO`, 12 cards): sugestões, clima, computador, música,
lembretes, atalhos, conversas, timer, notas, caixa, memória, discos. Quem já tinha
personalização gravada recebe os novos como "faltando" — a regra do `carregarCards` liga
os que estão no padrão e esconde o resto, então a tela dele também enche.

Verificado no app: as duas telas (cabeçalho, 12 cards, clima com 6 horas reais de São
Paulo), timer criando e cancelando o lembrete, notas gravando na config.

### Bloco 68 — Rotinas: automações agendadas e a fila de entregas para o celular ✅

O pedido 8 ("todo dia me mandar tal coisa"), lado do PC. É o bloco 22 da §19 que nunca
tinha saído do papel.

**`src/services/rotinas.ts`** — uma rotina é `{nome, texto, hora "HH:MM", dias[0-6]
(vazio = todos), entregar ["pc"|"celular"], falar, ativa}`; o `texto` é executado pelo
**mesmo `executarComando` do chat e da voz**, então vale tudo o que já funciona ali
("como está o tempo", "roda o preset trabalho", "quais são os meus lembretes de hoje").
Tique de 30 s comparando "HH:MM" + dia da semana; `ultimaExecucao` impede disparar duas
vezes no minuto e ignora o que venceu durante hibernação (rotina atrasada é ruído). A
execução espera o app ficar `idle` (até 60 s) para não atropelar uma gravação.
Persistência em `rotinas.json` do userData (`electron-store`).

**Entregas** (mesmo arquivo): fila `{id, tipo rotina|lembrete|aviso, titulo, corpo, em,
entregueEm?, ref?}`. **Por que existe:** o push pela Expo nunca foi validado (FCM, §15);
o que funciona sem nuvem é o celular vir buscar. O PC enfileira, avisa quem tem WS aberto
(`{type:"notify", …}`, `broadcastNotify` em `server.ts`) e ainda tenta o push; o app
confirma por `notify.ack`. Lembretes disparados também entram na fila. Poda em 60,
nunca descartando o que não foi entregue.

**RPC novos (7):** `rotinas.list` (com `proxima` em epoch), `rotinas.save`,
`rotinas.delete`, `rotinas.toggle`, `rotinas.run`, `notify.pending`, `notify.history`,
`notify.ack`. IPC `rotina:executada` → renderer.

**Aba Rotinas** (5ª aba, entre PC e Ajustes): cartões por rotina (hora grande, próxima
vez, nome, texto, os 7 dias, ícones de destino, último resultado, interruptor, rodar
agora/editar/apagar); coluna da direita com **os lembretes** (o mesmo painel da aba PC,
mesmos ouvintes) e **entregas ao celular** ("aguardando"/"no celular"). Formulário na
gaveta genérica com 4 exemplos prontos. Card `rotinas` na Início (próximas 4), entradas
na paleta ("Rotinas", "Nova rotina", "Rodar agora: …").

**Achado no caminho:** a rotina "Bom dia — como está o tempo?" respondeu *"não tenho
acesso à previsão do tempo"* — o cérebro não sabia o clima que a Início mostra ao lado.
Entrou a ação **`weather`** (`brain.ts`, `routerPrompt.ts`, `fastRoute` com ~10 formas de
perguntar, `router.ts` → `climaFalado()` em `clima.ts`): "Em São Paulo, 22 graus e
nublado. Máxima de 22, mínima de 14. Sem chuva à vista. Amanhã, 26 de máxima e 15 de
mínima." O padrão de `list_reminders` do fastRoute também ganhou "quais são os meus
lembretes de hoje".

Verificado no app: criar pelo formulário (dias úteis, próxima "21/09 07:30"), rodar
agora com a resposta do clima real, entrega na fila (`notify.pending`) e no histórico.

### Bloco 69 — o fundo vivo do desktop, e o movimento ✅

Pedido 9 ("muito parado e muito esquisito") no PC. O fundo já era animado, mas com 60 px
de deriva em 26–46 s — o olho lia como parado. Agora:

- **Deriva** com o dobro da amplitude (até 150 px) e período de 14–24 s; cada blob
  **respira** (opacidade) num ciclo próprio, defasado da deriva — dois ritmos que não
  coincidem é o que tira a cara de loop.
- **Aurora** (`#bg-aurora`): dois gradientes cônicos de 140 vmax girando devagar (90 s e
  130 s, sentidos opostos) nas cores do tema, atrás dos blobs. Só `transform`, composto
  na GPU. Mais fraca na família ELYSIUM (0,10/0,06) do que no vidro (0,16/0,10).
- **Parallax**: `mousemove` escreve `--par-x/--par-y` (−1..1) no máximo uma vez por
  quadro; as camadas do fundo deslocam até 14 px (blobs/feixes) e 26 px (traços/poeira)
  com transição de 1,6 s. Sai do mouse, volta ao centro.
- **Reage ao estado**: `body.vivo` enquanto ouvindo/pensando/falando — blobs e feixes
  em ~metade do período (`animation-duration`, para não pular de posição) e aurora em
  0,30. O fundo respira junto com a conversa.
- Feixes ELYSIUM: deriva de 150 px em 24–36 s e pulso de opacidade.
- "Reduzir movimento" (Windows) e Ajustes → "Nunca animar" param tudo isso.

**Movimento:** o polegar da barra de abas ganhou mola (`cubic-bezier(0.34,1.3,0.64,1)`,
300 ms — a assinatura do popover do celular); `mov-entra` sobe 8 px com escala 0,985; a
troca de aba parte de 14 px + escala 0,992. Corrigido de quebra: o chip do clima nascia
como pílula vazia (`display:flex` vencia o `hidden`) e a lupa da barra sumia no tema
ELYSIUM (`--muted` da noite sobre o vidro escuro).

Verificado: duas capturas com 5 s de intervalo diferem em 30/255 por canal em média
(fundo em movimento); `animationName` dos blobs = `lg-drift-1, lg-respira-1`; tema
Crepúsculo com `vivo` ligado, a olho.

### Bloco 70 — celular: ELYSIUM quase sem blur, Vidro Líquido com cara de vidro ✅

Pedido 5, ao pé da letra. Tudo em `GlassFill` (`GlassSurface.tsx`) e nos alfas de
`palettes.ts`; nenhuma tela mudou.

**Família ELYSIUM (noite):** o desfoque pedido por cada superfície é multiplicado por
0,25 e limitado a **10** (`BLUR_TETO_NOITE`; era 40–100). A tinta sobe para compensar —
`glassSurface` 0,26 → **0,62**, `glassSurfaceStrong` 0,42 → **0,74**, gaveta 0,86 → 0,94,
painel 0,90 → 0,96. Lê como painel escuro quase sólido com um véu leve. Sem brilho de
aresta (o `sheen` e a lente só existem no dia); sobra um fio de luz fraco no topo/esquerda.

**Família Vidro Líquido (dia):** o desfoque sobe 25% (teto 100) e ganha o que faltava para
ser vidro e não "blur": **aresta especular** (fio branco de 1,5 px no topo e à esquerda,
de onde vem a luz), **lente** (círculo branco de 180 px a 22% meio para fora do canto
superior esquerdo — a luz refratando na curva) e **sombra interna no pé** (gradiente 0 →
7% de escuro nos 40 px de baixo). Tudo View/LinearGradient, nada por quadro. A tinta baixa
um pouco (0,34 → 0,30) porque a aresta e a lente já dão presença.

**Sem aparelho no `adb`, a intensidade é o que o Zak precisa julgar** — os dois números que
mandam são `BLUR_TETO_NOITE` e os alfas de `vidro()`.

### Bloco 71 — celular: o fundo vivo ✅

Pedido 9 ("principalmente no mobile"). `AppBackground.tsx` reescrito com Reanimated:

- cada **mancha** deriva (40–60 px) e respira (escala 0,9–1,15, opacidade ±14%) num
  ciclo próprio de 14–26 s, `withRepeat(withTiming, -1, reverse)` na thread de UI;
- uma **aurora**: disco de 1400 px com gradiente em faixas nas cores do tema girando em
  110 s (`rotate` só — não há gradiente cônico no `expo-linear-gradient`, e as faixas
  diagonais girando dão o mesmo "luz que varre");
- os **feixes** ELYSIUM deslizam (40 s / 56 s) e pulsam; as **partículas** derivam em
  bloco (38 s); os traços ficam parados (linha de 2 px em movimento vira cintilação);
- `ReduceMotion.System` em tudo: "reduzir movimento" do Android para o fundo inteiro.

🔴 **A regra "mais elementos, menos movimento" do bloco 47 foi revista, não ignorada.** O
que custava quadro lá era animar a PINTURA de gradientes em tela cheia. Aqui só `transform`
e `opacity` de views já pintadas mudam — o compositor move sem repintar, mesma classe de
custo do polegar da TabBar. Se engasgar num aparelho fraco, o primeiro suspeito é a
aurora (disco de 1400 px com 7 paradas): baixar para 1000 px ou tirar.

### Bloco 72 — celular: notificações locais, rotinas e a aba Rotinas ✅

O lado do celular do pedido 8. **Nada passa pela nuvem** — o push da Expo continua
registrado como antes e continua não validado (FCM, §15); o que entrega de verdade são
três caminhos em `src/lib/notificacoes.ts`:

1. **Fila do PC** (`notify.pending` → notificação local → `notify.ack`). Roda ao voltar
   para o app, a cada 60 s com o app aberto (`ligarSincronizacaoEmPrimeiroPlano`) e em
   **segundo plano** pelo WorkManager: `expo-background-task` + `expo-task-manager`
   (`tarefaSegundoPlano.ts`, `defineTask` no `index.ts`, intervalo mínimo de 15 min —
   inexato, o Android decide). Precisa estar na mesma rede ou no túnel; fora disso a
   fila espera no PC.
2. **WebSocket**: com o Chat aberto, `{type:"notify"}` chega na hora (`stream.ts` →
   `receberEntrega`).
3. **Lembretes espelhados**: `espelharLembretes()` agenda cada lembrete `once` pendente
   como notificação local COM HORA (`identifier: lembrete-<id>`), e cancela os que
   sumiram. É o que toca com o celular longe do PC, sem rede. Para não tocar duas vezes,
   uma entrega de tipo `lembrete` cujo `ref` está espelhado é confirmada sem ser mostrada.

Ids vistos ficam em `AsyncStorage` (`elysium_entregas_vistas_v1`, 120 últimos) — a
duplicata é barrada mesmo se o `ack` falhar. Canal Android `elysium-entregas`
(importância alta). Chave `elysium_notificacoes_ativas_v1` = o interruptor "Avisar neste
celular". `expo-notifications` continua entrando por import dinâmico (§14: derruba o Expo
Go se importado no topo).

**Aba Rotinas** (4ª aba, `RotinasScreen.tsx`): interruptor de avisos (pede a permissão
do Android na hora), rotinas do PC (hora, próxima vez, dias, destinos, último resultado,
pausar, rodar agora com o resultado num alerta, editar, apagar), formulário na `GlassModal`
(mesmos campos do desktop, hora digitada "HH:MM", 3 exemplos), lembretes com cancelar, e
"entregues a este celular" com recebida/aguardando. `Screen` ganhou `'rotinas'`; a lupa
da Início leva para lá. `rpc.ts` ganhou os 8 métodos e os tipos `Rotina`/`Entrega`.

⚠️ **Só o Zak valida** (sem `adb`): a notificação chegar com o app fechado (deixar o app
fechado ~20 min com uma rotina "Estado do PC" marcada para daqui a 5 min, mesma rede); o
lembrete tocar com o Wi-Fi desligado (espelho local); nenhuma duplicata com o app aberto.
Dependências nativas novas → **APK novo obrigatório** (fingerprint muda; OTA não alcança).
`expo export` OK (3,4 MB).

### Bloco 73 — widgets do Android ✅ (código; validação só no aparelho)

Pedido 7, com `react-native-android-widget` 0.22.1 (C19 da §16 — a mesma lib que o
Antigravity tentou; o que faltava era o handler ler o PC por RPC e o deep link ter destino).
Widget do Android não é React Native: é uma árvore de `FlexWidget`/`TextWidget` desenhada
num bitmap, sem estado. Três widgets, declarados no plugin em `app.json`:

| widget | célula | o quê |
|---|---|---|
| **Busca** | 4×1 | pílula "Buscar ou comandar…" → `elysium://busca` (abre a lupa da Início) e botão "Chat" → `elysium://chat` |
| **Ações** | 4×1 | Bloquear · Print · Play · Mudo, por RPC **sem abrir o app** (`WIDGET_CLICK` → `executarAcao` no handler); o resultado aparece embaixo por 6 s |
| **Estado** | 2×2 | PC ligado/fora de alcance, CPU, RAM, "ligado há"; atualiza a cada 30 min pelo Android (`updatePeriodMillis`) e toda vez que o app volta ao primeiro plano (`atualizarWidgetEstado`); toque → `elysium://pc` |

Arquivos: `src/widgets/widgets.tsx` (as três árvores), `handler.tsx`
(`registerWidgetTaskHandler`, importado no `index.ts` antes do App — o Android pode
acordar o processo só para redesenhar), `tema.ts` (paleta lida do `AsyncStorage` com as
mesmas chaves do `ThemeProvider`, para o widget ter a cara do tema). `src/lib/deepLinks.ts`
(`useDeepLinks`: `busca|chat|pc|rotinas`, tratando URL inicial e evento); `HomeScreen`
ganhou `pedidoBusca` (contador que abre a `BuscaPanel`).

Decisão: o "Bloquear" do widget vai com `confirmed: true` (sem biometria) — bloquear é
proteção, não risco. Print/play/mudo não são destrutivos.

⚠️ **Só o Zak valida:** adicionar os três na tela inicial (toque longo → widgets →
ELYSIUM-M), Busca abrindo a lupa com o app fechado, Ações bloqueando o PC, Estado com
números. Se o Estado ficar em "fora de alcance" com o PC ligado, é a rede (widget roda
sem o scanner de endereços do app; usa o `activeIp` gravado). `expo export` OK; o APK é
quem valida o plugin nativo.

### Bloco 74 — celular: movimento afinado ✅

Pequeno, de propósito: `ENTRA` (entrada de item de lista, usado pelos cards da Início)
passou de `FadeIn` para `FadeInDown` com 8 px — o mesmo `mov-entra` do desktop; a troca
de tela (`TelaAnimada`) ganhou escala 0,985 → 1 junto com o deslocamento; os cartões da
aba Rotinas entram escalonados (30 ms cada). A escala 120/220/140 ms continua a única.

### Bloco 75 — instalador 1.2.0 e APK versionCode 11 ✅

**Gerados em 18/09/2026:**

| artefato | onde | como instalar |
|---|---|---|
| Desktop **1.2.0** | `elysium/release/ELYSIUM-Setup-1.2.0.exe` (79,3 MB) | Rodar. O `app.asar` foi conferido por dentro (`iniciarRotinas`, `climaFalado`, `notify.pending`, `uptime_sec`, `app:version`, `abrirGaveta`, `carregarRotinas`, `bg-aurora`, `nav-busca`) |
| Celular **1.2.0**, `versionCode` 11 | `elysium-m/dist-apk/elysium-m.apk` (114,6 MB) | `adb install -r` ou copiar pro celular. Mesma chave (`CN=NeuroAxis Portal`); instala por cima sem perder o pareamento. Conferido por dentro: `versionCode=11`, receivers `widget.Busca/Acoes/Estado`, assinado `CN=NeuroAxis Portal` (SHA-256 `3b49374d…`). **Fingerprint novo** (três módulos nativos: `expo-background-task`, `expo-task-manager`, `react-native-android-widget`) — OTA não alcança o APK anterior |

### Fim da fase 8 — o que foi entregue, e o que só o Zak consegue validar

Os dez pedidos de 18/09, um a um:

| # | pedido | onde ficou |
|---|---|---|
| 1 | Início cheia | bloco 67 — relógio, clima com 6 horas, 7 cards novos (13 na ordem de fábrica) |
| 2 | Ajustes em gavetas | bloco 65 — hub de 10 azulejos + gaveta |
| 3 | lupa na barra | bloco 64 — `#nav-busca`, sempre à vista, abre a paleta |
| 4 | Programas útil / tudo do mobile | bloco 66 — aba PC com vitais, mídia e 8 painéis |
| 5 | temas do celular | bloco 70 — ELYSIUM blur ≤ 10, Vidro Líquido com aresta e lente |
| 6 | animações + mais abas/funções | blocos 69 e 74; abas novas: Rotinas nos dois lados |
| 7 | widgets Android | bloco 73 — Busca, Ações, Estado |
| 8 | notificações de tarefas automatizadas | blocos 68 (rotinas + fila) e 72 (notificações locais, segundo plano, lembretes espelhados) |
| 9 | fundo vivo | blocos 69 (PC) e 71 (celular) |
| 10 | sugestões minhas | ação `weather` (o cérebro não sabia o clima), card Timer com lembrete real, notas rápidas, seção Sobre, `clima.ts` com sensação/vento/umidade/amanhã |

**Verificado nesta fase sem o Zak:** `tsc` nos dois repos a cada bloco; `expo export` três
vezes; desktop em execução com captura de tela de cada mudança (nav, hub e gaveta de
Ajustes nos dois temas, aba PC, painéis de processos/lembretes/programas, Início inteira
em dois temas, aba Rotinas e formulário); criar/rodar rotina de ponta a ponta com a
resposta real do clima e a entrega na fila; timer criando e cancelando lembrete; notas
gravando na config; fundo em movimento medido entre duas capturas.

**Só o Zak consegue (sem aparelho no `adb`):**

- [ ] Instalar os dois (o desktop **não está rodando agora**; o instalador sobe).
- [ ] Celular: os temas — ELYSIUM sem "zoado" (blur quase zero), Vidro Líquido com
      aresta/lente. Se o Vidro parecer leitoso demais, baixar `lente` de 0,22 em
      `GlassSurface.tsx`; se a noite parecer chapada demais, `BLUR_TETO_NOITE` 10 → 16.
- [ ] Celular: o fundo em movimento sem engasgar a rolagem da Início (suspeito nº 1 se
      engasgar: a aurora de 1400 px em `AppBackground.tsx`).
- [ ] Celular: aba Rotinas → interruptor "Avisar neste celular" liga e o Android pede a
      permissão; criar "Estado do PC" para daqui a 5 min, fechar o app, esperar até 20 min
      na mesma rede → notificação chega.
- [ ] Celular: lembrete criado no PC toca no celular com o Wi-Fi desligado (espelho local).
- [ ] Celular: widgets — toque longo na tela inicial → ELYSIUM-M → os três; Busca abre a
      lupa com o app fechado; Ações → Bloquear bloqueia o PC; Estado mostra CPU/RAM.
- [ ] Desktop: lupa da barra (clicar e digitar direto), Ajustes → cada azulejo, PC → cada
      painel, Rotinas → criar e "rodar agora", Início → timer e notas.
- [ ] Desktop: dizer "como está o tempo" — resposta falada com o clima real.

**Ideias que ficaram** (§16 continua valendo para o resto):

- Rotinas com condição ("se o PC estiver ligado às 23h, desliga") — o serviço já tem o
  lugar (`executarRotina`), falta a gramática.
- Widget de Rotinas (próxima rotina e último resultado) e widget de Clima — a lib já está
  no APK, é só mais duas árvores em `widgets.tsx`.
- Push pela Expo de verdade (FCM no projeto EAS): o código já manda; com credencial,
  a fila vira só o fallback.
- Volume com leitura real no desktop (`volume.set` numérico é por SendKeys; sem getter
  não há slider honesto).
- `dashboard.html` passou de 7.000 linhas: separar CSS e JS em arquivos próprios antes da
  próxima fase grande.

---

## 26. O plano do que falta — fases 9, 10 e 11 (blocos 76+)

> **Contexto.** Em 18/09/2026 o Zak instalou 1.2.0 + APK vc11 e deu o veredito: *"tá tudo
> funcional agora"*. Pediu o plano de **tudo que falta, na minha opinião**. Este é ele. A
> ordem é a que eu executaria: primeiro o que muda o produto (o cérebro), depois o que impede
> o produto de quebrar (estrutura e testes), depois a experiência diária, depois o que só faz
> sentido com o resto de pé. Cada item já diz onde vive no código e como se prova.
>
> **Critério de ordenação:** valor para o uso diário do Zak ÷ risco de regressão. Nada aqui é
> "bonito de ter" sem um cenário concreto de uso; o que era só ideia ficou no §16.

### Visão geral

| fase | tema | blocos | o que muda para quem usa |
|---|---|---|---|
| **9** | o cérebro com ferramentas + a base que aguenta | 76–83 | "fecha tudo menos o VS Code" funciona; rotinas com condição; nada quebra em silêncio |
| **10** | a experiência diária | 84–93 | chat do desktop de verdade; voz melhor nos dois lados; volume real; widgets novos |
| **11** | fora de casa e para sempre | 94–99 | push real; auto-update; backup; diagnóstico; segurança revisada |

---

### Fase 9 — o cérebro com ferramentas, e a base que aguenta (blocos 76–83)

#### Bloco 76 — `dashboard.html` em arquivos (dívida que trava todo o resto)
São 7.400 linhas num arquivo: CSS, markup e JS. Cada bloco novo hoje é um `edit` cego, e
foi assim que três scripts de patch falharam pela metade na fase 8. Sem bundler, sem build
novo: `<link>` e `<script>` na ordem certa.

- `src/renderer/dashboard/` com `base.css`, `temas.css`, `inicio.css`, `pc.css`,
  `rotinas.css`, `ajustes.css`, `chat.css`, `paleta.css`; e `js/` com `nucleo.js` (estado,
  helpers, ícones), `temas.js`, `chat.js`, `inicio.js`, `pc.js`, `rotinas.js`, `ajustes.js`,
  `paleta.js`, `gaveta.js`. `dashboard.html` fica com o markup e as tags.
- `copy-assets.mjs` copia a pasta. A ordem dos scripts substitui o hoisting que o arquivo
  único dava de graça — **é o único risco**: função usada antes de definida. Lista de
  dependências entre módulos no topo de cada arquivo.
- Prova: `scripts/shot.mjs` nas 5 abas + paleta + gaveta, comparado pixel a pixel com
  capturas de antes (`crop.mjs` já existe no scratchpad — vira `scripts/diff-shot.mjs`).

#### Bloco 77 — testes onde há lógica pura
Zero testes automatizados hoje; `bench-router.mjs` tem 2 casos. `vitest` nos dois repos:
- desktop: `fastRoute` (cada padrão, e os falsos positivos que NÃO podem casar), `rotinas`
  (`proximoDisparo` com dias/hora/virada de semana, poda da fila, `ultimaExecucao`),
  `clima` (parse da Open-Meteo com fixture, `climaFalado`), `agruparCatalogo`,
  `parseRouterJson` do `brain.ts`, `sanearBom`.
- celular: `destinoDaUrl`, `parseSharedUrl`, `resolverFamiliaEscolhida`, o scoring da
  `BuscaPanel` (extrair `pontuar` para `lib/busca.ts`), `notificacoes` (dedupe por id,
  espelho de lembretes — com `expo-notifications` mockado).
- `npm run check` = `tsc` + `vitest` (+ `expo export` no celular). Vira o passo antes de
  todo commit da regra 1 da §3.

#### Bloco 78 — tool-use: o cérebro chama os RPC como ferramentas ★ o salto
Hoje `decideBrain` devolve UMA lista fechada de ações sem olhar o estado do PC — por isso
"como está o tempo" virou "não tenho acesso" até o bloco 68 costurar `weather` à mão, e por
isso "fecha o que estiver aberto que não seja o VS Code" é impossível. A superfície RPC tem
60 métodos determinísticos e validados: **são ferramentas prontas.**

- `rpc.ts`: `descreverFerramentas()` gera do `METHODS` a lista no formato OpenAI/Ollama
  (`name`, `description`, `parameters` JSON Schema). As descrições entram no próprio
  `MethodDef` (`descricao`, `params`), uma linha por método — a §9 do handoff é a fonte.
- `llm.ts`: `chatComFerramentas(pedido)` — Ollama (`/api/chat` com `tools`, llama3.1:8b
  suporta) e Groq (`tools` + `tool_choice:"auto"`, gpt-oss suporta). Laço: até 4 chamadas
  por turno; cada resultado volta como mensagem `tool`; a última resposta em texto é a
  fala. Streaming continua valendo para a resposta final (`onToken`).
- `brain.ts`: `decideBrain` passa a ser o **fallback** (Ollama sem tools, JSON quebrado);
  a rota principal é o laço de ferramentas. `fastRoute` continua na frente: barato e certo.
- **Segurança, sem exceção:** métodos `destructive` exigem confirmação como hoje — no
  desktop, o diálogo do `rpcBridge`; no celular, biometria. O modelo pode *pedir*
  `power.control`, não executar. `input.*` (mouse/teclado) fica **fora** da lista de
  ferramentas: nada de modelo mexendo no mouse. Teto de 4 chamadas e 30 s por turno.
- Prova: `bench-cases.json` ganha 15 casos compostos e condicionais ("se o Chrome estiver
  aberto, fecha", "quanto de RAM e quem está usando", "abre o Spotify e toca lo-fi") — a
  bancada mede acerto antes/depois nos dois provedores.

#### Bloco 79 — rotinas com gatilho e condição
O `rotinas.ts` só sabe hora + dias. Com o bloco 78, a condição pode ser em português.
- `gatilho`: `{tipo:"hora"}` (o de hoje) | `{tipo:"evento", nome}` com eventos que o
  main já emite ou passa a emitir: `celular.conectou` (WS), `pc.ocioso` (X min sem
  input — `powerMonitor` do Electron), `pc.voltou` (resume), `app.abriu`/`app.fechou`
  (diff do `apps.running` a cada tique), `cpu.alta`/`ram.alta` (do `startMonitor`,
  sustentado por N min).
- `condicao?: string` — texto que o cérebro avalia com ferramentas ("se estiver chovendo
  amanhã", "se o Spotify estiver aberto") e devolve sim/não antes de executar.
- Aba Rotinas nos dois lados ganha o seletor de gatilho e o campo de condição; card da
  Início mostra "quando o celular conectar".
- Prova: forjar `dash:telemetria` com RAM 95% por 5 tiques e ver a rotina disparar uma
  vez só; `pc.ocioso` com `powerMonitor.getSystemIdleTime` simulado.

#### Bloco 80 — memória que o cérebro usa, e histórico que não estoura
- `memory.list/add/remove` viram ferramentas (bloco 78): "lembra que meu carro é um
  Civic" deixa de ser padrão de regex e vira decisão do modelo em contexto.
- **Resumo do histórico**: quando a conversa passa de `chatHistoryTurns`, os turnos
  velhos viram um parágrafo de resumo (uma chamada barata ao modelo) em vez de serem
  cortados — o "e onde ele nasceu?" continua funcionando 20 turnos depois.
- Prova: conversa de 30 turnos com referência ao 1º; `tsc`; teste do compactador.

#### Bloco 81 — `HomeScreen.tsx` em arquivos
1.300 linhas. `src/screens/inicio/` com um card por arquivo e o `catalogo.ts` que a
`BuscaPanel` e a Início compartilham. Sem mudança visual — prova é `expo export` + o
Zak abrir a Início e não notar nada.

#### Bloco 82 — o roteador local mais forte (medição, não fé)
`llama3.1:8b` acertou 5/5 nos casos difíceis do bloco 20/08. Com tools o custo do prompt
muda. Rodar a bancada com `qwen2.5:7b` e `llama3.2:3b` (mais rápido no boot a frio) e
gravar na §7 qual fica. Só troca o padrão se ganhar nos 15 casos novos **e** no tempo.

#### Bloco 83 — fechamento da fase 9
Instalador + APK, checklist, §26 atualizado. Como sempre.

---

### Fase 10 — a experiência diária (blocos 84–93)

#### Bloco 84 — o chat do desktop, de verdade
É a aba menos tocada desde o bloco 18. O que falta para ser o lugar onde se conversa:
- **Markdown nas bolhas** — negrito, listas, código com botão copiar. Sem biblioteca (a
  regra do dashboard): um renderizador mínimo de ~80 linhas, com `escHtml` antes.
- **Anexos**: arrastar imagem para a janela → `vision.ask`; arrastar `.txt/.md` → vai no
  prompt. O `mailbox` já sabe guardar anexo.
- **Conversas como coluna** (recolhível), não popover; busca dentro da conversa (Ctrl+F).
- **Regenerar** a última resposta e **editar** a última pergunta.
- Prova: captura das bolhas com código e lista; arrastar um PNG e receber a descrição.

#### Bloco 85 — voz do PC no celular
O celular fala com `expo-speech` (voz do Android, pior que a Antonio neural). O PC já
sintetiza MP3: endpoint `GET /api/tts?text=` (token, 24 kHz) e o app toca com `expo-audio`.
Cache das 20 últimas falas no PC. Prova: mesma frase nos dois, soar igual.

#### Bloco 86 — volume real no desktop
`volume.set` numérico é 50 `SendKeys`. Sem getter, não há slider honesto (aba PC e card
"Tocando" sofrem). PowerShell `Add-Type` com a interface `IAudioEndpointVolume` (CoreAudio)
dá get/set direto. Novo `volume.get`; slider no PC e no celular. Prova: setar 37, ler 37.

#### Bloco 87 — janelas no painel PC
`window_management` existe como ação de voz e não tem tela. Painel "Janelas" na aba PC
(desktop e celular): a lista do `apps.running` (que já tem `title`) com focar / minimizar
/ fechar / "só esta" (minimiza as outras). RPC `window.control`. Prova: focar o Chrome
pela lista.

#### Bloco 88 — wake word ("Elysium, …") — spike de 1 dia, depois decide
O único item "fora de escopo" original que ainda vale. Opções, medidas antes de escolher:
(a) **Porcupine** (Picovoice, SDK Node, chave gratuita pessoal, palavra treinada no site) —
menor CPU, precisa de chave; (b) **openWakeWord** via ONNX Runtime no Node — sem chave,
modelos genéricos ("hey Jarvis"), CPU ~2%; (c) VAD + Whisper local só quando há fala —
mais pesado, sem palavra fixa. O spike mede CPU em repouso e falsos positivos em 1 h de
música. Entra em `recorder.html` como fonte de disparo ao lado do atalho.

#### Bloco 89 — mão livre no celular
Toque no mic → grava → responde → **volta a ouvir** até dizer "chega" ou 20 s de silêncio.
VAD no aparelho (`expo-audio` com medição de nível, o mesmo do bloco 5 do desktop). Junto
com o bloco 85, vira conversa de verdade no celular.

#### Bloco 90 — widgets de Clima e de Rotinas
Duas árvores a mais em `widgets.tsx`: Clima (temperatura, ícone, próximas 3 h — do
`weather.now`) e Rotinas (próxima rotina + último resultado). `updatePeriodMillis` 30 min
+ atualização ao voltar ao app, como o Estado.

#### Bloco 91 — Ajustes do celular à altura do desktop
Hub de azulejos como o do bloco 65: Aparência, Notificações (canal, som, "só rotinas"),
Sincronização (o que espelha), Pareamento, Sobre (versão, fingerprint, último sync,
diagnóstico). Hoje é uma lista corrida.

#### Bloco 92 — sobras da fase 7
Busca na Caixa (recados); skeletons de vidro na Início no 1º carregamento; subir os
`GlassModal` da aba PC e da busca para o `App.tsx` (saída animada com a TabBar
reaparecendo).

#### Bloco 93 — fechamento da fase 10

---

### Fase 11 — fora de casa e para sempre (blocos 94–99)

#### Bloco 94 — push de verdade (precisa do Zak)
O código manda pela Expo desde a fase 3; nunca funcionou por falta de credencial FCM.
Passos do Zak: projeto no Firebase → `google-services.json` na raiz do `elysium-m` →
`eas credentials` → FCM V1 service account. Depois: a fila e o segundo plano viram
fallback; notificação chega no 4G em segundos. Prova: rotina com o celular no 4G.

#### Bloco 95 — auto-update do desktop e "há versão nova" no celular
`electron-updater` com releases no GitHub (`ZakWegues/elysium`): o app avisa e instala
sozinho, `release/` deixa de ser o canal. No celular, `GET` no release mais novo de
`elysium-m` → banner "1.3.0 disponível" → baixa o APK. Prova: publicar 1.2.1 e ver os
dois avisarem.

#### Bloco 96 — exportar e importar tudo
Memória, rotinas, presets, lembretes, conversas, notas, configuração (sem chaves) → um
`.json` em Ajustes → Sistema; importar no PC novo. É o seguro contra formatar o PC.

#### Bloco 97 — diagnóstico
Log estruturado no `userData` (rotativo, 7 dias, sem a API key nunca); botão "Copiar
diagnóstico" em Sobre nos dois lados (versão, endpoints, último erro, últimas 50 linhas).
Metade das sessões deste handoff começou reconstruindo o que o log diria.

#### Bloco 98 — revisão de segurança da fase 9
Tool-use é superfície nova: revisar que nenhum método destrutivo passa sem confirmação,
que `input.*` está fora, que o `X-Elysium-Confirm` do celular não vaza para o laço de
ferramentas, e que rotinas com condição não conseguem executar `power.control` sem a
rotina ter sido criada pelo dono. Token: rotação com aviso, e lista de aparelhos pareados
com "esquecer este".

#### Bloco 99 — fechamento

---

### O que eu NÃO faria (e por quê)
- **Outros provedores de IA** — cancelado na §16, continua cancelado.
- **iOS** — sem Mac e sem conta; o código não impede, o custo não compensa hoje.
- **Relay em nuvem próprio** — o túnel resolve fora de casa; o push (bloco 94) resolve o
  resto. Um relay é um servidor para manter para sempre.
- **Mais abas** — cinco no desktop e quatro no celular é o teto antes de virar menu.

---

## 27. Fase 9 — o cérebro com ferramentas, e a base que aguenta (blocos 76+)

> O plano está na §26. Aqui, o que foi feito de cada bloco, na ordem.

### Bloco 76 — `dashboard.html` em arquivos ✅

De 7.413 linhas num arquivo para **495 de markup** + `src/renderer/dashboard/css/` (12
arquivos) + `src/renderer/dashboard/js/` (14 arquivos). Sem bundler: `<link>` e `<script>`
clássicos, **na mesma ordem em que o código estava** — cascata e escopo global preservados
(`const`/`let` de script clássico vivem no escopo global compartilhado).

| css | js |
|---|---|
| `base` (vars, famílias, ícones, movimento, abas, polegar) · `layout` · `chat` · `legado` (gaveta direita, remoto, mini-player, modal de processos, pareamento) · `fundo` · `rich` (.theme-rich/.theme-lg) · `abas` · `ajustes` · `pc` · `rotinas` · `paleta` (presets, paleta, orbe, lupa) · `inicio` | `nucleo` · `chat` · `temas` · `voz` · `conversas` · `config` · `abas` · `ajustes` (+ gaveta genérica) · `presets` · `pc` · `rotinas` · `inicio` · `paleta` · **`boot`** |

🔴 **A única regra nova:** chamada **síncrona no nível do arquivo** só pode apontar para
função de arquivo anterior — o hoisting que o arquivo único dava de graça não atravessa
`<script>`. Por isso o bloco INIT (`loadHistory/loadConfig/loadApiKey/carregarCards`) e a
cauda de arranque (restaurar aba, ouvintes de foco) saíram do meio e viraram `boot.js`, o
último. Chamadas em tempo de execução (handlers, `switchView`, RPC) continuam livres.
`copy-assets.mjs` copia a pasta; `node --check` em cada `.js`.

**Prova:** `scripts/erros-no-dashboard.mjs` (novo — liga `Runtime.exceptionThrown` e
`console.error` ANTES do reload, percorre as 5 abas, uma gaveta de cada tipo e a paleta):
*"Sem exceções nem console.error no arranque e nas abas"*; 12 folhas carregadas com suas
regras; captura das 5 abas idêntica ao antes. De quebra: `let salva` no boot — era
`const` reatribuído (lançava e caía no `catch` quando a aba salva era "programas").

**Armadilha de teste descoberta:** a janela dev virava `iconic` 2–3 s depois de aparecer —
era o **Zak minimizando**, porque está usando o PC. `scratchpad/mostrar.ps1` restaura sem
foco e manda a janela para x=-2400; com `CalculateNativeWinOcclusion` desligado, fora da
tela ainda captura. Anotado na memória de depuração.

### Bloco 77 — testes onde há lógica pura ✅

`vitest` 3 nos dois repos (a 5 exige `@types/node` 22+; o desktop está em 20). Pasta
`tests/` fora do `include` do tsconfig do desktop — o build não compila testes. **45 testes,
todos verdes, 1,4 s + 1,0 s.**

| repo | arquivo | o que prova |
|---|---|---|
| desktop | `fastRoute.test.ts` (9) | cada padrão, clima com 6 formas, lembretes de hoje, volume grampeado, **e o que NÃO pode casar** (composto, "memória" sozinha, vazio) |
| desktop | `rotinas.test.ts` (11) | normalização de hora/dias, `proximoDisparo` (hoje, amanhã, pula fim de semana, pausada), fila (confirmar, histórico, **poda nunca descarta pendente**), executar com falha virando texto |
| desktop | `clima.test.ts` (5) | parse da Open-Meteo com fixture real de 18/09 (próximas 6 h a partir da hora cheia, amanhã, ícones), cache de 1 h, sem cidade não consulta, **a frase falada exata** da ação `weather` |
| desktop | `brain.test.ts` (3) | `interpretarAcoes` (agora exportada): `null` vs `unknown`, ação inventada descartada |
| celular | `busca.test.ts` (7) | pontuação e ordenação — `pontuar`/`dobrar`/`ordenarPorConsulta` **saíram da `BuscaPanel` para `src/lib/busca.ts`** |
| celular | `links-e-temas.test.ts` (6) | deep links dos widgets, `elysium://share`, chave antiga de família, temas aposentados, alfas da noite ≥ 0,6 / dia ≤ 0,35 (bloco 70) |
| celular | `notificacoes.test.ts` (4) | **nunca mostrar duas vezes**, lembrete espelhado não vira segunda notificação, interruptor desligado não busca, espelho cancela o que sumiu e ignora o que passou |

Dublês em `tests/setup.ts`: `electron-store` em memória e `electron` mínimo (desktop);
AsyncStorage em memória, `expo-linking.parse`, `react-native` (Platform/Appearance/AppState),
`expo-constants`, `expo-secure-store` (celular). `expo-notifications` e o RPC são mockados
por teste.

**Scripts:** `npm test` (= `vitest run`) e `npm run check` nos dois — no desktop `tsc` +
testes; no celular `tsc` + testes + `expo export`. **A regra 1 da §3 ganha um passo: `npm run
check` verde antes de commitar.**

### Bloco 78 — o cérebro com ferramentas ★ ✅

O salto da fase. O modelo deixa de devolver uma lista fechada de ações às cegas e passa a
**olhar o PC, agir em etapas e responder** — "se a calculadora estiver aberta, fecha ela"
funciona (olha `programas_abertos`, chama `fechar_programa`), "cria uma rotina chamada Bom
dia que todo dia útil às 7h30 me diz o tempo, no celular também" cria a rotina certa, "me
lembra de tomar água daqui a 20 minutos" acerta a hora. Tudo verificado ao vivo com o
`llama3.1:8b` pelo Ollama 0.34 (e o Zak jogando Dark Souls III ao mesmo tempo, com 96% de
RAM — 4 a 27 s por pedido; sem o jogo, 2 a 4 s).

**Arquivos novos:** `src/services/ferramentas.ts` (o catálogo, 30 ferramentas),
`src/services/agente.ts` (o laço), `tests/agente.test.ts` (8 testes da política).
**Mudados:** `llm.ts` (`callChatComFerramentas`, mensagens `tool`, dialetos Groq/Ollama),
`brain.ts` (`registrarTurnoUsuario`, `contextoRecente`, `provedorDoRoteador` exportados;
`decideBrain` intacto como rede de segurança), `command.ts` (a costura), `config.ts`
(`cerebroFerramentas`, ligado por padrão; Ajustes → Cérebro → "Agir em etapas").

**O catálogo (`ferramentas.ts`)** — não é a superfície RPC inteira: é o que faz sentido em
português. Leitura: `programas_abertos` (processo + título da janela — é assim que a
calculadora da loja aparece, "CalculatorApp (Calculadora)"), `estado_do_pc`,
`processos_pesados`, `clima`, `lembretes`, `memoria`, `rotinas`, `presets`, `tocando_agora`,
`area_de_transferencia`. Ação: `abrir_programa`, `fechar_programa`, `janela`, `abrir_site`,
`tocar_musica`, `midia`, `volume`, `energia`, `tirar_print`, `olhar_a_tela`, `buscar_na_web`,
`criar_lembrete` (com `em_minutos` — o PC faz a conta; o 8B devolvia a hora de agora para
"daqui a 20 min"), `cancelar_lembrete`, `lembrar_fato`, `esquecer_fato`, `rodar_preset`,
`criar_rotina`, `apagar_rotina`, `pausar_rotina`, `rodar_rotina`, `mandar_para_o_celular`,
`escrever_texto`, `criar_arquivo`. **Cada ação delega ao mesmo executor da voz**
(`routeAction` com a `BrainAction` equivalente): nenhum caminho novo, nenhuma permissão
nova. `input.*` (mouse/teclado) fica fora de propósito. `normalizarArgs` converte o que o
8B manda como string (`"true"`, `"[1, 2, 3]"`) pelo esquema.

**A política do laço (`agente.ts`)**, cada regra nasceu de um erro visto ao vivo:
- `fastRoute` continua na frente; `CHAT` (antes ou depois de uma leitura irrelevante) →
  `composeChatReply` de sempre, com streaming.
- **Rodada com ação encerra, e a fala é o que os executores disseram** ("Abrindo
  calculadora.", "Rotina Bom dia apagada.") — sem voltar ao modelo. Pedido para resumir,
  o 8B dizia "não achei a rotina para apagar" *depois* de a ferramenta ter apagado.
- **Rodada só de leitura volta ao modelo** (ele pode precisar agir com o que leu); se
  ele responder em texto, **a fala é o que foi lido**, não o texto — o 8B ecoava o prompt
  ("CHAME rotinas", "OLHAR estado_do_pc") ou contradizia a lista.
- **Alegar sem agir** ("fechei a calculadora", "a calculadora foi fechada" sem chamada de
  ação) → uma cutucada, uma vez, e ele chama a ferramenta.
- Pedido composto (" e ", "depois", vírgula) → uma volta a mais depois da ação.
- Tetos: 4 rodadas, 8 chamadas; falha do local → Groq uma vez → `null` → roteador
  clássico. Prompt sem palavras em maiúsculas: o 8B as ecoa.

**Achado grave no caminho:** Ajustes → Cérebro → "Modelo local" guardava `"llama3.1 8b"`
(com espaço) e o Ollama respondia `400 invalid model name` em **todo** pedido — o roteador
caía na Groq em silêncio há dias e batia no limite de 8000 tokens/min. `normalizarNomeOllama`
(`nome tag` → `nome:tag`) e 400 "invalid model" agora marca o modelo como morto. Era o
motivo de a Groq viver em 429.

**Limites conhecidos do 8B:** às vezes chama uma leitura irrelevante antes de decidir
(`clima` para "que horas em Tóquio"); pedido composto nem sempre completa a segunda parte;
`quemOcupaGpu` não reconhece o Dark Souls III (o local rodou com o jogo aberto). Bloco 82
mede alternativas.



### Bloco 79 — rotinas com gatilho e condição ✅

Uma rotina agora dispara **numa hora** (o de sempre) ou **num evento do PC**, e pode ter
uma **condição em português** que o cérebro confere antes de rodar.

**`src/services/eventos.ts`** (novo) — barramento `EventEmitter` entre quem emite (`main.ts`,
`server.ts`) e quem escuta (`rotinas.ts`); existe para os dois não se importarem. Sete
eventos, com `ROTULO_EVENTO` para as telas: `celular.conectou` (1º cliente do WS),
`pc.ocioso` (`powerMonitor.getSystemIdleTime` a cada 60 s, emitido nos marcos
`MARCOS_OCIOSO = 5/15/30/60/120` min, um por marco até voltar), `pc.voltou` (`resume` /
`unlock-screen`), `app.abriu` / `app.fechou` (diff do `getRunningApps` a cada 15 s, com
`{app, titulo}`), `cpu.alta` / `ram.alta` (telemetria ≥ 85% por 40 tiques ≈ 2 min).

**`rotinas.ts`:** `gatilho?: {tipo:"hora"} | {tipo:"evento", evento, app?, minutos?,
limite?, cada?}` e `condicao?: string`. `validarGatilho` recusa evento desconhecido e limita
os números (minutos 1–720, limite 50–100, cada 0–1440). Por evento a `hora` vira `"00:00"`
e `proximoDisparo` é `null`. `aoEvento` filtra: app por nome OU título de janela
(`ApplicationFrameHost (Calculadora)` casa com "calculadora"); ocioso dispara **só no menor
marco que cobre os minutos** (senão "30 min" dispararia de novo aos 60 e 120); CPU/RAM
respeitam `limite`; `cada` (padrão 60 min, 0 = sem limite) segura o "quando o Chrome abrir"
de rodar a cada alt-tab. `executarRotina(id, {forcar, contexto})`: condição falsa registra
"Condição não valeu (…); não executei." e **não entrega** — o Zak vê no histórico que ela
olhou e decidiu não agir. "Rodar agora" passa `forcar` e pula a condição. Avaliador que
estoura ou devolve `null` deixa rodar (melhor rodar a mais que engolir).

**`avaliarCondicao()` em `agente.ts`** — o cérebro com as ferramentas de LEITURA responde
`Dado / Comparação / Veredito`. 🔴 **Aqui a nuvem vem PRIMEIRO**, ao contrário do resto do
cérebro. Medido em bancada (`cond-bench.mjs`, llama3.1:8b, 6 casos × 3): "responda SIM ou
NÃO" → 7/12, e escrevia literalmente *"RAM em 50%, abaixo de 95%: NÃO"*; Dado+Veredito →
10/12 (pulava a ferramenta e chutava "Spotify aberto? FALSO"); estado do PC e programas
abertos pré-injetados no prompt → 18/18 com strings curtas, mas 21/24 com as strings REAIS
(errava "abaixo de 95%"); a linha de Comparação consertou o número e quebrou a negação
("nada tocando → VERDADEIRO"). Não é prompt: é o 8B comparando número e negação. Uma
condição roda poucas vezes por dia e um veredito errado pula (ou dispara) uma rotina em
silêncio, então `gpt-oss-120b` na Groq decide quando há chave, e o local só se a Groq
falhar. Verificado ao vivo pelo caminho real (WS cru → `celular.conectou` → condição →
rotina): "RAM abaixo de 95%" → executou; "calculadora aberta" e "tocando alguma coisa" →
não executou, com `programas_abertos` / `tocando_agora` consultados. A hora vai na
**pergunta**, não no system: no system o modelo ignorava.

**RPC:** `rotinas.list` devolve `{rotinas: [... + quando], eventos: [{id, rotulo}]}`;
`rotinas.save` aceita `gatilho` e `condicao`. **Desktop:** formulário com chips "Numa hora
/ Num evento", select de evento, campos que aparecem só para o evento certo (programa,
minutos parado, limite %, intervalo mínimo), campo "Só se…"; cartão por evento mostra o
ícone do evento e "quando o celular conectar" no lugar da hora, e a condição com lâmpada.
Três exemplos novos (Celular chegou, PC pesado, Boa noite com condição). **Celular:**
`Rotina.gatilho/condicao/quando` no `rpc.ts`; `RotinasScreen` com os mesmos chips e campos,
cartão com raio no lugar da hora.

**Testes:** +6 em `rotinas.test.ts` (validação do gatilho, filtro por app/título e `cada`,
marco de ocioso e limite de CPU, rotina pausada, condição falsa/forçada, avaliador nulo ou
estourando). O barramento é importado no MESMO `resetModules` que o `rotinas`, senão o
listener fica preso a outra instância do emitter.

**Armadilha nova:** o PC reiniciou no meio e o **ELYSIUM instalado subiu sozinho** — pegou
o lock e a instância de dev morria em silêncio (bloco 48, de novo). E a rotina de teste
apareceu **pausada** sem ninguém tocar no código: foi clicada no app instalado. Conferir
`ativa` antes de investigar "o evento não dispara".



### Bloco 80 — o histórico que não estoura, e a fala do modelo depois de ler ✅

A memória como ferramenta já tinha saído no bloco 78 (`lembrar_fato`, `esquecer_fato`,
`memoria`). O que faltava era o histórico: `chatHistoryTurns` (6) turnos e o resto era
**cortado** — vinte turnos depois, "e onde ele nasceu?" não tinha mais o "ele".

**`src/services/resumoHistorico.ts`** (novo). O que cai do histórico vira um parágrafo
curto escrito pelo modelo de conversa (≤ 80 palavras, temperatura 0,2, 180 tokens), que
entra no prompt como "o que veio antes" — no `contextoRecente()` do agente e do roteador
(`(antes disso: …)`) e no system da `composeChatReply` (`[O QUE VEIO ANTES NESTA
CONVERSA]`). A compactação roda **em segundo plano**: o pedido que causou a poda não
espera. Estado: `resumo` + `pendentes` (caíram, ainda não dobrados) + `emVoo` (lote na
chamada). Enquanto o modelo não devolve, pendentes e em voo vão **crus** no prompt — nada
fica de fora nem por um pedido. Falhou o modelo → os últimos 4 turnos ficam crus, sem
sumir. Reset por inatividade (`chatIdleResetMs`) e `clearHistory()` zeram o resumo junto.

**`brain.ts`:** `podarHistorico()` é o único lugar que corta o histórico — eram três cópias
da mesma conta (`noteFastRouted`, `recordAssistantReply`, `registrarTurnoUsuario`). 🔴 **A
poda só acontece no fim do turno** (última mensagem é a resposta): a pergunta e a resposta
que caem vão juntas, numa chamada só. A primeira versão podava na chegada da pergunta e de
novo na resposta, e como entre as duas passam segundos de modelo, a espera de 100 ms do
compactador não cobria — duas chamadas por turno. Medido ao vivo: 8 turnos de assunto
variado e depois "onde meu primo mora mesmo?" → *"Seu primo Rafael mora em Recife, como
mencionado anteriormente."* (o Rafael estava no 1º turno, fora do histórico).

**Achado no caminho — a política do bloco 78 comia a resposta certa.** "Depois de só ler, a
resposta É o que as ferramentas devolveram" foi escrita contra o 8B que contradizia a
lista; mas para "onde minha irmã mora?" o modelo lia a `memoria` e respondia "Em
Curitiba" — e a política trocava isso pela lista crua de fatos. Agora `textoConfiavel()`:
o texto do modelo vale, salvo quando é JSON solto (`{"name": "clima"}`), fala de
"ferramenta"/"função", ou **nega** ("não achei", "nenhum") enquanto alguma leitura devolveu
lista cheia. `{"name": "CHAT", "parameters": {}}` embrulhado (o 8B faz isso para "me diz
uma cor") agora é conversa, não resposta literal.

**Testes:** `resumoHistorico.test.ts` (4: poda → resumo → contexto, lote em voo continua
no prompt, compactador estourando não perde turnos, resumo cresce em lotes) e +1 em
`agente.test.ts` (texto coerente após leitura, JSON solto, CHAT embrulhado). 47 no total.

⚠️ Um teste ao vivo deixou o fato "Meu cachorro se chama Bolt…" na memória do Zak (o 8B
chamou `lembrar_fato` sozinho ao ouvir a frase) — removido pelo `memory.remove`. Ao testar
o agente com frases pessoais, conferir `memory.list` depois.


### Bloco 81 — `HomeScreen.tsx` em arquivos ✅

1.256 linhas viraram quatro, **sem uma linha de comportamento mudada** (o script só moveu
trechos e reescreveu imports; `tsc --noUnusedLocals` limpou o que sobrou):

| arquivo | linhas | o quê |
|---|---|---|
| `src/screens/HomeScreen.tsx` | 562 | a tela: estado, busca de dados, personalização, grade |
| `src/screens/inicio/cards.tsx` | 465 | `CARDS` (o catálogo) e os corpos: Bolhas, Metricas, ClimaCorpo, Lembretes, Lista, Discos, Transferencia, Atalhos, Energia, mais `segundosAte`/`relogio`/`faltando` |
| `src/screens/inicio/CardArrastavel.tsx` | 207 | o card que se arrasta e se redimensiona (gesture-handler + reanimated) |
| `src/screens/inicio/tipos.ts` | 55 | `Dados`, `Ctx`, `DefCard`, `CARDS_PADRAO`, as chaves do `AsyncStorage`, `saudacao()` |

Os estilos foram junto com quem os usa (cada arquivo tem o próprio `StyleSheet.create`
só com as chaves que referencia). Card novo = uma entrada em `CARDS` e um corpo em
`cards.tsx`; a tela não muda. O `catalogo.ts` partilhado com a `BuscaPanel` que o plano
previa **não existe**: a busca tem o catálogo dela (apps, presets, ações) e não lê `CARDS`.
Validado por `npm run check` (tsc + vitest + `expo export`). Sem aparelho no `adb`: a
prova visual é o Zak abrir a Início e não notar nada.



### Bloco 82 — o roteador local medido no laço do agente: qwen2.5:7b vira o padrão ✅

**`scripts/bench-agente.mjs` + `bench-agente-casos.json`** (novos). A `bench-router.mjs`
mede o roteador clássico (uma chamada, um JSON); desde o bloco 78 o caminho principal é o
agente, e um modelo pode ser bom em JSON e péssimo em escolher ferramenta. A bancada nova
carrega **as 33 ferramentas e o prompt de produção do `dist/`** (com `electron` e
`electron-store` substituídos por dublês) e reproduz o laço do `agente.ts` — mas **nada
toca o PC**: cada leitura devolve um cenário combinado e cada ação devolve "Feito". 20
casos compostos e condicionais ("se o Chrome estiver aberto, fecha", "fecha tudo menos o
VS Code", "tira um print e manda pro celular", "quanto é 15% de 200" → CHAT). Item
`?nome` é opcional, `a|b` aceita um dos dois, `cenario` troca o que a leitura devolve.

**Medido em 20/09/2026, 3 repetições, mesmo prompt:**

| modelo | acerto | p50 | p95 | o que erra |
|---|---|---|---|---|
| **qwen2.5:7b** | **48/60 (80%)** | **1,0 s** | 2,6 s | condicionais (age sem olhar), "tudo menos o VS Code", inventa clima para "horas em Tóquio" |
| llama3.1:8b | 44/60 (73%) | 2,1 s | 3,2 s | os mesmos, mais `lembrar_fato` que não chama e "print e manda" pela metade |
| llama3.2:3b | 24/40 (60%) | 1,0 s | 1,5 s | **age em conversa** ("quanto é 15% de 200" → `volume`; "Alan Turing" → `olhar_a_tela`) — descartado |

Pelo critério do plano (ganhar nos casos novos **e** no tempo), o padrão local passou a
**`qwen2.5:7b`** (`ollamaRouterModel`, `ollamaChatModel`, primeiro em
`CANDIDATOS_OLLAMA`; textos de Ajustes e `config.html` atualizados). Conversa em
português conferida a olho (Santos Dumont, RAM, "e onde ele nasceu?" com contexto). ⚠️
**O override do Zak também foi trocado** (era `llama3.1 8b` no roteador e `llama3.2`,
morto, na conversa) — voltar é Ajustes → Cérebro → Modelo local.

**O que NÃO funcionou, e fica registrado para ninguém tentar de novo:** duas regras a mais
no prompt ("pedido com condição: olhe primeiro e só aja se for verdade"; "fecha tudo menos
X: um fechar_programa por programa da lista, nunca o X") **pioraram os dois** — o 8B caiu
para 70% e entrou num laço fechando "outro programa" **26 vezes** (em produção o
`MAX_CHAMADAS` = 8 segura, mas ainda seria 8 fechamentos), e as condicionais viraram
excesso de cautela ("se o Chrome estiver aberto, fecha" → não fechou com ele aberto).
Revertidas. Condicional e exclusão são o limite dos 7-8B, não do prompt; a saída é o
`avaliarCondicao` na Groq (bloco 79) para o que importa (rotinas), e aceitar o erro no
chat.

**Sobrou do bloco:** `agir()` aceita `CHAT` seguido de texto ("CHAT Alan Turing foi…", o
qwen faz isso) como conversa — antes caía como resposta literal.



### Bloco 83 — fechamento da fase 9: instalador 1.3.0 e APK versionCode 12 ✅

**Gerados em 20/09/2026:**

| artefato | onde | como instalar |
|---|---|---|
| Desktop **1.3.0** | `elysium/release/ELYSIUM-Setup-1.3.0.exe` (79,3 MB) | Rodar por cima da 1.2.0. O `app.asar` foi conferido por dentro (`eventos.js`, `resumoHistorico.js`, `avaliarCondicao`, `textoConfiavel`, `rot-por-evento`, `qwen2.5:7b` no config). `/api/health` passa a dizer `1.3.0` (dizia `1.0.0` desde sempre — `PKG_VERSION` era fixo) |
| Celular **1.3.0**, `versionCode` 12 | `elysium-m/dist-apk/elysium-m.apk` (109,3 MB) | `adb install -r` ou copiar pro celular. Mesma chave; instala por cima. Sem módulo nativo novo, mas a versão muda o fingerprint (`040b2f26…`): o OTA do canal `preview` não alcança o APK 11 |

**A fase 9 inteira, bloco a bloco:**

| bloco | o quê | prova |
|---|---|---|
| 76 | `dashboard.html` em 12 CSS + 14 JS | capturas das 5 abas iguais às de antes |
| 77 | vitest nos dois repos, `npm run check` antes de todo commit | 47 testes no desktop, 17 no celular |
| 78 | o cérebro com ferramentas (33), `agir()` | "que programas estão abertos", "se a calculadora estiver aberta, fecha", criar/apagar rotina, lembrete em 20 min — ao vivo |
| 79 | rotinas por evento (7 eventos) e condição em português | WS cru → `celular.conectou` → condição na Groq → rotina rodou/não rodou certo, 3 casos |
| 80 | resumo do histórico em segundo plano; a fala do modelo depois de ler | "onde meu primo mora mesmo?" respondido 9 turnos depois |
| 81 | `HomeScreen.tsx` em 4 arquivos | `npm run check`; visual é o Zak |
| 82 | bancada do agente; qwen2.5:7b vira o padrão local (80% / 1,0 s contra 73% / 2,1 s) | 3 modelos × 20 casos × 3 |
| 83 | este | — |

**Só o Zak consegue validar:**

- [ ] Instalar os dois. O desktop pede `ollama pull qwen2.5:7b` só numa máquina nova (aqui já está).
- [ ] Desktop: Rotinas → Nova rotina → "Num evento" → "quando um programa abrir", programa
      "chrome", "Só se…" vazio → abrir o Chrome → a rotina roda em até 15 s.
- [ ] Desktop: uma rotina com "Só se estiver tocando alguma coisa" com o Spotify parado →
      "Condição não valeu" no cartão, sem entrega.
- [ ] Desktop: conversar 10 turnos e perguntar algo do 1º ("e aquele filme que eu falei?").
- [ ] Desktop: "fecha o que estiver aberto menos o VS Code" — é o caso que os 7-8B erram
      (bloco 82); se fechar o VS Code, é o limite do modelo, não bug novo. Com jogo aberto
      vai pela Groq, que acerta.
- [ ] Celular: Rotinas → o formulário com "Num evento" e "Só se…"; cartão de rotina por
      evento mostra o raio no lugar da hora.
- [ ] Celular: Início igual à de antes (bloco 81 não deveria mudar um pixel).

**Ideias que ficaram** (a fase 10 começa no bloco 84, §26):

- `avaliarCondicao` na Groq gasta ~1,5k tokens por disparo; se um dia o plano gratuito
  reclamar, o caminho é um modelo local maior (14B) só para condições, não voltar o 7B.
- "Fecha tudo menos X" e condicionais no chat: os 7-8B não fazem; medir `qwen2.5:14b` se
  couber na VRAM (8 GB — apertado) antes de tentar prompt de novo.
- `que horas em Tóquio` responde a hora local nos dois modelos; um `fuso_horario` de
  leitura resolveria barato.
- A bancada do agente não cobre a voz (STT) nem o streaming — só a decisão.

---

## 28. Fase 10 — a experiência diária (blocos 84+)

> Começou em 28/09/2026, com o Zak deixando a sessão trabalhar de noite ("pode ir até onde
> der; se precisar de mim, invente algo novo para o ELYSIUM"). A ordem é a da §26.

### Bloco 84 — o chat do desktop de verdade ✅ (e três consertos que apareceram no caminho)

**`src/renderer/dashboard/js/chat-extra.js`** (novo, depois de `conversas.js`):

- **Campo de texto que cresce**: `#cmd-input` virou `<textarea>` (Enter envia, Shift+Enter
  quebra linha), até ~8 linhas; rolagem só acima disso.
- **Anexos**: clipe na barra, **arrastar** para qualquer lugar do chat (aviso "Solte para
  anexar"), **colar** imagem (Win+Shift+S → Ctrl+V). Chips acima da barra, com ×. No lado
  **IA**: imagem → `vision.ask` (uma por pergunta; a bolha mostra a miniatura); texto
  (`.txt/.md/.json/.csv/.py/…`, até 12 mil caracteres) entra no pedido como
  `[Arquivo nome]` e a bolha mostra só o chip. Outros tipos: aviso para mandar pelo lado
  Celular. No lado **Celular**: qualquer arquivo até 5 MB vira anexo da Caixa (IPC novo
  `mailbox:send-file`, mesmo `addMessage` do anexo que vem do celular). Soltar arquivo
  fora do chat não navega mais a janela para ele (era o comportamento padrão do Electron).
- **Ações na bolha** (hover): copiar em todas; **refazer** na última resposta; **editar** na
  última pergunta (Esc cancela). Os dois mandam `chat:send` com `{refazer: true}`, e o main
  chama `desfazerUltimoTurno()` no `brain.ts` antes — sem isso o modelo veria a pergunta duas
  vezes com a resposta rejeitada no meio. A conversa gravada acompanha (`chatMessages`).
- **Markdown**: títulos (`#`–`####`, como texto forte do tamanho da bolha, não `<h1>`),
  citação, `---`, links (`[t](url)` e URL solta, **só http(s)**, abertos pelo IPC
  `link:abrir`, que confere o protocolo de novo no main), blocos de código com barra
  "linguagem + Copiar". `_ênfase_` não pega mais `snake_case`.
- 🔴 **O realce de código produzia HTML quebrado desde sempre**: eram `replace` em cadeia
  sobre o HTML escapado, e a regex de string casava o `"kw"` do `<span class="kw">` que a de
  palavra-chave tinha acabado de pôr. Todo bloco com `const` saía com `<span class=<span…`.
  Reescrito como tokenizador de uma passada.
- **Ctrl+F na conversa**: barra no canto, Enter/Shift+Enter navegam, contador "3/7". Usa a
  **CSS Custom Highlight API** (`CSS.highlights`) — marca os trechos sem mexer no DOM das
  bolhas, então o markdown não quebra e fechar não tem o que desfazer.
- **Não feito, de propósito**: "Conversas como coluna" (§26). O popover já existe, abre
  com um clique e não rouba largura do chat numa janela de 1024 px. Reavaliar se o Zak
  pedir.

**🔴 Três consertos que não eram do plano:**

1. **O Ollama cortava o começo do prompt em silêncio.** Sem `num_ctx`, ele carrega com
   **4096** tokens (`ollama ps`), e o prompt do agente — system + 33 ferramentas — mede
   **3023** sozinho. Com histórico, resumo, memória e o resultado de uma leitura, passava do
   teto, e o que o Ollama corta é o INÍCIO: o system prompt. `ollamaNumCtx: 8192` no
   config, nas duas chamadas do `llm.ts` (custa ~0,3 GB de VRAM: 4,7 → 5,0 GB). A bancada
   do bloco 82 deu o mesmo placar com 8192 (qwen 78%, llama 75%, 3×) porque cada caso é
   curto — o ganho é no uso real, com conversa.
2. **A visão estava morta**: `qwen/qwen3.6-27b` saiu da Groq (404 em toda imagem, inclusive
   a câmera do celular). **E a busca na web também**: `groq/compound` e `compound-mini`
   sumiram do catálogo. Catálogo da conta em 28/09 (via o IPC novo `groq:modelos`, que só
   devolve ids — a chave fica no main): `gpt-oss-120b/20b/safeguard-20b`, `qwen/qwen3.8-27b`,
   `whisper-large-v3(-turbo)`, `allam-2-7b`, `orpheus`, `llama-prompt-guard`. Visão →
   `qwen/qwen3.8-27b` (lê "OLA 42" em branco sobre azul, conferido); busca →
   `openai/gpt-oss-120b` com a ferramenta embutida **`browser_search`** (`tools` +
   `tool_choice: "required"`, `max_tokens` 2000 por causa do raciocínio) — "cotação do
   dólar" respondeu com o valor do dia. Os três ids mortos entraram em
   `DECOMMISSIONED_MODELS`; candidatos atualizados.
3. **A visão se cura sozinha agora** (`src/services/catalogoGroq.ts`, novo): 404 no modelo
   de visão → marca morto, pergunta o catálogo (`modelosDaGroq`, cache de 1 h) e escolhe
   por padrão de nome (`candidatosDeVisao`: llama-4, `qwen/qwen3.x-NNb`, `*vision*`, `*vl*`).
   Da próxima vez que a Groq trocar o modelo, a imagem continua funcionando.

**Testes:** `catalogoGroq.test.ts` (2, com o catálogo real de 28/09). 49 no total. Provado
ao vivo no app de dev: arquivo de texto ("a cor preferida segundo o arquivo" → verde-musgo),
imagem, refazer (morango → maçã), editar (vermelha → amarela, conversa gravada com só o
turno novo), Ctrl+F (1/1), capturas nos temas Vidro e ELYSIUM.

### Bloco 85 — a voz do PC no celular ✅

O celular respondia com o `expo-speech` (a voz do Android). Agora pede o MP3 ao PC:

- **`GET /api/tts?text=`** (`server.ts`, com token) → `audio/mpeg` na voz de Ajustes → Voz
  do PC. GET porque é o formato que um player sabe buscar. `sintetizarMp3()` em `tts.ts`
  usa uma **instância própria** do `MsEdgeTTS` — a do `synthesize` pode estar falando na
  caixa de som, e `setMetadata` nela trocaria a voz no meio — e guarda as últimas 20 falas.
  Medido: **14 s na primeira síntese** depois de o PC ligar (conexão com o serviço do Edge),
  ~0,5–0,8 s nas seguintes, 3 ms no cache. Sem token → 401.
- **`src/lib/falar.ts`** (celular): `falar(texto, pairing)` baixa o MP3 com prazo de **8 s**
  para um arquivo no cache (`expo-file-system`) e toca com `expo-audio`; sem PC, sem rede,
  ou passou do prazo → `expo-speech`. Baixar em vez de dar a URL ao player é o que torna o
  prazo nosso: player com URL remota fica mudo esperando, sem fallback. Troca as três
  chamadas de `Speech.speak` (resposta do chat, foto pela câmera, "o que tem na tela").
- **Ajustes do celular → "Voz das respostas"**: Voz do PC (padrão) / Voz do celular, com
  uma frase de amostra ao tocar. Chave `elysium_voz_do_pc_v1`.

Só JS no celular (`expo-audio` e `expo-file-system` já estavam no APK): vai por OTA ou no
próximo APK. ⚠️ Não testado no aparelho (sem `adb`); a rota foi testada de fora.

### Bloco 86 — volume com leitura real ✅

`src/actions/volumeControl.ts` reescrito sobre a **Core Audio** (`IAudioEndpointVolume`,
vtable completa com os nomes na ordem certa): `lerVolume()` → `{nivel, mudo}`, e mudo,
subir, descer e número passam todos pela interface. Antes só o número usava a Core Audio;
o resto era tecla de mídia por SendKeys, e **"desmutar" era a mesma tecla que mutar** —
pedido com o som ligado, mutava. Subir/descer agora é de 10 em 10 e responde o valor
("Volume em 60%"); subir tira do mudo, como a tecla física. Sem dispositivo de saída (fone
desconectado no meio), cai nas teclas de mídia em vez de dar erro. PowerShell com
`OutputEncoding` UTF-8 (regra da §14).

- **RPC `volume.get`** (§9).
- **Desktop, aba PC**: os chips 25/50/75/100 viraram **slider** com o número ao lado; mostra o
  número enquanto arrasta e só manda `volume.set` ao soltar (um PowerShell por quadro seria
  inviável). Botão de mudo alterna de verdade e acende em vermelho quando mudo.
- **Celular, faixa de mídia da aba PC**: o número (ou "mudo") entre − e +, relido depois de
  cada toque; o botão de mudo alterna. Slider no celular exigiria módulo nativo novo
  (`@react-native-community/slider`) — fica para quando houver APK novo por outro motivo.

Verificado lendo o volume desta máquina (100%, sem mudo) e redefinindo o mesmo valor, sem
mexer no som do Zak.

### Bloco 87 — painel Janelas, nos dois lados ✅

**`src/actions/janelas.ts`** (novo): `listarJanelas()` usa o **`EnumWindows`** do Windows,
filtrado como a barra de tarefas filtra — visível, com título, sem dono, sem
`WS_EX_TOOLWINDOW`, sem estar *cloaked* (`DwmGetWindowAttribute(14)`: apps UWP suspensos
continuam "visíveis" para a API), e fora `TextInputHost`, `SearchHost`, `Program Manager` e
afins. Cada item traz `hwnd`, processo, título, minimizada/maximizada e se está em foco. O
`apps.running` continua existindo para "programas abertos" — ele é por processo, e o Chrome
com três janelas vira uma linha só. Medido: ~0,8 s para listar.

`controlarJanela(hwnd, op)`: `focar` (com o truque do Alt apertado-e-solto, senão o Windows
recusa o `SetForegroundWindow` vindo de processo em segundo plano), `minimizar`,
`maximizar`, `restaurar`, `fechar` (**`WM_CLOSE`**, o X da janela — o programa pergunta se
quer salvar; quem força é Processos) e **`so_esta`** (minimiza todas as outras e foca esta).
O `hwnd` é validado como número nos dois lugares (RPC → 400 e na ação) — é o que impede
texto do cliente de virar PowerShell.

- **RPC** `window.list`, `window.control {hwnd, operacao}` (não destrutivos, pelo motivo
  acima).
- **Desktop**: 9º azulejo na aba PC, "Janelas" — lista com título e processo, a em foco
  acesa, e os quatro botões por linha.
- **Celular**: azulejo "Janelas" na grade da aba PC (9 azulejos agora), cartão por janela
  com Focar / Só esta / Minimizar-Restaurar / Fechar.

Testado ao vivo só na janela de dev (minimizar → `minimizada: true` → restaurar), sem tocar
nas janelas do Zak. `janelas.test.ts` (2): hwnd com texto é recusado; a leitura da saída do
EnumWindows respeita flags e filtros.

### Bloco 88 — "Elysium" em voz alta acorda o assistente ✅ (desligado por padrão)

O §26 previa um spike entre Porcupine (chave da Picovoice), openWakeWord (baixar modelos
ONNX + compilar `onnxruntime` para o Electron) e VAD + Whisper (Groq paga a cada frase
perto do microfone). **Nenhum dos três foi preciso.** Achado: o Windows desta máquina já
tem um reconhecedor de fala **offline em pt-BR** — `MS-1046-110-WINMO-DNN`, do OneCore
(`HKLM\SOFTWARE\Microsoft\Speech_OneCore\Recognizers\Tokens`; o `System.Speech` clássico
não enxerga nenhum) — exposto pela API WinRT `Windows.Media.SpeechRecognition`.

Medido com uma **lista fechada** de frases ("elysium", "ei elysium", "ok elysium",
"oi elysium"):

| pergunta | resposta |
|---|---|
| precisa da "política de fala online" do Windows? | **Não** para lista fechada (a ditação livre exige e dá erro) |
| manda áudio para fora? | Não — o reconhecedor é local |
| custo escutando (30 s, silêncio) | **0,3% de um núcleo, ~94 MB** |
| resultado sem ninguém falar | `Success` com confiança `Rejected` a cada ~10 s (o laço segue) |

**`src/services/palavraAtivacao.ts`** (novo): um PowerShell em laço (`RecognizeAsync`, 10 s
de silêncio inicial, 400 ms para fechar, 4 s de falatório no máximo) escreve uma linha por
tentativa; só **High/Medium** com "elysium" no texto acorda (`linhaAcorda`, testado) —
`Low` é o reconhecedor forçando barulho na frase mais parecida. Caiu sozinho → sobe de
novo, no máximo 5 vezes em 10 min. `before-quit` mata o filho (senão ficaria escutando
órfão depois de "Sair").

**`main.ts` → `acordarPorVoz()`**: só com o assistente ocioso e passados 2,5 s desde a
última volta ao ocioso (a própria fala dizendo "Elysium" não pode acordá-lo), e **sem
roubar o foco** — ao contrário do atalho: quem fala de longe pode estar num jogo em tela
cheia. Começa a gravação direto (`startListening`).

**Ajustes → Voz → "Acordar ao ouvir 'Elysium'"** (`palavraDeAtivacao`, padrão **desligado**:
microfone sempre aberto é escolha do dono). Liga e desliga na hora, sem reiniciar.

Três armadilhas da ponte PowerShell 5.1 ↔ WinRT, registradas no cabeçalho do arquivo:
`IAsyncOperation<T>` vira Task pelo `AsTask` genérico por reflexão; o construtor da lista
só aceita `[string[]]` via `::new`; e `Constraints.Add` não existe para o PowerShell no
`__ComObject` — só funciona chamado pelo `ICollection<ISpeechRecognitionConstraint>` por
reflexão.

⚠️ **Só o Zak valida a precisão** (sem ninguém falando perto do PC nesta sessão): ligar,
dizer "Elysium" a 1–3 m, e deixar uma hora de música/jogo tocando para ver se acorda
sozinho. Se acordar demais, o próximo passo é exigir só `High`.

### Bloco 89 — conversa mão livre no celular ✅

No chat do celular, **com o campo vazio o botão de enviar vira um fone** 🎧: toque e a
conversa segue sozinha — grava, manda, a resposta é falada, e volta a ouvir. Uma faixa acima
da barra diz a fase ("pode falar" / "pensando" / "respondendo") e tem o × para sair.

- **Fim da fala detectado no aparelho**: o gravador passou a medir nível
  (`isMeteringEnabled`), e um laço de 120 ms decide com **dois limiares** (voz acima de
  −38 dBFS, silêncio abaixo de −46) — a folga entre eles evita que ruído no meio alterne
  "falou/calou". Fecha a frase após **1,3 s** de silêncio depois de ter havido voz; sem voz
  em **20 s**, a mão livre desliga sozinha com um aviso; teto de 30 s por frase.
- **Sair falando**: "chega", "pode parar", "tchau", "até mais", "obrigado, é só",
  "encerrar". **Nunca "para" sozinho** — "para a música" é um pedido, não um tchau. (A
  regex usa `(?=\W|$)` no fim e não `\b`: em JS sem `u`, `\b` depois de "só" não casa.)
- **`falar()` agora só resolve quando a fala termina** (evento `didJustFinish` do player, ou
  `onDone` do `expo-speech`, com teto de segurança pelo tamanho do texto): era o que faltava
  para o microfone não gravar a própria resposta. `pararDeFalar()` resolve a fala em curso.
- O aperta-e-fala fica desabilitado durante a mão livre (os dois usam o mesmo gravador), e
  sair da tela desliga tudo.

Só JS (o `expo-audio` já estava no APK). ⚠️ Os limiares em dB são estimativa para um
celular na mão; **só o Zak calibra** — se cortar no meio da frase, subir
`SILENCIO_PARA_FECHAR_MS`; se não fechar nunca num lugar barulhento, subir
`LIMIAR_SILENCIO_DB` (os dois no topo do bloco "Mão livre" do `ChatScreen.tsx`).

### Bloco 90 — widgets de Clima e de Rotinas ✅ (precisa de APK novo)

Duas árvores novas em `src/widgets/widgets.tsx`, lidas pelo mesmo `handler.tsx`:

| widget | célula | o quê | toque |
|---|---|---|---|
| **Clima** | 4×1 (até 4×2) | emoji do tempo, temperatura grande, "descrição · máx/mín", cidade, e as **próximas 3 horas** à direita (vêm de `weather.now` → `horas`, que o desktop manda desde o bloco 67) | `elysium://inicio` (destino novo) |
| **Rotinas** | 4×2 | quantas ativas, a **próxima por hora** ("Bom dia · 07:30" ou "seg 07:30") e a **última que rodou** com o começo do resultado | `elysium://rotinas` |

Os dois atualizam a cada 30 min pelo Android (`updatePeriodMillis`) e junto do widget
Estado sempre que o app volta ao primeiro plano (`atualizarWidgetEstado` agora renova os
três). Sem PC: "Sem leitura do PC" / "PC fora de alcance" com a hora. O tipo `Clima` do
celular ganhou `sensacao`, `horas` e `amanha` opcionais (PC antigo não manda).

⚠️ **Widget novo mexe no manifesto** (o plugin gera um receiver por widget): só chega com
**APK novo** — não vai por OTA. Fica para o fechamento da fase (bloco 93).

### Bloco 91 — Ajustes do celular em azulejos ✅

A gaveta de Ajustes era uma lista corrida (estilo, cor, voz, notificações, "Sobre" e
"Desparear" no fim). Virou o mesmo desenho do desktop (bloco 65): um **hub de 5
azulejos**, cada um com o valor que está valendo como resumo, e uma seção por vez com
"‹ voltar".

| azulejo | resumo | dentro |
|---|---|---|
| Aparência | "ELYSIUM · Campos Elísios" | família (Vidro / ELYSIUM / seguir o aparelho) e as três cores |
| Voz | "Voz do PC" | voz neural do PC ou do celular (bloco 85) |
| Notificações | "Avisando neste celular" | o interruptor de avisos locais (antes só na aba Rotinas) + o push da Expo |
| Pareamento | "192.168.15.22:4200" | todos os endereços conhecidos, o ativo marcado, o do túnel identificado, e Desparear |
| Sobre | "Versão 1.3.0" | versão, runtime, canal e atualização OTA em uso (`expo-updates`), PC e endereço ativo, e **"Copiar diagnóstico"** |

`expo-constants` é importado direto (é dependência do próprio `expo`, sempre presente). Só
JS: vai por OTA.

### Bloco 92 — as sobras da fase 7 ✅

- **Busca nos recados da Caixa, nos dois lados.** Celular: a lupa da Início ganhou o grupo
  "Recados da Caixa" (os 200 mais novos, do **cache local** — acha com o PC desligado);
  tocar abre o chat no lado PC. Desktop: a paleta Ctrl+K ganhou o mesmo grupo (via
  `getMailboxThread(null)`), e executar abre a Caixa na conversa daquele recado. Ícone de
  clipe quando é anexo, "do PC/do celular · dd/mm" embaixo. Conferido ao vivo: 12 recados
  indexados, inclusive o link do GitHub mandado do celular em 22/09.
- **Esqueleto na Início do celular** (`components/ui/Esqueleto.tsx`): até a primeira leitura
  voltar, cada card que depende de dado do PC mostra barras pulsando em vez de um texto
  definitivo que ainda não é verdade ("Defina a cidade nos Ajustes do PC", "Nada de urgente
  por aqui"). Pulsa só opacidade, na thread de UI, e respeita "reduzir movimento".
- **Não feito, de propósito: subir os `GlassModal` da aba PC e da busca para o `App.tsx`.**
  O incômodo previsto (a TabBar reaparecendo durante a saída animada da gaveta) é de
  ~140 ms e a solução mexeria no dono de três gavetas. Sem o Zak ter reclamado, o risco não
  compensa.

---

## 29. Fase 11 — fora de casa e para sempre (blocos 94+)

> Blocos **94 (push pelo FCM)** e **95 (auto-update por releases no GitHub)** ficam para
> quando o Zak puder: o 94 exige criar o projeto no Firebase e colar o
> `google-services.json` (§26), e o 95 exige **publicar releases** — ação pública que
> ninguém faz sem ele pedir, e o repositório é privado (o app precisaria de um token do
> GitHub para ler a release). Os outros três foram feitos na sequência.

### Blocos 96 e 97 — exportar/importar tudo, log em arquivo e "copiar diagnóstico" ✅

**Backup (`src/services/backup.ts`).** Ajustes → **Dados e diagnóstico** → "Exportar
tudo…" grava `elysium-backup-AAAA-MM-DD.json` (em Documentos, pelo diálogo do Windows):
memória, lembretes pendentes, presets, rotinas, conversas com a IA e os ajustes que você
mudou (`getOverrides()`, novo no `config.ts`). **Não leva, de propósito**: chave da Groq e
token do servidor (o arquivo costuma parar em pendrive e nuvem), a Caixa (anexos de até
5 MB cada), o login do Spotify, e ajustes desta máquina (`ollamaBaseUrl`, `serverPort`).
"Importar um backup…" mostra o resumo num diálogo do sistema e **soma, não substitui**:
fato repetido, lembrete igual (texto+hora) e preset/rotina de mesmo nome são pulados;
lembrete único que já passou não volta; conversas passam pelo `mergeSession` (vence a
mais nova). Importar duas vezes não duplica — testado (`backup.test.ts`: ida e volta
entre dois "PCs", e a segunda importação soma zero).

**Log (`src/main/logArquivo.ts`).** Todo `console.*` do main vai também para
`%APPDATA%\elysium\logs\elysium-AAAA-MM-DD.log`, com hora, escrito em lote a cada 250 ms
(um log por quadro de telemetria não pode virar escrita síncrona no processo do
microfone), 7 dias de retenção. **`mascarar()` antes de escrever**: `gsk_…`, qualquer hex
de 64 caracteres (token do servidor, do Spotify) e `Bearer …` viram `[oculto]` — testado.
Antes, no app instalado, o console ia para lugar nenhum.

**Diagnóstico (`src/services/diagnostico.ts`).** "Copiar diagnóstico" monta um texto só:
versão/Electron/Windows/CPU, quem decide e com qual modelo (local/nuvem), `num_ctx`,
Ollama respondendo, **o catálogo atual da Groq**, visão e busca em uso, voz e palavra de
ativação, as rotinas, as chaves de ajuste alteradas, e as últimas 60 linhas do log. Passa
pelo mesmo `mascarar` — conferido ao vivo: nem a chave nem o token aparecem. Também pelo
RPC **`system.diagnostico`**: o "Copiar diagnóstico" do Sobre do celular agora junta o do
aparelho e o do PC num texto só. "Abrir a pasta de logs" abre o Explorer nela.

De quebra: o seletor de modelo da Groq em Ajustes e no `config.html` ainda oferecia o
`qwen3.6` morto — virou `qwen3.8`.

### Bloco 98 — revisão de segurança do que entrou desde a fase 9 ✅

Revisado ponto a ponto o que é superfície nova:

| o quê | como está |
|---|---|
| Markdown das respostas → HTML (bloco 84) | `escHtml` antes de qualquer marcação; links só `http(s)` e o clique passa pelo IPC `link:abrir`, que confere o protocolo de novo no main |
| `window.control` (bloco 87) | `hwnd` só dígitos, conferido no RPC (400) e na ação — texto do cliente nunca vira PowerShell |
| `GET /api/tts` (bloco 85) | atrás do token como o resto; testado sem token → 401 |
| Condição de rotina (bloco 79) | só ferramentas de LEITURA; nunca age |
| Importar backup (bloco 96) | confirmação num diálogo do sistema, no main; soma sem apagar |
| Log e diagnóstico (bloco 97) | `mascarar()` antes de gravar e antes de copiar; conferido ao vivo que chave e token não aparecem |
| `input.*` no agente | continua fora da lista de ferramentas |

**Dois reforços novos:**

1. **Content-Security-Policy no `dashboard.html`**: só roda JS dos arquivos do próprio app —
   nada inline, nada de fora, `object-src 'none'`, `base-uri 'none'`. Imagens de
   `https:`/`data:`/`blob:`/`file:` (capa do Spotify, anexos), rede só para o geocoding do
   Open-Meteo. É a segunda linha de defesa caso algum dia o escape do markdown falhe.
   Testado: um `<img onerror>` injetado **não executa**; clima, imagens `data:`, as 5 abas e
   a Início (13 cards) seguem funcionando, sem erro no console.
2. **"Quem usou o token"** (`src/services/aparelhos.ts`): cada requisição autorizada anota
   endereço, tipo de cliente (pelo user-agent: "ELYSIUM-M (Android)", "script (Node)",
   "linha de comando"…), primeira e última vez e quantidade; cada **401** conta à parte
   como "recusa". A lista aparece no pareamento (Ajustes → Celular e o orbe), com
   "este PC" para o loopback e destaque vermelho para endereço que só tem recusas.
   **Regenerar token zera a lista** (o token velho deixa de valer na hora). Gravação no
   disco no máximo uma vez por minuto — o trackpad manda dezenas de pedidos por segundo.
   Só endereço e contagem: nada do que foi pedido. Conferido ao vivo: o celular do Zak
   (`192.168.15.29`, ELYSIUM-M) e um script local com 3 recusas.

`aparelhos.test.ts` (2). 58 testes no desktop.

### Bloco 94 — push pelo Firebase (FCM V1) ✅ (código); validação no aparelho

O Zak criou em 29/09/2026 o projeto Firebase **`elysium-ac53f`**, registrou o app Android
`com.zak.elysium.m` e subiu a **chave da conta de serviço (FCM V1) direto no expo.dev**
(Credentials → Android → projeto `neuroaxis-portal`) — a chave nunca passou pelo chat nem
pelo repositório. O `google-services.json` fica em `elysium-m/google-services.json` e é
ligado por `android.googleServicesFile` no `app.json`; está no **`.gitignore`** (não é
segredo como a chave de serviço, mas não precisa estar no repositório — baixa de novo em
Configurações do projeto → Seus apps no console do Firebase).

⚠️ Numa máquina nova, **sem esse arquivo o `build:local` gera um APK sem FCM** (o prebuild
não reclama). O código de push do app e do PC não mudou — ele já mandava pela Expo desde a
fase 3 e só faltava a credencial. Depois de instalar o APK 1.4.0: Ajustes → Notificações →
**Registrar este aparelho**. A partir daí lembrete e rotina chegam no 4G, em segundos; a
fila local (bloco 72) vira só a rede de segurança.

### Blocos 93 e 99 — fechamento das fases 10 e 11: versão 1.4.0 ✅

**Gerados em 29/09/2026:**

| artefato | onde | notas |
|---|---|---|
| Desktop **1.4.0** | `elysium/release/ELYSIUM-Setup-1.4.0.exe` (79,4 MB) | `app.asar` conferido por dentro: `chat-extra.js`, `palavraAtivacao`, `janelas`, `sintetizarMp3`, `montarBackup`, `mascarar`, `registrarAcesso`, CSP, `ollamaNumCtx`, `browser_search`, `qwen3.8-27b` |
| Celular **1.4.0**, `versionCode` 13 | `elysium-m/dist-apk/elysium-m.apk` (109,4 MB) | Conferido por dentro: `versionCode=13`, receivers dos 5 widgets (Busca, Ações, Estado, Clima, Rotinas), `FirebaseMessagingService` e `google_app_id`. **APK obrigatório** (widgets novos e Firebase mexem no manifesto). Mesma chave de assinatura |

**Só o Zak valida** (sem aparelho no `adb`):

- [ ] Instalar os dois. Celular: Ajustes → Notificações → Registrar este aparelho; criar um
      lembrete para daqui a 2 min, **desligar o Wi-Fi do celular** e esperar o push no 4G.
- [ ] Widgets novos (Clima, Rotinas) na tela inicial.
- [ ] Chat do celular: campo vazio → fone → conversa mão livre; dizer "chega" para sair.
- [ ] Resposta falada no celular com a voz do PC (Ajustes → Voz).
- [ ] PC: Ajustes → Voz → "Acordar ao ouvir Elysium", e dizer "Elysium" de longe.
- [ ] PC: arrastar uma imagem e um `.txt` para o chat; Ctrl+F; refazer/editar.
- [ ] PC: aba PC → Janelas → "só esta"; slider de volume.
- [ ] PC: Ajustes → Dados e diagnóstico → Exportar tudo (guardar o arquivo fora do PC).
- [ ] PC: Ajustes → Celular → conferir a lista "Quem usou o token".

**Fica para depois (§26 atualizado):**

- ~~**Bloco 95 (auto-update)**~~ — **feito em 29/09/2026**, com a liberação do Zak (§30).
- Conversas como coluna no chat do desktop (bloco 84, adiado por decisão).
- Slider de volume no celular (precisa de módulo nativo).
- Calibrar os limiares da mão livre e a confiança da palavra de ativação com uso real.
- C: com 97% usado nesta máquina — o card de insights poderia avisar disco quase cheio.

---

## 30. Fase 12 — atualização automática e o que veio depois (blocos 95, 100+)

> Em 29/09/2026, com as fases 10 e 11 fechadas, o Zak liberou publicar releases no GitHub:
> *"te dou permissão pra fazer o negocio do github e tudo mais, pode fazer o que for
> melhor"*. Era o único bloco do plano (§26) que dependia dele. Depois, de noite: *"faz o
> que der ai"* — os blocos 100+ são ideias minhas, cada uma nascida de um problema visto
> nesta máquina.

| versão | lado | o que trouxe |
|---|---|---|
| 1.5.0 | os dois | bloco 95 — atualização automática (+ `update.install`) |
| 1.5.1 | os dois | blocos 100–102 — armazenamento, novidades, início automático certo |
| 1.5.2 | desktop | blocos 103–104 — Ollama que se levanta, falha dita em português, madrugada, 2 ferramentas |
| 1.5.3 | desktop | bloco 105 — download em segundo plano |
| 1.5.4 | desktop (+ OTA no celular) | blocos 106–107 — `gpu-heavy.json` no build, cura gravada, card "Saúde" |
| 1.5.5 | desktop | blocos 108 e 110 — Ollama pelo shell, novidades de versões puladas |
| 1.5.6 / 1.5.2 | desktop / celular (vc16) | blocos 109, 111–112 — slider do volume, interromper a fala, Modo foco |

### Bloco 95 — atualização automática pelas releases do GitHub ✅

**Como funciona.** Cada versão sai como release nos dois repositórios (`v1.5.0` etc.): o
instalador `ELYSIUM-Setup-x.y.z.exe` em `ZakWegues/elysium` e o `elysium-m-x.y.z.apk` em
`ZakWegues/elysium-m`. O PC (`src/services/atualizacao.ts`) confere as duas 90 s depois de
abrir e a cada 6 h, e baixa sozinho o que for novo para `%APPDATA%\elysium\atualizacoes\`,
apagando o que sobrou de versões antigas.

| lado | o que acontece |
|---|---|
| **PC** | Instalador baixado → balão uma vez por versão, pílula **"Atualizar"** na barra de abas e o botão **"Instalar e reabrir"** em Ajustes → Sobre (mais a madrugada, bloco 104). Instala com `/S --updated --force-run`: o NSIS roda em silêncio na mesma pasta da instalação e reabre o ELYSIUM sozinho. Em desenvolvimento (`!app.isPackaged`) recusa — substituiria a versão instalada |
| **Celular** | O PC guarda o APK da release mais nova e serve em `GET /api/update/apk` (token de sempre). O app pergunta `update.status`, compara com a versão **nativa** (`expo-application` — a do `app.json` embutido no JS mente depois de um OTA) e mostra o cartão "ELYSIUM-M x.y.z disponível" na Início (com "agora não", que vale só para aquela versão) e em Ajustes → Sobre ("Procurar versão nova" pede ao PC conferir na hora). "Baixar e instalar" puxa do PC com barra de progresso e abre o instalador do Android (`expo-intent-launcher`, `content://` com `FLAG_GRANT_READ_URI_PERMISSION`). Na primeira vez o Android pede "instalar apps desconhecidos" para o ELYSIUM-M — é do sistema, não tem como pular |
| **PC pelo celular** | `update.install` (destrutivo → biometria): Ajustes → Sobre do celular mostra a versão nova do PC já baixada, com **"Atualizar o PC"** |

**Por que sem `electron-updater`.** Ele exigiria `latest.yml` + blockmap em cada release e,
com repositório privado, um token gravado no `app-update.yml` dentro do instalador. O módulo
próprio tem ~350 linhas, nenhuma dependência nova, e o token nunca sai do userData.

**O token.** Os dois repositórios são privados. Vale, nesta ordem: o token colado em Ajustes
→ Sobre → "Token do GitHub" (guardado no `elysium-config.json` **ao lado da chave da Groq,
fora dos `overrides`** — por isso não viaja no backup nem aparece no diagnóstico) e, sem ele,
o login do `gh` desta máquina (`gh auth token`, cache de 1 h). Nesta máquina o `gh` está
logado, então **funciona sem configurar nada**. Para outro PC: token *fine-grained* só com
leitura de Contents nos dois repositórios. O risco de vazar é pequeno por construção: ele
dá leitura a um código que já está dentro do próprio instalador (o `app.asar` é JS puro).

**Integridade.** A API de download responde 302 para um endereço assinado do armazenamento
do GitHub; o redirecionamento é seguido **à mão**, para o token não ir junto para outro
domínio. O arquivo é conferido por tamanho e pelo **SHA-256 que o GitHub publica em cada
asset** (`digest`); não bateu, é apagado. O download vai para `.parcial` e só ganha o nome
final inteiro.

**Publicar uma versão** (nos dois repositórios, depois do commit e do push):

```
npm run dist && npm run release -- "o que mudou"            # elysium
npm run build:local && npm run release -- "o que mudou"     # elysium-m
```

O `publicar-release.mjs` recusa árvore suja, commit que não está no GitHub e arquivo
faltando; cria e empurra a tag `vX.Y.Z` antes (o GitHub só aceita alvo por SHA completo ou
branch — `--target` com SHA curto dá **422**). No celular ele ainda abre o APK com o `aapt2`
e confere `versionName`/`versionCode` contra o `app.json`: publicar um APK velho com a tag
nova faria todo celular "atualizar" para a mesma versão, em laço. As notas da release são o
que aparece no "Novidades" (bloco 101): escreva para o Zak, não para o git.

🔴 **Mudar `version` no `app.json` muda o fingerprint** (medido: `d33f466c…` → `92ada075…`).
Então versão nova do celular = APK novo, sempre. Mudança só de JS **sem** subir a versão
continua podendo ir por OTA (`npx eas-cli update --channel preview --environment preview`).

**Diagnóstico** ganhou a seção "Atualização"; **o log mascara** `ghp_…`, `gho_…`,
`github_pat_…`. `/api/health` devolve a versão do app em vez de um número escrito à mão
no `server.ts` (que já tinha ficado para trás uma vez).

**Verificado de ponta a ponta, nesta máquina, sem o Zak:**

| teste | resultado |
|---|---|
| dev 1.4.0 → achou a release `v1.5.0` privada pelo `gh`, baixou 79 MB, SHA-256 conferido | pílula "Atualizar" acesa |
| APK `v1.4.0` → guardado, `GET /api/update/apk` com token 200 (114,7 MB inteiro), sem token 401 | ✅ |
| 1.5.0 instalado por `/S --updated --force-run` | código 0, reabriu sozinho |
| **1.5.0 instalado → `update.status {verificar}` → `update.install` com confirmação** | baixou em 7,7 s; voltou como **1.5.1 em ~6 s** |
| **1.5.1 → 1.5.2**, mesmo caminho | voltou em 6 s |

⚠️ **O primeiro salto do celular é manual**: o APK vc13 não tem o atualizador. Instalar o
`elysium-m/dist-apk/elysium-m.apk` (1.5.1, vc15) uma vez.

### Bloco 100 — Armazenamento: o que ocupa o disco ✅

Nasceu de um número: **o C: desta máquina estava com 95–97% usado** (25 GB livres de 476).
A sugestão da Início já dizia "pouco espaço", mas não dizia onde nem oferecia nada.

`src/actions/armazenamento.ts` mede numa passada de PowerShell só: Downloads (total e os 8
maiores arquivos, recursivo), a pasta temporária do usuário e a Lixeira (somada por unidade,
na pasta `$Recycle.Bin\<SID>` do usuário atual). Cache de 5 min; duas telas pedindo juntas
esperam a mesma medição. **Medido aqui: Downloads 58,3 GB** (jogos portáteis e filmes 4K —
o maior, 17,1 GB), temporários 324 MB, Lixeira 375 MB.

| ação | como |
|---|---|
| Esvaziar a Lixeira | `Clear-RecycleBin -Force`, **destrutivo** (confirmação no PC, biometria no celular) |
| Limpar temporários | só o que não é tocado há **2 dias** — instalador ou programa rodando usa a pasta; arquivo em uso é pulado pelo Windows. Destrutivo |
| Downloads | **o app nunca apaga nada lá**: "Abrir" e, por arquivo, "mostrar na pasta" (`shell.showItemInFolder`) |
| Limpeza de Disco / Armazenamento do Windows | `cleanmgr.exe` e `ms-settings:storagesense` — alcançam o que o app não mexe |

O quanto foi liberado é medido **antes e depois**, não estimado. `storage.open {alvo:
"arquivo"}` recebe um caminho do cliente: ele é resolvido e **tem de continuar dentro de
Downloads** — testado com `..\..\AppData\…`, `C:\Windows\win.ini` e `../../.ssh/id_rsa`,
todos recusados.

Painel "Armazenamento" na aba PC dos dois lados. **Vigia do disco**: de hora em hora; disco
com ≥ 95% ou < 10 GB livres avisa no PC, no celular (entrega + push `anomaly`) — no máximo
uma vez por dia. A sugestão da Início ("Disco C com 25 GB livres") agora abre o painel
direto (`acao.painel`).

### Bloco 101 — Novidades depois de atualizar ✅

A primeira abertura de uma versão nova mostra, uma vez, as notas da release no topo da
Início (desktop: `#home-novidades`; celular: `NovidadesCelular`). As notas são guardadas na
hora de instalar; se a versão chegou por instalação manual, o desktop lê a release da própria
tag. `novidades.json` no userData (fora de `atualizacoes/`, que é limpa a cada verificação);
no celular, `elysium_novidades_v1`.

### Bloco 102 — o Windows subia a versão errada ✅ 🔴

Achado ao preparar a instalação: a entrada `HKCU\…\Run\ELYSIUM` apontava para
**`ELYSIUM\elysium baixado\ELYSIUM.exe` — uma cópia 1.0.2** —, enquanto o instalador (1.3.0)
morava em `%LOCALAPPDATA%\Programs\ELYSIUM`. As duas se chamam `ELYSIUM.exe` e a antiga
ainda existia no disco, então a regra do `autoLaunch.ts` ("reescreve se o caminho gravado
sumiu", §14) nunca agia: **a cada boot o Windows subia a 1.0.2**, que pegava o
single-instance lock. E havia ainda uma entrada `electron` que subia a **instância de
desenvolvimento** do repositório junto.

Agora: o app **empacotado** reivindica a entrada para o próprio `process.execPath` sempre
que ela aponta para outro lugar; a instância de **desenvolvimento** não registra nada e
apaga a entrada `electron` que as versões anteriores deixaram (só se ela aponta para
`node_modules\electron\`). Conferido: depois da 1.5.1, a entrada aponta para
`Programs\ELYSIUM\ELYSIUM.exe`; a do BlueStacks (`electron.app.BlueStacks Services`) ficou
intacta.

⚠️ **Para o Zak decidir** (não mexi — são dele): a pasta `elysium baixado` (1.0.2) não é mais
usada por nada; e há um `Jarvis PC.lnk` na pasta Inicializar apontando para
`C:\Users\ZAK\jarva\Iniciar Jarvis.vbs`, que não existe mais.

### Bloco 103 — o cérebro não cai mais em silêncio ✅

Visto ao testar: **o Ollama não estava rodando** (o atalho da Inicializar existe, mas depois
que ele cai nada o levanta). Todo pedido ia para a Groq, que estourava o teto de 8000
tokens/min do `gpt-oss-120b` em dois pedidos, e o app respondia **"Não entendi o que você
pediu"** — mandando o Zak repetir algo que estava certo.

- `src/services/ollamaVivo.ts`: Ollama **local** parado é levantado sozinho — no boot (se o
  roteador ou a conversa são `ollama`) e quando um pedido falha por conexão (`fetchOllama`
  no `llm.ts` sobe e repete uma vez). Prefere `ollama app.exe` (o mesmo do atalho, com ícone
  na bandeja), cai no `ollama serve`. No máximo uma tentativa por minuto; endereço remoto
  nunca é ligado. Conferido: dev aberto com o Ollama parado → `[ollama] estava parado;
  subindo por ollama app.exe` → de pé em segundos.
- `unknown` ganhou `motivo`: quando nenhum provedor responde, a fala é a causa ("a Groq pediu
  uma pausa de 11 segundos", "não consegui falar com o Ollama") — `motivoDaFalha()` no
  `brain.ts`.
- `[config] … foi desativado pela Groq` sai **uma vez por modelo**; antes repetia a cada
  `getConfig()` e soterrava o log (as sobreposições do Zak ainda guardam
  `llama-3.1-8b-instant`, curado para `gpt-oss-120b` em memória).

### Bloco 104 — madrugada e duas ferramentas ✅

- **Atualizar sozinho de madrugada** (Ajustes → Sistema, `atualizarDeMadrugada`, padrão
  ligado): a versão já baixada instala entre **3 e 5 h**, só com o PC parado há 15 min
  (`powerMonitor.getSystemIdleTime`) e o ELYSIUM ocioso. O botão quase nunca é clicado — o
  app vive na bandeja. `horaDeInstalarSozinho()` é pura e testada.
- Ferramentas de leitura **`espaco_em_disco`** e **`versao_do_elysium`** (também valem em
  condição de rotina). "O que está enchendo o disco?" → *"Os maiores arquivos estão na pasta
  Downloads, ocupando cerca de 58,3 GB…"*, "tem atualização?" → *"está na versão 1.5.1; é a
  mais nova publicada"* — os dois com o `qwen2.5:7b` local.

**Testes:** desktop 66 (novos: `atualizacao`, `armazenamento`, `cerebroFora`), celular 20.
O `backup.test.ts` era intermitente com a CPU ocupada (o lembrete "já passou" nascia com 50 ms
de folga e podia ser recusado como passado) — folga subiu para 400 ms.

**Só o Zak valida:**

- [ ] Celular: instalar o APK 1.5.2 (vc16) uma vez; depois, Ajustes → Sobre mostra "Celular
      na versão mais nova". Na próxima versão, o cartão aparece na Início e "Baixar e
      instalar" leva ao instalador do Android (a primeira vez pede "apps desconhecidos").
- [ ] Celular: aba PC → Armazenamento; "Atualizar o PC" em Sobre quando houver versão.
- [ ] PC: Início mostra "Novidades da 1.5.2" uma vez; aba PC → Armazenamento.
- [ ] Reiniciar o PC e conferir que sobe a 1.5.2 (Ajustes → Sobre), não a cópia velha.

### Bloco 105 — download em segundo plano (1.5.3) ✅

Revisão minha do `atualizacao.ts` achou dois defeitos. **"Verificar agora" esperava o
download inteiro** (80 + 115 MB): a tela ficava em "Procurando…" durante todo ele e o
"Procurar versão nova" do celular (30 s de prazo) estourava. E **uma verificação durante um
download limpava a pasta** — o `.parcial` em curso não está na lista de quem fica e seria
apagado debaixo do próprio download. Agora a verificação responde na hora
(`baixarPendentes` corre solto, progresso pelos eventos), não limpa nada com download em
curso e não zera a barra de quem está baixando. `update.status {aguardar: true}` espera o
download — só para diagnóstico e teste. No celular, Ajustes → Sobre diz "o PC está
baixando … N%" em vez de "versão mais nova" (OTA, runtime `e9f21d09…`).

### Bloco 106 — o que o log do app instalado contava (1.5.4) ✅

Olhar o log real (`%APPDATA%\elysium\logs`) achou duas coisas:

- 🔴 **`gpu-heavy.json` nunca foi copiado para o `dist`, desde o bloco 14.** O `gpuGuard`
  seguia "sem lista" em silêncio em todo build: com jogo aberto, o modelo local carregava
  na GPU mesmo assim. `copy-assets.mjs` corrigido; `tests/assets.test.ts` exige que todo
  JSON de `src/config` e todo HTML do renderer estejam lá (o teste pega o bug sem a
  correção). Conferido no `app.asar` da 1.5.4.
- **Modelo aposentado escolhido pelo usuário agora é trocado no disco.** As sobreposições
  do Zak guardavam `llama-3.1-8b-instant` (morto): o Ajustes mostrava um modelo que não
  existe e a cura rodava 65 vezes por dia no log. Padrões continuam fora do disco.

### Bloco 107 — card "Saúde do ELYSIUM" (desktop 1.5.4, celular por OTA) ✅

As falhas desta noite tinham uma coisa em comum: **nenhuma aparecia na tela**. O card
confere e diz, com o conserto de um clique quando existe:

| item | vermelho/amarelo quando | conserto |
|---|---|---|
| Cérebro local | Ollama parado / modelo não baixado | "Subir o Ollama" (fura a trava de 1/min) |
| Groq | sem chave / 429 nos últimos 10 min | — |
| Início com o Windows | a entrada aponta para outra cópia | "Corrigir" (`sincronizarInicioAutomatico`) |
| Versão | nova baixada / sem token / verificação falhou | "Instalar" (`update.install`) |
| Disco | ≥ 88% (aviso) ou ≥ 95% / < 10 GB (erro) | abre o painel Armazenamento |
| Celular | nunca pareado / sem falar há 3 dias | — |

Com tudo certo mostra só "Tudo certo." (a lista inteira seria ruído). `system.saude` e
`system.saude.consertar` no RPC; `avaliarSaude` é pura e testada, inclusive com o cenário
exato desta noite. Testado ao vivo: Ollama derrubado de propósito → card vermelho → botão →
Ollama de pé em segundos. No celular é o mesmo card, na ordem de fábrica depois de
"Este computador"; com PC anterior à 1.5.4 diz só que o PC não respondeu.

Números à brasileira (24,8 GB) nos cards de discos e do computador.

⏰ **Teste armado para a madrugada de 30/09**: o instalado (1.5.2) está com a 1.5.4 baixada.
Entre 3 e 5 h, com o PC parado, ele deve instalar sozinho — de manhã, Ajustes → Sobre
tem de mostrar 1.5.4 e a Início, "Novidades da 1.5.4". Se o PC dormir antes, instala na
madrugada seguinte (ou pelo botão).

### Bloco 108 — o Ollama que o ELYSIUM sobe não herda nada (1.5.5) ✅ 🔴

Achado ao rodar o scan de erros: a porta de depuração 9333 estava presa por um processo
que **já não existia**, e as ferramentas de teste penduravam. Quem segurava o socket era o
`ollama app.exe` — filho de uma instância de desenvolvimento morta. **`spawn` herda os
handles herdáveis do processo do Electron**, e o Ollama fica vivo por dias. O
`ollamaVivo.ts` passou a abrir o `ollama app.exe` por `shell.openPath` (ShellExecute, sem
herança, como um clique duplo); conferido que, matando o app, a porta é liberada e o Ollama
continua de pé. O `ollama serve` de reserva continua por `spawn` (não há como passar
argumento pelo shell). Regra: **processo de vida longa que o ELYSIUM abre vai pelo shell**.

### Bloco 109 — slider do volume do PC no celular ✅

Estava no backlog como "precisa de módulo nativo" — mas `gesture-handler` e `reanimated` já
estão no APK desde o bloco 51. `src/components/SliderVolume.tsx`: trilha com `Gesture.Pan`
(o toque simples também conta), polegar no shared value (sem render por quadro), no máximo
um `volume.set` a cada 150 ms durante o arrasto e o valor final ao soltar; a releitura só
vem ao soltar (reler a cada envio fazia o polegar pular para trás). Fica numa segunda linha
da faixa de mídia da aba PC; PC sem `volume.get` mantém os botões de passo.

### Bloco 110 — novidades de versões puladas (1.5.5) ✅

A madrugada pode levar da 1.5.2 direto para a 1.5.6: a Início junta as notas de cada versão
desde a última vista (ou a última que rodou — `rodando`/`anterior` no `novidades.json`), da
mais nova para a mais velha. `juntarNotas` é pura e testada.

### Bloco 111 — dizer "Elysium" interrompe a fala (1.5.6) ✅

C4 do catálogo. Com a palavra de ativação ligada, "Elysium" no meio de uma resposta falada
corta a fala e abre o microfone. Contra o ELYSIUM se interromper ouvindo a própria caixa de
som: durante a fala só vale confiança **alta** do reconhecedor (a média, que basta com a sala
quieta, pegaria palavra parecida), e nunca quando a frase em curso contém "Elysium"
(`podeInterromper`, testada). ⚠️ **Só o Zak valida** — precisa de voz de verdade.

### Bloco 112 — Modo foco (1.5.6 + card no celular) ✅

C9 do catálogo. Por N minutos, abrir um programa da lista (Discord, Steam, WhatsApp,
Telegram, Roblox, Epic, Riot — editável no card) vira balão no PC com o tempo que falta; com
"fechar" ligado, o programa é fechado. **Avisar é o padrão** — a pergunta que a §19 deixou
aberta: fechar à força perde trabalho não salvo. O fim fica em disco (reiniciar não cancela),
o que já estava aberto ao começar também conta, e o resumo ("50 min, 2 distrações") vai
também ao celular.

`src/services/foco.ts`; card na Início do PC; card no celular (nasce desligado, liga em
Personalizar); RPC `foco.status/start/stop/lista`; ferramenta `modo_foco`; e regras
**fechadas no `fastRoute`**, porque o modelo lia "**para** o modo foco" como preposição e
religava o foco. Testado ao vivo: o Mapa de Caracteres aberto durante o foco foi detectado
e fechado em até 15 s (o evento `app.abriu` do bloco 79 roda a cada 15 s).

> ⚠️ Para testar sem mexer nos apps do Zak use `charmap.exe`. O `notepad` deste Windows é
> app da loja: `Start-Process notepad` abriu um diálogo "Abrir com" na tela dele.

> 🔴 **Segurança da atualização automática, para não esquecer.** O PC instala o que estiver
> na release mais nova de `ZakWegues/elysium` — de madrugada, sem perguntar. O SHA-256 é
> conferido contra o `digest` do próprio GitHub, então protege contra download corrompido,
> não contra uma release maliciosa: **quem conseguir publicar release no repositório
> consegue rodar código no PC**. A barreira é a conta do GitHub (manter 2FA ligado) e o
> token (só leitura). Não há assinatura de código no instalador. Se um dia isso incomodar,
> o caminho é assinar o `.exe` e conferir a assinatura antes do `/S`, ou desligar
> "Atualizar sozinho de madrugada".

**Estado ao fim da noite de 29/09/2026:**

| | versão | onde |
|---|---|---|
| Desktop publicado | **1.5.6** | release `v1.5.6` |
| Desktop instalado aqui | 1.5.2, com a **1.5.6 baixada** esperando a madrugada | `%LOCALAPPDATA%\Programs\ELYSIUM` |
| Celular publicado | **1.5.2 (vc16)** | release `v1.5.2`; também em `elysium-m/dist-apk/elysium-m.apk`, e guardado no PC |
| OTA (`preview`) | runtime `7eafb909…` (APK 1.5.2): card Modo foco | — |

Testes: desktop 82, celular 20.

**Só o Zak valida (atualiza o checklist acima):**

- [ ] De manhã: Ajustes → Sobre mostra **1.5.6** (instalou sozinho de madrugada) e a Início
      mostra "Novidades da 1.5.6" com as notas de 1.5.3 a 1.5.6. Se ainda estiver 1.5.2
      (PC dormiu), a pílula "Atualizar" instala.
- [ ] Celular: instalar o APK **1.5.2 (vc16)** uma vez (o vc13 não tem o atualizador).
- [ ] Modo foco: começar 25 min e abrir o Discord — balão no PC.
- [ ] Palavra de ativação ligada: pedir algo longo e dizer "Elysium" no meio da resposta.
- [ ] Celular: slider do volume na aba PC.

---

## 31. Fase 13 — blindar, mais inteligente, mais alcance (blocos 113–125)

> Em 30/09/2026 o Zak perguntou "e agora, o que fazer com o projeto?" e escolheu **as três
> direções juntas, uma de cada vez**: blindar o que existe (Parte A), deixar mais
> inteligente (B), dar mais alcance (C) e fechar com uso real para calibrar (D). Fora de
> casa **continua pelo Tailscale** — decisão dele: a porta do PC nunca vai para a internet.
>
> Antes de tudo (Parte 0), o ELYSIUM passou a conhecer o Zak: um perfil com 14 fatos foi
> carregado **na memória do app** (`memory.add` no PC instalado, a tela "O que ele lembra").
> **Decisão do Zak: dado pessoal fica só na memória do app — nunca no código, no git, no
> handoff, em teste ou em bancada.** Por isso o conteúdo não está aqui; o backup (bloco 96)
> já leva a memória. Pelo mesmo motivo o exemplo de `remember` do `routerPrompt.ts`, que
> usava o bairro real dele, virou um endereço genérico.

### Bloco 113 — backup das chaves de assinatura ✅ (o backup em si é do Zak)

`scripts/backup-chaves.ps1 -Destino <pasta>`: copia o keystore do APK e o `.properties`,
exporta o certificado do instalador (bloco 115) para `.pfx` com senha pedida na hora,
confere tudo (hash igual, o keystore copiado **abre** com a senha, o `.pfx` abre e tem a
mesma impressão digital) e anota em `%APPDATA%\elysium\backup-chaves.json`. O card Saúde
avisa "sem backup" (ou backup com mais de 6 meses). Nada disso vai para o git.

Por quê: sem a chave do APK nenhuma versão nova instala por cima — o atualizador do
celular morreria; sem o certificado, uma reinstalação do Windows faria toda versão nova
do PC ser recusada pelo próprio atualizador. Rodar **duas vezes**: pendrive e nuvem.

### Bloco 114 — CI no GitHub Actions ✅

`.github/workflows/check.yml` nos dois repos: `npm ci && npm run check` a cada push na
`main` (desktop em `windows-latest` com `ELECTRON_SKIP_BINARY_DOWNLOAD`; celular em
`ubuntu-latest`, com o `expo export`). Verde de primeira nos dois; **vermelho provado** com
um teste quebrado de propósito numa branch descartável (apagada). O `publicar-release.mjs`
dos dois recusa publicar se o check do `HEAD` não terminou ou não passou (`--sem-ci` para
emergência).

### Bloco 115 — instalador assinado, conferido antes de instalar ✅ 🔴

Fecha a brecha registrada no bloco 112 (release publicada por outra pessoa no repositório
instalaria sozinha, de madrugada).

- Certificado de assinatura de código **autoassinado** `CN=ELYSIUM (Zak)`, 3072 bits, até
  2036, em `Cert:\CurrentUser\My` — impressão digital `D4D614A8…` fixada em
  `ASSINATURAS_ACEITAS` (`atualizacao.ts`). Lista, não constante: numa troca de chave a
  versão de transição aceita as duas.
- `npm run release` (desktop) assina com `Set-AuthenticodeSignature` + carimbo de tempo
  (DigiCert; a assinatura segue válida depois de 2036) e confere antes de subir, lendo a
  impressão digital do próprio `atualizacao.ts` (não há `signtool` nesta máquina).
- O atualizador confere depois do download e de novo no ponto único de instalação
  (botão, celular, madrugada). Estados medidos aqui: autoassinado intacto =
  **`UnknownError`** (raiz não confiada — aceito, de propósito: instalar a raiz nas lojas de
  confiança seria mexer em segurança do sistema, e o pino da impressão digital resolve);
  adulterado = `HashMismatch`; sem assinatura = `NotSigned`. Falhou → apaga o arquivo, não
  instala, card Saúde **vermelho**. `assinaturaConfere` é pura e testada.
- **Provado ponta a ponta**: 1.5.6 → 1.6.0 (a primeira assinada; a 1.5.6 ainda não
  conferia) e **1.6.0 → 1.6.1 conferindo a assinatura**, em 4 s.

⚠️ O certificado só existe nesta máquina até o Zak rodar o backup. Perdido, as versões
novas passam a ser recusadas; a saída é instalar uma versão à mão (que traz a impressão
digital nova).

### Bloco 116 — números para calibrar ✅

- Celular: cada rodada da mão livre vira uma linha (`src/lib/maoLivreDiag.ts`,
  `resumoRodada`, pura e testada) — pico/mediana em dB, tempo até a fala, motivo de parar,
  duração, tamanho da transcrição (nada do que foi dito) — enviada ao fim da conversa pelo
  RPC novo **`diag.registrar {origem, linhas}`** (teto 20×300, passa pelo `mascarar`).
  Vai por OTA (runtime `7eafb909…`, APK 1.5.2).
- PC: a palavra de ativação registra se, depois de acordar, veio pedido ou foi disparo
  **falso**.
- É o insumo do bloco 125 (ajustar −38/−46 dB, 1,3 s e a confiança com número).

Testes: desktop 86, celular 22.

### O nome sai do código (entre as Partes A e B) ✅

Pela mesma regra da Parte 0, o nome do dono estava fixo em sete lugares — saudações da
Início e do chat, prompts do agente, da conversa, da condição de rotina e do resumo do
histórico, e a saudação do celular. Agora é o ajuste **`nomeDoUsuario`** (Ajustes →
Conversa → "Como te chamar"), guardado nos dados do app; `nomeDoUsuario()` em `config.ts`
devolve "usuário" quando vazio. O celular recebe por `pairing.endpoints` (`nome`) e guarda
em `elysium_nome_do_usuario_v1` para funcionar sem rede. Nesta máquina o valor já foi
gravado; a tela não mudou.

## Parte B — mais inteligente

### Bloco 117 — resumo do dia ✅

`src/services/resumoDoDia.ts`: "bom dia", "resumo do dia", "como está meu dia", "o que tenho
pra hoje" (regras fechadas no `fastRoute`, ação `daily_summary`) e a ferramenta
`resumo_do_dia`. Montado **sem modelo**, só com o que o app sabe — clima, agenda (bloco
120), lembretes e rotinas de hoje, recados não lidos do celular, o que o card Saúde acusa,
versão nova. Sai em menos de um segundo e não inventa lembrete. `montarResumo` é pura.

"Resumo do dia pela manhã" (`resumoAutomatico`, Ajustes → Voz, **padrão desligado**): fala
sozinho na primeira volta ao PC entre 6 e 11 h — fim de 1 h+ ociosa, destravar a tela ou
voltar da suspensão —, uma vez por dia (`resumo-do-dia.json`), e manda ao celular.

### Bloco 118 — memória que aprende, com aprovação ✅

- 60 fatos guardados, **12 no prompt** — os que dividem radicais (4 letras, sem acento) com
  o pedido, recentes no desempate (`escolherFatos`, pura). O prompt do modelo local não
  cresce com cada fato.
- `src/services/aprendizado.ts`: quando a conversa esfria (`chatIdleResetMs` + 5 s), uma
  chamada lê **só as falas do usuário** (nunca as respostas, que podem ter inventado) e
  propõe até 3 fatos estáveis. Viram **sugestões** — card "Aprendi isto" no PC e no celular,
  guardar/descartar; recusado não volta; parecido com fato guardado (60% dos radicais) não
  é sugerido. RPC `memory.sugestoes/aceitar/recusar`.
- Testado ao vivo (frase inventada, limpa depois): "meu peixe se chama Bolota, um betta
  azul" → *"O usuário tem um peixe chamado Bolota que é um betta azul."*

### Bloco 119 — tarefas de vários passos ✅

Pedido com 3+ partes (`contarPassos`: vírgula, "e", "depois", "então", "também") entra em
modo tarefa: até 6 rodadas, uma volta por parte, e a cada volta o modelo recebe o pedido
inteiro de novo ("continue o MESMO pedido… se tudo foi feito, responda pronto") — o 7B
esquecia o resto depois da primeira ação. Resposta em lista ("Feito:" + um item por passo);
a voz tira os marcadores. 1–2 partes seguem como antes. Testado com o `qwen2.5:7b`: criar
lembrete + cancelar + clima → as três em ordem, "pronto", nada sobrando.

### Bloco 120 — Google Agenda, só leitura ✅ (falta o Zak criar o cliente OAuth)

`src/services/agenda.ts`: OAuth de app para computador com servidor temporário em
`127.0.0.1` (porta livre, **não** a 4200), PKCE S256 e `state`; escopo `calendar.readonly`.
Cliente (ID + segredo) em `elysium-config.json` ao lado da chave da Groq (fora do backup);
refresh token em `agenda.json`; `invalid_grant` desconecta. Ajustes → Google Agenda traz o
passo a passo do Google Cloud; card "Agenda de hoje" (liga em Personalizar); ferramenta
`agenda` (hoje/amanhã/semana); agenda no resumo do dia; aviso 10 min antes de cada
compromisso no PC e no celular. RPC `agenda.status` e `agenda.dia`. `interpretarEventos`
é pura (dia inteiro = meia-noite local).

Versões: desktop **1.6.2** (instalado; 117–119), 120 entra na próxima. Testes: desktop 100,
celular 22.

## Parte C — mais alcance

### Bloco 121 — vários PCs no mesmo celular ✅

`elysium-m/src/lib/pairing.ts` virou um cofre em chave **nova** (`elysium_pairings_v1`,
até 5 PCs) com o PC ativo; `loadPairing`/`savePairing`/`clearPairing` passam por ele e
continuam gravando a chave antiga (regra: chave do AsyncStorage não se renomeia por OTA —
quem já estava pareado não migra nada). `idDoPc` é o hostname normalizado; `src/lib/pcAtivo.ts`
dá `chavePorPc(base)` — conversas, fila de comandos, Caixa, notificações e o desligamento
agendado ganharam sufixo por PC (o PC que já existia continua na chave sem sufixo). Ajustes →
Pareamento lista os PCs, troca com um toque, "Parear outro PC" (o QR abre com Cancelar) e
"Esquecer este PC". `TelaAnimada key={idDoPc}` remonta tudo ao trocar (WebSockets e caches
são do PC). 401 abre o leitor de QR daquele PC sem apagar os outros. Teste `variosPcs`.

### Bloco 122 — Tailscale melhor (nada exposto na internet) ✅

PC: `src/services/tailscale.ts` lê `tailscale status --json` (`interpretarStatus` é pura) e
o card Saúde ganhou o item "Tailscale": parado no PC (conserto "Abrir o Tailscale"), ou
**o celular desligado nele, com o nome do aparelho e há quanto tempo** — no dia em que isto
foi escrito o do Zak estava desligado havia 35 dias (§12: o HyperOS mata o app e o ícone
de VPN continua na barra). Celular: com túnel no pareamento, a faixa de conexão diz "PC
fora de alcance — fora de casa? confira o Tailscale" e o botão abre o app dele
(`com.tailscale.ipn`, ou a loja).

### Bloco 123 — widgets e atalhos ✅

Widget **Foco** (4×1: começar 25/50 min, ou quanto falta e parar) e widget **Saúde** (3×1:
bolinha e o pior item), em `widgets.tsx`/`handler.tsx`, atualizados junto com os outros.
Atalhos do toque longo no ícone via `expo-quick-actions` (nativo → APK): falar com o
ELYSIUM, resumo do dia (126), modo foco de 25 min, buscar. Não uso o
`useQuickActionCallback` da lib: ele refaz o efeito a cada callback novo e dispararia o
atalho inicial de novo; o atalho que abre o app frio espera o pareamento carregar (ref).

## Parte D — versões e uso

### Bloco 124 — versões ✅

Desktop **1.7.0** (assinada, CI verde; leva 120 e 122) publicada e instalada por
`update.install` — a verificação de assinatura do bloco 115 passou em produção. Celular
**1.7.0 / versionCode 17** (APK: 121 e 123 mudaram o nativo), publicado com CI verde.
⚠️ Para instalar o dev por cima não dá: um electron de dev esquecido segura a porta 4200 e
o instalado sobe sem servidor — `update.status` respondia pelo dev ("pc":"1.6.2") e
`update.install` recusava ("em desenvolvimento"). Fechar o dev antes.

### Bloco 125 — uso real e calibragem ⏳ (do Zak, 1–2 semanas)

Com os números do 116 no log do PC (`[celular]` mão livre; disparos/falsos da palavra de
ativação), ajustar limiares e confiança. Revisar o card Saúde.

## Extras da noite de 30/09 (pedido do Zak: "faz tudo que você tiver de ideia")

### Bloco 126 — card Hoje, consertos visuais, poda de instaladores ✅ (desktop 1.7.1)

- RPC `resumo.dia` → `{texto}` (o mesmo do "bom dia"); card **Hoje** na Início dos dois
  lados (no celular com Ouvir) e atalho "Resumo do dia" no ícone.
- Card novo de fábrica entra ao lado do vizinho na ordem de fábrica, não no fim (PC e
  celular) — antes o Hoje nasceria depois de Discos.
- Alertas do resumo: "título: detalhe" com ponto e vírgula; antes saía "Disco C (26 GB
  livres (94% usado))".
- Novidades da versão: `**negrito**` e itens `- ` das notas do GitHub formatados.
- Abas e o "nublado" do chip do clima no tema ELYSIUM: o `--muted` #5a5d7a sumia sobre a
  parte dourada do fundo ("Ajustes" ilegível); agora o branco translúcido da busca.
- `publicar-release.mjs` (desktop) apaga de `release/` os instaladores além do atual e do
  anterior — havia 23 (1,7 GB) com o C: a 94%.
- Exemplos com o nome do Zak e o modelo do celular (comentários, testes, §12 deste
  documento) viraram genéricos — regra da Parte 0.
- Log de eventos sem o título da janela: o `app.abriu` gravava no arquivo o vídeo que estava
  aberto no Chrome. A rotina continua recebendo o evento inteiro.
- 1.7.1 publicada e instalada por `update.install`; a poda apagou 20 instaladores (1,5 GB).
  Celular: OTA do 126 publicada para o runtime do APK 1.7.0.

Medição do C: em 30/09 (só leitura): Downloads ~54 GB (uma pasta de ~40 GB), modelos do
Ollama ~11 GB, `node_modules` do celular ~7 GB, BlueStacks ~8 GB, Gradle ~4 GB.

### Bloco 127 — servidor do celular tenta de novo com a porta ocupada ✅ (desktop 1.7.2)

Achado do bloco 124: com a 4200 ocupada o app subia **sem servidor e calado** (o
`EADDRINUSE` só virava um `console.warn` e desistia). `server.ts` agora guarda
`estadoDoServidor()` e, com a porta ocupada, tenta de novo a cada 30 s (`server.close()` +
`listen`, timer `unref`). O card Saúde ganha "Conexão com o celular" em **vermelho** com o
motivo enquanto não sobe. Testado ao vivo: um servidor falso segurou a 4200 por 75 s → o
item apareceu; liberada → "listening" sozinho e o RPC pela porta respondeu. 1.7.2
publicada e instalada por `update.install`.

Bancada do agente depois da fase 13 (`bench-agente.mjs --modelos qwen2.5:7b`, 1 repetição):
**15/20 (75%)**, p50 0,97 s — dentro do ruído dos 80% de 20/09 (3 repetições), com os
mesmos erros de sempre (condicional, "tudo menos o VS Code", "horas em Tóquio" vira clima)
mais "volume 40 e toca Radiohead" pela metade. Sem regressão visível. (A bancada reproduz
o laço antigo de 4 rodadas, não o modo tarefa do 119.)

Disco C às 23h40 de 30/09: **21,5 GB livres (95,5%)**. O que cresceu na noite não foram os
builds (Gradle, `android/`, `release/` iguais ou menores) e sim o `pagefile.sys` (13,5 GB,
RAM a ~90%); `hiberfil.sys` tem 6,4 GB. Os dois são do Windows — fica para o Zak decidir
(`powercfg /h off` desliga a hibernação e devolve os 6,4 GB).

## 32. Fase 14 — inteligência, design e coisas novas para fazer (blocos 128–139)

> Em 01/10/2026 o Zak instalou o APK 1.7.0 e disse: falar "Elysium" não faz nada; **nada na
> pasta Downloads pode ser alterado**; **sem Google Agenda e sem Tailscale agora**; tirar
> totalmente o vidro líquido dos temas ELYSIUM do celular (só um blur levíssimo); e mais
> inteligência e mais coisas para fazer nos dois lados, olhando o que se elogia em outros
> assistentes. Pesquisa: ChatGPT (memória, projetos, tarefas), Raycast (Quick AI, AI
> Commands sobre texto), Perplexity (respostas com fontes), Alexa/Gemini (listas, timers,
> rotinas, resumo do dia). Ele escolheu os quatro grupos: respostas melhores, listas e
> timers, comandos de IA, jeito de responder.
>
> **Downloads é intocável**: conferido que `storage.clean` só mexe em Lixeira/temporários e
> que `espaco_em_disco`/Armazenamento só leem e abrem (o "mostrar arquivo" só aponta).

### Bloco 128 — tema ELYSIUM sem vidro; Tailscale e Agenda fora do caminho ✅

- `GlassSurface.tsx`: na família noite sai o fio especular das arestas e a borda de vidro
  do `GlassCircle`; blur fixo em 6 (`BLUR_NOITE`). `palettes.ts`: `glassSheen` da noite
  transparente (zera o reflexo do modal/popover), `glassBorder` = `border` (0,10), tinta
  0,84/0,90 (painel quase sólido). O pedido de 18/09 (bloco 70) tinha ficado pela metade.
- Config `acessoRemotoNaSaude` (padrão **desligado**, Ajustes → Sistema): sem ela o card
  Saúde e o resumo não falam do Tailscale; `pairing.endpoints.acessoRemoto` faz a faixa do
  celular voltar a "PC fora do ar / Procurar". Ajustes → Google Agenda foi para o fim.

### Bloco 129 — "Elysium" no celular, com o app aberto ✅ (APK)

O celular nunca teve palavra de ativação (só a mão livre por botão), e a do PC está
**desligada** na config do Zak (`palavraDeAtivacao: false`) — ninguém escutava. Escolha
dele: no celular, só com o app na tela.
- `expo-speech-recognition` (SpeechRecognizer do Android), modo contínuo (Android 13+, e o
  contínuo usa fonte de áudio própria — some o bipe), no aparelho quando o pt-BR estiver
  baixado; `contextualStrings: ["Elysium"]`.
- `palavraCasa.ts` (puro, testado): acha "elysium/elísio/ilísio/elisium/e lísio…" sem
  disparar com "é liso", Elisa ou Eliseu (nome de gente fica de fora de propósito); o que
  vem depois é o pedido ("Elysium, pausa a música" → primeira rodada da mão livre).
- `microfone.ts`: ocupantes do microfone (palavra, mão livre, gravar, fala). O reconhecedor
  só escuta com o microfone livre, na Início/Chat, app na frente e Ajustes fechado; ao
  ouvir, é abortado ANTES de a mão livre gravar (300 ms de respiro).
- Religa sozinho com recuo (0,5 s dobrando até 30 s em erro); desiste sem permissão ou sem
  serviço. Números de cada escuta vão ao log do PC (`[celular] palavra-cel`).
- Ajustes → Voz: "Ouvir 'Elysium'" (ligado por padrão).

### Bloco 130 — chat escrito responde como chat ✅

- `estiloResposta.ts` (puro): **canal** voz/texto. Voz continua "1 a 3 frases, sem
  markdown, 300 tokens"; texto = markdown quando ajuda, tamanho pela pergunta, ~1500 tokens.
  `executarComando({canal})`: dashboard digitado e celular digitado (`WS {canal:"texto"}`,
  `/api/command {canal}`) = texto; o resto (microfone, áudio, rotinas, PC antigo) = voz.
- A caixa de som lê só o começo de uma resposta escrita longa (`paraFala`, "o resto está na
  tela") — dashboard e celular.
- Achado: o qwen 7B respondia direto em vez de "CHAT" e esse texto virava a resposta sem o
  prompt do canal. Resposta sem ter olhado nada agora vai para a `composeChatReply`.
- Achado: "quanto de memória o PC está usando" chamava a ferramenta de **fatos** — as
  descrições de `memoria`/`estado_do_pc` dizem o que é RAM. Fala em segunda pessoa.
- Celular: markdown nas bolhas (`lib/markdown.ts` + `components/Markdown.tsx`, sem lib
  nativa), toque longo = Copiar / Ouvir / Refazer (WS `refazer` desfaz o turno no PC).

### Bloco 131 — busca com fontes ✅

`contextoComando.ts` (AsyncLocalStorage) leva canal e fontes pelo pedido inteiro.
`webSearch.extrairFontes` lê `executed_tools[].search_results` do `browser_search` (as
páginas ABERTAS primeiro, um link por site) e tira as marcas "【0†L6-L11】". Fontes viram
chips: dashboard (`chat:extras`) e celular (campo `fontes` no reply do WS).

### Bloco 132 — sugestões de próxima pergunta ✅

`continuacoes.ts`: depois de conversa/busca ESCRITA, 3 perguntas em JSON (validação pura);
chegam depois da resposta (dashboard `chat:extras`, celular `{type:"sugestoes"}`) e somem
ao mandar outra coisa.

### Bloco 133 — buscar dentro das conversas ✅

`buscaConversas.ts` (puro, nos dois repos): todas as palavras, sem acento, um trecho por
conversa. RPC `chat.search`; paleta Ctrl+K grupo "Dentro das conversas"; celular, campo na
tela Conversas. **Retomar a conversa depois de reiniciar ficou de fora**: o histórico do
cérebro zera sozinho após 5 min parado (`chatIdleResetMs`), então quase nunca valeria.

### Bloco 134 — jeito de responder ✅

Config `estiloResposta` (direto/equilibrado/detalhado) e `instrucoesPessoais` (texto
livre, 1500) — **dado pessoal, só na config do app**. Entram no prompt da conversa e do
agente. Ajustes → Conversa (PC, campo novo tipo "area") e Ajustes → Jeito de responder
(celular, RPC `perfil.get/set`).

### Blocos 135 e 136 — listas e timers ✅

- `listas.ts` (puro + store `listas.json`, entra no backup): nome normalizado (mercado =
  Compras, afazeres = Tarefas), sem duplicar, item marcado volta a pendente. "põe leite,
  ovo e café na lista do mercado" no **fastRoute** (texto original, com acento; "lista de
  reprodução" fica de fora). Ferramentas `adicionar_na_lista`, `ver_lista`, `marcar_item`,
  `limpar_feitos`; RPC `listas.*`; card Listas nos dois lados.
- `timers.ts`: "timer de 10 minutos do miojo", vários, persistidos (vencido há mais de 5
  min ao reabrir sai sem aviso). Ao acabar: notificação, fala, entrega ao celular. fastRoute
  + ferramentas `criar_timer/ver_timers/cancelar_timer`; RPC `timers.*`; card Timer do PC
  mostra os com nome; card Timers no celular com contagem ao vivo.

### Blocos 137 e 138 — comandos de IA, calculadora, resumir link ✅

- `comandosIa.ts`: corrigir, traduzir (en/pt), resumir, mais formal, mais curto, explicar
  + os do Zak (Ajustes → Comandos de IA). PC: paleta Ctrl+K sobre o texto copiado →
  resultado na área de transferência; ferramenta `comando_de_ia`. Celular: compartilhar
  texto/link → "Usar IA"; "/" no chat.
- `calculadora.ts` (sem eval): "quanto é 15% de 230" no fastRoute; o agente usa `calcular`
  em vez de conta de cabeça. ⚠️ `\b` não funciona depois de "é" sem a flag `u` — use
  `(?=\s|$)`.
- `leitorDeLink.ts`: só http(s) **público** (nada de localhost/rede local/100.64), tira
  script/menu/rodapé, prefere `<article>`; resume curto na voz ou em tópicos no chat.

### Bancada do agente depois da fase 14 — e dois consertos que ela achou ✅

Com 48 ferramentas, a primeira medição caiu para **65%** (1 rep.) / **73%** (3 rep.). Não
era contexto (o prompt + ferramentas dá ~4,6 mil tokens, cabe nos 8192): o qwen2.5 passou a
**escrever as chamadas como texto** em vez de tool_calls — `midia({"operacao": "pause"})` e
até o abreviado `volume 40` / `tocar_musica Radiohead`. `chamadasEmTexto` (agente.ts, pura,
testada) reconhece os dois formatos quando TODO o texto é isso e os nomes existem; no
abreviado o valor vai ao parâmetro principal. A bancada usa a mesma função.

E "que horas são em Tóquio" (que virava o clima de Tóquio) agora é `horaMundo.ts`: ~30
cidades/países → fuso pelo `Intl`, no fastRoute e na ferramenta `hora_em`.

**Medido em 01/10/2026, qwen2.5:7b, 3 repetições: 51/60 (85%)**, p50 0,95 s — acima dos 80%
de 20/09. Sobram os três limites de 7B de sempre: condicional ("se a calculadora estiver
aberta", "se estiver tocando"), e "fecha tudo menos o VS Code". O caso "quanto é 15% de
200" passou a esperar a ferramenta `calcular` (antes esperava CHAT).

### Bloco 139 — versões ✅

Desktop **1.8.0** (assinada, CI verde) publicada e instalada por `update.install`; card Saúde
sem o Tailscale. Celular **1.8.0 / versionCode 18** (APK — o 129 trouxe módulo nativo).
Testes: desktop 140, celular 38. Só o Zak: instalar o APK, dar a permissão de reconhecimento
de fala, conferir o tema e dizer "Elysium" com o app aberto.
