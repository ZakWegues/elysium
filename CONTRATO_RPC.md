# Contrato desktop ↔ Portal

> **Este arquivo foi absorvido pelo [`ULTRA_HANDOFF.md`](ULTRA_HANDOFF.md).**

O contrato entre os dois repositórios agora vive lá, dividido em duas seções:

- **§9 — Superfície RPC**: os 52 métodos com parâmetros, retorno e marcação de destrutivo,
  a tabela de códigos de erro, e o mecanismo de confirmação `X-Neuroaxis-Confirm`.
- **§11 — Contratos entre os dois lados**: QR de pareamento v2, resolução de endereço ativo,
  sincronização de conversas, mailbox e push.

A §8 descreve o servidor da porta 4200 em si — rotas, autenticação, rate limit.

**Ao mudar o `src/services/server.ts`, atualize essas seções no `ULTRA_HANDOFF.md`** — e
lembre que as duas pontas são editadas na mesma sessão, então o cliente do Portal muda junto.
