// SPEC-1-001 (task 20c86bd2): coleção de controle do ambiente de demonstração.
// Migração ADITIVA: cria sistema_config (registro único). Não altera coleções nem campos legados.
// Correção da v0.0.19: um único migrate() por arquivo; bool/number sem required.
migrate(
  (app) => {
    if (!app.hasTable('sistema_config')) {
      const collection = new Collection({
        name: 'sistema_config',
        type: 'base',
        listRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        viewRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: null,
        fields: [
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            values: ['teste', 'producao'],
            maxSelect: 1,
          },
          { name: 'pausa_geral', type: 'bool' },
          { name: 'envio_real_habilitado', type: 'bool' },
          {
            name: 'integracoes_externas_habilitadas',
            type: 'bool',
          },
          { name: 'fase_validada', type: 'number', onlyInt: true, min: 0 },
          { name: 'timezone', type: 'text', required: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_sistema_config_ambiente ON sistema_config (ambiente)'],
      })
      app.save(collection)

      const record = new Record(collection)
      record.set('ambiente', 'teste')
      record.set('pausa_geral', true)
      record.set('envio_real_habilitado', false)
      record.set('integracoes_externas_habilitadas', false)
      record.set('fase_validada', 0)
      record.set('timezone', 'America/Sao_Paulo')
      app.save(record)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('sistema_config'))
    } catch (_) {}
  },
)
