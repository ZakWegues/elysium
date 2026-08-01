# NEUROAXIS — Handoff

> Cole este arquivo inteiro numa conversa nova do Claude Code aberta em `c:\Users\ZAK\neuroaxis` pra retomar de onde parou.
> **Atualize este arquivo ao fim de cada bloco de trabalho.** É o único documento que a próxima sessão lê primeiro.

---

## O que é o projeto

Ecossistema pessoal de dois apps que conversam pela rede local:

- **NEUROAXIS (desktop)** — `c:\Users\ZAK\neuroaxis`, repo `ZakWegues/neuroaxis`. Electron + TypeScript, Windows. Assistente de voz PT-BR: atalho `Ctrl+Shift+J` → grava mic → transcreve via Groq Whisper → decide ação via Groq Llama (JSON, sempre `{"actions":[...]}`) → executa ação real no Windows → fala a resposta. Vive na bandeja do sistema.
- **NEUROAXIS Portal (mobile)** — `c:\Users\ZAK\neuroaxis-portal`, repo `ZakWegues/neuroaxis-portal`. Expo + React Native, TypeScript. App companion que parea por QR code e fala com o desktop por HTTP + WebSocket na porta 4200.

**Os dois repos são editados na mesma sessão.** Decisão do Zak em 31/07/2026 — antes eram sessões separadas, o que fazia os lados divergirem no contrato.

### Documentos de referência

| Arquivo | O que tem |
|---|---|
| `CLAUDE.md` (raiz do desktop) | Spec original do projeto ("Jarvis PC"). Decisões técnicas fechadas. |
| `CONTEXTO_NEUROAXIS.md` | Arquitetura completa do desktop. ⚠️ A seção sobre o mobile está obsoleta (foi escrita antes de o app existir). |
| `CONTRATO_RPC.md` | **Contrato vivo entre os dois repos.** Endpoints, métodos RPC, mudanças incompatíveis. Atualizar sempre que `server.ts` mudar. |
| `~/.claude/plans/beleza-voce-sabe-que-dynamic-cupcake.md` | Plano de expansão pré-APK: 15 features em 6 blocos + catálogo de 26 pra depois. |

### Comandos

**Desktop:** `npm run dev` · `npm run build` · `npm start` · `npm run dist` (instalador NSIS)
**Portal:** `npm start` (Expo) · `npm run typecheck`

---

## Regras de trabalho (definidas pelo Zak)

1. **Commit e push a cada bloco concluído, sem perguntar.** Vale pros dois repos. Fechou bloco com build passando e validação feita → sobe.
2. **Manter este HANDOFF.md atualizado** ao fim de cada bloco, com tudo que a próxima sessão precisa.
3. **Manter o `CONTRATO_RPC.md` atualizado** sempre que o servidor mudar.
4. **Diagnosticar com log real antes de aplicar fix às cegas.** Instrumentar, ler o log, só então corrigir. Foi assim com o bug de TTS e o de áudio mobile.
5. Caveman mode ativo nas respostas (curtas e diretas). Código, commits e avisos de segurança em português normal.
6. Referência estética: o app mobile. O desktop deve parecer sofisticado no mesmo padrão, não utilitário antigo.

---

## Estado do git

Ambos os repos em `main`, working tree limpo, tudo pusheado.

| Repo | Último commit | O que era |
|---|---|---|
| `neuroaxis` | `ebbc8fb` | Bloco 2 — energia, mídia, volume |
| `neuroaxis-portal` | `ad07f3c` | Bloco 2 — tela de Sistema, biometria |

Histórico recente do desktop: `e7b94a2` (pareamento + mailbox + tema Vidro Líquido) → `6540db5` (bloco 1) → `ebbc8fb` (bloco 2).

---

## Plano de expansão pré-APK — onde estamos

Decisões fechadas pelo Zak: acesso de fora de casa **via túnel** (Tailscale/ZeroTier, sem relay próprio); **APIs e contas externas liberadas** (Tavily, Google Calendar, Spotify OAuth); leva grande de ~15 features.

| Bloco | Conteúdo | Status |
|---|---|---|
| 1 | RPC tipado, robustez de rede, pareamento multi-endereço | ✅ feito |
| 2 | Central de sistema, clipboard, energia | ✅ feito |
| 3 | Espelhamento de tela + trackpad/teclado remoto | ⬜ próximo |
| 4 | Memória de longo prazo, lembretes, push | ⬜ |
| 5 | Visão, busca web, Spotify Web API | ⬜ |
| 6 | Home, modo escuro, share intent, build do APK | ⬜ |

O catálogo de 26 features pra depois está no arquivo do plano.

---

## O que já existe (resumo funcional)

### Desktop

**Ações de voz** (20 no union `BrainAction` em `src/services/brain.ts`): `play_music`, `open_url`, `open_app`, `close_app`, `volume_control`, `media_control`, `window_management`, `write_text`, `create_file`, `clipboard_read`, `screenshot`, `system_info`, `run_preset`, `list_presets`, `delete_preset`, `create_preset`, `send_to_mobile`, `power_control`, `chat`, `unknown`. Executores em `src/actions/`, roteados por `router.ts`.

**Servidor** (`src/services/server.ts`, HTTP+WS na 4200, RFC 6455 escrito à mão, zero deps):
- `GET /api/health`, `POST /api/command` (linguagem natural → cérebro)
- `GET|POST /api/rpc` (chamadas tipadas — ver `CONTRATO_RPC.md`)
- `POST|GET /api/mailbox/messages`, `GET .../:id/content`, `POST .../:id/ack`
- `WS /api/stream` — áudio binário → STT → resposta; broadcast de telemetria a cada 5s; evento `mailbox_new`
- **Sem CORS de propósito** (cliente é app nativo), rate limit 120/10s por IP, corpo máx 8 MB, token comparado em tempo constante

**Dashboard** (`src/renderer/dashboard.html`, ~99 KB, vanilla JS): gavetas esquerda (perf/storage/taskmgr) e direita (config/presets/mídia/personalização/pareamento), timeline central com chat duplo (IA / Eu mesmo), 5 temas incluindo o "Vidro Líquido" claro.

**Serviços**: `stt.ts` (Whisper + detecção de formato por magic bytes), `tts.ts` (msedge-tts neural com fallback SAPI), `brain.ts`, `command.ts`, `history.ts`, `presetsStore.ts`, `telemetryLog.ts`, `mailboxStore.ts`, `rpc.ts`, `errors.ts`.

### Portal

**Telas**: Pareamento (QR pela câmera), Chat (texto + push-to-talk por WS, TTS local), Conversas (histórico), Caixa (mailbox com anexos), **Sistema** (4 seções: Monitor, Processos, Apps, Controle), Presets e Ajustes (modais).

**Bibliotecas** (`src/lib/`): `http.ts` (fetch com timeout obrigatório), `pairing.ts` (multi-endpoint + migração + varredura de sub-rede), `rpc.ts`, `api.ts`, `mailbox.ts`, `stream.ts` (voz por WS), `telemetry.ts`, `commandQueue.ts` (fila offline), `useConnection.ts`, `confirm.ts` (biometria), `chatHistoryStore.ts`, `mailboxStore.ts`.

**Design**: "liquid glass" iOS, claro, 4 temas. `src/theme/` com tokens, paletas e contexto.

---

## Armadilhas do ambiente (aprendidas na marra)

- **`ELECTRON_RUN_AS_NODE=1` vaza do host do VSCode.** Rodar `electron.exe` direto de dentro de uma sessão de agente faz ele executar como Node puro e quebrar com `Cannot read properties of undefined (reading 'on')`. Limpar a env var antes de lançar (`unset ELECTRON_RUN_AS_NODE`).
- **Single-instance lock.** Se o app já estiver rodando (ele inicia com o Windows), lançar de novo só abre o dashboard da instância existente — e você acaba testando build velha sem perceber. Para testar código novo: matar o processo principal (`electron.exe` cujo CommandLine não tem `--type=`) e relançar.
- **Screenshot automatizado do Electron não capta `backdrop-filter`/blur** neste ambiente. Não julgue vidro/blur por PNG; confirme com o Zak rodando o app.
- **`Promise.any` é risco no Hermes** — suporte varia por versão do runtime. Há um `firstSuccess()` escrito à mão em `pairing.ts` no Portal pelo mesmo motivo.
- **Sem framework de teste em nenhum dos dois repos.** Validação é build + typecheck + curl contra o app rodando + teste manual do Zak.
- **O `Button` do Portal usa prop `title`, não children.**

### Como testar o servidor por curl

O token fica em `%APPDATA%/neuroaxis/neuroaxis-config.json`, campo `serverToken`. ⚠️ Esse arquivo também tem a `apiKey` da Groq em texto puro — não jogue o arquivo inteiro no output.

```bash
T=<serverToken>
curl -s -H "Authorization: Bearer $T" http://127.0.0.1:4200/api/rpc
curl -s -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
     -d '{"method":"system.disks"}' http://127.0.0.1:4200/api/rpc
# métodos destrutivos exigem: -H "X-Neuroaxis-Confirm: 1"
```

---

## Pendências conhecidas

- **Instalador `.exe` (NSIS) não testado** depois de nenhuma das mudanças recentes.
- **APK do Portal não é buildável ainda** — falta `eas.json`, `android.package`, permissões declaradas, ícone adaptativo. É o bloco 6.
- **Voz "Microsoft Daniel" (pt-BR masculina) não é usada pelo fallback SAPI**: é voz OneCore (`HKLM:\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens`), invisível pro `System.Speech.Synthesis` clássico que o `tts.ts` usa. Duas saídas identificadas, nenhuma aplicada: ponte de registro (precisa rodar como Admin) ou reescrever o fallback pra `Windows.Media.SpeechSynthesis` (WinRT, não precisa admin mas o interop async via PowerShell é frágil).
- **`msedge-tts` (voz neural) falha com "Connect Error"** nesta máquina/rede — cai sempre no fallback SAPI.
- **`tts.ts` ignora `cfg.voice`** — a voz está fixa em `pt-BR-AntonioNeural` no código.
- **Quirk do `sleep`**: se a hibernação do Windows estiver habilitada, `SetSuspendState` hiberna em vez de suspender. Resolve com `powercfg /hibernate off` uma vez.
- **`expo start --web` não fala mais com o desktop** — consequência deliberada de remover o CORS. Android e iOS não são afetados.
- **Checklist de validação manual do `CLAUDE.md`** ainda não confirmado ponta a ponta.

---

## Sobre o Zak

zakduwe@gmail.com · Windows 11 Pro · projeto pessoal de uso real, não protótipo.

Gosta de ver o diagnóstico antes do conserto, prefere respostas curtas, e quer o desktop com o mesmo capricho visual do app mobile.
