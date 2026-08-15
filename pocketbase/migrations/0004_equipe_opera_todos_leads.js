migrate(
  (app) => {
    // Equipe Simbiosia (José + Evandro) opera todos os leads: qualquer usuário
    // autenticado pode listar, ver, criar, atualizar e deletar registros do funil.
    const names = ['leads', 'listas', 'qualificacoes', 'contatos', 'cadencias', 'alinhamentos']
    for (const name of names) {
      const col = app.findCollectionByNameOrId(name)
      col.listRule = "@request.auth.id != ''"
      col.viewRule = "@request.auth.id != ''"
      col.createRule = "@request.auth.id != ''"
      col.updateRule = "@request.auth.id != ''"
      col.deleteRule = "@request.auth.id != ''"
      app.save(col)
    }
  },
  (app) => {
    // down: restaura as regras por dono (owner)
    const names = ['leads', 'listas', 'qualificacoes', 'contatos', 'cadencias', 'alinhamentos']
    for (const name of names) {
      const col = app.findCollectionByNameOrId(name)
      col.listRule = "@request.auth.id != ''"
      col.viewRule = "@request.auth.id != ''"
      col.createRule = "@request.auth.id != ''"
      col.updateRule = "@request.auth.id != '' && owner = @request.auth.id"
      col.deleteRule = "@request.auth.id != '' && owner = @request.auth.id"
      app.save(col)
    }
  },
)
