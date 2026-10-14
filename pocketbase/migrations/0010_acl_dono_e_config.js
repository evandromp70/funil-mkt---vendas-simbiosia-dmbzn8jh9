// SPEC-1-001 (task d3e7d6da): proteções de acesso (ACL) — CA-1-001-02.
// Vendedor: owner imutável, role imutável na autoedição, filhos pelo dono do lead pai,
// sistema_config/teste_despachos só-admin. Migração ADITIVA (só muda regras de acesso).
migrate(
  (app) => {
    // ---------- users: autoedição sem mudança de role ----------
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.updateRule =
      '@request.auth.role = "admin" || ' +
      '(id = @request.auth.id && @request.body.role:changed = false && @request.body.verified:changed = false)'
    app.save(users)

    // ---------- leads: owner imutável para não-admin ----------
    const leads = app.findCollectionByNameOrId('leads')
    leads.updateRule =
      '@request.auth.id != "" && (@request.auth.role = "admin" || ' +
      '(owner = @request.auth.id && @request.body.owner:unchanged))'
    app.save(leads)

    // ---------- filhas: dono do lead pai ----------
    // vendedor lê/grava filhos só se for o dono do lead pai; admin passa.
    const regraFilha = {
      list: '@request.auth.id != "" && (@request.auth.role = "admin" || lead.owner = @request.auth.id)',
      view: '@request.auth.id != "" && (@request.auth.role = "admin" || lead.owner = @request.auth.id)',
      create:
        '@request.auth.id != "" && (@request.auth.role = "admin" || @request.body.lead.owner = @request.auth.id)',
      update:
        '@request.auth.id != "" && (@request.auth.role = "admin" || lead.owner = @request.auth.id)',
      delete:
        '@request.auth.id != "" && (@request.auth.role = "admin" || lead.owner = @request.auth.id)',
    }
    for (const nome of ['qualificacoes', 'contatos', 'cadencias', 'alinhamentos']) {
      const col = app.findCollectionByNameOrId(nome)
      col.listRule = regraFilha.list
      col.viewRule = regraFilha.view
      col.createRule = regraFilha.create
      col.updateRule = regraFilha.update
      col.deleteRule = regraFilha.delete
      app.save(col)
    }

    // ---------- sistema_config e teste_despachos: leitura só-admin ----------
    for (const nome of ['sistema_config', 'teste_despachos']) {
      const col = app.findCollectionByNameOrId(nome)
      col.listRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
      col.viewRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
      app.save(col)
    }
  },
  (app) => {
    // down: volta às regras da migração 0005
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.updateRule = '@request.auth.role = "admin" || id = @request.auth.id'
    app.save(users)

    const regraAcesso =
      '@request.auth.id != "" && (@request.auth.role = "admin" || owner = @request.auth.id)'
    const regraCriar = '@request.auth.id != "" && owner = @request.auth.id'
    const leads = app.findCollectionByNameOrId('leads')
    leads.updateRule = regraAcesso
    app.save(leads)

    for (const nome of ['qualificacoes', 'contatos', 'cadencias', 'alinhamentos']) {
      const col = app.findCollectionByNameOrId(nome)
      col.listRule = regraAcesso
      col.viewRule = regraAcesso
      col.createRule = regraCriar
      col.updateRule = regraAcesso
      col.deleteRule = regraAcesso
      app.save(col)
    }
  },
)
