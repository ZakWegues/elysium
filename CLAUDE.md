# Jarvis PC — Especificação do Projeto

> Este arquivo descreve o projeto completo. Ao implementar, siga as decisões técnicas já definidas aqui sem pedir confirmação — elas são propositalmente fechadas para evitar ambiguidade. Onde algo não estiver especificado, decida priorizando estabilidade e simplicidade de manutenção.

## Visão geral

Um app desktop para Windows chamado **Jarvis PC**: um assistente de voz que roda em segundo plano, ativado por atalho de teclado global, que entende comandos falados em português do Brasil e executa ações reais no computador — tocar música, abrir o YouTube ou sites, abrir programas do Windows, e conversar respondendo perguntas em voz alta.

Este é um projeto para uso pessoal real, não um protótipo. O resultado final deve ser um instalador `.exe` funcional que, depois de instalado, liga sozinho com o Windows e funciona sem nenhuma configuração manual além de colar uma API key da Groq na primeira execução.

## Stack técnica obrigatória

Não troque sem necessidade técnica forte. Se precisar trocar algo, documente o motivo no README.

- **Electron + TypeScript** — app desktop nativo para Windows
- **Node.js** no processo principal para toda a lógica de sistema
- **Groq API** para dois usos:
  - Transcrição de voz (Whisper)
  - Cérebro de decisão de intenção (modelo Llama, sempre com saída estruturada em JSON)
- **TTS com vozes neurais estilo edge-tts**, voz natural em português do Brasil
- **auto-launch** + **electron-builder** para iniciar com o Windows e gerar instalador NSIS
- **electron-store** (ou equivalente) para guardar a API key localmente de forma segura — nunca hardcoded, nunca versionada

## Arquitetura e fluxo completo

1. O app roda inteiramente em segundo plano, sem aparecer na barra de tarefas, vivendo apenas como ícone na bandeja do sistema. Menu de contexto com no mínimo: status atual (ocioso / ouvindo / processando), ativar/desativar início automático, sair.
2. Um atalho de teclado global (padrão sugerido: `Ctrl+Shift+J`), funcionando mesmo com outro programa em foco, dispara a gravação de áudio do microfone padrão. Deixe a estrutura de configuração pronta para trocar esse atalho no futuro, mesmo que a tela de troca não seja construída nesta versão.
3. A gravação para automaticamente após ~1,5s de silêncio detectado, com teto de segurança de 10 segundos.
4. O áudio é enviado para a API de transcrição da Groq (Whisper, idioma português) → retorna o texto falado.
5. O texto é enviado para o cérebro de decisão (Llama via Groq), que responde em JSON estruturado com uma destas ações:

```json
{ "action": "play_music", "query": "string" }
{ "action": "open_url", "url_or_query": "string" }
{ "action": "open_app", "app_name": "string" }
{ "action": "chat", "reply": "string" }
{ "action": "unknown" }
```

   Inclua poucos exemplos few-shot no system prompt desse cérebro, com frases comuns em português mapeadas para o JSON esperado, para melhorar a precisão.

6. Um executor de ações roda a ação decidida:
   - **play_music** — abrir o Spotify desktop direto na busca pedida via protocolo `spotify:search:` (abertura externa de link). Se o Spotify não estiver instalado, fallback para busca no YouTube Music.
   - **open_url** — se já for uma URL válida, abrir direto no navegador padrão. Se for uma busca, montar URL de busca do YouTube com o termo.
   - **open_app** — manter um arquivo de configuração local mapeando nomes comuns de programas (mínimo: Spotify, Chrome, VS Code, calculadora, bloco de notas, explorador de arquivos) para o comando/caminho certo no Windows, com fallback de tentar abrir pelo nome quando não encontrado no mapa. Documentar no README como adicionar novos programas.
   - **chat** — manter histórico curto de conversa em memória (últimas 4–6 trocas) durante a sessão, limpando após alguns minutos de inatividade.
7. A resposta é sempre falada em voz alta (TTS em português), com uma fila simples garantindo que duas falas não se sobreponham. Toda ação real (abrir algo, tocar música) vem acompanhada de confirmação falada curta.
8. Notificações nativas do Windows servem de apoio visual em pontos chave (ouvindo, processando, erro), mas a experiência principal é por voz.

## Requisitos não funcionais

- O app **nunca** trava ou fecha sozinho por erro de rede, microfone ausente, API key ausente/inválida, ou programa não encontrado. Cada caso gera notificação ou resposta falada clara, e o app volta ao estado ocioso.
- A API key da Groq nunca aparece hardcoded no código nem em logs, e nunca é versionada. É pedida ao usuário numa janela mínima de configuração na primeira execução, e fica salva localmente de forma segura.
- Fechar a janela principal (se existir alguma) **não** encerra o processo — só a opção "Sair" no menu da bandeja encerra de verdade.

## Estrutura de pastas sugerida

```
src/
  main/          # processo principal do Electron
  services/
    stt.ts       # transcrição via Groq Whisper
    brain.ts     # decisão de intenção via Groq Llama
    tts.ts       # síntese de voz
  actions/
    router.ts    # roteia a decisão do cérebro pro executor certo
    openUrl.ts
    openApp.ts
    playMusic.ts
  config/
    apps.json    # mapeamento de nomes de programa → comando/caminho
config.json      # configuração local (atalho, autostart, etc.)
.env.example     # GROQ_API_KEY=
```

## Entregável final esperado

- Repositório Electron + TypeScript completo e organizado, com STT, cérebro, TTS e executores de ação separados em módulos próprios.
- Instalador `.exe` gerado via electron-builder, funcional em instalação limpa do Windows, com nome do app "Jarvis PC".
- README completo documentando: como rodar em dev (`npm run dev`), como gerar o instalador, como configurar a API key na primeira execução, lista de comandos de voz suportados, e troubleshooting para os erros mais comuns (microfone não detectado, atalho não funcionando com outro app em foco, Spotify não abrindo, sem áudio na resposta).

**Definição de pronto:** instalar o app, abrir, colar a API key uma vez, reiniciar o PC e ver o Jarvis aparecer sozinho na bandeja — e então usar comandos de voz reais para tocar música, abrir sites/programas, e conversar, sempre com resposta falada.

## Fora do escopo desta versão

Não implementar agora — apenas deixar um espaço documentado no README para evolução futura:

- Wake-word por voz (ativação só por atalho de teclado nesta versão)
- Integração com a Spotify Web API para controle de play/pause/skip (nesta versão, tocar música é só abrir o Spotify/YouTube Music já na busca certa)
- Suporte a outros idiomas além de PT-BR
- Interface visual além do ícone da bandeja e notificações nativas

## Checklist de validação manual

Depois que o código estiver pronto, isto aqui é o que só você consegue testar (não é trabalho de código):

- [ ] Colar a `GROQ_API_KEY` na primeira abertura
- [ ] Confirmar permissão de microfone liberada pelo Windows
- [ ] Com outro app em foco, `Ctrl+Shift+J` muda o ícone da bandeja para "ouvindo"
- [ ] Comando de música abre Spotify/YouTube Music na busca certa
- [ ] Comando de site abre o navegador na busca certa
- [ ] Comando de programa abre o app pedido
- [ ] Pergunta livre recebe resposta falada
- [ ] Reiniciar o PC e o Jarvis aparece sozinho na bandeja
- [ ] Instalador `.exe` roda limpo em outra pasta/perfil

## Como usar este arquivo

Coloque este `CLAUDE.md` na raiz do projeto e abra o Claude Code nessa pasta — ele lê este arquivo automaticamente no início de cada sessão. Basta pedir para implementar o projeto descrito aqui; não é necessário colar nada manualmente.
