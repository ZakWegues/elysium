# Segurança

## Como relatar uma falha

Não abra issue pública para falha de segurança. Use o **relatório privado de vulnerabilidade**
do GitHub (aba *Security* → *Report a vulnerability*) neste repositório. Inclua a versão, o
passo a passo para reproduzir e o impacto. A resposta sai em até 7 dias.

## O que o ELYSIUM faz para se proteger

- O servidor local (porta 4200) só atende **rede privada** (casa, Tailscale, cabo) e recusa
  cabeçalho `Host` que não seja um IP ou o nome do PC — contra DNS rebinding.
- Toda chamada exige o token do pareamento, comparado em tempo constante; tentativas erradas
  bloqueiam o endereço por 10 minutos. Métodos destrutivos exigem confirmação explícita.
- Ações de alto impacto pedidas depois de a assistente ler conteúdo de fora (página, convite,
  área de transferência) viram pergunta — a decisão fica com a pessoa, fora do modelo.
- Janelas com `contextIsolation`, `sandbox`, sem `nodeIntegration`; todo IPC confere se veio
  das telas do próprio app; navegação só para as telas do app; fusíveis do Electron desligam
  `RunAsNode`, `NODE_OPTIONS` e `--inspect` no executável.
- Atualizações só do repositório oficial, com assinatura Authenticode conferida pela impressão
  digital antes de instalar.
- `scripts/seguranca/ataque.mjs` roda sondas de ataque contra o próprio servidor a cada release.
