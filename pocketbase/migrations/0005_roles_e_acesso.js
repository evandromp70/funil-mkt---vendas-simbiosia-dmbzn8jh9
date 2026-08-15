migrate(
  (app) => {
    // ---------- 1. Campo role na coleção users (admin | vendedor) ----------
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const hasRole = users.fields.some((f) => f.name === 'role')
    if (!hasRole) {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: true,
          maxSelect: 1,
          values: ['admin', 'vendedor'],
        }),
      )
    }
    // Admin vê/gerencia todos os usuários; vendedor vê apenas a si mesmo.
    users.listRule = '@request.auth.role = "admin" || id = @request.auth.id'
    users.viewRule = '@request.auth.role = "admin" || id = @request.auth.id'
    users.createRule = '@request.auth.role = "admin"'
    users.updateRule = '@request.auth.role = "admin" || id = @request.auth.id'
    users.deleteRule = '@request.auth.role = "admin" && id != @request.auth.id'
    app.save(users)

    // ---------- 2. Seeds: José e Evandro viram admin ----------
    const adminEmails = ['jose@simbiosia.com.br', 'evandro@simbiosia.com.br']
    for (const email of adminEmails) {
      try {
        const u = app.findAuthRecordByEmail('_pb_users_auth_', email)
        u.set('role', 'admin')
        app.save(u)
      } catch (_) {}
    }
    // Qualquer outro usuário existente vira vendedor
    try {
      const todos = app.findRecordsByFilter('_pb_users_auth_', '', '', 0, 0)
      for (const u of todos) {
        if (!u.getString('role')) {
          u.set('role', 'vendedor')
          app.save(u)
        }
      }
    } catch (_) {}

    // ---------- 3. RLS das coleções do funil ----------
    // admin: acesso total; vendedor: só os próprios registros (owner = ele)
    const regraAcesso =
      '@request.auth.id != "" && (@request.auth.role = "admin" || owner = @request.auth.id)'
    const regraCriar = '@request.auth.id != "" && owner = @request.auth.id'

    const nomes = ['leads', 'listas', 'qualificacoes', 'contatos', 'cadencias', 'alinhamentos']
    for (const nome of nomes) {
      const col = app.findCollectionByNameOrId(nome)
      col.listRule = regraAcesso
      col.viewRule = regraAcesso
      col.createRule = regraCriar
      col.updateRule = regraAcesso
      col.deleteRule = regraAcesso
      app.save(col)
    }
  },
  (app) => {
    // down: volta ao estado anterior (equipe inteira opera todos)
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.listRule = 'id = @request.auth.id'
    users.viewRule = 'id = @request.auth.id'
    users.createRule = ''
    users.updateRule = 'id = @request.auth.id'
    users.deleteRule = 'id = @request.auth.id'
    const remove = users.fields.filter((f) => f.name === 'role')
    for (const f of remove) users.fields.remove(f.id)
    app.save(users)

    const nomes = ['leads', 'listas', 'qualificacoes', 'contatos', 'cadencias', 'alinhamentos']
    for (const nome of nomes) {
      const col = app.findCollectionByNameOrId(nome)
      col.listRule = "@request.auth.id != ''"
      col.viewRule = "@request.auth.id != ''"
      col.createRule = "@request.auth.id != ''"
      col.updateRule = "@request.auth.id != ''"
      col.deleteRule = "@request.auth.id != ''"
      app.save(col)
    }
  },
)
