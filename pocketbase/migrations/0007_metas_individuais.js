migrate(
  (app) => {
    // Metas individuais por vendedor/admin — o admin (José/Evandro) define os alvos.
    const metas = new Collection({
      name: 'metas',
      type: 'base',
      listRule: '@request.auth.role = "admin" || user = @request.auth.id',
      viewRule: '@request.auth.role = "admin" || user = @request.auth.id',
      createRule: '@request.auth.role = "admin"',
      updateRule: '@request.auth.role = "admin"',
      deleteRule: '@request.auth.role = "admin"',
      fields: [
        {
          name: 'user',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'contatos', type: 'number', required: false, min: 0, onlyInt: true },
        { name: 'oportunidades', type: 'number', required: false, min: 0, onlyInt: true },
        { name: 'propostas', type: 'number', required: false, min: 0, onlyInt: true },
        { name: 'forecast', type: 'number', required: false, min: 0, onlyInt: true },
        { name: 'fechados', type: 'number', required: false, min: 0, onlyInt: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_metas_user ON metas (user)'],
    })
    app.save(metas)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('metas'))
    } catch (_) {}
  },
)
