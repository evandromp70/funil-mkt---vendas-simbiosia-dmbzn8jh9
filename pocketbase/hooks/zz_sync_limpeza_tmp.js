// NEUTRALIZADO (F3-T04, 25/11/2026). A limpeza que esta rota fazia já foi executada e conferida.
// A rota fica respondendo 410 para que ninguém apague recibo de sincronização por engano:
// sync_inbox é histórico de integração. Mantida no repositório (e não apagada) porque apagar
// arquivo de hook pode quebrar o apply — lição das fases 1 e 2. Rota viva devolvendo 410 é a
// prova de que está fora do ar.
routerAdd(
  'POST',
  '/backend/v1/sync/limpar-provas',
  (e) => {
    return e.json(410, {
      erro: 'rota desativada',
      detalhe: 'era limpeza temporária da F3-T04 e já cumpriu o papel. sync_inbox é histórico.',
    })
  },
  $apis.requireAuth(),
)
