# ELYSIUM (desktop)

App de bandeja do Windows (Electron + TypeScript) com a assistente Ely: voz, chat, dashboard,
controle do PC e servidor para o celular (porta 4200). O estado real do projeto, fase por fase,
está no **`ULTRA_HANDOFF.md`** (aqui e na pasta-mãe `ELYSIUM`). A especificação original do
"Jarvis PC" ficou no histórico do git.

## Comandos
- Dev: `npm run dev` (build + electron)
- Check (antes de todo commit): `npm run check` — tsc + vitest
- Instalador: `npm run dist` → `release/ELYSIUM-Setup-<versão>.exe`
- Publicar: `npm run release -- --notas-arquivo <arq.md>` (notas com `## Novidades` e `## Para testar`)
- Contrato RPC: `ATUALIZAR_CONTRATO=1 npx vitest run tests/contrato.test.ts` e copiar
  `contracts/rpc-methods.json` para `elysium-m/contracts/`

## Regras duras
- Nunca ler nem imprimir `elysium-config.json` (o `serverToken` só por script que lê esse campo),
  `.env` ou o `auth.json` do Hermes.
- Nunca mexer em `Downloads` nem na pasta `elysium baixado`.
- Dado pessoal do dono só na memória do app — nunca em código, teste ou handoff.
- Comentários e commits em português, no padrão do repo.
- Arquivos em CRLF (autocrlf): testes que leem arquivo do repo normalizam `\r\n`.
- O dono pode estar usando o PC: electron de dev fora da tela e sem foco; em teste ao vivo nada
  de digitar/clicar na máquina dele.
- Toda mudança vai para o `ULTRA_HANDOFF.md`, nas duas cópias.

## Onde achar as coisas
- `src/main` (processo principal), `src/services` (cérebro, voz, servidor, RPC, host de entrada),
  `src/actions` (executores), `src/renderer/dashboard` (HTML/CSS/JS do dashboard), `tests/`.

## Compact instructions
Ao compactar, preserve: arquivos modificados, decisões tomadas, erros ainda não resolvidos,
versões publicadas e o próximo passo.
