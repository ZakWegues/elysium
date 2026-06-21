# Jarvis PC

Assistente de voz desktop para Windows. Roda em segundo plano na bandeja do sistema, ativado por atalho de teclado global. Entende comandos em português do Brasil e executa ações reais no computador.

## Pré-requisitos

- Windows 10/11 64-bit
- [Node.js 20+](https://nodejs.org)
- Conta gratuita na [Groq](https://console.groq.com) para obter a API key

## Rodar em desenvolvimento

```bash
npm install
npm run dev
```

Na primeira execução, uma janela pedirá sua API key da Groq (`gsk_...`). Cole e salve — fica armazenada localmente, nunca no código.

## Gerar o instalador

```bash
npm run dist
```

O instalador `Jarvis-PC-Setup-1.0.0.exe` é gerado em `release/`. Instale e o Jarvis aparecerá na bandeja automaticamente.

## Configurar a API key na primeira execução

1. Abra o app (instale ou rode `npm run dev`)
2. Uma janela surge pedindo a chave da Groq
3. Acesse [console.groq.com/keys](https://console.groq.com/keys), crie uma chave gratuita
4. Cole no campo e clique **Salvar e fechar**
5. Pronto — a chave fica salva no seu PC, não precisa repetir

Para trocar a chave: clique com botão direito no ícone da bandeja → **Configurar API key…**

## Atalho de teclado

**`Ctrl + Shift + J`** — ativa a escuta (funciona mesmo com outro programa em foco)

O ícone da bandeja muda para indicar o estado:
- Ocioso → aguardando ativação
- Ouvindo → gravando sua voz
- Processando → enviando para a IA
- Falando → reproduzindo resposta

## Comandos de voz suportados

| Exemplo de fala | O que faz |
|---|---|
| "toca Bruno Mars" | Abre Spotify na busca (fallback: YouTube Music) |
| "coloca uma música lo-fi" | Busca no Spotify |
| "abre o YouTube" | Abre youtube.com no navegador padrão |
| "pesquisa receita de bolo" | Busca no YouTube |
| "abre o Chrome" | Abre o Google Chrome |
| "abre o bloco de notas" | Abre o Notepad |
| "abre o VS Code" | Abre o Visual Studio Code |
| "quanto é 15 vezes 8" | Responde por voz |
| "o que é machine learning" | Responde por voz |

### Programas reconhecidos por nome

`spotify`, `chrome`, `vs code`, `vscode`, `calculadora`, `bloco de notas`, `explorador de arquivos`, `firefox`, `edge`, `discord`, `paint`, `word`, `excel`, `powerpoint`, `gerenciador de tarefas`

### Adicionar novos programas

Edite `src/config/apps.json` (ou `dist/config/apps.json` após build):

```json
{
  "meu programa": "meuprograma.exe",
  "outro app": "C:\\Caminho\\completo\\app.exe",
  "site favorito": "https://meusite.com"
}
```

A chave é o nome falado (minúsculas), o valor é o comando ou URL.

## Início automático com o Windows

Ativo por padrão. Para desativar: clique direito no ícone da bandeja → desmarque **Iniciar com o Windows**.

## Trocar o atalho de teclado

Edite `config.json` na raiz do projeto (antes do build) ou em `dist/config.json`:

```json
{
  "shortcut": "Control+Alt+J"
}
```

Reinicie o app para aplicar.

## Troubleshooting

### Microfone não detectado
- Verifique em **Configurações do Windows → Privacidade → Microfone** se o app tem permissão
- Confirme que o microfone está conectado e definido como dispositivo padrão
- Reinicie o Jarvis após conectar o microfone

### Atalho não funciona com outro app em foco
- Alguns apps de jogos ou com anti-cheat bloqueiam atalhos globais
- Tente trocar para `Control+Alt+J` ou `Control+Alt+Shift+J` em `config.json`
- Execute o Jarvis como administrador se necessário

### Spotify não abre / abre o navegador em vez do app
- Verifique se o Spotify desktop está instalado
- Se não estiver instalado, o fallback (YouTube Music no navegador) é automático
- Com Spotify instalado mas sem abrir: acesse `spotify:` uma vez manualmente no navegador para re-registrar o protocolo

### Sem áudio na resposta (TTS)
- Confirme que o volume do Windows não está mudo
- Verifique se `msedge-tts` tem acesso à internet (usa API da Microsoft)
- A voz padrão é `pt-BR-FranciscaNeural` — pode ser trocada em `config.json` (`"voice"`)

### App não aparece na bandeja após instalar
- Procure na área de overflow de ícones da bandeja (seta `^` no canto da barra de tarefas)
- Reinicie o Windows — o auto-start ativa na próxima inicialização

### Erro "API key inválida"
- A chave deve começar com `gsk_`
- Gere uma nova em [console.groq.com/keys](https://console.groq.com/keys)
- Acesse pelo menu da bandeja → **Configurar API key…** para atualizar

## Evolução futura (fora do escopo desta versão)

- Wake-word por voz (ativação sem precisar de atalho)
- Controle de play/pause/skip via Spotify Web API
- Suporte a outros idiomas além de PT-BR
- Interface visual além da bandeja e notificações
