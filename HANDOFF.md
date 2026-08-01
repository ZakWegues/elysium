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

| Repo | Último bloco | Commits |
|---|---|---|
| `neuroaxis` | Bloco 3 | `6540db5` (b1) → `ebbc8fb` (b2) → `170b636` (docs) → bloco 3 |
| `neuroaxis-portal` | Bloco 3 | `ba51ee4` (b1) → `ad07f3c` (b2) → bloco 3 |

---

## Plano de expansão pré-APK — onde estamos

Decisões fechadas pelo Zak: acesso de fora de casa **via túnel** (Tailscale/ZeroTier, sem relay próprio); **APIs e contas externas liberadas** (Tavily, Google Calendar, Spotify OAuth); leva grande de ~15 features.

| Bloco | Conteúdo | Status |
|---|---|---|
| 1 | RPC tipado, robustez de rede, pareamento multi-endereço | ✅ feito |
| 2 | Central de sistema, clipboard, energia | ✅ feito |
| 3 | Espelhamento de tela + trackpad/teclado remoto | ✅ feito |
| 4 | Memória de longo prazo, lembretes, push | ✅ feito |
| 5 | Visão, busca web e Spotify | ✅ feito |
| 6 | Home, modo escuro, share intent, build do APK | ⬜ próximo |

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
- **⚠️ NUNCA testar `input.type` / `input.key` por curl sem controlar o foco.** `SendInput` vai para a janela em primeiro plano, seja ela qual for. Já aconteceu de um teste digitar num documento não salvo do Zak e de oito `Ctrl+Z` caírem no VSCode. Se precisar validar digitação, peça pro Zak testar pelo app com o foco onde ele quiser. Verificação segura sem efeito colateral: `node` chamando `inputHost.ping()` e `move(0,0)` direto no `dist/`.
- **`SendKeys` corrompe acentuação** no layout ABNT (ver `CONTRATO_RPC.md` §7). Texto literal só via `SendInput`/`KEYEVENTF_UNICODE`.
- **Nunca faça `JSON.parse` cego no corpo de uma API de comando.** O Spotify responde 2xx com corpo não-JSON em alguns comandos de reprodução; estourar ali reportava falha para uma ação que **já tinha acontecido** — a música pausava e o app mostrava popup de erro. Ver o `api()` em `spotify.ts`: corpo ilegível vira `null` com aviso no log, e quem precisa de dados trata `null`.
- **Como ler um erro de RPC que veio do celular:** se a mensagem no app for um erro de parse de JSON, o corpo do servidor era JSON **válido** — quem falhou ao interpretar foi o desktop, lendo uma API externa. O cliente engole o erro de parse dele e mostraria `(sem corpo)`.
- **Todo script PowerShell precisa forçar UTF-8 na saída.** O Node lê o stdout como UTF-8, o PowerShell escreve no code page ANSI, e o resultado é "S?o 11:34" no lugar de "São 11:34". Já corrigido em `systemInfo.ts`, `windowManagement.ts`, `openApp.ts` e `inputHost.ts` — **ao criar um executor novo que leia stdout do PowerShell, prefixe o script com `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`.** No `openApp` isso não é só cosmético: o retorno é caminho de arquivo, e acento corrompido quebra o `shell.openPath` de qualquer programa sob "Arquivos de Programas".
- **Sem framework de teste em nenhum dos dois repos.** Validação é build + typecheck + curl contra o app rodando + teste manual do Zak.
- **O `Button` do Portal usa prop `title`, não children.**
- **O Portal roda na Nova Arquitetura do React Native** (padrão do Expo SDK 57, não declarado no `app.json`). Consequências já encontradas: `UIManager.setLayoutAnimationEnabledExperimental` é no-op e avisa no console — usar `Animated` do core; `useNativeDriver: true` para opacidade e transform, `false` só para propriedades de layout como `width` (é o caso legítimo do `MetricBar`).
- **Edge-to-edge é padrão no Android** desde o SDK 54: o sistema **não** redimensiona mais a janela quando o teclado abre, então `softwareKeyboardLayoutMode: "resize"` e `KeyboardAvoidingView` não resolvem. O app reserva o espaço na raiz (`App.tsx`) a partir de `useKeyboard()`.
- **`expo-blur` 57 exige `blurTarget`** apontando pra uma `BlurTargetView`; sem isso ele avisa e cai pro método `none` — ou seja, o vidro para de desfocar sem quebrar nada, o que é fácil de não perceber. Ver `src/components/ui/BlurTarget.tsx`. Dentro de um `Modal` do RN o desfoque é impossível no Android (janela nativa separada).

- **Antes de escolher um modelo, pergunte à API quais existem.** `GET https://api.groq.com/openai/v1/models` com a chave do usuário. No bloco 5 isso evitou implementar contra um model id inventado: a conta **não tem** nenhum `llama-4`/`scout`/`maverick`, e em compensação tem `groq/compound-mini`, que pesquisa na web sozinho e tornou a chave do Tavily desnecessária. O plano previa uma conta externa que acabou não sendo precisa.

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

- **⚠️ Limite de tokens da Groq — parcialmente resolvido, ainda vale saber.** Cada chamada ao cérebro gasta ~4400 tokens (prompt de roteamento + histórico + memória) e o nível gratuito dá 12000 por minuto: **2 a 3 comandos por minuto** antes do 429. O bloco 4 atacou isso com o `fastRoute` (comandos fechados não chamam API nenhuma) e com o corte de exemplos do prompt. O que ainda pode ser feito, se voltar a incomodar: cortar mais o prompt, ampliar as regras do `fastRoute`, ou assinar o Dev Tier.
  **🔴 NÃO troque o `routerModel` pelo `llama-3.1-8b-instant` achando que economiza.** Medido em 01/08/2026: no plano gratuito o 8B tem teto de **6000** tokens/minuto, **metade** dos 12000 do `llama-3.3-70b-versatile`. Trocar piora. O `config.html` já avisa disso no próprio seletor.
- **Push exige credenciais FCM no projeto EAS** para funcionar em APK standalone. Em Expo Go e em emulador não funciona de jeito nenhum — o app detecta e explica, mas não dá pra validar push de verdade antes do bloco 6.
- **Instalador `.exe` (NSIS) não testado** depois de nenhuma das mudanças recentes.
- **APK do Portal não é buildável ainda** — falta `eas.json`, `android.package`, permissões declaradas, ícone adaptativo. É o bloco 6.
- **Voz "Microsoft Daniel" (pt-BR masculina) não é usada pelo fallback SAPI**: é voz OneCore (`HKLM:\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens`), invisível pro `System.Speech.Synthesis` clássico que o `tts.ts` usa. Duas saídas identificadas, nenhuma aplicada: ponte de registro (precisa rodar como Admin) ou reescrever o fallback pra `Windows.Media.SpeechSynthesis` (WinRT, não precisa admin mas o interop async via PowerShell é frágil).
- **`msedge-tts` (voz neural) falha com "Connect Error"** nesta máquina/rede — cai sempre no fallback SAPI.
- **`tts.ts` ignora `cfg.voice`** — a voz está fixa em `pt-BR-AntonioNeural` no código.
- **Quirk do `sleep`**: se a hibernação do Windows estiver habilitada, `SetSuspendState` hiberna em vez de suspender. Resolve com `powercfg /hibernate off` uma vez.
- **`expo start --web` não fala mais com o desktop** — consequência deliberada de remover o CORS. Android e iOS não são afetados.
- **Checklist de validação manual do `CLAUDE.md`** ainda não confirmado ponta a ponta.
- **`input.type` com acentuação não foi validado em execução** — o código foi corrigido para `SendInput`/unicode e compila, mas testar de verdade exige controlar o foco da janela, o que não dá pra fazer com segurança por automação. Pedir pro Zak abrir a aba Remoto → Trackpad e digitar algo com "ação, çedilha, ãõ" num campo de texto.
- **Espelhamento tem teto de ~1,5 quadro/s** por limitação do `desktopCapturer`. Se algum dia precisar de vídeo de verdade, o caminho é outro (WebRTC / captura por stream), não otimizar este.

---

## Sobre o Zak

zakduwe@gmail.com · Windows 11 Pro · projeto pessoal de uso real, não protótipo.

Gosta de ver o diagnóstico antes do conserto, prefere respostas curtas, e quer o desktop com o mesmo capricho visual do app mobile.
