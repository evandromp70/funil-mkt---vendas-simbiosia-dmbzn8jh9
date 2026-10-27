// SPEC-1-007 (task 0cda0d05): trava de AUTORIDADE no Funil — CA-1-007-02.
// Catálogo e notas são AUTORIDADE da Fábrica: a projeção no Funil fica em LEITURA
// (updateRule null — só hooks internos com $app.save escrevem). Score/qualificação
// manuais do lead não são tocados. Migração SEMPRE aplica (idempotente).
migrate(
  (app) => {
    const produtos = app.findCollectionByNameOrId('produtos')
    produtos.updateRule = null
    app.save(produtos)

    const pontuacoes = app.findCollectionByNameOrId('pontuacoes')
    pontuacoes.updateRule = null
    app.save(pontuacoes)
  },
  (app) => {
    try {
      const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"
      const produtos = app.findCollectionByNameOrId('produtos')
      produtos.updateRule = regraAdmin
      app.save(produtos)
      const pontuacoes = app.findCollectionByNameOrId('pontuacoes')
      pontuacoes.updateRule = regraAdmin
      app.save(pontuacoes)
    } catch (_) {}
  },
)
