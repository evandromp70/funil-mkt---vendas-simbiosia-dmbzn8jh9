// SPEC-1-005 (task 2faac03b): job de repontuação dos não abordados — CA-1-005-04.
// Migração ADITIVA: jobs_pontuacao (cursor, retomada, reversão de ponteiros) +
// notas_atuais (json) em leads — ponteiro da nota vigente por produto.
// F2-T01: recuperada do Skip 50182 (fonte executável).
migrate(
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"

    if (!app.hasTable('jobs_pontuacao')) {
      const c = new Collection({
        name: 'jobs_pontuacao',
        type: 'base',
        listRule: regraAdmin,
        viewRule: regraAdmin,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'produto',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('produtos').id,
            maxSelect: 1,
          },
          {
            name: 'regua',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('regras_produto').id,
            maxSelect: 1,
          },
          { name: 'versao', type: 'number', required: true, onlyInt: true },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pendente', 'executando', 'concluido', 'obsoleto', 'revertido'],
          },
          { name: 'cursor', type: 'text' },
          { name: 'processados', type: 'number', onlyInt: true },
          { name: 'ignorados', type: 'number', onlyInt: true },
          { name: 'erros', type: 'number', onlyInt: true },
          { name: 'ponteiros_antes', type: 'json' },
          { name: 'publicados', type: 'json' },
          { name: 'criado_por', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
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
          'CREATE UNIQUE INDEX idx_job_produto_versao ON jobs_pontuacao (produto, versao, ambiente)',
        ],
      })
      app.save(c)
    }

    const leads = app.findCollectionByNameOrId('leads')
    if (!leads.fields.some((f) => f.name === 'notas_atuais')) {
      leads.fields.add(new JSONField({ name: 'notas_atuais' }))
      app.save(leads)
    }
  },
  (app) => {
    try {
      const leads = app.findCollectionByNameOrId('leads')
      const f = leads.fields.find((x) => x.name === 'notas_atuais')
      if (f) leads.fields.remove(f.id)
      app.save(leads)
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('jobs_pontuacao'))
    } catch (_) {}
  },
)
