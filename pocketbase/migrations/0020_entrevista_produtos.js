// SPEC-1-004 (task 46c0fd51): registro da entrevista de produtos — CA-1-004-03.
// Migração ADITIVA: entrevista_produtos (uma por produto+ambiente). RLS admin.
// F2-T01: recuperada do Skip 50182 (fonte executável).
migrate(
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"

    if (!app.hasTable('entrevista_produtos')) {
      const c = new Collection({
        name: 'entrevista_produtos',
        type: 'base',
        listRule: regraAdmin,
        viewRule: regraAdmin,
        createRule: regraAdmin,
        updateRule: regraAdmin,
        deleteRule: regraAdmin,
        fields: [
          {
            name: 'produto',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('produtos').id,
            maxSelect: 1,
          },
          {
            name: 'owner',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'roteiro', type: 'json' },
          { name: 'respostas', type: 'json' },
          { name: 'pendencias', type: 'json' },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['rascunho', 'confirmada'],
          },
          {
            name: 'confirmada_por',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'confirmada_em', type: 'date' },
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
          'CREATE UNIQUE INDEX idx_entrevista_produto ON entrevista_produtos (produto, ambiente)',
        ],
      })
      app.save(c)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('entrevista_produtos'))
    } catch (_) {}
  },
)
