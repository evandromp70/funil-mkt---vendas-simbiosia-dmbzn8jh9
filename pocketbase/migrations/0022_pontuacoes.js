// SPEC-1-005 (task 3b93879f): persistência da pontuação por produto — CA-1-005-01/02.
// Migração ADITIVA: pontuacoes (idempotente por lead×produto×versao×dados_hash) +
// primeira_abordagem_em em leads. Nada legado é alterado.
// F2-T01: recuperada do Skip 50182 (fonte executável).
migrate(
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const regraDono =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || owner = @request.auth.id)"

    if (!app.hasTable('pontuacoes')) {
      const c = new Collection({
        name: 'pontuacoes',
        type: 'base',
        listRule: regraDono,
        viewRule: regraDono,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: null,
        fields: [
          {
            name: 'owner',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          {
            name: 'lead',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('leads').id,
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'produto',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('produtos').id,
            maxSelect: 1,
          },
          { name: 'versao', type: 'number', required: true, onlyInt: true },
          { name: 'dados_hash', type: 'text', required: true },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['calculada', 'pendente', 'eliminada'],
          },
          { name: 'valor', type: 'number' },
          { name: 'faixa', type: 'text' },
          { name: 'motivos', type: 'json' },
          { name: 'fontes', type: 'json' },
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['teste', 'producao'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_pontuacao_idempotente ON pontuacoes (lead, produto, versao, dados_hash)',
        ],
      })
      app.save(c)
    }

    const leads = app.findCollectionByNameOrId('leads')
    if (!leads.fields.some((f) => f.name === 'primeira_abordagem_em')) {
      leads.fields.add(new DateField({ name: 'primeira_abordagem_em' }))
      app.save(leads)
    }
  },
  (app) => {
    try {
      const leads = app.findCollectionByNameOrId('leads')
      const f = leads.fields.find((x) => x.name === 'primeira_abordagem_em')
      if (f) leads.fields.remove(f.id)
      app.save(leads)
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('pontuacoes'))
    } catch (_) {}
  },
)
