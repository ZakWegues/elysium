# NEUROAXIS — Handoff para nova sessão

> Cole este arquivo inteiro numa conversa nova do Claude Code aberta em `c:\Users\ZAK\neuroaxis` pra retomar de onde parou.

## O que é o projeto

App desktop Electron + TypeScript para Windows chamado **NEUROAXIS** (nome original na spec: "Jarvis PC", `CLAUDE.md`). Assistente de voz pessoal em PT-BR: atalho `Ctrl+Shift+J` → grava mic → transcreve via Groq Whisper → decide ação via Groq Llama (JSON, sempre `{"actions":[...]}`) → executa ação real no Windows → fala resposta em voz. Roda como ícone de bandeja, uso pessoal real (não protótipo).

**Documento de arquitetura completo:** `CONTEXTO_NEUROAXIS.md` (na raiz do repo) — stack, fluxo, árvore de arquivos, `BrainAction` inteiro, decisões técnicas. Este handoff é o resumo operacional; pra entender o "porquê" de algo, olha lá primeiro.

**Repo irmão:** `neuroaxis-portal` (GitHub privado, `ZakWegues/neuroaxis-portal`) — app mobile companion, código separado, sessão de Claude separada. Se conecta no desktop via HTTP+WS local (porta 4200).

**Dev:** `npm run dev` | **Build:** `npm run build` | **Rodar direto:** `npm start` (console visível — necessário pra ver logs `[STT]`/`[WS]`/`[TTS]`)

---

## Estado do git — LEIA ANTES DE MEXER

- Branch `main`, 2 commits (`c3f8c3d` initial, `e7946f1` redesign UI + presets por voz + fix TTS), ambos com push feito.
- **Working tree tem MUITA coisa não commitada** (`git status --short`):
  ```
  M HANDOFF.md
  M package-lock.json
  M package.json          (+ qrcode, + @types/qrcode)
  M src/actions/router.ts
  M src/main/config.ts
  M src/main/main.ts
  M src/renderer/config.html
  M src/renderer/dashboard.html
  M src/renderer/preload-dashboard.ts
  M src/services/brain.ts
  M src/services/server.ts
  M src/services/stt.ts
  ?? src/actions/sendToMobile.ts
  ?? src/main/network.ts
  ?? src/services/mailboxStore.ts
  ```
- `npm run build` passa limpo nesse estado.
- **NÃO commite por iniciativa própria** — o usuário indica explicitamente quando quer ("commita tudo" é a frase dele).

---

## Trabalho feito (ordem cronológica, tudo ainda não commitado)

### 1. Pareamento com o NEUROAXIS Portal (mobile)

Aba 📱 "Parear celular" na gaveta direita do dashboard:
- QR code (lib `qrcode`) com `{"ip","port":4200,"token"}`.
- IP local via `src/main/network.ts` (novo) → `getLocalIPv4()`.
- Token via `getOrCreateServerToken()`; botão "Regenerar token" → `regenerateServerToken()` (`config.ts`).
- `server.ts`: token virou variável mutável (`activeToken` + `export function setActiveToken()`), chamada pelo `main.ts` após regenerar — invalida pareamentos antigos **na hora**, sem reiniciar o app.
- IPC: `pairing:get-info`, `pairing:regenerate-token`. Preload: `nx.getPairingInfo()`, `nx.regenerateToken()`.

### 2. Robustez de STT

`src/services/stt.ts`: detecta formato real do áudio pelos **magic bytes** (`detectAudioType()`) em vez de sempre rotular `audio.webm` pra Groq. Instrumentação de log adicionada (tamanho, formato, erros de rede/HTTP/JSON). Na prática a Groq já decodificava certo mesmo com rótulo errado — é correção de robustez, não era a causa de bug.

### 3. Mailbox assíncrono → virou "chat comigo mesmo" (thread única)

**`src/services/mailboxStore.ts` (novo)** — electron-store `"mailbox"`, uma **thread única** `messages[]`, cada item:
```ts
{ id, from: "pc"|"mobile", kind: "link"|"note"|"file", text, attachment, createdAt, readAt }
```
- API: `addMessage(from, input)`, `listMessages()` (HTTP/mobile — **sem** `filePath`), `listMessagesForDesktop()` (IPC — **com** `filePath`), `getMessageContent()`, `ackMessage()`, `checkAndMarkUnseenFromMobile()` (boot-check), `inferKind()` (`^https?://` → link, senão note), `isKnownAttachmentPath()` (valida que o path está dentro de `mailbox-attachments/` antes de qualquer operação de arquivo via IPC).
- Anexos: conteúdo em disco em `userData/mailbox-attachments/<id>-<nomeSanitizado>`, **nunca** dentro do JSON do electron-store. Cap 5 MB (`MAILBOX_MAX_ATTACHMENT_BYTES`), `AttachmentTooLargeError` → HTTP 413.
- `mailboxEvents` (EventEmitter) dispara `"new-message"` a cada adição → `main.ts` encaminha pro renderer via IPC `mailbox:new-message`.

**Endpoints HTTP (`server.ts`, mesmo Bearer token de sempre):**
```
POST /api/mailbox/messages              → cria mensagem from:"mobile", 201 { id, createdAt }
GET  /api/mailbox/messages              → thread completa (metadados, sem base64)
GET  /api/mailbox/messages/:id/content  → conteúdo completo (com base64 do anexo)
POST /api/mailbox/messages/:id/ack      → seta readAt, { ok: true }
```
⚠️ **Isso substituiu um contrato anterior** (`/api/mailbox/outbox` + `/api/mailbox/inbox`). Um handoff descrevendo o contrato novo já foi entregue pra sessão do `neuroaxis-portal`. Schema do electron-store mudou (`{outbox,inbox}` → `{messages}`), dados de teste antigos não migram.

**Broadcast WS opcional:** `{type:"mailbox_new", direction:"toMobile"|"toDesktop", id}` no mesmo canal do telemetry, a cada mensagem nova. Só otimização de UX — os endpoints REST funcionam sozinhos.

**Boot-check (`main.ts`):** depois do `startServer()`, `checkAndMarkUnseenFromMobile()` marca `readAt` nas mensagens do celular não vistas e dispara `notify()` com preview.

### 4. Ação de voz `send_to_mobile`

- `brain.ts`: novo membro no union `BrainAction` → `{ action: "send_to_mobile"; content: string; kind?: "link"|"note" }`. Prompt atualizado com regra + 3 few-shots ("manda isso pro meu celular: …", "manda esse link pro celular: https://…", "envia uma nota pro celular dizendo …"). `actionSummary()` cobre o caso.
- `src/actions/sendToMobile.ts` (novo): infere `kind` se omitido, chama `addMessage("pc", …)` + `broadcastMailboxEvent("toMobile", id)`, retorna "Mandei pro seu celular."
- `router.ts`: `case "send_to_mobile"` roteado.

### 5. Chat duplo no dashboard (IA / Eu mesmo)

- Toggle 🤖 IA / 📱 Eu mesmo acima da timeline central (`#chat-mode-tabs`, `chatMode` state).
- Modo "Eu mesmo" usa `#timeline-self`, carrega via IPC `mailbox:get-thread` na primeira troca de aba, atualiza ao vivo via `mailbox:new-message`. Mic escondido nesse modo (voz sempre vai pro brain).
- Envio: IPC `mailbox:send` → `addMessage("pc", …)` **direto**, sem passar pelo brain (chat casual não deve virar comando).
- Bolhas: `from:"pc"` à direita, `from:"mobile"` à esquerda.

### 6. Preview de anexos no chat

- Imagem (`mimeType` começa com `image/`): thumbnail 220×220 inline via `file://<filePath>`, com barra de ações no hover — **Copiar** (`nativeImage` + `clipboard`) e **Baixar** (`dialog.showSaveDialog` + `fs.copyFileSync`).
- Não-imagem (pdf etc): chip clicável que abre via `shell.openPath`.
- IPC novos: `mailbox:copy-image`, `mailbox:save-as`, `mailbox:open-attachment` — **todos validam `isKnownAttachmentPath()` primeiro**.
- Renderização por DOM (`createElement`/`textContent`), **nunca `innerHTML`** com nome/mimetype de anexo — esses dados vêm do cliente HTTP mobile e são não-confiáveis (evita XSS via nome de arquivo).
- Toast simples (`#toast-el`) pro feedback de copiar/salvar.

### 7. Tema "Vidro Líquido" (LG) — 🚧 ÚLTIMO TRABALHO, PRECISA DE VALIDAÇÃO VISUAL

Objetivo do usuário: desktop com a **mesma linguagem visual do NEUROAXIS Portal (mobile)** — fundo claro lavanda, círculos pastel grandes ao fundo, cards brancos translúcidos arredondados, roxo sólido nos elementos ativos. Explicitamente: *"não quero vibe de Linux ou Windows 7, quero algo sofisticado exatamente como está o NEUROAXIS Portal"*.

**Como o sistema de tema funciona agora:**
- `THEMES` em `dashboard.html` ganhou a entrada `lg` (nome "Vidro Líquido"): `purple #6d4aff`, `purpleBright #7c5cff`, `cyan #22b8cf`, `cyanDark #0e9bb3`, `bg #f2f1f7`, `surface rgba(255,255,255,0.78)`, `surface2 rgba(255,255,255,0.6)`.
- `applyTheme()` agora também faz `document.body.classList.toggle("theme-lg", t === "lg")` — hook novo pra regras estruturais (os outros 4 temas seguem 100% intactos, só trocam cor).
- Todos os ~55 `border-radius` hardcoded viraram `var(--radius-N)` (vars definidas no `:root` com os valores originais — pixel-idênticos nos temas antigos; `body.theme-lg` sobrescreve com valores bem maiores, `--radius-20 → 999px` pra cápsulas).
- `body.theme-lg` sobrescreve `--text`, `--muted`, `--border`, `--border2`, `--red/green/yellow`, `--glass-blur`, `--shadow-card`, `--shadow-float` — e **`background: transparent`** (ver gotcha abaixo).
- Bloco grande `.theme-lg …` no fim do `<style>` com toda a aparência clara: chrome (topbar/gavetas/modal translúcidos brancos), cards, bolhas (usuário = roxo sólido texto branco), controles (send = FAB roxo, mic = lavanda, pills brancas), inputs, badges, syntax highlight escurecido pra fundo claro.
- Camada de blobs `#lg-blob-bg` (3 divs) inserida como primeiro filho do `<body>`: círculo roxo `#cbb9ff` topo-direita, menta `#b8ecf3` base-esquerda, lavanda `#ded7ff` no meio; `filter: blur(36px)`, animações `lg-drift-*` lentas. `display:none` por padrão → custo zero nos outros temas.
- Animações de mola: `cubic-bezier(0.34,1.56,0.64,1)` em hover/`:active` de praticamente todo controle clicável, entrada em mola do modal e das bolhas, shine-sweep nos botões primários, halo de foco nos inputs, `@media (prefers-reduced-motion: reduce)` desligando tudo sob `.theme-lg`.
- Canvas (sparklines CPU/RAM + timeline de estabilidade) ganharam `isLightTheme()` — grid/fundo/rótulos mudam pra tons escuros quando o tema é claro.
- `config.html` recebeu o mesmo tratamento (é janela independente, tem `:root` próprio): vars de radius, paleta clara, header/footer/inputs/botões em vidro, os dois círculos pastel via `body.theme-lg::before/::after`, animações de mola. Lê o tema via `applyConfig(cfg)` → `document.body.classList.toggle("theme-lg", cfg.theme === "lg")`. **Não tem seletor de tema próprio** — só reflete o que foi escolhido no dashboard.

**⚠️ GOTCHA IMPORTANTE (já corrigido, mas não regrida):** `html, body { background: var(--bg) }` fazia o `<body>` pintar fundo opaco por cima da camada de blobs (que fica em `z-index:-1`, atrás do body). Resultado: círculos invisíveis. Fix: `body.theme-lg { background: transparent }` — o `<html>` mantém a cor de fundo. Se os círculos sumirem, é isso.

**Status:** o build passa e a última screenshot automatizada confirmou o visual claro do Portal funcionando (cards brancos arredondados com sombra, bolha roxa, FAB roxo, textos legíveis). **O que ficou faltando: validação visual do usuário com o app rodando de verdade**, especialmente:
- os círculos pastel de fundo aparecem depois do fix de `background: transparent`? (a screenshot que confirmaria isso não chegou a rodar até o fim)
- a janela de configurações (`config.html`) com o tema aplicado
- sensação das animações de mola ao vivo

---

## 🔴 BUG ABERTO — ação é no `neuroaxis-portal`, não aqui

**Sintoma:** celular manda áudio, desktop processa direitinho, nenhuma resposta volta.

**Causa raiz confirmada via log real:** o cliente WS do Portal manda o frame binário de áudio e **fecha a conexão (close frame `0x8`) imediatamente, sem esperar resposta**. O pipeline do desktop (Groq Whisper → Llama → executar ação) leva 1+ segundo; quando a resposta fica pronta o socket já foi encerrado. A resposta é gerada e perdida.

**Fix necessário (lá, não aqui):** o cliente WS precisa esperar `{"type":"reply",...}` ou `{"type":"error",...}` antes de chamar `close()`. Idealmente reusar uma conexão WS única enquanto a tela de voz estiver ativa.

**Protocolo do `/api/stream` pra referência:** depois do frame binário de áudio, o servidor manda de volta, na mesma conexão, frames de texto JSON: `{"type":"transcript","text":"..."}` primeiro, depois `{"type":"reply","reply":"..."}` (ou `{"type":"error","error":"..."}`).

---

## Outras pendências conhecidas (menor prioridade)

- **Voz "Microsoft Daniel" (pt-BR masculina) não é usada pelo fallback SAPI**: é voz OneCore (`HKLM:\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens`), invisível pro `System.Speech.Synthesis` clássico que `tts.ts` usa. Duas soluções identificadas (não aplicadas): ponte de registro (script já escrito, precisa rodar como Admin) ou reescrever o fallback pra `Windows.Media.SpeechSynthesis` (WinRT, não precisa admin mas interop async via PowerShell é mais frágil).
- **`msedge-tts` (voz neural) falha com "Connect Error"** nesta máquina/rede — cai sempre no fallback SAPI.
- **Instalador `.exe` (NSIS) não testado** depois de nenhuma das mudanças recentes.
- **Checklist de validação manual do `CLAUDE.md`** ainda não confirmado ponta a ponta.

---

## Dicas de ambiente (aprendidas na marra)

- **`ELECTRON_RUN_AS_NODE=1` vaza do VSCode host.** Rodar `electron.exe` direto de dentro de uma sessão de agente faz ele executar como Node puro e quebrar com `Cannot read properties of undefined (reading 'on')`. Solução: limpar essa env var antes de lançar (`env -u ELECTRON_RUN_AS_NODE …` ou deletar do objeto `env` passado pro Playwright).
- **Screenshot automatizado do Electron não capta `backdrop-filter`/blur direito** neste ambiente — os valores computados no DevTools batem, mas o efeito não aparece no PNG. Não confie só na screenshot pra julgar vidro/blur; confirme com o usuário rodando o app.
- **App usa single-instance lock**: a segunda instância dispara `openDashboard()` na primeira e sai. Pra automatizar, lançar duas instâncias é a forma de fazer a janela do dashboard aparecer (ela não abre sozinha no boot — o app vive na bandeja).
- Sem framework de teste automatizado no projeto (nem desktop nem mobile). Validação é sempre manual.

---

## Preferências do usuário (Zak, zakduwe@gmail.com, Windows 11 Pro)

- Projeto pessoal, uso real, não protótipo.
- Caveman mode ativo nas sessões (respostas curtas e diretas).
- Prefere indicar explicitamente quando quer commitar — não commitar por iniciativa própria.
- Gosta de diagnosticar com log real antes de aplicar fix às cegas (foi assim com o bug de TTS e com o bug de áudio mobile — instrumentar primeiro, ler o log, só depois corrigir).
- Tem sessão de Claude separada no `neuroaxis-portal` — os dois projetos precisam ficar consistentes no protocolo HTTP/WS. O contrato do mailbox já mudou de forma duas vezes; sempre avisar o outro lado antes de mexer no `server.ts`.
- Referência estética: o app mobile (Portal). Quer o desktop sofisticado no mesmo padrão, não com cara de utilitário antigo.
