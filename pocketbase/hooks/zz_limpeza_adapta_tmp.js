// ROTA DESATIVADA — limpeza do resíduo ADAPTA executada em 29/10/2026.
//
// O hook anterior (zz_limpeza_adapta_tmp.js) foi mantido aqui como 410 em vez de apagado:
// no dia 28/10 apagar o arquivo NÃO tirou a rota do ar (o apply falhou em "file not found on
// pod") e a rota continuou VIVA. Sobrescrever com uma versão inerte é a única prova de que
// saiu do ar. Verificar: POST nesta rota deve devolver 410, nunca 200.
//
// Resultado da limpeza (29/10/2026):
//   - 111 registros na 1ª passada + 8 + 2 = 121 registros apagados em 3 passadas
//   - produtos JORNADA 4, pessoas 5, origens 5, leads 5, passagens 4, pausas 4,
//     toques 3, reservas 2, cadencias_ativas 3, eventos_teste 4, aliases 7,
//     importacoes 2 + linhas 2, sync_inbox 6 + mapeamentos 2, despachos 1,
//     definicoes arquivadas 45, users de teste 7
//   - PRESERVADOS: José e Evandro, sistema_config (pausa_geral=true), 3 políticas aprovadas
//     (+6 arquivadas de histórico), definição de oportunidade v46 aprovada, meta (reatribuída
//     ao José, que era do "Vendedor Teste")
//   - Backup em work/limpeza-adapta-29-10/backup-funil-2026-10-29-pre-limpeza.json(.gz)

routerAdd(
  'POST',
  '/backend/v1/manutencao/limpar-adapta',
  (e) => {
    return e.json(410, {
      erro: 'Rota de limpeza desativada',
      detalhe: 'A limpeza do resíduo ADAPTA foi executada em 29/10/2026.',
    })
  },
  $apis.requireAuth(),
)
