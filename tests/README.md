# Tests

Runners reais da suíte do Funil. Nenhum destes arquivos existia no repositório antes da
F2-T01 (27/10/2026) — o repositório estava incompleto em relação ao sistema no Skip.

## Como rodar

```sh
# regras puras (não precisa de backend)
node --test tests/rules.test.mjs

# backend (precisa do backend TESTE e de credenciais sintéticas)
export TEST_BACKEND_URL="..."
export TEST_ADMIN_EMAIL="..."
export TEST_ADMIN_PASSWORD="..."
node --test tests/backend.test.mjs

# reconciliação Fábrica ↔ Funil
node --test tests/reconciliacao.test.mjs
```

## Estado provado em 27/10/2026

| Runner | Resultado |
|---|---|
| `rules.test.mjs` | 66/66 |
| `backend.test.mjs` (3 execuções consecutivas) | 35/35 · 35/35 · 35/35 |
| `reconciliacao.test.mjs` | 1/1 |

## Isolamento — três causas de flakiness corrigidas

A suíte falhava em um teste diferente a cada rodada. Eram três defeitos somados:

1. **Janela de tempo absoluta** (`SEM-EXTERNO`): contava despachos "nos últimos 60 s" e
   capturava o despacho deliberado do teste seguinte. → janela relativa ao início do teste.
2. **Contagem global em banco compartilhado** (`AMBIENTE-RESTORE`): comparava totais de 7
   coleções, que qualquer outro teste altera, e a restauração apagava tudo fora do dump
   (cascateando filhos alheios). → prova determinística: a fixture criada depois do backup
   desaparece e todo lead do backup continua existindo.
3. **HTTP 429 no login** (`AMBIENTE-RESTORE` e `PRODUTO-ACL`): o backend de demonstração
   limita tentativas de autenticação e dois pontos autenticavam sem retry. → retry com
   backoff em todos os logins (o helper `authComRetry` e o script de backup).

Depois das correções, `authWithPassword` só aparece dentro do helper com retry.

## Arquivos

- `rules.test.mjs` — regras puras (scoring, faixas, eliminatórias, correspondência fonte↔hook)
- `backend.test.mjs` — ACL, scoring, jobs, listas, importação, cadastro, identidade, fusão
- `reconciliacao.test.mjs` — contrato Fábrica ↔ Funil
- `../scripts/backup-restauracao.mjs` — backup/restore usado pela prova AMBIENTE-RESTORE
