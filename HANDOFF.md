# NEUROAXIS — Handoff para nova sessão

## O que é o projeto

App desktop Electron + TypeScript para Windows chamado **NEUROAXIS** (também referido como Jarvis PC no CLAUDE.md). Assistente de voz pessoal em PT-BR: ativado por `Ctrl+Shift+J`, grava microfone, transcreve via Groq Whisper, decide ação via Groq Llama (JSON), executa ação, fala resposta via TTS (PowerShell SAPI offline). Roda apenas como ícone na bandeja do sistema.

**Working dir:** `c:\Users\ZAK\neuroaxis`  
**Stack:** Electron + TypeScript, Node.js main process, Groq API (STT + brain), PowerShell SAPI (TTS), electron-builder (NSIS installer), auto-launch, electron-store  
**Dev:** `npm run dev` | **Build:** `npm run build` | **Installer:** `npm run dist`

---

## Estado atual do código (após esta sessão)

### O que foi resolvido nesta sessão

#### 1. Apps não abrindo visualmente (ROOT CAUSE: foreground policy do Windows)
**Problema:** PowerShell process (hidden/detached) não tem permissão de trazer janela ao primeiro plano no Windows. Apps abriam em background invisível.

**Solução implementada em `src/actions/openApp.ts`:**
- PS agora só **resolve** o AppID/path (read-only query)
- Electron lança o app via `shell.openPath()` (exe path) ou `launchViaExplorer()` (UWP/Store)
- `launchViaExplorer` usa `spawn("explorer.exe", ["shell:AppsFolder\\AppID"])` — Explorer tem foreground rights nativos
- Timeout de 4s em `launchViaExplorer` previne state travar se explorer não emitir `"close"`

**Resolução de AppID — ordem (PowerShell):**
1. `Get-StartApps | Where-Object { $_.Name -like '*name*' }` — UWP, Store, Win32 registrados
2. App Paths registry (`HKCU/HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\`)
3. `Get-Command name` — PATH

**Launch routing:**
- `protocol://` ou `https://` → `shell.openExternal`
- `proto:` (ex: `spotify:`, `ms-settings:`) → `shell.openExternal`
- Caminho absoluto (ex: `C:\...`) → `shell.openPath`
- Nome/ID sem caminho absoluto → resolve via PS → se path: `shell.openPath`; se UWP ID: `launchViaExplorer`

**Nota debug:** `notify("NEUROAXIS — Resolvido", ...)` ainda ativo em `resolveAppId` (linha 127 de openApp.ts). **Remover após confirmar todos os apps funcionando.**

#### 2. Atalho de voz parado (state travado)
**Problema:** `if (!state.is("idle")) return;` silenciosamente não fazia nada se estado != idle.  
**Solução:** Adicionado `interruptAll()` antes — interrompe TTS + limpa fila + incrementa abort token — e daí inicia escuta.

#### 3. Chat / janelas não aparecendo após outro app abrir
**Problema:** `chatWin.focus()` não funciona se Electron não tem foreground permission (Windows focus stealing prevention). Também sem check de `isDestroyed()`.  
**Solução em `main.ts`:** `openChatWindow`, `openVoiceWindow`, `openConfigWindow` agora fazem:
```typescript
if (win && !win.isDestroyed()) {
  if (win.isMinimized()) win.restore();
  win.show(); win.focus(); return;
}
win = null; // reset se destroyed sem "closed" event
```

#### 4. TTS com cancelamento
**`src/services/tts.ts`:** Exporta `cancelSpeak()` que mata processo PS ativo.  
**`src/main/main.ts`:** `interruptAll()` chama `cancelSpeak()` + limpa speakQueue + incrementa `currentToken`.

---

## Arquitetura de arquivos importantes

```
src/
  main/
    main.ts          # processo principal — IPC, shortcuts, janelas, speak queue
    config.ts        # electron-store: apiKey, shortcut, autoLaunch, etc.
    tray.ts          # ícone bandeja, menu contextual
    state.ts         # estado: idle | listening | processing | speaking
    notify.ts        # notificações nativas Windows
  services/
    stt.ts           # Groq Whisper transcription
    brain.ts         # Groq Llama → JSON action (com histórico de conversa)
    tts.ts           # PowerShell SAPI TTS, PT-BR, com cancelSpeak()
    errors.ts        # NeuroaxisError com .spoken (PT-BR) e .message (técnico)
    history.ts       # top commands por frequência (para aba "Frequentes" no chat)
  actions/
    router.ts        # switch BrainAction → executor
    openApp.ts       # abre apps — lógica de resolução + launch (ARQUIVO MAIS ALTERADO)
    openUrl.ts       # abre URLs/buscas no navegador padrão
    playMusic.ts     # spotify: protocol ou YouTube Music fallback
    writeText.ts     # clipboard.writeText (escreve texto)
  config/
    apps.json        # mapa nome → comando/AppID/exe
  renderer/
    chat.html + preload-chat.ts       # janela chat
    voice-overlay.html + preload-voice.ts  # overlay voz
    config.html + preload-config.ts   # configuração API key
    recorder.html + preload-recorder.ts    # gravação (hidden window)
```

---

## apps.json — estado atual

Mapa de nomes PT-BR → comando (exe, protocolo, ou nome para Get-StartApps):

```json
{
  "spotify": "spotify:",
  "chrome": "chrome",
  "vs code": "code",
  "calculadora": "calc.exe",
  "bloco de notas": "notepad.exe",
  "explorador de arquivos": "explorer.exe",
  "discord": "discord",
  "telegram": "telegram",
  "whatsapp": "WhatsApp",
  "configurações": "ms-settings:",
  "câmera": "microsoft.windows.camera:",
  "relógio": "ms-clock:",
  "terminal": "wt.exe",
  "obs": "obs64.exe",
  "roblox": "Roblox Player",
  "roblox studio": "Roblox Studio",
  "steam": "steam:",
  "epic games": "Epic Games Launcher",
  "bluestacks": "BlueStacks",
  "rainmeter": "Rainmeter",
  "lively": "Lively Wallpaper",
  "claude": "Claude",
  "nvidia": "NVIDIA App"
  // ... e mais
}
```

**Regra:** Se valor tem `://` ou termina em `:` → protocol handler direto. Se é `nome.exe` → via registry/PATH. Qualquer outro string → Get-StartApps (nome parcial case-insensitive).

---

## brain.ts — BrainAction types

```typescript
type BrainAction =
  | { action: "play_music"; query: string }
  | { action: "open_url"; url_or_query: string }
  | { action: "open_app"; app_name: string }
  | { action: "write_text"; content: string; description: string }
  | { action: "chat"; reply: string }
  | { action: "unknown" }
```

System prompt tem exemplos few-shot PT-BR e regra explícita: `"abre o Discord"` = `open_app`; `"abre o YouTube"` = `open_url`. Histórico de conversa: últimas N trocas, limpo após inatividade (`chatIdleResetMs` em config).

---

## Pendências / próximos passos

### Debug notification (remover)
Em `src/actions/openApp.ts` linha ~127:
```typescript
notify("NEUROAXIS — Resolvido", `${name} → ${appId || "(não encontrado)"}`);
```
Remover quando confirmar que todos os apps estão abrindo corretamente.

### Apps que ainda podem falhar
- Apps onde Get-StartApps retorna GUID path `{7C5A40EF-...}\app.exe` — o código trata isso como caminho absoluto (começa com `{`, não com `C:\`), mas `shell.openPath` vai falhar. Fix: detectar GUID paths e usar `launchViaExplorer` também para eles.
- Apps não instalados (Notion, Slack, Zoom, Figma) ainda estão em apps.json — causam "não encontrei" se não instalados (comportamento correto, mas poderiam ser removidos para clareza).
- Roblox: o PlayerBeta.exe fecha imediatamente se lançado sem URL de jogo. O `shell:AppsFolder\Roblox Player` deve funcionar via launcher, mas se não funcionar, precisa investigar AppID correto via `Get-StartApps` no PS manual.

### Não implementado ainda (fora de escopo desta versão)
- Wake-word por voz
- Controle play/pause/skip Spotify (Web API)
- Tela de troca de atalho (estrutura existe em config.ts)
- Suporte a outros idiomas

### Instalador
`npm run dist` gera `.exe` NSIS em `dist/`. Não testado após as alterações desta sessão.

---

## Como testar manualmente (checklist rápido)

1. `npm run dev` para iniciar
2. Ctrl+Shift+J → falar "abre a calculadora" → deve abrir em foco
3. Falar "abre o WhatsApp" → deve abrir WhatsApp em foco (notificação debug mostra AppID encontrado)
4. Falar "toca Bruno Mars" → deve abrir Spotify na busca
5. Falar "abre o YouTube" → deve abrir no navegador padrão
6. Chat via bandeja → "abre o discord" → deve abrir Discord; chat continua respondendo depois
7. Reiniciar e ver NEUROAXIS aparecer sozinho na bandeja (auto-launch)

---

## Contexto de desenvolvimento

- Usuário: Zak (zakduwe@gmail.com), Windows 11 Pro
- Projeto pessoal, uso real, não protótipo
- Caveman mode ativo nas sessões (respostas curtas e diretas)
- Preferência: um fix por vez para poder testar cada mudança
- PowerShell SAPI escolhido para TTS por ser offline (sem dependência de edge-tts ou API externa)
