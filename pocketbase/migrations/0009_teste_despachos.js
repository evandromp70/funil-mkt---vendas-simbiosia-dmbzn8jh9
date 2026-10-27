// SPEC-1-001 (task 20c86bd2): observador de tentativas de despacho externo em backend TESTE.
// Migração ADITIVA. Escrita NUNCA pela API: só hooks (regras de escrita nulas = superuser/hook).
migrate(
  (app) => {
    if (!app.hasTable('teste_despachos')) {
      const collection = new Collection({
        name: 'teste_despachos',
        type: 'base',
        listRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        viewRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'correlation_id', type: 'text', required: true },
          { name: 'rota', type: 'text', required: true },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['ai', 'http', 'canal'],
            maxSelect: 1,
          },
          { name: 'tentativas', type: 'number', required: true, onlyInt: true, min: 0 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_teste_despachos_correlation ON teste_despachos (correlation_id)',
        ],
      })
      app.save(collection)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('teste_despachos'))
    } catch (_) {}
  },
)
